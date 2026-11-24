/* The Royal Club in-game top bar, shared by every game (styles in /public/rc-ui.css, which the plain-HTML games use too):
   a square ← button, the Royal Club badge with the game's name and where you are (room code, practice…),
   then square icon buttons (sound, settings, rules). */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export const SoundIcon = ({ on }: { on: boolean }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" />{on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}</svg>;
export const GearIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" /></svg>;
export const RulesIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7" /><path d="M12 17h.01" /></svg>;
export const ScoresIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
export const PaletteIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1-.8-1.4-.8-2.4 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" /><circle cx="7.5" cy="11" r="1.2" /><circle cx="10.5" cy="7" r="1.2" /><circle cx="15" cy="7.5" r="1.2" /></svg>;

export function GameBar(p: { game: string; where?: string; onBack: () => void; backLabel: string; dark?: boolean; children?: ReactNode; className?: string }) {
  return <header className={`rc-bar${p.dark ? " dark" : ""}${p.className ? " " + p.className : ""}`}>
    <button type="button" className="rc-bar-back" onClick={p.onBack} aria-label={p.backLabel}>←</button>
    <span className="rc-bar-brand"><img src="/brand/badge-logo-small.webp" alt="" width="320" height="269" /><span className="rc-bar-name"><strong>{p.game}</strong>{p.where && <small>{p.where}</small>}</span></span>
    {p.children && <span className="rc-bar-tools">{p.children}</span>}
  </header>;
}

export function IconButton(p: { label: string; onClick: () => void; pressed?: boolean; expanded?: boolean; children: ReactNode }) {
  return <button type="button" className="rc-ibtn" onClick={p.onClick} aria-label={p.label} title={p.label} aria-pressed={p.pressed} aria-expanded={p.expanded}>{p.children}</button>;
}

/** The shared turn timer: a ring that empties as the seconds run out, saffron and pulsing in the last 5, one buzz at 5. */
export function TurnTimer({ secs, small, onDark }: { secs: number | null; small?: boolean; onDark?: boolean }) {
  const total = useRef(0), buzzed = useRef(false);
  if (secs === null) { total.current = 0; buzzed.current = false; }
  else if (secs > total.current) { total.current = secs; buzzed.current = false; }
  useEffect(() => {
    if (secs !== null && secs <= 5 && secs > 0 && !buzzed.current) { buzzed.current = true; try { navigator.vibrate?.(80); } catch { /* not supported */ } }
  }, [secs]);
  if (secs === null) return null;
  const p = total.current ? Math.max(0, Math.min(1, secs / total.current)) : 1;
  return <span className={`rc-timer${secs <= 5 ? " low" : ""}${small ? " sm" : ""}${onDark ? " on-dark" : ""}`} style={{ "--p": p } as CSSProperties} role="timer" aria-label={`${secs} seconds left`}><b>{secs}</b></span>;
}
