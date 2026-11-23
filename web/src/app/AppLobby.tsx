/* The app-style game lobby (Android app only; the website keeps <PlayStart>'s page). Same props as <PlayStart>, so
   every game that uses it gets this lobby: big artwork with a back arrow and a rules button, the game's name, a
   "Continue your game" card when there is one, "How do you want to play?" mode cards (vs Computer, Pass & Play when the
   game has it, With Friends), that mode's own options, the game's extra options (token sets, dice, start rule…) and a
   big PLAY button at the bottom. Nothing the game offers is removed: the same controls, laid out like an app. */
import { useState } from "react";
import { GameArtDefs } from "../home/GameArt";
import { CPU_LEVELS, RoomAccountLine, type StartProps } from "../room/RoomScreens";
import { bgVars, useBg } from "./theme";
import "./app-lobby.css";

type Mode = "computer" | "pass" | "friends";
const MODE_KEY = (game: string) => `rc-tab-${game.toLowerCase().replace(/[^a-z]+/g, "-")}`;

const I = {
  back: <path d="M15 5l-7 7 7 7" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></>,
  bot: <><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 7V4" /><circle cx="9" cy="13" r="1.3" fill="currentColor" /><circle cx="15" cy="13" r="1.3" fill="currentColor" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  friends: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.3.2 4 1.8 4.5 4.5" /></>,
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  close: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
};
const Ico = ({ d, size = 24 }: { d: keyof typeof I; size?: number }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[d]}</svg>;

export default function AppLobby(p: StartProps) {
  const f = p.friends;
  const hasPass = !!p.passPlay && !!p.passStart;
  const [mode, setModeState] = useState<Mode>(() => {
    if (p.msg) return "friends";
    try {
      const t = window.localStorage.getItem(MODE_KEY(p.game));
      return t === "friends" ? "friends" : t === "pass" && hasPass ? "pass" : "computer";
    } catch { return "computer"; }
  });
  const setMode = (m: Mode) => { setModeState(m); try { window.localStorage.setItem(MODE_KEY(p.game), m); } catch { /* storage off */ } };
  const [rules, setRules] = useState(false);
  const bg = useBg();

  const card = (m: Mode, icon: keyof typeof I, title: string, sub: string) =>
    <button type="button" role="radio" aria-checked={mode === m} className={`al-mode${mode === m ? " on" : ""}`} onClick={() => setMode(m)}>
      <span className="al-mode-ico"><Ico d={icon} /></span>
      <span className="al-mode-txt"><strong>{title}</strong><small>{sub}</small></span>
      <span className="al-check" aria-hidden="true">{mode === m ? "✓" : ""}</span>
    </button>;

  const play = mode === "computer" ? { label: p.vsComputer.playLabel?.replace(/\s*→$/, "") ?? "START GAME", go: p.vsComputer.onPlay, busy: false }
    : mode === "pass" ? { label: "START GAME", go: p.passStart!, busy: false }
    : { label: f.busy ? "Connecting…" : "CREATE A ROOM", go: f.onCreate, busy: f.busy };

  return <section className="al-page" style={bgVars(bg)}>
    <GameArtDefs />
    <div className="al-scroll">
      <header className="al-hero">
        <div className="al-hero-bg" aria-hidden="true">{p.art}</div>
        <div className="al-hero-art" aria-hidden="true">{p.art}</div>
        <div className="al-hero-shade" aria-hidden="true" />
        <div className="al-hero-top">
          <button type="button" className="al-round" onClick={p.onBack} aria-label="Back"><Ico d="back" /></button>
          {p.rules && <button type="button" className="al-round" onClick={() => setRules(true)} aria-label="How to play" aria-haspopup="dialog"><Ico d="help" size={22} /></button>}
        </div>
        <div className="al-hero-title">
          <h1>{p.game}</h1>
          <p>{p.meta ?? p.tagline}</p>
        </div>
      </header>

      <div className="al-body">
        {p.extra && <div className="al-extra">{p.extra}</div>}

        <p className="al-kicker" id="al-modes">HOW DO YOU WANT TO PLAY?</p>
        <div className="al-modes" role="radiogroup" aria-labelledby="al-modes">
          {card("computer", "bot", "vs Computer", "Play anytime · works offline")}
          {hasPass && card("pass", "phone", "Pass & Play", "One phone, take turns")}
          {card("friends", "friends", "With Friends", "Create a room or join with a code")}
        </div>

        {mode === "computer" && <div className="al-box">
          <div className="al-row">
            <span className="al-row-label">Opponents</span>
            <div className="al-seg" role="group" aria-label="Computer players">
              {p.vsComputer.options.map(n => <button key={n} type="button" className={p.vsComputer.count === n ? "on" : ""} aria-pressed={p.vsComputer.count === n} onClick={() => p.vsComputer.onCount(n)}>{n}</button>)}
            </div>
          </div>
          {p.vsComputer.level && <div className="al-row al-row-level">
            <span className="al-row-label">Level</span>
            <div className="al-seg al-level" role="radiogroup" aria-label="Computer level">
              {CPU_LEVELS.map(l => <button key={l.id} type="button" role="radio" className={p.vsComputer.level!.value === l.id ? "on" : ""} aria-checked={p.vsComputer.level!.value === l.id} onClick={() => p.vsComputer.level!.onLevel(l.id)}>{l.name}<small>{l.note}</small></button>)}
            </div>
          </div>}
        </div>}

        {mode === "pass" && <div className="al-box al-pass">{p.passPlay}</div>}

        {mode === "friends" && <div className="al-box al-friends">
          <RoomAccountLine />
          <p className="al-or"><span>Join a friend's room</span></p>
          <div className="al-join">
            <input value={f.code} maxLength={4} autoCapitalize="characters" autoComplete="off" aria-label="Room code" placeholder="Code" onChange={e => f.onCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            <input value={f.pass} maxLength={4} inputMode="numeric" autoComplete="off" aria-label="Passcode" placeholder="Passcode" onChange={e => f.onPass(e.target.value.replace(/\D/g, ""))} />
            <button type="button" className="al-join-btn" disabled={f.busy} onClick={f.onJoin}>Join</button>
          </div>
          <p className="al-note">Or create your own room with the button below and share the code. Empty seats can be filled with computer players.</p>
        </div>}

        {p.msg && <p className="al-msg" role="alert">{p.msg}</p>}

        {p.after && <>
          <p className="al-kicker">YOUR STYLE &amp; OPTIONS</p>
          <div className="al-after">{p.after}</div>
        </>}
      </div>
    </div>

    <div className="al-foot">
      <button type="button" className="al-play" disabled={play.busy} onClick={play.go}>
        <Ico d="play" size={24} />{play.label.toUpperCase()}
      </button>
    </div>

    {rules && p.rules && <div className="al-sheet-scrim" role="presentation" onClick={() => setRules(false)}>
      <div className="al-sheet" role="dialog" aria-modal="true" aria-labelledby="al-rules-t" onClick={e => e.stopPropagation()}>
        <div className="al-sheet-head"><h2 id="al-rules-t">How to play {p.game}</h2>
          <button type="button" className="al-round small" onClick={() => setRules(false)} aria-label="Close" autoFocus><Ico d="close" size={20} /></button></div>
        <div className="al-sheet-body">{p.rules}</div>
      </div>
    </div>}
  </section>;
}
