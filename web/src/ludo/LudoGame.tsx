import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { RoomClient, deviceToken, randomPasscode, saveRoom, savedRoom, serverUrl, type NetStatus } from "../domain/online";
import {
  ANIM, COLORS, LANE, SAFE, SPOTS, TRACK, YARD, bestMove, cellKey, move, newGame, pointOf, previewMove, roll, rollDie, turnOf,
  type Color, type LudoEvent, type LudoGame as Game, type Tok,
} from "./engine";
import { DICE, Face, Piece, PieceDefs, TOKEN_SETS, isUnlocked, setPips, unlockText, type DiceId, type Stats, type TokenSet } from "./pieces";
import { celebrate } from "../snakes/confetti";
import "./ludo.css";

/* Cinzel (design D headings) for the table; the rest of the site loads its own fonts. */
if (typeof document !== "undefined" && !document.getElementById("rc-cinzel")) {
  const l = document.createElement("link"); l.id = "rc-cinzel"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap"; document.head.appendChild(l);
}

const ROOM_KEY = "rc-ludo-room";
const BOTS = ["Maya", "Alex", "Jordan"];
const COLOR_NAME: Record<Color, string> = { red: "Ruby", green: "Jade", yellow: "Saffron", blue: "Sapphire" };
const PHRASES = ["Nice move! 👍", "Good luck 🍀", "Well played 👏", "Oops! 😅", "Hurry up ⏳", "So close! 😮", "Revenge is coming 😤", "Great roll! 🎲"];
const VICTIM = [3, 6], HUNTER = [0];
const TOKEN_KEY = "rc-ludo-tokens", DICE_KEY = "rc-ludo-dice";
const readKey = <T extends string>(key: string, ok: readonly string[], dflt: T): T => { try { const v = window.localStorage.getItem(key); return v && ok.includes(v) ? (v as T) : dflt; } catch { return dflt; } };
const STATS_KEY = "rc-ludo-stats";
const readStats = (): Stats => { try { const v = JSON.parse(window.localStorage.getItem(STATS_KEY) ?? "{}"); return { played: Number(v.played) || 0, wins: Number(v.wins) || 0 }; } catch { return { played: 0, wins: 0 }; } };
const keep = (key: string, v: string) => { try { window.localStorage.setItem(key, v); } catch { /* storage off: still works for this visit */ } };
const ORD = ["1st", "2nd", "3rd", "4th"];
/* Rotate the board so the viewer's yard sits bottom-left (red is top-left in board coordinates). */
const ROT: Record<Color, number> = { blue: 0, red: -90, green: 180, yellow: 90 };
const CORNERS: [number, number][] = [[18, 15], [82, 15], [82, 85], [18, 85]];
const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const pace = reduced ? 0.3 : 1;
const wait = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms * pace));
const copyTokens = (t: Record<number, Tok[]>) => JSON.parse(JSON.stringify(t)) as Record<number, Tok[]>;

type SeatInfo = { seat: number; name: string; connected: boolean; away: boolean } | null;
type LView = {
  t: "state"; game: "ludo"; code: string; passcode: string; now: number; you: number; host: boolean;
  phase: "lobby" | "playing" | "gameEnd"; seats: SeatInfo[];
  order?: number[]; colors?: Record<number, Color>; tokens?: Record<number, Tok[]>; turn?: number; stage?: "roll" | "move" | "gameEnd";
  dice?: number; sixes?: number; moves?: number[]; ranks?: number[]; last?: LudoEvent | null; deadline?: number | null; moving?: boolean;
};
type Mode = "practice" | "pass" | "online";
/** One shape for the table, whether the game runs here (Practice, Pass & play) or on the room server (Room). */
type Table = {
  mode: Mode; you: number | null; order: number[]; colors: Record<number, Color>; names: Record<number, string>; away: Record<number, boolean>;
  bots: Record<number, boolean>; tokens: Record<number, Tok[]>; turn: number; stage: "roll" | "move" | "gameEnd"; dice: number; sixes: number;
  moves: number[]; ranks: number[]; last: LudoEvent | null;
};

const fromView = (v: LView): Table | null => v.phase === "lobby" || !v.order || !v.tokens || !v.colors ? null : {
  mode: "online", you: v.you, order: v.order, colors: v.colors,
  names: Object.fromEntries(v.order.map(s => [s, s === v.you ? "You" : v.seats[s]?.name ?? "Player"])),
  away: Object.fromEntries(v.order.map(s => [s, !!v.seats[s]?.away])), bots: {},
  tokens: v.tokens, turn: v.turn ?? 0, stage: v.stage ?? "roll", dice: v.dice ?? 0, sixes: v.sixes ?? 0,
  moves: v.moves ?? [], ranks: v.ranks ?? [], last: v.last ?? null,
};
const fromLocal = (g: Game, names: string[], mode: "practice" | "pass"): Table => ({
  mode, you: mode === "practice" ? 0 : null, order: g.order, colors: g.colors,
  names: Object.fromEntries(g.order.map(s => [s, names[s]])), away: {},
  bots: Object.fromEntries(g.order.map(s => [s, mode === "practice" && s !== 0])),
  tokens: g.tokens, turn: turnOf(g), stage: g.phase, dice: g.dice, sixes: g.sixes, moves: g.moves, ranks: g.ranks, last: g.last,
});

