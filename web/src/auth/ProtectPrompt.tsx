import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isUsernameAccount, pendingEmail, recoveryEmail, useAccount } from "./account";

/**
 * "Protect your account" — a gentle reminder for username accounts with no recovery email.
 * Shown after the player's first game, then again at most every 7 days, 3 times in all; "Don't ask again" stops it.
 * Google accounts never see it.
 */
const WEEK = 7 * 24 * 60 * 60 * 1000;
type Memo = { shown: number; next: number; never: boolean };
const key = (uid: string) => `rc-protect-${uid}`;
function read(uid: string): Memo {
  try { return { shown: 0, next: 0, never: false, ...JSON.parse(window.localStorage.getItem(key(uid)) || "{}") }; }
  catch { return { shown: 0, next: 0, never: false }; }
}
function write(uid: string, m: Memo) { try { window.localStorage.setItem(key(uid), JSON.stringify(m)); } catch { /* storage off */ } }
function played() { try { return window.localStorage.getItem("rc-played") === "1"; } catch { return false; } }

export default function ProtectPrompt({ onProfile }: { onProfile: () => void }) {
  const { session, username, recovering } = useAccount();
  const [open, setOpen] = useState(false);
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid || !username || recovering || !isUsernameAccount(session) || recoveryEmail(session) || pendingEmail(session) || !played()) return;
    const m = read(uid);
    if (m.never || m.shown >= 3 || Date.now() < m.next) return;
    const t = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(t);
  }, [uid, username, recovering, session?.user.email, session?.user.new_email]);

  if (!open || !uid) return null;
  const close = (never: boolean) => {
    const m = read(uid);
    write(uid, { shown: m.shown + 1, next: Date.now() + WEEK, never: never || m.shown + 1 >= 3 });
    setOpen(false);
  };
  return createPortal(<div className="auth-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(false); }}>
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="protect-title">
      <div className="auth-kicker">ROYAL CLUB GAMES</div>
      <h2 id="protect-title">Protect your account</h2>
      <p className="auth-intro">Add a recovery email so you can reset your password if you ever forget it. You'll still sign in as <b>{username}</b> — your email stays private.</p>
      <button className="auth-option auth-primary" onClick={() => { close(false); onProfile(); }}>Add recovery email</button>
      <button className="auth-option" onClick={() => close(false)}>Maybe later</button>
      <button className="auth-link" onClick={() => close(true)}>Don't ask again</button>
    </section>
  </div>, document.body);
}
