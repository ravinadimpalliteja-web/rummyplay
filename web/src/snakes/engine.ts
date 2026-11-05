/* Royal Club Snakes & Ladders rules. Mirrors server/snakes.js (the online game runs on the server; practice runs here).
   A server test checks that LADDERS, SNAKES and TIMING below match the server exactly.
   - A six is needed to enter the board (you enter on square 1).
   - A six gives another roll; three sixes in a row cancel the whole turn (back to where the turn began).
   - Exact roll to land on 100; a roll that would pass 100 does not move.
   - Rankings: play goes on after someone reaches 100; each finisher takes the next place, and the game ends
     when one player is left (last place). */

/* The board layout (chosen by the owner): five ladders and seven snakes. Each snake's body is routed around the
   ladders (board.ts, SNAKE_WAYPOINTS); a server test checks no snake crosses a ladder. */
export const LADDERS: Record<number, number> = { 14: 28, 22: 43, 35: 54, 59: 63, 74: 95 };
export const SNAKES: Record<number, number> = { 49: 7, 60: 19, 66: 17, 73: 51, 82: 43, 93: 55, 98: 44 };
/** The golden ladder: landing on its foot climbs it only once in RARE_ODDS landings; every other time the square is
    an ordinary square. */
export const RARE_LADDERS: Record<number, number> = { 81: 99 };
export const RARE_ODDS = 1000;
/** Bumped when the board layout changes, so a client can tell if a room server still runs an older board. */
export const BOARD_VERSION = 3;
export const TARGET = 100;

export type Outcome = "need-six" | "enter" | "move" | "overshoot" | "three-sixes";
export type LastRoll = {
  n: number; seat: number; value: number; from: number; landed: number; to: number;
  via: "ladder" | "snake" | null; outcome: Outcome; extra: boolean; win: boolean; rank: number | null; ended: boolean; streak: number;
};
export type SLGame = {
  order: number[]; pos: Record<number, number>; turnIdx: number; streak: number; turnStart: number;
  phase: "playing" | "gameEnd"; winner: number | null; last: LastRoll | null; rolls: number; finished: number[];
};

export const newGame = (order: number[]): SLGame => ({
  order: [...order], pos: Object.fromEntries(order.map(s => [s, 0])), turnIdx: 0, streak: 0, turnStart: 0,
  phase: "playing", winner: null, last: null, rolls: 0, finished: [],
});
export const turnOf = (g: SLGame) => g.order[g.turnIdx];

/** `lucky` is a separate 1-in-RARE_ODDS draw made with every roll (rollLucky); it only matters on a golden ladder's foot. */
export function roll(prev: SLGame, seat: number, value: number, lucky = false): SLGame {
  if (prev.phase !== "playing" || seat !== turnOf(prev)) return prev;
  const g: SLGame = { ...prev, pos: { ...prev.pos }, finished: [...prev.finished] };
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
    else if (RARE_LADDERS[landed] && lucky) { via = "ladder"; to = RARE_LADDERS[landed]; }
    else if (SNAKES[landed]) { via = "snake"; to = SNAKES[landed]; }
  }
  g.pos[seat] = to;
  const win = to === TARGET, extra = value === 6 && outcome !== "three-sixes" && !win;
  let rank: number | null = null, ended = false;
  if (win) {
    g.finished.push(seat); rank = g.finished.length;
    const left = g.order.filter(s => !g.finished.includes(s));
    if (left.length <= 1) { g.finished.push(...left); g.phase = "gameEnd"; g.winner = g.finished[0]; ended = true; }
  }
  g.last = { n: ++g.rolls, seat, value, from, landed, to, via, outcome, extra, win, rank, ended, streak: g.streak };
  if (!ended && !extra) {
    g.streak = 0;
    for (let i = 0; i < g.order.length; i++) { g.turnIdx = (g.turnIdx + 1) % g.order.length; if (!g.finished.includes(g.order[g.turnIdx])) break; }
  }
  return g;
}

export const rollDie = () => { const b = new Uint32Array(1); crypto.getRandomValues(b); return 1 + (b[0] % 6); };
/** True once in RARE_ODDS: whether a golden ladder works on this roll. */
export const rollLucky = () => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % RARE_ODDS === 0; };

/* Animation timing, shared with the server, which waits this long before the next roll. */
export const TIMING = { die: 1100, settle: 120, step: 230, enter: 300, ret: 800, rung: 120, ladderBase: 150, mouth: 380, slideBase: 500, slidePerSquare: 230, pop: 320, finish1: 3200, finishN: 1700, gap: 250 };
const sqXY = (n: number) => { const row = Math.floor((n - 1) / 10); let col = (n - 1) % 10; if (row % 2) col = 9 - col; return [col, row]; };
const dist = (a: number, b: number) => { const [x1, y1] = sqXY(a), [x2, y2] = sqXY(b); return Math.hypot(x2 - x1, y2 - y1); };
export const rungsOf = (a: number, b: number) => Math.max(3, Math.floor((dist(a, b) * 60) / 19));
export const ladderMs = (a: number, b: number) => TIMING.ladderBase + rungsOf(a, b) * TIMING.rung;
export const snakeSlideMs = (h: number, t: number) => Math.round(TIMING.slideBase + dist(h, t) * TIMING.slidePerSquare);

/* Quick chat (no free text yet). The server only relays the index. */
export const CHAT_PHRASES = ["Nice move!", "Good luck", "Well played", "Oops!", "Hurry up", "So close!", "Haha", "Thank you"];
export const CHAT_EMOJIS = ["😀", "😂", "😮", "😢", "😤", "👍", "👏", "🎉", "🙏", "🔥", "🐍", "🪜"];
