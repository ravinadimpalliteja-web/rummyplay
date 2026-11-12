import { useEffect, useMemo, useRef, useState } from "react";
import { RoomClient, deviceToken, randomPasscode, saveRoom, savedRoom, serverUrl, type NetStatus } from "../domain/online";
import { BOARD_VERSION, CHAT_EMOJIS, CHAT_PHRASES, RARE_LADDERS, TIMING, newGame, roll, rollDie, rollLucky, rungsOf, snakeSlideMs, turnOf, type LastRoll, type SLGame } from "./engine";
import { MODELS, MODEL_IDS, NUM_FONT, OFF, PIECE_H, SHARED, SHARED3D, THEMES, THEME_IDS, W, center, layoutIssues, numberAt, paintBase, paintBoard, paintNumberLayer, paintPiece, S, spot, spot3D, type Look, type ModelId, type Pt, type ThemeId } from "./board";
import { fitView, planeStyle, project, squash, type View } from "./view3d";
import { SnakeArt, type SnakeOverlay } from "./snake2d";
import { setSound, sfx, soundOn, unlock } from "./sound";
import { celebrate } from "./confetti";
import TokenPicker from "./TokenPicker";
import { DEFAULT_PIECES, PIECE_IDS, pieceById, pieceImage, pieceUrl, type PieceId } from "./tokens";
import "./snakes.css";

const ROOM_KEY = "rc-snakes-room", PIECE_KEY = "rc-snakes-piece";
const MODEL_KEY = "rc-snakes-board", THEME_KEY = "rc-snakes-theme", DICE_KEY = "rc-snakes-dice", VIEW_KEY = "rc-snakes-view";
const DICE = [
  { id: "ivory", name: "Classic ivory" }, { id: "brass", name: "Polished brass" }, { id: "glass", name: "Emerald glass" },
  { id: "rosewood", name: "Carved rosewood" }, { id: "onyx", name: "Black onyx" },
] as const;
type DiceId = typeof DICE[number]["id"];
const readKey = <T extends string>(key: string, ok: readonly string[], dflt: T): T => { try { const v = window.localStorage.getItem(key); return v && ok.includes(v) ? (v as T) : dflt; } catch { return dflt; } };
const keep = (key: string, v: string) => { try { window.localStorage.setItem(key, v); } catch { /* storage off: still works for this visit */ } };
/** Shows value `v` on a die face drawn with nine pip slots (used while the 2D die tumbles, without re-rendering). */
const setPips = (face: Element | null, v: number) => { if (face) Array.from(face.children).forEach((p, i) => p.classList.toggle("on", PIPS[v].includes(i))); };
const COLORS = ["#d23b45", "#2f6fd6", "#e3a21a", "#8a4fd0"];
const BOTS = ["Maya", "Alex", "Jordan"];
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const PLACE = ["1st", "2nd", "3rd", "4th"], MEDAL = ["🥇", "🥈", "🥉", "🎖️"];
const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const pace = reduced ? 0.3 : 1;
const can3d = typeof CSS !== "undefined" && !!CSS.supports?.("transform-style", "preserve-3d");
/** Can this device draw WebGL (for the full 3D board)? Checked once, without loading the 3D code. */
let glOk: boolean | null = null;
const canWebGL = () => { if (glOk === null) { try { const c = document.createElement("canvas"); glOk = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { glOk = false; } } return glOk; };
/** Lower-power devices get a lighter 3D setup (smaller shadow map and textures, lower pixel ratio). */
const lowPower = () => { const n = navigator as Navigator & { deviceMemory?: number }; return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 3; };
type Scene3D = import("./scene3d").BoardScene;
const DEBUG = typeof location !== "undefined" && /[?&]debug\b/.test(location.search);
const wait = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms * pace));
/** How long a climb's gold sparkle and the landing ring last (ms; they fade while the game goes on). */
const SPARK_MS = 650, BURST_MS = 520;

type SeatInfo = { seat: number; name: string; connected: boolean; away: boolean; piece?: PieceId } | null;
type SLView = {
  t: "state"; game: "snakes"; board?: number; code: string; passcode: string; now: number; you: number; host: boolean;
  phase: "lobby" | "playing" | "gameEnd"; seats: SeatInfo[];
  order?: number[]; players?: { seat: number; sq: number }[]; turn?: number; streak?: number;
  last?: LastRoll | null; winner?: number | null; deadline?: number | null; moving?: boolean; finished?: number[];
};
/** One shape for the table, whether the game runs here (practice) or on the room server (online). */
type Table = {
  you: number; order: number[]; names: Record<number, string>; away: Record<number, boolean>;
  pos: Record<number, number>; turn: number; streak: number; last: LastRoll | null;
  phase: "playing" | "gameEnd"; winner: number | null; finished: number[]; pieces: Record<number, PieceId>;
};
/** A token as shown: position, scale (s), lift (h), and while climbing its lean, sway and heading (dir). */
type Disp = Pt & { s?: number; h?: number; lean?: number; sway?: number; dir?: number };

const fromView = (v: SLView): Table | null => v.phase === "lobby" || !v.order ? null : {
  you: v.you, order: v.order,
  names: Object.fromEntries(v.order.map(s => [s, s === v.you ? "You" : v.seats[s]?.name ?? "Player"])),
  away: Object.fromEntries(v.order.map(s => [s, !!v.seats[s]?.away])),
  pos: Object.fromEntries((v.players ?? []).map(p => [p.seat, p.sq])),
  turn: v.turn ?? 0, streak: v.streak ?? 0, last: v.last ?? null, phase: v.phase === "gameEnd" ? "gameEnd" : "playing", winner: v.winner ?? null,
  finished: v.finished ?? [],
  pieces: Object.fromEntries(v.order.map(s => [s, v.seats[s]?.piece ?? DEFAULT_PIECES[s]])),
};
const fromLocal = (g: SLGame, names: string[], pieces: PieceId[]): Table => ({
  you: 0, order: g.order, names: Object.fromEntries(g.order.map(s => [s, names[s]])), away: {},
  pos: g.pos, turn: turnOf(g), streak: g.streak, last: g.last, phase: g.phase, winner: g.winner, finished: g.finished,
  pieces: Object.fromEntries(g.order.map(s => [s, pieces[s] ?? DEFAULT_PIECES[s]])),
});

function describe(l: LastRoll, t: Table): string {
  const who = t.names[l.seat], you = l.seat === t.you, again = l.extra ? (you ? " Roll again." : " Rolls again.") : "";
  switch (l.outcome) {
    case "need-six": return `${who} rolled ${l.value}. ${you ? "You need" : "Needs"} a 6 to start.`;
    case "enter": return `${who} rolled a 6 and entered the board.${again}`;
    case "overshoot": return `${who} rolled ${l.value}. ${you ? "You need" : "Needs"} exactly ${100 - l.from} to reach 100.${again}`;
    case "three-sixes": return `Three sixes in a row! ${who === "You" ? "Your" : who + "'s"} turn is cancelled — back to ${l.to === 0 ? "the start" : "square " + l.to}.`;
    default: {
      if (l.win) return `${who} ${you ? "finish" : "finishes"} ${PLACE[(l.rank ?? 1) - 1]}!${l.ended ? " Game over." : " The game goes on."}`;
      const base = `${who} rolled ${l.value}: ${l.from} → ${l.landed}.`;
      if (l.via === "ladder") return `${base} ${RARE_LADDERS[l.landed] ? "The golden ladder — 1 in 1000! " : ""}Climbed up to ${l.to}!${again}`;
      if (l.via === "snake") return `${base} Swallowed by a snake — down to ${l.to}.${again}`;
      return base + again;
    }
  }
}

const ChatIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>;
const InfoIcon = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>;
const GearIcon = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8l1.6 2.4 2.8-.7.7 2.8 2.4 1.6-1.2 2.6 1.2 2.6-2.4 1.6-.7 2.8-2.8-.7L12 21.2l-1.6-2.4-2.8.7-.7-2.8-2.4-1.6L5.7 12 4.5 9.4l2.4-1.6.7-2.8 2.8.7z"/></svg>;
const Crown = () => <svg className="sl-crown" viewBox="0 0 64 34" aria-hidden="true"><defs><linearGradient id="slcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff2b8"/><stop offset=".5" stopColor="#e2b44e"/><stop offset="1" stopColor="#8f6216"/></linearGradient></defs><path d="M6 28 3 8l14 10L32 2l15 16L61 8l-3 20z" fill="url(#slcg)" stroke="#5a3a08" strokeWidth="1.4" strokeLinejoin="round"/><rect x="6" y="27" width="52" height="5" rx="2" fill="url(#slcg)" stroke="#5a3a08" strokeWidth="1.2"/><circle cx="32" cy="2.8" r="2.6" fill="#ffe9a8"/><circle cx="3" cy="8" r="2.2" fill="#ffe9a8"/><circle cx="61" cy="8" r="2.2" fill="#ffe9a8"/><circle cx="32" cy="20" r="3" fill="#d23b45"/><circle cx="19" cy="22" r="2.2" fill="#2f9e6a"/><circle cx="45" cy="22" r="2.2" fill="#2f9e6a"/></svg>;
const SoundIcon = ({ on }: { on: boolean }) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/>{on ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/> : <path d="M17 9l5 6M22 9l-5 6"/>}</svg>;
const Face = ({ v }: { v: number }) => <>{Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[v].includes(i) ? "on" : ""} />)}</>;

