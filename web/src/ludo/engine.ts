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

/** A new game. `each` is the number of tokens per player: 4 for classic Ludo, 2 for Quick Ludo. */
export function newGame(order: number[], first = 0, each: 2 | 4 = 4): LudoGame {
  const cols = colorsFor(order.length), colors: Record<number, Color> = {}, tokens: Record<number, Tok[]> = {}, caps: Record<number, number> = {};
  order.forEach((s, i) => { colors[s] = cols[i]; tokens[s] = Array.from({ length: each }, () => ({ s: "base" as const, r: 0, l: 0 })); caps[s] = 0; });
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

/* ---------- the computer player ----------
   Plays like a sharp human: cuts whenever it can (the leader's tokens first), brings tokens out on a six, runs from
   danger, heads for safe squares and the home lane, and reads the board one roll ahead: how likely each exposed token
   is to be cut before its next turn, and which opponent tokens it is lining up to catch. Near-equal choices are
   settled the way a person would, not always the same way. Also plays for a player whose turn timer runs out.
   The same player runs on the room server (server/ludo.js). */
const walked = (t: Tok) => (t.s === "base" ? 0 : t.s === "track" ? t.r + 1 : t.s === "lane" ? 52 + t.l : 57);
/** Chance that a token on track square `a` is cut before its owner moves again (7-12 away needs a six first). */
function hitChance(g: LudoGame, tokens: Record<number, Tok[]>, seat: number, a: number) {
  if (SAFE.has(a)) return 0;
  let miss = 1;
  for (const o of g.order) {
    if (o === seat || g.ranks.includes(o)) continue;
    let p = 0;
    for (const t of tokens[o]) {
      if (t.s !== "track") continue;
      const d = (a - absOf(g.colors[o], t.r) + 52) % 52;
      if (d < 1 || d > 12 || t.r + d > 50) continue;      // out of reach, or that token turns into its home lane first
      p += d <= 6 ? 1 / 6 : 1 / 36;
    }
    miss *= 1 - Math.min(p, 0.6);
  }
  return 1 - miss;
}
/** [expected loss if my exposed tokens get cut, value of the opponent tokens I am lined up to catch next turn] */
function exposure(g: LudoGame, tokens: Record<number, Tok[]>, seat: number) {
  const color = g.colors[seat];
  let risk = 0, chase = 0;
  for (const t of tokens[seat]) {
    if (t.s !== "track") continue;
    const a = absOf(color, t.r);
    risk += hitChance(g, tokens, seat, a) * (walked(t) + 10);
    for (const o of g.order) {
      if (o === seat || g.ranks.includes(o)) continue;
      for (const u of tokens[o]) {
        if (u.s !== "track") continue;
        const b = absOf(g.colors[o], u.r), d = (b - a + 52) % 52;
        if (d >= 1 && d <= 6 && !SAFE.has(b) && t.r + d <= 50) chase += (walked(u) + 10) / 6;
      }
    }
  }
  return [risk, chase];
}
export function bestMove(g: LudoGame, seat: number): number {
  if (g.moves.length === 1) return g.moves[0];
  const color = g.colors[seat], v = g.dice;
  const attackers = (a: number) => {                     // opponent tokens 1-6 squares behind square a
    let n = 0;
    for (const o of g.order) {
      if (o === seat || g.ranks.includes(o)) continue;
      for (const t of g.tokens[o]) { if (t.s !== "track") continue; const d = (a - absOf(g.colors[o], t.r) + 52) % 52; if (d >= 1 && d <= 6) n++; }
    }
    return n;
  };
  const total = (o: number) => g.tokens[o].reduce((m, t) => m + walked(t), 0);
  const leader = Math.max(...g.order.filter(o => o !== seat && !g.ranks.includes(o)).map(total));
  const [risk0, chase0] = exposure(g, g.tokens, seat);
  const scored = g.moves.map(i => {
    const tokens: Record<number, Tok[]> = {};
    for (const o of g.order) tokens[o] = g.tokens[o].map(t => ({ ...t }));
    const t = tokens[seat][i], from = { ...t }, steps = pathOf(t, v)!, f = steps[steps.length - 1];
    Object.assign(t, f);
    let s = 0;
    if (from.s === "base") s += 55;                      // a six: bring a token out
    if (f.s === "home") s += 95;
    if (f.s === "lane" && from.s === "track") s += 45;   // into the safety of the home lane
    if (f.s === "track") {
      const a = absOf(color, f.r);
      if (SAFE.has(a)) s += 22;
      else {
        for (const o of g.order) {
          if (o === seat) continue;
          for (const u of tokens[o]) if (u.s === "track" && absOf(g.colors[o], u.r) === a) {
            s += (130 + u.r) * (total(o) === leader ? 1.15 : 1);      // a cut, the leader's tokens first
            Object.assign(u, { s: "base", r: 0, l: 0 });
          }
        }
        s -= 19 * attackers(a);
      }
    }
    if (from.s === "track") { const a0 = absOf(color, from.r); if (!SAFE.has(a0)) s += 14 * attackers(a0); }   // run from danger
    s += (f.s === "track" ? f.r : f.s === "lane" ? 51 + f.l : 57) * 0.35;
    const [risk1, chase1] = exposure(g, tokens, seat);
    s += -(risk1 - risk0) + 0.5 * (chase1 - chase0);     // one roll ahead: how exposed I am, who I can catch next
    return { i, s };
  });
  const top = Math.max(...scored.map(x => x.s));
  const near = scored.filter(x => x.s >= top - 2);        // a real player doesn't split hairs between near-equal moves
  return near[Math.floor(Math.random() * near.length)].i;
}

/** Whether moving token `i` with the current roll would cut someone (the computer pauses a little longer before it). */
export function cutsWith(g: LudoGame, seat: number, i: number) {
  const t = g.tokens[seat][i], steps = t && pathOf(t, g.dice), f = steps && steps[steps.length - 1];
  if (!f || f.s !== "track") return false;
  const a = absOf(g.colors[seat], f.r);
  return !SAFE.has(a) && victimsAt(g, seat, a).length > 0;
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
/* where finished tokens rest: in their colour's bay of the ambari, around the elephant medallion in the centre */
export const FINISH: Record<Color, [number, number]> = { red: [6.34, 7.5], green: [7.5, 6.34], yellow: [8.66, 7.5], blue: [7.5, 8.66] };
export const SPOTS: [number, number][] = [[1.9, 1.9], [4.1, 1.9], [1.9, 4.1], [4.1, 4.1]];

export function pointOf(c: Color, t: Tok, i: number, n = 4): [number, number] {
  if (t.s === "base") { const [bx, by] = YARD[c], sp = SPOTS[n === 2 ? [0, 3][i] : i]; return [bx + sp[0], by + sp[1]]; }   // Quick Ludo: two tokens on the diagonal
  if (t.s === "track") { const [x, y] = TRACK[absOf(c, t.r)]; return [x + .5, y + .5]; }
  if (t.s === "lane") { const [x, y] = LANE[c][t.l]; return [x + .5, y + .5]; }
  return FINISH[c];
}
export function cellKey(c: Color, t: Tok, i: number) {
  return t.s === "base" ? c + "b" + i : t.s === "track" ? "t" + absOf(c, t.r) : t.s === "lane" ? c + "l" + t.l : c + "h";
}

/** What a move would do, for the move preview: where the token lands, whether it cuts someone, whether an
    opponent could reach it next turn, and whether it is safe or home. */
export type Preview = { dest: Tok; cut: boolean; danger: number; safe: boolean; home: boolean };
export function previewMove(order: number[], colors: Record<number, Color>, tokens: Record<number, Tok[]>, ranks: number[], seat: number, i: number, v: number): Preview | null {
  const steps = pathOf(tokens[seat][i], v);
  if (!steps) return null;
  const dest = steps[steps.length - 1];
  if (dest.s !== "track") return { dest, cut: false, danger: 0, safe: true, home: dest.s === "home" };
  const a = absOf(colors[seat], dest.r), safe = SAFE.has(a);
  let cut = false, danger = 0;
  for (const o of order) {
    if (o === seat) continue;
    for (const t of tokens[o]) {
      if (t.s !== "track") continue;
      const oa = absOf(colors[o], t.r);
      if (oa === a && !safe) cut = true;
      const d = (a - oa + 52) % 52;
      if (!safe && !ranks.includes(o) && d >= 1 && d <= 6) danger++;
    }
  }
  return { dest, cut, danger: cut ? 0 : danger, safe, home: false };
}
