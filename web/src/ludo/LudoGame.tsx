import { reportGame } from "../lib/report";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { GameBar, IconButton, PaletteIcon, RulesIcon, SoundIcon, TurnTimer } from "../ui/GameBar";
import { RoomClient, deviceToken, randomPasscode, saveRoom, savedRoom, serverUrl, type NetStatus } from "../domain/online";
import {
  ANIM, COLORS, LANE, LEVELS, SAFE, SPOTS, TRACK, YARD, absOf, bestMove, cellKey, move, newGame, pointOf, previewMove, roll, rollDie, turnOf,
  type Color, type Level, type LudoEvent, type LudoGame as Game, type Tok,
} from "./engine";
import { DICE, Face, Piece, PieceDefs, TOKEN_SETS, isUnlocked, setPips, unlockText, type DiceId, type TokenSet } from "./pieces";
import { useRealWins } from "./realWins";
import { celebrate } from "../snakes/confetti";
import { Celebration } from "./Celebration";
import ambaroMedallion from "../brand/ambaro-medallion.webp";
import { motionReduced, setMotionReduced } from "../lib/motion";
import { inviteText } from "../lib/share";
import { SAVE_KEYS, loadGame, saveGame, clearGame } from "../lib/localSave";
import "./ludo.css";
import { LudoArt } from "../home/GameArt";
import { PlayStart, WaitingRoom, keepLevel, readLevel } from "../room/RoomScreens";
import { arrival, victory } from "../lib/fanfare";
import { coach } from "../lib/coach";
import { ROOM_SIGNIN_MSG, markPlayed, onRoomAuthError, roomAccount, useSeatLabel } from "../auth/account";


const ROOM_KEY = "rc-ludo-room";
const BOTS = ["Maya", "Alex", "Jordan"];
const COLOR_NAME: Record<Color, string> = { red: "Ruby", green: "Jade", yellow: "Saffron", blue: "Sapphire" };
const PHRASES = ["Nice move! 👍", "Good luck 🍀", "Well played 👏", "Oops! 😅", "Hurry up ⏳", "So close! 😮", "Revenge is coming 😤", "Great roll! 🎲"];
const VICTIM = [3, 6], HUNTER = [0];
const TOKEN_KEY = "rc-ludo-tokens", DICE_KEY = "rc-ludo-dice";
const readKey = <T extends string>(key: string, ok: readonly string[], dflt: T): T => { try { const v = window.localStorage.getItem(key); return v && ok.includes(v) ? (v as T) : dflt; } catch { return dflt; } };
const keep = (key: string, v: string) => { try { window.localStorage.setItem(key, v); } catch { /* storage off: still works for this visit */ } };
const ORD = ["1st", "2nd", "3rd", "4th"];
/* A game on this device (vs computer or pass & play), saved after every move so it survives closing the app. */
type LudoSave = { game: Game; mode: "practice" | "pass"; names: string[]; level?: Level };
const isLudoSave = (d: unknown): d is LudoSave => {
  const s = d as LudoSave;
  return !!s && (s.mode === "practice" || s.mode === "pass") && Array.isArray(s.names) && !!s.game && Array.isArray(s.game.order)
    && s.game.order.length === s.names.length && typeof s.game.tokens === "object" && (s.game.phase === "roll" || s.game.phase === "move");
};
/* Rotate the board so the viewer's yard sits bottom-left (red is top-left in board coordinates). */
const ROT: Record<Color, number> = { blue: 0, red: -90, green: 180, yellow: 90 };
const CORNERS: [number, number][] = [[18, 15], [82, 15], [82, 85], [18, 85]];
let reduced = motionReduced();
let pace = reduced ? 0.3 : 1;
const setReduced = (on: boolean) => { setMotionReduced(on); reduced = on; pace = on ? 0.3 : 1; };
const wait = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms * pace));
const copyTokens = (t: Record<number, Tok[]>) => JSON.parse(JSON.stringify(t)) as Record<number, Tok[]>;

type SeatInfo = { seat: number; name: string; bot?: boolean; connected: boolean; away: boolean } | null;
type LView = {
  t: "state"; game: "ludo"; code: string; passcode: string; now: number; you: number; host: boolean; hostSeat?: number;
  phase: "lobby" | "playing" | "gameEnd"; seats: SeatInfo[];
  order?: number[]; colors?: Record<number, Color>; tokens?: Record<number, Tok[]>; turn?: number; stage?: "roll" | "move" | "gameEnd";
  dice?: number; sixes?: number; moves?: number[]; ranks?: number[]; last?: LudoEvent | null; deadline?: number | null; moving?: boolean;
  winCounts?: boolean;   // set once someone finishes 1st: whether that 1st place counts toward token unlocks
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
  away: Object.fromEntries(v.order.map(s => [s, !!v.seats[s]?.away && !v.seats[s]?.bot])), bots: Object.fromEntries(v.order.map(s => [s, !!v.seats[s]?.bot])),
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
    loadTrumpet();
    const t0 = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + dur + .02);
  } catch { /* no audio */ }
}
const sDice = () => { for (let i = 0; i < 6; i++) tone(180 + Math.random() * 260, .04, "square", .03, i * .075); };
const sStep = () => tone(620, .05, "triangle", .045);
const sCut = () => tone(520, .35, "sawtooth", .055, 0, 90);
/* A real elephant trumpet (public/sounds/animals/elephant-joy.mp3, also used by Snakes & Ladders), fetched once the
   first sound has played; until it arrives the generated trumpet plays instead. */
