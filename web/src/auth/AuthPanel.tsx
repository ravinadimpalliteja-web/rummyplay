import { useEffect, useState, type FormEvent } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type AuthMode = "guest" | "google" | "email";
type EmailMode = "signin" | "signup";

function profileName(user: User) {
  const metadataName = user.user_metadata?.full_name || user.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();
  if (user.email) return user.email.split("@")[0];
  return "Guest Player";
}

async function saveProfile(user: User) {
  if (!supabase) return;
  const { error } = await supabase.from("player_profiles").upsert({
    user_id: user.id,
    display_name: profileName(user),
    avatar_url: typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  if (error) console.error("Could not save player profile:", error.message);
}

export default function AuthPanel() {
  const client = supabase;
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [emailMode, setEmailMode] = useState<EmailMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<AuthMode | "email" | "signout" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!client) return;
    let active = true;
    client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      if (data.session?.user) void saveProfile(data.session.user);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) window.setTimeout(() => void saveProfile(nextSession.user), 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const run = async (kind: AuthMode | "email" | "signout", action: () => Promise<{ error: { message: string } | null; data?: any }>) => {
    setBusy(kind); setError(""); setMessage("");
    try {
      const result = await action();
      if (result.error) throw result.error;
      if (kind === "email" && emailMode === "signup") {
        setMessage("Check your email for the confirmation link. Then return here to sign in.");
      } else {
        setMessage(kind === "guest" ? "Guest profile ready. You can play now." : "Sign-in request completed.");
        if (kind !== "signout") setOpen(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(null); }
  };

  const guest = () => supabase && void run("guest", () => supabase.auth.signInAnonymously());
  const google = () => supabase && void run("google", () => supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
  }));
  const submitEmail = (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    if (emailMode === "signup") {
      void run("email", () => supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin, data: { display_name: email.split("@")[0] } }
      }));
    } else {
      void run("email", () => supabase.auth.signInWithPassword({ email: email.trim(), password }));
    }
  };
  const signOut = () => supabase && void run("signout", () => supabase.auth.signOut());

  if (!isSupabaseConfigured || !supabase) {
    return <button className="account-trigger" onClick={() => { setOpen(true); setError("Account sign-in is not configured in this deployment yet."); }}>Player account</button>;
  }

  return <>
    {session?.user ? <div className="account-user">
      <button className="account-trigger" onClick={() => setOpen(v => !v)}>
        <span className="account-avatar">{profileName(session.user).slice(0, 1).toUpperCase()}</span>
        <span>{session.user.is_anonymous ? "Guest player" : profileName(session.user)}</span>
      </button>
      {open && <div className="account-popover">
        <strong>{session.user.is_anonymous ? "Playing as guest" : "Player account"}</strong>
        <p>{session.user.email || "Guest sessions are currently tied to this browser. Account linking will be added in the next stage."}</p>
        <button className="account-secondary" disabled={busy !== null} onClick={signOut}>Sign out</button>
      </div>}
    </div> : <button className="account-trigger" onClick={() => { setOpen(true); setError(""); setMessage(""); }}>Sign in</button>}
    {open && !session?.user && <div className="auth-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
        <div className="auth-kicker">ROYAL CLUB GAMES</div>
        <h2 id="auth-title">Your games. Your progress.</h2>
        <p className="auth-intro">Play as a guest or sign in to build your player profile.</p>
        <button className="auth-option auth-primary" disabled={busy !== null} onClick={guest}>{busy === "guest" ? "Starting guest play…" : "Continue as Guest"}</button>
        <button className="auth-option" disabled={busy !== null} onClick={google}>{busy === "google" ? "Connecting to Google…" : "Continue with Google"}</button>
        <div className="auth-divider"><span>or use email</span></div>
        <form onSubmit={submitEmail} className="auth-form">
          <div className="auth-form-heading"><strong>{emailMode === "signin" ? "Email sign in" : "Create an account"}</strong><button type="button" onClick={() => { setEmailMode(v => v === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>{emailMode === "signin" ? "Create account" : "I already have an account"}</button></div>
          <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          <label>Password<input type="password" autoComplete={emailMode === "signin" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" /></label>
          <button className="auth-option auth-email" type="submit" disabled={busy !== null}>{busy === "email" ? "Please wait…" : emailMode === "signin" ? "Sign in with Email" : "Create account"}</button>
        </form>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-message" role="status">{message}</p>}
        <small className="auth-footnote">By continuing, your player profile is stored securely with Royal Club Games.</small>
      </section>
    </div>}
    {message && !open && <span className="auth-toast" role="status">{message}</span>}
  </>;
}
