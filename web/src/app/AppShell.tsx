import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { App as NativeApp } from "@capacitor/app";
import { isListed, type GameId } from "../domain/game";
import { pageHref } from "../lib/native";
import { motionReduced, setMotionReduced } from "../lib/motion";
import { SAVE_KEYS, chessInProgress, hasSavedGame, sudokuInProgress } from "../lib/localSave";
import { useAccount } from "../auth/account";
import { GameArtDefs, EkahArt, LudoArt, SnakesArt, ChessArt, SudokuArt, WordArt } from "../home/GameArt";
import { TILES, RESUME, findResume, type RoomGame } from "../home/Home";
import * as R from "../economy/rules";
import { claimChest, claimDaily, claimMission, collectGames, refreshDay, unlockLook, useWallet, useWalletReady, type Earned } from "../economy/wallet";
import { BGS, isCream, setBg, shellVars, useBg } from "./theme";
import Glider from "./Glider";
import "./app-shell.css";

/* The Android app's own layout, "Royal Durbar" (design: Royal Club app — screen designs, page "Final choice"):
   a player bar (level, XP, coins, settings), the Game Stage home (swipe the big game card or tap a medallion),
   a bottom bar with a raised PLAY button, Rewards (daily calendar, free chest, missions, looks), Profile and
   Settings. Phones: bottom bar. Tablets (840px+): side rail. Only used inside the app; the website keeps its own
   home page, and the games open full screen outside this shell. Name and logo are placeholders until final. */

export type AppTab = "home" | "games" | "friends" | "learn" | "profile" | "settings";

const ART: Record<GameId, () => ReactNode> = {
  ekah: () => <EkahArt />, ludo: () => <LudoArt />, snakes: () => <SnakesArt />, chess: () => <ChessArt />, sudoku: () => <SudokuArt />, words: () => <WordArt />,
  spades: () => <EkahArt />, rummy: () => <EkahArt />,
};
const PLAYERS: Partial<Record<GameId, string>> = { ekah: "2–6 players", ludo: "2–4 players", snakes: "2–4 players", chess: "2 players", sudoku: "Solo or race", words: "300 levels" };
const SOLO: Partial<Record<GameId, string>> = { sudoku: "Play solo", chess: "vs Computer", words: "Play" };
const SAVED: Partial<Record<GameId, () => boolean>> = {
  ludo: () => hasSavedGame(SAVE_KEYS.ludo), ekah: () => hasSavedGame(SAVE_KEYS.ekah), snakes: () => hasSavedGame(SAVE_KEYS.snakes),
  chess: chessInProgress, sudoku: sudokuInProgress,
};
const fmtCoins = (n: number) => n.toLocaleString("en-IN");

