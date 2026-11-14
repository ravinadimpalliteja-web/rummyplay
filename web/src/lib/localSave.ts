/* Auto-save for games on this device (vs computer, pass & play). The game is written to localStorage after every
   change, so closing the app or a crash mid-game loses nothing; the start screen and the home screen then offer
   "Continue". A save is dropped when the game ends, when a new game starts, or after a week.
   EKAH (public/ekah/client.js) writes the same format, and Home reads all of them, so keep it in step:
   { v: 1, at: <ms>, data: <game> }. Chess and Sudoku keep their own saves (rc-chess-game, rc-sudoku-game). */

export const SAVE_KEYS = { ludo: "rc-ludo-save", snakes: "rc-snakes-save", ekah: "rc-ekah-save" } as const;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function saveGame(key: string, data: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify({ v: 1, at: Date.now(), data })); } catch { /* storage full or off: play on */ }
}

export function loadGame<T>(key: string, ok: (d: unknown) => d is T): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as { v?: number; at?: number; data?: unknown };
    if (s.v !== 1 || typeof s.at !== "number" || Date.now() - s.at > MAX_AGE || !ok(s.data)) { window.localStorage.removeItem(key); return null; }
    return s.data;
  } catch { return null; }
}

export function clearGame(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* storage off */ }
}

/** True when this device has a saved game under `key` (cheap check for the home screen). */
export function hasSavedGame(key: string): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const s = JSON.parse(raw) as { v?: number; at?: number };
    return s.v === 1 && typeof s.at === "number" && Date.now() - s.at <= MAX_AGE;
  } catch { return false; }
}

/** The plain-HTML games' own saves: a Chess game with moves and no result, or an unfinished solo Sudoku. */
function readJSON(key: string): Record<string, unknown> | null {
  try { const v = JSON.parse(window.localStorage.getItem(key) ?? "null"); return v && typeof v === "object" ? v : null; } catch { return null; }
}
export const chessInProgress = () => { const s = readJSON("rc-chess-game"); return !!s && Array.isArray(s.sans) && s.sans.length > 0 && !s.result; };
export const sudokuInProgress = () => { const s = readJSON("rc-sudoku-game"); return !!s && !s.done && !s.lost && !s.race; };
