import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { App as NativeApp } from "@capacitor/app";
import { isListed, type GameId } from "../domain/game";
import { pageHref } from "../lib/native";
import { motionReduced, setMotionReduced } from "../lib/motion";
import { useAccount } from "../auth/account";
import AuthPanel from "../auth/AuthPanel";
import { GameArtDefs, EkahArt, LudoArt, SnakesArt, ChessArt, SudokuArt } from "../home/GameArt";
import { TILES, RESUME, findResume, type RoomGame } from "../home/Home";
import elephantMark from "../brand/badge-logo-small.webp";
import "./app-shell.css";

/* The Android app's own layout (design "Royal Club app — screen designs"): fixed screens with a bottom tab bar on
   phones and a side rail on tablets, full-art game tiles, and app-style settings. Only used inside the app;
   the website keeps its own home page. Games themselves open full screen, outside this shell. */

export type AppTab = "home" | "friends" | "profile" | "settings";

const ART: Record<GameId, () => ReactNode> = {
  ekah: () => <EkahArt />, ludo: () => <LudoArt />, snakes: () => <SnakesArt />, chess: () => <ChessArt />, sudoku: () => <SudokuArt />,
  spades: () => <EkahArt />, rummy: () => <EkahArt />,
};
const SHORT: Partial<Record<GameId, string>> = {
  ekah: "Our own card game", ludo: "2–4 players", snakes: "Race to 100", chess: "3 levels · pass & play", sudoku: "Daily puzzle",
};

type IconName = AppTab | "chevron";
function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "home") return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>;
  if (name === "friends") return <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.3.2 4 1.8 4.5 4.5" /></svg>;
  if (name === "profile") return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4.2-6.5 8-6.5s7 2.5 8 6.5" /></svg>;
  if (name === "settings") return <svg {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
  return <svg {...p} strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></svg>;
}

const TABS: { id: AppTab; label: string }[] = [
  { id: "home", label: "Play" }, { id: "friends", label: "Friends" }, { id: "profile", label: "Profile" }, { id: "settings", label: "Settings" },
];

export interface AppShellProps {
  tab: AppTab;
  onTab: (t: AppTab) => void;
  onOpen: (id: GameId) => void;
  onJoin: (id: "ludo" | "snakes", code: string) => void;
  profile: ReactNode;
}

