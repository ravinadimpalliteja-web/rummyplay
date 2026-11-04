/* Royal Club Snakes & Ladders rules. Mirrors server/snakes.js (the online game runs on the server; practice runs here).
   - A six is needed to enter the board (you enter on square 1).
   - A six gives another roll; three sixes in a row cancel the whole turn (back to where the turn began).
   - Exact roll to land on 100; a roll that would pass 100 does not move. */

export const LADDERS: Record<number, number> = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };
export const SNAKES: Record<number, number> = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 99: 41 };
export const TARGET = 100;

export type Outcome = "need-six" | "enter" | "move" | "overshoot" | "three-sixes";
export type LastRoll = {
  n: number; seat: number; value: number; from: number; landed: number; to: number;
  via: "ladder" | "snake" | null; outcome: Outcome; extra: boolean; win: boolean; streak: number;
};
export type SLGame = {
  order: number[]; pos: Record<number, number>; turnIdx: number; streak: number; turnStart: number;
  phase: "playing" | "gameEnd"; winner: number | null; last: LastRoll | null; rolls: number;
};

export const newGame = (order: number[]): SLGame => ({
  order: [...order], pos: Object.fromEntries(order.map(s => [s, 0])), turnIdx: 0, streak: 0, turnStart: 0,
  phase: "playing", winner: null, last: null, rolls: 0,
});
export const turnOf = (g: SLGame) => g.order[g.turnIdx];

export function roll(prev: SLGame, seat: number, value: number): SLGame {
  if (prev.phase !== "playing" || seat !== turnOf(prev)) return prev;
  const g: SLGame = { ...prev, pos: { ...prev.pos } };
  const from = g.pos[seat];
  if (g.streak === 0) g.turnStart = from;
  if (value === 6) g.streak++;
  let outcome: Outcome, landed = from, to = from, via: LastRoll["via"] = null;
  if (value === 6 && g.streak >= 3) { outcome = "three-sixes"; to = landed = g.turnStart; }
  else if (from === 0 && value !== 6) outcome = "need-six";
  else if (from === 0) { outcome = "enter"; to = landed = 1; }
  else if (from + value > TARGET) outcome = "overshoot";
  else { outcome = "move"; to = landed = from + value; }
  if (outcome === "move" || outcome === "enter") {
    if (LADDERS[landed]) { via = "ladder"; to = LADDERS[landed]; }
    else if (SNAKES[landed]) { via = "snake"; to = SNAKES[landed]; }
  }
  g.pos[seat] = to;
  const win = to === TARGET, extra = value === 6 && outcome !== "three-sixes" && !win;
  g.last = { n: ++g.rolls, seat, value, from, landed, to, via, outcome, extra, win, streak: g.streak };
  if (win) { g.phase = "gameEnd"; g.winner = seat; }
  else if (!extra) { g.streak = 0; g.turnIdx = (g.turnIdx + 1) % g.order.length; }
  return g;
}

export const rollDie = () => { const b = new Uint32Array(1); crypto.getRandomValues(b); return 1 + (b[0] % 6); };

/** Same timing as the server's pause (server/snakes.js animMs). */
export const STEP_MS = 230, LADDER_MS = 850, SNAKE_MS = 1250, RETURN_MS = 800, ENTER_MS = 300, DIE_MS = 650;
