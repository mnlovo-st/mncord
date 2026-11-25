// A tiny stand-in for the Cloudflare Realtime API so tests never touch the real service.
import { createServer } from 'node:http';

export interface CfCall { method: string; path: string; body: unknown; auth: string | undefined }
const calls: CfCall[] = [];
(globalThis as { __cfCalls?: CfCall[] }).__cfCalls = calls;

let sessions = 0;
let mids = 0;
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : undefined;
    const path = req.url ?? '';
    calls.push({ method: req.method ?? '', path, body, auth: req.headers.authorization });
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== 'Bearer test-secret') return res.writeHead(401).end(JSON.stringify({ errorCode: 'unauthorized' }));
    if (path.endsWith('/sessions/new')) return res.end(JSON.stringify({ sessionId: `sess-${++sessions}` }));
    if (path.endsWith('/tracks/new')) {
      const b = body as { sessionDescription?: unknown; tracks: { location: string; trackName: string; mid?: string }[] };
      if (b.sessionDescription) return res.end(JSON.stringify({ sessionDescription: { type: 'answer', sdp: 'v=0 fake-answer' }, tracks: b.tracks.map((t) => ({ mid: t.mid, trackName: t.trackName })) }));
      return res.end(JSON.stringify({ sessionDescription: { type: 'offer', sdp: 'v=0 fake-offer' }, requiresImmediateRenegotiation: true, tracks: b.tracks.map((t) => ({ mid: String(100 + ++mids), trackName: t.trackName })) }));
    }
    if (path.endsWith('/renegotiate')) return res.end('{}');
    if (path.endsWith('/tracks/close')) {
      const b = body as { sessionDescription?: unknown };
      return res.end(JSON.stringify(b.sessionDescription ? { sessionDescription: { type: 'answer', sdp: 'v=0 fake-close' } } : {}));
    }
    res.writeHead(404).end('{}');
  });
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const addr = server.address();
process.env.CF_RTC_BASE = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
process.env.CF_REALTIME_APP_ID = 'test-app';
process.env.CF_REALTIME_APP_SECRET = 'test-secret';
