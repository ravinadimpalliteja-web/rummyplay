/* EKAH game engine — shared by the browser (vs computer) and the Node server (online rooms). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EkahEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUITS = ['AGNI', 'JAL', 'PRITHVI', 'VAYU'];
  const ACTIONS = ['maya', 'chakra', 'rin'];
  const WILDS = ['brahma', 'mahakal'];
  const HAND_SIZE = 7;
  const TARGET = 300;
  const NAMES = {
    maya: 'Maya', chakra: 'Chakra', rin: 'Rin', brahma: 'Brahma', mahakal: 'Mahakal',
    AGNI: 'Agni', JAL: 'Jal', PRITHVI: 'Prithvi', VAYU: 'Vayu'
  };

  function buildDeck() {
    const deck = [];
    let id = 0;
    for (const suit of SUITS) {
      for (let v = 1; v <= 9; v++) for (let c = 0; c < 2; c++) deck.push({ id: id++, suit, type: 'num', value: v });
      for (const a of ACTIONS) for (let c = 0; c < 2; c++) deck.push({ id: id++, suit, type: a, value: null });
    }
    for (const w of WILDS) for (let c = 0; c < 4; c++) deck.push({ id: id++, suit: null, type: w, value: null });
    return deck; // 104 cards
  }

  function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function cardName(c) {
    if (!c) return '';
    if (c.type === 'num') return NAMES[c.suit] + ' ' + c.value;
    if (c.suit) return NAMES[c.suit] + ' ' + NAMES[c.type];
    return NAMES[c.type];
  }

  function cardPoints(c) {
    if (c.type === 'num') return c.value;
    if (WILDS.includes(c.type)) return 40;
    return 15;
  }

  function createGame(players, opts) {
    opts = opts || {};
    const state = {
      players: players.map(p => ({ name: p.name, isBot: !!p.isBot, hand: [], score: 0 })),
      deck: [], discard: [], color: null, direction: 1, turn: 0, dealer: -1,
      phase: 'idle', pendingDrawn: null, vulnerable: null,
      events: [], seq: 0, round: 0, target: opts.target || TARGET,
      winner: null, roundPoints: 0, matchWinner: null
    };
    state.rnd = opts.rnd || Math.random;
    startRound(state);
    return state;
  }

  function emit(state, ev) {
    ev.seq = ++state.seq;
    state.events.push(ev);
    if (state.events.length > 40) state.events.shift();
  }

  function nextIndex(state, from, steps) {
    const n = state.players.length;
    return (((from + state.direction * (steps || 1)) % n) + n) % n;
  }

  function drawCards(state, pi, k) {
    const got = [];
    for (let i = 0; i < k; i++) {
      if (state.deck.length === 0) {
        if (state.discard.length <= 1) break;
        const top = state.discard.pop();
        state.deck = shuffle(state.discard, state.rnd);
        state.discard = [top];
        emit(state, { type: 'reshuffle' });
      }
      const c = state.deck.pop();
      state.players[pi].hand.push(c);
      got.push(c);
    }
    return got;
  }

  function startRound(state) {
    const n = state.players.length;
    state.round += 1;
    state.dealer = (state.dealer + 1) % n;
    state.deck = shuffle(buildDeck(), state.rnd);
    state.discard = [];
    state.direction = 1;
    state.pendingDrawn = null;
    state.vulnerable = null;
    state.winner = null;
    state.roundPoints = 0;
    for (const p of state.players) p.hand = [];
    for (let r = 0; r < HAND_SIZE; r++) for (let i = 0; i < n; i++) state.players[i].hand.push(state.deck.pop());
    let top = state.deck.pop();
    while (top.type === 'mahakal') {
      state.deck.splice(Math.floor(state.rnd() * state.deck.length), 0, top);
      top = state.deck.pop();
    }
    state.discard.push(top);
    state.color = top.suit; // null for Brahma = any card may follow
    state.phase = 'play';
    const first = (state.dealer + 1) % n;
    state.turn = first;
    emit(state, { type: 'round', round: state.round, card: top });
    if (top.type === 'maya' || (top.type === 'chakra' && n === 2)) {
      emit(state, { type: 'skip', pi: first });
      state.turn = nextIndex(state, first);
    } else if (top.type === 'chakra') {
      state.direction = -1;
      emit(state, { type: 'reverse' });
    } else if (top.type === 'rin') {
      drawCards(state, first, 2);
      emit(state, { type: 'draws', pi: first, n: 2 });
      state.turn = nextIndex(state, first);
    }
  }

  function top(state) { return state.discard[state.discard.length - 1]; }

  function isLegal(state, card) {
    if (WILDS.includes(card.type)) return true;
    if (state.color === null) return true;
    if (card.suit === state.color) return true;
    const t = top(state);
    if (card.type === 'num' && t.type === 'num' && card.value === t.value) return true;
    if (card.type !== 'num' && card.type === t.type) return true;
    return false;
  }

  function legalCards(state, pi) {
    if (state.phase !== 'play' || state.turn !== pi) return [];
    const hand = state.players[pi].hand;
    if (state.pendingDrawn !== null) return hand.filter(c => c.id === state.pendingDrawn).map(c => c.id);
    return hand.filter(c => isLegal(state, c)).map(c => c.id);
  }

  function endRound(state, w) {
    let pts = 0;
    state.players.forEach((p, i) => { if (i !== w) for (const c of p.hand) pts += cardPoints(c); });
    state.players[w].score += pts;
    state.winner = w;
    state.roundPoints = pts;
    state.vulnerable = null;
    state.pendingDrawn = null;
    if (state.players[w].score >= state.target) {
      state.phase = 'matchOver';
      state.matchWinner = w;
    } else state.phase = 'roundOver';
    emit(state, { type: 'win', pi: w, points: pts });
  }

  function applyAction(state, pi, a) {
    if (!a || typeof a.type !== 'string') return { ok: false, error: 'Bad action' };
    const n = state.players.length;
    const me = state.players[pi];
    if (!me) return { ok: false, error: 'No such player' };

    if (a.type === 'catch') {
      if (state.phase !== 'play') return { ok: false, error: 'Round is over' };
      if (state.vulnerable === null || state.vulnerable === pi || a.target !== state.vulnerable)
        return { ok: false, error: 'Nobody to catch' };
      const t = state.vulnerable;
      state.vulnerable = null;
      drawCards(state, t, 2);
      emit(state, { type: 'caught', pi: t, by: pi });
      return { ok: true };
    }

    if (a.type === 'nextRound') {
      if (state.phase === 'roundOver') { startRound(state); return { ok: true }; }
      if (state.phase === 'matchOver') {
        state.players.forEach(p => { p.score = 0; });
        state.matchWinner = null;
        startRound(state);
        return { ok: true };
      }
      return { ok: false, error: 'Round still running' };
    }

    if (state.phase !== 'play') return { ok: false, error: 'Round is over' };
    if (state.turn !== pi) return { ok: false, error: 'Not your turn' };

    if (a.type === 'draw') {
      if (state.pendingDrawn !== null) return { ok: false, error: 'Play the drawn card or pass' };
      state.vulnerable = null;
      const got = drawCards(state, pi, 1);
      emit(state, { type: 'draw', pi });
      if (got.length && isLegal(state, got[0])) {
        state.pendingDrawn = got[0].id;
      } else {
        state.turn = nextIndex(state, pi);
      }
      return { ok: true, drawn: got[0] || null };
    }

    if (a.type === 'pass') {
      if (state.pendingDrawn === null) return { ok: false, error: 'Draw first' };
      state.pendingDrawn = null;
      emit(state, { type: 'pass', pi });
      state.turn = nextIndex(state, pi);
      return { ok: true };
    }

    if (a.type === 'play') {
      const idx = me.hand.findIndex(c => c.id === a.cardId);
      if (idx < 0) return { ok: false, error: 'You do not hold that card' };
      const card = me.hand[idx];
      if (state.pendingDrawn !== null && card.id !== state.pendingDrawn)
        return { ok: false, error: 'You can only play the card you just drew' };
      if (!isLegal(state, card)) return { ok: false, error: 'That card does not match' };
      const wild = WILDS.includes(card.type);
      if (wild && !SUITS.includes(a.color)) return { ok: false, error: 'Choose a suit' };

      state.vulnerable = null;
      state.pendingDrawn = null;
      me.hand.splice(idx, 1);
      state.discard.push(card);
      state.color = wild ? a.color : card.suit;
      emit(state, { type: 'play', pi, card, color: state.color });

      if (me.hand.length === 1) {
        if (a.ekah) emit(state, { type: 'ekah', pi });
        else state.vulnerable = pi;
      }

      let step = 1;
      const next = nextIndex(state, pi);
      if (card.type === 'maya') { step = 2; emit(state, { type: 'skip', pi: next }); }
      else if (card.type === 'chakra') {
        if (n === 2) { step = 2; emit(state, { type: 'skip', pi: next }); }
        else { state.direction *= -1; emit(state, { type: 'reverse' }); }
      } else if (card.type === 'rin' || card.type === 'mahakal') {
        const k = card.type === 'rin' ? 2 : 4;
        drawCards(state, next, k);
        emit(state, { type: 'draws', pi: next, n: k });
        step = 2;
      }

      if (me.hand.length === 0) { endRound(state, pi); return { ok: true }; }
      state.turn = nextIndex(state, pi, step);
      return { ok: true };
    }

    return { ok: false, error: 'Unknown action' };
  }

  function bestColor(hand, rnd) {
    const count = { AGNI: 0, JAL: 0, PRITHVI: 0, VAYU: 0 };
    for (const c of hand) if (c.suit) count[c.suit]++;
    let best = SUITS[Math.floor(rnd() * 4)], bc = -1;
    for (const s of SUITS) if (count[s] > bc) { bc = count[s]; best = s; }
    return bc > 0 ? best : SUITS[Math.floor(rnd() * 4)];
  }

  function botAction(state, pi) {
    const rnd = state.rnd;
    const hand = state.players[pi].hand;
    const legal = legalCards(state, pi);
    if (state.pendingDrawn !== null) {
      const c = hand.find(x => x.id === state.pendingDrawn);
      if (c && legal.includes(c.id) && !(c.type === 'mahakal' && hand.length > 3 && rnd() < 0.5)) {
        const rest = hand.filter(x => x.id !== c.id);
        return { type: 'play', cardId: c.id, color: WILDS.includes(c.type) ? bestColor(rest, rnd) : undefined, ekah: hand.length === 2 && rnd() < 0.9 };
      }
      return { type: 'pass' };
    }
    if (!legal.length) return { type: 'draw' };
    const nextCount = state.players[nextIndex(state, pi)].hand.length;
    const suitCount = {};
    for (const c of hand) if (c.suit) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;
    let best = null, bs = -1e9;
    for (const id of legal) {
      const c = hand.find(x => x.id === id);
      let s = rnd() * 2;
      if (c.type === 'num') s += 10 + c.value * 0.3;
      if (ACTIONS.includes(c.type)) s += nextCount <= 2 ? 30 : 12;
      if (c.type === 'brahma') s += 2;
      if (c.type === 'mahakal') s += nextCount <= 2 ? 40 : -5;
      if (c.suit) s += (suitCount[c.suit] || 0) * 1.5;
      if (s > bs) { bs = s; best = c; }
    }
    const rest = hand.filter(x => x.id !== best.id);
    return {
      type: 'play', cardId: best.id,
      color: WILDS.includes(best.type) ? bestColor(rest, rnd) : undefined,
      ekah: hand.length === 2 && rnd() < 0.9
    };
  }

  function viewFor(state, pi) {
    return {
      you: pi,
      players: state.players.map((p, i) => ({ name: p.name, isBot: p.isBot, count: p.hand.length, score: p.score, hand: (state.phase !== 'play' && i !== pi) ? p.hand : undefined })),
      hand: state.players[pi] ? state.players[pi].hand : [],
      top: top(state), color: state.color, direction: state.direction, turn: state.turn,
      phase: state.phase, deckCount: state.deck.length,
      pendingDrawn: state.turn === pi ? state.pendingDrawn : null,
      vulnerable: state.vulnerable, legal: legalCards(state, pi),
      events: state.events.slice(), seq: state.seq, round: state.round, target: state.target,
      winner: state.winner, roundPoints: state.roundPoints, matchWinner: state.matchWinner
    };
  }

  function totalCards(state) {
    return state.deck.length + state.discard.length + state.players.reduce((s, p) => s + p.hand.length, 0);
  }

  return { SUITS, ACTIONS, WILDS, buildDeck, createGame, startRound, applyAction, legalCards, isLegal, botAction, viewFor, cardName, cardPoints, nextIndex, totalCards };
});
