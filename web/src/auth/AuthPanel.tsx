import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
  USERNAME_HINT, USERNAME_RE, claimUsername, startAccount, useAccount, usernameAvailable, usernameEmail,
  type AuthReason
} from "./account";

type Tab = "signin" | "signup";
type Busy = "guest" | "google" | "form" | "signout" | "username" | null;
type Avail = "idle" | "checking" | "free" | "taken" | "bad";

const INTRO: Record<AuthReason, string> = {
  signin: "Sign in with your username to play with friends. No email needed.",
  rooms: "Sign in with your Royal Club username to create or join rooms.",
  username: "Pick the username other players will see."
};

function friendly(message: string, tab: Tab) {
  if (/invalid login credentials/i.test(message)) return "Wrong username or password.";
  if (/already registered|already exists/i.test(message)) return "That username is taken. Try another one.";
  if (/password/i.test(message) && /least|short|weak/i.test(message)) return "Use a password with at least 6 characters.";
  if (/rate limit|too many/i.test(message)) return "Too many tries. Please wait a minute and try again.";
  return tab === "signup" ? "Could not create the account. Please try again." : "Sign-in didn't work. Please try again.";
}

/** Live "is this username free?" check while typing. */
function useAvailability(name: string, enabled: boolean): Avail {
  const [avail, setAvail] = useState<Avail>("idle");
  useEffect(() => {
    if (!enabled || !name) { setAvail("idle"); return; }
    if (!USERNAME_RE.test(name)) { setAvail("bad"); return; }
    setAvail("checking");
    let live = true;
    const t = window.setTimeout(() => {
      void usernameAvailable(name).then(ok => { if (live) setAvail(ok === null ? "idle" : ok ? "free" : "taken"); });
    }, 350);
    return () => { live = false; window.clearTimeout(t); };
  }, [name, enabled]);
  return avail;
}

function AvailLine({ avail }: { avail: Avail }) {
  if (avail === "idle") return <small className="auth-hint">{USERNAME_HINT}</small>;
  if (avail === "checking") return <small className="auth-hint">Checking…</small>;
  if (avail === "free") return <small className="auth-hint ok">✓ Available</small>;
  if (avail === "taken") return <small className="auth-hint bad">✗ Already taken</small>;
  return <small className="auth-hint bad">{USERNAME_HINT}</small>;
}

