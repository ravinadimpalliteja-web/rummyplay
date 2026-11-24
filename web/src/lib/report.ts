/* Finished games, for coins and XP (and coins spent inside a game, r: "spend"), and for the player's stats: a practice
   game (against the computer) also adds to their running totals on their account (Supabase record_my_practice) when
   signed in. Room games pass { online: true } and are recorded by the room server instead. Same rules as
   window.rcPractice in public/app-mode.js. Same list as window.rcReport in public/app-mode.js (used by the plain-HTML
   games): localStorage rc-game-events, newest 50. src/economy collects it when the app's home screen opens. */
import { supabase } from "./supabase";

export type GameResult = "win" | "lose" | "draw" | "done" | "daily";
export const EVENTS_KEY = "rc-game-events";
export interface GameEvent { g: string; r: string; at: number; c?: number }   // c: coins, only on "spend" (a hint bought in a game)

export interface GameInfo { online?: boolean; place?: number; players?: number; score?: number; timeMs?: number }

export function reportGame(game: string, result: GameResult, info: GameInfo = {}): void {
  void savePractice(game, result, info);
  try {
    const raw = JSON.parse(window.localStorage.getItem(EVENTS_KEY) ?? "[]");
    const list: GameEvent[] = Array.isArray(raw) ? raw : [];
    list.push({ g: game, r: result, at: Date.now() });
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify(list.slice(-50)));
  } catch { /* storage off */ }
}

const OUTCOME: Partial<Record<GameResult, "win" | "loss" | "draw">> = { win: "win", daily: "win", lose: "loss", draw: "draw" };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

/** A practice game's result on the signed-in player's stats (nothing when signed out, online or pass & play). */
async function savePractice(game: string, result: GameResult, info: GameInfo): Promise<void> {
  const outcome = OUTCOME[result];
  if (!outcome || info.online || !supabase || !/^[a-z][a-z0-9]{1,19}$/.test(game)) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session || data.session.user.is_anonymous) return;   // guests have no profile to show stats on
    const args = {
      p_game: game, p_outcome: outcome,
      p_place: (info.players ?? 0) >= 3 ? num(info.place) : null,
      p_score: num(info.score), p_time_ms: outcome === "win" ? num(info.timeMs) : null,
    };
    for (let tries = 0; tries < 2; tries++) {
      const { error } = await supabase.rpc("record_my_practice", args);
      if (!error) return;
      await new Promise(r => setTimeout(r, 4000));
    }
  } catch { /* offline: this game isn't counted */ }
}

/** Take every reported game off the list (each one is counted once). */
export function takeGameEvents(): GameEvent[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(EVENTS_KEY) ?? "[]");
    window.localStorage.removeItem(EVENTS_KEY);
    return Array.isArray(raw) ? raw.filter(e => e && typeof e.g === "string" && typeof e.r === "string" && typeof e.at === "number") : [];
  } catch { return []; }
}
