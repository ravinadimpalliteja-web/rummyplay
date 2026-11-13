import { useState, type ReactNode } from "react";
import "./room.css";
import { openAuth, useAccount } from "../auth/account";

/* The Royal Club room format, shared by every game (modelled on EKAH). Use these two screens for any new game:

   1. <PlayStart>    one start screen: a "Play vs computer" box and a "Play with friends" box
                     (create a room in one tap, or join with the room code and passcode). Extra boxes (for example
                     Ludo's pass & play) go in `extra`; the game's rules go in `rules`.
   2. <WaitingRoom>  the room code card (code, passcode, Copy invite), the players list (Host, Computer, You, offline),
                     the host's Add computer / Remove computer buttons, the Start button, then anything game-specific
                     (for example the token picker) in `children`, and Leave room.

   The room server side is the same for every game: rooms hold 2 to 4 seats; the host adds or removes computer players in
   the waiting room ('addBot' / 'removeBot'); a friend joining a full waiting room takes a computer player's seat; the
   state sent to each player lists seats as { seat, name, bot, connected } and says who the host is (hostSeat). */

/** The player's name, shared by every game on this device (EKAH's saved name is used if there is none yet). */
const NAME_KEY = "rc-player-name";
export function savedName(): string {
  try { return window.localStorage.getItem(NAME_KEY) || window.localStorage.getItem("ekahName") || ""; } catch { return ""; }
}
export function saveName(n: string) { try { window.localStorage.setItem(NAME_KEY, n.trim()); } catch { /* storage off: still works for this visit */ } }

export type StartProps = {
  game: string;                         // e.g. "Snakes & Ladders"
  tagline: string;                      // one line under the title
  onBack: () => void;
  /** Play vs computer: how many computer players, and what starts it. */
  vsComputer: { count: number; options: number[]; onCount: (n: number) => void; onPlay: () => void; playLabel?: string };
  /** Play with friends. `busy` while connecting. */
  friends: { onCreate: () => void; code: string; onCode: (c: string) => void; pass: string; onPass: (p: string) => void; onJoin: () => void; busy: boolean };
  msg?: string;
  extra?: ReactNode;                    // more boxes between the two (for example pass & play)
  after?: ReactNode;                    // below the boxes (for example style choices)
  rules?: ReactNode;                    // shown under "How to play"
  className?: string;
};

/** Who you'll be in rooms: your username, or a prompt to sign in. */
export function RoomAccountLine() {
  const a = useAccount();
  if (a.session && !a.guest && a.username) return <p className="rs-note rs-account"><span>Playing as <b>{a.username}</b></span></p>;
  return <p className="rs-note rs-account"><span>{a.session && !a.guest ? "Pick a username to play with friends." : "Sign in with your username to play with friends."}</span>
    <button type="button" className="text-button" onClick={() => openAuth(a.session && !a.guest ? "username" : "rooms")}>{a.session && !a.guest ? "Pick username" : "Sign in"}</button></p>;
}

