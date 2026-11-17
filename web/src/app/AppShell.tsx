import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { App as NativeApp } from "@capacitor/app";
import { isListed, type GameId } from "../domain/game";
import { pageHref } from "../lib/native";
import { motionReduced, setMotionReduced } from "../lib/motion";
import { SAVE_KEYS, chessInProgress, hasSavedGame, sudokuInProgress } from "../lib/localSave";
import { useAccount } from "../auth/account";
import { GameArtDefs, EkahArt, LudoArt, SnakesArt, ChessArt, SudokuArt } from "../home/GameArt";
import { TILES, RESUME, findResume, type RoomGame } from "../home/Home";
import * as R from "../economy/rules";
import { claimChest, claimDaily, claimMission, collectGames, refreshDay, unlockLook, useWallet, useWalletReady, type Earned } from "../economy/wallet";
import { BGS, bgVars, setBg, useBg } from "./theme";
import Glider from "./Glider";
import "./app-shell.css";

/* The Android app's own layout, "Royal Durbar" (design: Royal Club app — screen designs, page "Final choice"):
   a player bar (level, XP, coins, settings), the Game Stage home (swipe the big game card or tap a medallion),
   a bottom bar with a raised PLAY button, Rewards (daily calendar, free chest, missions, looks), Profile and
   Settings. Phones: bottom bar. Tablets (840px+): side rail. Only used inside the app; the website keeps its own
   home page, and the games open full screen outside this shell. Name and logo are placeholders until final. */

export type AppTab = "home" | "friends" | "rewards" | "profile" | "settings";

const ART: Record<GameId, () => ReactNode> = {
  ekah: () => <EkahArt />, ludo: () => <LudoArt />, snakes: () => <SnakesArt />, chess: () => <ChessArt />, sudoku: () => <SudokuArt />,
  spades: () => <EkahArt />, rummy: () => <EkahArt />,
};
const PLAYERS: Partial<Record<GameId, string>> = { ekah: "2–6 players", ludo: "2–4 players", snakes: "2–4 players", chess: "2 players", sudoku: "Solo or race" };
const SOLO: Partial<Record<GameId, string>> = { sudoku: "Play solo", chess: "vs Computer" };
const SAVED: Partial<Record<GameId, () => boolean>> = {
  ludo: () => hasSavedGame(SAVE_KEYS.ludo), ekah: () => hasSavedGame(SAVE_KEYS.ekah), snakes: () => hasSavedGame(SAVE_KEYS.snakes),
  chess: chessInProgress, sudoku: sudokuInProgress,
};
const GAME_KEY = "rc-app-game";
const fmtCoins = (n: number) => n.toLocaleString("en-IN");

