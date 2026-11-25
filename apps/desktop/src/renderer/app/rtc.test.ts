import { describe, expect, it } from 'vitest';
import { tuneOpus } from './rtc';

const SDP = [
  'v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63', 'a=mid:0', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1', 'a=rtpmap:63 red/48000/2',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=mid:3', 'a=rtpmap:111 opus/48000/2',
  'm=video 9 UDP/TLS/RTP/SAVPF 96', 'a=mid:1', 'a=rtpmap:96 H265/90000', 'a=fmtp:96 level-id=93',
  '',
].join('\r\n');

describe('tuneOpus', () => {
  it('merges voice parameters into the right audio section only', () => {
    const out = tuneOpus(SDP, '0', { usedtx: 1, maxaveragebitrate: 96000 });
    const lines = out.split('\r\n');
    expect(lines).toContain('a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=96000');
    // the other audio section (mid 3) and the video section are untouched
    expect(out.split('m=audio')[2]).not.toContain('usedtx');
    expect(lines).toContain('a=fmtp:96 level-id=93');
  });

  it('adds an fmtp line when the section has none', () => {
    const out = tuneOpus(SDP, '3', { stereo: 1 });
    const sec = out.split('m=audio')[2]!;
    expect(sec).toContain('a=rtpmap:111 opus/48000/2\r\na=fmtp:111 stereo=1');
  });
});