/* ---------- small pieces ---------- */
type IconName = "home" | "friends" | "gift" | "user" | "gear" | "plus" | "play" | "bot" | "fire" | "check" | "lock" | "chevron" | "trophy" | "star" | "games" | "book" | "bell" | "bolt" | "layers";
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "home": return <svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>;
    case "friends": return <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.3.2 4 1.8 4.5 4.5" /></svg>;
    case "gift": return <svg {...p}><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18" /><path d="M12 8c-2-4-6-4-6-1.5S9 8 12 8c3 0 6-1 6-1.5S14 4 12 8z" /></svg>;
    case "user": return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4.2-6.5 8-6.5s7 2.5 8 6.5" /></svg>;
    case "gear": return <svg {...p} strokeWidth={1.9}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
    case "plus": return <svg {...p} strokeWidth={3}><path d="M12 5v14M5 12h14" /></svg>;
    case "play": return <svg {...p}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" /></svg>;
    case "bot": return <svg {...p}><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 7V4" /><circle cx="9" cy="13" r="1.3" fill="currentColor" /><circle cx="15" cy="13" r="1.3" fill="currentColor" /></svg>;
    case "fire": return <svg {...p}><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 0 2 1 3 2 3 0-3-1-5.5.5-8z" fill="currentColor" stroke="none" /></svg>;
    case "check": return <svg {...p} strokeWidth={3}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
    case "lock": return <svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    case "trophy": return <svg {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></svg>;
    case "star": return <svg {...p}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor" stroke="none" /></svg>;
    case "games": return <svg {...p}><path d="M6 8h12a4 4 0 0 1 3.8 5.2l-1 3.4a2.5 2.5 0 0 1-4.2 1L15 16H9l-1.6 1.6a2.5 2.5 0 0 1-4.2-1l-1-3.4A4 4 0 0 1 6 8Z"/><path d="M7 11v4M5 13h4M16.5 12h.01M18.5 14h.01"/></svg>;
    case "book": return <svg {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5V21M8 7h8M8 11h8"/></svg>;
    case "bell": return <svg {...p}><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>;
    case "bolt": return <svg {...p}><path d="M13 2 4.8 13h6.1L10 22l9.2-12h-6.4z" fill="currentColor" stroke="none"/></svg>;
    case "layers": return <svg {...p}><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
    default: return <svg {...p}><path d="M9 6l6 6-6 6" /></svg>;
  }
}
export const Coin = ({ size = 22 }: { size?: number }) => (
  /* The Ambaro coin: gold, with the lotus from the logo (not a crown or a chip, so it never looks like a casino token). */
  <svg className="rx-coin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.6" fill="#F5C542" stroke="#B8862B" strokeWidth="1.3" /><circle cx="12" cy="12" r="8.3" fill="none" stroke="#B8862B" strokeWidth=".7" opacity=".7" /><g fill="#B8862B"><path d="M12 5.6c1.5 1.6 2.1 3.6 0 7.4-2.1-3.8-1.5-5.8 0-7.4z" /><path d="M6.6 8.9c2.1.2 3.8 1.5 5 4.6-3.2-.6-4.6-2.3-5-4.6z" /><path d="M17.4 8.9c-.4 2.3-1.8 4-5 4.6 1.2-3.1 2.9-4.4 5-4.6z" /><path d="M6.8 14.2c1.6 1.4 3.3 1.9 5.2 1.9s3.6-.5 5.2-1.9c-.9 2-2.8 3.2-5.2 3.2s-4.3-1.2-5.2-3.2z" /></g></svg>
);
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(id); }, [ms]);
  return now;
}
const left = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s % 60).padStart(2, "0")}s`; };
const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* no vibrator */ } };

/** Game-style dialog. tone "leave" (leave a game, close the app): an ivory card that stands out on any screen, with a
    big gold STAY (the safe choice, focused first) and a smaller red button to leave. Default: the green dialog. */
export function RxDialog({ title, text, yes, no, onYes, onNo, tone }: { title: string; text: string; yes: string; no: string; onYes: () => void; onNo: () => void; tone?: "leave" }) {
  if (tone === "leave") return <div className="rx-scrim rx-scrim-dark" role="presentation" onClick={onNo}>
    <div className="rx-leave" role="alertdialog" aria-modal="true" aria-labelledby="rx-dlg-t" aria-describedby="rx-dlg-p" onClick={e => e.stopPropagation()}>
      <span className="rx-leave-badge" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h10" /></svg>
      </span>
      <h2 id="rx-dlg-t">{title}</h2>
      <p id="rx-dlg-p">{text}</p>
      <div className="rx-leave-btns">
        <button type="button" className="rx-btn rx-stay" onClick={onNo} autoFocus>{no}</button>
        <button type="button" className="rx-btn rx-red" onClick={onYes}>{yes}</button>
      </div>
    </div>
  </div>;
  return <div className="rx-scrim" role="presentation" onClick={onNo}>
    <div className="rx-dialog" role="alertdialog" aria-modal="true" aria-labelledby="rx-dlg-t" onClick={e => e.stopPropagation()}>
      <h2 id="rx-dlg-t">{title}</h2>
      <p>{text}</p>
      <div className="rx-dialog-btns">
        <button type="button" className="rx-btn rx-green" onClick={onNo} autoFocus>{no}</button>
        <button type="button" className="rx-btn rx-saffron" onClick={onYes}>{yes}</button>
      </div>
    </div>
  </div>;
}

/* "+40 coins" pop-up after collecting something. */
let toastFn: ((t: string) => void) | null = null;
const toast = (t: string) => toastFn?.(t);
function Toast() {
  const [msg, setMsg] = useState<{ t: string; id: number } | null>(null);
  useEffect(() => { toastFn = t => { setMsg({ t, id: Date.now() }); buzz(30); }; return () => { toastFn = null; }; }, []);
  useEffect(() => { if (!msg) return; const id = window.setTimeout(() => setMsg(null), 2200); return () => window.clearTimeout(id); }, [msg]);
  return msg ? <div key={msg.id} className="rx-toast" role="status"><Coin size={22} />{msg.t}</div> : null;
}
const earn = (coins: number, what: string) => { if (coins) toast(`+${fmtCoins(coins)} · ${what}`); };

/* ---------- the shell ---------- */
export interface AppShellProps {
  tab: AppTab;
  onTab: (t: AppTab) => void;
  onOpen: (id: GameId) => void;
  onJoin: (id: "ludo" | "snakes", code: string) => void;
  profile: ReactNode;
}

const NAV: { id: AppTab; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" }, { id: "games", label: "Games", icon: "games" },
  { id: "friends", label: "Friends", icon: "friends" }, { id: "learn", label: "Learn", icon: "book" },
  { id: "profile", label: "Profile", icon: "user" },
];

export default function AppShell({ tab, onTab, onOpen, onJoin, profile }: AppShellProps) {
  const w = useWallet();
  const bg = useBg();
  const shown = w.owned.includes(bg) ? bg : BGS[0].id;
  const games = TILES.filter(t => isListed(t.id) && t.id !== "sudoku");
  const [earned, setEarned] = useState<Earned | null>(null);

  const ready = useWalletReady();
  useEffect(() => { if (!ready) return; refreshDay(); const e = collectGames(); if (e.games) setEarned(e); }, [ready]);

  return <div className={`rx rx-reference${isCream(shown) ? " rx-light" : ""}`} style={shellVars(shown) as CSSProperties}>
    <GameArtDefs />
    <Toast />
    <div className="rx-top"><Hud onTab={onTab} /></div>
    <main className="rx-main">
      {tab === "home" && <HomeStage games={games.map(g => g.id)} game="ludo" onOpen={onOpen} onTab={onTab} />}
      {tab === "games" && <GamesTab games={games.map(g => g.id)} onOpen={onOpen} />}
      {tab === "friends" && <FriendsTab onOpen={onOpen} onJoin={onJoin} initial={null} />}
      {tab === "learn" && <RewardsTab />}
      {tab === "profile" && <ProfileTab profile={profile} onSettings={() => onTab("settings")} />}
      {tab === "settings" && <SettingsTab />}
    </main>
    <nav className="rx-nav" aria-label="Main">
      {NAV.map(n => <button key={n.id} type="button" className={`rx-navbtn${tab === n.id ? " on" : ""}`} aria-current={tab === n.id ? "page" : undefined} onClick={() => onTab(n.id)}>
          <Icon name={n.icon} size={25} />{n.label}{n.id === "learn" && <RewardsDot />}
        </button>)}
    </nav>
    {earned && <EarnedDialog e={earned} onClose={() => setEarned(null)} />}
  </div>;
}

function RewardsDot() {
  const w = useWallet(), now = useNow(30_000);
  const m = R.missionView(w, now);
  const n = (R.dailyStatus(w, now).done ? 0 : 1) + (R.chestStatus(w, now).ready ? 1 : 0) + m.list.filter(x => x.done && !x.claimed).length + (m.bonusReady ? 1 : 0);
  return n ? <span className="rx-dot" aria-label={`${n} rewards to collect`}>{n}</span> : null;
}

function Hud({ onTab }: { onTab: (t: AppTab) => void }) {
  const w = useWallet();
  const { username, guest, session } = useAccount();
  const name = username ?? (session && !guest ? "Player" : "Guest");
  return <header className="rx-hud">
    <img className="rx-brand-logo" src="/brand/ambaro-logo.webp" alt="Ambaro" width={960} height={326} />
    <span className="rx-brand-spacer" />
    <button type="button" className="rx-brand-coins" onClick={() => onTab("learn")} aria-label={`${w.coins} coins`}>
      <Coin size={25} /><span>{fmtCoins(w.coins)}<small>COINS</small></span>
    </button>
    <button type="button" className="rx-brand-action" onClick={() => onTab("learn")} aria-label="Notifications"><Icon name="bell" size={21} /><i /></button>
    <button type="button" className="rx-brand-action" onClick={() => onTab("profile")} aria-label={`Profile for ${name}`}><Icon name="user" size={22} /></button>
  </header>;
}

/* ---------- Ambaro mobile home ---------- */
const APP_GAME_NAMES: Partial<Record<GameId, string>> = { ludo: "Ludo", snakes: "Snakes & Ladders", chess: "Chess", ekah: "EKAH", words: "Tap Quest" };
const APP_GAME_BLURBS: Partial<Record<GameId, string>> = {
  ludo: "Classic fun with friends", snakes: "Roll, climb and win", chess: "Strategy. Skill. Victory.",
  ekah: "Match, play and be first!", words: "Discover words · 300 levels",
};
type LibraryFilter = "all" | "board" | "card" | "strategy" | "word";
const appCategory = (id: GameId): LibraryFilter => id === "ludo" || id === "snakes" ? "board" : id === "ekah" ? "card" : id === "chess" ? "strategy" : "word";
const APP_FEATURES: GameId[] = ["ekah", "ludo", "words"];

function HomeStage({ games, game, onOpen, onTab }: {
  games: GameId[]; game: GameId; onOpen: (id: GameId) => void; onTab: (t: AppTab) => void;
}) {
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [featured, setFeatured] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const resume = findResume();
  const featureId = APP_FEATURES[featured];
  const featureName = APP_GAME_NAMES[featureId] ?? featureId;
  const playFeatured = () => onOpen(featureId);
  const swipeFeatured = (x: number) => {
    if (touchX === null || Math.abs(x - touchX) < 36) return;
    setFeatured(i => (i + (x < touchX ? 1 : -1) + APP_FEATURES.length) % APP_FEATURES.length);
    setTouchX(null);
  };

  return <div className="rx-page rx-home">
    <section className="rx-quick-actions" aria-label="Quick play">
      <button type="button" onClick={() => onTab("friends")}><Icon name="friends" size={27} /><strong>With Friends</strong></button>
      <button type="button" onClick={() => onOpen(game)}><Icon name="bolt" size={29} /><strong>Quick Game</strong></button>
      <button type="button" onClick={() => onTab("games")}><Icon name="layers" size={27} /><strong>Classics</strong></button>
    </section>

    <section className={`rx-feature-banner rx-feature-${featureId}`} aria-label="Featured game" onTouchStart={e => setTouchX(e.changedTouches[0]?.screenX ?? null)} onTouchEnd={e => swipeFeatured(e.changedTouches[0]?.screenX ?? 0)}>
      <div className="rx-feature-copy"><small>{featureId === "ekah" ? "AMBARO ORIGINAL" : featureId === "ludo" ? "FRIENDS · 2–4 PLAYERS" : "WORD PUZZLE · 300 LEVELS"}</small>
        <h1>{featureId === "ekah" ? "EKAH" : featureName}</h1>
        <p>{featureId === "ekah" ? <>Our own card game<br />Agni · Vayu · Prithvi · Jal</> : featureId === "ludo" ? <>Bring your people to the table.<br />Classic fun, one more round.</> : <>Follow the trail of letters.<br />Find the word. Unlock the next.</>}</p>
        <button className="rx-feature-play" type="button" onClick={playFeatured}>Play Now <Icon name="chevron" size={16} /></button>
      </div>
      {featureId === "ekah" ? <div className="rx-elemental-cards" aria-hidden="true"><span className="fire">♨</span><span className="water">≈</span><span className="leaf">♧</span><span className="drop">◉</span></div>
        : <div className="rx-feature-art" aria-hidden="true">{ART[featureId]?.()}</div>}
      <div className="rx-feature-dots" role="tablist" aria-label="Featured games">{APP_FEATURES.map((id, i) => <button key={id} type="button" role="tab" aria-label={APP_GAME_NAMES[id]} aria-selected={i === featured} className={i === featured ? "on" : ""} onClick={() => setFeatured(i)} />)}</div>
    </section>

    <div className="rx-section-heading"><h2>Continue Playing</h2><button type="button" onClick={() => onTab("games")}>See all <span aria-hidden="true">›</span></button></div>
    <div className="rx-recent-row" aria-label="Continue playing">
      {(["ludo", "snakes"] as GameId[]).map((id, i) => {
        const saved = SAVED[id]?.() ?? false;
        const live = resume?.id === id && !!resume.code;
        return <article className="rx-recent-card" key={id}>
          <span className="rx-recent-art">{ART[id]()}</span><span className="rx-recent-copy"><strong>{APP_GAME_NAMES[id]}</strong><small>{live ? `Room ${resume?.code}` : saved ? "Saved game · continue" : i === 0 ? "Play a classic with friends" : "A family favorite"}</small></span>
          <button type="button" onClick={() => onOpen(id)}>{live || saved ? "Resume" : "Play"} <span aria-hidden="true">›</span></button>
        </article>;
      })}
    </div>

    <GameLibrary games={games} onOpen={onOpen} filter={filter} onFilter={setFilter} compact />
    <p className="rx-promise">Free to play · Coins are for fun only</p>
  </div>;
}

function GameLibrary({ games, onOpen, filter, onFilter, compact = false }: { games: GameId[]; onOpen: (id: GameId) => void; filter: LibraryFilter; onFilter: (f: LibraryFilter) => void; compact?: boolean }) {
  const filters: { id: LibraryFilter; label: string }[] = [{ id: "all", label: "All" }, { id: "board", label: "Board" }, { id: "card", label: "Card" }, { id: "strategy", label: "Strategy" }, { id: "word", label: "Word" }];
  const items = games.filter(id => filter === "all" || appCategory(id) === filter);
  return <section className={`rx-library${compact ? " compact" : ""}`} aria-label="Our games">
    <div className="rx-games-heading"><h2>{compact ? "Our Games" : "Choose your game"}</h2>
      <div className="rx-game-filters" role="group" aria-label="Filter games">{filters.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => onFilter(f.id)}>{f.label}</button>)}</div>
    </div>
    <div className="rx-game-grid">{items.map(id => <button type="button" className={`rx-app-game rx-app-game-${id}`} key={id} onClick={() => onOpen(id)}>
      <span className="rx-app-game-art">{ART[id]()}</span><span className="rx-app-game-shade" />
      <span className="rx-app-game-copy"><span><strong>{APP_GAME_NAMES[id] ?? id}</strong><small>{APP_GAME_BLURBS[id]}</small></span><i>Play <b>›</b></i></span>
    </button>)}</div>
  </section>;
}

function GamesTab({ games, onOpen }: { games: GameId[]; onOpen: (id: GameId) => void }) {
  const [filter, setFilter] = useState<LibraryFilter>("all");
  return <div className="rx-page rx-games-tab"><GameLibrary games={games} onOpen={onOpen} filter={filter} onFilter={setFilter} /></div>;
}

function EarnedDialog({ e, onClose }: { e: Earned; onClose: () => void }) {
  return <div className="rx-scrim" role="presentation" onClick={onClose}>
    <div className="rx-dialog rx-earned" role="dialog" aria-modal="true" aria-labelledby="rx-earned-t" onClick={x => x.stopPropagation()}>
      <span className="rx-rays" aria-hidden="true" />
      <h2 id="rx-earned-t">{e.levelUp ? `Level ${e.levelUp}!` : e.wins ? "Well played!" : "Game rewards"}</h2>
      <p>{e.games === 1 ? "From your last game" : `From your last ${e.games} games`}{e.wins ? ` · ${e.wins} win${e.wins > 1 ? "s" : ""}` : ""}</p>
      <div className="rx-earned-row">
        <span className="rx-pill"><Coin size={26} />+{fmtCoins(e.coins)}</span>
        <span className="rx-pill gold"><Icon name="star" size={20} />+{e.xp} XP</span>
      </div>
      {e.levelUp && <p className="rx-small">New level reached. Check Rewards for looks you can unlock.</p>}
      <button type="button" className="rx-btn rx-saffron rx-wide" onClick={onClose} autoFocus>COLLECT</button>
    </div>
  </div>;
}

/* ---------- rewards ---------- */
function RewardsTab() {
  const w = useWallet(), now = useNow();
  const lv = R.levelOf(w.xp);
  const daily = R.dailyStatus(w, now), chest = R.chestStatus(w, now), m = R.missionView(w, now);
  const next = R.SHOP.filter(s => s.id.startsWith("bg-") && !w.owned.includes(s.id)).sort((a, b) => a.level - b.level)[0];
  return <div className="rx-page rx-rewards">
    <h1 className="rx-title">Learn &amp; Earn</h1>

    <section className="rx-card-box rx-level" aria-label="Your level">
      <span className="rx-level-badge"><small>LEVEL</small>{lv.level}</span>
      <div className="rx-level-text">
        <strong>{fmtCoins(lv.into)} / {fmtCoins(lv.need)} XP</strong>
        <span className="rx-xpbar big" aria-hidden="true"><span style={{ width: `${Math.round(lv.pct * 100)}%` }} /></span>
        <small>{next ? `${next.name} unlocks free at level ${next.level}` : "Every game gives XP: a win gives more"}</small>
      </div>
    </section>

    <h2 className="rx-kicker">DAILY GIFT</h2>
    <section className="rx-card-box" aria-label="Daily gift">
      <ol className="rx-cal">
        {R.DAILY_REWARDS.map((c, k) => {
          const got = daily.done ? k <= daily.index : k < daily.index, today = k === daily.index;
          return <li key={k} className={`${got ? "got" : ""}${today && !daily.done ? " today" : ""}${k === 6 ? " big" : ""}`}>
            <small>Day {k + 1}</small>{got ? <Icon name="check" size={22} /> : <Coin size={k === 6 ? 30 : 24} />}<b>{c}</b>
          </li>;
        })}
      </ol>
      {daily.done
        ? <p className="rx-small">Collected today. Streak: {w.streak} day{w.streak === 1 ? "" : "s"}. Come back tomorrow!</p>
        : <button type="button" className="rx-btn rx-saffron rx-wide" onClick={() => earn(claimDaily(), `day ${daily.index + 1} gift`)}>COLLECT DAY {daily.index + 1} · {daily.coins}</button>}
      {daily.shield && !daily.done && <p className="rx-small">You missed a day, but your weekly streak shield keeps your streak.</p>}
    </section>

    <h2 className="rx-kicker">FREE GIFT</h2>
    <section className="rx-card-box rx-chest" aria-label="Free gift">
      <span className="rx-chest-ico"><Icon name="gift" size={34} /></span>
      <div><strong>{chest.ready ? `${chest.ready} free gift${chest.ready > 1 ? "s" : ""} ready` : "Next free gift"}</strong>
        <small>{chest.ready ? `${R.CHEST_COINS} coins in each. A new one every 4 hours.` : chest.nextAt ? `Opens in ${left(chest.nextAt - now)}` : ""}</small></div>
      <button type="button" className="rx-btn rx-saffron" disabled={!chest.ready} onClick={() => earn(claimChest(), "free gift")}>OPEN</button>
    </section>

    <h2 className="rx-kicker">TODAY'S MISSIONS</h2>
    <section className="rx-card-box rx-missions" aria-label="Today's missions">
      {m.list.map(x => <div key={x.id} className="rx-mission">
        <div><strong>{x.text}</strong><span className="rx-xpbar" aria-hidden="true"><span style={{ width: `${(x.progress / x.goal) * 100}%` }} /></span><small>{x.progress}/{x.goal}</small></div>
        {x.claimed ? <span className="rx-done"><Icon name="check" size={18} />Done</span>
          : <button type="button" className="rx-btn rx-saffron rx-sm" disabled={!x.done} onClick={() => earn(claimMission(x.id), "mission")}><Coin size={18} />{R.MISSION_COINS}</button>}
      </div>)}
      <div className="rx-mission bonus">
        <div><strong>All three done</strong><small>Bonus gift</small></div>
        {m.bonusClaimed ? <span className="rx-done"><Icon name="check" size={18} />Done</span>
          : <button type="button" className="rx-btn rx-saffron rx-sm" disabled={!m.bonusReady} onClick={() => earn(claimMission("bonus"), "mission bonus")}><Coin size={18} />{R.MISSION_BONUS}</button>}
      </div>
    </section>

    <h2 className="rx-kicker">SPEND COINS</h2>
    <LookPicker />
    <p className="rx-note">Coins are earned by playing and spent only on looks. They can't be bought, cashed out or used to bet.</p>
  </div>;
}

function LookPicker() {
  const w = useWallet(), bg = useBg();
  const [ask, setAsk] = useState<R.ShopItem | null>(null);
  const shown = w.owned.includes(bg) ? bg : BGS[0].id;
  return <section className="rx-card-box" aria-label="Background colour">
    <strong className="rx-box-title">Background colour</strong>
    <div className="rx-swatches">
      {BGS.map(b => {
        const s = R.unlockStatus(w, b.id);
        return <button key={b.id} type="button" className={`rx-swatch${shown === b.id ? " on" : ""}`} aria-pressed={shown === b.id}
          onClick={() => s.owned ? setBg(b.id) : s.item && setAsk(s.item)}>
          <span className="rx-swatch-dot" style={{ background: b.cream ? `linear-gradient(180deg, ${b.mid} 0 34%, #FFFBF3 34%, #F2DDBB)` : `radial-gradient(circle at 50% 30%, ${b.light}, ${b.mid} 60%, ${b.dark})` }}>
            {shown === b.id ? <Icon name="check" size={20} /> : !s.owned ? <Icon name="lock" size={18} /> : null}
          </span>
          <span className="rx-swatch-name">{b.name}</span>
          {!s.owned && s.item && <span className="rx-swatch-price">{s.free ? "Free now" : <><Coin size={14} />{fmtCoins(s.item.price)}</>}</span>}
        </button>;
      })}
    </div>
    {ask && (() => {
      const s = R.unlockStatus(w, ask.id);
      return <RxDialog title={`Unlock ${ask.name}?`}
        text={s.free ? `You've reached level ${ask.level}, so it's free.` : s.afford ? `It costs ${fmtCoins(ask.price)} coins. You have ${fmtCoins(w.coins)}. Or play on: it's free at level ${ask.level}.` : `It costs ${fmtCoins(ask.price)} coins and you have ${fmtCoins(w.coins)}. Keep playing to earn more, or reach level ${ask.level} to get it free.`}
        yes={s.afford ? (s.free ? "UNLOCK" : `UNLOCK · ${fmtCoins(ask.price)}`) : "OK"} no="Not now"
        onNo={() => setAsk(null)}
        onYes={() => { if (s.afford && unlockLook(ask.id)) { setBg(ask.id); toast(`${ask.name} unlocked`); } setAsk(null); }} />;
    })()}
  </section>;
}