export default function AuthPanel() {
  const account = useAccount();
  const { session, guest, username, ready } = account;
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reason, setReason] = useState<AuthReason>("signin");
  const [tab, setTab] = useState<Tab>("signin");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const needsUsername = !!session && !guest && ready && !username;
  const signupAvail = useAvailability(name, open && tab === "signup" && !needsUsername);
  const pickAvail = useAvailability(pick, open && needsUsername);

  useEffect(() => { startAccount(); }, []);

  const show = (why: AuthReason) => { setReason(why); setError(""); setTab("signin"); setMenu(false); setOpen(true); };

  // Opened from elsewhere (room buttons, EKAH's "sign in" link, sign-in errors coming back from Google).
  useEffect(() => {
    const onAsk = (e: Event) => show((e as CustomEvent<AuthReason>).detail || "signin");
    window.addEventListener("rc:auth", onAsk);
    const read = (q: string) => new URLSearchParams(q.replace(/^[?#]/, ""));
    const q = read(window.location.search), h = read(window.location.hash);
    if (q.get("error") || h.get("error")) {
      const detail = q.get("error_description") || h.get("error_description") || "";
      show("signin");
      setError(/expired|invalid.*(link|otp)/i.test(detail) ? "That sign-in link has expired. Please try again." : "Sign-in didn't work this time. Please try again.");
      window.history.replaceState(null, "", window.location.pathname);
    } else if (q.get("signin")) {
      show(q.get("signin") === "rooms" ? "rooms" : "signin");
      window.history.replaceState(null, "", window.location.pathname);
    }
    return () => window.removeEventListener("rc:auth", onAsk);
  }, []);

  // A signed-in account without a username (new Google players) is asked to pick one.
  useEffect(() => { if (needsUsername) { setReason("username"); setOpen(true); } }, [needsUsername]);
  // Close the dialog once the player is fully signed in.
  useEffect(() => { if (open && session && !guest && username) setOpen(false); }, [session, guest, username]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(""), 3500); return () => window.clearTimeout(t); }, [toast]);

  const c = supabase;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!c) return;
    const u = name.trim();
    if (!USERNAME_RE.test(u)) { setError(`Usernames are ${USERNAME_HINT}.`); return; }
    if (password.length < 6) { setError("Use a password with at least 6 characters."); return; }
    if (tab === "signup" && password !== password2) { setError("The two passwords don't match."); return; }
    if (tab === "signup" && signupAvail === "taken") { setError("That username is taken. Try another one."); return; }
    setBusy("form"); setError("");
    try {
      if (guest) await c.auth.signOut();               // a guest creating an account starts a fresh one
      if (tab === "signin") {
        const { error: err } = await c.auth.signInWithPassword({ email: usernameEmail(u), password });
        if (err) throw err;
        setToast("Welcome back!");
      } else {
        const { data, error: err } = await c.auth.signUp({ email: usernameEmail(u), password, options: { data: { username: u } } });
        if (err) throw err;
        if (!data.session) throw new Error("Account created, but sign-in is waiting for email confirmation.");
        const claimErr = await claimUsername(u);
        if (claimErr) { setError(claimErr); return; }
        setToast(`Welcome, ${u}!`);
      }
      setPassword(""); setPassword2("");
    } catch (x) {
      const msg = x instanceof Error ? x.message : String(x);
      setError(/email confirmation/.test(msg) ? msg : friendly(msg, tab));
    } finally { setBusy(null); }
  };

  const savePick = async (e: FormEvent) => {
    e.preventDefault();
    const u = pick.trim();
    if (pickAvail === "taken") { setError("That username is taken. Try another one."); return; }
    setBusy("username"); setError("");
    const err = await claimUsername(u);
    setBusy(null);
    if (err) setError(err); else setToast(`You're ${u} now.`);
  };

  const google = async () => {
    if (!c) return;
    setBusy("google"); setError("");
    const { error: err } = await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/` } });
    if (err) { setError("Could not reach Google. Please try again."); setBusy(null); }
  };
  const playAsGuest = async () => {
    if (!c) return;
    setBusy("guest"); setError("");
    const { error: err } = await c.auth.signInAnonymously();
    setBusy(null);
    if (err) setError("Could not start guest play. Please try again.");
    else { setOpen(false); setToast("Playing as a guest on this device."); }
  };
  const signOut = async () => {
    if (!c) return;
    setBusy("signout");
    await c.auth.signOut();
    setBusy(null); setMenu(false); setToast("Signed out.");
  };

  if (!isSupabaseConfigured || !c) {
    return <button className="account-trigger" onClick={() => setToast("Accounts are not set up in this version of the site.")}>Sign in{toast && createPortal(<span className="auth-toast" role="status">{toast}</span>, document.body)}</button>;
  }

  const shownName = username ?? (guest ? "Guest" : session ? "Pick a username" : "");
  const header = session
    ? <div className="account-user" ref={menuRef}>
        <button className="account-trigger" onClick={() => needsUsername ? show("username") : setMenu(v => !v)} aria-expanded={menu}>
          <span className="account-avatar">{(username ?? "G").slice(0, 1).toUpperCase()}</span>
          <span>{shownName}</span>
        </button>
        {menu && <div className="account-popover">
          {guest ? <>
            <strong>Playing as a guest</strong>
            <p>Your games stay on this device. Create a username to play with friends in rooms.</p>
            <button className="account-secondary auth-strong" onClick={() => { show("signin"); setTab("signup"); }}>Create an account</button>
            <button className="account-secondary" onClick={() => show("signin")}>I have an account</button>
          </> : <>
            <strong>{username}</strong>
            <p>{isGoogle(session) ? "Signed in with Google" : "Royal Club account"}</p>
          </>}
          <button className="account-secondary" disabled={busy !== null} onClick={() => void signOut()}>Sign out</button>
        </div>}
      </div>
    : <button className="account-trigger" onClick={() => show("signin")}>Sign in</button>;

  const dialog = needsUsername
    ? <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
        <div className="auth-kicker">ROYAL CLUB GAMES</div>
        <h2 id="auth-title">Pick your username</h2>
        <p className="auth-intro">{INTRO.username}{session && isGoogle(session) ? " You'll keep signing in with Google." : ""}</p>
        <form onSubmit={e => void savePick(e)} className="auth-form">
          <label>Username<input autoFocus autoComplete="username" maxLength={16} value={pick} onChange={e => setPick(e.target.value.replace(/\s/g, ""))} placeholder="e.g. RaviKing" /></label>
          <AvailLine avail={pickAvail} />
          <button className="auth-option auth-primary" type="submit" disabled={busy !== null || pickAvail !== "free"}>{busy === "username" ? "Saving…" : "Save username"}</button>
        </form>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-link" disabled={busy !== null} onClick={() => void signOut()}>Sign out instead</button>
      </section>
    : <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
        <div className="auth-kicker">ROYAL CLUB GAMES</div>
        <h2 id="auth-title">{tab === "signin" ? "Welcome back" : "Create your account"}</h2>
        <p className="auth-intro">{reason === "rooms" ? INTRO.rooms : tab === "signup" ? "Choose a username and password. No email needed." : INTRO.signin}</p>
        <div className="auth-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "signin"} className={tab === "signin" ? "on" : ""} onClick={() => { setTab("signin"); setError(""); }}>Sign in</button>
          <button role="tab" aria-selected={tab === "signup"} className={tab === "signup" ? "on" : ""} onClick={() => { setTab("signup"); setError(""); }}>Create account</button>
        </div>
        <form onSubmit={e => void submit(e)} className="auth-form">
          <label>Username<input autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={16} required value={name} onChange={e => setName(e.target.value.replace(/\s/g, ""))} placeholder="Your username" /></label>
          {tab === "signup" && <AvailLine avail={signupAvail} />}
          <label>Password<input type="password" autoComplete={tab === "signin" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" /></label>
          {tab === "signup" && <label>Confirm password<input type="password" autoComplete="new-password" minLength={6} required value={password2} onChange={e => setPassword2(e.target.value)} placeholder="Type it again" /></label>}
          <button className="auth-option auth-primary" type="submit" disabled={busy !== null || (tab === "signup" && signupAvail === "taken")}>{busy === "form" ? "Please wait…" : tab === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        {tab === "signup" && <small className="auth-footnote">Keep your password safe — there's no email to reset it yet. You can add a recovery email later.</small>}
        <div className="auth-divider"><span>or</span></div>
        <button className="auth-option" disabled={busy !== null} onClick={() => void google()}>{busy === "google" ? "Connecting to Google…" : "Continue with Google"}</button>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {!session && reason !== "rooms" && <button className="auth-link" disabled={busy !== null} onClick={() => void playAsGuest()}>{busy === "guest" ? "Starting…" : "Just play as a guest (no rooms)"}</button>}
      </section>;

  return <>
    {header}
    {open && createPortal(<div className="auth-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>{dialog}</div>, document.body)}
    {toast && createPortal(<span className="auth-toast" role="status">{toast}</span>, document.body)}
  </>;
}

function isGoogle(s: { user: { app_metadata?: { provider?: string } } }) {
  return s.user.app_metadata?.provider === "google";
}
