/* The 3D redesign is presentation only. These checks read the web board code and confirm:
   - the board still takes its snakes and ladders from the shared engine (no second copy that could drift);
   - square numbering and the 10 x 10 layout are unchanged;
   - where tokens stand (alone, or 2 to 4 sharing a square) never covers the square's number, keeps tokens apart
     and keeps them on their own square. Run with: node test/snakes-view.test.js */
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../../web/src/snakes/board.ts'), 'utf8');
const num = (re, what) => { const m = src.match(re); assert(m, 'could not find ' + what + ' in board.ts'); return m.slice(1).map(Number); };

// snakes and ladders come only from the engine
assert(/import \{ LADDERS, RARE_LADDERS, SNAKES \} from "\.\/engine";/.test(src), 'board.ts must import LADDERS, RARE_LADDERS and SNAKES from the engine');
assert(!/(SNAKES|LADDERS)\s*[:=]\s*\{/.test(src.replace(/import[^\n]*\n/, '')), 'board.ts must not define its own snakes or ladders');

// numbering: zigzag from the bottom left, unchanged
const [PAD, S] = num(/export const PAD = (\d+), S = (\d+)/, 'PAD and S');
assert.strictEqual(S, 60, 'square size');
const center = (n) => { const row = Math.floor((n - 1) / 10); let col = (n - 1) % 10; if (row % 2) col = 9 - col; return { x: PAD + col * S + S / 2, y: PAD + (9 - row) * S + S / 2 }; };
assert(/if \(row % 2\) col = 9 - col;/.test(src) && /y: PAD \+ \(9 - row\) \* S \+ S \/ 2/.test(src), 'square numbering (zigzag from bottom left) unchanged');
assert.deepStrictEqual([center(1).x < center(10).x, center(11).x > center(20).x, center(100).y < center(1).y], [true, true, true], 'square order');

// token placement and numbers: a lone token stands in the middle of its square, about three quarters of a square wide;
// each number is embossed into the board along the top edge of its square, with no background
const [sy] = num(/export const spot = \(n: number\): Pt => \{ const c = center\(n\); return \{ x: c\.x, y: c\.y \+ (\d+) \}; \};/, 'spot'), sx = 0;
assert(/export const spot3D = \(n: number\): Pt => center\(n\);/.test(src), 'the 3D board puts a lone token exactly on the centre of its square');
const [H] = num(/export const PIECE_H = (\d+);/, 'PIECE_H');
const tokenW = H * 100 / 120;
assert(tokenW >= S * .7 && tokenW <= S * .8, `a lone token is about three quarters of a square wide (${(tokenW / S).toFixed(2)})`);
assert(/y: p\.y - S \/ 2 \+ size \* \.8 \+ 3/.test(src), 'square numbers sit along the top edge of their square');
const scene = fs.readFileSync(path.join(__dirname, '../../web/src/snakes/scene3d.ts'), 'utf8');
assert(/nm\.position\.y = TILE_TOP \+ \.006; nm\.renderOrder = 1;/.test(scene), '3D board: the numbers are embossed in the board surface, under ladders, snakes and tokens');
assert(!/rr\(g, x - 2\.5, y - size/.test(src), 'numbers have no label background');
const shared = {};
const sharedSrc = src.slice(src.indexOf('export const SHARED:'), src.indexOf('};', src.indexOf('export const SHARED:')));      // the flat board's layout (the 3D board has its own)
for (const m of sharedSrc.matchAll(/(\d): \{ pts: (\[\[[^}]*\]\]), s: ([\d.]+) \}/g)) shared[m[1]] = { pts: JSON.parse(m[2]), s: +m[3] };
assert.deepStrictEqual(Object.keys(shared), ['2', '3', '4'], 'layouts for 2, 3 and 4 tokens on one square');
// a token's visible art: 68% of its width, from its stand up to 84% of its height (same box the browser checks use)
const box = (x, y, s) => { const h = H * s, w = h * 100 / 120; return { x0: x - w * .34, x1: x + w * .34, y0: y - h * .84, y1: y }; };
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const cases = [['alone', [[sx, sy]], 1], ...Object.entries(shared).map(([k, v]) => [k + ' sharing', v.pts, v.s])];
for (const [name, pts, s] of cases) {
  const boxes = pts.map(([x, y]) => box(x, y, s));
  for (const b of boxes) assert(b.x0 >= -S / 2 - 1 && b.x1 <= S / 2 + 2.5, `${name}: a token leaves its square (${b.x0.toFixed(1)}..${b.x1.toFixed(1)})`);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert(!hit(boxes[i], boxes[j]), `${name}: tokens ${i} and ${j} overlap`);
}
console.log('snakes view: ok (board uses engine positions, numbering unchanged, tokens 3/4 of a square, numbers embossed on the top edge)');

// The snakes' bodies never touch a ladder: the drawn curve (same algorithm as snakePath in board.ts) against every ladder.
{
  const { LADDERS: L0, RARE_LADDERS: RL, SNAKES: SN } = require('../snakes'), L = { ...L0, ...RL };
  const wpSrc = src.slice(src.indexOf('export const SNAKE_WAYPOINTS'), src.indexOf('};', src.indexOf('export const SNAKE_WAYPOINTS')));
  const WPS = Object.fromEntries([...wpSrc.matchAll(/(\d+): (\[\[[^\n]*\]\]),/g)].map((m) => [m[1], JSON.parse(m[2])]));
  const [WAVE] = num(/export const SNAKE_WAVE = (\d+);/, 'SNAKE_WAVE');
  assert.deepStrictEqual(Object.keys(WPS).sort(), Object.keys(SN).sort(), 'a route for every snake');
  const ctr = (n) => { const r = Math.floor((n - 1) / 10); let c = (n - 1) % 10; if (r % 2) c = 9 - c; return { x: PAD + c * S + S / 2, y: PAD + (9 - r) * S + S / 2 }; };
  const curve = (raw) => {
    const wp = raw.map(([x, y]) => ({ x, y })), dense = [];
    const cat = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) }; };
    for (let i = 0; i < wp.length - 1; i++) for (let j = 0; j < 30; j++) dense.push(cat(wp[Math.max(0, i - 1)], wp[i], wp[i + 1], wp[Math.min(wp.length - 1, i + 2)], j / 30));
    dense.push(wp[wp.length - 1]);
    return dense;
  };
  const segD = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
  const SNAKE_HALF = 10.8, LADDER_HALF = +num(/export const LADDER_HALF = (\d+);/, 'LADDER_HALF')[0] + 5.4;   // widest drawn: 3D snake radius 0.18 square; ladder half-width plus its rail
  for (const [h, t] of Object.entries(SN)) {
    const pts = curve(WPS[h]), first = pts[0], last = pts[pts.length - 1], hc = ctr(+h), tc = ctr(t);
    assert(Math.abs(first.x - hc.x) < 30 && Math.abs(first.y - hc.y) < 30, `snake ${h}: head is on square ${h}`);
    // a tail tip may sit at the edge of its square when that square is also a ladder's top (kept clear of the ladder)
    assert(Math.abs(last.x - tc.x) <= 32 && Math.abs(last.y - tc.y) <= 32, `snake ${h}: tail is on square ${t}`);
    for (const p of pts) for (const [a, b] of Object.entries(L)) assert(segD(p, ctr(+a), ctr(b)) >= SNAKE_HALF + LADDER_HALF + WAVE - 5, `snake ${h}-${t} crosses ladder ${a}-${b}`);
  }
  // Nothing overlaps: no two ladders touch, and no two snakes' bodies touch (widest drawn, with their sway).
  const lads = Object.entries(L).map(([a, b]) => [ctr(+a), ctr(b)]);
  const segSeg = (a, b, c, d) => Math.min(segD(a, c, d), segD(b, c, d), segD(c, a, b), segD(d, a, b));
  const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
  for (let i = 0; i < lads.length; i++) for (let j = i + 1; j < lads.length; j++) {
    assert(!cross(...lads[i], ...lads[j]) && segSeg(...lads[i], ...lads[j]) >= 2 * LADDER_HALF, `ladders ${Object.keys(L)[i]} and ${Object.keys(L)[j]} overlap`);
  }
  const bodies = Object.entries(SN).map(([h, t]) => [h, curve(WPS[h])]);
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    let m = Infinity; for (const p of bodies[i][1]) for (const q of bodies[j][1]) m = Math.min(m, Math.hypot(p.x - q.x, p.y - q.y));
    assert(m >= 2 * (SNAKE_HALF + WAVE), `snakes ${bodies[i][0]} and ${bodies[j][0]} touch (${m.toFixed(1)})`);
  }
  console.log(`snakes view: ok (${Object.keys(SN).length} snakes routed around all ${Object.keys(L).length} ladders; no ladders or snakes overlap)`);
}