export function PlayStart(p: StartProps) {
  const f = p.friends;
  return <section className={`mode-page rs-page ${p.className ?? ""}`}>
    <div className="rs-watermark" aria-hidden="true" />
    <button className="back-link" onClick={p.onBack}>← Back</button>
    <div className="rs-head">
      <div className="eyebrow">ROYAL CLUB · {p.game.toUpperCase()}</div>
      <h1>{p.game}</h1>
      <p>{p.tagline}</p>
    </div>
    <div className="rs-stack">
      <div className="rs-panel">
        <h2>Play vs computer</h2>
        <div className="rs-field">Computer players
          <div className="rs-chips" role="group" aria-label="Computer players">{p.vsComputer.options.map(n => <button key={n} type="button" className={p.vsComputer.count === n ? "on" : ""} aria-pressed={p.vsComputer.count === n} onClick={() => p.vsComputer.onCount(n)}>{n}</button>)}</div>
        </div>
        <button className="gold-button rs-wide" onClick={p.vsComputer.onPlay}>{p.vsComputer.playLabel ?? "Play now"}</button>
      </div>
      {p.extra}
      <div className="rs-panel">
        <h2>Play with friends</h2>
        <RoomAccountLine />
        <button className="gold-button rs-wide" disabled={f.busy} onClick={f.onCreate}>{f.busy ? "Connecting…" : "Create a room"}</button>
        <p className="rs-note">Friends join with the room code and passcode. You can add computer players to fill empty seats.</p>
        <div className="rs-row">
          <input id="rs-code" value={f.code} maxLength={4} autoCapitalize="characters" autoComplete="off" aria-label="Room code" placeholder="Code" onChange={e => f.onCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
          <input id="rs-pass" value={f.pass} maxLength={4} inputMode="numeric" autoComplete="off" aria-label="Passcode" placeholder="Passcode" onChange={e => f.onPass(e.target.value.replace(/\D/g, ""))} />
        </div>
        <button className="ghost-button rs-wide" disabled={f.busy} onClick={f.onJoin}>Join room</button>
      </div>
      {p.msg && <p className="room-msg rs-msg" role="alert">{p.msg}</p>}
      {p.after}
      {p.rules && <details className="rs-rules"><summary>How to play</summary>{p.rules}</details>}
    </div>
  </section>;
}

export type WaitSeat = { seat: number; name: string; bot?: boolean; connected: boolean };
export type WaitProps = {
  game: string;
  onBack: () => void;
  code: string; passcode: string;
  /** Message copied by "Copy invite". */
  invite: string;
  seats: (WaitSeat | null)[];
  you: number; hostSeat?: number; isHost: boolean;
  /** Small picture or colour for each seat (token image, colour dot); defaults to the first letter. */
  avatar?: (s: WaitSeat) => ReactNode;
  colors?: string[];
  onAddBot: () => void; onRemoveBot: () => void;
  onStart: () => void;
  /** A reason the game can't start yet (shown instead of the Start button), e.g. an outdated room server. */
  blocked?: ReactNode;
  msg?: string; onMsg: (m: string) => void;
  onLeave: () => void;
  note?: ReactNode;
  children?: ReactNode;                 // game-specific choices before the start (for example the token picker)
  className?: string;
};

export function WaitingRoom(p: WaitProps) {
  const seated = p.seats.filter(Boolean) as WaitSeat[];
  const humansOk = seated.filter(s => !s.bot).every(s => s.connected);
  const ready = seated.length >= 2 && humansOk;
  const full = seated.length >= p.seats.length, anyBot = seated.some(s => s.bot);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try { navigator.clipboard.writeText(p.invite).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }, () => p.onMsg(p.invite)); } catch { p.onMsg(p.invite); }
  };
  const hostSeat = p.hostSeat ?? (p.isHost ? p.you : undefined);
  return <section className={`mode-page rs-page rs-wait ${p.children ? "has-extra" : ""} ${p.className ?? ""}`}>
    <div className="rs-watermark" aria-hidden="true" />
    <button className="back-link" onClick={p.onBack}>← Back</button>
    <div className="rs-stack">
      <div className="rs-panel rs-code-card">
        <small>ROOM CODE</small>
        <b className="rs-code">{p.code}</b>
        <p className="rs-pass">Passcode <b>{p.passcode}</b></p>
        <p className="rs-note">Share the code and passcode with friends.</p>
        <button className="ghost-button" onClick={copy}>{copied ? "Invite copied ✓" : "Copy invite"}</button>
      </div>
      <div className="rs-panel">
        <h2>Players <span className="rs-count">{seated.length} / {p.seats.length}</span></h2>
        <ul className="rs-seats">
          {seated.map(s => <li key={s.seat} className={s.seat === p.you ? "you" : ""}>
            <span className="rs-avatar" style={p.colors ? { borderColor: p.colors[s.seat] } : undefined}>{p.avatar ? p.avatar(s) : (s.bot ? "🤖" : s.name.slice(0, 1).toUpperCase())}</span>
            <span className="rs-name">{s.name}{s.seat === p.you ? " (you)" : ""}</span>
            <span className="rs-tag">{s.bot ? "Computer" : !s.connected ? "Offline" : s.seat === hostSeat ? "Host" : ""}</span>
          </li>)}
          {Array.from({ length: p.seats.length - seated.length }, (_, i) => <li key={"open" + i} className="open"><span className="rs-avatar">+</span><span className="rs-name">Open seat</span></li>)}
        </ul>
        {p.isHost && <div className="rs-row rs-tools">
          <button className="ghost-button" disabled={full} onClick={p.onAddBot}>Add computer</button>
          <button className="ghost-button" disabled={!anyBot} onClick={p.onRemoveBot}>Remove computer</button>
        </div>}
        {p.blocked ? <div className="rs-blocked">{p.blocked}</div>
          : p.isHost ? <button className="gold-button rs-wide" disabled={!ready} onClick={p.onStart}>{ready ? `Start game with ${seated.length} players →` : seated.length < 2 ? "Invite a friend or add a computer" : "Waiting for everyone to come online"}</button>
          : <p className="rs-note rs-center">Waiting for the host to start the game.</p>}
        {p.msg && <p className="room-msg rs-msg" role="alert">{p.msg}</p>}
      </div>
      {p.children && <div className="rs-extra">{p.children}</div>}
      <button className="ghost-button rs-wide rs-leave" onClick={p.onLeave}>Leave room</button>
      {p.note && <p className="rs-note rs-center">{p.note}</p>}
    </div>
  </section>;
}
