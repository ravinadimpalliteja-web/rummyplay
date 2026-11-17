'use strict';
/**
 * Royal Club room server for Node (Render).
 *   node server.js        (PORT env, default 3000; SPEED=20 shortens every timer, for tests only)
 * The rooms themselves live in hub.js, which the Cloudflare version (cloudflare/worker.js) shares.
 */
const http = require('http');
const { WebSocketServer } = require('./wslite');
const hub = require('./hub');

const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Royal Club room server is running.\n');
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  hub.connected(ws);
  ws.on('pong', () => { ws.alive = true; });       // Node sends real WebSocket pings (wslite)
  ws.on('message', (raw) => hub.message(ws, raw));
  ws.on('close', () => hub.closed(ws));
});

setInterval(hub.heartbeat, 20000).unref();
setInterval(() => hub.sweep(), 60000).unref();

if (require.main === module) server.listen(PORT, () => console.log(`Royal Club room server on port ${PORT} (${hub.CONFIG.rounds} rounds, speed x${hub.SPEED})`));
module.exports = { server, rooms: hub.rooms };
