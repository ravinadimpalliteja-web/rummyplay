/* Royal Club Ludo rules. Mirrors server/ludo.js (online games run on the server; Practice and Pass & play run here).
   - A six brings a token out onto its start square.
   - Clockwise round the 52-square track, then up the home lane (5 squares) to the centre; exact roll to finish.
   - Landing on an opponent cuts it back to its yard, except on start squares and starred squares.
   - A six, a cut, or a token reaching home rolls again. Three sixes in a row end the turn.
   - Play continues after the first finish until one player is left. */

export type Color = "red" | "green" | "yellow" | "blue";
export type Tok = { s: "base" | "track" | "lane" | "home"; r: number; l: number };
export type Cut = { seat: number; token: number; from: Tok };
export type RollEvent = { n: number; kind: "roll"; seat: number; value: number; outcome: "choose" | "none" | "three-sixes"; forced?: number | null };
export type MoveEvent = { n: number; kind: "move"; seat: number; token: number; value: number; from: Tok; steps: Tok[]; cuts: Cut[]; home: boolean; finished: boolean; bonus: boolean };
export type LudoEvent = RollEvent | MoveEvent;
export type LudoGame = {
  order: number[]; colors: Record<number, Color>; tokens: Record<number, Tok[]>; caps: Record<number, number>;
  turnIdx: number; sixes: number; dice: number; phase: "roll" | "move" | "gameEnd"; moves: number[]; ranks: number[];
  last: LudoEvent | null; n: number;
};

export const COLORS: Color[] = ["red", "green", "yellow", "blue"];
export const START: Record<Color, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
/* Animation timings (ms). The room server waits the same lengths between events (server/ludo.js ANIM). */
export const ANIM = { die: 1000, step: 160, cut: 550, home: 350, pass: 450 };

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export const colorsFor = (n: number): Color[] => (n === 2 ? ["red", "yellow"] : n === 3 ? ["red", "green", "yellow"] : COLORS.slice());
export const turnOf = (g: LudoGame) => g.order[g.turnIdx];
export const absOf = (c: Color, r: number) => (START[c] + r) % 52;
export const rollDie = () => { const b = new Uint32Array(1); crypto.getRandomValues(b); return 1 + (b[0] % 6); };

export function newGame(order: number[], first = 0): LudoGame {
  const cols = colorsFor(order.length), colors: Record<number, Color> = {}, tokens: Record<number, Tok[]> = {}, caps: Record<number, number> = {};
  order.forEach((s, i) => { colors[s] = cols[i]; tokens[s] = [0, 1, 2, 3].map(() => ({ s: "base", r: 0, l: 0 })); caps[s] = 0; });
  return { order: order.slice(), colors, tokens, caps, turnIdx: first, sixes: 0, dice: 0, phase: "roll", moves: [], ranks: [], last: null, n: 0 };
}

export function pathOf(t: Tok, v: number): Tok[] | null {
  if (t.s === "home") return null;
  if (t.s === "base") return v === 6 ? [{ s: "track", r: 0, l: 0 }] : null;
  let s: Tok["s"] = t.s, r = t.r, l = t.l; const out: Tok[] = [];
  for (let k = 0; k < v; k++) {
    if (s === "track") { if (r === 50) { s = "lane"; l = 0; } else r++; }
    else if (s === "lane") { if (l === 4) s = "home"; else l++; }
    else return null;
    out.push({ s, r, l });
  }
  return out;
}
export const movable = (g: LudoGame, seat: number, v: number) => g.tokens[seat].map((t, i) => (pathOf(t, v) ? i : -1)).filter(i => i >= 0);
const forcedMove = (g: LudoGame, seat: number) => {
  const keys = new Set(g.moves.map(i => { const t = g.tokens[seat][i]; return `${t.s}.${t.r}.${t.l}`; }));
  return keys.size === 1 ? g.moves[0] : null;
};
function advance(g: LudoGame) {
  g.sixes = 0; g.moves = []; g.phase = "roll";
  do { g.turnIdx = (g.turnIdx + 1) % g.order.length; } while (g.ranks.includes(turnOf(g)));
}

export function roll(g0: LudoGame, seat: number, value: number): LudoGame {
  if (g0.phase !== "roll" || seat !== turnOf(g0)) return g0;
  const g = clone(g0);
  g.dice = value; g.sixes = value === 6 ? g.sixes + 1 : 0;
  const base = { n: ++g.n, kind: "roll" as const, seat, value };
  if (value === 6 && g.sixes >= 3) { g.last = { ...base, outcome: "three-sixes" }; advance(g); return g; }
  const moves = movable(g, seat, value);
  if (!moves.length) { g.last = { ...base, outcome: "none" }; advance(g); return g; }
  g.phase = "move"; g.moves = moves;
  g.last = { ...base, outcome: "choose", forced: forcedMove(g, seat) };
  return g;
}

function victimsAt(g: LudoGame, seat: number, a: number) {
  const out: { seat: number; token: number }[] = [];
  for (const o of g.order) { if (o === seat) continue; g.tokens[o].forEach((t, i) => { if (t.s === "track" && absOf(g.colors[o], t.r) === a) out.push({ seat: o, token: i }); }); }
  return out;
}

