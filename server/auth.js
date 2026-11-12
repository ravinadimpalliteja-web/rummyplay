'use strict';
/**
 * Player sign-in check for creating and joining rooms.
 *
 * The website sends the player's Supabase access token with `create` / `join`. We ask Supabase who it belongs to,
 * then read that player's Royal Club username (row-level security lets a player read only their own profile).
 * Guests (anonymous sign-ins) and accounts without a username are turned away.
 *
 * Settings (environment):
 *   ROOM_AUTH=off              turn the check off (used by the automated tests)
 *   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY   default to the Royal Club project; both are public values.
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://cveqalxcpenkncahnexd.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_o89SjkD_5i4ay4JdKhVydw_VzNWbi8G';
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 8000;

const required = () => String(process.env.ROOM_AUTH || '').toLowerCase() !== 'off';
const cache = new Map(); // token -> { user, until }

class AuthError extends Error {}

async function getJson(url, token) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }, signal: ctl.signal });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) throw new Error(`Sign-in check failed (${res.status})`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

/** Default verifier: asks Supabase. Returns { id, username } or throws AuthError with a player-friendly message. */
async function supabaseVerify(token) {
  const user = await getJson(`${SUPABASE_URL}/auth/v1/user`, token);
  if (!user || !user.id) throw new AuthError('Your sign-in has expired. Please sign in again.');
  if (user.is_anonymous) throw new AuthError('Create a Royal Club username to play with friends.');
  const rows = await getJson(`${SUPABASE_URL}/rest/v1/player_profiles?select=username&user_id=eq.${encodeURIComponent(user.id)}`, token);
  const username = Array.isArray(rows) && rows[0] && rows[0].username;
  if (!username) throw new AuthError('Pick your Royal Club username to play with friends.');
  return { id: user.id, username: String(username) };
}

let verifier = supabaseVerify;
/** Tests can swap in a fake verifier. */
function setVerifier(fn) { verifier = fn || supabaseVerify; cache.clear(); }

/** Returns the signed-in player for a create/join message, or null when the check is turned off. */
async function playerFor(m) {
  if (!required()) return null;
  const token = typeof m.auth === 'string' ? m.auth.trim() : '';
  if (!token || token.length > 4096) throw new AuthError('Sign in with your Royal Club username to play with friends.');
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const user = await verifier(token);
  cache.set(token, { user, until: Date.now() + CACHE_MS });
  if (cache.size > 2000) { const now = Date.now(); for (const [k, v] of cache) if (v.until <= now) cache.delete(k); }
  return user;
}

module.exports = { playerFor, setVerifier, AuthError, required };
