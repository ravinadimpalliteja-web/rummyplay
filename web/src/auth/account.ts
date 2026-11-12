/**
 * The player's Royal Club account, shared by the header, the sign-in dialog and the room screens.
 *
 * Username accounts are Supabase email/password accounts under a private address made from the username
 * (`<username>@players.royalclubgames.com`), so players never type or need an email. Every account — username or
 * Google — has a unique username in `player_profiles.username`. Guests can play on this device only; rooms need
 * a signed-in account with a username.
 */
import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
export const USERNAME_HINT = "3–16 letters, numbers or _";
const USERNAME_DOMAIN = "players.royalclubgames.com";
export const usernameEmail = (name: string) => `${name.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
/** Signed up with a username and password (not Google, not a guest). */
export const isUsernameAccount = (s: Session | null) => !!s && !s.user.is_anonymous && (s.user.app_metadata?.provider ?? "email") === "email";
const isPrivateAddress = (email?: string | null) => !email || email.endsWith("@" + USERNAME_DOMAIN);
/** The confirmed recovery email on a username account, or null. */
export const recoveryEmail = (s: Session | null) => (isUsernameAccount(s) && !isPrivateAddress(s?.user.email) ? s!.user.email! : null);
/** An email change waiting for the player to click the confirmation link. */
export const pendingEmail = (s: Session | null) => (s?.user.new_email && !isPrivateAddress(s.user.new_email) ? s.user.new_email : null);

export type Account = {
  ready: boolean;            // first session check finished
  session: Session | null;
  guest: boolean;            // anonymous sign-in
  username: string | null;   // null for guests and for accounts that haven't picked one yet
  recovering: boolean;       // arrived from a "reset your password" email: ask for a new password
};

const NAME_KEY = "rc-username";
let state: Account = { ready: !supabase, session: null, guest: false, username: null, recovering: false };
const subs = new Set<() => void>();
function set(patch: Partial<Account>) {
  state = { ...state, ...patch };
  try {
    if (state.username) window.localStorage.setItem(NAME_KEY, state.username);
    else if (state.ready) window.localStorage.removeItem(NAME_KEY);
  } catch { /* storage off */ }
  subs.forEach(f => f());
}
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getAccount = () => state;
export const useAccount = () => useSyncExternalStore(subscribe, getAccount, getAccount);

async function loadUsername(session: Session | null): Promise<string | null> {
  const c = supabase;
  if (!c || !session || session.user.is_anonymous) return null;
  const { data, error } = await c.from("player_profiles").select("username").eq("user_id", session.user.id).maybeSingle();
  if (error) { console.error("Could not read the player profile:", error.message); return null; }
  return (data?.username as string | null | undefined) ?? null;
}

let started = false;
/** Start following the Supabase session (safe to call more than once). */
export function startAccount() {
  const c = supabase;
  if (started || !c) return;
  started = true;
  const apply = async (session: Session | null) => {
    const uid = session?.user.id ?? null, same = uid !== null && uid === state.session?.user.id;
    set({ session, guest: !!session?.user.is_anonymous, username: same ? state.username : null });
    if (same && state.username) { if (!state.ready) set({ ready: true }); return; }
    const username = await loadUsername(session);
    if ((state.session?.user.id ?? null) === uid) set({ username, ready: true });
  };
  void c.auth.getSession().then(({ data }) => apply(data.session));
  c.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") set({ recovering: true });
    window.setTimeout(() => void apply(session), 0);
  });
}

/** True when nobody has that username yet (case-insensitive). */
export async function usernameAvailable(name: string): Promise<boolean | null> {
  const c = supabase;
  if (!c || !USERNAME_RE.test(name)) return null;
  const { data, error } = await c.rpc("username_available", { name });
  if (error) return null;
  return data === true;
}

/** Save the username on the signed-in account. Returns an error message, or "" on success. */
export async function claimUsername(name: string): Promise<string> {
  const c = supabase, s = state.session;
  if (!c || !s) return "Please sign in first.";
  if (!USERNAME_RE.test(name)) return `Usernames are ${USERNAME_HINT}.`;
  const { error } = await c.from("player_profiles").upsert({
    user_id: s.user.id, username: name, display_name: name, updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  if (error) return error.code === "23505" ? "That username is taken. Try another one." : "Could not save your username. Please try again.";
  set({ username: name });
  return "";
}

export type AuthReason = "signin" | "rooms" | "username";
/** Open the sign-in dialog (the header listens for this). */
export function openAuth(reason: AuthReason = "signin") {
  window.dispatchEvent(new CustomEvent<AuthReason>("rc:auth", { detail: reason }));
}

export const ROOM_SIGNIN_MSG = "Sign in with your Royal Club username to play with friends.";

/**
 * What a room create/join needs: a fresh sign-in token and the username. When the player is a guest, signed out or
 * has no username yet, opens the right dialog and returns null.
 */
export async function roomAccount(): Promise<{ token: string; username: string } | null> {
  const c = supabase;
  if (!c) { openAuth("rooms"); return null; }
  const { data } = await c.auth.getSession();           // refreshes an expired token
  const s = data.session;
  if (!s || s.user.is_anonymous) { openAuth("rooms"); return null; }
  const username = (state.session?.user.id === s.user.id && state.username) || await loadUsername(s);
  if (!username) { openAuth("username"); return null; }
  return { token: s.access_token, username };
}

/** The server turned the sign-in down (expired, guest, no username): show the dialog again. */
export function onRoomAuthError(m: Record<string, unknown>) {
  if (m.t === "err" && m.auth) openAuth(state.session && !state.guest && !state.username ? "username" : "rooms");
}

export const doneRecovering = () => set({ recovering: false });

/**
 * Sign in with a username. Accounts without a recovery email sign in directly; once a player has added a recovery
 * email, their sign-in address is that email, so a small Supabase function looks it up privately and signs them in.
 */
export async function signInWithUsername(name: string, password: string): Promise<string> {
  const c = supabase;
  if (!c) return "Accounts are not set up in this version of the site.";
  const first = await c.auth.signInWithPassword({ email: usernameEmail(name), password });
  if (!first.error) return "";
  if (!/invalid login credentials/i.test(first.error.message)) return first.error.message;
  const { data, error } = await c.functions.invoke("username-signin", { body: { username: name, password } });
  if (error || !data?.access_token || !data?.refresh_token) return "Invalid login credentials";
  const { error: setErr } = await c.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  return setErr ? setErr.message : "";
}

/** Add or change the recovery email; Supabase emails a confirmation link. Returns an error message or "". */
export async function setRecoveryEmail(email: string): Promise<string> {
  const c = supabase;
  if (!c) return "Accounts are not set up in this version of the site.";
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return "Enter a valid email address.";
  if (clean.endsWith("@" + USERNAME_DOMAIN)) return "Enter your own email address.";
  const { error } = await c.auth.updateUser({ email: clean }, { emailRedirectTo: `${window.location.origin}/?email=confirmed` });
  if (!error) return "";
  if (/already.*(registered|exists|used)/i.test(error.message)) return "That email is already used by another account.";
  if (/rate limit|too many|security purposes/i.test(error.message)) return "Please wait a minute before trying again.";
  return "Could not send the confirmation email. Please try again.";
}

/** Email a password-reset link to a recovery email. Always says the same thing, so it can't be used to find accounts. */
export async function sendPasswordReset(email: string): Promise<string> {
  const c = supabase;
  if (!c) return "Accounts are not set up in this version of the site.";
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return "Enter the recovery email on your account.";
  const { error } = await c.auth.resetPasswordForEmail(clean, { redirectTo: `${window.location.origin}/` });
  if (error && /rate limit|too many|security purposes/i.test(error.message)) return "Please wait a minute before trying again.";
  return "";
}

/** Remember that a game was played on this device (the "Protect your account" reminder waits for this). */
export function markPlayed() { try { window.localStorage.setItem("rc-played", "1"); } catch { /* storage off */ } }
