import { useState, type FormEvent, type ReactNode } from "react";
import { isListed, type GameId } from "../domain/game";
import "./home.css";
import { pageHref } from "../lib/native";

/* Royal Club home ("FINAL" design): mood shortcuts, a featured EKAH tile, full-art game tiles,
   resume card, a room-code box and the free-to-play promise. All artwork is original. */

type Mood = "friends" | "quick" | "classics" | "computer";
type RoomGame = "ekah" | "ludo" | "snakes" | "sudoku";

interface Tile { id: GameId; name: string; sub: string; moods: Mood[] }

const TILES: Tile[] = [
  { id: "ekah", name: "EKAH", sub: "Our own card game · Agni · Vayu · Prithvi · Jal", moods: ["friends", "quick", "computer"] },
  { id: "ludo", name: "Ludo", sub: "2–4 players · computer, one phone or a room", moods: ["friends", "classics", "computer"] },
  { id: "snakes", name: "Snakes & Ladders", sub: "Race to 100 · roll a six to start", moods: ["friends", "quick", "classics", "computer"] },
  { id: "chess", name: "Chess", sub: "A friend on one phone, or the computer", moods: ["classics", "computer"] },
  { id: "sudoku", name: "Sudoku", sub: "Daily puzzle · race your friends", moods: ["friends", "quick", "classics", "computer"] },
];

const MOODS: { id: Mood; label: string; note: string }[] = [
  { id: "friends", label: "With friends", note: "Rooms with a code" },
  { id: "quick", label: "Quick game", note: "Done in a few minutes" },
  { id: "classics", label: "Classics", note: "Ludo, Chess, Sudoku & more" },
  { id: "computer", label: "vs Computer", note: "Practise any time" },
];

/* Each game remembers this device's live room under its own key; finding one means there is a game to go back to. */
const RESUME: { id: RoomGame; key: string; name: string }[] = [
  { id: "ekah", key: "rc-room-ekah", name: "EKAH" },
  { id: "ludo", key: "rc-ludo-room", name: "Ludo" },
  { id: "snakes", key: "rc-snakes-room", name: "Snakes & Ladders" },
  { id: "sudoku", key: "rc-room-sudoku", name: "Sudoku race" },
];
function findResume(): { id: RoomGame; name: string; code: string } | null {
  for (const r of RESUME) {
    try {
      const v = window.localStorage.getItem(r.key);
      if (v && /^[A-Za-z]{4}$/.test(v) && isListed(r.id)) return { id: r.id, name: r.name, code: v.toUpperCase() };
    } catch { return null; }
  }
  return null;
}