/* ---------- small pieces ---------- */
type IconName = "home" | "friends" | "gift" | "user" | "gear" | "plus" | "play" | "bot" | "fire" | "check" | "lock" | "chevron" | "trophy" | "star";
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
    default: return <svg {...p}><path d="M9 6l6 6-6 6" /></svg>;
  }
}
export const Coin = ({ size = 22 }: { size?: number }) => (
  <svg className="rx-coin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#F5C542" stroke="#B8862B" strokeWidth="1.5" /><circle cx="12" cy="12" r="7" fill="none" stroke="#B8862B" strokeWidth="1" /><path d="M7.5 10.5l2 1.7L12 8.5l2.5 3.7 2-1.7-.9 4.5H8.4z" fill="#B8862B" /></svg>
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

const NAV: { id: AppTab | "play"; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" }, { id: "friends", label: "Friends", icon: "friends" }, { id: "play", label: "PLAY", icon: "play" },
  { id: "rewards", label: "Rewards", icon: "gift" }, { id: "profile", label: "Profile", icon: "user" },
];

export default function AppShell({ tab, onTab, onOpen, onJoin, profile }: AppShellProps) {
  const w = useWallet();
  const bg = useBg();
  const shown = w.owned.includes(bg) ? bg : BGS[0].id;            // a colour this account hasn't unlocked falls back to Emerald
  const games = TILES.filter(t => isListed(t.id));
  const [game, setGame] = useState<GameId>(() => { try { const v = window.localStorage.getItem(GAME_KEY) as GameId | null; return v && games.some(g => g.id === v) ? v : (games.find(g => g.id === "ludo") ?? games[0]).id; } catch { return games[0].id; } });
  const pickGame = (id: GameId) => { setGame(id); try { window.localStorage.setItem(GAME_KEY, id); } catch { /* storage off */ } };
  const [earned, setEarned] = useState<Earned | null>(null);
  const [friendGame, setFriendGame] = useState<RoomGame | null>(null);

  const ready = useWalletReady();
  useEffect(() => { if (!ready) return; refreshDay(); const e = collectGames(); if (e.games) setEarned(e); }, [ready]);

  return <div className="rx" style={bgVars(shown) as CSSProperties}>
    <GameArtDefs />
    <Toast />
    <Hud onTab={onTab} />
    <main className="rx-main">
      {tab === "home" && <HomeStage games={games.map(g => g.id)} game={game} onPick={pickGame} onOpen={onOpen} onTab={onTab} onFriends={g => { setFriendGame(g); onTab("friends"); }} />}
      {tab === "friends" && <FriendsTab onOpen={onOpen} onJoin={onJoin} initial={friendGame} />}
      {tab === "rewards" && <RewardsTab />}
      {tab === "profile" && <ProfileTab profile={profile} />}
      {tab === "settings" && <SettingsTab />}
    </main>
    <nav className="rx-nav" aria-label="Main">
      <span className="rx-rail-mark" aria-hidden="true">RC</span>
      {NAV.map(n => n.id === "play"
        ? <button key="play" type="button" className="rx-navplay" aria-label={`Play ${games.find(g => g.id === game)?.name ?? ""}`} onClick={() => onOpen(game)}><Icon name="play" size={28} />PLAY</button>
        : <button key={n.id} type="button" className={`rx-navbtn${tab === n.id ? " on" : ""}`} aria-current={tab === n.id ? "page" : undefined} onClick={() => onTab(n.id as AppTab)}>
            <Icon name={n.icon} size={25} />{n.label}{n.id === "rewards" && <RewardsDot />}
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
  const lv = R.levelOf(w.xp);
  const name = username ?? (session && !guest ? "Player" : "Guest");
  return <header className="rx-hud">
    <button type="button" className="rx-me" onClick={() => onTab("profile")} aria-label={`Your profile, level ${lv.level}`}>
      <span className="rx-avatar"><span>{name.slice(0, 1).toUpperCase()}</span><b>{lv.level}</b></span>
      <span className="rx-me-text"><strong>{name}</strong><span className="rx-xpbar" aria-hidden="true"><span style={{ width: `${Math.round(lv.pct * 100)}%` }} /></span></span>
    </button>
    <button type="button" className="rx-coins" onClick={() => onTab("rewards")} aria-label={`${w.coins} coins. Earn more in Rewards`}>
      <Coin size={26} /><span>{fmtCoins(w.coins)}</span><span className="rx-coins-plus"><Icon name="plus" size={15} /></span>
    </button>
    <button type="button" className="rx-gear" onClick={() => onTab("settings")} aria-label="Settings"><Icon name="gear" size={22} /></button>
  </header>;
}

/* ---------- home: the Game Stage ---------- */
function HomeStage({ games, game, onPick, onOpen, onTab, onFriends }: {
  games: GameId[]; game: GameId; onPick: (id: GameId) => void; onOpen: (id: GameId) => void; onTab: (t: AppTab) => void; onFriends: (g: RoomGame) => void;
}) {
  const w = useWallet(), now = useNow();
  const tile = TILES.find(t => t.id === game)!;
  const resume = findResume();
  const room = resume && resume.code && resume.id === game ? resume : null;
  const saved = !room && (SAVED[game]?.() ?? false);
  const chest = R.chestStatus(w, now), daily = R.dailyStatus(w, now), missions = R.missionView(w, now);
  const done = missions.list.filter(m => m.claimed).length;
  const roomGame = RESUME.some(r => r.id === game && isListed(r.id)) ? (game as RoomGame) : null;

  return <div className="rx-page rx-home">
    <div className="rx-chips">
      <button type="button" className={`rx-chip${chest.ready ? " ready" : ""}`} onClick={() => chest.ready ? earn(claimChest(), "free chest") : onTab("rewards")}>
        <span className="rx-chip-ico gold"><Icon name="gift" size={19} /></span>
        <span><strong>{chest.ready ? "Open chest!" : "Chest"}</strong><small>{chest.ready ? `${chest.ready} ready` : chest.nextAt ? left(chest.nextAt - now) : ""}</small></span>
      </button>
      <button type="button" className={`rx-chip${daily.done ? "" : " ready"}`} onClick={() => onTab("rewards")}>
        <span className="rx-chip-ico saffron"><Icon name="fire" size={19} /></span>
        <span><strong>{daily.done ? "Streak" : "Daily gift"}</strong><small>{daily.done ? `${w.streak} day${w.streak === 1 ? "" : "s"}` : `Day ${daily.index + 1} ready`}</small></span>
      </button>
      <button type="button" className="rx-chip" onClick={() => onTab("rewards")}>
        <span className="rx-chip-ico green"><Icon name="trophy" size={19} /></span>
        <span><strong>Missions</strong><small>{done}/3 done</small></span>
      </button>
    </div>

    <Glider items={games} selected={game} label={id => TILES.find(t => t.id === id)?.name ?? id}
      onSelect={id => { onPick(id); buzz(8); }} onOpen={onOpen}
      render={id => {
        const name = TILES.find(t => t.id === id)?.name ?? id;
        const r = resume && resume.code && resume.id === id ? resume : null;
        const sv = !r && (SAVED[id]?.() ?? false);
        return <>
          <span className="rx-card-art">{ART[id]()}</span>
          <span className="rx-card-shade" aria-hidden="true" />
          {(r || sv) && <span className="rx-badge green">● {r ? `Room ${r.code}` : "Saved game"}</span>}
          <span className="rx-badge dark">{PLAYERS[id]}</span>
          <span className="rx-ribbon"><span>{name}</span></span>
        </>;
      }} />
    <div className="rx-medals" role="tablist" aria-label="Games">
      {games.map(g => <button key={g} type="button" role="tab" aria-selected={g === game} aria-label={TILES.find(t => t.id === g)?.name} className={`rx-medal${g === game ? " on" : ""}`} onClick={() => { onPick(g); buzz(8); }}>{ART[g]()}</button>)}
    </div>

    <div className="rx-actions">
      <button type="button" className="rx-go" onClick={() => onOpen(game)}>
        <span className="rx-go-shine" aria-hidden="true" />
        <span className="rx-go-thumb" aria-hidden="true">{ART[game]()}</span>
        <span className="rx-go-text">
          <strong>{room ? "BACK TO ROOM" : saved ? `CONTINUE ${tile.name.toUpperCase()}` : `PLAY ${tile.name.toUpperCase()}`}</strong>
          <small>{room ? `Room ${room.code} · tap to return` : saved ? "Saved game · pick up where you left" : "Tap the card or here to start"}</small>
        </span>
        <span className="rx-go-play" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg></span>
      </button>
      <div className="rx-two">
        <button type="button" className="rx-btn rx-green" onClick={() => onOpen(game)}><Icon name="bot" size={20} />{SOLO[game] ?? "vs Computer"}</button>
        <button type="button" className="rx-btn rx-blue" disabled={!roomGame} onClick={() => roomGame && onFriends(roomGame)}><Icon name="friends" size={20} />With Friends</button>
      </div>
    </div>
    <p className="rx-promise">Free to play · Coins are for fun only, never real money</p>
  </div>;
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
  const next = R.SHOP.filter(s => !w.owned.includes(s.id)).sort((a, b) => a.level - b.level)[0];
  return <div className="rx-page rx-rewards">
    <h1 className="rx-title">Rewards</h1>

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

    <h2 className="rx-kicker">FREE CHEST</h2>
    <section className="rx-card-box rx-chest" aria-label="Free chest">
      <span className="rx-chest-ico"><Icon name="gift" size={34} /></span>
      <div><strong>{chest.ready ? `${chest.ready} chest${chest.ready > 1 ? "s" : ""} ready` : "Next chest"}</strong>
        <small>{chest.ready ? `${R.CHEST_COINS} coins each. A new one every 4 hours.` : chest.nextAt ? `Opens in ${left(chest.nextAt - now)}` : ""}</small></div>
      <button type="button" className="rx-btn rx-saffron" disabled={!chest.ready} onClick={() => earn(claimChest(), "free chest")}>OPEN</button>
    </section>

    <h2 className="rx-kicker">TODAY'S MISSIONS</h2>
    <section className="rx-card-box rx-missions" aria-label="Today's missions">
      {m.list.map(x => <div key={x.id} className="rx-mission">
        <div><strong>{x.text}</strong><span className="rx-xpbar" aria-hidden="true"><span style={{ width: `${(x.progress / x.goal) * 100}%` }} /></span><small>{x.progress}/{x.goal}</small></div>
        {x.claimed ? <span className="rx-done"><Icon name="check" size={18} />Done</span>
          : <button type="button" className="rx-btn rx-saffron rx-sm" disabled={!x.done} onClick={() => earn(claimMission(x.id), "mission")}><Coin size={18} />{R.MISSION_COINS}</button>}
      </div>)}
      <div className="rx-mission bonus">
        <div><strong>All three done</strong><small>Bonus chest</small></div>
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
          <span className="rx-swatch-dot" style={{ background: `radial-gradient(circle at 50% 30%, ${b.light}, ${b.mid} 60%, ${b.dark})` }}>
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
function ProfileTab({ profile }: { profile: ReactNode }) {
  const w = useWallet();
  const lv = R.levelOf(w.xp);
  const NAMES: Record<string, string> = { ekah: "EKAH", ludo: "Ludo", snakes: "Snakes & Ladders", chess: "Chess", sudoku: "Sudoku" };
  return <div className="rx-page rx-profile">
    <h1 className="rx-title">Profile</h1>
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
      <LinkRow label="About Royal Club" href="/about/" />
      <LinkRow label="Contact us" href="/contact/" />
      <LinkRow label="Privacy Policy" href="/privacy/" />
      <LinkRow label="Terms of Service" href="/terms/" />
      <LinkRow label="Delete my account" href="/delete-account/" />
    </section>
    <p className="rx-note">Royal Club Games{version ? ` · version ${version}` : ""}</p>
  </div>;
}
