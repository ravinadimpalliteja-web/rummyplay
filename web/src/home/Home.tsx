import { useState, type FormEvent, type ReactNode } from "react";
import { isListed, type GameId } from "../domain/game";
import "./home.css";
import { pageHref } from "../lib/native";
import { SAVE_KEYS, chessInProgress, hasSavedGame, sudokuInProgress } from "../lib/localSave";
import elephantMark from "../brand/badge-logo-small.webp";
import { GameArtDefs, EkahArt, LudoArt, SnakesArt, ChessArt, SudokuArt } from "./GameArt";

/* Royal Club home ("FINAL" design): mood shortcuts, a featured EKAH tile, full-art game tiles,
   resume card, a room-code box and the free-to-play promise. All artwork is original. */

type Mood = "friends" | "quick" | "classics" | "computer";
export type RoomGame = "ekah" | "ludo" | "snakes" | "sudoku";

interface Tile { id: GameId; name: string; sub: string; moods: Mood[] }

export const TILES: Tile[] = [
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
export const RESUME: { id: RoomGame; key: string; name: string }[] = [
  { id: "ekah", key: "rc-room-ekah", name: "EKAH" },
  { id: "ludo", key: "rc-ludo-room", name: "Ludo" },
  { id: "snakes", key: "rc-snakes-room", name: "Snakes & Ladders" },
  { id: "sudoku", key: "rc-room-sudoku", name: "Sudoku race" },
];
/* Games on this device (vs computer, pass & play, solo Sudoku) are saved as they go; a live room comes first. */
const LOCAL_RESUME: { id: GameId; name: string; has: () => boolean }[] = [
  { id: "ludo", name: "Ludo", has: () => hasSavedGame(SAVE_KEYS.ludo) },
  { id: "ekah", name: "EKAH", has: () => hasSavedGame(SAVE_KEYS.ekah) },
  { id: "snakes", name: "Snakes & Ladders", has: () => hasSavedGame(SAVE_KEYS.snakes) },
  { id: "chess", name: "Chess", has: chessInProgress },
  { id: "sudoku", name: "Sudoku", has: sudokuInProgress },
];
export function findResume(): { id: GameId; name: string; code: string } | null {
  for (const r of RESUME) {
    try {
      const v = window.localStorage.getItem(r.key);
      if (v && /^[A-Za-z]{4}$/.test(v) && isListed(r.id)) return { id: r.id, name: r.name, code: v.toUpperCase() };
    } catch { return null; }
  }
  for (const r of LOCAL_RESUME) if (isListed(r.id) && r.has()) return { id: r.id, name: r.name, code: "" };
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
      <GameArtDefs />
      <div className="rc-watermark" aria-hidden="true" />
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
          <span className="rc-resume-art">{resume.id === "ludo" ? <LudoArt /> : resume.id === "snakes" ? <SnakesArt /> : resume.id === "sudoku" ? <SudokuArt /> : resume.id === "chess" ? <ChessArt /> : <EkahArt />}</span>
          <span className="rc-resume-text"><small>CONTINUE PLAYING</small><strong>{resume.name} · {resume.code ? `room ${resume.code}` : "saved game"}</strong></span>
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
          <span className="rc-promise-mark"><img src={elephantMark} alt="" width={320} height={224} /></span>
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