function describe(l: LudoEvent, t: Table): string {
  const who = t.names[l.seat], you = who === "You";
  if (l.kind === "roll") {
    if (l.outcome === "three-sixes") return `Three sixes in a row! ${you ? "Your" : who + "'s"} turn ends.`;
    if (l.outcome === "none") {
      const allIn = t.tokens[l.seat].every(x => x.s === "base" || x.s === "home");
      return `${who} rolled ${l.value}. ${allIn ? (you ? "You need" : "Needs") + " a 6 to bring a token out." : "No token can move."}`;
    }
    if (l.forced != null) return `${who} rolled ${l.value}.`;
    return you || t.mode === "pass" ? `${who} rolled ${l.value}. Tap a glowing token.` : `${who} rolled ${l.value} and is choosing…`;
  }
  const cut = l.cuts.map(c => t.names[c.seat]).filter((n, i, a) => a.indexOf(n) === i);
  const again = l.bonus ? (you ? " Roll again." : " Rolls again.") : "";
  if (l.finished) { const p = t.ranks.indexOf(l.seat); return `${who} ${you ? "finish" : "finishes"} ${ORD[p] ?? ""}! All four tokens home.`; }
  if (cut.length) return `${who} cut ${cut.map(n => (n === "You" ? "you" : n)).join(" & ")}!${again}`;
  if (l.home) return `${who} brought a token home!${again}`;
  if (l.from.s === "base") return `${who} brought a token out.${again}`;
  return again ? `${who} moved ${l.value}.${again}` : "";
}

/* ---------- small sounds (Web Audio, starts after the first tap) ---------- */
let ac: AudioContext | null = null;
const audioOn = () => { try { return window.localStorage.getItem("rc-ludo-sound") !== "off"; } catch { return true; } };
function tone(f: number, dur: number, type: OscillatorType = "triangle", vol = .07, when = 0, f2?: number) {
  if (!audioOn()) return;
  try {
    ac = ac ?? new AudioContext(); if (ac.state === "suspended") void ac.resume();
    const t0 = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + dur + .02);
  } catch { /* no audio */ }
}
const sDice = () => { for (let i = 0; i < 6; i++) tone(180 + Math.random() * 260, .04, "square", .03, i * .075); };
const sStep = () => tone(620, .05, "triangle", .045);
const sCut = () => tone(520, .35, "sawtooth", .055, 0, 90);
const sHome = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, "triangle", .06, i * .08));
const sWin = () => [392, 523, 659, 784, 659, 1047].forEach((f, i) => tone(f, .26, "triangle", .07, i * .13));

function star(cx: number, cy: number, R: number, r: number) {
  return Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; return `${(cx + Math.cos(a) * d).toFixed(3)},${(cy + Math.sin(a) * d).toFixed(3)}`; }).join(" ");
}
/** The static board, drawn once: yards, the track with start and starred squares, home lanes and the centre. */
function BoardArt() {
  const startOf = (i: number) => COLORS.find(c => ({ red: 0, green: 13, yellow: 26, blue: 39 })[c] === i);
  return <svg className="ld-svg" viewBox="0 0 15 15" aria-hidden="true">
    <rect x="0" y="0" width="15" height="15" className="ld-cell" />
    {COLORS.map(c => {
      const [bx, by] = YARD[c];
      return <g key={c}>
        <rect x={bx} y={by} width="6" height="6" className={`ld-f-${c}`} />
        <rect x={bx + .7} y={by + .7} width="4.6" height="4.6" rx=".45" className="ld-yard" />
        {SPOTS.map(([sx, sy], i) => <circle key={i} cx={bx + sx} cy={by + sy} r=".6" className={`ld-spot ld-s-${c}`} />)}
      </g>;
    })}
    {TRACK.map(([x, y], i) => {
      const owner = startOf(i);
      return <g key={i}>
        <rect x={x} y={y} width="1" height="1" className={`${owner ? "ld-f-" + owner : "ld-cell"} ld-grid`} />
        {SAFE.has(i) && !owner && <polygon points={star(x + .5, y + .5, .34, .15)} className="ld-star" />}
      </g>;
    })}
    {COLORS.map(c => {
      const [ex, ey] = TRACK[(({ red: 0, green: 13, yellow: 26, blue: 39 })[c] + 50) % 52], [lx, ly] = LANE[c][0];
      const dx = lx - ex, dy = ly - ey, cx = ex + .5, cy = ey + .5, px = -dy, py = dx;
      return <g key={c}>
        {LANE[c].map(([x, y], i) => <rect key={i} x={x} y={y} width="1" height="1" className={`ld-f-${c} ld-grid`} />)}
        <polygon className={`ld-f-${c}`} points={`${cx + dx * .3},${cy + dy * .3} ${cx - dx * .18 + px * .22},${cy - dy * .18 + py * .22} ${cx - dx * .18 - px * .22},${cy - dy * .18 - py * .22}`} />
      </g>;
    })}
    <polygon points="6,6 7.5,7.5 6,9" className="ld-f-red ld-grid" />
    <polygon points="6,6 9,6 7.5,7.5" className="ld-f-green ld-grid" />
    <polygon points="9,6 9,9 7.5,7.5" className="ld-f-yellow ld-grid" />
    <polygon points="6,9 9,9 7.5,7.5" className="ld-f-blue ld-grid" />
    <circle cx="7.5" cy="7.5" r=".42" className="ld-crest" />
    <path d="M7.5 7.18 L7.68 7.5 L7.5 7.82 L7.32 7.5 Z" className="ld-crest-mark" />
  </svg>;
}