let trumpetBuf: AudioBuffer | null = null, trumpetAsked = false;
function loadTrumpet() {
  const c = ac; if (!c || trumpetAsked) return;
  trumpetAsked = true;
  fetch("/sounds/animals/elephant-joy.mp3").then(r => (r.ok ? r.arrayBuffer() : Promise.reject())).then(b => c.decodeAudioData(b)).then(b => { trumpetBuf = b; }).catch(() => undefined);
}
function trumpet(when = 0, vol = .5): boolean {
  if (!audioOn() || !ac || !trumpetBuf) return false;
  try {
    const src = ac.createBufferSource(), g = ac.createGain(); src.buffer = trumpetBuf; g.gain.value = vol;
    src.connect(g).connect(ac.destination); src.start(ac.currentTime + when); return true;
  } catch { return false; }
}
/** A short burst of filtered noise (whoosh, clash, thud). */
function hiss(dur: number, freq: number, vol = .08, when = 0, endFreq?: number, q = 1.2) {
  if (!audioOn()) return;
  try {
    ac = ac ?? new AudioContext(); if (ac.state === "suspended") void ac.resume();
    const t0 = ac.currentTime + when, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf; f.type = "bandpass"; f.Q.value = q; f.frequency.setValueAtTime(freq, t0); if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(.03, dur / 3)); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.connect(f).connect(g).connect(ac.destination); src.start(t0); src.stop(t0 + dur + .02);
  } catch { /* no audio */ }
}
/** The capture duel, a sound for each token set: the attacker's move (spear clash, hooves and a neigh, a trumpet and
    stomp, a growl and claw swipe, a peacock call, a rumbling ram), then the thud of the hit and the captured token's
    falling "whoaa". The hit lands about 0.38s in, when the attacker strikes. */
const sDuel = (set: TokenSet) => {
  hiss(.22, 900, .05, .12, 2600);                                                        // wind-up swish
  switch (set) {
    case "sentry": hiss(.16, 3200, .09, .34, 6000, 2); tone(2350, .28, "triangle", .05, .38); tone(3130, .22, "sine", .03, .4); break;   // clash of steel
    case "horse":
      [0, .08, .2, .28].forEach(w => tone(110, .06, "sine", .12, .02 + w, 70));          // hooves
      tone(980, .1, "triangle", .05, .16, 1500); tone(1500, .22, "triangle", .045, .26, 760);   // neigh
      break;
    case "ambaro":
      if (!trumpet(.04, .5)) { tone(320, .34, "sawtooth", .045, .1, 760); tone(330, .34, "sawtooth", .035, .11, 780); }   // trumpet
      [0, .12, .24].forEach(w => tone(58, .12, "sine", .14, .3 + w * .5, 44));                  // the charge
      hiss(.22, 260, .08, .4, 140, .8);                                                         // dust
      hiss(.3, 1400, .05, .5, 4200); tone(520, .4, "triangle", .04, .52, 1400);                 // flung high in the air
      break;
    case "tiger":
      hiss(.42, 160, .12, .02, 120, 6); tone(82, .4, "sawtooth", .05, .02, 70);                // growl
      hiss(.1, 4200, .08, .36, 7000, 2); hiss(.1, 3800, .06, .42, 6400, 2);                   // claw swipes
      break;
    case "peacock":
      tone(1250, .14, "triangle", .05, .12, 1750); tone(1750, .22, "triangle", .05, .26, 1100); // "may-awe" call
      hiss(.3, 1800, .06, .36, 900);                                                          // gust of the fan
      break;
    case "chariot":
      hiss(.36, 140, .1, .02, 260, 1.5); tone(70, .36, "square", .025, .02, 90);              // wheels rumbling
      hiss(.14, 900, .1, .38, 300, 1); tone(200, .14, "square", .04, .38, 120);               // wooden crash
      break;
  }
  tone(140, .18, "sine", .14, .38, 60); hiss(.08, 400, .1, .38);                         // thud of the hit
  tone(660, .5, "triangle", .05, .46, 180);                                              // the captured token's falling "whoaa"
};
/** Landing on a safe square (a starred square or a start square): a small, low "shield" buzz with a soft chime on top. */
const sSafe = () => { tone(196, .11, "square", .022, 0, 220); tone(784, .16, "sine", .045, .04); tone(1175, .2, "sine", .03, .09); };
const sHome = () => arrival(audioOn());            // war-trumpet arrival call (lib/fanfare.ts)
const sWin = () => victory(audioOn());             // joyful winner tune, kept soft
/** A small temple bell, as on the safe squares. */
const bell = (f: number, when = 0, vol = 1) => ([[1, .11, 1.6], [2, .047, 1.1], [2.76, .033, .8], [5.4, .013, .4]] as const).forEach(([m, v, d]) => tone(f * m, d, "sine", v * vol, when));
/** Finishing sounds. 1st: nagara drums, the elephant's trumpet and the winner tune; 2nd: temple bells rising one by
    one as the lamps light; 3rd: two soft bells. */