export function move(g0: LudoGame, seat: number, i: number): LudoGame {
  if (g0.phase !== "move" || seat !== turnOf(g0) || !g0.moves.includes(i)) return g0;
  const g = clone(g0);
  const tok = g.tokens[seat][i], from = { ...tok }, steps = pathOf(tok, g.dice)!;
  Object.assign(tok, steps[steps.length - 1]);
  const cuts: Cut[] = [];
  if (tok.s === "track") {
    const a = absOf(g.colors[seat], tok.r);
    if (!SAFE.has(a)) for (const v of victimsAt(g, seat, a)) {
      const vt = g.tokens[v.seat][v.token];
      cuts.push({ ...v, from: { ...vt } }); Object.assign(vt, { s: "base", r: 0, l: 0 });
    }
  }
  g.caps[seat] += cuts.length;
  const home = tok.s === "home";
  let finished = false;
  if (g.tokens[seat].every(t => t.s === "home")) { g.ranks.push(seat); finished = true; }
  const bonus = !finished && (g.dice === 6 || cuts.length > 0 || home);
  g.last = { n: ++g.n, kind: "move", seat, token: i, from, steps, cuts, home, finished, bonus, value: g.dice };
  g.moves = [];
  const left = g.order.filter(s => !g.ranks.includes(s));
  if (left.length <= 1) { g.ranks.push(...left); g.phase = "gameEnd"; return g; }
  if (bonus) { g.phase = "roll"; if (g.dice !== 6) g.sixes = 0; } else advance(g);
  return g;
}

/** The computer players' choice (also used when a timer runs out): cut, go home, stay safe, then progress. */
export function bestMove(g: LudoGame, seat: number): number {
  const color = g.colors[seat], v = g.dice;
  const danger = (a: number) => {
    let n = 0;
    for (const o of g.order) {
      if (o === seat || g.ranks.includes(o)) continue;
      for (const t of g.tokens[o]) { if (t.s !== "track") continue; const d = (a - absOf(g.colors[o], t.r) + 52) % 52; if (d >= 1 && d <= 6) n++; }
    }
    return n;
  };
  const prog = (t: Tok) => (t.s === "track" ? t.r : t.s === "lane" ? 51 + t.l : t.s === "home" ? 57 : -1);
  let best = g.moves[0], bs = -Infinity;
  for (const i of g.moves) {
    const t = g.tokens[seat][i], steps = pathOf(t, v)!, f = steps[steps.length - 1];
    let s = Math.random() * 3;
    if (t.s === "base") s += 55;
    if (f.s === "home") s += 95;
    if (f.s === "lane" && t.s === "track") s += 45;
    if (f.s === "track") {
      const a = absOf(color, f.r);
      if (SAFE.has(a)) s += 22;
      else { const vic = victimsAt(g, seat, a); if (vic.length) s += 130 + vic.reduce((m, x) => m + g.tokens[x.seat][x.token].r, 0); s -= 38 * danger(a); }
    }
    if (t.s === "track") { const a0 = absOf(color, t.r); if (!SAFE.has(a0)) s += 28 * danger(a0); }
    s += prog(f) * 0.35;
    if (s > bs) { bs = s; best = i; }
  }
  return best;
}

/* ---------- board geometry (15 x 15 grid; red yard top-left, then clockwise green, yellow, blue) ---------- */
export const TRACK: [number, number][] = (() => {
  const t: [number, number][] = [];
  for (let c = 1; c <= 5; c++) t.push([c, 6]);
  for (let r = 5; r >= 0; r--) t.push([6, r]);
  t.push([7, 0], [8, 0]);
  for (let r = 1; r <= 5; r++) t.push([8, r]);
  for (let c = 9; c <= 14; c++) t.push([c, 6]);
  t.push([14, 7], [14, 8]);
  for (let c = 13; c >= 9; c--) t.push([c, 8]);
  for (let r = 9; r <= 14; r++) t.push([8, r]);
  t.push([7, 14], [6, 14]);
  for (let r = 13; r >= 9; r--) t.push([6, r]);
  for (let c = 5; c >= 0; c--) t.push([c, 8]);
  t.push([0, 7], [0, 6]);
  return t;
})();
export const YARD: Record<Color, [number, number]> = { red: [0, 0], green: [9, 0], yellow: [9, 9], blue: [0, 9] };
export const LANE: Record<Color, [number, number][]> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]], green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]], blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
};
export const FINISH: Record<Color, [number, number]> = { red: [6.55, 7.5], green: [7.5, 6.55], yellow: [8.45, 7.5], blue: [7.5, 8.45] };
export const SPOTS: [number, number][] = [[1.9, 1.9], [4.1, 1.9], [1.9, 4.1], [4.1, 4.1]];

export function pointOf(c: Color, t: Tok, i: number): [number, number] {
  if (t.s === "base") { const [bx, by] = YARD[c]; return [bx + SPOTS[i][0], by + SPOTS[i][1]]; }
  if (t.s === "track") { const [x, y] = TRACK[absOf(c, t.r)]; return [x + .5, y + .5]; }
  if (t.s === "lane") { const [x, y] = LANE[c][t.l]; return [x + .5, y + .5]; }
  return FINISH[c];
}
export function cellKey(c: Color, t: Tok, i: number) {
  return t.s === "base" ? c + "b" + i : t.s === "track" ? "t" + absOf(c, t.r) : t.s === "lane" ? c + "l" + t.l : c + "h";
}
