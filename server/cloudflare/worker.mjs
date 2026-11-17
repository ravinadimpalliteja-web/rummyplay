/**
 * Royal Club room server on Cloudflare (Workers + one Durable Object).
 *
 * The rooms and every game's rules are the same files the Node server uses (../hub.js and the engines);
 * this file only connects Cloudflare's WebSockets to them.
 *
 * - Every WebSocket goes to one Durable Object ("all-rooms"), so all rooms live together in memory exactly as on
 *   the Node server, and a room code works for everyone. It is placed in Asia-Pacific, near the players.
 * - Cloudflare has no server-side WebSocket ping, so the heartbeat sends {"t":"ping"} and the games answer
 *   {"t":"pong"} (web/src/domain/online.ts, web/public/ekah/client.js). Any message counts as alive.
 * - While rooms exist, a 20-second timer runs the heartbeat and removes rooms idle for 30 minutes; it also keeps
 *   the rooms in memory. When the last room is gone the timer stops and the object can sleep (no cost).
 * - A restart or new deploy ends games in progress, like a restart of the Node server.
 */
import { DurableObject } from "cloudflare:workers";
import hub from "../hub.js";

const MAX_MESSAGE = 8192;          // same limit as the Node server (wslite.js)
const TICK_MS = 20000;
const CORS = { "Access-Control-Allow-Origin": "*" };

/** Wraps a Cloudflare WebSocket in the small socket shape hub.js expects. */
class CfSocket {
  constructor(ws) { this.ws = ws; this.open = true; }
  send(text) {
    if (!this.open) return;
    try { this.ws.send(text); } catch { this.open = false; }
  }
  ping() { this.send('{"t":"ping"}'); }
  terminate() {
    if (!this.open) return;
    this.open = false;
    try { this.ws.close(1000, "closed"); } catch { /* already closed */ }
  }
}

export class Rooms extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sockets = new Map();      // Cloudflare WebSocket -> CfSocket
    this.timer = null;
  }

  async fetch(request) {
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const s = new CfSocket(server);
    this.sockets.set(server, s);
    hub.connected(s);
    this.keepAwake();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, msg) {
    const s = this.sockets.get(ws);
    if (!s) { try { ws.close(1012, "restart"); } catch { /* gone */ } return; }   // from before a restart: the game reconnects
    const text = typeof msg === "string" ? msg : new TextDecoder().decode(msg);
    if (text.length > MAX_MESSAGE) { s.terminate(); this.drop(ws); return; }
    hub.message(s, text);
  }

  webSocketClose(ws) {
    try { ws.close(1000, "closed"); } catch { /* already closed */ }
    this.drop(ws);
  }
  webSocketError(ws) { this.drop(ws); }

  drop(ws) {
    const s = this.sockets.get(ws);
    if (!s) return;
    this.sockets.delete(ws);
    s.open = false;
    hub.closed(s);
  }

  keepAwake() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      hub.heartbeat();
      for (const [ws, s] of this.sockets) if (!s.open) this.drop(ws);
      hub.sweep();
      if (!hub.busy()) { clearInterval(this.timer); this.timer = null; }
    }, TICK_MS);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") return new Response("ok", { headers: CORS });
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
      return new Response("Royal Club room server is running.\n", { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
    }
    const id = env.ROOMS.idFromName("all-rooms");
    return env.ROOMS.get(id, { locationHint: "apac" }).fetch(request);
  },
};