const sPlace = (place: number) => {
  if (place === 0) {
    sWin();
    [0, .26, .52, .65, .78, 1.04, 1.3, 1.43, 1.56, 1.82].forEach((w, i) => tone(i % 3 === 2 ? 130 : 92, .2, "sine", .2, w, 60));   // nagara
    if (!trumpet(.5, .55)) tone(330, .6, "sawtooth", .04, .5, 760);
  } else if (place === 1) [523, 659, 784, 1047].forEach((f, i) => bell(f, .25 + i * .3, .8));
  else [659, 880].forEach((f, i) => bell(f, i * .35, .7));
};

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
    {/* the centre is the ambari: four colour bays edged in gold around the Ambaro elephant medallion */}
    <path d="M6 6 L9 9 M9 6 L6 9" className="ld-bay-edge" />
    <rect x="6" y="6" width="3" height="3" className="ld-bay-frame" />
  </svg>;
}

/* Board themes: the look of the squares and frame. The four player colours never change. */
const THEMES = [
  { id: "royal", name: "Ambaro Royal", note: "Ivory squares in an emerald and gold frame" },
  { id: "dasara", name: "Dasara Night", note: "Indigo night, lamp-lit gold" },
  { id: "marble", name: "Palace Marble", note: "White marble with gold inlay" },
] as const;
type ThemeId = typeof THEMES[number]["id"];
const THEME_KEY = "rc-ludo-theme";
/** A small picture of a board in a theme, for the picker. */
const MiniBoard = ({ theme }: { theme: ThemeId }) => <span className={`ld-minib ld-theme-${theme}`}>
  <svg viewBox="0 0 15 15" aria-hidden="true">
    <rect width="15" height="15" className="ld-cell" />
    {COLORS.map(c => { const [x, y] = YARD[c]; return <g key={c}><rect x={x} y={y} width="6" height="6" className={`ld-f-${c}`} /><rect x={x + 1} y={y + 1} width="4" height="4" className="ld-yard" /></g>; })}
    <polygon points="6,6 7.5,7.5 6,9" className="ld-f-red" /><polygon points="6,6 9,6 7.5,7.5" className="ld-f-green" />
    <polygon points="9,6 9,9 7.5,7.5" className="ld-f-yellow" /><polygon points="6,9 9,9 7.5,7.5" className="ld-f-blue" />
    <polygon points={star(2.5, 8.5, .4, .17)} className="ld-star" /><polygon points={star(12.5, 6.5, .4, .17)} className="ld-star" />
  </svg>
</span>;

/** Previews of every token set (all four colours), board theme and dice finish, for the lobby and the in-game Style sheet. */
function StylePicker({ tokens, dice, theme, wins, signedIn, onTokens, onDice, onTheme }: { tokens: TokenSet; dice: DiceId; theme: ThemeId; wins: number; signedIn: boolean; onTokens: (t: TokenSet) => void; onDice: (d: DiceId) => void; onTheme: (t: ThemeId) => void }) {
  return <div className="ld-style">
    <b className="ld-style-title">Board</b>
    <div className="ld-theme-grid">{THEMES.map(th => <button key={th.id} className={theme === th.id ? "on" : ""} aria-pressed={theme === th.id} onClick={() => onTheme(th.id)}>
      <MiniBoard theme={th.id} /><strong>{th.name}</strong><small>{th.note}</small>
    </button>)}</div>
    <b className="ld-style-title">Tokens</b>
    <p className="ld-small ld-unlock-rule">New tokens unlock as you win: finish 1st in a room with at least one real player.</p>
    <div className="ld-token-grid">{TOKEN_SETS.map(s => {
      const open = isUnlocked(s.id, wins);
      return <button key={s.id} className={`${tokens === s.id ? "on" : ""}${open ? "" : " locked"}`} aria-pressed={tokens === s.id} aria-disabled={!open} onClick={() => open && onTokens(s.id)}>
        <span className="ld-token-row">{COLORS.map(c => <Piece key={c} set={s.id} color={c} />)}</span>
        <strong>{open ? s.name : `🔒 ${s.name}`}</strong><small>{open ? s.note : unlockText(s.id, wins, signedIn)}</small>
      </button>;
    })}</div>
    <b className="ld-style-title">Dice</b>
    <div className="ld-dice-grid">{DICE.map(d => <button key={d.id} className={dice === d.id ? "on" : ""} aria-pressed={dice === d.id} onClick={() => onDice(d.id)}>
      <span className={`ld-mini d-${d.id}`}><span className="ld-face"><Face v={5} /></span></span><small>{d.name}</small>
    </button>)}</div>
  </div>;
}

