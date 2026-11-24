'use strict';
/**
 * Saves room results to the player's Ambaro account.
 *
 * Today: a 1st-place finish in a room game against at least one other real (signed-in) player adds one to that
 * player's wins for the game, in Supabase table `player_game_wins` (see supabase/migrations/*_player_game_wins.sql).
 * Players can only read their own count; only this server can add to it, through the `record_game_win` database
 * function, using the project's secret key. Ludo uses these wins to unlock token sets.
 *
 * Stats (every room game): when a room game ends, each real, signed-in player's running totals for that game go up
 * by one (played, and win / loss / draw, 2nd / 3rd place, streaks, best score or time) through `record_game_result`
 * into `player_game_stats` (supabase/migrations/*_player_game_stats.sql). Only games with at least two different
 * real players count ("with friends"). The game itself is never stored. A player who left before the end counts a
 * loss. Future games report the same way: call recordGame(gameId, entries) when the game ends.
 *
 * Settings (environment):
 *   SUPABASE_SECRET_KEY   the project's secret key (sb_secret_...) or legacy service_role key. Keep it on the
 *                         server only. Without it, results are not saved (the games still work).
 *   SUPABASE_URL          defaults to the Royal Club project.
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://cveqalxcpenkncahnexd.supabase.co').replace(/\/+$/, '');
const TIMEOUT_MS = 8000;
let warned = false;

async function callRpc(name, body, what) {
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
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal,
      });
      if (res.ok) return true;
      console.warn(`results: saving ${what} failed (${res.status}) ${(await res.text()).slice(0, 200)}`);
      if (res.status < 500) return false;
    } catch (e) {
      console.warn(`results: saving ${what} failed: ${e && e.message}`);
    } finally { clearTimeout(timer); }
  }
  return false;
}

const supabaseRecord = (userId, game) => callRpc('record_game_win', { p_user: userId, p_game: game }, `a ${game} win`);
const supabaseStats = (e) => callRpc('record_game_result', {
  p_user: e.uid, p_game: e.game, p_mode: 'friends', p_outcome: e.outcome,
  p_place: e.place ?? null, p_score: e.score ?? null, p_time_ms: e.timeMs ?? null,
}, `${e.game} stats`);

let recorder = supabaseRecord, statsRecorder = supabaseStats;
/** Tests can swap in fake recorders. */
function setRecorder(fn) { recorder = fn || supabaseRecord; }
function setStatsRecorder(fn) { statsRecorder = fn || supabaseStats; }

/** Adds one win for this account in this game. Never throws; resolves true when saved. */
function recordWin(userId, game) {
  if (!userId) return Promise.resolve(false);
  return Promise.resolve().then(() => recorder(userId, game)).catch((e) => { console.warn('results:', e && e.message); return false; });
}

/**
 * A room game has ended: adds it to each real player's stats. `entries` has one item per seat that a real,
 * signed-in player held when the game started: { uid, outcome: 'win'|'loss'|'draw', place?, score?, timeMs?, quit? }.
 * place is the finishing place in games of 3+ players; quit (left before the end) turns the result into a loss.
 * Counts only when at least two different real players took part. Never throws; resolves with how many were saved.
 */
function recordGame(game, entries) {
  const list = (entries || []).filter((e) => e && e.uid && ['win', 'loss', 'draw'].includes(e.outcome));
  const seen = new Set(), unique = list.filter((e) => (seen.has(e.uid) ? false : seen.add(e.uid)));
  if (unique.length < 2) return Promise.resolve(0);
  return Promise.all(unique.map((e) => {
    const r = e.quit ? { uid: e.uid, game, outcome: 'loss' } : { uid: e.uid, game, outcome: e.outcome, place: e.place, score: e.score, timeMs: e.timeMs };
    return Promise.resolve().then(() => statsRecorder(r)).catch((err) => { console.warn('results:', err && err.message); return false; });
  })).then((ok) => ok.filter(Boolean).length);
}

/** Entries for a game decided by finishing order: `ranks` lists seats 1st, 2nd, …; uids[seat] is the real player
    who held the seat at the start (or null); quit[seat] marks players who left. Two-player games have no places. */
function byPlace(ranks, uids, quit = []) {
  const two = ranks.length <= 2;
  return ranks.map((seat, i) => ({ uid: uids[seat] || null, outcome: i === 0 ? 'win' : 'loss', place: two ? null : i + 1, quit: !!quit[seat] }));
}

/** Which start-of-game players are no longer in their seat at the end: they left (quit), or their seat was given to
    someone else or a computer. uids[seat] is who held the seat at the start. */
function quitters(seats, uids) {
  return uids.map((uid, i) => { const s = seats[i]; return !!uid && (!s || !!s.bot || s.uid !== uid || !!s.quit); });
}

module.exports = { recordWin, setRecorder, recordGame, setStatsRecorder, byPlace, quitters };
