// DEV ONLY: mints LiveKit tokens for the M0 spike against a local `livekit-server --dev`.
// The real /voice/:channel_id/join route (permission checks, rate limits) replaces this in M1.
import { createServer } from 'node:http';
import { AccessToken } from 'livekit-server-sdk';

const API_KEY = process.env.LIVEKIT_API_KEY ?? 'devkey';
const API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'secret';
const PORT = Number(process.env.PORT ?? 7890) // 7880–7882 belong to livekit-server;

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (url.pathname !== '/token') {
    res.writeHead(404).end();
    return;
  }
  const identity = (url.searchParams.get('identity') ?? '').replace(/[^\w.-]/g, '').slice(0, 32) || `user-${Date.now()}`;
  const room = (url.searchParams.get('room') ?? 'spike').replace(/[^\w.-]/g, '').slice(0, 64);
  const at = new AccessToken(API_KEY, API_SECRET, { identity, ttl: '1h' });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ token: await at.toJwt(), url: 'ws://127.0.0.1:7880' }));
}).listen(PORT, '127.0.0.1', () => console.log(`dev token server on http://127.0.0.1:${PORT}/token`));