const Crown = ({ size = 22, fill = "#D9B45A" }: { size?: number; fill?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5l4.2 3.6L12 4.5l4.8 7.6L21 8.5l-1.8 9.5H4.8z" fill={fill} /><rect x="4.6" y="19" width="14.8" height="2" rx="1" fill={fill} /></svg>
);

const MoodIcon = ({ mood }: { mood: Mood }) => {
  const p = { width: 30, height: 30, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (mood === "friends") return <svg {...p}><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M15.5 14.6c2.6.1 4.6 1.9 5.2 4.9" /></svg>;
  if (mood === "quick") return <svg {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></svg>;
  if (mood === "classics") return <svg {...p}><path d="M3 8.5l4.2 3.6L12 4.5l4.8 7.6L21 8.5l-1.8 9.5H4.8z" /></svg>;
  return <svg {...p}><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 7V4M9 12h.01M15 12h.01M9 16h6" /></svg>;
};

/* ---------- original game art ---------- */
const EkahArt = () => (
  <svg viewBox="0 0 520 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><radialGradient id="rcEkahBg" cx="50%" cy="40%" r="70%"><stop offset="0" stopColor="#1F7457" /><stop offset=".6" stopColor="#0F4D3A" /><stop offset="1" stopColor="#062A20" /></radialGradient></defs>
    <rect width="520" height="520" fill="url(#rcEkahBg)" />
    <g fill="none" stroke="#D9B45A" strokeOpacity=".14" strokeWidth="1.2"><circle cx="260" cy="210" r="220" /><circle cx="260" cy="210" r="160" /><circle cx="260" cy="210" r="100" /></g>
    <g transform="translate(260 330) scale(1.55)">
      <g transform="rotate(-30)"><rect x="-36" y="-150" width="72" height="108" rx="10" fill="#FBF7EE" stroke="#D9B45A" strokeWidth="2" /><rect x="-30" y="-144" width="60" height="96" rx="7" fill="#E25A3C" /><path d="M0 -122c8 10 12 16 12 24a12 12 0 0 1-24 0c0-5 3-9 6-12 0 5 2 8 5 8-2-6-1-13 1-20z" fill="#FBF7EE" /></g>
      <g transform="rotate(-10)"><rect x="-36" y="-156" width="72" height="108" rx="10" fill="#FBF7EE" stroke="#D9B45A" strokeWidth="2" /><rect x="-30" y="-150" width="60" height="96" rx="7" fill="#5BAFD6" /><path d="M-16 -112c10-8 26-4 26 6 0 8-12 10-16 4M-14 -96c12-6 28-2 26 8" fill="none" stroke="#FBF7EE" strokeWidth="4" strokeLinecap="round" /></g>
      <g transform="rotate(10)"><rect x="-36" y="-156" width="72" height="108" rx="10" fill="#FBF7EE" stroke="#D9B45A" strokeWidth="2" /><rect x="-30" y="-150" width="60" height="96" rx="7" fill="#3E9A5C" /><path d="M-18 -86l18-34 18 34z" fill="#FBF7EE" /><path d="M-6 -86l10-18 10 18z" fill="#3E9A5C" /></g>
      <g transform="rotate(30)"><rect x="-36" y="-150" width="72" height="108" rx="10" fill="#FBF7EE" stroke="#D9B45A" strokeWidth="2" /><rect x="-30" y="-144" width="60" height="96" rx="7" fill="#2F64C2" /><path d="M0 -122c10 13 15 21 15 28a15 15 0 0 1-30 0c0-7 5-15 15-28z" fill="#FBF7EE" /></g>
    </g>
  </svg>
);

const LudoArt = ({ mini = false }: { mini?: boolean }) => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="100" height="100" fill="#F6EEDC" />
    <rect x="4" y="4" width="38" height="38" rx="5" fill="#D9473A" /><rect x="58" y="4" width="38" height="38" rx="5" fill="#2E9B5F" />
    <rect x="4" y="58" width="38" height="38" rx="5" fill="#2F6FC9" /><rect x="58" y="58" width="38" height="38" rx="5" fill="#E9B53A" />
    {!mini && <>
      <g fill="#FBF7EE"><rect x="11" y="11" width="24" height="24" rx="4" /><rect x="65" y="11" width="24" height="24" rx="4" /><rect x="11" y="65" width="24" height="24" rx="4" /><rect x="65" y="65" width="24" height="24" rx="4" /></g>
      <g fill="#D9473A"><circle cx="18" cy="18" r="3.4" /><circle cx="28" cy="28" r="3.4" /></g>
      <g fill="#2E9B5F"><circle cx="72" cy="18" r="3.4" /><circle cx="82" cy="28" r="3.4" /></g>
      <g fill="#2F6FC9"><circle cx="18" cy="72" r="3.4" /><circle cx="28" cy="82" r="3.4" /></g>
      <g fill="#E9B53A"><circle cx="72" cy="72" r="3.4" /><circle cx="82" cy="82" r="3.4" /></g>
    </>}
    <polygon points="42,42 58,42 50,50" fill="#2E9B5F" /><polygon points="58,42 58,58 50,50" fill="#E9B53A" />
    <polygon points="42,58 58,58 50,50" fill="#2F6FC9" /><polygon points="42,42 42,58 50,50" fill="#D9473A" />
  </svg>
);

const CHECKS = [0, 1, 2, 3, 4].flatMap(r => [0, 1, 2, 3, 4].filter(c => (r + c) % 2 === 0).map(c => [c * 20, r * 20]));

const SnakesArt = () => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="100" height="100" fill="#C99A5B" />
    <g fill="#E8CFA0">{CHECKS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="20" height="20" />)}</g>
    <g stroke="#7A5A1C" strokeWidth="2.6" strokeLinecap="round"><path d="M18 92 L42 18 M30 96 L54 22" /><path d="M21 82 L33 86 M25 70 L37 74 M29 58 L41 62 M33 46 L45 50 M37 34 L49 38" strokeWidth="2" /></g>
    <path d="M80 14 C62 20 64 36 76 42 C88 48 86 62 72 66 C60 70 60 80 68 88" fill="none" stroke="#2E7D4F" strokeWidth="7" strokeLinecap="round" />
    <path d="M80 14 C62 20 64 36 76 42 C88 48 86 62 72 66 C60 70 60 80 68 88" fill="none" stroke="#9BD07A" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
    <circle cx="81" cy="13" r="5.5" fill="#2E7D4F" /><circle cx="83" cy="11.5" r="1.2" fill="#FBF7EE" />
  </svg>
);

