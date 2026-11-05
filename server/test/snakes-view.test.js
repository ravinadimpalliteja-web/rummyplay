/* The 3D redesign is presentation only. These checks read the web board code and confirm:
   - the board still takes its snakes and ladders from the shared engine (no second copy that could drift);
   - square numbering and the 10 x 10 layout are unchanged;
   - where tokens stand (alone, or 2 to 4 sharing a square) never covers the square's number, keeps tokens apart
     and keeps them on their own square. Run with: node test/snakes-view.test.js */
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../../web/src/snakes/board.ts'), 'utf8');
const num = (re, what) => { const m = src.match(re); assert(m, 'could not find ' + what + ' in board.ts'); return m.slice(1).map(Number); };

// snakes and ladders come only from the engine
assert(/import \{ LADDERS, SNAKES \} from "\.\/engine";/.test(src), 'board.ts must import LADDERS and SNAKES from the engine');
assert(!/(SNAKES|LADDERS)\s*[:=]\s*\{/.test(src.replace(/import[^\n]*\n/, '')), 'board.ts must not define its own snakes or ladders');

// numbering: zigzag from the bottom left, unchanged
const [PAD, S] = num(/export const PAD = (\d+), S = (\d+)/, 'PAD and S');
assert.strictEqual(S, 60, 'square size');
const center = (n) => { const row = Math.floor((n - 1) / 10); let col = (n - 1) % 10; if (row % 2) col = 9 - col; return { x: PAD + col * S + S / 2, y: PAD + (9 - row) * S + S / 2 }; };
assert(/if \(row % 2\) col = 9 - col;/.test(src) && /y: PAD \+ \(9 - row\) \* S \+ S \/ 2/.test(src), 'square numbering (zigzag from bottom left) unchanged');
assert.deepStrictEqual([center(1).x < center(10).x, center(11).x > center(20).x, center(100).y < center(1).y], [true, true, true], 'square order');

// token placement keeps numbers readable
const [sx, sy] = num(/return \{ x: c\.x \+ (\d+), y: c\.y \+ (\d+) \}; \};/, 'spot');
const [H] = num(/export const PIECE_H = (\d+);/, 'PIECE_H');
const [nx, ny] = num(/return \{ x: p\.x - S \/ 2 \+ (\d+), y: p\.y - S \/ 2 \+ (\d+) \}; \};/, 'numberAt');
const [fontPx] = num(/NUM_FONT = "800 (\d+)px/, 'NUM_FONT');
const shared = {};
for (const m of src.matchAll(/(\d): \{ pts: (\[\[[^}]*\]\]), s: ([\d.]+) \}/g)) shared[m[1]] = { pts: JSON.parse(m[2]), s: +m[3] };
assert.deepStrictEqual(Object.keys(shared), ['2', '3', '4'], 'layouts for 2, 3 and 4 tokens on one square');
// a token's visible art: 68% of its width, from its stand up to 84% of its height (same box the browser checks use)
const box = (x, y, s) => { const h = H * s, w = h * 100 / 120; return { x0: x - w * .34, x1: x + w * .34, y0: y - h * .84, y1: y }; };
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const digitW = fontPx * .62;                                            // a wide bold digit, on the safe side
const numberBox = (digits) => ({ x0: -S / 2 + nx, x1: -S / 2 + nx + digits * digitW, y0: -S / 2 + ny - fontPx * .75, y1: -S / 2 + ny + 1 });
const cases = [['alone', [[sx, sy]], 1], ...Object.entries(shared).map(([k, v]) => [k + ' sharing', v.pts, v.s])];
for (const [name, pts, s] of cases) {
  const boxes = pts.map(([x, y]) => box(x, y, s));
  for (const b of boxes) {
    assert(!hit(b, numberBox(2)), `${name}: a token covers the square's number`);
    assert(b.x0 >= -S / 2 - 1 && b.x1 <= S / 2 + 2.5, `${name}: a token leaves its square (${b.x0.toFixed(1)}..${b.x1.toFixed(1)})`);
    // the next square to the right: its number starts S further on
    const right = numberBox(2); assert(!hit(b, { ...right, x0: right.x0 + S, x1: right.x1 + S }), `${name}: a token covers the next square's number`);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert(!hit(boxes[i], boxes[j]), `${name}: tokens ${i} and ${j} overlap`);
}
console.log('snakes view: ok (board uses engine positions, numbering unchanged, token spots clear of numbers for 1 to 4 tokens)');
