/**
 * Royal Club Learn Chess - "free board" rules for the early classes, where pieces move without kings, checks or turns.
 * White's pieces move by their normal rules; black pieces stand still and can be captured. Pawns promote to a queen.
 * Board: object { 'e4': 'R', ... }.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LearnCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FILES = 'abcdefgh';
  const name = (f, r) => FILES[f] + (r + 1);
  const at = (sq) => [FILES.indexOf(sq[0]), Number(sq[1]) - 1];
  const isWhite = (p) => p === p.toUpperCase();

  function parse(fen) {
    const b = {};
    String(fen).split(' ')[0].split('/').forEach((row, i) => {
      let f = 0;
      for (const ch of row) { if (/\d/.test(ch)) f += Number(ch); else { b[name(f, 7 - i)] = ch; f++; } }
    });
    return b;
  }

  const LINES = { R: [[1, 0], [-1, 0], [0, 1], [0, -1]], B: [[1, 1], [1, -1], [-1, 1], [-1, -1]] };
  LINES.Q = LINES.R.concat(LINES.B);
  const STEPS = { N: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]], K: LINES.Q };

  /** Squares the white piece on sq may move to. */
  function targets(b, sq) {
    const p = b[sq]; if (!p || !isWhite(p)) return [];
    const [f, r] = at(sq), out = [], t = p.toUpperCase();
    const free = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8;
    if (t === 'P') {
      if (free(f, r + 1) && !b[name(f, r + 1)]) {
        out.push(name(f, r + 1));
        if (r === 1 && !b[name(f, r + 2)]) out.push(name(f, r + 2));
      }
      for (const dx of [-1, 1]) { const s = free(f + dx, r + 1) && name(f + dx, r + 1); if (s && b[s] && !isWhite(b[s])) out.push(s); }
      return out;
    }
    if (LINES[t]) {
      for (const [dx, dy] of LINES[t]) {
        let x = f + dx, y = r + dy;
        while (free(x, y)) { const s = name(x, y); if (b[s]) { if (!isWhite(b[s])) out.push(s); break; } out.push(s); x += dx; y += dy; }
      }
      return out;
    }
    for (const [dx, dy] of STEPS[t]) {
      const x = f + dx, y = r + dy; if (!free(x, y)) continue;
      const s = name(x, y); if (!b[s] || !isWhite(b[s])) out.push(s);
    }
    return out;
  }

  /** Plays a move on a copy of the board. Returns { board, captured, promoted }. */
  function play(b, from, to) {
    const n = Object.assign({}, b), p = n[from], captured = n[to] || null;
    delete n[from];
    const promoted = p === 'P' && to[1] === '8';
    n[to] = promoted ? 'Q' : p;
    return { board: n, captured, promoted };
  }

  /** A goal is done when no black piece is left and every star square holds a white piece (or was visited). */
  function goalDone(b, stars, visited) {
    const blackLeft = Object.values(b).some((p) => !isWhite(p));
    return !blackLeft && stars.every((s) => visited.has(s));
  }

  /** Fewest moves to finish a goal (breadth-first search; used by tests). */
  function solve(fen, stars = [], limit = 8) {
    const start = parse(fen);
    const key = (b, v) => JSON.stringify(Object.keys(b).sort().map((k) => k + b[k])) + [...v].sort().join();
    let frontier = [{ b: start, v: new Set(stars.filter((s) => start[s] && isWhite(start[s]))) }], seen = new Set();
    for (let d = 0; d <= limit; d++) {
      const next = [];
      for (const st of frontier) {
        if (goalDone(st.b, stars, st.v)) return d;
        for (const sq of Object.keys(st.b)) for (const t of targets(st.b, sq)) {
          const { board } = play(st.b, sq, t), v = new Set(st.v); if (stars.includes(t)) v.add(t);
          const k = key(board, v); if (seen.has(k)) continue; seen.add(k); next.push({ b: board, v });
        }
      }
      frontier = next;
    }
    return -1;
  }

  return { parse, targets, play, goalDone, solve, at, name };
});