/* ---------- profile ---------- */
function ProfileTab({ profile, onSettings }: { profile: ReactNode; onSettings: () => void }) {
  const w = useWallet();
  const lv = R.levelOf(w.xp);
  const NAMES: Record<string, string> = { ekah: "EKAH", ludo: "Ludo", snakes: "Snakes & Ladders", chess: "Chess", sudoku: "Sudoku", words: "Word Puzzle" };
  return <div className="rx-page rx-profile">
    <div className="rx-page-title"><h1 className="rx-title">Profile</h1><button type="button" className="rx-profile-settings" onClick={onSettings}><Icon name="gear" size={21}/>Settings</button></div>
    <section className="rx-stats" aria-label="Your stats">
      <div><b>{lv.level}</b><small>Level</small></div>
      <div><b>{fmtCoins(w.life.played)}</b><small>Games</small></div>
      <div><b>{fmtCoins(w.life.wins)}</b><small>Wins</small></div>
      <div><b>{w.streak}</b><small>Day streak</small></div>
    </section>
    {w.life.played > 0 && <section className="rx-card-box rx-bygame" aria-label="By game">
      {Object.entries(w.life.games).map(([g, s]) => <div key={g}><span>{NAMES[g] ?? g}</span><b>{s.p} played · {s.w} won</b></div>)}
    </section>}
    <h2 className="rx-kicker">ACCOUNT</h2>
    <div className="rx-sheet">{profile}</div>
  </div>;
}