export default function AppShell({ tab, onTab, onOpen, onJoin, profile }: AppShellProps) {
  return <div className="ax-shell">
    <GameArtDefs />
    <nav className="ax-nav" aria-label="Main">
      <img className="ax-rail-logo" src={elephantMark} alt="Royal Club Games" width={320} height={224} />
      {TABS.map(t => (
        <button key={t.id} type="button" className={`ax-tab${tab === t.id ? " on" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => onTab(t.id)}>
          <span className="ax-tab-ico"><Icon name={t.id} /></span>{t.label}
        </button>
      ))}
    </nav>
    <main className="ax-main">
      {tab === "home" && <PlayTab onOpen={onOpen} onTab={onTab} />}
      {tab === "friends" && <FriendsTab onOpen={onOpen} onJoin={onJoin} />}
      {tab === "profile" && <div className="ax-page ax-profile"><h1 className="ax-title">Profile</h1>{profile}</div>}
      {tab === "settings" && <SettingsTab />}
    </main>
  </div>;
}

function PlayTab({ onOpen, onTab }: { onOpen: (id: GameId) => void; onTab: (t: AppTab) => void }) {
  const { username } = useAccount();
  const [resume] = useState(findResume);
  const games = TILES.filter(t => isListed(t.id));
  const featured = games.find(t => t.id === "ekah");
  const others = games.filter(t => t.id !== "ekah");
  return <div className="ax-page ax-play">
    <header className="ax-top">
      <img className="ax-logo" src={elephantMark} alt="Royal Club Games" width={320} height={224} />
      <div className="ax-account"><AuthPanel onProfile={() => onTab("profile")} /></div>
    </header>
    <div className="ax-hello">
      <div>
        <p className="ax-greet">Namaste{username ? `, ${username}` : ""}</p>
        <h1 className="ax-title">What shall we play?</h1>
      </div>
      {resume && (
        <section className="ax-resume" aria-label="Continue playing">
          <span className="ax-resume-art">{ART[resume.id]()}</span>
          <span className="ax-resume-text"><small>CONTINUE PLAYING</small><strong>{resume.name}</strong><span>{resume.code ? `Room ${resume.code}` : "Saved on this device"}</span></span>
          <button type="button" className="ax-btn ax-saffron" onClick={() => onOpen(resume.id)}>Resume</button>
        </section>
      )}
    </div>
    <h2 className="ax-kicker">ALL GAMES</h2>
    <div className="ax-grid">
      {featured && (
        <button type="button" className="ax-tile ax-feature" onClick={() => onOpen("ekah")}>
          <span className="ax-art">{ART.ekah()}</span>
          <span className="ax-label"><strong>EKAH</strong><span>{featured.sub}</span></span>
          <span className="ax-chev"><Icon name="chevron" size={20} /></span>
        </button>
      )}
      {others.map(t => (
        <button key={t.id} type="button" className={`ax-tile ax-tile-${t.id}`} onClick={() => onOpen(t.id)}>
          <span className="ax-art">{ART[t.id]()}</span>
          <span className="ax-label"><strong>{t.name}</strong><span>{SHORT[t.id] ?? t.sub}</span></span>
        </button>
      ))}
    </div>
    <p className="ax-promise">Free to play · No real money</p>
  </div>;
}

const ROOM_GAME_NAMES: Record<RoomGame, string> = { ekah: "EKAH", ludo: "Ludo", snakes: "Snakes & Ladders", sudoku: "Sudoku race" };

function FriendsTab({ onOpen, onJoin }: { onOpen: (id: GameId) => void; onJoin: (id: "ludo" | "snakes", code: string) => void }) {
  const { username } = useAccount();
  const roomGames = RESUME.filter(r => isListed(r.id)).map(r => r.id);
  const [game, setGame] = useState<RoomGame>(roomGames[0] ?? "ludo");
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

  return <div className="ax-page ax-friends">
    <h1 className="ax-title">Friends</h1>
    <p className="ax-sub">{username ? <>Playing as <b>{username}</b></> : "Sign in with your username to play rooms with friends."}</p>
    {live && (
      <section className="ax-card ax-live" aria-label="Your room">
        <span className="ax-resume-art">{ART[live.id]()}</span>
        <span className="ax-resume-text"><small>YOUR ROOM</small><strong>{live.name}</strong><span>Room {live.code}</span></span>
        <button type="button" className="ax-btn ax-saffron" onClick={() => onOpen(live.id)}>Back to room</button>
      </section>
    )}
    <div className="ax-two">
      <section className="ax-card ax-dark" aria-label="Create a room">
        <h2>Create a room</h2>
        <p>Pick a game, then share the code with friends.</p>
        <div className="ax-chips" role="group" aria-label="Game">
          {roomGames.map(g => <button key={g} type="button" aria-pressed={game === g} className={`ax-chip${game === g ? " on" : ""}`} onClick={() => setGame(g)}>{ROOM_GAME_NAMES[g]}</button>)}
        </div>
        <button type="button" className="ax-btn ax-saffron ax-wide" onClick={() => open(game)}>Create a {ROOM_GAME_NAMES[game]} room</button>
      </section>
      <form className="ax-card" aria-label="Join a room" onSubmit={join}>
        <h2>Join a friend's room</h2>
        <label className="ax-field">ROOM CODE
          <input value={code} maxLength={4} autoCapitalize="characters" placeholder="ABCD" onChange={e => setCode(e.target.value.toUpperCase())} />
        </label>
        <p className="ax-note">Game: <b>{ROOM_GAME_NAMES[game]}</b> (choose it above). Got an invite link? Just open it.</p>
        {err && <p className="ax-error" role="alert">{err}</p>}
        <button type="submit" className="ax-btn ax-outline ax-wide">Join</button>
      </form>
    </div>
  </div>;
}

const VIBRATE_KEY = "rc-vibrate";
const readVibrate = () => { try { return window.localStorage.getItem(VIBRATE_KEY) !== "off"; } catch { return true; } };

function Switch({ label, sub, on, onChange }: { label: string; sub: string; on: boolean; onChange: (v: boolean) => void }) {
  return <div className="ax-row">
    <div className="ax-row-text"><strong>{label}</strong><span>{sub}</span></div>
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`ax-switch${on ? " on" : ""}`} onClick={() => onChange(!on)}><span /></button>
  </div>;
}
function LinkRow({ label, href }: { label: string; href: string }) {
  return <a className="ax-row ax-link" href={pageHref(href)}><span className="ax-row-text"><strong>{label}</strong></span><Icon name="chevron" size={18} /></a>;
}

function SettingsTab() {
  const [vibrate, setVibrate] = useState(readVibrate);
  const [lessMotion, setLessMotion] = useState(motionReduced);
  const [version, setVersion] = useState("");
  useEffect(() => { NativeApp.getInfo().then(i => setVersion(`${i.version} (${i.build})`)).catch(() => {}); }, []);
  return <div className="ax-page ax-settings">
    <h1 className="ax-title">Settings</h1>
    <h2 className="ax-kicker">GAME</h2>
    <section className="ax-card ax-list" aria-label="Game settings">
      <Switch label="Vibration" sub="Buzz on dice rolls, cuts and wins" on={vibrate} onChange={v => { setVibrate(v); try { window.localStorage.setItem(VIBRATE_KEY, v ? "on" : "off"); } catch { /* storage off */ } }} />
      <Switch label="Less motion" sub="Fewer animations in Ludo, Snakes & Ladders and Chess" on={lessMotion} onChange={v => { setLessMotion(v); setMotionReduced(v); }} />
    </section>
    <p className="ax-note">Sound is set inside each game.</p>
    <h2 className="ax-kicker">ABOUT</h2>
    <section className="ax-card ax-list" aria-label="About">
      <LinkRow label="Privacy Policy" href="/privacy/" />
      <LinkRow label="Terms of Service" href="/terms/" />
      <LinkRow label="Delete my account" href="/delete-account/" />
    </section>
    <p className="ax-note">Royal Club Games{version ? ` · version ${version}` : ""}</p>
  </div>;
}
