/**
 * Royal Club Chess - computer opponent. Alpha-beta search with quiescence and piece-square evaluation.
 * Levels: easy (1 ply, makes human-like mistakes), medium (2 plies), hard (iterative deepening up to 5 plies, ~1.5 s).
 * Usage: RoyalChessAI.bestMove(fen, "hard") -> { from, to, promotion, score, depth }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine'));
  else root.RoyalChessAI = factory(root.RoyalChess);
})(typeof self !== 'undefined' ? self : this, function (lib) {
  'use strict';
  const { Chess, NAME } = lib;
  const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  /* Piece-square tables, White's view, index 0 = a8 ... 63 = h1 (values from the "simplified evaluation function"). */
  const PST = {
    P: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    B: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    R: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    Q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    K: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
    KE: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50],
  };
  const LEVELS = {
    easy: { depth: 1, timeMs: 400, noise: 140 },
    medium: { depth: 2, timeMs: 900, noise: 30 },
    hard: { depth: 5, timeMs: 1500, noise: 0 },
  };
  const MATE = 100000, INF = 1e9;

  /** Score from the side to move's point of view, in centipawns. */
  function evaluate(g) {
    let s = 0, heavy = 0;
    const b = g.b;
    for (let q = 0; q < 128; q++) {
      if (q & 0x88) { q += 7; continue; }
      const p = b[q]; if (!p) continue;
      const t = p.toUpperCase();
      if (t === 'Q') heavy += 2; else if (t !== 'P' && t !== 'K') heavy += 1;
    }
    const endgame = heavy <= 4;
    for (let q = 0; q < 128; q++) {
      if (q & 0x88) { q += 7; continue; }
      const p = b[q]; if (!p) continue;
      const white = p === p.toUpperCase(), t = p.toUpperCase();
      const row = q >> 4, file = q & 7, idx = (white ? row : 7 - row) * 8 + file;
      const v = VAL[t] + (t === 'K' ? (endgame ? PST.KE : PST.K)[idx] : PST[t][idx]);
      s += white ? v : -v;
    }
    return g.side === 'w' ? s : -s;
  }

  const orderScore = (m) => (m.captured ? 10000 + 10 * VAL[m.captured.toUpperCase()] - VAL[m.piece.toUpperCase()] : 0) + (m.promotion ? 9000 : 0);
  const ordered = (list) => list.sort((a, b) => orderScore(b) - orderScore(a));

  function bestMove(fen, level = 'medium', opts = {}) {
    const cfg = { ...(LEVELS[level] || LEVELS.medium), ...opts };
    const g = new Chess(fen);
    const start = Date.now(), deadline = start + cfg.timeMs;
    let nodes = 0, stop = false;
    const legalAfter = (m) => { const us = g.side; g.make(m); if (g.attacked(g.kings[us], us === 'w' ? 'b' : 'w')) { g.unmake(); return false; } return true; };

    function quiesce(alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const stand = evaluate(g);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (ply > 24) return alpha;
      for (const m of ordered(g.pseudo(true))) {
        if (!legalAfter(m)) continue;
        const s = -quiesce(-beta, -alpha, ply + 1);
        g.unmake();
        if (stop) return 0;
        if (s >= beta) return beta;
        if (s > alpha) alpha = s;
      }
      return alpha;
    }
    function search(depth, alpha, beta, ply) {
      if (g.half >= 100) return 0;
      if (depth <= 0) return quiesce(alpha, beta, ply);
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const inCheck = g.inCheck();
      let legal = 0;
      for (const m of ordered(g.pseudo())) {
        if (!legalAfter(m)) continue;
        legal++;
        const s = -search(depth - 1 + (inCheck && ply < 6 ? 1 : 0), -beta, -alpha, ply + 1);
        g.unmake();
        if (stop) return 0;
        if (s >= beta) return beta;
        if (s > alpha) alpha = s;
      }
      if (!legal) return inCheck ? -MATE + ply : 0;
      return alpha;
    }

    const root = g.legal();
    if (!root.length) return null;
    for (let i = root.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [root[i], root[j]] = [root[j], root[i]]; }
    ordered(root);
    let best = root[0], bestScore = -INF, reached = 0;

    for (let depth = 1; depth <= cfg.depth; depth++) {
      const scored = [];
      let alpha = -INF;
      for (const m of root) {
        g.make(m);
        // With noise we need a true score for every move; otherwise a normal alpha-beta window is enough.
        const s = cfg.noise ? -search(depth - 1, -INF, INF, 1) : -search(depth - 1, -INF, -alpha, 1);
        g.unmake();
        if (stop) break;
        scored.push({ m, s });
        if (s > alpha) alpha = s;
      }
      if (stop && depth > 1) break;                       // keep the last fully searched depth
      if (!scored.length) break;
      reached = depth;
      const pickFrom = scored.map((x) => ({ ...x, n: x.s + (cfg.noise && Math.abs(x.s) < MATE / 2 ? (Math.random() * 2 - 1) * cfg.noise : 0) }));
      pickFrom.sort((a, b) => b.n - a.n);
      best = pickFrom[0].m; bestScore = pickFrom[0].s;
      root.sort((a, b) => (a === best ? -1 : b === best ? 1 : 0));   // search the best move first next time
      if (Math.abs(bestScore) > MATE / 2 || stop) break;
    }
    return { from: NAME(best.from), to: NAME(best.to), promotion: best.promotion ? best.promotion.toLowerCase() : null,
      score: bestScore, depth: reached, nodes, ms: Date.now() - start };
  }

  return { bestMove, evaluate, LEVELS };
});