const ChessArt = () => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="100" height="100" fill="#0F4D3A" />
    <g fill="#1D6A50">{CHECKS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="20" height="20" />)}</g>
    <g transform="translate(22 4) scale(1.5)">
      <path d="M13.5 35h19c.6-7.5-.7-13-3.3-17.2-1.6-2.6-1.9-5.4-1.2-8.6-2.9.6-5 1.9-6.4 3.8L20 9.5l-1.6 5c-4.3 2.4-7.4 6.5-8.6 11-.5 1.8.6 3.5 2.4 3.6 2 .1 3.6-.7 5.2-2.1.8-.7 2-.6 2.6.3.5.8.3 1.7-.4 2.4-2.5 2.2-4.6 3.7-6.1 5.3z" fill="#F0D99D" stroke="#B98F45" strokeWidth=".8" />
      <path d="M11 39.5h23v-2.3a2.2 2.2 0 0 0-2.2-2.2H13.2a2.2 2.2 0 0 0-2.2 2.2z" fill="#F0D99D" stroke="#B98F45" strokeWidth=".8" />
    </g>
  </svg>
);

/* Sudoku: an ivory grid with emerald box lines and a few gold and saffron numbers. */
const SUDOKU_DIGITS: [number, number, string, string][] = [[0, 0, "5", "#0F4D3A"], [1, 1, "3", "#7A5A1C"], [2, 0, "7", "#0F4D3A"], [4, 1, "9", "#0F4D3A"], [3, 2, "1", "#F28C28"], [5, 2, "4", "#0F4D3A"], [6, 3, "8", "#7A5A1C"], [8, 3, "2", "#0F4D3A"], [7, 4, "6", "#0F4D3A"], [0, 4, "9", "#7A5A1C"], [2, 5, "4", "#0F4D3A"], [4, 5, "7", "#F28C28"], [1, 6, "8", "#0F4D3A"], [6, 6, "3", "#0F4D3A"], [3, 7, "5", "#7A5A1C"], [8, 7, "1", "#0F4D3A"], [5, 8, "2", "#0F4D3A"], [7, 8, "9", "#7A5A1C"]];
const SudokuArt = () => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="100" height="100" fill="#EAD9B0" />
    <g fill="none" stroke="#B8892E" strokeOpacity=".22" strokeWidth=".6">{[0, 1, 2, 3, 4].map(k => <circle key={k} cx="50" cy="36" r={34 + k * 12} />)}</g>
    <g transform="translate(23 9) scale(.54)">
      <rect x="0" y="0" width="100" height="100" rx="5" fill="#FFFFFF" />
      <rect x="33.3" y="33.3" width="33.4" height="33.4" fill="#F3E6C4" />
      <rect x="44.4" y="55.6" width="11.1" height="11.1" fill="#FFD9B0" />
      <g stroke="#E2D7BD" strokeWidth=".8">{[1, 2, 4, 5, 7, 8].map(k => <path key={k} d={`M${k * 11.11} 0V100M0 ${k * 11.11}H100`} />)}</g>
      <g stroke="#0F4D3A" strokeWidth="2" fill="none"><path d="M33.33 0V100M66.67 0V100M0 33.33H100M0 66.67H100" /><rect x="0" y="0" width="100" height="100" rx="5" strokeWidth="3" /></g>
      <g fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="8.4" textAnchor="middle">{SUDOKU_DIGITS.map(([c, r, d, f]) => <text key={`${c}-${r}`} x={5.55 + c * 11.11} y={8.6 + r * 11.11} fill={f}>{d}</text>)}</g>
    </g>
  </svg>
);

const ART: Partial<Record<GameId, () => ReactNode>> = { ludo: () => <LudoArt />, snakes: () => <SnakesArt />, chess: () => <ChessArt />, sudoku: () => <SudokuArt /> };

export interface HomeProps {
  onOpen: (id: GameId) => void;
  onJoin: (id: "ludo" | "snakes", code: string) => void;
}

