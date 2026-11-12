import { useState, type FormEvent, type ReactNode } from "react";
import "../room/room.css";
import { supabase } from "../lib/supabase";
import { isUsernameAccount, openAuth, useAccount } from "./account";

/** The player's own account page: who you are, change password, sign out, delete account. */
export default function ProfilePage({ onBack }: { onBack: () => void }) {
  const { ready, session, guest, username } = useAccount();
  const c = supabase;

  const shell = (body: ReactNode) => <section className="mode-page rs-page pf-page">
    <button className="back-link" onClick={onBack}>← Back</button>
    <div className="rs-head">
      <div className="eyebrow">ROYAL CLUB · PROFILE</div>
      <h1>Your profile</h1>
    </div>
    <div className="rs-stack">{body}</div>
  </section>;

  if (!c) return shell(<div className="rs-panel"><p className="rs-note">Accounts are not set up in this version of the site.</p></div>);
  if (!ready) return shell(<div className="rs-panel"><p className="rs-note">Loading…</p></div>);
  if (!session || guest) return shell(<div className="rs-panel">
    <h2>{guest ? "Playing as a guest" : "Not signed in"}</h2>
    <p className="rs-note">{guest ? "Guest games stay on this device. " : ""}Create a free Royal Club username to play with friends and keep your profile.</p>
    <button className="gold-button rs-wide" onClick={() => openAuth("signin")}>Sign in or create an account</button>
  </div>);

  const google = session.user.app_metadata?.provider === "google";
  const since = session.user.created_at ? new Date(session.user.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";

  return shell(<>
    <div className="rs-panel pf-card">
      <span className="pf-avatar">{(username ?? "?").slice(0, 1).toUpperCase()}</span>
      <div>
        <strong className="pf-name">{username ?? "No username yet"}</strong>
        <small className="rs-note">{google ? "Signed in with Google" : "Username account"}{since ? ` · Joined ${since}` : ""}</small>
      </div>
      {!username && <button className="gold-button" onClick={() => openAuth("username")}>Pick username</button>}
    </div>
    {isUsernameAccount(session) && <PasswordPanel />}
    <div className="rs-panel">
      <h2>Recovery email</h2>
      <p className="rs-note">{google
        ? "Your account is protected by Google. If you lose access, sign in with Google again."
        : "Coming soon: add an email so you can reset your password if you forget it. You'll still sign in with your username."}</p>
    </div>
    <div className="rs-panel">
      <button className="ghost-button rs-wide" onClick={() => void c.auth.signOut()}>Sign out</button>
    </div>
    <DeletePanel username={username} onDone={onBack} />
  </>);
}

function PasswordPanel() {
  const [pw, setPw] = useState(""), [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const c = supabase; if (!c) return;
    setMsg(""); setErr("");
    if (pw.length < 6) { setErr("Use a password with at least 6 characters."); return; }
    if (pw !== pw2) { setErr("The two passwords don't match."); return; }
    setBusy(true);
    const { error } = await c.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setErr(/different from the old/i.test(error.message) ? "That's your current password. Choose a new one." : "Could not change the password. Please try again.");
    else { setPw(""); setPw2(""); setMsg("Password changed."); }
  };
  return <form className="rs-panel" onSubmit={e => void save(e)}>
    <h2>Change password</h2>
    <label className="rs-field">New password<input type="password" autoComplete="new-password" minLength={6} value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 6 characters" /></label>
    <label className="rs-field">Confirm new password<input type="password" autoComplete="new-password" minLength={6} value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Type it again" /></label>
    <button className="gold-button rs-wide" type="submit" disabled={busy || !pw}>{busy ? "Saving…" : "Change password"}</button>
    {err && <p className="room-msg rs-msg" role="alert">{err}</p>}
    {msg && <p className="rs-note pf-ok" role="status">{msg}</p>}
  </form>;
}

function DeletePanel({ username, onDone }: { username: string | null; onDone: () => void }) {
  const [open, setOpen] = useState(false), [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const word = username ?? "DELETE";
  const del = async () => {
    const c = supabase; if (!c) return;
    setBusy(true); setErr("");
    const { error } = await c.rpc("delete_my_account");
    if (error) { setBusy(false); setErr("Could not delete the account. Please try again."); return; }
    await c.auth.signOut({ scope: "local" });
    setBusy(false);
    onDone();
  };
  return <div className="rs-panel pf-danger">
    <h2>Delete account</h2>
    {!open ? <>
      <p className="rs-note">Permanently delete your Royal Club account, username and saved games. This can't be undone.</p>
      <button className="ghost-button rs-wide pf-danger-btn" onClick={() => setOpen(true)}>Delete my account…</button>
    </> : <>
      <p className="rs-note">Type <b>{word}</b> to confirm. Your username becomes free for someone else to take.</p>
      <input value={typed} onChange={e => setTyped(e.target.value)} autoCapitalize="none" spellCheck={false} aria-label="Confirm deletion" placeholder={word} />
      <div className="rs-row">
        <button className="ghost-button" onClick={() => { setOpen(false); setTyped(""); setErr(""); }}>Cancel</button>
        <button className="ghost-button pf-danger-btn" disabled={busy || typed.trim().toLowerCase() !== word.toLowerCase()} onClick={() => void del()}>{busy ? "Deleting…" : "Delete forever"}</button>
      </div>
      {err && <p className="room-msg rs-msg" role="alert">{err}</p>}
    </>}
  </div>;
}