/** Previews of every token set (all four colours) and every dice finish, for the lobby and the in-game Style sheet. */
function StylePicker({ tokens, dice, stats, onTokens, onDice }: { tokens: TokenSet; dice: DiceId; stats: Stats; onTokens: (t: TokenSet) => void; onDice: (d: DiceId) => void }) {
  return <div className="ld-style">
    <b className="ld-style-title">Tokens</b>
    <div className="ld-token-grid">{TOKEN_SETS.map(s => {
      const open = isUnlocked(s.id, stats);
      return <button key={s.id} className={`${tokens === s.id ? "on" : ""}${open ? "" : " locked"}`} aria-pressed={tokens === s.id} aria-disabled={!open} onClick={() => open && onTokens(s.id)}>
        <span className="ld-token-row">{COLORS.map(c => <Piece key={c} set={s.id} color={c} />)}</span>
        <strong>{open ? s.name : `🔒 ${s.name}`}</strong><small>{open ? s.note : unlockText(s.id, stats)}</small>
      </button>;
    })}</div>
    <b className="ld-style-title">Dice</b>
    <div className="ld-dice-grid">{DICE.map(d => <button key={d.id} className={dice === d.id ? "on" : ""} aria-pressed={dice === d.id} onClick={() => onDice(d.id)}>
      <span className={`ld-mini d-${d.id}`}><span className="ld-face"><Face v={5} /></span></span><small>{d.name}</small>
    </button>)}</div>
  </div>;
}