export default function Home({ onOpen, onJoin }: HomeProps) {
  const [mood, setMood] = useState<Mood | null>(null);
  const [resume] = useState(findResume);
  const [code, setCode] = useState("");
  const [joinGame, setJoinGame] = useState<RoomGame>("ekah");
  const [err, setErr] = useState("");

  const listed = TILES.filter(t => isListed(t.id));
  const shown = listed.filter(t => !mood || t.moods.includes(mood));
  const featured = shown.find(t => t.id === "ekah");
  const others = shown.filter(t => t.id !== "ekah");
  const roomGames = RESUME.filter(r => isListed(r.id));

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) { setErr("Enter the 4-letter room code."); return; }
    setErr("");
    if (joinGame === "ekah" || joinGame === "sudoku") { window.location.href = pageHref(`/${joinGame}/?room=${c}`); return; }
    onJoin(joinGame, c);
  };
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="rc-home" id="rc-top">
      <nav className="rc-moods" aria-label="Choose by mood">
        {MOODS.map(m => (
          <button key={m.id} type="button" className={`rc-mood rc-mood-${m.id}${mood === m.id ? " on" : ""}`} aria-pressed={mood === m.id}
            onClick={() => { setMood(mood === m.id ? null : m.id); scrollTo("rc-games"); }}>
            <MoodIcon mood={m.id} />
            <span><strong>{m.label}</strong><small>{m.note}</small></span>
          </button>
        ))}
      </nav>

      {resume && (
        <section className="rc-resume" aria-label="Continue playing">
          <span className="rc-resume-art">{resume.id === "ludo" ? <LudoArt mini /> : resume.id === "snakes" ? <SnakesArt /> : resume.id === "sudoku" ? <SudokuArt /> : <span className="rc-resume-ekah"><Crown size={24} /></span>}</span>
          <span className="rc-resume-text"><small>CONTINUE PLAYING</small><strong>{resume.name} · room {resume.code}</strong></span>
          <button type="button" className="rc-saffron rc-pill" onClick={() => onOpen(resume.id)}>Resume</button>
        </section>
      )}

      <section id="rc-games" className="rc-games" aria-labelledby="rc-games-title">
        <div className="rc-head">
          <h2 id="rc-games-title">{mood ? MOODS.find(m => m.id === mood)?.label : "All games"}</h2>
          {mood ? <button type="button" className="rc-clear" onClick={() => setMood(null)}>Show all games</button> : <small>FREE · NO REAL MONEY</small>}
        </div>
        <div className="rc-grid">
          {featured && (
            <a href={pageHref("/ekah/")} className="rc-tile rc-tile-ekah" onClick={e => { e.preventDefault(); onOpen("ekah"); }}>
              <span className="rc-art"><EkahArt /></span>
              <span className="rc-feature">
                <span className="rc-feature-text"><span className="rc-badge">NEW · FEATURED</span><strong>EKAH</strong><span>{featured.sub}</span></span>
                <span className="rc-saffron rc-cta">Play now</span>
              </span>
            </a>
          )}
          {others.map(t => (
            <button key={t.id} type="button" className={`rc-tile rc-tile-${t.id}`} onClick={() => onOpen(t.id)}>
              <span className="rc-art">{ART[t.id]?.()}</span>
              <span className="rc-label"><strong>{t.name}</strong><span>{t.sub}</span><span className="rc-play">Play →</span></span>
            </button>
          ))}
          {!mood && (
            <div className="rc-tile rc-soon">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#7A5A1C" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              <span><strong>Coming soon</strong><small>Spades · Business · more</small></span>
            </div>
          )}
        </div>
      </section>

      <section id="rc-friends" className="rc-friends" aria-labelledby="rc-friends-title">
        <div className="rc-card rc-join">
          <h2 id="rc-friends-title">Play with friends</h2>
          <form onSubmit={join} noValidate>
            <fieldset className="rc-join-games">
              <legend>Which game?</legend>
              {roomGames.map(g => (
                <button key={g.id} type="button" className={joinGame === g.id ? "on" : ""} aria-pressed={joinGame === g.id} onClick={() => setJoinGame(g.id)}>{g.name}</button>
              ))}
            </fieldset>
            <div className="rc-join-row">
              <label htmlFor="rc-code" className="rc-sr">Room code</label>
              <input id="rc-code" value={code} maxLength={4} autoComplete="off" autoCapitalize="characters" placeholder="Room code (4 letters)"
                onChange={e => setCode(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())} />
              <button type="submit" className="rc-emerald">Join</button>
            </div>
            {err && <p className="rc-err" role="alert">{err}</p>}
            <p className="rc-note">You'll enter the passcode from your friend on the next screen.</p>
          </form>
          <ol className="rc-steps">
            <li><span>1</span>Pick a game</li>
            <li><span>2</span>Share the code on WhatsApp</li>
            <li><span>3</span>Play together</li>
          </ol>
        </div>
        <div className="rc-card rc-promise">
          <span className="rc-promise-mark"><Crown size={30} fill="#0F4D3A" /></span>
          <span><strong>Free to play. Always.</strong><small>No real money, no betting, no deposits. Royal Club for Android is coming soon.</small></span>
        </div>
      </section>

      <nav className="rc-bottom" aria-label="Quick links">
        <button type="button" onClick={() => scrollTo("rc-top")}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>Home</button>
        <button type="button" onClick={() => { setMood(null); scrollTo("rc-games"); }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>Games</button>
        <button type="button" onClick={() => scrollTo("rc-friends")}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M15.5 14.6c2.6.1 4.6 1.9 5.2 4.9" /></svg>Friends</button>
      </nav>
    </div>
  );
}

export { Crown };