/* ---------- friends ---------- */
const ROOM_GAME_NAMES: Record<RoomGame, string> = { ekah: "EKAH", ludo: "Ludo", snakes: "Snakes & Ladders", sudoku: "Sudoku race" };

function FriendsTab({ onOpen, onJoin, initial }: { onOpen: (id: GameId) => void; onJoin: (id: "ludo" | "snakes", code: string) => void; initial: RoomGame | null }) {
  const { username } = useAccount();
  const roomGames = RESUME.filter(r => isListed(r.id)).map(r => r.id);
  const [game, setGame] = useState<RoomGame>(initial && roomGames.includes(initial) ? initial : roomGames[0] ?? "ludo");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [resume] = useState(findResume);
  const live = resume && resume.code ? resume : null;

  const open = (g: RoomGame) => { if (g === "sudoku") window.location.href = pageHref("/sudoku/"); else onOpen(g); };
  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) { setErr("Enter the 4-letter room code."); return; }
    setErr("");
    if (game === "ekah" || game === "sudoku") { window.location.href = pageHref(`/${game}/?room=${c}`); return; }
    onJoin(game, c);
  };

  return <div className="rx-page rx-friends">
    <h1 className="rx-title">Play with friends</h1>
    <p className="rx-note">{username ? <>Playing as <b>{username}</b>. Rooms are always free.</> : "Sign in with your username (Profile) to play rooms with friends. Rooms are always free."}</p>
    {live && (
      <section className="rx-card-box rx-live" aria-label="Your room">
        <span className="rx-live-art">{ART[live.id]()}</span>
        <span className="rx-live-text"><small>YOUR ROOM</small><strong>{live.name}</strong><span>Room {live.code}</span></span>
        <button type="button" className="rx-btn rx-saffron" onClick={() => onOpen(live.id)}>BACK</button>
      </section>
    )}
    <section className="rx-card-box" aria-label="Pick a game">
      <strong className="rx-box-title">1 · Pick a game</strong>
      <div className="rx-gamepick" role="group" aria-label="Game">
        {roomGames.map(g => <button key={g} type="button" aria-pressed={game === g} className={`rx-gp${game === g ? " on" : ""}`} onClick={() => setGame(g)}>
          <span>{ART[g]()}</span>{ROOM_GAME_NAMES[g]}
        </button>)}
      </div>
    </section>
    <section className="rx-card-box" aria-label="Create a room">
      <strong className="rx-box-title">2 · Create a room</strong>
      <p className="rx-small">You get a room code to share on WhatsApp.</p>
      <button type="button" className="rx-btn rx-saffron rx-wide" onClick={() => open(game)}>CREATE {ROOM_GAME_NAMES[game].toUpperCase()} ROOM</button>
    </section>
    <form className="rx-card-box" aria-label="Join a room" onSubmit={join}>
      <strong className="rx-box-title">Or join a friend's room</strong>
      <div className="rx-join">
        <input aria-label="Room code" value={code} maxLength={4} autoCapitalize="characters" placeholder="ABCD" onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} />
        <button type="submit" className="rx-btn rx-blue">JOIN</button>
      </div>
      {err && <p className="rx-error" role="alert">{err}</p>}
      <p className="rx-small">Game: {ROOM_GAME_NAMES[game]}. Got an invite link? Just open it.</p>
    </form>
  </div>;
}