export default function LudoGame({ onHome, joinCode, joinPass }: { onHome: () => void; joinCode?: string; joinPass?: string }) {
  type Sub = "lobby" | "room" | "table";
  const [sub, setSub] = useState<Sub>(joinCode ? "room" : "lobby");
  const [bots, setBots] = useState(3);
  const [level, setLevelState] = useState<Level>(() => readLevel("ludo"));
  const setLevel = (l: Level) => { setLevelState(l); keepLevel("ludo", l); };
  const [gameLevel, setGameLevel] = useState<Level>(level);
  const [passCount, setPassCount] = useState(2);
  const [passNames, setPassNames] = useState(["Player 1", "Player 2", "Player 3", "Player 4"]);
  const [local, setLocal] = useState<Game | null>(null);
  const [localMode, setLocalMode] = useState<"practice" | "pass">("practice");
  const [localNames, setLocalNames] = useState<string[]>(["You", ...BOTS]);
  const [saved, setSaved] = useState<LudoSave | null>(() => loadGame(SAVE_KEYS.ludo, isLudoSave));
  const [view, setView] = useState<LView | null>(null);
  const [net, setNet] = useState<NetStatus>("idle");
  const label = useSeatLabel();
  const [roomCode, setRoomCode] = useState(joinCode ?? ""), [roomPass, setRoomPass] = useState(joinPass ?? "");
  const [roomMsg, setRoomMsg] = useState("");
  const [disp, setDisp] = useState<Record<number, Tok[]> | null>(null);
  const [animating, setAnimating] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [hits, setHits] = useState<string[]>([]);
  const [duel, setDuel] = useState<{ atk: string; vic: string[] } | null>(null);
  const [lessMotion, setLessMotion] = useState(reduced);
  const [lastDie, setLastDie] = useState<Record<number, number>>({});   // the value showing on each player's die
  const [rollingSeat, setRollingSeat] = useState<number | null>(null);
  const [tokenSet, setTokenSet] = useState<TokenSet>(() => readKey(TOKEN_KEY, TOKEN_SETS.map(x => x.id), "ambaro"));
  const [dice, setDice] = useState<DiceId>(() => readKey(DICE_KEY, DICE.map(x => x.id), "ivory"));
  const chooseTokens = (v: TokenSet) => { setTokenSet(v); keep(TOKEN_KEY, v); };
  const realWins = useRealWins("ludo");
  const shownSet: TokenSet = isUnlocked(tokenSet, realWins.wins) ? tokenSet : "ambaro";
  const shownSetRef = useRef(shownSet); shownSetRef.current = shownSet;
  const [cele, setCele] = useState<{ id: number; place: number; color: Color; name: string } | null>(null);
  const [homeFx, setHomeFx] = useState(0);
  const [unlockedNow, setUnlockedNow] = useState<string[]>([]);
  const [winCounted, setWinCounted] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => readKey(THEME_KEY, THEMES.map(x => x.id), "royal"));
  const chooseTheme = (v: ThemeId) => { setTheme(v); keep(THEME_KEY, v); };
  const chooseDice = (v: DiceId) => { setDice(v); keep(DICE_KEY, v); };
  const dieEls = useRef<Record<number, HTMLElement | null>>({});
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
      } else if (m.t === "err") { setRoomMsg(String(m.msg ?? "Something went wrong.")); onRoomAuthError(m); }
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
  useEffect(() => { if (sub === "table") markPlayed(); }, [sub]);
  const leaveRoom = () => {
    send({ t: "leave" });
    window.setTimeout(() => { saveRoom(null, ROOM_KEY); lastPhase.current = null; setView(null); clientRef.current?.close(); clientRef.current = null; setSub("room"); }, 300);
  };
  const createRoom = async () => {
    setRoomMsg("");
    const me = await roomAccount();
    if (!me) { setRoomMsg(ROOM_SIGNIN_MSG); return; }
    openRoom({ t: "create", game: "ludo", token: deviceToken(), name: me.username, passcode: randomPasscode(), auth: me.token });
  };
  const joinRoom = async () => {
    if (roomCode.length !== 4 || roomPass.length !== 4) { setRoomMsg("Enter the 4-letter room code and the 4-digit passcode."); return; }
    setRoomMsg("");
    const me = await roomAccount();
    if (!me) { setRoomMsg(ROOM_SIGNIN_MSG); return; }
    openRoom({ t: "join", game: "ludo", token: deviceToken(), name: me.username, code: roomCode, passcode: roomPass, auth: me.token });
  };

  /* ---------- games on this device ---------- */
  const startLocal = (mode: "practice" | "pass") => {
    const names = mode === "practice" ? ["You", ...BOTS.slice(0, bots)] : passNames.slice(0, passCount).map((n, i) => n.trim() || `Player ${i + 1}`);
    setLocalMode(mode); setLocalNames(names); animatedN.current = null; setDisp(null); setGameLevel(level);
    setLocal(newGame(names.map((_, i) => i), mode === "practice" ? 0 : Math.floor(Math.random() * names.length)));
    setSub("table");
  };
  const resumeLocal = (s: LudoSave) => {
    setLocalMode(s.mode); setLocalNames(s.names); animatedN.current = null; setDisp(null); setGameLevel(s.level && LEVELS.includes(s.level) ? s.level : "normal"); setLocal(s.game); setSub("table");
  };
  useEffect(() => {                                     // auto-save; a finished game is forgotten
    if (!local) return;
    if (local.phase === "gameEnd") { clearGame(SAVE_KEYS.ludo); setSaved(null); return; }
    saveGame(SAVE_KEYS.ludo, { game: local, mode: localMode, names: localNames, level: gameLevel });
  }, [local, localMode, localNames, gameLevel]);
  useEffect(() => {
    if (online || !local || local.phase === "gameEnd" || animating) return;
    if (local.last && local.last.n !== animatedN.current) return;            // wait until the last event has been shown
    const seat = turnOf(local), bot = localMode === "practice" && seat !== 0;
    let id = 0;
    if (local.phase === "roll" && bot) id = window.setTimeout(() => setLocal(g => (g ? roll(g, turnOf(g), rollDie()) : g)), 650 * pace);
    else if (local.phase === "move") {
      const forced = local.last?.kind === "roll" ? local.last.forced : null;
      if (bot) id = window.setTimeout(() => setLocal(g => (g ? move(g, turnOf(g), bestMove(g, turnOf(g), gameLevel)) : g)), 450 * pace);
      else if (forced != null) id = window.setTimeout(() => setLocal(g => (g ? move(g, turnOf(g), forced) : g)), 300 * pace);
    }
    return () => window.clearTimeout(id);
  }, [online, local, animating, localMode, gameLevel]);

  /* ---------- animation: each new event (from this device or the server) is shown once, in order ---------- */
  const settle = () => { const t = tableRef.current; if (t) setDisp(copyTokens(t.tokens)); };
  /* The Snakes & Ladders die, thrown in the rolling player's seat card: it hops up spinning, the face flicking
     through numbers as it tumbles, then lands with a little squash on the value the game rolled. */
  const throwDie = (seat: number, value: number) => new Promise<void>(resolve => {
    const el = dieEls.current[seat], face = el?.querySelector(".ld-face") as HTMLElement | null;
    if (!el || !face) { resolve(); return; }
    const size = el.clientWidth || 56, dir = Math.random() < .5 ? -1 : 1;
    const spins = (2 + Math.floor(Math.random() * 2)) * 360 * dir, endTilt = (Math.random() - .5) * 14;
    const dur = reduced ? 250 : ANIM.die - 60, t0 = performance.now();
    let nextFlip = 0, shown = value;
    sDice();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), rot = 1 - Math.pow(1 - t, 2.2);
      const bounce = Math.abs(Math.cos(t * Math.PI * 2.5)), h = reduced ? 0 : size * .55 * Math.pow(1 - t, 1.6) * bounce;
      const squash = h < size * .05 && t > .2 && t < .97 ? .9 : 1, grow = 1 + h / size * .25;
      face.style.transform = t < 1 ? `translateY(${-h}px) rotate(${spins * (1 - rot) + endTilt * rot}deg) scale(${grow}, ${grow * squash})` : `rotate(${endTilt}deg)`;
      if (t < .82 && now >= nextFlip) { let n = shown; while (n === shown) n = 1 + Math.floor(Math.random() * 6); shown = n; setPips(face, n); nextFlip = now + 45 + t * 140; }
      else if (t >= .82 && shown !== value) { shown = value; setPips(face, value); }
      if (t < 1) requestAnimationFrame(step);
      else { setPips(face, value); try { navigator.vibrate?.(18); } catch { /* not supported */ } resolve(); }
    };
    requestAnimationFrame(step);
  });
  const play = async (l: LudoEvent) => {
    const t = tableRef.current!;
    if (l.kind === "roll") {
      setRollingSeat(l.seat);
      await throwDie(l.seat, l.value);
      setLastDie(d => ({ ...d, [l.seat]: l.value })); setRollingSeat(null);
      if (l.value === 6) tone(988, .12, "triangle", .05);
      setMsg(describe(l, t));
      if (l.outcome !== "choose") await wait(ANIM.pass - 60);
      return;
    }
    const base = copyTokens(dispRef.current ?? t.tokens);
    if (base[l.seat]) base[l.seat][l.token] = { ...l.from };
    setMoving(`${l.seat}-${l.token}`);
    for (const st of l.steps) { base[l.seat][l.token] = st; setDisp(copyTokens(base)); sStep(); await wait(ANIM.step); }
    const end = l.steps[l.steps.length - 1];
    if (end && end.s === "track" && SAFE.has(absOf(t.colors[l.seat], end.r))) { sSafe(); try { navigator.vibrate?.(22); } catch { /* not supported */ } }
    setMoving(null);
    if (l.cuts.length) {
      const vic = l.cuts.map(c => `${c.seat}-${c.token}`);
      if (reduced) {
        setHits(vic); sCut();
        await wait(ANIM.cut * .6);
        for (const c of l.cuts) base[c.seat][c.token] = { s: "base", r: 0, l: 0 };
        setDisp(copyTokens(base)); setHits([]);
        await wait(ANIM.cut * .4);
      } else {
        /* the duel: the two tokens step apart, the attacker winds up and strikes (sentries thrust their spear),
           the captured token is knocked flying off the square, then drops back into its yard */
        setDuel({ atk: `${l.seat}-${l.token}`, vic }); sDuel(shownSetRef.current);
        try { navigator.vibrate?.([0, 380, 40]); } catch { /* not supported */ }
        await wait(1050);
        for (const c of l.cuts) base[c.seat][c.token] = { s: "base", r: 0, l: 0 };
        setDuel(null); setDisp(copyTokens(base)); setHits(vic.map(v => v + "!back"));
        await wait(420); setHits([]);
      }
    }
    if (l.home) { sHome(); const id = Date.now(); setHomeFx(id); window.setTimeout(() => setHomeFx(v => (v === id ? 0 : v)), 900); await wait(ANIM.home); }
    if (l.finished) {
      const place = t.ranks.indexOf(l.seat), who = t.names[l.seat];
      sPlace(place);
      if (place <= 2) setCele({ id: Date.now(), place, color: t.colors[l.seat], name: who });     // 1st: the Ambari procession
      else celebrate(false);
    }
  };
  useEffect(() => {
    if (!table || sub !== "table") return;
    const l = table.last;
    if (animatedN.current === null || !l || l.n < animatedN.current || l.n > animatedN.current + 1) {   // fresh table, resumed game, new game
      animatedN.current = l?.n ?? 0; settle();
      if (l?.kind === "roll") setLastDie({ [l.seat]: l.value });
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

  /* Each finished game is reported once. When you finished 1st in a room against a real player, the room server
     adds the win to your account: read the new count and announce any token sets it unlocks on the finish screen. */
  const counted = useRef(false);
  useEffect(() => {
    if (!t) return;
    if (t.stage !== "gameEnd") { counted.current = false; return; }
    if (!showEnd || counted.current) return;
    counted.current = true;
    if (t.mode === "online" && t.you == null) return;
    const won = t.mode !== "pass" && t.ranks[0] === (t.mode === "online" ? t.you : 0);
    reportGame("ludo", t.mode === "pass" ? "done" : won ? "win" : "lose");
    if (t.mode === "online" && won && view?.winCounts) {
      const before = realWins.wins;
      setWinCounted(true);
      window.setTimeout(() => {          // give the room server a moment to save the win
        void realWins.refresh().then(after => {
          if (after == null) return;
          setUnlockedNow(TOKEN_SETS.filter(x => !isUnlocked(x.id, before) && isUnlocked(x.id, after)).map(x => x.name));
        });
      }, 1500);
    }
  }, [showEnd, t?.stage]);
  useEffect(() => { if (t && t.stage !== "gameEnd") { setUnlockedNow([]); setWinCounted(false); } }, [t?.stage]);

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
  /* First game on this device: a few tips pointing at the dice and the board. */
  useEffect(() => {
    if (sub !== "table" || !canRoll || !t || t.mode === "online") return;
    const id = window.setTimeout(() => void coach("ludo", [
      { title: "Your dice", text: "Tap your dice to roll. You need a <b>6</b> to bring a token out of your yard.", target: ".ld-sdie.ready" },
      { title: "Moving", text: "Tokens that can move <b>glow</b>, and a marker shows where each would land: ★ safe, ✓ cut, ! risky, ♛ home. Tap a token or its marker.", target: ".ld-board", pad: 2 },
      { title: "Cut and stay safe", text: "Land on an opponent to send them back to their yard. Starred squares and start squares are safe. A 6, a cut or reaching home gives another roll.", target: ".ld-board", pad: 2 },
    ]), 700);
    return () => window.clearTimeout(id);
  }, [sub, canRoll]);
  useEffect(() => {
    const back = () => { if (!document.hidden) document.title = baseTitle.current; };
    document.addEventListener("visibilitychange", back);
    return () => { document.removeEventListener("visibilitychange", back); document.title = baseTitle.current; };
  }, []);

  /* ---------- screens ---------- */
  const pending: LudoSave | null = local && local.phase !== "gameEnd" ? { game: local, mode: localMode, names: localNames, level: gameLevel } : saved;
  if (sub === "lobby" || (sub === "room" && !view)) return <PlayStart className="ld-mode" game="Ludo" tagline="Race your four tokens home. Cut, block and roll sixes."
    art={<LudoArt />} meta="2–4 players · about 15 min" passStart={() => startLocal("pass")}
    onBack={onHome}
    vsComputer={{ count: bots, options: [1, 2, 3], onCount: setBots, onPlay: () => startLocal("practice"), level: { value: level, onLevel: setLevel } }}
    friends={{ onCreate: createRoom, code: roomCode, onCode: setRoomCode, pass: roomPass, onPass: setRoomPass, onJoin: joinRoom, busy: net === "connecting" }}
    msg={roomMsg}
    extra={view ? <div className="rs-panel"><h2>Your room</h2><p className="rs-note">You are in room {view.code}.</p><button className="gold-button rs-wide" onClick={() => setSub("room")}>Return to the room →</button></div>
      : pending ? <div className="rs-panel ld-continue"><h2>Continue your game</h2>
        <p className="rs-note">{pending.mode === "pass" ? `Pass & play: ${pending.names.join(", ")}` : `You vs ${pending.names.length - 1} computer player${pending.names.length > 2 ? "s" : ""}`}. Saved on this phone.</p>
        <button className="gold-button rs-wide" onClick={() => resumeLocal(pending)}>Continue →</button></div> : undefined}
    passPlay={<>
      <div className="rs-panel ld-pass">
        <h2>Pass &amp; play</h2>
        <p className="rs-note">Or play 2 to 4 friends on this one phone.</p>
        <div className="rs-chips" role="group" aria-label="Players">{[2, 3, 4].map(n => <button key={n} type="button" className={passCount === n ? "on" : ""} aria-pressed={passCount === n} onClick={() => setPassCount(n)}>{n}</button>)}</div>
        <div className="ld-names">{passNames.slice(0, passCount).map((n, i) => {
          const c = (passCount === 2 ? ["red", "yellow"] : passCount === 3 ? ["red", "green", "yellow"] : COLORS)[i] as Color;
          return <label key={i}><span className={`ld-dot ld-bg-${c}`} />{COLOR_NAME[c]}<input id={`ld-name-${i}`} value={n} maxLength={14} onChange={e => setPassNames(v => v.map((x, j) => (j === i ? e.target.value : x)))} /></label>;
        })}</div>
        <button className="ghost-button rs-wide" onClick={() => startLocal("pass")}>Start Game</button>
      </div>
    </>}
    after={<details className="ld-style-box rs-panel"><summary>Board, token and dice style</summary><PieceDefs /><StylePicker tokens={shownSet} dice={dice} theme={theme} wins={realWins.wins} signedIn={realWins.signedIn} onTokens={chooseTokens} onDice={chooseDice} onTheme={chooseTheme} /></details>}
    rules={<ul><li>A 6 brings a token out.</li><li>A 6, a cut or reaching home rolls again; three 6s in a row end the turn.</li><li>Starred and start squares are safe. You need the exact roll to finish.</li></ul>} />;

  if (sub === "room" && view) {
    const inLobby = view.phase === "lobby";
    return <WaitingRoom className="ld-mode" game="Ludo" onBack={() => setSub("lobby")}
      code={view.code} passcode={view.passcode}
      invite={inviteText("Ludo", "ludo", view.code, view.passcode)}
      seats={view.seats} you={view.you} hostSeat={view.hostSeat} isHost={view.host}
      onAddBot={() => send({ t: "addBot" })} onRemoveBot={() => send({ t: "removeBot" })} onStart={() => send({ t: "start" })}
      blocked={!inLobby ? <button className="gold-button rs-wide" onClick={() => setSub("table")}>Return to the board →</button> : undefined}
      msg={roomMsg} onMsg={setRoomMsg} onLeave={leaveRoom}
      note={inLobby ? "Colours are given when the game starts; two players sit on opposite corners. The host can fill empty seats with computer players." : "If you leave, the game plays for you. You can rejoin from this device with the same code and passcode."} />;
  }

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
  const seatAt = (ci: number) => { const c = COLORS[(ci - k + 8) % 4]; return { color: c, seat: t.order.find(s => t.colors[s] === c) ?? null }; };
  const seatCard = (ci: number) => {
    const { color, seat } = seatAt(ci);
    if (seat == null) return <div key={ci} className="ld-seat off" style={{ "--c": `var(--ld-${color})` } as CSSProperties}>
      <span className="ld-seat-chip" /><div className="ld-seat-txt"><strong>Empty seat</strong><small>{COLOR_NAME[color]}</small></div>
    </div>;
    const turn = t.stage !== "gameEnd" && (rollingSeat ?? t.turn) === seat, mine = canRoll && seat === t.turn;
    const rank = t.ranks.indexOf(seat), homeN = homeCount(seat);
    const who = t.names[seat] === "You" ? "You" : t.bots[seat] ? "CPU" : t.away[seat] ? "Away" : "Player";
    return <div key={ci} className={`ld-seat${turn ? " turn" : ""}${t.away[seat] ? " away" : ""}`} style={{ "--c": `var(--ld-${color})` } as CSSProperties}>
      <span className="ld-seat-chip" />
      <div className="ld-seat-txt">
        <strong>{label(t.names[seat])}</strong>
        <small>{who === "You" ? COLOR_NAME[color] : <><span className="ld-cn">{COLOR_NAME[color]} · </span>{who}</>}</small>
        <span className="ld-seat-home" aria-label={`${homeN} of 4 tokens home`}>
          {[0, 1, 2, 3].map(i => <b key={i} className={i < homeN ? "on" : ""} />)}
          <em>{rank >= 0 ? ORD[rank] : `${homeN}/4`}</em>
        </span>
      </div>
      {/* each player's die: yours glows on your turn and is the roll button (or press Space / Enter) */}
      <button type="button" ref={el => { dieEls.current[seat] = el; }} className={`ld-sdie d-${dice}${mine ? " ready" : ""}${turn ? " live" : ""}`}
        disabled={!mine} onClick={doRoll} aria-label={mine ? "Roll the dice" : `${t.names[seat]}'s dice${lastDie[seat] ? `, showing ${lastDie[seat]}` : ""}`}>
        <span className="ld-face"><Face v={lastDie[seat] ?? 0} /></span>
      </button>
      {turn && ready && seat === t.turn && <span className="ld-seat-timer"><TurnTimer secs={secsLeft} small /></span>}
    </div>;
  };
  const turnName = t.names[t.turn];
  const hint = t.stage === "gameEnd" ? "Game over"
    : canRoll ? (t.mode === "pass" ? `${turnName}: tap the dice` : t.sixes > 0 ? "Tap the dice to roll again" : "Tap the dice to roll")
    : holdsTurn && t.stage === "move" && !animating ? "Tap a glowing token" : animating ? "Moving…" : `${turnName}'s turn`;
  return <section className="ld-screen">
    <PieceDefs />
    <GameBar game="Ludo" where={online && view ? `Room ${view.code}` : t.mode === "pass" ? "Pass & Play" : "Practice"} onBack={() => setSub(online ? "room" : "lobby")} backLabel={online ? "Back to the room" : "Back to the lobby"} className="ld-bar">
      <IconButton label={sound ? "Sound on" : "Sound off"} pressed={sound} onClick={() => { const v = !sound; setSound(v); try { window.localStorage.setItem("rc-ludo-sound", v ? "on" : "off"); } catch { /* ignore */ } }}><SoundIcon on={sound} /></IconButton>
      <IconButton label="Board style" expanded={sheet === "style"} onClick={() => setSheet(sheet === "style" ? "none" : "style")}><PaletteIcon /></IconButton>
      <IconButton label="Rules" expanded={sheet === "rules"} onClick={() => setSheet(sheet === "rules" ? "none" : "rules")}><RulesIcon /></IconButton>
    </GameBar>
    <div className="ld-main">
      <div className="ld-seats top">{seatCard(0)}{seatCard(1)}</div>
      <div className="ld-stage">
        <div className={`ld-board-wrap ld-theme-${theme}`}>
          <div className={`ld-board ld-set-${shownSet}`} style={{ "--rot": `${rot}deg` } as CSSProperties}>
            <BoardArt />
            <div className="ld-centre" aria-hidden="true"><img src={ambaroMedallion} alt="" draggable={false} /></div>
            <div className="ld-tokens">
              {t.order.flatMap(s => [0, 1, 2, 3].map(i => {
                const p = place[`${s}-${i}`]; if (!p) return null;
                const id = `${s}-${i}`, mv = canMove(s, i);
                return <button key={id} type="button" className={`ld-token${mv ? " movable" : ""}${moving === id ? " moving" : ""}${hits.includes(id) ? " hit" : ""}${hits.includes(id + "!back") ? " back" : ""}${duel?.atk === id ? " duel-atk" : ""}${duel?.vic.includes(id) ? " duel-vic" : ""}`}
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
          <div className="ld-fx">{bubbles.map(b => { const [x, y] = corner(b.seat); return <div key={b.id} className={`ld-bubble ld-bd-${t.colors[b.seat]}`} style={{ left: `${x}%`, top: `${y}%` }}><small>{label(t.names[b.seat])}</small>{b.text}</div>; })}</div>
          {showEnd && <div className="ld-win">
            <span className="eyebrow">ROYAL CLUB · LUDO</span>
            <h2>{t.ranks[0] === t.you ? "You take the crown!" : `${t.names[t.ranks[0]]} wins`}</h2>
            <ol className="ld-podium">{t.ranks.map((s, i) => <li key={s}><b>{ORD[i]}</b><span className={`ld-dot ld-bg-${t.colors[s]}`} />{label(t.names[s])}</li>)}</ol>
            {unlockedNow.length > 0 ? <p className="ld-unlocked">🔓 New tokens unlocked: <b>{unlockedNow.join(", ")}</b>. Try them from Style.</p>
              : winCounted && <p className="ld-unlocked">🏆 This win counts toward new tokens · {realWins.wins} room win{realWins.wins === 1 ? "" : "s"} so far.</p>}
            <div className="ld-win-actions">
              {online ? (view?.host ? <button className="gold-button" onClick={() => send({ t: "again" })}>Rematch</button> : <p className="ld-small">Waiting for the host to start a new game.</p>)
                : <button className="gold-button" onClick={() => startLocal(t.mode === "pass" ? "pass" : "practice")}>Rematch</button>}
              <button className="ghost-button" onClick={() => (online ? leaveRoom() : setSub("lobby"))}>{online ? "Leave room" : "Back to lobby"}</button>
            </div>
          </div>}
        </div>
      </div>
      <div className="ld-seats bottom">{seatCard(3)}{seatCard(2)}</div>
      <div className="ld-status">
        <span className={`ld-hint${canRoll ? " ready" : ""}`}>{hint}</span>
        <p className="ld-msg" aria-live="polite">{msg}</p>
      </div>
      <div className="ld-reacts" aria-label="Quick messages">{PHRASES.map((p, i) => <button key={i} onClick={() => react(i)}>{p}</button>)}</div>
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
      <StylePicker tokens={shownSet} dice={dice} theme={theme} wins={realWins.wins} signedIn={realWins.signedIn} onTokens={chooseTokens} onDice={chooseDice} onTheme={chooseTheme} />
      <label className="ld-motion"><input type="checkbox" checked={lessMotion} onChange={e => { setReduced(e.target.checked); setLessMotion(e.target.checked); }} /> Reduce animations <small>(shorter moves, no capture duel)</small></label>
      <p className="ld-small">Your choice is saved on this device. In a room, everyone sees their own style.</p>
      <button className="gold-button" onClick={() => setSheet("none")}>Done</button>
    </div>}
    {cele && <Celebration key={cele.id} place={cele.place} color={cele.color} name={label(cele.name)} onDone={() => setCele(c => (c && c.id === cele.id ? null : c))} />}
  </section>;
}
