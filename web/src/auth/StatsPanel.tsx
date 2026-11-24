/* "Your stats" on the Profile page: the signed-in player's running totals per game (Supabase player_game_stats).
   Two lines per game: With friends (room games, recorded by the room server) and Practice (against the computer,
   reported by this device). Only numbers are kept: no game is ever stored. A game added later shows up on its own. */
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Row {
  game: string; mode: "friends" | "practice"; played: number; wins: number; losses: number; draws: number;
  second_places: number; third_places: number; streak: number; best_streak: number;
  best_score: number | null; best_time_ms: number | null;
}

const NAMES: Record<string, string> = {
  ludo: "Ludo", snakes: "Snakes & Ladders", ekah: "EKAH", chess: "Chess", sudoku: "Sudoku", words: "Word Puzzle", spades: "Spades",
};
const ORDER = ["ludo", "snakes", "ekah", "chess", "sudoku", "words", "spades"];
const nameOf = (g: string) => NAMES[g] ?? g.charAt(0).toUpperCase() + g.slice(1);
const time = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const pct = (r: Row) => (r.played ? Math.round((r.wins / r.played) * 100) : 0);

function Line({ r }: { r: Row }) {
  const extras: string[] = [];
  if (r.draws) extras.push(`${r.draws} drawn`);
  if (r.second_places) extras.push(`${r.second_places}× 2nd`);
  if (r.third_places) extras.push(`${r.third_places}× 3rd`);
  if (r.best_streak > 1) extras.push(`best streak ${r.best_streak}${r.streak > 1 ? ` (now ${r.streak})` : ""}`);
  if (r.best_score != null) extras.push(`best score ${r.best_score}`);
  if (r.best_time_ms != null) extras.push(`fastest ${time(r.best_time_ms)}`);
  return <div className={`st-line st-${r.mode}`}>
    <span className="st-mode">{r.mode === "friends" ? "With friends" : "Practice"}</span>
    <span className="st-nums">
      <b>{r.played}</b> played · <b>{r.wins}</b> won · <b>{r.losses}</b> lost <span className="st-pct">({pct(r)}% wins)</span>
      {extras.length > 0 && <small>{extras.join(" · ")}</small>}
    </span>
  </div>;
}

export default function StatsPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    if (!supabase) return;
    void supabase.from("player_game_stats")
      .select("game,mode,played,wins,losses,draws,second_places,third_places,streak,best_streak,best_score,best_time_ms")
      .eq("user_id", userId)
      .then(({ data, error }) => { if (!live) return; if (error) setFailed(true); else setRows((data ?? []) as Row[]); });
    return () => { live = false; };
  }, [userId]);

  if (failed) return null;                         // stats not available yet: the rest of the profile still works
  const games = rows ? [...new Set(rows.map(r => r.game))].sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  }) : [];
  const total = (rows ?? []).filter(r => r.mode === "friends").reduce((t, r) => ({ p: t.p + r.played, w: t.w + r.wins }), { p: 0, w: 0 });

  return <section className="rs-panel st-panel" aria-labelledby="st-title">
    <h2 id="st-title">Your stats</h2>
    {rows === null && <p className="rs-note">Loading…</p>}
    {rows && games.length === 0 && <p className="rs-note">Finish a game while signed in and your wins, losses and streaks start here.</p>}
    {rows && total.p > 0 && <p className="st-total"><b>{total.p}</b> games with friends · <b>{total.w}</b> won</p>}
    {games.map(g => <div key={g} className="st-game">
      <strong>{nameOf(g)}</strong>
      {(["friends", "practice"] as const).map(m => { const r = rows!.find(x => x.game === g && x.mode === m); return r ? <Line key={m} r={r} /> : null; })}
    </div>)}
    {rows && games.length > 0 && <p className="rs-note st-foot">Only the totals are kept, never the games themselves. Practice is against the computer.</p>}
  </section>;
}
