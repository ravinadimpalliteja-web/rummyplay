/**
 * Royal Club Chess - rules engine. No dependencies; runs in the browser, a Web Worker, and Node (for the future game server).
 *
 * Board: 0x88 layout. Square index = row * 16 + file, row 0 is rank 8 (a8 = 0, h1 = 119).
 * Pieces: one character, uppercase = White ("PNBRQK"), lowercase = Black.
 *
 * Public API (class Chess):
 *   new Chess(fen?)              load(fen)           fen()
 *   moves()      -> legal moves with SAN        move({from,to,promotion} | "Nf3") -> move or null
 *   undo()       turn()          board() -> 8x8 array (rank 8 first)     inCheck()
 *   status()     -> { over, result: "1-0"|"0-1"|"1/2-1/2"|"*", reason }
 *   history()    -> played moves     pgn(headers)     perft(depth)
 * Rules: castling, en passant, promotion, check, checkmate, stalemate, threefold repetition,
 * fifty-move rule (applied automatically), insufficient material.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoyalChess = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const KNIGHT = [-33, -31, -18, -14, 14, 18, 31, 33];
  const KING = [-17, -16, -15, -1, 1, 15, 16, 17];
  const DIAG = [-17, -15, 15, 17];
  const ORTHO = [-16, -1, 1, 16];
  const SQ = (n) => (8 - Number(n[1])) * 16 + (n.charCodeAt(0) - 97);
  const NAME = (s) => 'abcdefgh'[s & 7] + (8 - (s >> 4));
  const colorOf = (p) => (p === p.toUpperCase() ? 'w' : 'b');
  const typeOf = (p) => p.toUpperCase();
  const other = (c) => (c === 'w' ? 'b' : 'w');
  const ROOK_HOME = { wK: 119, wQ: 112, bK: 7, bQ: 0 };

  class Chess {
    constructor(fen = START) { this.load(fen); }

    /* ---------- set up ---------- */
    load(fen) {
      const parts = String(fen).trim().split(/\s+/);
      if (parts.length < 4) throw new Error('Bad FEN');
      const b = new Array(128).fill(null), kings = { w: -1, b: -1 };
      const rows = parts[0].split('/');
      if (rows.length !== 8) throw new Error('Bad FEN');
      rows.forEach((row, r) => {
        let f = 0;
        for (const ch of row) {
          if (/\d/.test(ch)) f += Number(ch);
          else {
            if (!/[pnbrqkPNBRQK]/.test(ch) || f > 7) throw new Error('Bad FEN');
            b[r * 16 + f] = ch;
            if (ch === 'K') kings.w = r * 16 + f; if (ch === 'k') kings.b = r * 16 + f;
            f++;
          }
        }
        if (f !== 8) throw new Error('Bad FEN');
      });
      if (kings.w < 0 || kings.b < 0) throw new Error('Both kings are needed');
      this.b = b; this.kings = kings;
      this.side = parts[1] === 'b' ? 'b' : 'w';
      const c = parts[2];
      this.castle = { wK: c.includes('K'), wQ: c.includes('Q'), bK: c.includes('k'), bQ: c.includes('q') };
      this.ep = parts[3] && parts[3] !== '-' ? SQ(parts[3]) : -1;
      this.half = Number(parts[4] || 0);
      this.full = Number(parts[5] || 1);
      this.stack = [];          // internal undo stack (also used by the search)
      this.played = [];         // public history: { move, san, fenBefore }
      this.startFen = this.fen();
      this.reps = new Map();
      this._count(1);
    }

    fen() {
      let out = '';
      for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.b[r * 16 + f];
          if (!p) { empty++; continue; }
          if (empty) { out += empty; empty = 0; }
          out += p;
        }
        if (empty) out += empty;
        if (r < 7) out += '/';
      }
      const c = (this.castle.wK ? 'K' : '') + (this.castle.wQ ? 'Q' : '') + (this.castle.bK ? 'k' : '') + (this.castle.bQ ? 'q' : '');
      return `${out} ${this.side} ${c || '-'} ${this.ep >= 0 ? NAME(this.ep) : '-'} ${this.half} ${this.full}`;
    }

    /** Position key for repetition: placement, side, castling, and en passant only when a capture is possible. */
    key() {
      const f = this.fen().split(' ');
      let ep = '-';
      if (this.ep >= 0) {
        const pawn = this.side === 'w' ? 'P' : 'p', from = this.side === 'w' ? 16 : -16;
        for (const d of [-1, 1]) { const s = this.ep + from + d; if (!(s & 0x88) && this.b[s] === pawn) ep = NAME(this.ep); }
      }
      return `${f[0]} ${f[1]} ${f[2]} ${ep}`;
    }
    _count(d) { const k = this.key(); this.reps.set(k, (this.reps.get(k) || 0) + d); }

    turn() { return this.side; }
    board() {
      const out = [];
      for (let r = 0; r < 8; r++) { const row = []; for (let f = 0; f < 8; f++) row.push(this.b[r * 16 + f]); out.push(row); }
      return out;
    }
    get(square) { return this.b[SQ(square)]; }

    /* ---------- attacks ---------- */
    attacked(sq, by) {
      const b = this.b;
      if (by === 'w') { for (const d of [15, 17]) { const s = sq + d; if (!(s & 0x88) && b[s] === 'P') return true; } }
      else { for (const d of [-15, -17]) { const s = sq + d; if (!(s & 0x88) && b[s] === 'p') return true; } }
      const N = by === 'w' ? 'N' : 'n', K = by === 'w' ? 'K' : 'k';
      const B = by === 'w' ? 'B' : 'b', R = by === 'w' ? 'R' : 'r', Q = by === 'w' ? 'Q' : 'q';
      for (const d of KNIGHT) { const s = sq + d; if (!(s & 0x88) && b[s] === N) return true; }
      for (const d of KING) { const s = sq + d; if (!(s & 0x88) && b[s] === K) return true; }
      for (const d of DIAG) { let s = sq + d; while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === B || p === Q) return true; break; } s += d; } }
      for (const d of ORTHO) { let s = sq + d; while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === R || p === Q) return true; break; } s += d; } }
      return false;
    }
    inCheck(color = this.side) { return this.attacked(this.kings[color], other(color)); }

    /* ---------- move generation ---------- */
    /** Pseudo-legal moves for the side to move (may leave the king in check). */
    pseudo(capturesOnly = false) {
      const b = this.b, us = this.side, them = other(us), out = [];
      const add = (from, to, piece, captured, flag, promo) => {
        if (promo) for (const p of 'qrbn') out.push({ from, to, piece, captured, flag, promotion: us === 'w' ? p.toUpperCase() : p });
        else out.push({ from, to, piece, captured, flag, promotion: null });
      };
      for (let from = 0; from < 128; from++) {
        if (from & 0x88) { from += 7; continue; }
        const p = b[from];
        if (!p || colorOf(p) !== us) continue;
        const t = typeOf(p);
        if (t === 'P') {
          const dir = us === 'w' ? -16 : 16, startRow = us === 'w' ? 6 : 1, lastRow = us === 'w' ? 0 : 7;
          const one = from + dir;
          if (!capturesOnly && !(one & 0x88) && !b[one]) {
            add(from, one, p, null, 'n', (one >> 4) === lastRow);
            const two = one + dir;
            if ((from >> 4) === startRow && !b[two]) add(from, two, p, null, 'b', false);
          } else if (capturesOnly && !(one & 0x88) && !b[one] && (one >> 4) === lastRow) {
            add(from, one, p, null, 'n', true);           // promotions count as tactical moves in the search
          }
          for (const d of [dir - 1, dir + 1]) {
            const to = from + d;
            if (to & 0x88) continue;
            const q = b[to];
            if (q && colorOf(q) === them) add(from, to, p, q, 'c', (to >> 4) === lastRow);
            else if (to === this.ep) add(from, to, p, us === 'w' ? 'p' : 'P', 'e', false);
          }
          continue;
        }
        const steps = t === 'N' ? KNIGHT : t === 'K' ? KING : t === 'B' ? DIAG : t === 'R' ? ORTHO : KING;
        const slide = t === 'B' || t === 'R' || t === 'Q';
        for (const d of steps) {
          let to = from + d;
          while (!(to & 0x88)) {
            const q = b[to];
            if (q) { if (colorOf(q) === them) add(from, to, p, q, 'c', false); break; }
            if (!capturesOnly) add(from, to, p, null, 'n', false);
            if (!slide) break;
            to += d;
          }
        }
        if (t === 'K' && !capturesOnly) {
          const home = us === 'w' ? 116 : 4;
          if (from === home && !this.attacked(home, them)) {
            if (this.castle[us + 'K'] && !b[home + 1] && !b[home + 2] && b[home + 3] === (us === 'w' ? 'R' : 'r') &&
                !this.attacked(home + 1, them) && !this.attacked(home + 2, them)) add(from, home + 2, p, null, 'k', false);
            if (this.castle[us + 'Q'] && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === (us === 'w' ? 'R' : 'r') &&
                !this.attacked(home - 1, them) && !this.attacked(home - 2, them)) add(from, home - 2, p, null, 'q', false);
          }
        }
      }
      return out;
    }

    /* ---------- make / unmake (internal, fast) ---------- */
    make(m) {
      const b = this.b, us = this.side;
      this.stack.push({ m, castle: { ...this.castle }, ep: this.ep, half: this.half, full: this.full });
      b[m.to] = m.promotion || m.piece; b[m.from] = null;
      if (m.flag === 'e') b[m.to + (us === 'w' ? 16 : -16)] = null;
      if (m.flag === 'k') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
      if (m.flag === 'q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
      if (typeOf(m.piece) === 'K') { this.kings[us] = m.to; this.castle[us + 'K'] = false; this.castle[us + 'Q'] = false; }
      for (const k of ['wK', 'wQ', 'bK', 'bQ']) if (m.from === ROOK_HOME[k] || m.to === ROOK_HOME[k]) this.castle[k] = false;
      this.ep = m.flag === 'b' ? (m.from + m.to) / 2 : -1;
      this.half = typeOf(m.piece) === 'P' || m.captured ? 0 : this.half + 1;
      if (us === 'b') this.full++;
      this.side = other(us);
    }
    unmake() {
      const u = this.stack.pop(), m = u.m, b = this.b, us = other(this.side);
      this.side = us; this.castle = u.castle; this.ep = u.ep; this.half = u.half; this.full = u.full;
      b[m.from] = m.piece; b[m.to] = null;
      if (m.flag === 'e') b[m.to + (us === 'w' ? 16 : -16)] = m.captured;
      else if (m.captured) b[m.to] = m.captured;
      if (m.flag === 'k') { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = null; }
      if (m.flag === 'q') { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = null; }
      if (typeOf(m.piece) === 'K') this.kings[us] = m.from;
    }
    /** Fully legal moves (internal objects, no SAN). */
    legal(capturesOnly = false) {
      const us = this.side, out = [];
      for (const m of this.pseudo(capturesOnly)) { this.make(m); if (!this.attacked(this.kings[us], other(us))) out.push(m); this.unmake(); }
      return out;
    }

    /* ---------- notation ---------- */
    san(m, all = this.legal()) {
      let s;
      if (m.flag === 'k') s = 'O-O';
      else if (m.flag === 'q') s = 'O-O-O';
      else {
        const t = typeOf(m.piece), to = NAME(m.to), cap = !!m.captured;
        if (t === 'P') s = (cap ? NAME(m.from)[0] + 'x' : '') + to + (m.promotion ? '=' + typeOf(m.promotion) : '');
        else {
          const rivals = all.filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
          let dis = '';
          if (rivals.length) {
            const sameFile = rivals.some((o) => (o.from & 7) === (m.from & 7)), sameRank = rivals.some((o) => (o.from >> 4) === (m.from >> 4));
            dis = !sameFile ? NAME(m.from)[0] : !sameRank ? NAME(m.from)[1] : NAME(m.from);
          }
          s = t + dis + (cap ? 'x' : '') + to;
        }
      }
      this.make(m);
      if (this.inCheck()) s += this.legal().length ? '+' : '#';
      this.unmake();
      return s;
    }
    _public(m, all) {
      return { from: NAME(m.from), to: NAME(m.to), piece: m.piece, captured: m.captured, promotion: m.promotion,
        flag: m.flag, san: this.san(m, all), color: colorOf(m.piece) };
    }
    /** Legal moves for the side to move, each with SAN. Optional { square } filter. */
    moves(opts = {}) {
      const all = this.legal();
      const list = opts.square ? all.filter((m) => m.from === SQ(opts.square)) : all;
      return list.map((m) => this._public(m, all));
    }

    /** Plays a move given as SAN ("Nf3", "e8=Q", "O-O") or { from, to, promotion }. Returns the move, or null if illegal. */
    move(input) {
      if (this.status().over) return null;
      const all = this.legal();
      let m = null;
      if (typeof input === 'string') {
        const clean = (x) => x.replace(/[+#?!]/g, '').replace(/0/g, 'O');
        m = all.find((o) => clean(this.san(o, all)) === clean(input.trim())) || null;
      } else if (input && input.from && input.to) {
        const from = SQ(input.from), to = SQ(input.to);
        const cands = all.filter((o) => o.from === from && o.to === to);
        if (cands.length > 1) {
          const want = String(input.promotion || 'q').toLowerCase();
          m = cands.find((o) => o.promotion && o.promotion.toLowerCase() === want) || null;
        } else m = cands[0] || null;
      }
      if (!m) return null;
      const pub = this._public(m, all), fenBefore = this.fen();
      this.make(m);
      this.played.push({ move: pub, fenBefore });
      this._count(1);
      return pub;
    }
    undo() {
      if (!this.played.length) return null;
      this._count(-1);
      this.unmake();
      return this.played.pop().move;
    }
    history() { return this.played.map((h) => h.move); }

    /* ---------- game state ---------- */
    insufficient() {
      const minors = [], bishops = [];
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        const p = this.b[s];
        if (!p || typeOf(p) === 'K') continue;
        const t = typeOf(p);
        if (t === 'P' || t === 'R' || t === 'Q') return false;
        minors.push(p);
        if (t === 'B') bishops.push(((s >> 4) + (s & 7)) % 2);
      }
      if (minors.length <= 1) return true;                                          // K v K, K+minor v K
      if (minors.length === bishops.length && bishops.every((c) => c === bishops[0])) return true; // only same-colour bishops
      return false;
    }
    status() {
      const n = this.legal().length;
      if (n === 0) {
        if (this.inCheck()) return { over: true, result: this.side === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
        return { over: true, result: '1/2-1/2', reason: 'stalemate' };
      }
      if (this.insufficient()) return { over: true, result: '1/2-1/2', reason: 'insufficient material' };
      if ((this.reps.get(this.key()) || 0) >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold repetition' };
      if (this.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule' };
      return { over: false, result: '*', reason: null };
    }

    /** Portable Game Notation, so games can later be stored, rated and analysed. */
    pgn(headers = {}, result) {
      const d = new Date(), pad = (n) => String(n).padStart(2, '0');
      const st = this.status();
      const res = result || st.result;
      const h = { Event: 'Royal Club Chess', Site: 'Royal Club', Date: `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`,
        Round: '-', White: 'White', Black: 'Black', ...headers, Result: res };
      if (this.startFen !== START) { h.SetUp = '1'; h.FEN = this.startFen; }
      const tags = Object.entries(h).map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`).join('\n');
      const startFull = Number(this.startFen.split(' ')[5] || 1), blackFirst = this.startFen.split(' ')[1] === 'b';
      const parts = [];
      this.played.forEach((p, i) => {
        const ply = i + (blackFirst ? 1 : 0), num = startFull + Math.floor(ply / 2);
        if (ply % 2 === 0) parts.push(`${num}. ${p.move.san}`);
        else parts.push(i === 0 ? `${num}... ${p.move.san}` : p.move.san);
      });
      parts.push(res);
      const lines = []; let line = '';
      for (const w of parts) { if ((line + ' ' + w).trim().length > 80) { lines.push(line.trim()); line = w; } else line += ' ' + w; }
      if (line.trim()) lines.push(line.trim());
      return `${tags}\n\n${lines.join('\n')}\n`;
    }

    /** Counts leaf positions; used by the tests to prove move generation is exact. */
    perft(depth) {
      if (depth === 0) return 1;
      let n = 0;
      const us = this.side;
      for (const m of this.pseudo()) {
        this.make(m);
        if (!this.attacked(this.kings[us], other(us))) n += depth === 1 ? 1 : this.perft(depth - 1);
        this.unmake();
      }
      return n;
    }
  }

  return { Chess, START, SQ, NAME, colorOf, typeOf };
});
