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
export const isUsernameAccount = (s: Session | null) => !!s?.user.email?.endsWith("@" + USERNAME_DOMAIN);

export type Account = {
  ready: boolean;            // first session check finished
  session: Session | null;
  guest: boolean;            // anonymous sign-in
  username: string | null;   // null for guests and for accounts that haven't picked one yet
};

const NAME_KEY = "rc-username";
let state: Account = { ready: !supabase, session: null, guest: false, username: null };
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
  c.auth.onAuthStateChange((_event, session) => { window.setTimeout(() => void apply(session), 0); });
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