/* ---------- settings ---------- */
const VIBRATE_KEY = "rc-vibrate";
const readVibrate = () => { try { return window.localStorage.getItem(VIBRATE_KEY) !== "off"; } catch { return true; } };

function Switch({ label, sub, on, onChange }: { label: string; sub: string; on: boolean; onChange: (v: boolean) => void }) {
  return <div className="rx-row">
    <div className="rx-row-text"><strong>{label}</strong><span>{sub}</span></div>
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`rx-switch${on ? " on" : ""}`} onClick={() => onChange(!on)}><span /></button>
  </div>;
}
function LinkRow({ label, href }: { label: string; href: string }) {
  return <a className="rx-row rx-link" href={pageHref(href)}><span className="rx-row-text"><strong>{label}</strong></span><Icon name="chevron" size={18} /></a>;
}

function SettingsTab() {
  const [vibrate, setVibrate] = useState(readVibrate);
  const [lessMotion, setLessMotion] = useState(motionReduced);
  const [version, setVersion] = useState("");
  useEffect(() => { NativeApp.getInfo().then(i => setVersion(`${i.version} (${i.build})`)).catch(() => {}); }, []);
  return <div className="rx-page rx-settings">
    <h1 className="rx-title">Settings</h1>
    <h2 className="rx-kicker">LOOK</h2>
    <LookPicker />
    <h2 className="rx-kicker">GAME</h2>
    <section className="rx-card-box rx-list" aria-label="Game settings">
      <Switch label="Vibration" sub="Buzz on dice rolls, cuts and wins" on={vibrate} onChange={v => { setVibrate(v); try { window.localStorage.setItem(VIBRATE_KEY, v ? "on" : "off"); } catch { /* storage off */ } }} />
      <Switch label="Less motion" sub="Fewer animations in Ludo, Snakes & Ladders and Chess" on={lessMotion} onChange={v => { setLessMotion(v); setMotionReduced(v); }} />
    </section>
    <p className="rx-note">Sound is set inside each game.</p>
    <h2 className="rx-kicker">ABOUT</h2>
    <section className="rx-card-box rx-list" aria-label="About">
      <LinkRow label="About Ambaro" href="/about/" />
      <LinkRow label="Contact us" href="/contact/" />
      <LinkRow label="Privacy Policy" href="/privacy/" />
      <LinkRow label="Terms of Service" href="/terms/" />
      <LinkRow label="Delete my account" href="/delete-account/" />
    </section>
    <p className="rx-note">Ambaro{version ? ` · version ${version}` : ""}</p>
  </div>;
}
