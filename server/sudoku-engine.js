/* Royal Club Sudoku engine: puzzle generation, checking and hints. Plain JavaScript so the page
   needs no build step; also loads in Node for the tests (module.exports at the bottom).

   A grid is an array of 81 numbers, row by row, 0 = empty.
   Every puzzle made here has exactly one solution. Easy and Medium puzzles can always be finished
   with plain logic (no guessing); Hard and Expert have fewer clues and need deeper reasoning. */
(function (root) {
  'use strict';

  const ROW = (i) => Math.floor(i / 9), COL = (i) => i % 9, BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);

  /* The 20 "peers" of each cell: same row, column or 3x3 box. */
  const PEERS = Array.from({ length: 81 }, (_, i) => {
    const s = new Set();
    for (let j = 0; j < 81; j++) if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j);
    return [...s];
  });
  /* The 27 units: 9 rows, 9 columns, 9 boxes. */
  const UNITS = [];
  for (let k = 0; k < 9; k++) {
    UNITS.push(Array.from({ length: 9 }, (_, c) => k * 9 + c));
    UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + k));
    UNITS.push(Array.from({ length: 9 }, (_, n) => (Math.floor(k / 3) * 3 + Math.floor(n / 3)) * 9 + (k % 3) * 3 + (n % 3)));
  }

  /* Small seeded random generator, so the daily puzzle is the same for every player on the same date. */
  function rng(seed) {
    let h = 1779033703 ^ String(seed).length;
    for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  /* Candidates for a cell as a bitmask: bit d (1..9) set = digit d is allowed. */
  function candMask(g, i) {
    let used = 0;
    for (const p of PEERS[i]) if (g[p]) used |= 1 << g[p];
    return ~used & 0x3FE;
  }
  const bits = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const digitsOf = (m) => { const out = []; for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d); return out; };

  /* Counts solutions up to `limit` (2 is enough to prove uniqueness). Fills `out` with the first solution found. */
  function countSolutions(grid, limit = 2, out = null, rand = null) {
    const g = grid.slice();
    let count = 0;
    (function solve() {
      if (count >= limit) return;
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = candMask(g, i), n = bits(m);
        if (n === 0) return;
        if (n < bestN) { best = i; bestMask = m; bestN = n; if (n === 1) break; }
      }
      if (best < 0) { count++; if (out && count === 1) for (let i = 0; i < 81; i++) out[i] = g[i]; return; }
      const ds = digitsOf(bestMask);
      if (rand) shuffle(ds, rand);
      for (const d of ds) { g[best] = d; solve(); if (count >= limit) break; }
      g[best] = 0;
    })();
    return count;
  }

  function solve(grid) {
    const out = new Array(81).fill(0);
    return countSolutions(grid, 1, out) === 1 ? out : null;
  }

  /* Plain-logic solver: only naked singles (one digit fits a cell) and hidden singles (a digit fits
     only one cell of a row, column or box). Returns true when that alone finishes the puzzle. */
  function solvableBySingles(grid) {
    const g = grid.slice();
    for (;;) {
      let progress = false;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = candMask(g, i);
        if (m === 0) return false;
        if (bits(m) === 1) { g[i] = digitsOf(m)[0]; progress = true; }
      }
      for (const u of UNITS) {
        for (let d = 1; d <= 9; d++) {
          if (u.some((i) => g[i] === d)) continue;
          const spots = u.filter((i) => !g[i] && (candMask(g, i) & (1 << d)));
          if (spots.length === 0) return false;
          if (spots.length === 1) { g[spots[0]] = d; progress = true; }
        }
      }
      if (!g.includes(0)) return true;
      if (!progress) return false;
    }
  }

  /* Clue counts per level. Lower = harder. Easy and Medium must also be solvable by singles. */
  const LEVELS = {
    easy:   { name: 'Easy',   clues: 40, singles: true },
    medium: { name: 'Medium', clues: 33, singles: true },
    hard:   { name: 'Hard',   clues: 28, singles: false },
    expert: { name: 'Expert', clues: 24, singles: false },
  };

  function generate(level = 'medium', seed = Date.now() + ':' + Math.random()) {
    const cfg = LEVELS[level] || LEVELS.medium;
    for (let attempt = 0; attempt < 40; attempt++) {
      const rand = rng(seed + '#' + attempt);
      const solution = new Array(81).fill(0);
      countSolutions(new Array(81).fill(0), 1, solution, rand);
      const puzzle = solution.slice();
      /* Remove clues in mirrored pairs (classic look), keeping exactly one solution. */
      const order = shuffle(Array.from({ length: 41 }, (_, i) => i), rand);
      let clues = 81;
      for (const i of order) {
        if (clues <= cfg.clues) break;
        const j = 80 - i, pair = i === j ? [i] : [i, j];
        const keep = pair.map((k) => puzzle[k]);
        pair.forEach((k) => { puzzle[k] = 0; });
        const ok = countSolutions(puzzle, 2) === 1 && (!cfg.singles || solvableBySingles(puzzle));
        if (ok) clues -= pair.length; else pair.forEach((k, n) => { puzzle[k] = keep[n]; });
      }
      /* Accept if close enough to the target (Expert can stall a couple of clues above 24). */
      if (clues <= cfg.clues + 2) return { level, puzzle, solution, clues, seed: String(seed) };
    }
    throw new Error('Could not generate a puzzle');
  }

  /* Daily puzzle: the same for everyone on a date. Difficulty climbs through the week. */
  const DAILY_LEVEL = ['expert', 'easy', 'easy', 'medium', 'medium', 'hard', 'hard']; // Sun..Sat
  function dateKey(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function daily(d = new Date()) {
    const key = dateKey(d), level = DAILY_LEVEL[d.getDay()];
    return Object.assign(generate(level, 'royal-club-daily-' + key), { daily: key });
  }

  /* Cells in the player's grid that clash with another entry in their row, column or box. */
  function conflicts(g) {
    const bad = new Set();
    for (let i = 0; i < 81; i++) if (g[i]) for (const p of PEERS[i]) if (g[p] === g[i]) { bad.add(i); bad.add(p); }
    return bad;
  }

  /* Pencil marks that fit, for "auto notes". */
  function candidates(g, i) { return g[i] ? [] : digitsOf(candMask(g, i)); }

  /* Hint: pick the empty (or wrong) cell with the fewest options, so the hint feels like the
     natural next step, and explain why when it is a single. */
  function hint(g, solution) {
    let wrong = -1;
    for (let i = 0; i < 81; i++) if (g[i] && g[i] !== solution[i]) { wrong = i; break; }
    if (wrong >= 0) return { cell: wrong, value: solution[wrong], reason: 'This number is wrong — here is the right one.' };
    let best = -1, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const n = bits(candMask(g, i));
      if (n < bestN) { best = i; bestN = n; }
    }
    if (best < 0) return null;
    const why = bestN === 1 ? `Only ${solution[best]} fits here — every other number is already in this row, column or box.` : `${solution[best]} goes here.`;
    return { cell: best, value: solution[best], reason: why };
  }

  const api = { generate, daily, dateKey, solve, countSolutions, solvableBySingles, conflicts, candidates, hint, PEERS, LEVELS, ROW, COL, BOX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sudoku = api;
})(typeof window !== 'undefined' ? window : globalThis);