export default function SnakesGame({ onHome, joinCode }: { onHome: () => void; joinCode?: string }) {
  type Sub = "lobby" | "tokens" | "room" | "table";
  const [sub, setSub] = useState<Sub>(joinCode ? "room" : "lobby");
  const [pick, setPick] = useState<"practice" | "online" | "room">(joinCode ? "room" : "practice");
  const [bots, setBots] = useState(1);
  const [local, setLocal] = useState<SLGame | null>(null);
  const [localNames, setLocalNames] = useState<string[]>(["You", ...BOTS]);
  const [localPieces, setLocalPieces] = useState<PieceId[]>(() => { const mine = readKey<PieceId>(PIECE_KEY, PIECE_IDS, "pawn-gold"); return [mine, ...DEFAULT_PIECES.filter(p => p !== mine)]; });
  const [picking, setPicking] = useState(0);
  const [view, setView] = useState<SLView | null>(null);
  const [net, setNet] = useState<NetStatus>("idle");
  const [roomTab, setRoomTab] = useState<"create" | "join">(joinCode ? "join" : "create");
  const [roomName, setRoomName] = useState(""), [roomCode, setRoomCode] = useState(joinCode ?? ""), [roomPass, setRoomPass] = useState("");
  const [roomMsg, setRoomMsg] = useState("");
  const [animating, setAnimating] = useState(false);
  /** While a roll is being shown, the player who rolled stays highlighted (the game has already moved the turn on). */
  const [rolling, setRolling] = useState<number | null>(null);
  const rollingRef = useRef<number | null>(null); rollingRef.current = rolling;
  const [dieValue, setDieValue] = useState(6);
  const [model, setModel] = useState<ModelId>(() => readKey(MODEL_KEY, MODEL_IDS, "marble"));
  const [theme, setTheme] = useState<ThemeId>(() => readKey(THEME_KEY, THEME_IDS, "ivory"));
  const look = useMemo<Look>(() => ({ model, theme }), [model, theme]);
  const [dice, setDice] = useState<DiceId>(() => readKey(DICE_KEY, DICE.map(d => d.id), "ivory"));
  const [panel, setPanel] = useState<"none" | "settings" | "rules" | "chat">("none");
  const [view3d, setView3d] = useState<"3d" | "flat">(() => readKey(VIEW_KEY, ["3d", "flat"], can3d ? "3d" : "flat"));
  const [geo, setGeo] = useState<View | null>(null);
  /* full WebGL 3D board: "off" after a failure (falls back to the tilted canvas board) */
  const [glState, setGlState] = useState<"idle" | "loading" | "ready" | "off">("idle");
  const sceneRef = useRef<Scene3D | null>(null), glRef = useRef<HTMLCanvasElement | null>(null);
  const [sound, setSoundState] = useState(soundOn());
  const [bubbles, setBubbles] = useState<Record<number, { text: string; id: number }>>({});
  const [banner, setBanner] = useState<{ text: string; big: boolean } | null>(null);
  const [msg, setMsg] = useState(""), [, setTick] = useState(0);
  const [chatGap, setChatGap] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null), diceRef = useRef<HTMLDivElement | null>(null), cubeRef = useRef<HTMLDivElement | null>(null), shadowRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null), boardRef = useRef<HTMLCanvasElement | null>(null), piecesRef = useRef<HTMLCanvasElement | null>(null), fxRef = useRef<HTMLCanvasElement | null>(null);
  const geoRef = useRef<View | null>(null); geoRef.current = geo;
  /* the 3D board whenever the player chose it and the device can draw it; it is never swapped out for being slow
     (only if WebGL fails, for that visit) */
  const useGL = view3d === "3d" && glState !== "off" && canWebGL();
  const glMode = useRef(false); glMode.current = useGL;
  /** Where a token stands on square n: the 3D board and the flat/tilted board lay squares out differently. */
  const spotOf = (n: number) => (glMode.current ? spot3D(n) : spot(n));
  const bubbleId = useRef(0);
  const clientRef = useRef<RoomClient | null>(null), skew = useRef(0), lastPhase = useRef<string | null>(null);
  const disp = useRef<Record<number, Disp | null>>({}), dirty = useRef(true);
  const overlay = useRef<SnakeOverlay>({});
  /** The painted snakes on the lighter board (the WebGL board has its own). */
  const snakeArt = useRef<SnakeArt | null>(null), numRef = useRef<HTMLCanvasElement>(null);
  const animatedN = useRef<number | null>(null), chain = useRef<Promise<void>>(Promise.resolve());
  /** Short-lived effects that outlive a move: gold sparkles from a climb and the ring when a token lands. */
  const effects = useRef<{ sparks: { x: number; y: number; h: number; born: number }[]; burst: { x: number; y: number; born: number } | null }>({ sparks: [], burst: null });

  const online = !!view && view.phase !== "lobby";
  /* In a room, use this device's last chosen token if it is free. */
  const prefSent = useRef<string | null>(null);
  useEffect(() => {
    if (!view || view.phase !== "lobby") return;
    const me = view.seats[view.you], key = view.code + ":" + view.you;
    if (!me || prefSent.current === key) return;
    prefSent.current = key;
    const pref = readKey<PieceId | "">(PIECE_KEY, PIECE_IDS, "");
    if (pref && me.piece !== pref && !view.seats.some(o => o && o.seat !== view.you && o.piece === pref)) clientRef.current?.send({ t: "piece", id: pref });
  }, [view]);
  const table = useMemo<Table | null>(() => (online && view ? fromView(view) : local ? fromLocal(local, localNames, localPieces) : null), [online, view, local, localNames, localPieces]);
  const tableRef = useRef<Table | null>(table); tableRef.current = table;

  /* sound can only start after a tap */
  useEffect(() => { const u = () => unlock(); window.addEventListener("pointerdown", u); return () => window.removeEventListener("pointerdown", u); }, []);
  const toggleSound = () => { const v = !sound; setSoundState(v); setSound(v); };

  /* ---------- chat bubbles ---------- */
  const showBubble = (seat: number, text: string) => {
    const id = ++bubbleId.current;
    setBubbles(b => ({ ...b, [seat]: { text, id } }));
    window.setTimeout(() => setBubbles(b => (b[seat]?.id === id ? Object.fromEntries(Object.entries(b).filter(([k]) => +k !== seat)) : b)), 3200);
  };
  const chatText = (k: string, i: number) => (k === "e" ? CHAT_EMOJIS[i] : CHAT_PHRASES[i]) ?? "";
  const botSay = (delay: number, options: [string, number][]) => {
    const t = tableRef.current; if (!t || online) return;
    const bots = t.order.filter(s => s !== t.you); if (!bots.length) return;
    const who = bots[Math.floor(Math.random() * bots.length)], [k, i] = options[Math.floor(Math.random() * options.length)];
    window.setTimeout(() => { showBubble(who, chatText(k, i)); sfx.pop(); }, delay * pace);
  };
  const sendChat = (k: "p" | "e", i: number) => {
    if (chatGap) return;
    setPanel("none"); setChatGap(true); window.setTimeout(() => setChatGap(false), 1300);
    if (online) send({ t: "chat", k, i });
    else {
      const t = tableRef.current; if (!t) return;
      showBubble(t.you, chatText(k, i));
      if (Math.random() < .55) botSay(1100 + Math.random() * 900, [["e", 5], ["p", 7], ["p", 1], ["e", 0], ["p", 6], ["e", 6]]);
    }
  };

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
      } else if (m.t === "chat") {
        const seat = Number(m.seat), text = chatText(String(m.k), Number(m.i));
        if (text) { showBubble(seat, text); if (seat !== tableRef.current?.you) sfx.pop(); }
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
  /** Practice: choose tokens first (every player, any collection, all different), then start. */
  const choosePracticeTokens = () => {
    const names = ["You", ...BOTS.slice(0, bots)];
    setLocalNames(names); setPicking(0); setLocal(null); setSub("tokens");
  };
  const pickLocal = (seat: number, id: PieceId) => {
    setLocalPieces(ps => {
      const next = [...ps], other = next.indexOf(id);
      if (other >= 0 && other !== seat) next[other] = next[seat];          // swap, so tokens stay unique
      next[seat] = id; return next;
    });
    if (seat === 0) keep(PIECE_KEY, id);
  };
  const startPractice = () => {
    const names = localNames;
    setLocalNames(names); animatedN.current = null; disp.current = {}; overlay.current = {}; setBanner(null); setPanel("none");
    setLocal(newGame(names.map((_, i) => i))); setMsg("You go first. Roll a 6 to enter the board.");
    setSub("table");
  };
  useEffect(() => {
    if (online || !local || local.phase !== "playing" || animating || turnOf(local) === 0) return;
    if (local.last && local.last.n !== animatedN.current) return;            // wait for the last move to be shown
    const id = window.setTimeout(() => { const v = rollDie(), lucky = rollLucky(); setLocal(g => (g && turnOf(g) !== 0 ? roll(g, turnOf(g), v, lucky) : g)); }, 700 * pace);
    return () => window.clearTimeout(id);
  }, [online, local, animating]);

  /* ---------- board drawing ---------- */
  const restPoint = (t: Table, seat: number): Disp | null => {
    const sq = t.pos[seat];
    if (!sq) return null;
    const same = t.order.filter(s => t.pos[s] === sq);
    if (same.length === 1) return spotOf(sq);
    const c = center(sq), lay = (glMode.current ? SHARED3D : SHARED)[same.length], [dx, dy] = lay.pts[same.indexOf(seat)];
    return { x: c.x + dx, y: c.y + dy, s: lay.s };
  };
  const settle = () => { const t = tableRef.current; if (!t) return; for (const s of t.order) disp.current[s] = restPoint(t, s); overlay.current = {}; dirty.current = true; };

  /* The stage: measure the space, fit the tilted board into it (debounced while the window is resized or turned). */
  useEffect(() => {
    if (sub !== "table") return;
    const stage = stageRef.current; if (!stage || useGL) { setGeo(null); return; }
    let timer = 0;
    const measure = () => {
      const w = stage.clientWidth, h = stage.clientHeight; if (w < 40 || h < 40) return;
      const A = view3d === "flat" ? 0 : w > h * 1.15 ? 30 : h > w * 1.2 ? 19 : 24;     // tall space: tilt a little less so the board fills more of it
      const g = geoRef.current;
      if (g && Math.abs(g.sw - w) < 1 && Math.abs(g.sh - h) < 1 && g.A === A) return;
      setGeo(fitView(w, h, A));
    };
    measure();
    const ro = new ResizeObserver(() => { window.clearTimeout(timer); timer = window.setTimeout(measure, 90); });
    ro.observe(stage);
    return () => { ro.disconnect(); window.clearTimeout(timer); };
  }, [sub, !!table, view3d, useGL]);

  /* While the player is in the lobby or choosing tokens, fetch the 3D code and paint the board's textures in the
     background, so the 3D board is ready almost as soon as the game starts. */
  useEffect(() => {
    if ((sub !== "lobby" && sub !== "tokens") || view3d !== "3d" || !canWebGL()) return;
    let live = true;
    import("./scene3d").then(m => { if (live) m.warmBoard(look, lowPower()); }).catch(() => undefined);
    return () => { live = false; };
  }, [sub, view3d, look]);
  /* The WebGL 3D board: load the 3D code only when the board opens, then size it to the stage. */
  useEffect(() => {
    if (sub !== "table" || !table || !useGL) return;
    const stage = stageRef.current, canvas = glRef.current; if (!stage || !canvas) return;
    let live = true, ro: ResizeObserver | null = null, timer = 0;
    setGlState("loading");
    const lost = (e: Event) => { e.preventDefault(); setGlState("off"); };
    canvas.addEventListener("webglcontextlost", lost);
    import("./scene3d").then(m => {
      if (!live) return;
      const sc = new m.BoardScene(canvas, look, lowPower(), { testLite: DEBUG && /[?&]gllite\b/.test(location.search) });
      sceneRef.current = sc;
      const fit = () => { const w = stage.clientWidth, h = stage.clientHeight; if (w > 40 && h > 40) { sc.resize(w, h, window.devicePixelRatio || 1); dirty.current = true; } };
      fit(); setGlState("ready");
      ro = new ResizeObserver(() => { window.clearTimeout(timer); timer = window.setTimeout(fit, 80); }); ro.observe(stage);
    }).catch(() => { if (live) setGlState("off"); });
    return () => { live = false; ro?.disconnect(); window.clearTimeout(timer); canvas.removeEventListener("webglcontextlost", lost); sceneRef.current?.dispose(); sceneRef.current = null; };
  }, [sub, !!table, useGL]);
  useEffect(() => { sceneRef.current?.setLook(look); dirty.current = true; }, [look]);
  useEffect(() => { if (!animating) settle(); }, [useGL]);

  /* Paint the board picture, the base (shadow, edges, leaves) and size the token and effect layers whenever the fit or the wood changes. */
  useEffect(() => {
    if (!geo || sub !== "table") return;
    const board = boardRef.current, base = baseRef.current, pieces = piecesRef.current, fx = fxRef.current;
    if (!board || !base || !pieces || !fx) return;
    const paint = () => {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1), pd = Math.min(2, dpr);
      const t0 = performance.now();
      const bdpr = Math.min(2400, Math.round(geo.B * dpr * (geo.A ? 1.3 : 1))) / W;
      paintBoard(board, bdpr, look, { numbers: false });
      if (numRef.current) paintNumberLayer(numRef.current, bdpr, look);
      if (DEBUG) (window as unknown as { __slPaints?: number[] }).__slPaints = [...((window as unknown as { __slPaints?: number[] }).__slPaints ?? []), Math.round(performance.now() - t0)];
      for (const c of [base, pieces]) { c.width = Math.round(geo.sw * pd); c.height = Math.round(geo.sh * pd); }
      const bg = base.getContext("2d")!; bg.setTransform(pd, 0, 0, pd, 0, 0);
      paintBase(bg, (x, y, z) => project(geo, x, y, z), look);
      fx.width = fx.height = Math.round(Math.min(lowPower() ? 900 : 1600, geo.B * pd));
      dirty.current = true;
    };
    paint();
    let live = true;
    // repaint once the number font has arrived (only if it was still loading)
    if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(() => { if (live) paint(); }).catch(() => undefined);
    return () => { live = false; };
  }, [geo, look, sub]);

  /* Each frame (only when something moved): tokens upright at their projected spots, back to front; snake effects on their own layer. */
  /** The sparkles and landing ring still showing (ages 0..1); keeps the board redrawing while any are alive. */
  const frozenFx = useRef<ReturnType<typeof liveEffects> | null>(null);
  const liveEffects = (): { sparks: { x: number; y: number; h: number; age: number }[]; burst?: { x: number; y: number; k: number } } => {
    if (frozenFx.current) return frozenFx.current;
    const now = performance.now(), e = effects.current;
    e.sparks = e.sparks.filter(k => now - k.born < SPARK_MS);
    if (e.burst && now - e.burst.born > BURST_MS) e.burst = null;
    if (e.sparks.length || e.burst) dirty.current = true;
    return {
      sparks: e.sparks.slice(-48).map(k => ({ x: k.x, y: k.y, h: k.h, age: (now - k.born) / SPARK_MS })),
      burst: e.burst ? { x: e.burst.x, y: e.burst.y, k: (now - e.burst.born) / BURST_MS } : undefined,
    };
  };
  const boxes = useRef<{ seat: number; x0: number; y0: number; x1: number; y1: number }[]>([]);
  const glGaps = useRef<number[]>([]);
  useEffect(() => {
    if (sub !== "table") return;
    let raf = 0, lastSnakes = 0, snakesBusy = true, paintMs = 6, lastRaf = 0, frameEma = 16, backoff = 0, drewLast = false;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    // the snakes slither at about 30 fps (20 on slower phones); if painting them is slow on this device, less often, so
    // they never take more than about a quarter of the time and the rest of the page stays smooth
    // and if the page's own frame rate sags while they slither (the cost of turning the layer into pixels, which the
    // paint timer cannot see), back off further until it recovers
    const baseGap = lowPower() ? 66 : 33, snakeGap = () => Math.max(baseGap, paintMs * 4, backoff);
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const sc = sceneRef.current, now = performance.now();
      const tick = lastRaf ? now - lastRaf : 16;
      if (lastRaf) frameEma = frameEma * .9 + Math.min(250, tick) * .1;
      lastRaf = now;
      // the 3D board's slow-device watchdog: it measures how long the frame after a draw took to come (the real cost of
      // drawing), not the time between draws, which the snakes' own redraw throttle sets on purpose
      const sc0 = sceneRef.current;
      if (sc0 && drewLast && tick < 1500 && !document.hidden && !(DEBUG && /[?&]keep3d\b/.test(location.search))) {
        glGaps.current.push(tick);
        if (glGaps.current.length >= 24) {
          const med = [...glGaps.current].sort((a, b) => a - b)[12]; glGaps.current = [];
          if (DEBUG) { const w = window as unknown as { __slGlMeds?: number[] }; w.__slGlMeds = [...(w.__slGlMeds ?? []), Math.round(med)]; }
          // a slow device loses its shadows; the 3D board (and its 3D tokens) is never swapped for the flat one
          if (med > 42) sc0.degrade();
        }
      }
      drewLast = false;
      if (frameEma > 26) backoff = Math.min(300, Math.max(baseGap, backoff) * 1.04 + 1); else if (frameEma < 19) backoff = Math.max(0, backoff * .97 - .5);
      // the snakes keep slithering while the page is visible (not with reduced motion); heads keep turning until done
      const motion = !reduce.matches && !document.hidden, swallowing = !!overlay.current.mouth || !!overlay.current.bulge;
      // during a swallow the snake redraws every frame (it is brief, and its head must turn and strike smoothly)
      const snakesDue = swallowing || ((motion || snakesBusy) && now - lastSnakes >= snakeGap());
      const tokens = () => { const t = tableRef.current; return t ? t.order.map(s => t.pos[s] ?? 0) : []; };
      if (sc) {
        const t = tableRef.current;
        const sceneChanged = dirty.current;                              // tokens or effects moved (not just the snakes' own redraw)
        if (snakesDue) dirty.current = true;
        if (!dirty.current) return;                                     // draw only when something changed (saves battery)
        dirty.current = false;
        if (!t) return;
        // the watchdog judges the 3D board by frames where the board itself changed; if the snakes' redraw is what costs
        // time, they simply redraw less often (the back-off above) rather than the 3D board being switched off
        drewLast = sceneChanged;
        const turn = rollingRef.current ?? (t.phase === "playing" ? t.turn : -1), fx3 = liveEffects();
        const fT0 = performance.now();
        snakesBusy = sc.frame(t.order.flatMap(s => { const p = disp.current[s]; return p ? [{ seat: s, piece: t.pieces[s], color: COLORS[s], x: p.x, y: p.y, h: p.h ?? 0, s: p.s ?? 1, active: s === turn, lean: p.lean, sway: p.sway, dir: p.dir }] : []; }), { ...overlay.current, ...fx3, tokens: tokens(), motion }, snakesDue);
        if (DEBUG) { const w = window as unknown as { __slFrameMs?: number[] }; (w.__slFrameMs ??= []).push(Math.round((performance.now() - fT0) * 10) / 10); if (w.__slFrameMs.length > 400) w.__slFrameMs.shift(); }
        if (snakesDue) { lastSnakes = now; if (DEBUG) (window as unknown as { __slSnakeFrames?: number }).__slSnakeFrames = ((window as unknown as { __slSnakeFrames?: number }).__slSnakeFrames ?? 0) + 1; }
        return;
      }
      const v = geoRef.current, pc = piecesRef.current, fx = fxRef.current;
      if (!v || !pc || !fx || !pc.width) return;
      // the lighter board: the snake layer repaints on its own clock, the tokens only when something moved
      if (snakesDue && fx.width) {
        const art = snakeArt.current ?? (snakeArt.current = new SnakeArt(lowPower() ? 2 : 2.6));
        const f = fx.getContext("2d")!; f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, fx.width, fx.height);
        const fs = fx.width / W; f.setTransform(fs, 0, 0, fs, 0, 0);
        snakesBusy = art.paint(f, now, overlay.current, tokens(), motion); lastSnakes = now;
        paintMs = paintMs * .8 + (performance.now() - now) * .2;
        if (DEBUG) (window as unknown as { __slSnakePaintMs?: number }).__slSnakePaintMs = paintMs;
        if (DEBUG) (window as unknown as { __slSnakeFrames?: number }).__slSnakeFrames = ((window as unknown as { __slSnakeFrames?: number }).__slSnakeFrames ?? 0) + 1;
      }
      if (!dirty.current) return;
      dirty.current = false;
      const t = tableRef.current, pd = pc.width / v.sw;
      const g = pc.getContext("2d")!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pc.width, pc.height); g.setTransform(pd, 0, 0, pd, 0, 0);
      if (!t) return;
      const turn = rollingRef.current ?? (t.phase === "playing" ? t.turn : -1), out: typeof boxes.current = [];
      const items = t.order.map(s => ({ s, p: disp.current[s] })).filter((i): i is { s: number; p: Disp } => !!i.p).sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x);
      for (const { s, p } of items) {
        const q = project(v, p.x, p.y), sc = p.s ?? 1;
        paintPiece(g, q.x, q.y, q.u, squash(v, p.x, p.y), COLORS[s], pieceImage(t.pieces[s], () => { dirty.current = true; }), s === turn, sc, p.h ?? 0, p.sway ?? 0);
        const h = PIECE_H * q.u * sc, w = h * (100 / 120), top = q.y - (p.h ?? 0) * q.u;
        if (sc > .05) out.push({ seat: s, x0: q.x - w * .34, x1: q.x + w * .34, y0: top - h * .84, y1: q.y });
      }
      boxes.current = out;
      // gold sparkles and the landing ring
      const fx2 = liveEffects();
      if (fx2.burst) { const q = project(v, fx2.burst.x, fx2.burst.y), k = fx2.burst.k, r = (12 + k * 30) * q.u; g.strokeStyle = `rgba(255,217,122,${((1 - k) * .9).toFixed(3)})`; g.lineWidth = 3 * q.u * (1 - k * .6); g.beginPath(); g.ellipse(q.x, q.y, r, r * squash(v, fx2.burst.x, fx2.burst.y), 0, 0, Math.PI * 2); g.stroke(); }
      for (const k of fx2.sparks) {
        const q = project(v, k.x, k.y), life = 1 - k.age, r = (3 + 4 * Math.sin(Math.min(1, k.age * 3) * Math.PI / 2)) * life * q.u, y = q.y - (k.h + 18 + k.age * 34) * q.u;
        const gr = g.createRadialGradient(q.x, y, 0, q.x, y, r * 2.2); gr.addColorStop(0, `rgba(255,255,235,${life})`); gr.addColorStop(.3, `rgba(255,222,130,${life * .9})`); gr.addColorStop(1, "rgba(255,190,60,0)");
        g.fillStyle = gr; g.fillRect(q.x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sub, !!table, glState]);
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __slPerf?: () => unknown }).__slPerf = () => sceneRef.current?.perf();
    (window as unknown as { __slForce?: () => void }).__slForce = () => { dirty.current = true; };
    (window as unknown as { __slOverlay?: (o: typeof overlay.current) => void }).__slOverlay = (o) => { overlay.current = o; dirty.current = true; };
    (window as unknown as { __slPieces?: (ids: PieceId[]) => void }).__slPieces = (ids) => setLocalPieces(ids);
    /* a still of the ladder climb (token part-way up ladder a -> b, leaning and swaying, sparkles behind), for photos */
    (window as unknown as { __slClimbStill?: (a: number, b: number, k: number) => void }).__slClimbStill = (a, b, k) => {
      const t = tableRef.current; if (!t) return;
      const p1 = center(a), p2 = center(b), dir = Math.atan2(p2.y - p1.y, p2.x - p1.x), at = (f: number) => ({ x: p1.x + (p2.x - p1.x) * f, y: p1.y + (p2.y - p1.y) * f });
      disp.current[t.order[0]] = { ...at(k), h: 5, lean: .32, sway: .18, dir };
      frozenFx.current = { sparks: [.08, .16, .24, .32].flatMap((d, i) => [0, 1, 2].map(j => ({ ...at(Math.max(0, k - d)), x: at(Math.max(0, k - d)).x + (j - 1) * 9, h: 4 + j * 5, age: .15 + i * .2 }))), burst: { ...center(b), k: .35 } };
      dirty.current = true;
    };
    /* a still of the swallow (the snake on `head` facing `facingDeg` degrees, jaws `open` 0..1, a token at its mouth),
       for photos; any other overlay call (or __slOverlay({})) ends it */
    (window as unknown as { __slSwallowStill?: (head: number, facingDeg: number, open?: number) => void }).__slSwallowStill = (head, facingDeg, open = 1) => {
      const t = tableRef.current; if (!t) return;
      const facing = (facingDeg * Math.PI) / 180, hc = center(head);
      overlay.current = { mouth: { head, open, facing, lunge: .55, tongue: .75, still: true } };
      disp.current[t.order[0]] = { x: hc.x + Math.cos(facing) * S * .78, y: hc.y + Math.sin(facing) * S * .78, s: .8 };   // the token just in front of the open jaws
      dirty.current = true;
    };
    /* tests: the snake heads' angles, and moving the tokens in the practice game itself (one square per seat) */
    (window as unknown as { __slSnakes?: () => unknown }).__slSnakes = () => sceneRef.current?.snakeState() ?? snakeArt.current?.state() ?? null;
    (window as unknown as { __slSetPos?: (sq: number[]) => void }).__slSetPos = (sq) => {
      setLocal(g => (g ? { ...g, pos: Object.fromEntries(g.order.map((s, i) => [s, sq[i] ?? g.pos[s]])), last: null } : g));
      animatedN.current = null; window.setTimeout(settle, 30);
    };
    /* place the tokens on given squares (one per seat, 0 = waiting), as a test of where they stand */
    (window as unknown as { __slPlace?: (sq: number[]) => void }).__slPlace = (sq) => {
      const t = tableRef.current; if (!t) return;
      const fake = { ...t, pos: Object.fromEntries(t.order.map((s, i) => [s, sq[i] ?? 0])) };
      for (const s of t.order) disp.current[s] = restPoint(fake, s) ?? { ...OFF };
      dirty.current = true;
    };
  });
  /* Test hook (only with ?debug in the address): where tokens and square numbers are on screen, to check none is hidden. */
  useEffect(() => {
    if (!DEBUG) return;
    const w = window as unknown as { __slDebug?: () => unknown };
    w.__slDebug = () => {
      const sc = sceneRef.current, st0 = stageRef.current;
      if (sc && st0 && (window as unknown as { __slPerfOnly?: boolean }).__slPerfOnly) return null;
      if (sc && st0) {
        const r = st0.getBoundingClientRect(), d = sc.debug(), off = <T extends { x0: number; x1: number; y0: number; y1: number }>(b: T) => ({ ...b, x0: b.x0 + r.left, x1: b.x1 + r.left, y0: b.y0 + r.top, y1: b.y1 + r.top });
        const pr = off(d.projRect);
        return { mode: "webgl", layout: layoutIssues(), A: d.elevation, numbers: d.numbers.map(off), tokens: d.tokens.map(off), topSquare: d.topSquare, bottomSquare: d.bottomSquare, fontTop: d.fontTop, fontBottom: d.fontBottom, projRect: pr, planeRect: pr, stage: { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom } };
      }
      const v = geoRef.current, st = stageRef.current; if (!v || !st) return null;
      const r = st.getBoundingClientRect(), m = document.createElement("canvas").getContext("2d")!; m.font = NUM_FONT;
      const numbers = Array.from({ length: 100 }, (_, i) => {
        const n = i + 1, a = numberAt(n), tw = m.measureText(String(n)).width;
        const c = [[a.x, a.y - 15], [a.x + tw, a.y - 15], [a.x, a.y + 1], [a.x + tw, a.y + 1]].map(([x, y]) => project(v, x, y));
        return { n, x0: r.left + Math.min(...c.map(p => p.x)), x1: r.left + Math.max(...c.map(p => p.x)), y0: r.top + Math.min(...c.map(p => p.y)), y1: r.top + Math.max(...c.map(p => p.y)) };
      });
      const sq = (n: number) => { const c = center(n), a = project(v, c.x - 30, c.y - 30), b = project(v, c.x + 30, c.y + 30); return { w: b.x - a.x, h: b.y - a.y }; };
      const plane = st.querySelector(".sl-plane")!.getBoundingClientRect(), corners = [[0, 0], [W, 0], [0, W], [W, W]].map(([x, y]) => project(v, x, y));
      return {
        A: v.A, B: v.B, numbers, tokens: boxes.current.map(b => ({ ...b, x0: b.x0 + r.left, x1: b.x1 + r.left, y0: b.y0 + r.top, y1: b.y1 + r.top })),
        topSquare: sq(95), bottomSquare: sq(5), fontTop: project(v, W / 2, 30).u * 21, fontBottom: project(v, W / 2, W - 30).u * 21,
        planeRect: { x0: plane.left, x1: plane.right, y0: plane.top, y1: plane.bottom },
        projRect: { x0: r.left + Math.min(...corners.map(p => p.x)), x1: r.left + Math.max(...corners.map(p => p.x)), y0: r.top + Math.min(...corners.map(p => p.y)), y1: r.top + Math.max(...corners.map(p => p.y)) },
        stage: { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom },
      };
    };
  });

  /** Moves a token along a path over `ms`, with an optional hop and a size change. */
  const follow = (seat: number, pts: Pt[], ms: number, hop = 0, s0 = 1, s1 = 1) => new Promise<void>(res => {
    const seg = [0];
    for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = seg[seg.length - 1] || 1, dur = Math.max(1, ms * pace), t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, d = e * total;
      let i = 1; while (i < seg.length - 1 && seg[i] < d) i++;
      const k = (d - seg[i - 1]) / ((seg[i] - seg[i - 1]) || 1);
      disp.current[seat] = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k, h: Math.sin(t * Math.PI) * hop, s: s0 + (s1 - s0) * t };
      dirty.current = true;
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  /** Runs `f(t)` for every frame over `ms` (t from 0 to 1). */
  const tween = (ms: number, f: (t: number) => void) => new Promise<void>(res => {
    const dur = Math.max(1, ms * pace), t0 = performance.now();
    const step = (now: number) => { const t = Math.min(1, (now - t0) / dur); f(t); dirty.current = true; if (t < 1) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
  });

  /* Rolls the 2D die on its pedestal: it is tossed up spinning flat, its face flicking through numbers as it tumbles
     (slowing down), bounces with a little squash and settles showing `value`. The value always comes from the game
     (engine or server); this only shows it. */
  const throwDie = (value: number) => new Promise<void>((resolve) => {
    const el = diceRef.current, cube = cubeRef.current, sh = shadowRef.current, face = cube?.firstElementChild ?? null;
    if (!el || !cube || !sh) { resolve(); return; }
    const size = el.clientWidth || 56, dir = Math.random() < .5 ? -1 : 1;
    const spins = (2 + Math.floor(Math.random() * 2)) * 360 * dir, endTilt = (Math.random() - .5) * 16;
    const jx = (Math.random() - .5) * size * .6, dur = reduced ? 250 : TIMING.die, t0 = performance.now();
    let nextFlip = 0, shown = value;
    sfx.dice(dur);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3), rot = 1 - Math.pow(1 - t, 2.2);
      const bounce = Math.abs(Math.cos(t * Math.PI * 2.5)), h = reduced ? 0 : size * 1.5 * Math.pow(1 - t, 1.6) * bounce, x = jx * (1 - e);
      const squash = h < size * .06 && t > .2 && t < .97 ? .9 : 1;
      el.style.transform = `translate(${x}px, ${-h}px)`;
      cube.style.transform = t < 1 ? `rotate(${spins * (1 - rot) + endTilt * rot}deg) scale(${1 + h / size * .12}, ${(1 + h / size * .12) * squash})` : `rotate(${endTilt}deg)`;
      if (t < .82 && now >= nextFlip) { let v = shown; while (v === shown) v = 1 + Math.floor(Math.random() * 6); shown = v; setPips(face, v); nextFlip = now + 45 + t * 140; }
      else if (t >= .82 && shown !== value) { shown = value; setPips(face, value); }
      sh.style.transform = `translateX(${x}px) scale(${Math.max(.45, 1 - h / size * .4)})`;
      sh.style.opacity = String(Math.max(.2, .6 - h / size * .3));
      if (t < 1) requestAnimationFrame(step);
      else { el.style.transform = ""; setPips(face, value); try { navigator.vibrate?.(18); } catch { /* not supported */ } resolve(); }
    };
    requestAnimationFrame(step);
  });

  /* Plays one roll on the board. Its length matches the server's pause (TIMING in engine.ts). */
  const play = async (l: LastRoll) => {
    await throwDie(l.value);
    setDieValue(l.value);
    await wait(TIMING.settle);
    const seat = l.seat, here = () => disp.current[seat] ?? OFF;
    if (l.outcome === "enter") { sfx.hop(); await follow(seat, [OFF, spotOf(1)], TIMING.enter, 16); }
    // landing on a snake's head: the token stops at the edge of the square, on the side it came from, facing the snake
    const approach = (n: number) => { const c = center(n), p = center(Math.max(1, n - 1)), d = Math.hypot(p.x - c.x, p.y - c.y) || 1; return { x: c.x + ((p.x - c.x) / d) * S * .42, y: c.y + ((p.y - c.y) / d) * S * .42 }; };
    if (l.outcome === "move") for (let n = l.from + 1; n <= l.landed; n++) { sfx.hop(); await follow(seat, [here(), n === l.landed && l.via === "snake" && n > 1 ? approach(n) : spotOf(n)], TIMING.step, 12); }
    if (l.via === "ladder") {
      /* The climb (same length as the server's pause): the token steps onto the foot of the ladder and leans in, then
         goes up rung by rung, hand over hand, swaying side to side with a little bounce on each rung and a trail of gold
         sparkles, and steps off onto the top square with a gold ring. */
      const rungs = rungsOf(l.landed, l.to), foot = center(l.landed), top = spotOf(l.to), topC = center(l.to);
      const dir = Math.atan2(topC.y - foot.y, topC.x - foot.x), from = here(), LEAN = .32;
      await tween(TIMING.ladderBase, t => { const e = t * t * (3 - 2 * t); disp.current[seat] = { x: from.x + (foot.x - from.x) * e, y: from.y + (foot.y - from.y) * e, h: Math.sin(t * Math.PI) * 4, s: 1 - .07 * Math.sin(t * Math.PI), lean: LEAN * e, dir }; });
      sfx.ladder(rungs, TIMING.rung * pace, 0);
      for (let i = 1; i <= rungs; i++) {
        const k0 = (i - 1) / rungs, k1 = i / rungs, last = i === rungs, side = i % 2 ? 1 : -1;
        const a = { x: foot.x + (topC.x - foot.x) * k0, y: foot.y + (topC.y - foot.y) * k0 }, b = last ? top : { x: foot.x + (topC.x - foot.x) * k1, y: foot.y + (topC.y - foot.y) * k1 };
        let sparked = false;
        await tween(TIMING.rung, t => {
          const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          disp.current[seat] = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, h: Math.sin(t * Math.PI) * (last ? 12 : 6), s: last ? 1 + .1 * Math.sin(t * Math.PI) : 1, lean: last ? LEAN * (1 - e) : LEAN, sway: last ? 0 : side * .2 * Math.sin(t * Math.PI), dir };
          if (!sparked && t > .45) {
            sparked = true;
            const now = performance.now(), p = disp.current[seat]!;
            for (let j = 0; j < 3; j++) effects.current.sparks.push({ x: p.x + (Math.random() - .5) * 22, y: p.y + (Math.random() - .5) * 14, h: Math.random() * 14, born: now - j * 40 });
          }
        });
      }
      effects.current.burst = { x: top.x, y: top.y, born: performance.now() };
    }
    if (l.via === "snake") {
      // the snake opens its mouth and swallows the pawn, a bulge slides down its body, and the pawn pops out at the tail
      /* The strike, in the same time as before (TIMING.mouth, so online rooms stay in step): the head turns toward the
         side the token came from (within about 150 ms), the tongue flicks out twice, the jaws gape, the snake lunges and
         the token is drawn into its mouth, shrinking as the jaws close over it. Then a bulge in the player's colour
         travels down the body to the tail and the head eases back to its resting angle. */
      const head = l.landed, slide = snakeSlideMs(l.landed, l.to), color = COLORS[seat], at = center(head);
      const facing = SnakeArt.facingFrom(head, Math.max(1, head - 1)), mouthAt = { x: at.x + Math.cos(facing) * 14, y: at.y + Math.sin(facing) * 14 };
      sfx.snake(TIMING.mouth * pace, slide * pace);
      const start = here();
      await tween(TIMING.mouth, t => {
        const u = Math.min(1, Math.max(0, (t - .08) / .34));
        const tongue = t < .42 ? Math.abs(Math.sin(u * Math.PI * 2)) * (1 - u * .3) : 0;
        const open = t < .15 ? 0 : t < .5 ? (t - .15) / .35 : t < .78 ? 1 : 1 - ((t - .78) / .22) * .7;
        const lunge = t < .5 ? 0 : t < .68 ? (t - .5) / .18 : 1 - ((t - .68) / .32) * .8;
        overlay.current.mouth = { head, open, facing, lunge, tongue };
        const k = Math.max(0, (t - .62) / .38);
        disp.current[seat] = { x: start.x + (mouthAt.x - start.x) * k, y: start.y + (mouthAt.y - start.y) * k, s: 1 - k };
      });
      disp.current[seat] = { ...at, s: 0 };
      await tween(slide, t => {
        overlay.current.mouth = t < .2 ? { head, open: .3 * (1 - t / .2), facing, lunge: .2 * (1 - t / .2) } : undefined;
        overlay.current.bulge = { head, k: .03 + .97 * (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), color };
      });
      overlay.current = {};
      const end = spotOf(l.to);
      effects.current.burst = { x: end.x, y: end.y, born: performance.now() };
      await tween(TIMING.pop, t => { const s = t < .6 ? (t / .6) * 1.25 : 1.25 - ((t - .6) / .4) * .25; disp.current[seat] = { x: end.x, y: end.y, h: Math.sin(t * Math.PI) * 14, s }; });
    }
    if (l.outcome === "three-sixes") { sfx.oops(); await wait(150); await follow(seat, [here(), l.to === 0 ? OFF : spotOf(l.to)], TIMING.ret - 150); }
    if (l.win && l.rank) {
      const t = tableRef.current, who = t ? t.names[seat] : "";
      const big = l.rank === 1;
      settle();
      celebrate(big); sfx.finish(l.rank);
      setBanner({ text: `${MEDAL[l.rank - 1]} ${who === "You" ? "You finished" : who + " finished"} ${PLACE[l.rank - 1]}!`, big });
      await wait(big ? TIMING.finish1 : TIMING.finishN);
      setBanner(null);
    }
  };

  /* Each new roll (from this device's practice game or from the server) is animated once, in order. */
  useEffect(() => {
    if (!table || sub !== "table") return;
    const l = table.last;
    if (animatedN.current === null || !l || l.n < animatedN.current) {          // fresh table, resumed game, or new game
      animatedN.current = l?.n ?? 0; settle(); setBanner(null);
      if (!l) setMsg(online ? `${table.names[table.turn]}${table.turn === table.you ? " go" : " goes"} first. Roll a 6 to enter the board.` : "You go first. Roll a 6 to enter the board.");
      else setMsg(describe(l, table));
      return;
    }
    if (l.n === animatedN.current) { if (!animating) settle(); return; }
    animatedN.current = l.n;
    setAnimating(true); setRolling(l.seat); setMsg(`${table.names[l.seat]} ${l.seat === table.you ? "roll" : "rolls"}…`);
    chain.current = chain.current.then(() => play(l)).catch(() => undefined).then(() => {
      settle(); setAnimating(false); setRolling(null);
      const t = tableRef.current; if (t) setMsg(describe(l, t));
      if (!online && l.seat === 0 && l.via === "snake" && Math.random() < .5) botSay(300, [["p", 3], ["p", 6], ["e", 1], ["e", 10]]);
    });
  }, [table, sub]);

  /* ---------- actions ---------- */
  const myTurn = !!table && table.phase === "playing" && table.turn === table.you && !animating && !(online && view?.moving) && (!table.last || table.last.n === animatedN.current);
  const doRoll = () => {
    if (!myTurn) return;
    unlock();
    if (online) send({ t: "roll" }); else { const v = rollDie(), lucky = rollLucky(); setLocal(g => (g ? roll(g, 0, v, lucky) : g)); }
  };
  useEffect(() => {
    if (sub !== "table") return;
    const k = (e: KeyboardEvent) => { if ((e.code === "Space" || e.key === "Enter") && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); doRoll(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  const secsLeft = online && view?.deadline != null && table?.turn === table?.you ? Math.max(0, Math.ceil((view.deadline - (Date.now() + skew.current)) / 1000)) : null;
  const showEnd = !!table && table.phase === "gameEnd" && !animating;
  const chooseModel = (m: ModelId) => { setModel(m); keep(MODEL_KEY, m); };
  const chooseTheme = (t: ThemeId) => { setTheme(t); keep(THEME_KEY, t); };
  const chooseDice = (d: DiceId) => { setDice(d); keep(DICE_KEY, d); };
  const togglePanel = (p: "settings" | "rules" | "chat") => setPanel(x => (x === p ? "none" : p));
  const chooseView = (v: "3d" | "flat") => { setView3d(v); keep(VIEW_KEY, v); if (v === "3d") setGlState(s => (s === "off" ? "idle" : s)); };
  useEffect(() => {
    if (panel === "none") return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setPanel("none"); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [panel]);

  /* ---------- screens ---------- */
  if (sub === "lobby") return <section className="mode-page sl-mode">
    <button className="back-link" onClick={onHome}>← Back</button>
    <div className="eyebrow">ROYAL CLUB · SNAKES &amp; LADDERS</div>
    <h1>Choose how you want to play</h1>
    <div className="mode-grid">
      <button className={pick === "practice" ? "mode-card selected" : "mode-card"} onClick={() => setPick("practice")}><span className="mode-ico">⚄</span><strong>You vs Comp</strong><p>Play against computer players.</p></button>
      <button className={pick === "online" ? "mode-card selected" : "mode-card"} onClick={() => setPick("online")}><span className="mode-tag">SOON</span><span className="mode-ico">◈</span><strong>Online</strong><p>Quick match with other players.</p></button>
      <button className={pick === "room" ? "mode-card selected" : "mode-card"} onClick={() => setPick("room")}><span className="mode-ico mode-door" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 21h17"/><path d="M5.5 21V3.5h9"/><path d="M14.5 3.5v2.2"/><path d="M14.5 21v-2"/><path d="M8.5 4.6 16.5 2.6v18.8l-8-2.2z" fill="currentColor" fillOpacity=".18"/><circle cx="14.2" cy="12.4" r=".9" fill="currentColor"/></svg></span><strong>Room</strong><p>Play with 1 to 3 friends using a code.</p></button>
    </div>
    {pick === "practice" && <div className="sl-bots"><span>Computer players</span>{[1, 2, 3].map(n => <button key={n} className={bots === n ? "on" : ""} aria-pressed={bots === n} onClick={() => setBots(n)}>{n}</button>)}</div>}
    <button className="gold-button" disabled={pick === "online"} onClick={() => (pick === "practice" ? choosePracticeTokens() : pick === "room" ? setSub("room") : undefined)}>
      {pick === "practice" ? "Choose tokens →" : pick === "room" ? "Create or join a room →" : "Coming soon"}
    </button>
    <p className="room-note">Rules: roll a 6 to enter · a 6 rolls again · three 6s in a row cancel the turn · land exactly on 100 · play on for 1st, 2nd and 3rd.</p>
  </section>;

  if (sub === "tokens") return <section className="mode-page sl-mode sl-tokens-page">
    <button className="back-link" onClick={() => setSub("lobby")}>← Back</button>
    <div className="eyebrow">ROYAL CLUB · SNAKES &amp; LADDERS</div>
    <h1>Choose your tokens</h1>
    <TokenPicker players={localNames.map((n, i) => ({ key: i, name: n, piece: localPieces[i], color: COLORS[i], editable: true }))}
      active={picking} onActive={setPicking} onPick={pickLocal} note="Tap a player, then a token. Mix any collections; each player's token is different." />
    <button className="gold-button" onClick={startPractice}>Start match →</button>
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
      {view.phase === "lobby" && <TokenPicker
        players={(view.seats.filter(Boolean) as NonNullable<SeatInfo>[]).map(p => ({ key: p.seat, name: p.seat === view.you ? "You" : p.name + (!p.connected ? " · offline" : ""), piece: p.piece ?? DEFAULT_PIECES[p.seat], color: COLORS[p.seat], editable: p.seat === view.you }))}
        active={view.you} onActive={() => undefined} onPick={(_, id) => { keep(PIECE_KEY, id); send({ t: "piece", id }); }}
        note={`${view.seats.filter(Boolean).length} of 4 seats filled. Pick your token — each player's is different.`} />}
      {view.phase !== "lobby" && <ul className="room-seats">{view.seats.map((p, i) => <li key={i} className={p ? "filled" : ""}><span style={p ? { background: COLORS[i], borderColor: COLORS[i], color: "#fff" } : undefined}>{i + 1}</span>{p ? p.name + (i === view.you ? " (you)" : "") + (!p.connected ? " · offline" : "") : "Open seat"}</li>)}</ul>}
      {view.phase === "lobby" ? (() => {
        const seated = view.seats.filter(Boolean) as NonNullable<SeatInfo>[], ready = seated.length >= 2 && seated.every(p => p.connected);
        if (view.board !== BOARD_VERSION) return <p className="room-note sl-warn" role="alert">This room server still runs the previous board layout, so online games are paused until it is updated. You vs Comp games use the new board now.</p>;
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
  const turnName = table.names[table.turn];
  const rankOf = (s: number) => { const i = table.finished.indexOf(s); return i < 0 ? 0 : i + 1; };
  const playing = table.phase === "playing";
  const rollLabel = table.phase === "gameEnd" ? "Game over" : myTurn ? (table.streak > 0 ? "Roll again" : "Roll dice") : animating ? "Rolling…" : rankOf(table.you) ? "You've finished" : `${turnName}'s turn`;
  const where = online && view ? `Room ${view.code}` : "You vs Comp";
  return <section className={`sl-screen ${view3d === "flat" ? "flat" : ""}`}>
    <header className="sl-head">
      <button className="sl-icon-btn" onClick={() => setSub(online ? "room" : "lobby")} aria-label={online ? "Back to the room" : "Back to the lobby"}>←</button>
      <div className="sl-crest" role="img" aria-label={`Royal Club Snakes and Ladders, ${where}`}>
        <Crown /><b>ROYAL CLUB</b><span>SNAKES &amp; LADDERS</span>
      </div>
      <div className="sl-head-end">
        <button className="sl-icon-btn" onClick={toggleSound} aria-label={sound ? "Turn sound off" : "Turn sound on"} aria-pressed={sound}><SoundIcon on={sound} /></button>
        <button className="sl-icon-btn" onClick={() => togglePanel("settings")} aria-label="Settings" aria-expanded={panel === "settings"}><GearIcon /></button>
      </div>
    </header>

    <aside className="sl-left" aria-label="Players">
      <div className="sl-side-title"><b>Players ({table.order.length})</b><small>{where}</small></div>
      <ul className="sl-players">
        {table.order.map(s => {
          const r = rankOf(s), b = bubbles[s], now = rolling !== null ? rolling === s : playing && table.turn === s;
          return <li key={s} className={(now ? "turn " : "") + (r ? "done" : "")} aria-current={now ? "true" : undefined}>
            <span className="sl-avatar" style={{ borderColor: COLORS[s] }}><img src={pieceUrl(table.pieces[s])} alt={pieceById(table.pieces[s]).name} /></span>
            <span className="sl-info">
              <span className="sl-name">{table.names[s]}{table.away[s] && <em> · away</em>}</span>
              <span className="sl-sq"><i className="sl-dot" style={{ background: COLORS[s] }} />{r ? `${MEDAL[r - 1]} ${PLACE[r - 1]}` : table.pos[s] ? table.pos[s] : "Start"}</span>
            </span>
            {now && <span className="sl-turn-tag">{s === table.you ? "Your turn" : "Turn"}</span>}
            {b && <span key={b.id} className={`sl-bubble ${[...b.text].length <= 2 ? "emoji" : ""}`} role="status">{b.text}</span>}
          </li>;
        })}
      </ul>
    </aside>

    <div className="sl-stage" ref={stageRef} role="img" aria-label={`Snakes and ladders board. ${table.order.map(s => `${table.names[s]} on ${table.pos[s] || "start"}`).join(", ")}.`}>
      {useGL ? <>
        <canvas key="gl" className="sl-gl" ref={glRef} />
        {glState !== "ready" && <p className="sl-gl-wait">Setting up the 3D board…</p>}
      </> : <>
        <canvas key="base" className="sl-base" ref={baseRef} style={geo ? { width: geo.sw + "px", height: geo.sh + "px" } : undefined} />
        <div className="sl-plane" style={geo ? planeStyle(geo) : { visibility: "hidden" }}><canvas className="sl-board" ref={boardRef} /></div>
        <div className="sl-plane snakes" style={geo ? planeStyle(geo) : { visibility: "hidden" }}><canvas ref={fxRef} /></div>
        <div className="sl-plane nums" style={geo ? planeStyle(geo) : { visibility: "hidden" }}><canvas ref={numRef} /></div>
        <canvas className="sl-pieces" ref={piecesRef} style={geo ? { width: geo.sw + "px", height: geo.sh + "px" } : undefined} />
      </>}
      {banner && <div className={`sl-banner ${banner.big ? "big" : ""}`} role="status">{banner.text}</div>}
      {showEnd && <div className="sl-win">
        <Crown />
        <span className="eyebrow">FINAL STANDINGS</span>
        <ol className="sl-standings">{table.finished.map((s, i) => <li key={s} className={i === 0 ? "first" : ""}><span className="medal">{MEDAL[i]}</span><span className="sl-avatar" style={{ borderColor: COLORS[s] }}><img src={pieceUrl(table.pieces[s])} alt="" /></span><b>{table.names[s]}</b><span>{PLACE[i]}</span></li>)}</ol>
        <div className="sl-win-actions">
          {online ? (view?.host ? <button className="gold-button" onClick={() => send({ t: "again" })}>Play again</button> : <p className="sl-small">Waiting for the host to start a new game.</p>)
            : <button className="gold-button" onClick={() => setSub("tokens")}>Play again</button>}
          <button className="ghost-button" onClick={() => (online ? leaveRoom() : setSub("lobby"))}>{online ? "Leave room" : "Back to lobby"}</button>
        </div>
      </div>}
    </div>

    <aside className="sl-right" aria-label="Dice and actions">
      {/* the die is the roll button: tap it (or press Space / Enter) to roll */}
      <button type="button" className={`sl-tray ${myTurn ? "ready" : ""}`} disabled={!myTurn} onClick={doRoll}
        aria-label={myTurn ? (table.streak > 0 ? "Roll the dice again" : "Roll the dice") : rollLabel}>
        <div className="sl-pedestal" aria-hidden="true" />
        <div className="sl-dice-shadow" ref={shadowRef} />
        <div className={`sl-dice d-${dice}`} ref={diceRef} aria-hidden="true">
          <div className="sl-cube flat" ref={cubeRef}>
            <div className="sl-face flat"><Face v={dieValue} /></div>
          </div>
        </div>
      </button>
      <span className={`sl-roll-hint ${myTurn ? "ready" : ""}`} aria-hidden="true">{myTurn ? (table.streak > 0 ? "Tap the dice to roll again" : "Tap the dice to roll") : rollLabel}</span>
      {secsLeft !== null && myTurn && <span className={`timer-chip ${secsLeft <= 5 ? "urgent" : ""}`}>⏱ {secsLeft}s</span>}
      <div className="sl-last">
        <b className="sl-last-title">{table.last ? "Last turn" : "Ready"}</b>
        {table.last && <div className="sl-last-roll"><span className={`sl-mini d-${dice}`}><span className="sl-face"><Face v={dieValue} /></span></span><strong>{animating ? "…" : dieValue}</strong></div>}
        <p className="sl-msg" aria-live="polite">{(rolling ?? table.last?.seat) != null && <i className="sl-dot" style={{ background: COLORS[(rolling ?? table.last?.seat) as number] }} />}{msg}{table.streak > 0 && playing && !animating ? ` · Sixes this turn: ${table.streak} of 3` : ""}</p>
      </div>
      <button className="sl-act sl-rules-btn" onClick={() => togglePanel("rules")} aria-expanded={panel === "rules"}><InfoIcon /><span>Rules</span></button>
      <button className="sl-act sl-chat-btn" onClick={() => togglePanel("chat")} aria-expanded={panel === "chat"} aria-label="Chat"><ChatIcon /><span>Chat</span></button>
      <span className="sl-sr" aria-live="polite">{animating ? "" : `Die shows ${dieValue}`}</span>
    </aside>

    {panel !== "none" && <div className="sl-backdrop" onClick={() => setPanel("none")} />}
    {panel === "settings" && <div className="sl-sheet" role="dialog" aria-label="Settings">
      <b>Board view</b>
      <div className="sl-opts">{(["3d", "flat"] as const).map(v => <button key={v} className={v === view3d ? "on" : ""} aria-pressed={v === view3d} disabled={v === "3d" && !can3d} onClick={() => chooseView(v)}>{v === "3d" ? "3D board" : "Flat, top-down"}</button>)}</div>
      <b>Board model</b>
      <div className="sl-opts models">{MODEL_IDS.map(m => <button key={m} className={m === model ? "on" : ""} aria-pressed={m === model} onClick={() => chooseModel(m)}><i className={`sl-model m-${m}`} aria-hidden="true" /><span><b>{MODELS[m].name}</b><small>{MODELS[m].blurb}</small></span></button>)}</div>
      <b>Theme</b>
      <div className="sl-opts themes">{THEME_IDS.map(t => { const [a, b, c] = THEMES[t].swatch; return <button key={t} className={t === theme ? "on" : ""} aria-pressed={t === theme} onClick={() => chooseTheme(t)}><i className="sl-swatch" style={{ background: `conic-gradient(${a} 0 25%,${b} 0 50%,${a} 0 75%,${b} 0)`, boxShadow: `inset 0 0 0 3px ${c}, 0 0 0 1.5px rgba(255,235,190,.5)` }} />{THEMES[t].name}</button>; })}</div>
      <b>Dice</b>
      <div className="sl-opts dice">{DICE.map(d => <button key={d.id} className={d.id === dice ? "on" : ""} aria-pressed={d.id === dice} onClick={() => chooseDice(d.id)}><span className={`sl-mini d-${d.id}`}><span className="sl-face"><Face v={5} /></span></span>{d.name}</button>)}</div>
      <div className="sl-sheet-row"><button className="ghost-button" onClick={() => setPanel("rules")}>Rules</button><button className="gold-button" onClick={() => setPanel("none")}>Done</button></div>
    </div>}
    {panel === "rules" && <div className="sl-sheet sl-rules" role="dialog" aria-label="Rules">
      <b>House rules</b>
      <ul><li>Roll a <b>6</b> to enter the board on square 1.</li><li>A <b>6</b> gives you another roll.</li><li><b>Three 6s in a row</b> cancel that whole turn — your token goes back to where the turn began.</li><li>Ladders lift you up; snakes swallow you and bring you down to their tail.</li><li>Land <b>exactly</b> on 100. A roll that goes past 100 doesn't move.</li><li>The game goes on after someone finishes: <b>1st, 2nd, 3rd</b>, until one player is left.</li>{online && <li>You have 15 seconds to roll, then the game rolls for you.</li>}</ul>
      <button className="gold-button" onClick={() => setPanel("none")}>Close</button>
    </div>}
    {panel === "chat" && <div className="sl-sheet sl-chat" role="dialog" aria-label="Quick chat">
      <div className="sl-chat-phrases">{CHAT_PHRASES.map((p, i) => <button key={p} disabled={chatGap} onClick={() => sendChat("p", i)}>{p}</button>)}</div>
      <div className="sl-chat-emojis">{CHAT_EMOJIS.map((e, i) => <button key={e} disabled={chatGap} onClick={() => sendChat("e", i)} aria-label={`Send ${e}`}>{e}</button>)}</div>
    </div>}
  </section>;
}
