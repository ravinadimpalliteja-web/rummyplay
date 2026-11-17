'use strict';
/**
 * Saves room results to the player's Royal Club account.
 *
 * Today: a 1st-place finish in a room game against at least one other real (signed-in) player adds one to that
 * player's wins for the game, in Supabase table `player_game_wins` (see supabase/migrations/*_player_game_wins.sql).
 * Players can only read their own count; only this server can add to it, through the `record_game_win` database
 * function, using the project's secret key. Ludo uses these wins to unlock token sets.
 *
 * Settings (environment):
 *   SUPABASE_SECRET_KEY   the project's secret key (sb_secret_...) or legacy service_role key. Keep it on the
 *                         server only. Without it, results are not saved (the games still work).
 *   SUPABASE_URL          defaults to the Royal Club project.
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://cveqalxcpenkncahnexd.supabase.co').replace(/\/+$/, '');
const TIMEOUT_MS = 8000;
let warned = false;

async function supabaseRecord(userId, game) {
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) {
    if (!warned) { warned = true; console.warn('results: SUPABASE_SECRET_KEY is not set, so room wins are not being saved.'); }
    return false;
  }
  const headers = { apikey: key, 'content-type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;      // legacy service_role key (a JWT)
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_game_win`, {
        method: 'POST', headers, body: JSON.stringify({ p_user: userId, p_game: game }), signal: ctl.signal,
      });
      if (res.ok) return true;
      console.warn(`results: saving a ${game} win failed (${res.status}) ${(await res.text()).slice(0, 200)}`);
      if (res.status < 500) return false;
    } catch (e) {
      console.warn(`results: saving a ${game} win failed: ${e && e.message}`);
    } finally { clearTimeout(timer); }
  }
  return false;
}

let recorder = supabaseRecord;
/** Tests can swap in a fake recorder. */
function setRecorder(fn) { recorder = fn || supabaseRecord; }

/** Adds one win for this account in this game. Never throws; resolves true when saved. */
function recordWin(userId, game) {
  if (!userId) return Promise.resolve(false);
  return Promise.resolve().then(() => recorder(userId, game)).catch((e) => { console.warn('results:', e && e.message); return false; });
}

module.exports = { recordWin, setRecorder };
