import { useEffect, useMemo, useRef, useState } from "react";
import { RoomClient, deviceToken, randomPasscode, saveRoom, savedRoom, serverUrl, type NetStatus } from "../domain/online";
import { DIE_MS, ENTER_MS, LADDER_MS, RETURN_MS, SNAKE_MS, STEP_MS, newGame, roll, rollDie, turnOf, type LastRoll, type SLGame } from "./engine";
import { OFF, W, WOODS, WOOD_IDS, center, paintBoard, paintToken, snakePath, type Pt, type WoodId } from "./board";
import "./snakes.css";

const ROOM_KEY = "rc-snakes-room";
const WOOD_KEY = "rc-snakes-wood";
const readWood = (): WoodId => { try { const w = window.localStorage.getItem(WOOD_KEY); return w && (WOOD_IDS as string[]).includes(w) ? (w as WoodId) : "teak"; } catch { return "teak"; } };
/* Final orientation of the die for each value (faces: front 1, right 2, top 3, bottom 4, left 5, back 6). */
const FACE_ROT: Record<number, [number, number]> = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const FACES: [string, number][] = [["front", 1], ["right", 2], ["top", 3], ["bottom", 4], ["left", 5], ["back", 6]];
const COLORS = ["#d23b45", "#2f6fd6", "#e3a21a", "#8a4fd0"];
const BOTS = ["Maya", "Alex", "Jordan"];
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const pace = reduced ? 0.3 : 1;
const wait = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms * pace));

type SeatInfo = { seat: number; name: string; connected: boolean; away: boolean } | null;
type SLView = {
  t: "state"; game: "snakes"; code: string; passcode: string; now: number; you: number; host: boolean;
  phase: "lobby" | "playing" | "gameEnd"; seats: SeatInfo[];
  order?: number[]; players?: { seat: number; sq: number }[]; turn?: number; streak?: number;
  last?: LastRoll | null; winner?: number | null; deadline?: number | null; moving?: boolean;
};
/** One shape for the table, whether the game runs here (practice) or on the room server (online). */
type Table = {
  you: number; order: number[]; names: Record<number, string>; away: Record<number, boolean>;
  pos: Record<number, number>; turn: number; streak: number; last: LastRoll | null;
  phase: "playing" | "gameEnd"; winner: number | null;
};

const fromView = (v: SLView): Table | null => v.phase === "lobby" || !v.order ? null : {
  you: v.you, order: v.order,
  names: Object.fromEntries(v.order.map(s => [s, s === v.you ? "You" : v.seats[s]?.name ?? "Player"])),
  away: Object.fromEntries(v.order.map(s => [s, !!v.seats[s]?.away])),
  pos: Object.fromEntries((v.players ?? []).map(p => [p.seat, p.sq])),
  turn: v.turn ?? 0, streak: v.streak ?? 0, last: v.last ?? null, phase: v.phase === "gameEnd" ? "gameEnd" : "playing", winner: v.winner ?? null,
};
const fromLocal = (g: SLGame, names: string[]): Table => ({
  you: 0, order: g.order, names: Object.fromEntries(g.order.map(s => [s, names[s]])), away: {},
  pos: g.pos, turn: turnOf(g), streak: g.streak, last: g.last, phase: g.phase, winner: g.winner,
});

function describe(l: LastRoll, t: Table): string {
  const who = t.names[l.seat], you = l.seat === t.you, again = l.extra ? (you ? " Roll again." : " Rolls again.") : "";
  switch (l.outcome) {
    case "need-six": return `${who} rolled ${l.value}. ${you ? "You need" : "Needs"} a 6 to start.`;
    case "enter": return `${who} rolled a 6 and entered the board.${again}`;
    case "overshoot": return `${who} rolled ${l.value}. ${you ? "You need" : "Needs"} exactly ${100 - l.from} to reach 100.${again}`;
    case "three-sixes": return `Three sixes in a row! ${who === "You" ? "Your" : who + "'s"} turn is cancelled — back to ${l.to === 0 ? "the start" : "square " + l.to}.`;
    default: {
      if (l.win) return `${who} reached 100!`;
      const base = `${who} rolled ${l.value}: ${l.from} → ${l.landed}.`;
      if (l.via === "ladder") return `${base} Ladder up to ${l.to}!${again}`;
      if (l.via === "snake") return `${base} Snake bite — down to ${l.to}.${again}`;
      return base + again;
    }
  }
}

const DiceIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>;

export default function SnakesGame({ onHome }: { onHome: () => void }) {
  type Sub = "lobby" | "room" | "table";
  const [sub, setSub] = useState<Sub>("lobby");
  const [pick, setPick] = useState<"practice" | "online" | "room">("practice");
  const [bots, setBots] = useState(1);
  const [local, setLocal] = useState<SLGame | null>(null);
  const [localNames, setLocalNames] = useState<string[]>(["You", ...BOTS]);
  const [view, setView] = useState<SLView | null>(null);
  const [net, setNet] = useState<NetStatus>("idle");
  const [roomTab, setRoomTab] = useState<"create" | "join">("create");
  const [roomName, setRoomName] = useState(""), [roomCode, setRoomCode] = useState(""), [roomPass, setRoomPass] = useState("");
  const [roomMsg, setRoomMsg] = useState("");
  const [animating, setAnimating] = useState(false);
  const [dieValue, setDieValue] = useState(6);
  const [wood, setWood] = useState<WoodId>(readWood), [showWoods, setShowWoods] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null), diceRef = useRef<HTMLDivElement | null>(null), cubeRef = useRef<HTMLDivElement | null>(null), shadowRef = useRef<HTMLDivElement | null>(null);
  const fadeTimer = useRef(0);
  const chooseWood = (w: WoodId) => { setWood(w); setShowWoods(false); try { window.localStorage.setItem(WOOD_KEY, w); } catch { /* storage off: still works for this visit */ } };
  const [msg, setMsg] = useState(""), [showRules, setShowRules] = useState(false), [, setTick] = useState(0);

  const clientRef = useRef<RoomClient | null>(null), skew = useRef(0), lastPhase = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null), layerRef = useRef<HTMLCanvasElement | null>(null);
  const disp = useRef<Record<number, Pt | null>>({}), dirty = useRef(true);
  const animatedN = useRef<number | null>(null), chain = useRef<Promise<void>>(Promise.resolve());

  const online = !!view && view.phase !== "lobby";
  const table = useMemo<Table | null>(() => (online && view ? fromView(view) : local ? fromLocal(local, localNames) : null), [online, view, local, localNames]);
  const tableRef = useRef<Table | null>(table); tableRef.current = table;

  /* ---------- room connection (same server as Spades; its own saved room on this device) ---------- */
  const send = (o: object) => clientRef.current?.send(o);
  const openRoom = (first: object) => {
    const url = serverUrl();
    if (!url) { setRoomMsg("The room server address is not set up yet, so rooms are not available."); return; }
    clientRef.current?.close();
    clientRef.current = new RoomClient(url, first, m => {
      if (m.t === "state") {
        const v = m as unknown as SLView;
        if (v.game !== "snakes") return;
        skew.current = v.now - Date.now(); saveRoom(v.code, ROOM_KEY); setRoomMsg(""); setView(v);
        const was = lastPhase.current; lastPhase.current = v.phase;
        if (v.phase !== "lobby" && (was === null || was === "lobby")) { setLocal(null); setSub("table"); }
        else if (v.phase === "lobby" && was === null) setSub("room");
        else if (v.phase === "lobby" && was !== "lobby") setSub("room");
      } else if (m.t === "err") setRoomMsg(String(m.msg ?? "Something went wrong."));
      else if (m.t === "none" || m.t === "left") {
        saveRoom(null, ROOM_KEY); lastPhase.current = null; setView(null); clientRef.current?.close(); clientRef.current = null;
        if (m.t === "left") setSub("room");
      }
    }, setNet, { roomKey: ROOM_KEY, game: "snakes" });
  };
  useEffect(() => {
    const code = savedRoom(ROOM_KEY);
    if (code && serverUrl()) openRoom({ t: "hello", game: "snakes", code, token: deviceToken() });
    return () => clientRef.current?.close();
  }, []);
  useEffect(() => { if (!view) return; const id = window.setInterval(() => setTick(t => t + 1), 500); return () => window.clearInterval(id); }, [!!view]);
  const leaveRoom = () => {
    send({ t: "leave" });
    window.setTimeout(() => { saveRoom(null, ROOM_KEY); lastPhase.current = null; setView(null); clientRef.current?.close(); clientRef.current = null; setSub("room"); }, 300);
  };
  const roomSubmit = () => {
    if (!roomName.trim()) { setRoomMsg("Enter your name first."); return; }
    if (roomTab === "join" && (roomCode.length !== 4 || roomPass.length !== 4)) { setRoomMsg("Enter the 4-letter room code and the 4-digit passcode."); return; }
    setRoomMsg("");
    if (roomTab === "create") openRoom({ t: "create", game: "snakes", token: deviceToken(), name: roomName.trim(), passcode: randomPasscode() });
    else openRoom({ t: "join", game: "snakes", token: deviceToken(), name: roomName.trim(), code: roomCode, passcode: roomPass });
  };

  /* ---------- practice ---------- */
  const startPractice = () => {
    const names = ["You", ...BOTS.slice(0, bots)];
    setLocalNames(names); animatedN.current = null; disp.current = {};
    setLocal(newGame(names.map((_, i) => i))); setMsg("You go first. Roll a 6 to enter the board.");
    setSub("table");
  };
  useEffect(() => {
    if (online || !local || local.phase !== "playing" || animating || turnOf(local) === 0) return;
    if (local.last && local.last.n !== animatedN.current) return;            // wait for the last move to be shown
    const id = window.setTimeout(() => setLocal(g => (g && turnOf(g) !== 0 ? roll(g, turnOf(g), rollDie()) : g)), 750 * pace);
    return () => window.clearTimeout(id);
  }, [online, local, animating]);

  /* ---------- board drawing ---------- */
  const restPoint = (t: Table, seat: number): Pt | null => {
    const sq = t.pos[seat];
    if (!sq) return null;
    const same = t.order.filter(s => t.pos[s] === sq);
    const c = center(sq);
    if (same.length === 1) return c;
    const k = same.indexOf(seat), o = 11, spots = [[-o, -o], [o, -o], [-o, o], [o, o]];
    return { x: c.x + spots[k][0], y: c.y + spots[k][1] + 3 };
  };
  const settle = () => { const t = tableRef.current; if (!t) return; for (const s of t.order) disp.current[s] = restPoint(t, s); dirty.current = true; };

  useEffect(() => {
    if (sub !== "table") return;
    const canvas = canvasRef.current; if (!canvas) return;
    const layer = document.createElement("canvas"); layerRef.current = layer;
    const paint = () => { const dpr = Math.min(3, window.devicePixelRatio || 1); paintBoard(layer, Math.min(dpr, 2.5), wood); canvas.width = canvas.height = Math.round(W * dpr); dirty.current = true; };
    paint();
    document.fonts?.ready.then(paint).catch(() => undefined);
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!dirty.current) return;
      dirty.current = false;
      const g = canvas.getContext("2d")!, t = tableRef.current, dpr = canvas.width / W;
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(layer, 0, 0, canvas.width, canvas.height); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!t) return;
      const turn = t.phase === "playing" ? t.turn : -1;
      for (const s of [...t.order.filter(x => x !== turn), ...(turn >= 0 ? [turn] : [])]) {
        const p = disp.current[s];
        if (p) paintToken(g, p, COLORS[s], s === t.you ? "Y" : (t.names[s][0] || "?").toUpperCase(), s === turn);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sub, !!table, wood]);

  const follow = (seat: number, pts: Pt[], ms: number, hop = 0) => new Promise<void>(res => {
    const seg = [0];
    for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = seg[seg.length - 1] || 1, dur = ms * pace, t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, d = e * total;
      let i = 1; while (i < seg.length - 1 && seg[i] < d) i++;
      const k = (d - seg[i - 1]) / ((seg[i] - seg[i - 1]) || 1);
      disp.current[seat] = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k - Math.sin(t * Math.PI) * hop };
      dirty.current = true;
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });

  /* Throws a 3D die across the board: it tumbles, bounces and settles showing `value`. */
  const throwDie = (value: number) => new Promise<void>((resolve) => {
    const wrap = wrapRef.current, el = diceRef.current, cube = cubeRef.current, sh = shadowRef.current;
    if (!wrap || !el || !cube || !sh) { resolve(); return; }
    window.clearTimeout(fadeTimer.current);
    const B = wrap.clientWidth, size = Math.round(B * .115);
    wrap.style.setProperty("--ds", size + "px");
    const from = { x: B * (.5 + (Math.random() - .5) * .5), y: B * 1.05 }, to = { x: B * (.22 + Math.random() * .56), y: B * (.28 + Math.random() * .44) };
    const [bx, by] = FACE_ROT[value] ?? [0, 0], fx = bx - 16, fy = by + 10, fz = (Math.random() - .5) * 50;
    const dir = () => (Math.random() < .5 ? -1 : 1);
    const sx = fx + 360 * (2 + Math.floor(Math.random() * 2)) * dir(), sy = fy + 360 * (1 + Math.floor(Math.random() * 2)) * dir(), sz = fz + (200 + Math.random() * 160) * dir();
    const dur = reduced ? 250 : DIE_MS, t0 = performance.now();
    el.classList.add("show"); sh.classList.add("show");
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3), rot = 1 - Math.pow(1 - t, 2.2);
      const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e;
      const h = reduced ? 0 : B * .2 * Math.pow(1 - t, 1.7) * Math.abs(Math.cos(t * Math.PI * 2.5));
      el.style.transform = `translate(${x - size / 2}px, ${y - size / 2 - h}px) scale(${1 + h / B * 1.1})`;
      cube.style.transform = `rotateZ(${sz + (fz - sz) * rot}deg) rotateX(${sx + (fx - sx) * rot}deg) rotateY(${sy + (fy - sy) * rot}deg)`;
      sh.style.transform = `translate(${x - size / 2 + h * .25}px, ${y - size / 2 + size * .18 + h * .1}px) scale(${1.15 - h / B * 1.5})`;
      sh.style.opacity = String(Math.max(.15, .7 - h / B * 2.2));
      if (t < 1) requestAnimationFrame(step);
      else { try { navigator.vibrate?.(18); } catch { /* not supported */ } resolve(); }
    };
    requestAnimationFrame(step);
  });
  const restDie = () => { window.clearTimeout(fadeTimer.current); fadeTimer.current = window.setTimeout(() => { diceRef.current?.classList.remove("show"); shadowRef.current?.classList.remove("show"); }, 1400); };

  const play = async (l: LastRoll) => {
    await throwDie(l.value);
    setDieValue(l.value);
    await wait(120);
    const seat = l.seat, here = () => disp.current[seat] ?? OFF;
    if (l.outcome === "enter") await follow(seat, [OFF, center(1)], ENTER_MS, 12);
    if (l.outcome === "move") for (let n = l.from + 1; n <= l.landed; n++) await follow(seat, [here(), center(n)], STEP_MS, 9);
    if (l.via === "ladder") { await wait(120); await follow(seat, [here(), center(l.to)], LADDER_MS - 120); }
    if (l.via === "snake") { await wait(120); await follow(seat, [here(), ...snakePath(l.landed, l.to)], SNAKE_MS - 120); }
    if (l.outcome === "three-sixes") { await wait(150); await follow(seat, [here(), l.to === 0 ? OFF : center(l.to)], RETURN_MS - 150); }
  };

  /* Each new roll (from this device's practice game or from the server) is animated once, in order. */
  useEffect(() => {
    if (!table || sub !== "table") return;
    const l = table.last;
    if (animatedN.current === null || !l || l.n < animatedN.current) {          // fresh table, resumed game, or new game
      animatedN.current = l?.n ?? 0; settle();
      if (!l) setMsg(online ? `${table.names[table.turn]}${table.turn === table.you ? " go" : " goes"} first. Roll a 6 to enter the board.` : "You go first. Roll a 6 to enter the board.");
      else setMsg(describe(l, table));
      return;
    }
    if (l.n === animatedN.current) { if (!animating) settle(); return; }
    animatedN.current = l.n;
    setAnimating(true); setMsg(`${table.names[l.seat]} ${l.seat === table.you ? "roll" : "rolls"}…`);
    chain.current = chain.current.then(() => play(l)).catch(() => undefined).then(() => {
      settle(); setAnimating(false); restDie();
      const t = tableRef.current; if (t) setMsg(describe(l, t));
    });
  }, [table, sub]);

  /* ---------- actions ---------- */
  const myTurn = !!table && table.phase === "playing" && table.turn === table.you && !animating && !(online && view?.moving);
  const doRoll = () => {
    if (!myTurn) return;
    if (online) send({ t: "roll" }); else setLocal(g => (g ? roll(g, 0, rollDie()) : g));
  };
  useEffect(() => {
    if (sub !== "table") return;
    const k = (e: KeyboardEvent) => { if ((e.code === "Space" || e.key === "Enter") && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); doRoll(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  const secsLeft = online && view?.deadline != null && table?.turn === table?.you ? Math.max(0, Math.ceil((view.deadline - (Date.now() + skew.current)) / 1000)) : null;
  const showWin = !!table && table.phase === "gameEnd" && !animating;

  /* ---------- screens ---------- */
  if (sub === "lobby") return <section className="mode-page sl-mode">
    <button className="back-link" onClick={onHome}>← Back</button>
    <div className="eyebrow">ROYAL CLUB · SNAKES &amp; LADDERS</div>
    <h1>Choose how you want to play</h1>
    <div className="mode-grid">
      <button className={pick === "practice" ? "mode-card selected" : "mode-card"} onClick={() => setPick("practice")}><span className="mode-ico">⚄</span><strong>Practice</strong><p>Play against computer players.</p></button>
      <button className={pick === "online" ? "mode-card selected" : "mode-card"} onClick={() => setPick("online")}><span className="mode-tag">SOON</span><span className="mode-ico">◈</span><strong>Online</strong><p>Quick match with other players.</p></button>
      <button className={pick === "room" ? "mode-card selected" : "mode-card"} onClick={() => setPick("room")}><span className="mode-ico">♛</span><strong>Room</strong><p>Play with 1 to 3 friends using a code.</p></button>
    </div>
    {pick === "practice" && <div className="sl-bots"><span>Computer players</span>{[1, 2, 3].map(n => <button key={n} className={bots === n ? "on" : ""} aria-pressed={bots === n} onClick={() => setBots(n)}>{n}</button>)}</div>}
    <button className="gold-button" disabled={pick === "online"} onClick={() => (pick === "practice" ? startPractice() : pick === "room" ? setSub("room") : undefined)}>
      {pick === "practice" ? "Start practice →" : pick === "room" ? "Create or join a room →" : "Coming soon"}
    </button>
    <p className="room-note">Rules: roll a 6 to enter · a 6 rolls again · three 6s in a row cancel the turn · land exactly on 100 to win.</p>
  </section>;

  if (sub === "room") return <section className="mode-page room-page sl-mode">
    <button className="back-link" onClick={() => { setSub("lobby"); setRoomMsg(""); }}>← Back</button>
    <div className="eyebrow">ROYAL CLUB · SNAKES &amp; LADDERS</div>
    <h1>{!view ? "Play with friends" : view.phase === "lobby" ? "Waiting room" : "Game in progress"}</h1>
    {!view ? <>
      <div className="room-tabs">
        <button className={roomTab === "create" ? "on" : ""} onClick={() => { setRoomTab("create"); setRoomMsg(""); }}>Create a room</button>
        <button className={roomTab === "join" ? "on" : ""} onClick={() => { setRoomTab("join"); setRoomMsg(""); }}>Join a room</button>
      </div>
      <div className="room-form">
        <label>Your name<input id="sl-name" value={roomName} maxLength={16} onChange={e => setRoomName(e.target.value)} placeholder="Enter your name" /></label>
        {roomTab === "join" && <div className="room-row">
          <label>Room code<input id="sl-code" value={roomCode} maxLength={4} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="K7QM" /></label>
          <label>Passcode<input id="sl-pass" value={roomPass} maxLength={4} inputMode="numeric" onChange={e => setRoomPass(e.target.value.replace(/\D/g, ""))} placeholder="4821" /></label>
        </div>}
        <button className="gold-button" disabled={net === "connecting"} onClick={roomSubmit}>{net === "connecting" ? "Connecting…" : roomTab === "create" ? "Create room →" : "Join room →"}</button>
      </div>
      {roomMsg && <p className="room-msg">{roomMsg}</p>}
      <p className="room-note">2 to 4 real players per room. The host can start once at least two have joined.</p>
    </> : <div className="room-wait">
      <div className="room-share">
        <div><small>ROOM CODE</small><b>{view.code}</b></div>
        <div><small>PASSCODE</small><b>{view.passcode}</b></div>
        <button className="ghost-button" onClick={() => {
          const t = `Join my Royal Club Snakes & Ladders room — code ${view.code}, passcode ${view.passcode} — at ${window.location.origin}`;
          try { navigator.clipboard.writeText(t).then(() => setRoomMsg("Invite copied."), () => setRoomMsg(t)); } catch { setRoomMsg(t); }
        }}>Copy invite</button>
      </div>
      <ul className="room-seats">{view.seats.map((p, i) => <li key={i} className={p ? "filled" : ""}><span style={p ? { background: COLORS[i], borderColor: COLORS[i], color: "#fff" } : undefined}>{i + 1}</span>{p ? p.name + (i === view.you ? " (you)" : "") + (!p.connected ? " · offline" : "") : "Open seat"}</li>)}</ul>
      {view.phase === "lobby" ? (() => {
        const seated = view.seats.filter(Boolean) as NonNullable<SeatInfo>[], ready = seated.length >= 2 && seated.every(p => p.connected);
        return <button className="gold-button" disabled={!view.host || !ready} onClick={() => send({ t: "start" })}>
          {!view.host ? "Waiting for the host to start" : ready ? `Start game with ${seated.length} players →` : seated.length < 2 ? "Waiting for at least 1 more player" : "Waiting for everyone to come online"}
        </button>;
      })() : <button className="gold-button" onClick={() => setSub("table")}>Return to the board →</button>}
      {roomMsg && <p className="room-msg">{roomMsg}</p>}
      <button className="text-button" onClick={leaveRoom}>Leave room</button>
      <p className="room-note">{view.phase === "lobby" ? "Up to four players. Empty seats stay empty — no computer players." : "If you leave, the game rolls for you. You can rejoin from this device with the same code and passcode."}</p>
    </div>}
  </section>;

  /* table */
  if (!table) return <section className="mode-page sl-mode"><button className="back-link" onClick={() => setSub("lobby")}>← Back</button><p className="room-note">Loading the board…</p></section>;
  const winnerName = table.winner != null ? table.names[table.winner] : "";
  const turnName = table.names[table.turn];
  return <section className="sl-screen">
    <div className="sl-top">
      <button className="sl-icon-btn" onClick={() => setSub(online ? "room" : "lobby")} aria-label={online ? "Back to the room" : "Back to the lobby"}>←</button>
      <strong>Snakes &amp; Ladders<span>{online && view ? `Room ${view.code}` : "Practice"}</span></strong>
      <button className="sl-chip" onClick={() => { setShowWoods(v => !v); setShowRules(false); }} aria-expanded={showWoods}><i className={`sl-swatch w-${wood}`} />{WOODS[wood].name}</button>
      <button className="sl-chip" onClick={() => { setShowRules(v => !v); setShowWoods(false); }} aria-expanded={showRules}>Rules</button>
    </div>
    <ul className="sl-players">
      {table.order.map(s => <li key={s} className={table.phase === "playing" && table.turn === s ? "turn" : ""}>
        <span className="sl-dot" style={{ background: COLORS[s] }} />
        <span className="sl-name">{table.names[s]}{table.away[s] && <em> · away</em>}</span>
        <span className="sl-sq">{table.pos[s] ? table.pos[s] : "Start"}</span>
      </li>)}
    </ul>
    <div className="sl-board-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="sl-board" aria-label={`Snakes and ladders board. ${table.order.map(s => `${table.names[s]} on ${table.pos[s] || "start"}`).join(", ")}.`} />
      <div className="sl-dice-shadow" ref={shadowRef} />
      <div className="sl-dice" ref={diceRef} aria-hidden="true">
        <div className="sl-cube" ref={cubeRef}>
          {FACES.map(([f, v]) => <div key={f} className={`sl-face ${f}`}>{Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[v].includes(i) ? "on" : ""} />)}</div>)}
        </div>
      </div>
      {showWoods && <div className="sl-woods" role="dialog" aria-label="Board wood">
        <b>Board wood</b>
        <div>{WOOD_IDS.map(w => <button key={w} className={w === wood ? "on" : ""} aria-pressed={w === wood} onClick={() => chooseWood(w)}><i className={`sl-swatch w-${w}`} />{WOODS[w].name}</button>)}</div>
      </div>}
      {showWin && <div className="sl-win">
        <span className="eyebrow">MOKSHA</span>
        <h2>{table.winner === table.you ? "You win!" : `${winnerName} wins`}</h2>
        <p>{table.winner === table.you ? "You reached square 100." : `${winnerName} reached square 100.`}</p>
        <div className="sl-win-actions">
          {online ? (view?.host ? <button className="gold-button" onClick={() => send({ t: "again" })}>Play again</button> : <p className="sl-small">Waiting for the host to start a new game.</p>)
            : <button className="gold-button" onClick={startPractice}>Play again</button>}
          <button className="ghost-button" onClick={() => (online ? leaveRoom() : setSub("lobby"))}>{online ? "Leave room" : "Back to lobby"}</button>
        </div>
      </div>}
      {showRules && <div className="sl-rules" role="dialog" aria-label="Rules">
        <b>House rules</b>
        <ul><li>Roll a <b>6</b> to enter the board on square 1.</li><li>A <b>6</b> gives you another roll.</li><li><b>Three 6s in a row</b> cancel that whole turn — your token goes back to where the turn began.</li><li>Ladders lift you up; snakes bring you down.</li><li>Land <b>exactly</b> on 100 to win. A roll that goes past 100 doesn't move.</li>{online && <li>You have 15 seconds to roll, then the game rolls for you.</li>}</ul>
        <button className="ghost-button" onClick={() => setShowRules(false)}>Close</button>
      </div>}
    </div>
    <div className="sl-dock">
      <div className="sl-dock-row">
        <button className="sl-roll" disabled={!myTurn} onClick={doRoll} aria-label={myTurn ? "Roll dice" : undefined}>
          <DiceIcon />{table.phase === "gameEnd" ? "Game over" : myTurn ? (table.streak > 0 ? "Roll again" : "Roll dice") : animating ? "Rolling…" : `${turnName}'s turn`}
        </button>
        {secsLeft !== null && myTurn && <span className={`timer-chip ${secsLeft <= 5 ? "urgent" : ""}`}>⏱ {secsLeft}s</span>}
      </div>
      <p className="sl-msg" aria-live="polite">{msg}{table.streak > 0 && table.phase === "playing" && !animating ? ` · Sixes this turn: ${table.streak} of 3` : ""}</p>
      <span className="sl-sr" aria-live="polite">{animating ? "" : `Die shows ${dieValue}`}</span>
    </div>
  </section>;
}
