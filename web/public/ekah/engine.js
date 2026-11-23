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
  const TARGET = 250;
  const TARGET_MIN = 50, TARGET_MAX = 1000, TARGET_STEP = 50;
  /* Jodi: play both copies of a number card together to use its suit's power. */
  const POWERS = {
    AGNI: 'The next player draws 1 card',
    JAL: 'See one card in an opponent\'s hand',
    PRITHVI: 'Discard one extra number card',
    VAYU: 'Give one card to the next player'
  };
  /* House rules a room host can switch (vs computer uses the defaults). */
  const RULES = { stack: true, answerActions: true };
  function cleanRules(r) {
    r = r || {};
    return { stack: r.stack !== false, answerActions: r.answerActions !== false };
  }
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
      phase: 'idle', pendingDrawn: null, vulnerable: null, pending: 0, attack: null,
      events: [], seq: 0, round: 0, target: cleanTarget(opts.target), peek: null,
      winner: null, roundPoints: 0, matchWinner: null, rules: cleanRules(opts.rules)
    };
    state.rnd = opts.rnd || Math.random;
    startRound(state);
    return state;
  }

  function cleanTarget(t) {
    t = Math.round(Number(t) / TARGET_STEP) * TARGET_STEP;
    return Number.isFinite(t) && t >= TARGET_MIN && t <= TARGET_MAX ? t : TARGET;
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
    state.pending = 0;
    state.attack = null;
    state.winner = null;
    state.roundPoints = 0;
    state.peek = null;
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
      // the first player faces +2 and may answer it like any other Rin
      state.pending = 2;
      state.attack = 'rin';
    }
  }

  function top(state) { return state.discard[state.discard.length - 1]; }

  /* Answering: while a Rin (+2) or Mahakal (+4) is waiting, the player may only answer it with
     - Mahakal (adds 4), always;
     - a Rin (adds 2): any Rin after a Rin, or a Rin of the chosen element after a Mahakal;
     - a Maya or Chakra of the current element. They keep their own effect and the waiting cards stay waiting:
         2 players: both mean "play again", so the same player must still answer (stack it or take the cards);
         3+ players: Chakra reverses, so the player who sent the cards must answer them;
                     Maya skips the next player, so the one after must answer them.
     Otherwise they draw every waiting card and lose their turn. Brahma cannot answer.
     House rules: with stacking off nothing answers; with answerActions off Maya and Chakra cannot answer. */
  function rulesOf(state) { return state.rules || RULES; }   // games saved before house rules
  function answers(state, card) {
    const r = rulesOf(state);
    if (!r.stack) return false;
    if (card.type === 'mahakal') return true;
    if (card.type === 'rin') return state.attack === 'rin' || card.suit === state.color;
    if (card.type === 'maya' || card.type === 'chakra') return r.answerActions && card.suit === state.color;
    return false;
  }

  function isLegal(state, card) {
    if (state.pending > 0) return answers(state, card);
    if (WILDS.includes(card.type)) return true;
    if (state.color === null) return true;
    if (card.suit === state.color) return true;
    const t = top(state);
    if (card.type === 'num' && t.type === 'num' && card.value === t.value) return true;
    if (card.type !== 'num' && card.type === t.type) return true;
    return false;
  }

  function partnerOf(hand, card) {
    if (!card || card.type !== 'num') return null;
    return hand.find(c => c.id !== card.id && c.type === 'num' && c.suit === card.suit && c.value === card.value) || null;
  }

  /** Cards the player may play as a Jodi right now (each card of a playable pair is listed). */
  function jodiCards(state, pi) {
    if (state.phase !== 'play' || state.turn !== pi || state.pendingDrawn !== null || state.pending > 0) return [];
    const hand = state.players[pi].hand;
    return hand.filter(c => c.type === 'num' && isLegal(state, c) && partnerOf(hand, c)).map(c => c.id);
  }

  /** What a Jodi power needs the player to choose, given their hand without the pair. */
  function powerNeeds(suit, rest) {
    if (suit === 'JAL') return 'player';
    if (suit === 'PRITHVI') return rest.some(c => c.type === 'num') ? 'number' : null;
    if (suit === 'VAYU') return rest.length ? 'card' : null;
    return null;
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
    state.pending = 0;
    state.attack = null;
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
      if (state.pending > 0) {                       // take every waiting card and lose the turn
        const k = state.pending;
        state.pending = 0;
        state.attack = null;
        drawCards(state, pi, k);
        emit(state, { type: 'draws', pi, n: k });
        state.turn = nextIndex(state, pi);
        return { ok: true, drawn: null };
      }
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
      if (!isLegal(state, card)) return { ok: false, error: state.pending > 0 ? 'Answer with Rin, Mahakal, or a Maya or Chakra of the element, or take the cards' : 'That card does not match' };
      if (a.jodi && state.pending > 0) return { ok: false, error: 'No Jodi while cards are waiting' };
      const wild = WILDS.includes(card.type);
      if (wild && !SUITS.includes(a.color)) return { ok: false, error: 'Choose a suit' };

      if (a.jodi) return playJodi(state, pi, card, a);

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

      const waiting = state.pending > 0;
      let step = 1;
      if (card.type === 'maya') {
        step = 2;
        emit(state, { type: 'skip', pi: nextIndex(state, pi) });
      } else if (card.type === 'chakra') {
        if (n === 2) { step = 2; emit(state, { type: 'skip', pi: nextIndex(state, pi) }); }
        else { state.direction *= -1; emit(state, { type: 'reverse' }); }
      }
      const to = nextIndex(state, pi, step);         // after any skip or reverse: who plays (and answers) next
      if (card.type === 'rin' || card.type === 'mahakal') {
        state.pending = (state.pending || 0) + (card.type === 'rin' ? 2 : 4);   // || 0: games saved before stacking
        state.attack = card.type;
        emit(state, { type: 'stack', pi, to, n: state.pending });
      } else if (waiting) {
        emit(state, { type: 'pass-on', pi, to, n: state.pending, card: card.type });   // Maya / Chakra: the cards still wait
      }

      if (me.hand.length === 0) {
        if (state.pending > 0 && to !== pi) {        // going out while cards wait: whoever must answer takes them
          drawCards(state, to, state.pending);
          emit(state, { type: 'draws', pi: to, n: state.pending });
        }
        endRound(state, pi);
        return { ok: true };
      }
      state.turn = to;
      return { ok: true };
    }

    return { ok: false, error: 'Unknown action' };
  }

  function playJodi(state, pi, card, a) {
    const me = state.players[pi];
    if (state.pendingDrawn !== null) return { ok: false, error: 'You can only play the card you just drew' };
    const partner = partnerOf(me.hand, card);
    if (!partner) return { ok: false, error: 'You need both matching cards for a Jodi' };
    const rest = me.hand.filter(c => c.id !== card.id && c.id !== partner.id);
    const need = powerNeeds(card.suit, rest);
    const p = a.power || {};
    let chosen = null, target = null;
    if (need === 'player') {
      target = Number(p.target);
      if (!Number.isInteger(target) || target === pi || !state.players[target]) return { ok: false, error: 'Choose a player to look at' };
    } else if (need) {
      chosen = rest.find(c => c.id === Number(p.cardId)) || null;
      if (!chosen || (need === 'number' && chosen.type !== 'num'))
        return { ok: false, error: need === 'number' ? 'Choose a number card to discard' : 'Choose a card to give' };
    }

    state.vulnerable = null;
    state.pendingDrawn = null;
    me.hand = rest;
    state.discard.push(partner, card);
    state.color = card.suit;
    emit(state, { type: 'play', pi, card, color: state.color, jodi: true });
    emit(state, { type: 'jodi', pi, suit: card.suit });
    if (me.hand.length === 0) { endRound(state, pi); return { ok: true }; }

    const next = nextIndex(state, pi);
    if (card.suit === 'AGNI') {
      drawCards(state, next, 1);
      emit(state, { type: 'draws', pi: next, n: 1 });
    } else if (card.suit === 'JAL') {
      const th = state.players[target].hand;
      if (th.length) {
        state.peek = { by: pi, target, card: th[Math.floor(state.rnd() * th.length)] };
        emit(state, { type: 'peek', pi, target });
        state.peek.seq = state.seq;
      }
    } else if (card.suit === 'PRITHVI' && chosen) {
      me.hand = me.hand.filter(c => c.id !== chosen.id);
      state.discard.splice(state.discard.length - 1, 0, chosen);   // goes under the Jodi; the top card stays
      emit(state, { type: 'jodiDiscard', pi, card: chosen });
    } else if (card.suit === 'VAYU' && chosen) {
      me.hand = me.hand.filter(c => c.id !== chosen.id);
      state.players[next].hand.push(chosen);
      emit(state, { type: 'give', pi, to: next });
    }

    if (me.hand.length === 0) { endRound(state, pi); return { ok: true }; }
    if (me.hand.length === 1) {
      if (a.ekah) emit(state, { type: 'ekah', pi });
      else state.vulnerable = pi;
    }
    state.turn = next;
    return { ok: true };
  }

  /** The choice a computer player makes for a Jodi power. */
  function botPower(state, pi, card) {
    const hand = state.players[pi].hand;
    const partner = partnerOf(hand, card);
    const rest = hand.filter(c => c.id !== card.id && c.id !== partner.id);
    const need = powerNeeds(card.suit, rest);
    if (need === 'player') {
      let best = null;
      state.players.forEach((p, i) => { if (i !== pi && (best === null || p.hand.length < state.players[best].hand.length)) best = i; });
      return { power: { target: best }, left: rest.length };
    }
    if (need === 'number') {
      const c = rest.filter(x => x.type === 'num').sort((x, y) => y.value - x.value)[0];
      return { power: { cardId: c.id }, left: rest.length - 1 };
    }
    if (need === 'card') {
      const nums = rest.filter(x => x.type === 'num').sort((x, y) => y.value - x.value);
      const plain = rest.filter(x => !WILDS.includes(x.type));
      const c = nums[0] || plain[0] || rest[0];
      return { power: { cardId: c.id }, left: rest.length - 1 };
    }
    return { power: undefined, left: rest.length };
  }

  function bestColor(hand, rnd) {
    const count = { AGNI: 0, JAL: 0, PRITHVI: 0, VAYU: 0 };
    for (const c of hand) if (c.suit) count[c.suit]++;
    let best = SUITS[Math.floor(rnd() * 4)], bc = -1;
    for (const s of SUITS) if (count[s] > bc) { bc = count[s]; best = s; }
    return bc > 0 ? best : SUITS[Math.floor(rnd() * 4)];
  }

  /* When a player's turn timer runs out in a room (owner's rule):
     - discard the lowest NUMBER card of the current element; the game never spends Brahma, Mahakal or an action
       card (Maya, Chakra, Rin) for the player;
     - no number card of that element, or it's the player's last card: draw instead (so nobody wins by running out
       the clock); if the drawn card could be played, it is kept and the turn passes;
     - EKAH is not called for them, so the others may catch a player left with one card. */
  function timeoutAction(state, pi) {
    if (state.phase !== 'play' || state.turn !== pi) return null;
    if (state.pendingDrawn !== null) return { type: 'pass' };
    const hand = state.players[pi].hand;
    if (hand.length > 1) {
      const nums = hand.filter(c => c.type === 'num' && (state.color === null || c.suit === state.color) && isLegal(state, c));
      if (nums.length) {
        nums.sort((a, b) => a.value - b.value || a.id - b.id);
        return { type: 'play', cardId: nums[0].id };
      }
    }
    return { type: 'draw' };
  }

  /* Computer players. level: 'easy' plays any legal card and often forgets EKAH; 'normal' is the classic bot;
     'hard' saves its wild cards, punishes a player close to winning and always calls EKAH. */
  const LEVELS = ['easy', 'normal', 'hard'];
  function botAction(state, pi, level) {
    level = LEVELS.includes(level) ? level : 'normal';
    const rnd = state.rnd;
    const callP = level === 'easy' ? 0.55 : level === 'hard' ? 1 : 0.9;
    const hand = state.players[pi].hand;
    const legal = legalCards(state, pi);
    if (state.pendingDrawn !== null) {
      const c = hand.find(x => x.id === state.pendingDrawn);
      if (c && legal.includes(c.id) && !(c.type === 'mahakal' && hand.length > 3 && rnd() < 0.5)) {
        const rest = hand.filter(x => x.id !== c.id);
        return { type: 'play', cardId: c.id, color: WILDS.includes(c.type) ? bestColor(rest, rnd) : undefined, ekah: hand.length === 2 && rnd() < callP };
      }
      return { type: 'pass' };
    }
    if (!legal.length) return { type: 'draw' };
    if (level === 'easy' && state.pending === 0) {     // easy: any playable card, no plans
      const pick = legal[Math.floor(rnd() * legal.length)];
      const c = hand.find(x => x.id === pick);
      const rest = hand.filter(x => x.id !== c.id);
      return { type: 'play', cardId: c.id, color: WILDS.includes(c.type) ? bestColor(rest, rnd) : undefined, ekah: hand.length === 2 && rnd() < callP };
    }
    if (state.pending > 0) {                         // answer a waiting Rin or Mahakal: Rin first, then Maya/Chakra, Mahakal last
      if (level === 'easy' && rnd() < 0.35) return { type: 'draw' };
      const rank = c => (c.type === 'rin' ? 0 : (c.type === 'maya' || c.type === 'chakra') ? 1 : 2);
      const c = legal.map(id => hand.find(x => x.id === id)).sort((x, y) => rank(x) - rank(y))[0];
      const rest = hand.filter(x => x.id !== c.id);
      return { type: 'play', cardId: c.id, color: c.type === 'mahakal' ? bestColor(rest, rnd) : undefined, ekah: hand.length === 2 && rnd() < callP };
    }
    const nextCount = state.players[nextIndex(state, pi)].hand.length;
    const suitCount = {};
    for (const c of hand) if (c.suit) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;
    const jodi = new Set(jodiCards(state, pi));
    let best = null, bs = -1e9;
    for (const id of legal) {
      const c = hand.find(x => x.id === id);
      let s = rnd() * 2;
      if (jodi.has(id)) s += 22;
      if (c.type === 'num') s += 10 + c.value * 0.3;
      if (ACTIONS.includes(c.type)) s += nextCount <= 2 ? 30 : 12;
      if (c.type === 'brahma') s += 2;
      if (c.type === 'mahakal') s += nextCount <= 2 ? 40 : (level === 'hard' ? -25 : -5);
      if (level === 'hard') {
        if (c.type === 'brahma') s -= hand.length > 2 ? 14 : 0;            // keep wilds for the end
        if ((c.type === 'rin' || c.type === 'maya') && nextCount <= 3) s += 18;
        if (c.type === 'num' && hand.length > 4) s += c.value * 0.6;       // shed high cards early
      }
      if (c.suit) s += (suitCount[c.suit] || 0) * 1.5;
      if (s > bs) { bs = s; best = c; }
    }
    if (jodi.has(best.id)) {
      const bp = botPower(state, pi, best);
      return { type: 'play', cardId: best.id, jodi: true, power: bp.power, ekah: bp.left === 1 && rnd() < callP };
    }
    const rest = hand.filter(x => x.id !== best.id);
    return {
      type: 'play', cardId: best.id,
      color: WILDS.includes(best.type) ? bestColor(rest, rnd) : undefined,
      ekah: hand.length === 2 && rnd() < callP
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
      vulnerable: state.vulnerable, pending: state.pending, attack: state.attack, rules: rulesOf(state), legal: legalCards(state, pi), jodi: jodiCards(state, pi),
      peek: state.peek && state.peek.by === pi ? state.peek : null,
      events: state.events.slice(), seq: state.seq, round: state.round, target: state.target,
      winner: state.winner, roundPoints: state.roundPoints, matchWinner: state.matchWinner
    };
  }

  function totalCards(state) {
    return state.deck.length + state.discard.length + state.players.reduce((s, p) => s + p.hand.length, 0);
  }

  return { SUITS, ACTIONS, WILDS, POWERS, RULES, LEVELS, cleanRules, TARGET, TARGET_MIN, TARGET_MAX, TARGET_STEP, cleanTarget, partnerOf, jodiCards, powerNeeds, buildDeck, createGame, startRound, applyAction, legalCards, isLegal, botAction, timeoutAction, viewFor, cardName, cardPoints, nextIndex, totalCards };
});
