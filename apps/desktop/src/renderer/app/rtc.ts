// One RTCPeerConnection per call, negotiated with Cloudflare Realtime SFU through our server
// (which checks permissions and holds the Cloudflare secret). Every SDP change goes through a queue
// so offers/answers never overlap on the session.
import type { MediaSource, RtcJoin, SessionDescription } from '@mncord/shared';
import { api } from './api';

type TrackCb = (userId: string, source: MediaSource, track: MediaStreamTrack) => void;
type EndCb = (userId: string, source: MediaSource) => void;

export interface PublishOpts {
  /** max bitrate for the first (or only) encoding, bps */
  maxBitrate?: number;
  maxFramerate?: number;
  /** simulcast layers for camera */
  simulcast?: boolean;
  degradation?: RTCDegradationPreference;
}

export class RtcEngine {
  readonly channelId: string;
  private pc: RTCPeerConnection;
  private queue: Promise<unknown> = Promise.resolve();
  private midTo = new Map<string, { userId: string; source: MediaSource }>();
  private remote = new Map<string, string>(); // `${userId}:${source}` → mid
  private local = new Map<MediaSource, RTCRtpTransceiver>();
  onTrack: TrackCb = () => {};
  onEnded: EndCb = () => {};
  onState: (s: RTCPeerConnectionState) => void = () => {};

  constructor(channelId: string, join: RtcJoin) {
    this.channelId = channelId;
    this.pc = new RTCPeerConnection({ iceServers: join.iceServers, bundlePolicy: 'max-bundle' });
    this.pc.ontrack = (e) => {
      const info = e.transceiver.mid ? this.midTo.get(e.transceiver.mid) : undefined;
      if (info) this.onTrack(info.userId, info.source, e.track);
    };
    this.pc.onconnectionstatechange = () => this.onState(this.pc.connectionState);
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }

