/* Finished games, for coins and XP (and coins spent inside a game, r: "spend"). Same list as window.rcReport in public/app-mode.js (used by the plain-HTML
   games): localStorage rc-game-events, newest 50. src/economy collects it when the app's home screen opens. */
export type GameResult = "win" | "lose" | "draw" | "done" | "daily";
export const EVENTS_KEY = "rc-game-events";
export interface GameEvent { g: string; r: string; at: number; c?: number }   // c: coins, only on "spend" (a hint bought in a game)

export function reportGame(game: string, result: GameResult): void {
  try {
    const raw = JSON.parse(window.localStorage.getItem(EVENTS_KEY) ?? "[]");
    const list: GameEvent[] = Array.isArray(raw) ? raw : [];
    list.push({ g: game, r: result, at: Date.now() });
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify(list.slice(-50)));
  } catch { /* storage off */ }
}

/** Take every reported game off the list (each one is counted once). */
export function takeGameEvents(): GameEvent[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(EVENTS_KEY) ?? "[]");
    window.localStorage.removeItem(EVENTS_KEY);
    return Array.isArray(raw) ? raw.filter(e => e && typeof e.g === "string" && typeof e.r === "string" && typeof e.at === "number") : [];
  } catch { return []; }
}