export default function LudoGame({ onHome, joinCode }: { onHome: () => void; joinCode?: string }) {
  type Sub = "lobby" | "room" | "table";
  const [sub, setSub] = useState<Sub>(joinCode ? "room" : "lobby");
  const [pick, setPick] = useState<"practice" | "pass" | "room">(joinCode ? "room" : "practice");
  const [bots, setBots] = useState(3);
  const [passCount, setPassCount] = useState(2);
  const [passNames, setPassNames] = useState(["Player 1", "Player 2", "Player 3", "Player 4"]);
  const [local, setLocal] = useState<Game | null>(null);
  const [localMode, setLocalMode] = useState<"practice" | "pass">("practice");
  const [localNames, setLocalNames] = useState<string[]>(["You", ...BOTS]);
  const [view, setView] = useState<LView | null>(null);
  const [net, setNet] = useState<NetStatus>("idle");
  const [roomTab, setRoomTab] = useState<"create" | "join">(joinCode ? "join" : "create");
  const [roomName, setRoomName] = useState(""), [roomCode, setRoomCode] = useState(joinCode ?? ""), [roomPass, setRoomPass] = useState("");
  const [roomMsg, setRoomMsg] = useState("");
  const [disp, setDisp] = useState<Record<number, Tok[]> | null>(null);
  const [animating, setAnimating] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [hits, setHits] = useState<string[]>([]);
  const [dieValue, setDieValue] = useState(6);
  const [tokenSet, setTokenSet] = useState<TokenSet>(() => readKey(TOKEN_KEY, TOKEN_SETS.map(x => x.id), "sentry"));
  const [dice, setDice] = useState<DiceId>(() => readKey(DICE_KEY, DICE.map(x => x.id), "ivory"));
  const chooseTokens = (v: TokenSet) => { setTokenSet(v); keep(TOKEN_KEY, v); };
  const [stats, setStats] = useState<Stats>(readStats);
  const shownSet: TokenSet = isUnlocked(tokenSet, stats) ? tokenSet : "sentry";
  const [banner, setBanner] = useState<{ id: number; text: string; big: boolean } | null>(null);
  const [homeFx, setHomeFx] = useState(0);
  const [unlockedNow, setUnlockedNow] = useState<string[]>([]);
  const showBanner = (text: string, big = false) => { const id = Date.now(); setBanner({ id, text, big }); window.setTimeout(() => setBanner(b => (b && b.id === id ? null : b)), big ? 2600 : 1800); };
  const chooseDice = (v: DiceId) => { setDice(v); keep(DICE_KEY, v); };
  const diceRef = useRef<HTMLDivElement | null>(null), faceRef = useRef<HTMLDivElement | null>(null), shadowRef = useRef<HTMLDivElement | null>(null);
  const [msg, setMsg] = useState(""), [sheet, setSheet] = useState<"none" | "rules" | "style">("none"), [sound, setSound] = useState(audioOn());
  const [bubbles, setBubbles] = useState<{ id: number; seat: number; text: string }[]>([]);
  const [, setTick] = useState(0);

  const clientRef = useRef<RoomClient | null>(null), skew = useRef(0), lastPhase = useRef<string | null>(null);
  const animatedN = useRef<number | null>(null), chain = useRef<Promise<void>>(Promise.resolve()), dispRef = useRef(disp);
  dispRef.current = disp;

  const online = !!view && view.phase !== "lobby";
  const table = useMemo<Table | null>(() => (online && view ? fromView(view) : local ? fromLocal(local, localNames, localMode) : null), [online, view, local, localNames, localMode]);
  const tableRef = useRef<Table | null>(table); tableRef.current = table;

  /* ---------- reactions ---------- */
  const bubbleId = useRef(0);
  const showBubble = (seat: number, text: string) => {
    const id = ++bubbleId.current;
    setBubbles(b => [...b.slice(-3), { id, seat, text }]);
    window.setTimeout(() => setBubbles(b => b.filter(x => x.id !== id)), 2300);
  };

  /* ---------- room connection (same server as Spades and Snakes & Ladders; its own saved room on this device) ---------- */
  const send = (o: object) => clientRef.current?.send(o);
  const openRoom = (first: object) => {
    const url = serverUrl();
    if (!url) { setRoomMsg("The room server address is not set up yet, so rooms are not available."); return; }
    clientRef.current?.close();
    clientRef.current = new RoomClient(url, first, m => {
      if (m.t === "state") {
        const v = m as unknown as LView;
        if (v.game !== "ludo") return;
        skew.current = v.now - Date.now(); saveRoom(v.code, ROOM_KEY); setRoomMsg(""); setView(v);
        const was = lastPhase.current; lastPhase.current = v.phase;
        if (v.phase !== "lobby" && (was === null || was === "lobby")) { setLocal(null); animatedN.current = null; setSub("table"); }
        else if (v.phase === "lobby" && was !== "lobby") setSub("room");
      } else if (m.t === "react" && m.game === "ludo") {
        const p = PHRASES[Number(m.i)]; if (p) showBubble(Number(m.seat), p);
      } else if (m.t === "err") setRoomMsg(String(m.msg ?? "Something went wrong."));
      else if (m.t === "none" || m.t === "left") {
        saveRoom(null, ROOM_KEY); lastPhase.current = null; setView(null); clientRef.current?.close(); clientRef.current = null;
        if (m.t === "left") setSub("room");
      }
    }, setNet, { roomKey: ROOM_KEY, game: "ludo" });
  };
  useEffect(() => {
    const code = savedRoom(ROOM_KEY);
    if (code && serverUrl()) openRoom({ t: "hello", game: "ludo", code, token: deviceToken() });
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
    if (roomTab === "create") openRoom({ t: "create", game: "ludo", token: deviceToken(), name: roomName.trim(), passcode: randomPasscode() });
    else openRoom({ t: "join", game: "ludo", token: deviceToken(), name: roomName.trim(), code: roomCode, passcode: roomPass });
  };

  /* ---------- games on this device ---------- */
  const startLocal = (mode: "practice" | "pass") => {
    const names = mode === "practice" ? ["You", ...BOTS.slice(0, bots)] : passNames.slice(0, passCount).map((n, i) => n.trim() || `Player ${i + 1}`);
    setLocalMode(mode); setLocalNames(names); animatedN.current = null; setDisp(null);
    setLocal(newGame(names.map((_, i) => i), mode === "practice" ? 0 : Math.floor(Math.random() * names.length)));
    setSub("table");
  };
  useEffect(() => {
    if (online || !local || local.phase === "gameEnd" || animating) return;
    if (local.last && local.last.n !== animatedN.current) return;            // wait until the last event has been shown
    const seat = turnOf(local), bot = localMode === "practice" && seat !== 0;
    let id = 0;
    if (local.phase === "roll" && bot) id = window.setTimeout(() => setLocal(g => (g ? roll(g, turnOf(g), rollDie()) : g)), 650 * pace);
    else if (local.phase === "move") {
      const forced = local.last?.kind === "roll" ? local.last.forced : null;
      if (bot) id = window.setTimeout(() => setLocal(g => (g ? move(g, turnOf(g), bestMove(g, turnOf(g))) : g)), 450 * pace);
      else if (forced != null) id = window.setTimeout(() => setLocal(g => (g ? move(g, turnOf(g), forced) : g)), 300 * pace);
    }
    return () => window.clearTimeout(id);
  }, [online, local, animating, localMode]);

  /* ---------- animation: each new event (from this device or the server) is shown once, in order ---------- */
  const settle = () => { const t = tableRef.current; if (t) setDisp(copyTokens(t.tokens)); };
  /* The Snakes & Ladders die: tossed up off its pedestal spinning flat, the face flicking through numbers as it
     tumbles, then it bounces with a little squash and settles on the value the game rolled. */
  const throwDie = (value: number) => new Promise<void>(resolve => {
    const el = diceRef.current, face = faceRef.current, sh = shadowRef.current;
    if (!el || !face || !sh) { resolve(); return; }
    const size = el.clientWidth || 56, dir = Math.random() < .5 ? -1 : 1;
    const spins = (2 + Math.floor(Math.random() * 2)) * 360 * dir, endTilt = (Math.random() - .5) * 16;
    const jx = (Math.random() - .5) * size * .6, dur = reduced ? 250 : ANIM.die - 60, t0 = performance.now();
    let nextFlip = 0, shown = value;
    sDice();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3), rot = 1 - Math.pow(1 - t, 2.2);
      const bounce = Math.abs(Math.cos(t * Math.PI * 2.5)), h = reduced ? 0 : size * 1.5 * Math.pow(1 - t, 1.6) * bounce, x = jx * (1 - e);
      const squash = h < size * .06 && t > .2 && t < .97 ? .9 : 1;
      el.style.transform = `translate(${x}px, ${-h}px)`;
      face.style.transform = t < 1 ? `rotate(${spins * (1 - rot) + endTilt * rot}deg) scale(${1 + h / size * .12}, ${(1 + h / size * .12) * squash})` : `rotate(${endTilt}deg)`;
      if (t < .82 && now >= nextFlip) { let n = shown; while (n === shown) n = 1 + Math.floor(Math.random() * 6); shown = n; setPips(face, n); nextFlip = now + 45 + t * 140; }
      else if (t >= .82 && shown !== value) { shown = value; setPips(face, value); }
      sh.style.transform = `translateX(${x}px) scale(${Math.max(.45, 1 - h / size * .4)})`;
      sh.style.opacity = String(Math.max(.2, .6 - h / size * .3));
      if (t < 1) requestAnimationFrame(step);
      else { el.style.transform = ""; setPips(face, value); try { navigator.vibrate?.(18); } catch { /* not supported */ } resolve(); }
    };
    requestAnimationFrame(step);
  });
  const play = async (l: LudoEvent) => {
    const t = tableRef.current!;
    if (l.kind === "roll") {
      await throwDie(l.value);
      setDieValue(l.value);
      if (l.value === 6) tone(988, .12, "triangle", .05);
      setMsg(describe(l, t));
      if (l.outcome !== "choose") await wait(ANIM.pass - 60);
      return;
    }
    const base = copyTokens(dispRef.current ?? t.tokens);
    if (base[l.seat]) base[l.seat][l.token] = { ...l.from };
    setMoving(`${l.seat}-${l.token}`);
    for (const st of l.steps) { base[l.seat][l.token] = st; setDisp(copyTokens(base)); sStep(); await wait(ANIM.step); }
    setMoving(null);
    if (l.cuts.length) {
      /* the cut token reacts where it stood (sentries topple over), then goes back to its yard */
      setHits(l.cuts.map(c => `${c.seat}-${c.token}`)); sCut();
      await wait(ANIM.cut * .6);
      for (const c of l.cuts) base[c.seat][c.token] = { s: "base", r: 0, l: 0 };
      setDisp(copyTokens(base)); setHits([]);
      await wait(ANIM.cut * .4);
    }
    if (l.home) { sHome(); const id = Date.now(); setHomeFx(id); window.setTimeout(() => setHomeFx(v => (v === id ? 0 : v)), 900); await wait(ANIM.home); }
    if (l.finished) {
      const place = t.ranks.indexOf(l.seat), who = t.names[l.seat];
      sWin(); celebrate(place === 0);
      if (t.stage !== "gameEnd") showBanner(place === 0 ? (who === "You" ? "You win! 👑" : `${who} wins! 👑`) : `${who} ${who === "You" ? "finish" : "finishes"} ${ORD[place] ?? ""}`, place === 0);
    }
  };
  useEffect(() => {
    if (!table || sub !== "table") return;
    const l = table.last;
    if (animatedN.current === null || !l || l.n < animatedN.current || l.n > animatedN.current + 1) {   // fresh table, resumed game, new game
      animatedN.current = l?.n ?? 0; settle();
      if (l?.kind === "roll") setDieValue(l.value);
      setMsg(l ? describe(l, table) : `${table.names[table.turn]}${table.names[table.turn] === "You" ? " go" : " goes"} first. Roll a 6 to bring a token out.`);
      return;
    }
    if (l.n === animatedN.current) { if (!animating) settle(); return; }
    animatedN.current = l.n;
    setAnimating(true);
    chain.current = chain.current.then(() => play(l)).catch(() => undefined).then(() => {
      settle(); setAnimating(false);
      const t = tableRef.current; if (!t) return;
      const text = describe(l, t); if (text) setMsg(text);
      if (l.kind === "move" && l.cuts.length && t.mode === "practice") {
        const victim = l.cuts.find(c => t.bots[c.seat]);
        if (victim && Math.random() < .6) showBubble(victim.seat, PHRASES[VICTIM[Math.floor(Math.random() * VICTIM.length)]]);
        else if (t.bots[l.seat] && Math.random() < .4) showBubble(l.seat, PHRASES[HUNTER[0]]);
      }
    });
  }, [table, sub]);

  /* ---------- actions ---------- */
  const t = table;
  const holdsTurn = !!t && t.stage !== "gameEnd" && (t.mode === "online" ? t.turn === t.you : t.mode === "pass" ? true : t.turn === 0);
  const ready = holdsTurn && !animating && !(online && view?.moving);
  const canRoll = ready && t!.stage === "roll";
  const forced = t?.last?.kind === "roll" ? t.last.forced : null;
  const canMove = (seat: number, i: number) => ready && t!.stage === "move" && seat === t!.turn && forced == null && t!.moves.includes(i);
  const doRoll = () => { if (!canRoll) return; if (online) send({ t: "roll" }); else setLocal(g => (g ? roll(g, turnOf(g), rollDie()) : g)); };
  const doMove = (seat: number, i: number) => { if (!canMove(seat, i)) return; if (online) send({ t: "move", token: i }); else setLocal(g => (g ? move(g, turnOf(g), i) : g)); };
  const react = (i: number) => {
    if (!t) return;
    if (online) { send({ t: "react", i }); return; }
    showBubble(t.mode === "practice" ? 0 : t.turn, PHRASES[i]);
  };
  useEffect(() => {
    if (sub !== "table") return;
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((e.code === "Space" || e.key === "Enter") && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); doRoll(); }
      else if (/^[1-4]$/.test(e.key) && t) doMove(t.turn, Number(e.key) - 1);
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  const secsLeft = online && view?.deadline != null && holdsTurn ? Math.max(0, Math.ceil((view.deadline - (Date.now() + skew.current)) / 1000)) : null;
  const showEnd = !!t && t.stage === "gameEnd" && !animating;

  /* Each finished game counts once on this device: games played, and wins (1st place for you). New token sets
     that this unlocks are announced on the finish screen. Pass & play counts games but not wins. */
  const counted = useRef(false);
  useEffect(() => {
    if (!t) return;
    if (t.stage !== "gameEnd") { counted.current = false; return; }
    if (!showEnd || counted.current) return;
    counted.current = true;
    if (t.mode === "online" && t.you == null) return;
    const before = readStats();
    const won = t.mode !== "pass" && t.ranks[0] === (t.mode === "online" ? t.you : 0);
    const after = { played: before.played + 1, wins: before.wins + (won ? 1 : 0) };
    try { window.localStorage.setItem(STATS_KEY, JSON.stringify(after)); } catch { /* storage off */ }
    setStats(after);
    setUnlockedNow(TOKEN_SETS.filter(x => !isUnlocked(x.id, before) && isUnlocked(x.id, after)).map(x => x.name));
  }, [showEnd, t?.stage]);
  useEffect(() => { if (t && t.stage !== "gameEnd") setUnlockedNow([]); }, [t?.stage]);

  /* "Your turn" alert: a chime when the die becomes yours; in a room also a short buzz, and the tab title
     changes while the phone is on another app until you come back. */
  const wasMyRoll = useRef(false), baseTitle = useRef(typeof document !== "undefined" ? document.title : "");
  useEffect(() => {
    const mine = canRoll && !!t && t.mode !== "pass";
    if (mine && !wasMyRoll.current) {
      tone(784, .12, "sine", .06); tone(1175, .18, "sine", .05, .11);
      if (t!.mode === "online") {
        try { navigator.vibrate?.([30, 60, 30]); } catch { /* not supported */ }
        if (document.hidden) document.title = "● Your turn · Royal Club Ludo";
      }
    }
    wasMyRoll.current = mine;
  }, [canRoll]);
  useEffect(() => {
    const back = () => { if (!document.hidden) document.title = baseTitle.current; };
    document.addEventListener("visibilitychange", back);
    return () => { document.removeEventListener("visibilitychange", back); document.title = baseTitle.current; };
  }, []);

  /* ---------- screens ---------- */
  if (sub === "lobby") return <section className="mode-page ld-mode">
    <button className="back-link" onClick={onHome}>← Back</button>
    <div className="eyebrow">ROYAL CLUB · LUDO</div>
    <h1>Choose how you want to play</h1>
    <div className="mode-grid">
      <button className={pick === "practice" ? "mode-card selected" : "mode-card"} onClick={() => setPick("practice")}><span className="mode-ico">⚄</span><strong>Practice</strong><p>Play against computer players.</p></button>
      <button className={pick === "pass" ? "mode-card selected" : "mode-card"} onClick={() => setPick("pass")}><span className="mode-ico">◈</span><strong>Pass &amp; play</strong><p>2 to 4 friends on one phone.</p></button>
      <button className={pick === "room" ? "mode-card selected" : "mode-card"} onClick={() => setPick("room")}><span className="mode-ico">♛</span><strong>Room</strong><p>Play with 1 to 3 friends using a code.</p></button>
    </div>
    {pick === "practice" && <div className="ld-choice"><span>Computer players</span>{[1, 2, 3].map(n => <button key={n} className={bots === n ? "on" : ""} aria-pressed={bots === n} onClick={() => setBots(n)}>{n}</button>)}</div>}
    {pick === "pass" && <div className="ld-pass">
      <div className="ld-choice"><span>Players</span>{[2, 3, 4].map(n => <button key={n} className={passCount === n ? "on" : ""} aria-pressed={passCount === n} onClick={() => setPassCount(n)}>{n}</button>)}</div>
      <div className="ld-names">{passNames.slice(0, passCount).map((n, i) => {
        const c = (passCount === 2 ? ["red", "yellow"] : passCount === 3 ? ["red", "green", "yellow"] : COLORS)[i] as Color;
        return <label key={i}><span className={`ld-dot ld-bg-${c}`} />{COLOR_NAME[c]}<input id={`ld-name-${i}`} value={n} maxLength={14} onChange={e => setPassNames(v => v.map((x, j) => (j === i ? e.target.value : x)))} /></label>;
      })}</div>
    </div>}
    <button className="gold-button" onClick={() => (pick === "room" ? setSub("room") : startLocal(pick))}>
      {pick === "practice" ? "Start practice →" : pick === "pass" ? "Start pass & play →" : "Create or join a room →"}
    </button>
    <details className="ld-style-box"><summary>Token and dice style</summary><StylePicker tokens={shownSet} dice={dice} stats={stats} onTokens={chooseTokens} onDice={chooseDice} /></details>
    <p className="room-note">Rules: a 6 brings a token out · a 6, a cut or reaching home rolls again · three 6s in a row end the turn · starred and start squares are safe · exact roll to finish.</p>
  </section>;

  if (sub === "room") return <section className="mode-page room-page ld-mode">
    <button className="back-link" onClick={() => { setSub("lobby"); setRoomMsg(""); }}>← Back</button>
    <div className="eyebrow">ROYAL CLUB · LUDO</div>
    <h1>{!view ? "Play with friends" : view.phase === "lobby" ? "Waiting room" : "Game in progress"}</h1>
    {!view ? <>
      <div className="room-tabs">
        <button className={roomTab === "create" ? "on" : ""} onClick={() => { setRoomTab("create"); setRoomMsg(""); }}>Create a room</button>
        <button className={roomTab === "join" ? "on" : ""} onClick={() => { setRoomTab("join"); setRoomMsg(""); }}>Join a room</button>
      </div>
      <div className="room-form">
        <label>Your name<input id="ld-room-name" value={roomName} maxLength={16} onChange={e => setRoomName(e.target.value)} placeholder="Enter your name" /></label>
        {roomTab === "join" && <div className="room-row">
          <label>Room code<input id="ld-room-code" value={roomCode} maxLength={4} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="K7QM" /></label>
          <label>Passcode<input id="ld-room-pass" value={roomPass} maxLength={4} inputMode="numeric" onChange={e => setRoomPass(e.target.value.replace(/\D/g, ""))} placeholder="4821" /></label>
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
          const txt = `Ludo? Join my Royal Club room — code ${view.code}, passcode ${view.passcode} — at ${window.location.origin}`;
          try { navigator.clipboard.writeText(txt).then(() => setRoomMsg("Invite copied."), () => setRoomMsg(txt)); } catch { setRoomMsg(txt); }
        }}>Copy invite</button>
      </div>
      <ul className="room-seats">{view.seats.map((p, i) => <li key={i} className={p ? "filled" : ""}><span>{i + 1}</span>{p ? p.name + (i === view.you ? " (you)" : "") + (!p.connected ? " · offline" : "") : "Open seat"}</li>)}</ul>
      {view.phase === "lobby" ? (() => {
        const seated = view.seats.filter(Boolean) as NonNullable<SeatInfo>[], ok = seated.length >= 2 && seated.every(p => p.connected);
        return <button className="gold-button" disabled={!view.host || !ok} onClick={() => send({ t: "start" })}>
          {!view.host ? "Waiting for the host to start" : ok ? `Start game with ${seated.length} players →` : seated.length < 2 ? "Waiting for at least 1 more player" : "Waiting for everyone to come online"}
        </button>;
      })() : <button className="gold-button" onClick={() => setSub("table")}>Return to the board →</button>}
      {roomMsg && <p className="room-msg">{roomMsg}</p>}
      <button className="text-button" onClick={leaveRoom}>Leave room</button>
      <p className="room-note">{view.phase === "lobby" ? "Colours are given when the game starts: two players sit on opposite corners. Empty seats stay empty — no computer players." : "If you leave, the game plays for you. You can rejoin from this device with the same code and passcode."}</p>
    </div>}
  </section>;

  /* ---------- table ---------- */
  if (!t) return <section className="mode-page ld-mode"><button className="back-link" onClick={() => setSub("lobby")}>← Back</button><p className="room-note">Loading the board…</p></section>;
  const viewSeat = t.you ?? t.order[0], rot = ROT[t.colors[viewSeat]], k = ((rot / 90) % 4 + 4) % 4;
  const corner = (seat: number) => CORNERS[(COLORS.indexOf(t.colors[seat]) + k) % 4];
  const shown = disp ?? t.tokens;
  const groups: Record<string, [number, number][]> = {};
  for (const s of t.order) shown[s]?.forEach((tok, i) => { const key = cellKey(t.colors[s], tok, i); (groups[key] = groups[key] || []).push([s, i]); });
  const place: Record<string, { x: number; y: number; sc: number }> = {};
  for (const key in groups) {
    const list = groups[key], n = list.length;
    const offs = n === 1 ? [[0, 0]] : n === 2 ? [[-.2, 0], [.2, 0]] : n === 3 ? [[-.2, .13], [.2, .13], [0, -.2]] : n === 4 ? [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]]
      : list.map((_, j) => [Math.cos(j / n * 6.283) * .27, Math.sin(j / n * 6.283) * .27]);
    list.forEach(([s, i], j) => { const [x, y] = pointOf(t.colors[s], shown[s][i], i); place[`${s}-${i}`] = { x: x + offs[j][0], y: y + offs[j][1], sc: n === 1 ? 1 : n === 2 ? .74 : .6 }; });
  }
  const homeCount = (s: number) => t.tokens[s].filter(x => x.s === "home").length;
  const turnName = t.names[t.turn];
  const hint = t.stage === "gameEnd" ? "Game over"
    : canRoll ? (t.mode === "pass" ? `${turnName}: tap the dice` : t.sixes > 0 ? "Tap the dice to roll again" : "Tap the dice to roll")
    : holdsTurn && t.stage === "move" && !animating ? "Tap a glowing token" : animating ? "Moving…" : `${turnName}'s turn`;
  return <section className="ld-screen">
    <PieceDefs />
    <div className="ld-toolbar">
      <button className="back-link" onClick={() => setSub(online ? "room" : "lobby")}>{online ? "← Room" : "← Lobby"}</button>
      <strong>LUDO<span>{online && view ? `ROOM ${view.code}` : t.mode === "pass" ? "PASS & PLAY" : "PRACTICE"}</span></strong>
      <span className="ld-tools">
        <button className="ld-icon" aria-pressed={sound} aria-label={sound ? "Sound on" : "Sound off"} onClick={() => { const v = !sound; setSound(v); try { window.localStorage.setItem("rc-ludo-sound", v ? "on" : "off"); } catch { /* ignore */ } }}>{sound ? "🔊" : "🔇"}</button>
        <button className="ld-icon" onClick={() => setSheet(sheet === "style" ? "none" : "style")} aria-expanded={sheet === "style"}>Style</button>
        <button className="ld-icon" onClick={() => setSheet(sheet === "rules" ? "none" : "rules")} aria-expanded={sheet === "rules"}>Rules</button>
      </span>
    </div>
    <div className="ld-main">
      <div className="ld-stage">
        <div className="ld-board-wrap">
          <div className={`ld-board ld-set-${shownSet}`} style={{ "--rot": `${rot}deg` } as CSSProperties}>
            <BoardArt />
            <div className="ld-tokens">
              {t.order.flatMap(s => [0, 1, 2, 3].map(i => {
                const p = place[`${s}-${i}`]; if (!p) return null;
                const id = `${s}-${i}`, mv = canMove(s, i);
                return <button key={id} type="button" className={`ld-token${mv ? " movable" : ""}${moving === id ? " moving" : ""}${hits.includes(id) ? " hit" : ""}`}
                  style={{ left: `${p.x / 15 * 100}%`, top: `${p.y / 15 * 100}%`, "--s": p.sc } as CSSProperties}
                  tabIndex={mv ? 0 : -1} aria-label={`${t.names[s]} token ${i + 1}${mv ? ", can move" : ""}`} onClick={() => doMove(s, i)}>
                  <Piece set={shownSet} color={t.colors[s]} />
                  {mv && <span className="ld-badge">{i + 1}</span>}
                </button>;
              }))}
              {/* move preview: where each token you can move would land, and what happens there */}
              {t.stage === "move" && ready && forced == null && t.moves.map(i => {
                const pv = previewMove(t.order, t.colors, t.tokens, t.ranks, t.turn, i, t.dice); if (!pv) return null;
                const [x, y] = pointOf(t.colors[t.turn], pv.dest, i);
                const kind = pv.home ? "home" : pv.cut ? "cut" : pv.danger ? "danger" : pv.safe ? "safe" : "plain";
                const label = pv.home ? "Reaches home" : pv.cut ? "Cuts a token" : pv.danger ? "Can be cut here" : pv.safe ? "Safe square" : "Lands here";
                return <button key={"pv" + i} type="button" className={`ld-target ${kind}`} style={{ left: `${x / 15 * 100}%`, top: `${y / 15 * 100}%` }}
                  aria-label={`Token ${i + 1}: ${label}`} onClick={() => doMove(t.turn, i)}>
                  <span>{pv.home ? "♛" : pv.cut ? "✓" : pv.danger ? "!" : pv.safe ? "★" : i + 1}</span>
                </button>;
              })}
            </div>
            {homeFx > 0 && <div key={homeFx} className="ld-homeburst" aria-hidden="true" />}
          </div>
          <div className="ld-fx">{bubbles.map(b => { const [x, y] = corner(b.seat); return <div key={b.id} className={`ld-bubble ld-bd-${t.colors[b.seat]}`} style={{ left: `${x}%`, top: `${y}%` }}><small>{t.names[b.seat]}</small>{b.text}</div>; })}</div>
          {banner && <div key={banner.id} className={`ld-banner${banner.big ? " big" : ""}`} role="status">{banner.text}</div>}
          {showEnd && <div className="ld-win">
            <span className="eyebrow">ROYAL CLUB · LUDO</span>
            <h2>{t.ranks[0] === t.you ? "You take the crown!" : `${t.names[t.ranks[0]]} wins`}</h2>
            <ol className="ld-podium">{t.ranks.map((s, i) => <li key={s}><b>{ORD[i]}</b><span className={`ld-dot ld-bg-${t.colors[s]}`} />{t.names[s]}</li>)}</ol>
            {unlockedNow.length > 0 && <p className="ld-unlocked">🔓 New tokens unlocked: <b>{unlockedNow.join(", ")}</b>. Try them from Style.</p>}
            <div className="ld-win-actions">
              {online ? (view?.host ? <button className="gold-button" onClick={() => send({ t: "again" })}>Play again</button> : <p className="ld-small">Waiting for the host to start a new game.</p>)
                : <button className="gold-button" onClick={() => startLocal(t.mode === "pass" ? "pass" : "practice")}>Play again</button>}
              <button className="ghost-button" onClick={() => (online ? leaveRoom() : setSub("lobby"))}>{online ? "Leave room" : "Back to lobby"}</button>
            </div>
          </div>}
        </div>
      </div>
      <aside className="ld-panel" aria-label="Players and dice">
        <ul className="ld-players">
          {t.order.map(s => <li key={s} className={t.stage !== "gameEnd" && t.turn === s ? "turn" : ""}>
            <span className={`ld-dot ld-bg-${t.colors[s]}`} />
            <span className="ld-name">{t.names[s]}{t.away[s] && <em> · away</em>}{t.bots[s] && <em className="bot"> · CPU</em>}</span>
            <span className="ld-home">{t.ranks.includes(s) ? ORD[t.ranks.indexOf(s)] : `${homeCount(s)}/4`}</span>
          </li>)}
        </ul>
        <div className="ld-dock">
          {/* the die is the roll button, as in Snakes & Ladders: tap it (or press Space / Enter) to roll */}
          <button type="button" className={`ld-tray${canRoll ? " ready" : ""}`} disabled={!canRoll} onClick={doRoll} aria-label={canRoll ? "Roll the dice" : hint}>
            <div className="ld-pedestal" aria-hidden="true" />
            <div className="ld-dice-shadow" ref={shadowRef} />
            <div className={`ld-dice d-${dice}`} ref={diceRef} aria-hidden="true">
              <div className="ld-face flat" ref={faceRef}><Face v={dieValue} /></div>
            </div>
          </button>
          <div className="ld-dock-text">
            <span className={`ld-hint${canRoll ? " ready" : ""}`}>{hint}{secsLeft !== null && ready && <span className={`timer-chip ${secsLeft <= 5 ? "urgent" : ""}`}>⏱ {secsLeft}s</span>}</span>
            <p className="ld-msg" aria-live="polite">{msg}</p>
          </div>
        </div>
        <div className="ld-reacts" aria-label="Quick messages">{PHRASES.map((p, i) => <button key={i} onClick={() => react(i)}>{p}</button>)}</div>
      </aside>
    </div>
    {sheet !== "none" && <div className="ld-backdrop" onClick={() => setSheet("none")} />}
    {sheet === "rules" && <div className="ld-sheet" role="dialog" aria-label="Rules">
      <b className="ld-style-title">How to play</b>
      <ul className="ld-rules-list">
        <li>Roll a <b>6</b> to bring a token out onto your start square.</li>
        <li>Tokens go clockwise round the board, then up your coloured lane to the centre. You need the <b>exact</b> number to finish.</li>
        <li>Land on an opponent to <b>cut</b> them back to their yard. Start squares and <b>starred</b> squares are safe.</li>
        <li>A 6, a cut, or bringing a token home gives <b>another roll</b>. Three 6s in a row end your turn.</li>
        <li>Play goes on after the first finish, for 2nd and 3rd place.</li>
        {online && <li>You have 15 seconds to roll and 15 to pick a token, then the game plays for you.</li>}
      </ul>
      <button className="gold-button" onClick={() => setSheet("none")}>Close</button>
    </div>}
    {sheet === "style" && <div className="ld-sheet" role="dialog" aria-label="Token and dice style">
      <StylePicker tokens={shownSet} dice={dice} stats={stats} onTokens={chooseTokens} onDice={chooseDice} />
      <p className="ld-small">Your choice is saved on this device. In a room, everyone sees their own style.</p>
      <button className="gold-button" onClick={() => setSheet("none")}>Done</button>
    </div>}
  </section>;
}