  /** Cloudflare expects a fully gathered offer/answer (no trickle ICE). */
  private gathered() {
    if (this.pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', done);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', done);
      setTimeout(resolve, 3000); // enough candidates by now; don't hang the call
    });
  }
  private localDesc = (): SessionDescription => ({ type: this.pc.localDescription!.type as 'offer' | 'answer', sdp: this.pc.localDescription!.sdp });

  publish(track: MediaStreamTrack, source: MediaSource, opts: PublishOpts = {}) {
    return this.run(async () => {
      const sendEncodings: RTCRtpEncodingParameters[] | undefined = opts.simulcast
        ? [
            { rid: 'f', maxBitrate: opts.maxBitrate },
            { rid: 'h', scaleResolutionDownBy: 2, maxBitrate: opts.maxBitrate ? Math.round(opts.maxBitrate / 3) : undefined },
            { rid: 'q', scaleResolutionDownBy: 4, maxBitrate: opts.maxBitrate ? Math.round(opts.maxBitrate / 8) : undefined },
          ]
        : undefined;
      const tr = this.pc.addTransceiver(track, { direction: 'sendonly', sendEncodings });
      if (track.kind === 'video') preferVideoCodecs(tr);
      this.local.set(source, tr);
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await this.gathered();
      const res = await api<{ sessionDescription: SessionDescription }>('POST', `/voice/${this.channelId}/push`, {
        sessionDescription: this.localDesc(),
        tracks: [{ mid: tr.mid, source }],
      });
      await this.pc.setRemoteDescription(res.sessionDescription);
      // bitrate / framerate caps after negotiation
      if (!opts.simulcast && (opts.maxBitrate || opts.maxFramerate || opts.degradation)) {
        const p = tr.sender.getParameters();
        if (!p.encodings?.length) p.encodings = [{}];
        if (opts.maxBitrate) p.encodings[0]!.maxBitrate = opts.maxBitrate;
        if (opts.maxFramerate) p.encodings[0]!.maxFramerate = opts.maxFramerate;
        if (opts.degradation) (p as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = opts.degradation;
        await tr.sender.setParameters(p).catch(() => {});
      }
      return tr;
    });
  }

  unpublish(source: MediaSource) {
    return this.run(async () => {
      const tr = this.local.get(source);
      if (!tr) return;
      this.local.delete(source);
      const mid = tr.mid;
      tr.sender.track?.stop();
      tr.stop();
      if (!mid) return;
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await this.gathered();
      const res = await api<{ sessionDescription?: SessionDescription }>('POST', `/voice/${this.channelId}/close`, { mids: [mid], sessionDescription: this.localDesc(), unpublish: [source] });
      if (res.sessionDescription) await this.pc.setRemoteDescription(res.sessionDescription);
    });
  }

  /** server already closed it (server mute, permission change): just forget locally */
  dropLocal(source: MediaSource) {
    const tr = this.local.get(source);
    if (!tr) return;
    this.local.delete(source);
    tr.sender.track?.stop();
    try {
      tr.stop();
    } catch {
      /* already stopped */
    }
  }

  isPublishing = (source: MediaSource) => this.local.has(source);
  isSubscribed = (userId: string, source: MediaSource) => this.remote.has(`${userId}:${source}`);
  replaceTrack = (source: MediaSource, track: MediaStreamTrack | null) => this.local.get(source)?.sender.replaceTrack(track);

  subscribe(list: { userId: string; source: MediaSource }[]) {
    return this.run(async () => {
      const todo = list.filter((x) => !this.remote.has(`${x.userId}:${x.source}`));
      if (!todo.length) return;
      const res = await api<{ sessionDescription?: SessionDescription; requiresImmediateRenegotiation?: boolean; tracks: { userId: string; source: MediaSource; mid: string }[] }>(
        'POST', `/voice/${this.channelId}/pull`, { tracks: todo },
      );
      for (const t of res.tracks) {
        this.midTo.set(t.mid, { userId: t.userId, source: t.source });
        this.remote.set(`${t.userId}:${t.source}`, t.mid);
      }
      if (res.sessionDescription && res.requiresImmediateRenegotiation !== false) {
        await this.pc.setRemoteDescription(res.sessionDescription);
        await this.pc.setLocalDescription(await this.pc.createAnswer());
        await this.gathered();
        await api('PUT', `/voice/${this.channelId}/renegotiate`, { sessionDescription: this.localDesc() });
      }
    });
  }

  unsubscribe(userId: string, source: MediaSource, tellServer = true) {
    return this.run(async () => {
      const key = `${userId}:${source}`;
      const mid = this.remote.get(key);
      if (!mid) return;
      this.remote.delete(key);
      this.midTo.delete(mid);
      this.onEnded(userId, source);
      if (tellServer) await api('POST', `/voice/${this.channelId}/close`, { mids: [mid] }).catch(() => {});
    });
  }

  /** a publisher stopped or left: forget their tracks (the SFU already ended them) */
  forgetUser(userId: string, keep: MediaSource[] = []) {
    for (const [key, mid] of [...this.remote]) {
      const [uid, source] = key.split(':') as [string, MediaSource];
      if (uid !== userId || keep.includes(source)) continue;
      this.remote.delete(key);
      this.midTo.delete(mid);
      this.onEnded(uid, source);
    }
  }

  async close() {
    for (const tr of this.local.values()) tr.sender.track?.stop();
    this.pc.close();
    await api('DELETE', `/voice/${this.channelId}/session`).catch(() => {});
  }
}

/** HEVC first (GPU-encoded in Electron, see the M0 spike), then H.264, then whatever else the browser has. */
function preferVideoCodecs(tr: RTCRtpTransceiver) {
  const caps = RTCRtpSender.getCapabilities('video');
  if (!caps || !('setCodecPreferences' in tr)) return;
  const rank = (m: string) => (/h265|hevc/i.test(m) ? 0 : /h264/i.test(m) ? 1 : /av1/i.test(m) ? 2 : /vp9/i.test(m) ? 3 : /vp8/i.test(m) ? 4 : 9);
  const sorted = [...caps.codecs].sort((a, b) => rank(a.mimeType) - rank(b.mimeType));
  try {
    tr.setCodecPreferences(sorted);
  } catch {
    /* keep browser default */
  }
}
