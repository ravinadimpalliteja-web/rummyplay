/* EKAH browser client: home, lobby, table. Runs vs-computer games locally and online games over WebSocket. */
(function () {
  'use strict';
  const E = window.EkahEngine;
  /* Room server address: written by the site build into config.js. On localhost and Netlify previews,
     ?server=wss://... may override it for testing (never on the live site), as in the rest of Royal Club. */
  function serverUrl() {
    const host = location.hostname;
    const testing = host === 'localhost' || host === '127.0.0.1' || host.startsWith('deploy-preview-') || host.includes('--');
    const q = testing ? new URLSearchParams(location.search).get('server') : null;
    const url = String(q || window.RC_ROOM_SERVER_URL || '').trim();
    return /^wss?:\/\//.test(url) ? url : '';
  }
  const OFFLINE_ONLY = !!window.EKAH_OFFLINE_ONLY || !serverUrl();
  const $ = (id) => document.getElementById(id);
  const SUIT_LABEL = { AGNI: 'Agni', JAL: 'Jal', PRITHVI: 'Prithvi', VAYU: 'Vayu' };
  const SUIT_COLOR = { AGNI: '#FF6B2C', JAL: '#2F6BFF', PRITHVI: '#22B35E', VAYU: '#A24DE0' };
  const AVATAR_COLORS = ['#2878C8', '#B4465A', '#3C8C5A', '#BE6E1E', '#7A4FC0', '#1F9AA0', '#C0428A', '#8A7A20', '#4A5CC8', '#A0522D'];
  const BOT_NAMES = ['Arjun', 'Meera', 'Kabir', 'Ananya', 'Vikram', 'Priya', 'Rohan', 'Isha'];
  const store = {
    get(k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
    set(k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch (e) {} },
    del(k, s) { try { (s ? sessionStorage : localStorage).removeItem(k); } catch (e) {} }
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- card rendering ----------
  const ICON = {
    maya: '<svg class="icon" viewBox="0 0 100 100" aria-hidden="true"><path d="M8 50 Q50 12 92 50 Q50 88 8 50Z" fill="#fff"/><circle cx="50" cy="50" r="14" style="fill:var(--ink)"/><path d="M18 82 L82 18" style="stroke:var(--ink)" stroke-width="15" stroke-linecap="round"/><path d="M18 82 L82 18" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>',
    chakra: '<svg class="icon" viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="#fff" stroke-linecap="round"><circle cx="50" cy="50" r="36" stroke-width="8"/><g stroke-width="5"><path d="M50 14V86M14 50H86M24.5 24.5L75.5 75.5M75.5 24.5L24.5 75.5"/></g><circle cx="50" cy="50" r="11" fill="#fff" stroke="none"/><circle cx="50" cy="50" r="5" style="fill:var(--ink)" stroke="none"/></svg>'
  };
  function cardHTML(c, tag, attrs) {
    tag = tag || 'div'; attrs = attrs || '';
    if (!c) return '';
    const name = E.cardName(c);
    let cls = 'card', inner = '';
    if (c.type === 'num') {
      cls += ' s-' + c.suit;
      inner = '<span class="disc"></span><span class="corner">' + c.value + '</span><span class="big">' + c.value + '</span><span class="pill">' + c.suit + '</span>';
    } else if (c.type === 'maya' || c.type === 'chakra') {
      cls += ' s-' + c.suit;
      inner = '<span class="disc"></span>' + ICON[c.type] + '<span class="pill">' + c.type.toUpperCase() + '</span>';
    } else if (c.type === 'rin') {
      cls += ' s-' + c.suit;
      inner = '<span class="disc"></span><span class="corner">+2</span><span class="big sm">+2</span><span class="pill">RIN</span>';
    } else if (c.type === 'brahma') {
      cls += ' wild';
      inner = '<span class="quad"></span><span class="big sm">W</span><span class="pill">BRAHMA</span>';
    } else {
      cls += ' wild';
      inner = '<span class="dia"><span style="background:var(--agni)"></span><span style="background:var(--jal)"></span><span style="background:var(--vayu)"></span><span style="background:var(--prithvi)"></span></span><span class="corner">+4</span><span class="big sm">+4</span><span class="pill">MAHAKAL</span>';
    }
    return '<' + tag + ' class="' + cls + '" ' + attrs + ' aria-label="' + esc(name) + '">' + inner + '</' + tag + '>';
  }
  function backHTML() {
    return '<div class="card back" aria-hidden="true"><div class="stripes"><span style="background:var(--agni)"></span><span style="background:var(--jal)"></span><span style="background:var(--prithvi)"></span><span style="background:var(--vayu)"></span></div><div class="word">EKAH</div></div>';
  }

  const CROWN = '<svg class="crown" viewBox="0 0 34 26" aria-hidden="true"><path d="M2 22 L4 6 L11 13 L17 2 L23 13 L30 6 L32 22 Z" fill="currentColor" stroke="#1A0B38" stroke-width="2" stroke-linejoin="round"/><circle cx="17" cy="16" r="2.5" fill="#1A0B38"/></svg>';
  const SUIT_ELEMENT = { AGNI: 'Fire', JAL: 'Water', PRITHVI: 'Earth', VAYU: 'Air' };
  const POWER_TEXT = {
    AGNI: 'The next player draws 1 card.',
    JAL: 'Choose an opponent and see one of their cards for a few seconds.',
    PRITHVI: 'Discard one extra number card from your hand.',
    VAYU: 'Give one card from your hand to the next player.'
  };
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const avatarColor = (i) => AVATAR_COLORS[i % AVATAR_COLORS.length];

  // ---------- sound (made in the browser, no audio files) ----------
  const Sound = (function () {
    let ctx = null, muted = store.get('ekahMuted') === '1', noiseBuf = null;
    function ac() {
      if (!ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        try { ctx = new C(); } catch (e) { return null; }
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    function tone(c, f, t, d, type, vol, f2) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + d + 0.03);
    }
    function noise(c, t, d, vol, freq) {
      if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
        const ch = noiseBuf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      }
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noiseBuf;
      f.type = 'bandpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq * 0.5, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(f); f.connect(g); g.connect(c.destination);
      s.start(t); s.stop(t + d + 0.02);
    }
    const FX = {
      play(c, t) { noise(c, t, 0.16, 0.35, 2600); tone(c, 170, t + 0.11, 0.08, 'sine', 0.12); },
      draw(c, t) { noise(c, t, 0.12, 0.16, 1500); },
      maya(c, t) { tone(c, 660, t, 0.14, 'triangle', 0.14); tone(c, 440, t + 0.12, 0.22, 'triangle', 0.14); },
      chakra(c, t) { tone(c, 300, t, 0.35, 'sine', 0.14, 900); tone(c, 900, t + 0.3, 0.25, 'sine', 0.1, 300); },
      rin(c, t) { tone(c, 520, t, 0.09, 'square', 0.06); tone(c, 520, t + 0.13, 0.09, 'square', 0.06); },
      brahma(c, t) { [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.06, 0.3, 'sine', 0.1)); },
      mahakal(c, t) { tone(c, 90, t, 0.6, 'sine', 0.35, 45); noise(c, t, 0.4, 0.22, 320); tone(c, 220, t + 0.05, 0.4, 'sawtooth', 0.05, 110); },
      jodi(c, t) { [784, 988, 1175, 1568].forEach((f, i) => tone(c, f, t + i * 0.07, 0.25, 'triangle', 0.1)); },
      ekah(c, t) { [1047, 1319, 1568].forEach((f, i) => tone(c, f, t + i * 0.09, 0.5, 'sine', 0.13)); },
      caught(c, t) { tone(c, 150, t, 0.35, 'sawtooth', 0.12, 110); },
      turn(c, t) { tone(c, 880, t, 0.12, 'sine', 0.06); },
      win(c, t) {
        [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.12, 0.35, 'triangle', 0.14));
        [1047, 1319, 1568].forEach((f) => tone(c, f, t + 0.55, 0.9, 'sine', 0.08));
      }
    };
    return {
      play(name, delay) {
        if (muted) return;
        const c = ac();
        if (!c || !FX[name]) return;
        try { FX[name](c, c.currentTime + 0.01 + (delay || 0)); } catch (e) {}
      },
      unlock() { if (!muted) ac(); },
      get muted() { return muted; },
      toggle() { muted = !muted; store.set('ekahMuted', muted ? '1' : '0'); if (!muted) ac(); return muted; }
    };
  })();
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
  const SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/>';
  function paintMute() {
    const b = $('muteBtn');
    b.innerHTML = SPEAKER + (Sound.muted ? '<path d="M17 9l5 6M22 9l-5 6"/></svg>' : '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>');
    b.setAttribute('aria-pressed', String(!Sound.muted));
    b.setAttribute('aria-label', Sound.muted ? 'Sound is off. Turn sound on' : 'Sound is on. Turn sound off');
  }
  $('muteBtn').addEventListener('click', () => { Sound.toggle(); paintMute(); });
  paintMute();

  // ---------- screens & toasts ----------
  function show(id) {
    ['home', 'lobby', 'game'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
    if (id !== 'game') {
      ['resultOverlay', 'pickerOverlay', 'jodiOverlay', 'peekOverlay'].forEach((o) => $(o).classList.add('hidden'));
      $('fx').innerHTML = '';
    }
  }
  function toast(msg, bad) {
    const el = document.createElement('div');
    el.className = 'toast' + (bad ? ' bad' : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), 2600);
  }

  // ---------- game view ----------
  let ctrl = null, view = null, lastSeq = null, lastTop = null, prevHand = new Set(), armed = false, pickFor = null;
  let celebrated = null, celebrateTimers = [], winnerPi = null, scoresBefore = null, lastPeekSeq = 0, peekTimer = 0, feltCw = 70;

  function nm(i, cap) {
    if (!view) return '';
    if (i === view.you) return cap === false ? 'you' : 'You';
    return view.players[i].name;
  }
  function sortHand(h) {
    const so = { AGNI: 0, JAL: 1, PRITHVI: 2, VAYU: 3 }, to = { num: 0, maya: 1, chakra: 2, rin: 3, brahma: 4, mahakal: 5 };
    return h.slice().sort((a, b) => (a.suit ? so[a.suit] : 9) - (b.suit ? so[b.suit] : 9) || to[a.type] - to[b.type] || (a.value || 0) - (b.value || 0));
  }
  function seatEl(pi) {
    if (!view) return null;
    return pi === view.you ? $('meSeat') : $('opps').querySelector('[data-seat="' + pi + '"]');
  }
  function playText(ev) {
    const c = ev.card;
    return nm(ev.pi) + ' played ' + (ev.jodi ? 'a Jodi of ' + E.cardName(c) + 's' : E.cardName(c)) + (c.suit ? '' : ' · ' + SUIT_LABEL[ev.color]);
  }

  function render(v) {
    const prev = view, first = !prev;
    view = v;
    show('game');
    $('meta').textContent = 'Round ' + v.round + ' · to ' + v.target;
    renderSeats(v);
    renderMe(v);
    renderCenter(v);
    renderStatus(v);
    renderHand(v, first);
    layout();
    handleEvents(v, first);
    handlePeek(v, first);
    handleRound(v, prev, first);
    if (!first && v.phase === 'play' && v.turn === v.you && prev.turn !== v.you) Sound.play('turn', 0.45);
    if (v.phase !== 'play') { $('pickerOverlay').classList.add('hidden'); $('jodiOverlay').classList.add('hidden'); }
  }

  function renderSeats(v) {
    const n = v.players.length;
    let html = '';
    for (let k = 1; k < n; k++) {
      const i = (v.you + k) % n, p = v.players[i];
      const active = v.phase === 'play' && v.turn === i;
      html += '<div class="seat' + (active ? ' active' : '') + (p.away ? ' away' : '') + (winnerPi === i ? ' winner' : '') + '" data-seat="' + i + '">' +
        (winnerPi === i ? CROWN : '') +
        (p.count === 1 && v.phase === 'play' ? '<span class="badge">EKAH</span>' : '') +
        '<div class="avatar" style="--c:' + avatarColor(i) + '">' + esc(p.name.charAt(0).toUpperCase()) + '</div>' +
        '<div class="sinfo"><div class="name">' + esc(p.name) + (p.away ? ' (away)' : '') + '</div>' +
        '<div class="count"><b>' + p.count + '</b> ' + (p.count === 1 ? 'card' : 'cards') + '<br>' + p.score + ' pts</div></div>' +
        (active ? '<span class="dots" aria-label="Thinking"><i></i><i></i><i></i></span>' : '') +
        (v.vulnerable === i && v.phase === 'play' ? '<button class="catch" data-catch="' + i + '">Catch!</button>' : '') +
        '</div>';
    }
    $('opps').innerHTML = html;
  }

  function renderMe(v) {
    const me = v.players[v.you];
    const el = $('meSeat');
    el.className = 'meseat' + (v.phase === 'play' && v.turn === v.you ? ' active' : '') + (winnerPi === v.you ? ' winner' : '');
    el.innerHTML = (winnerPi === v.you ? CROWN : '') +
      '<div class="avatar" style="--c:' + avatarColor(v.you) + '">' + esc(me.name.charAt(0).toUpperCase()) + '</div>' +
      '<div class="count"><b>' + esc(me.name) + '</b><br>' + me.score + ' pts</div>';
  }

  function renderCenter(v) {
    const myTurn = v.phase === 'play' && v.turn === v.you;
    const canDraw = myTurn && v.pendingDrawn === null;
    $('deck').innerHTML = backHTML() + backHTML() + '<span class="deck-label">' + v.deckCount + ' left</span>';
    $('deck').disabled = !canDraw;
    $('deck').classList.toggle('can', canDraw && v.legal.length === 0);
    if (!v.top || v.top.id !== lastTop) {
      lastTop = v.top ? v.top.id : null;
      $('pile').innerHTML = cardHTML(v.top) + '<span class="colorchip"></span>';
    }
    const chip = $('pile').querySelector('.colorchip');
    if (chip) chip.innerHTML = v.color ? '<i style="--c:' + SUIT_COLOR[v.color] + '"></i>' + SUIT_LABEL[v.color] : '<i style="--c:#888"></i>Any suit';
    $('direction').classList.toggle('rev', v.direction === -1);
  }

  function renderStatus(v) {
    const myTurn = v.phase === 'play' && v.turn === v.you;
    const msg = $('statusMsg');
    msg.classList.toggle('turn', myTurn);
    if (v.phase !== 'play') msg.textContent = '';
    else if (myTurn && v.pendingDrawn !== null) msg.textContent = 'It fits! Play it or keep it';
    else if (myTurn) msg.textContent = v.legal.length ? 'Your turn' : 'No match: tap the deck to draw';
    else msg.textContent = nm(v.turn) + ' is thinking…';
    const jodiSoon = (v.jodi || []).length && (v.hand.length === 3 || v.hand.length === 4);
    const needEkah = myTurn && (v.hand.length === 2 || jodiSoon);
    if (!needEkah) armed = false;
    $('ekahBtn').classList.toggle('hidden', !needEkah);
    $('ekahBtn').classList.toggle('armed', armed);
    $('ekahBtn').classList.toggle('nudge', needEkah && !armed);
    $('ekahBtn').textContent = armed ? 'EKAH! ✓' : 'EKAH!';
    $('passBtn').classList.toggle('hidden', !(myTurn && v.pendingDrawn !== null));
  }

  function renderHand(v, first) {
    const myTurn = v.phase === 'play' && v.turn === v.you;
    const hand = sortHand(v.hand);
    const legal = new Set(v.legal), jodi = new Set(v.jodi || []);
    const nowIds = new Set(hand.map((c) => c.id));
    $('hand').innerHTML = hand.map((c) => {
      const ok = legal.has(c.id);
      const cls = (ok ? ' playable' : (myTurn ? ' dim' : '')) + (!first && !prevHand.has(c.id) ? ' new' : '');
      return cardHTML(c, 'button', 'data-id="' + c.id + '"' + (ok ? '' : ' tabindex="-1"'))
        .replace('class="card', 'class="card' + cls)
        .replace(/<\/button>$/, (jodi.has(c.id) ? '<span class="jodi-tag">JODI</span>' : '') + '</button>');
    }).join('');
    prevHand = nowIds;
    /* place new cards without the slide transition, then let later moves (resizing) animate */
    const els = Array.from($('hand').children);
    els.forEach((el) => { el.style.transition = 'none'; });
    arrangeHand();
    requestAnimationFrame(() => requestAnimationFrame(() => els.forEach((el) => { el.style.transition = ''; })));
  }

  /* Your cards sit on a gentle arc that flattens as your hand grows, so large hands still fit. */
  function arrangeHand() {
    const h = $('hand');
    const cards = Array.from(h.children);
    const n = cards.length;
    if (!n) return;
    const W = h.clientWidth, cw = cards[0].offsetWidth, ch = cards[0].offsetHeight;
    /* leave room at both ends for the tilt of the outer cards, so none hangs off the screen */
    let sp = n > 1 ? Math.min(cw * 0.62, (W - cw * 1.75 - 12) / (n - 1)) : 0;
    sp = Math.max(sp, Math.min(12, cw * 0.2));
    const R = Math.max(W * 1.15, 360) * (1 + Math.max(0, n - 8) * 0.1);
    let maxSag = 0;
    cards.forEach((el, i) => {
      const x = (i - (n - 1) / 2) * sp;
      const sag = R - Math.sqrt(Math.max(0, R * R - x * x));
      const deg = Math.asin(Math.max(-1, Math.min(1, x / R))) * 180 / Math.PI;
      maxSag = Math.max(maxSag, sag);
      el.style.left = (W / 2 + x - cw / 2) + 'px';
      el.style.top = (18 + sag) + 'px';
      el.style.setProperty('--rot', deg.toFixed(2) + 'deg');
      el.style.zIndex = String(i + 1);
    });
    h.style.height = Math.ceil(18 + ch + maxSag + 6) + 'px';
  }

  /* Seats around the table like Royal Club Spades: you at the bottom, others from your left, over the top, to your right. */
  function seatAngles(k) {
    if (k === 1) return [90];
    if (k === 2) return [165, 15];
    if (k === 3) return [180, 90, 0];
    return Array.from({ length: k }, (_, j) => 200 - j * 220 / (k - 1));
  }
  function layout() {
    if (!view || $('game').classList.contains('hidden')) return;
    const arena = $('arena'), W = arena.clientWidth, H = arena.clientHeight;
    const seats = Array.from($('opps').children);
    const felt = $('felt');
    let L = 10, T = 8;
    if (seats.length) {
      const sw = seats[0].offsetWidth, sh = seats[0].offsetHeight, ang = seatAngles(seats.length);
      const rx = Math.max(0, W / 2 - sw / 2 - 2), ry = Math.max(0, H / 2 - sh / 2 - 2);
      seats.forEach((el, j) => {
        const a = ang[j] * Math.PI / 180;
        el.style.left = (W / 2 + rx * Math.cos(a) - sw / 2) + 'px';
        el.style.top = (H / 2 - ry * Math.sin(a) - sh / 2) + 'px';
      });
      if (ang.some((a) => Math.abs(Math.cos(a * Math.PI / 180)) > 0.55)) L = sw + 10;
      if (ang.some((a) => Math.sin(a * Math.PI / 180) > 0.5)) T = sh + 6;
    }
    felt.style.left = felt.style.right = L + 'px';
    felt.style.top = T + 'px';
    felt.style.bottom = '8px';
    const fw = W - 2 * L, fh = H - T - 8;
    const handCw = $('hand').firstElementChild ? $('hand').firstElementChild.offsetWidth : 80;
    feltCw = Math.round(Math.max(38, Math.min(handCw, (fh - 46) / 1.5 * 0.82, (fw - 40) / 2.5)));
    felt.style.setProperty('--cw', feltCw + 'px');
  }
  window.addEventListener('resize', () => { if (view) { arrangeHand(); layout(); } });

  // ---------- effects: flying cards, bubbles by the seats ----------
  function flyCard(html, from, to, cw, done, delay, endScale) {
    if (REDUCED || !from || !to) { if (done) done(); return; }
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const w = cw, h = cw * 1.5;
    const x0 = a.left + a.width / 2 - w / 2, y0 = a.top + a.height / 2 - h / 2;
    const x1 = b.left + b.width / 2 - w / 2, y1 = b.top + b.height / 2 - h / 2;
    const el = document.createElement('div');
    el.className = 'fly';
    el.style.setProperty('--cw', cw + 'px');
    el.innerHTML = html;
    el.style.transform = 'translate(' + x0 + 'px,' + y0 + 'px) scale(.55) rotate(-14deg)';
    $('fx').appendChild(el);
    let fin = false;
    const end = () => { if (fin) return; fin = true; el.remove(); if (done) done(); };
    setTimeout(() => {
      requestAnimationFrame(() => { el.style.transform = 'translate(' + x1 + 'px,' + y1 + 'px) scale(' + (endScale || 1) + ') rotate(0deg)'; });
    }, (delay || 0) + 16);
    el.addEventListener('transitionend', end);
    setTimeout(end, (delay || 0) + 800);
  }
  function bubble(pi, text, kind, color, delay) {
    setTimeout(() => {
      const el = seatEl(pi);
      if (!el || $('game').classList.contains('hidden')) return;
      const r = el.getBoundingClientRect();
      const b = document.createElement('div');
      const below = r.top < 90;
      b.className = 'bubble ' + (kind || '') + (below ? ' below' : '');
      if (color) b.style.setProperty('--c', color);
      b.textContent = text;
      b.style.left = (r.left + r.width / 2) + 'px';
      b.style.top = (below ? r.bottom + 6 : r.top - 6) + 'px';
      $('fx').appendChild(b);
      setTimeout(() => b.remove(), 2300);
    }, delay || 0);
  }
  const SOUND_FOR = { maya: 'maya', chakra: 'chakra', rin: 'rin', brahma: 'brahma', mahakal: 'mahakal' };

  function handleEvents(v, first) {
    if (first || lastSeq === null) {
      lastSeq = v.seq;
      const lp = v.events.slice().reverse().find((e) => e.type === 'play');
      $('lastMove').textContent = lp && v.phase === 'play' ? playText(lp) : '';
      return;
    }
    const fresh = v.events.filter((e) => e.seq > lastSeq);
    lastSeq = v.seq;
    let cap = null, lastPlayPi = null;
    const AFTER = 420;
    for (const ev of fresh) {
      switch (ev.type) {
        case 'play': {
          lastPlayPi = ev.pi;
          cap = playText(ev);
          const pileCard = $('pile').querySelector('.card');
          const isTop = v.top && ev.card.id === v.top.id;
          if (isTop && pileCard && !REDUCED) pileCard.style.visibility = 'hidden';
          const from = ev.pi === v.you ? $('hand') : seatEl(ev.pi);
          const html = cardHTML(ev.card);
          if (ev.jodi) flyCard(html, from, $('pile'), feltCw, null, 0);
          flyCard(html, from, $('pile'), feltCw, () => { if (isTop && pileCard) pileCard.style.visibility = ''; }, ev.jodi ? 120 : 0);
          Sound.play('play');
          if (SOUND_FOR[ev.card.type]) Sound.play(SOUND_FOR[ev.card.type], 0.38);
          break;
        }
        case 'draw':
          flyCard(backHTML(), $('deck'), ev.pi === v.you ? $('hand') : seatEl(ev.pi), feltCw, null, 0, 0.6);
          Sound.play('draw');
          if (ev.pi !== v.you) bubble(ev.pi, 'Drew 1', '', null, 200);
          break;
        case 'draws':
          for (let j = 0; j < ev.n; j++) flyCard(backHTML(), $('deck'), ev.pi === v.you ? $('hand') : seatEl(ev.pi), feltCw, null, AFTER + j * 110, 0.6);
          for (let j = 0; j < Math.min(ev.n, 4); j++) Sound.play('draw', (AFTER + j * 110) / 1000);
          bubble(ev.pi, '+' + ev.n + (ev.n === 1 ? ' card' : ' cards'), 'bad', null, AFTER);
          break;
        case 'skip':
          bubble(ev.pi, 'Skipped', 'bad', null, AFTER);
          break;
        case 'reverse':
          if (lastPlayPi !== null) bubble(lastPlayPi, 'Reversed', 'gold', null, AFTER);
          cap = 'Direction reversed';
          break;
        case 'ekah':
          bubble(ev.pi, 'EKAH!', 'gold', null, 150);
          Sound.play('ekah', 0.15);
          break;
        case 'caught':
          bubble(ev.pi, 'Caught! +2', 'bad', null, 0);
          bubble(ev.by, 'Caught ' + nm(ev.pi, false) + '!', 'gold', null, 150);
          Sound.play('caught');
          cap = nm(ev.by) + ' caught ' + nm(ev.pi, false) + ' without EKAH!';
          break;
        case 'jodi':
          bubble(ev.pi, 'JODI · ' + SUIT_LABEL[ev.suit], 'suit', SUIT_COLOR[ev.suit], 250);
          Sound.play('jodi', 0.3);
          break;
        case 'peek':
          bubble(ev.pi, 'Looked at a card', 'suit', SUIT_COLOR.JAL, AFTER);
          cap = nm(ev.pi) + ' looked at one of ' + (ev.target === v.you ? 'your' : nm(ev.target) + '\'s') + ' cards';
          break;
        case 'give':
          bubble(ev.to, '+1 card from ' + nm(ev.pi, false), 'suit', SUIT_COLOR.VAYU, AFTER);
          flyCard(backHTML(), seatEl(ev.pi) || $('hand'), ev.to === v.you ? $('hand') : seatEl(ev.to), feltCw, null, AFTER, 0.6);
          cap = nm(ev.pi) + ' gave a card to ' + nm(ev.to, false);
          break;
        case 'jodiDiscard':
          bubble(ev.pi, 'Discarded ' + E.cardName(ev.card), 'suit', SUIT_COLOR.PRITHVI, AFTER);
          break;
        case 'pass':
          if (ev.pi !== v.you) bubble(ev.pi, 'Kept it', '', null, 0);
          break;
        case 'reshuffle':
          cap = 'Pile shuffled back into the deck';
          break;
        case 'round':
          cap = 'Round ' + ev.round;
          break;
        default:
          break;
      }
    }
    if (cap !== null) $('lastMove').textContent = cap;
    if (v.phase !== 'play') $('lastMove').textContent = '';
  }

  function handlePeek(v, first) {
    if (!v.peek || !v.peek.seq) return;
    if (first) { lastPeekSeq = Math.max(lastPeekSeq, v.peek.seq); return; }
    if (v.peek.seq <= lastPeekSeq) return;
    lastPeekSeq = v.peek.seq;
    setTimeout(() => {
      $('peekTitle').textContent = nm(v.peek.target) + '\'s card';
      $('peekCard').innerHTML = cardHTML(v.peek.card);
      $('peekOverlay').classList.remove('hidden');
      clearTimeout(peekTimer);
      peekTimer = setTimeout(() => $('peekOverlay').classList.add('hidden'), 3500);
    }, 650);
  }
  $('peekClose').addEventListener('click', () => { clearTimeout(peekTimer); $('peekOverlay').classList.add('hidden'); });

  // ---------- end of a round: winner moment, then scores ----------
  function clearCelebration() {
    celebrateTimers.forEach(clearTimeout);
    celebrateTimers = [];
    $('fx').querySelectorAll('.banner, .confetti').forEach((el) => el.remove());
  }
  function handleRound(v, prev, first) {
    const over = v.phase === 'roundOver' || v.phase === 'matchOver';
    if (!over) {
      if (celebrated !== null) { clearCelebration(); celebrated = null; winnerPi = null; renderSeats(v); renderMe(v); layout(); }
      $('resultOverlay').classList.add('hidden');
      if (v.phase === 'play') scoresBefore = v.players.map((p) => p.score);
      return;
    }
    const key = v.round + ':' + v.winner + ':' + v.phase;
    if (celebrated === key) {
      if (!$('resultOverlay').classList.contains('hidden')) showResults(v, false);
      return;
    }
    celebrated = key;
    winnerPi = v.winner;
    renderSeats(v); renderMe(v); layout();
    if (first || !prev || prev.phase !== 'play') { showResults(v, false); return; }
    celebrateTimers.push(setTimeout(() => celebrate(v), 500));
    celebrateTimers.push(setTimeout(() => showResults(v, true), v.phase === 'matchOver' ? 4600 : 3600));
  }
  function celebrate(v) {
    const w = v.winner, match = v.phase === 'matchOver';
    Sound.play('win');
    const banner = document.createElement('div');
    banner.className = 'banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = CROWN.replace('class="crown"', '') +
      '<b>' + esc(w === v.you ? (match ? 'You win the match!' : 'You win the round!') : v.players[w].name + (match ? ' wins the match!' : ' wins the round!')) + '</b>' +
      '<small>+' + v.roundPoints + ' points · tap to see scores</small>';
    banner.addEventListener('click', () => { clearCelebration(); showResults(view, true); });
    $('fx').appendChild(banner);
    if (REDUCED) return;
    const colors = [SUIT_COLOR.AGNI, SUIT_COLOR.JAL, SUIT_COLOR.PRITHVI, SUIT_COLOR.VAYU, '#FFC93C', '#FFFFFF'];
    const count = match ? 110 : 60;
    for (let i = 0; i < count; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = (Math.random() * 100) + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
      c.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
      c.style.animationDuration = (1.8 + Math.random() * 1.6) + 's';
      c.style.animationDelay = (Math.random() * 0.6) + 's';
      $('fx').appendChild(c);
    }
  }
  function countUp(el, from, to, ms) {
    if (REDUCED || from === to) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = from;
    requestAnimationFrame(step);
  }
  function showResults(v, animate) {
    clearCelebration();
    const w = v.winner, match = v.phase === 'matchOver';
    $('resTitle').textContent = (w === v.you ? 'You win' : v.players[w].name + ' wins') + (match ? ' the match!' : ' the round!');
    $('resSub').textContent = '+' + v.roundPoints + ' points from the cards left in other hands' + (match ? '' : ' · first to ' + v.target + ' wins');
    const rows = v.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.score - a.p.score);
    $('resScores').innerHTML = '<tr><td><b>Player</b></td><td class="n">Cards left</td><td class="n">Score</td></tr>' +
      rows.map((r) => '<tr class="' + (r.i === w ? 'win' : '') + '"><td>' + esc(r.i === v.you ? r.p.name + ' (you)' : r.p.name) +
        (r.i === w ? '<span class="plus">+' + v.roundPoints + '</span>' : '') + '</td><td class="n">' + r.p.count + '</td><td class="n" data-score="' + r.i + '">' + r.p.score + '</td></tr>').join('');
    if (animate && scoresBefore && scoresBefore[w] !== undefined) {
      const cell = $('resScores').querySelector('[data-score="' + w + '"]');
      if (cell) countUp(cell, scoresBefore[w], v.players[w].score, 1000);
    }
    const hostOnly = match && ctrl && ctrl.online && !ctrl.isHost;
    $('nextRound').textContent = hostOnly ? 'Waiting for the host' : (match ? 'Play a new match' : 'Next round');
    $('nextRound').disabled = !!hostOnly;
    $('resultOverlay').classList.remove('hidden');
  }

  // ---------- input ----------
  $('hand').addEventListener('click', (e) => {
    const b = e.target.closest('.card');
    if (!b || !view || !b.classList.contains('playable')) return;
    const id = Number(b.dataset.id);
    const card = view.hand.find((c) => c.id === id);
    if (!card) return;
    if ((view.jodi || []).includes(id)) { openJodi(card); return; }
    if (!card.suit) { openPicker(id); return; }
    play(id);
  });
  function play(id, color) {
    const ekah = armed; armed = false;
    ctrl.act({ type: 'play', cardId: id, color: color, ekah: ekah });
  }
  function openPicker(id) {
    pickFor = id;
    $('picker').innerHTML = E.SUITS.map((s) => '<button style="background:' + SUIT_COLOR[s] + '" data-suit="' + s + '">' + SUIT_LABEL[s] + '</button>').join('');
    $('pickerOverlay').classList.remove('hidden');
    $('picker').querySelector('button').focus();
  }
  $('picker').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-suit]');
    if (!b || pickFor === null) return;
    $('pickerOverlay').classList.add('hidden');
    const id = pickFor; pickFor = null;
    play(id, b.dataset.suit);
  });
  $('pickCancel').addEventListener('click', () => { pickFor = null; $('pickerOverlay').classList.add('hidden'); });
  $('deck').addEventListener('click', () => ctrl && ctrl.act({ type: 'draw' }));
  $('passBtn').addEventListener('click', () => ctrl && ctrl.act({ type: 'pass' }));
  $('ekahBtn').addEventListener('click', () => {
    armed = !armed;
    if (armed) { Sound.play('ekah'); toast('EKAH! called. Now play your card'); }
    if (view) renderStatus(view);
  });
  $('opps').addEventListener('click', (e) => {
    const b = e.target.closest('[data-catch]');
    if (b && ctrl) ctrl.act({ type: 'catch', target: Number(b.dataset.catch) });
  });
  $('nextRound').addEventListener('click', () => ctrl && ctrl.act({ type: 'nextRound' }));

  // ---------- Jodi: play both matching cards and use the suit's power ----------
  let jodiFor = null;
  function openJodi(card) {
    const partner = E.partnerOf(view.hand, card);
    if (!partner) { play(card.id); return; }
    jodiFor = card;
    $('jodiTitle').textContent = 'Jodi! ' + SUIT_LABEL[card.suit] + ' ' + card.value + 's';
    $('jodiCards').innerHTML = cardHTML(card) + cardHTML(partner);
    $('jodiPower').innerHTML = '<b>' + SUIT_LABEL[card.suit] + ' power:</b> ' + esc(POWER_TEXT[card.suit]);
    $('jodiStep').innerHTML = '<button class="btn primary" id="jodiGo">Play Jodi</button><button class="btn" id="jodiOne">Play one card</button>';
    $('jodiOverlay').classList.remove('hidden');
    $('jodiGo').focus();
  }
  function closeJodi() { jodiFor = null; $('jodiOverlay').classList.add('hidden'); }
  function sendJodi(power) {
    const card = jodiFor;
    closeJodi();
    if (!card || !ctrl) return;
    const ekah = armed; armed = false;
    ctrl.act({ type: 'play', cardId: card.id, jodi: true, power: power, ekah: ekah });
  }
  function jodiChoices() {
    const card = jodiFor;
    if (!card || !view) return;
    const partner = E.partnerOf(view.hand, card);
    const rest = view.hand.filter((c) => c.id !== card.id && c.id !== partner.id);
    const need = E.powerNeeds(card.suit, rest);
    const left = rest.length - (need === 'number' || need === 'card' ? 1 : 0);
    const ekahLine = left === 1
      ? '<button class="ekahbtn' + (armed ? ' armed' : ' nudge') + '" id="jodiEkah">' + (armed ? 'EKAH! ✓' : 'EKAH!') + '</button><p class="hint">This leaves you with one card. Call EKAH! first.</p>'
      : '';
    if (!need) {
      if (left === 1 && !armed) { $('jodiStep').innerHTML = ekahLine + '<button class="btn primary" id="jodiSend">Play Jodi</button>'; return; }
      sendJodi(undefined);
      return;
    }
    let html = ekahLine;
    if (need === 'player') {
      html += '<p class="hint">Choose whose card you want to see.</p><div class="choose-players">' +
        view.players.map((p, i) => i === view.you ? '' :
          '<button data-target="' + i + '"><span class="avatar" style="--c:' + avatarColor(i) + '">' + esc(p.name.charAt(0).toUpperCase()) + '</span>' + esc(p.name) + '<small>' + p.count + (p.count === 1 ? ' card' : ' cards') + '</small></button>').join('') + '</div>';
    } else {
      const n = view.players.length;
      const next = ((view.you + view.direction) % n + n) % n;
      const pool = sortHand(need === 'number' ? rest.filter((c) => c.type === 'num') : rest);
      html += '<p class="hint">' + (need === 'number' ? 'Choose a number card to discard.' : 'Choose a card to give to ' + esc(view.players[next].name) + '.') + '</p>' +
        '<div class="choose-cards">' + pool.map((c) => cardHTML(c, 'button', 'data-pick="' + c.id + '"')).join('') + '</div>';
    }
    $('jodiStep').innerHTML = html;
  }
  $('jodiStep').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'jodiGo') return jodiChoices();
    if (t.id === 'jodiOne') { const c = jodiFor; closeJodi(); if (c) play(c.id); return; }
    if (t.id === 'jodiEkah') { armed = !armed; if (armed) Sound.play('ekah'); if (view) renderStatus(view); return jodiChoices(); }
    if (t.id === 'jodiSend') return sendJodi(undefined);
    if (t.dataset.target !== undefined) return sendJodi({ target: Number(t.dataset.target) });
    if (t.dataset.pick !== undefined) return sendJodi({ cardId: Number(t.dataset.pick) });
  });
  $('jodiCancel').addEventListener('click', closeJodi);

  // ---------- how to play ----------
  function gcard(c, title, text) {
    return '<div class="gcard">' + cardHTML(c) + '<div><b>' + title + '</b><span>' + text + '</span></div></div>';
  }
  function buildGuide() {
    const pairs = E.SUITS.map((s) => {
      const c = { type: 'num', suit: s, value: 7 };
      return '<div class="gcard"><div class="pair">' + cardHTML(c) + cardHTML(c) + '</div><div><b>' + SUIT_LABEL[s] + ' · ' + SUIT_ELEMENT[s] + '</b><span>' + POWER_TEXT[s] + '</span></div></div>';
    }).join('');
    $('guideBody').innerHTML =
      '<section><h3>The goal</h3><p>Be the first to play all your cards. The round winner scores points for the cards left in everyone else\'s hands. The first player to reach the winning score wins the match.</p></section>' +
      '<section><h3>Your turn</h3><ol>' +
        '<li>Play one card that matches the top card by <b>suit</b> (colour) or <b>number</b>. Glowing cards in your hand can be played.</li>' +
        '<li>Wild cards can go on anything.</li>' +
        '<li>Can\'t play? Tap the deck to draw one card. If it fits, you can play it straight away or keep it.</li>' +
        '<li>Before you play the card that leaves you with one card, tap <b>EKAH!</b></li></ol></section>' +
      '<section><h3>The four suits and their Jodi powers</h3><p>Hold both copies of the same number in the same suit, for example two Agni 7s, and they get a gold <b>JODI</b> tag. Tap one to play the pair together and use that suit\'s power. A Jodi is your whole turn.</p><div class="gcards">' + pairs + '</div></section>' +
      '<section><h3>Action cards</h3><div class="gcards">' +
        gcard({ type: 'maya', suit: 'VAYU' }, 'Maya · Skip', 'The next player misses their turn.') +
        gcard({ type: 'chakra', suit: 'JAL' }, 'Chakra · Reverse', 'Play changes direction. With two players it works like Maya.') +
        gcard({ type: 'rin', suit: 'AGNI' }, 'Rin · Draw two', 'The next player takes 2 cards and misses their turn.') +
      '</div></section>' +
      '<section><h3>Wild cards</h3><div class="gcards">' +
        gcard({ type: 'brahma', suit: null }, 'Brahma · Wild', 'Play it on anything and choose the suit that comes next.') +
        gcard({ type: 'mahakal', suit: null }, 'Mahakal · Wild draw four', 'Play it on anything, choose the suit, and the next player takes 4 cards and misses their turn.') +
      '</div></section>' +
      '<section><h3>Calling EKAH!</h3><p>When you are down to one card, everyone must know. Tap <b>EKAH!</b> before you play. If you forget, any player can tap <b>Catch!</b> on your seat before the next move, and you take 2 cards.</p></section>' +
      '<section><h3>Scoring</h3><table class="gscore"><tr><td>Number cards</td><td>Face value (1 to 9)</td></tr><tr><td>Maya, Chakra, Rin</td><td>15 each</td></tr><tr><td>Brahma, Mahakal</td><td>40 each</td></tr></table>' +
        '<p style="margin-top:8px">Pick the winning score before you start: 100, 200, 250, 300, 500, or your own number from 50 to 1000.</p></section>';
  }
  function openGuide() {
    if (!$('guideBody').innerHTML) buildGuide();
    $('guideOverlay').classList.remove('hidden');
    $('guideClose').focus();
  }
  $('openGuide').addEventListener('click', openGuide);
  $('helpBtn').addEventListener('click', openGuide);
  $('guideClose').addEventListener('click', () => $('guideOverlay').classList.add('hidden'));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    ['guideOverlay', 'peekOverlay', 'jodiOverlay', 'pickerOverlay'].forEach((o) => $(o).classList.add('hidden'));
    jodiFor = null; pickFor = null;
  });

  function goHome(skipLeave) {
    if (ctrl && skipLeave !== true) ctrl.leave();
    if (view) store.set('rc-played', '1');      // the main site's "Protect your account" reminder waits for a game
    clearCelebration();
    ctrl = null; view = null; lastSeq = null; lastTop = null; prevHand = new Set(); armed = false;
    celebrated = null; winnerPi = null; scoresBefore = null;
    show('home');
    showContinue();
  }
  $('resHome').addEventListener('click', () => goHome());
  $('leaveGame').addEventListener('click', () => goHome());
  $('leaveLobby').addEventListener('click', () => goHome());

  // ---------- winning score ----------
  function readTarget(sel, custom) {
    if (sel.value !== 'custom') return Number(sel.value);
    const v = Number(custom.value);
    if (!custom.value || !Number.isFinite(v) || v < E.TARGET_MIN || v > E.TARGET_MAX) return null;
    return Math.round(v / E.TARGET_STEP) * E.TARGET_STEP;
  }
  function targetPicker(sel, custom, initial, onPick, onBad) {
    function apply(v) {
      if ([].some.call(sel.options, (o) => o.value === String(v))) { sel.value = String(v); custom.hidden = true; }
      else { sel.value = 'custom'; custom.hidden = false; custom.value = v; }
    }
    apply(initial);
    sel.addEventListener('change', () => {
      custom.hidden = sel.value !== 'custom';
      if (sel.value === 'custom') { custom.focus(); return; }
      onPick(Number(sel.value));
    });
    custom.addEventListener('change', () => {
      const v = readTarget(sel, custom);
      if (v === null) { onBad(); return; }
      custom.value = v;
      onPick(v);
    });
    return { apply: apply, read: () => readTarget(sel, custom) };
  }
  const savedTarget = E.cleanTarget(store.get('ekahTarget') || E.TARGET);
  const localPick = targetPicker($('localTarget'), $('localCustom'), savedTarget,
    (v) => { $('localErr').textContent = ''; store.set('ekahTarget', String(v)); },
    () => { $('localErr').textContent = 'Enter a winning score from 50 to 1000.'; });
  const lobbyPick = targetPicker($('lobbyTarget'), $('lobbyCustom'), E.TARGET,
    (v) => { $('lobbyErr').textContent = ''; if (ctrl && ctrl.send) ctrl.send({ t: 'target', value: v }); },
    () => { $('lobbyErr').textContent = 'Enter a winning score from 50 to 1000.'; });

  // ---------- vs computer ----------
  /* The game is saved on this phone after every move, so closing the app mid-game loses nothing; the home screen
     then offers "Continue". Same format as the main site's saves (web/src/lib/localSave.ts): { v, at, data }. */
  const SAVE_KEY = 'rc-ekah-save', SAVE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  function readSave() {
    try {
      const s = JSON.parse(store.get(SAVE_KEY) || 'null');
      const g = s && s.data && s.data.game;
      if (!s || s.v !== 1 || !(Date.now() - s.at <= SAVE_MAX_AGE) || !g || !Array.isArray(g.players) || !Array.isArray(g.deck)
        || g.phase === 'matchOver' || g.phase === 'idle') { store.del(SAVE_KEY); return null; }
      return g;
    } catch (e) { return null; }
  }
  function writeSave(g) {
    if (g.phase === 'matchOver') { store.del(SAVE_KEY); return; }
    store.set(SAVE_KEY, JSON.stringify({ v: 1, at: Date.now(), data: { game: g } }));   // g.rnd (a function) is left out
  }
  function showContinue() {
    const g = readSave();
    $('continueLocal').hidden = !g;
    if (g) $('continueInfo').textContent = 'You vs ' + (g.players.length - 1) + ' computer player' + (g.players.length > 2 ? 's' : '') +
      ', first to ' + g.target + ' points. Saved on this phone.';
  }
  function LocalGame(name, bots, target, restored) {
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5).slice(0, bots);
    const g = restored || E.createGame([{ name: name }].concat(names.map((n) => ({ name: n, isBot: true }))), { target: target });
    if (typeof g.rnd !== 'function') g.rnd = Math.random;
    let t1 = null, t2 = null, live = true;
    function push() { if (!live) return; writeSave(g); render(E.viewFor(g, 0)); schedule(); }
    function schedule() {
      clearTimeout(t1); clearTimeout(t2);
      if (g.phase !== 'play') return;
      if (g.turn !== 0) {
        const turn = g.turn, seq = g.seq;
        const a = E.botAction(g, turn);
        /* computer players take 1.8 to 2.8 seconds, a little longer when choosing a suit or using a Jodi */
        const wait = 1800 + Math.random() * 1000 + (a.color || a.jodi ? 500 : 0);
        t1 = setTimeout(() => {
          if (g.turn !== turn || g.seq !== seq || g.phase !== 'play') return;
          const r = E.applyAction(g, turn, a);
          if (!r.ok) E.applyAction(g, turn, E.botAction(g, turn));
          push();
        }, wait);
      }
      if (g.vulnerable !== null) {
        const target = g.vulnerable;
        const chance = target === 0 ? 0.65 : 0.3;
        if (Math.random() < chance) {
          const catchers = g.players.map((p, i) => i).filter((i) => i !== 0 && i !== target);
          if (catchers.length) {
            const by = catchers[Math.floor(Math.random() * catchers.length)];
            t2 = setTimeout(() => {
              if (g.vulnerable === target) { E.applyAction(g, by, { type: 'catch', target: target }); push(); }
            }, 900 + Math.random() * 700);
          }
        }
      }
    }
    return {
      act(a) { const r = E.applyAction(g, 0, a); if (!r.ok) toast(r.error, true); push(); },
      leave() { live = false; clearTimeout(t1); clearTimeout(t2); },
      start: push
    };
  }

  // ---------- online (Royal Club room server) ----------
  const TOKEN_KEY = 'rc-token', ROOM_KEY = 'rc-room-ekah';
  function deviceToken() {
    let t = store.get(TOKEN_KEY);
    if (!t || !/^[A-Za-z0-9_-]{8,64}$/.test(t)) {
      const b = new Uint8Array(18); crypto.getRandomValues(b);
      t = Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 32);
      store.set(TOKEN_KEY, t);
    }
    return t;
  }
  function randomPasscode() { const b = new Uint32Array(1); crypto.getRandomValues(b); return String(b[0] % 10000).padStart(4, '0'); }

  function OnlineGame(first) {
    let ws = null, live = true, tries = 0, timer = 0;
    const api = { online: true, isHost: false, room: null };
    function connect() {
      ws = new WebSocket(serverUrl());
      ws.onopen = () => {
        tries = 0;
        const code = store.get(ROOM_KEY);
        ws.send(JSON.stringify(code ? { t: 'hello', game: 'ekah', code: code, token: deviceToken() } : first));
      };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.t === 'state') {
          api.room = m; api.isHost = m.host;
          store.set(ROOM_KEY, m.code);
          if (m.phase === 'lobby') lobby(m);
          else if (m.view) render(m.view);
        } else if (m.t === 'none') {                  // the saved room is gone
          store.del(ROOM_KEY);
          if (first) ws.send(JSON.stringify(first)); else { live = false; ws.close(); goHome(true); }
        } else if (m.t === 'err') {
          if (!api.room) { if (m.auth) needSignIn(); else $('homeErr').textContent = m.msg; live = false; ws.close(); goHome(true); }
          else if (!$('lobby').classList.contains('hidden')) $('lobbyErr').textContent = m.msg;
          else toast(m.msg, true);
        } else if (m.t === 'left') {
          store.del(ROOM_KEY);
        }
      };
      ws.onclose = () => {
        if (!live) return;
        if (!store.get(ROOM_KEY)) { if (!api.room) { $('homeErr').textContent = 'Could not reach the room server. Try again in a moment.'; goHome(true); } return; }
        tries++;
        if (tries > 8) { toast('Connection lost', true); goHome(true); return; }
        toast('Reconnecting…', true);
        timer = setTimeout(() => live && connect(), Math.min(8000, 700 * Math.pow(2, tries)));
      };
    }
    connect();
    api.act = (a) => api.send({ t: 'act', action: a });
    api.send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
    api.leave = () => {
      live = false; clearTimeout(timer);
      api.send({ t: 'leave' });
      store.del(ROOM_KEY);
      setTimeout(() => { try { ws.close(); } catch (e) {} }, 150);
    };
    return api;
  }

  function lobby(room) {
    show('lobby');
    view = null;
    const host = room.host;
    $('roomCode').textContent = room.code;
    $('roomPass').textContent = room.passcode;
    const seats = room.seats.map((s, i) => ({ s: s, i: i })).filter((x) => x.s);
    $('seats').innerHTML = seats.map((x) =>
      '<li><div class="avatar" style="--c:' + AVATAR_COLORS[x.i % AVATAR_COLORS.length] + '">' + esc(x.s.name.charAt(0).toUpperCase()) + '</div><span>' + esc(x.s.name) + (x.i === room.you ? ' (you)' : '') + '</span><span class="tag">' +
      (x.s.bot ? 'Computer' : (x.i === seatOfHost(room) ? 'Host' : (x.s.connected ? 'Joined' : 'Offline'))) + '</span></li>').join('');
    $('hostTools').classList.toggle('hidden', !host);
    $('startGame').classList.toggle('hidden', !host);
    $('startGame').disabled = seats.length < 2;
    $('removeBot').disabled = !seats.some((x) => x.s.bot);
    $('addBot').disabled = seats.length >= room.seats.length;
    $('waitNote').classList.toggle('hidden', host);
    $('targetHost').classList.toggle('hidden', !host);
    if (host && document.activeElement !== $('lobbyCustom')) lobbyPick.apply(room.target || E.TARGET);
    $('targetNote').innerHTML = host ? '' : 'Winning score: <b>' + (room.target || E.TARGET) + ' points</b>';
  }
  function seatOfHost(room) { return room.host ? room.you : room.seats.findIndex((s) => s && !s.bot); }
  $('addBot').addEventListener('click', () => { $('lobbyErr').textContent = ''; ctrl && ctrl.send({ t: 'addBot' }); });
  $('removeBot').addEventListener('click', () => { $('lobbyErr').textContent = ''; ctrl && ctrl.send({ t: 'removeBot' }); });
  $('startGame').addEventListener('click', () => { $('lobbyErr').textContent = ''; ctrl && ctrl.send({ t: 'start' }); });
  $('copyLink').addEventListener('click', () => {
    const code = $('roomCode').textContent, pass = $('roomPass').textContent;
    const text = 'Join my Royal Club EKAH room: code ' + code + ', passcode ' + pass + ' at ' + location.origin + '/ekah/?room=' + code;
    try { navigator.clipboard.writeText(text).then(() => toast('Invite copied'), () => toast(text)); } catch (e) { toast(text); }
  });

  // ---------- Royal Club account (signed in on the main site; rooms need a username) ----------
  const SB_URL = String(window.RC_SUPABASE_URL || ''), SB_KEY = String(window.RC_SUPABASE_KEY || '');
  const SB_STORE = SB_URL ? 'sb-' + SB_URL.replace(/^https:\/\//, '').split('.')[0] + '-auth-token' : '';
  const SIGNIN_URL = '/?signin=rooms';
  function readSession() {
    try { const s = JSON.parse(store.get(SB_STORE) || 'null'); return s && s.access_token ? s : null; } catch (e) { return null; }
  }
  function roomUser() {
    const s = readSession(), name = store.get('rc-username');
    return s && !(s.user && s.user.is_anonymous) && name && /^[A-Za-z0-9_]{3,16}$/.test(name) ? name : null;
  }
  /** A fresh sign-in token and the username, or null (not signed in, a guest, or no username yet). */
  async function roomAuth() {
    const username = roomUser();
    let s = readSession();
    if (!username || !s) return null;
    if (!s.expires_at || s.expires_at * 1000 < Date.now() + 60000) {
      try {
        const res = await fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: s.refresh_token })
        });
        if (!res.ok) return null;
        const fresh = await res.json();
        if (!fresh.access_token) return null;
        if (!fresh.expires_at && fresh.expires_in) fresh.expires_at = Math.floor(Date.now() / 1000) + fresh.expires_in;
        s = fresh; store.set(SB_STORE, JSON.stringify(fresh));   // the main site keeps using the same session
      } catch (e) { return null; }
    }
    return { token: s.access_token, username: username };
  }
  function showRoomWho() {
    const who = $('roomWho'); if (!who) return;
    const name = roomUser();
    who.innerHTML = name ? 'Playing as <b>' + esc(name) + '</b>'
      : 'Sign in with your Royal Club username to play with friends. <a href="' + SIGNIN_URL + '">Sign in</a>';
  }
  function needSignIn() {
    $('homeErr').textContent = 'Please sign in first (link above).';
    showRoomWho();
  }

  // ---------- home ----------
  function playerName() {
    const n = $('name').value.trim().slice(0, 16) || 'Player';
    store.set('ekahName', n); store.set('rc-player-name', n);
    return n;
  }
  /* Signed-in players start with their Royal Club username; an edit is remembered for that account. */
  function savedName() {
    const user = roomUser();
    if (user) {
      let edit = null;
      try { edit = JSON.parse(store.get('ekahNameFor') || 'null'); } catch (e) {}
      return edit && edit.user === user && edit.name ? edit.name : user;
    }
    return store.get('rc-player-name') || store.get('ekahName') || '';
  }
  function paintAvatar() {
    const n = $('name').value.trim() || 'Player';
    $('meAvatar').textContent = n.charAt(0).toUpperCase();
  }
  $('name').value = savedName();
  paintAvatar();
  $('name').addEventListener('input', paintAvatar);
  $('name').addEventListener('change', () => {
    const user = roomUser(), n = $('name').value.trim().slice(0, 16);
    if (user) store.set('ekahNameFor', JSON.stringify({ user: user, name: n || user }));
    if (!n && user) { $('name').value = user; paintAvatar(); }
  });
  $('editName').addEventListener('click', () => { const i = $('name'); i.focus(); i.select(); });

  // tabs: Vs Computer / With Friends / Online (online play with random players is coming soon)
  const TABS = [['local', 'tabLocal', 'panelLocal'], ['friends', 'tabFriends', 'panelFriends'], ['online', 'tabOnline', 'panelOnline']];
  function pickTab(which) {
    const pick = TABS.some((t) => t[0] === which) ? which : 'local';
    for (const [id, tab, panel] of TABS) {
      const on = id === pick;
      $(tab).setAttribute('aria-selected', String(on)); $(tab).tabIndex = on ? 0 : -1; $(panel).hidden = !on;
    }
    if (pick !== 'online') store.set('ekahTab', pick);
  }
  TABS.forEach(([id, tab]) => {
    $(tab).addEventListener('click', () => pickTab(id));
    $(tab).addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const i = TABS.findIndex((t) => t[0] === id), to = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      pickTab(to[0]); $(to[1]).focus();
    });
  });
  pickTab(new URLSearchParams(location.search).get('room') ? 'friends' : store.get('ekahTab'));

  // tap-to-pick chips for computer players and the winning score (they drive the hidden selects)
  function chipGroup(box, items, current, onPick) {
    box.innerHTML = items.map((it) => '<button type="button" role="radio" data-v="' + it.v + '" aria-checked="' + (String(it.v) === String(current)) + '" aria-label="' + esc(it.label) + '">' + it.html + '</button>').join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      onPick(b.dataset.v);
    });
  }
  const dots = (k) => '<span class="mini-av">' + Array.from({ length: k }, (_, j) => '<span style="--c:' + AVATAR_COLORS[(j + 1) % AVATAR_COLORS.length] + '"></span>').join('') + '</span>';
  chipGroup($('botChips'), [1, 2, 3, 4, 5].map((k) => ({ v: k, label: k + ' computer ' + (k === 1 ? 'player' : 'players'), html: k + dots(Math.min(k, 3)) })),
    store.get('ekahBots') || '3', (v) => { $('bots').value = v; store.set('ekahBots', v); });
  $('bots').value = store.get('ekahBots') || '3';
  const scoreNow = $('localTarget').value;
  chipGroup($('scoreChips'), [100, 200, 250, 300, 500].map((v) => ({ v: v, label: v + ' points', html: String(v) })).concat([{ v: 'custom', label: 'Custom score', html: 'Custom' }]),
    scoreNow, (v) => { $('localTarget').value = v; $('localTarget').dispatchEvent(new Event('change')); });
  $('learnCards').innerHTML = [{ type: 'num', suit: 'JAL', value: 7 }, { type: 'maya', suit: 'VAYU' }, { type: 'mahakal', suit: null }].map((c) => cardHTML(c)).join('');
  $('homeFan').innerHTML = [{ type: 'num', suit: 'AGNI', value: 7 }, { type: 'maya', suit: 'JAL' }, { type: 'num', suit: 'PRITHVI', value: 9 }, { type: 'mahakal', suit: null }].map((c) => cardHTML(c)).join('');
  $('playLocal').addEventListener('click', () => {
    const target = localPick.read();
    if (target === null) { $('localErr').textContent = 'Enter a winning score from 50 to 1000.'; return; }
    $('localErr').textContent = '';
    store.set('ekahTarget', String(target));
    ctrl = LocalGame(playerName(), Number($('bots').value), target);
    ctrl.start();
  });
  $('continueBtn').addEventListener('click', () => {
    const g = readSave();
    if (!g) { showContinue(); return; }
    ctrl = LocalGame(null, 0, 0, g);
    ctrl.start();
  });
  showContinue();
  if (OFFLINE_ONLY) {
    $('onlinePanel').hidden = true;
    $('offlineNote').hidden = false;
  } else {
    showRoomWho();
    window.addEventListener('storage', showRoomWho);
    $('createRoom').addEventListener('click', async () => {
      $('homeErr').textContent = '';
      const me = await roomAuth();
      if (!me) { needSignIn(); return; }
      ctrl = OnlineGame({ t: 'create', game: 'ekah', token: deviceToken(), name: me.username, passcode: randomPasscode(), auth: me.token });
    });
    const joinNow = async () => {
      const code = $('joinCode').value.trim().toUpperCase(), pass = $('joinPass').value.trim();
      if (!/^[A-Z]{4}$/.test(code)) { $('homeErr').textContent = 'Enter the 4-letter room code.'; return; }
      if (!/^\d{4}$/.test(pass)) { $('homeErr').textContent = 'Enter the 4-digit passcode.'; return; }
      $('homeErr').textContent = '';
      const me = await roomAuth();
      if (!me) { needSignIn(); return; }
      store.del(ROOM_KEY);
      ctrl = OnlineGame({ t: 'join', game: 'ekah', code: code, passcode: pass, token: deviceToken(), name: me.username, auth: me.token });
    };
    $('joinRoom').addEventListener('click', joinNow);
    $('joinPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinNow(); });
    const q = new URLSearchParams(location.search).get('room');
    if (q) $('joinCode').value = q.toUpperCase().slice(0, 4);
    if (store.get(ROOM_KEY)) ctrl = OnlineGame(null);   // a refresh or dropped connection resumes the same seat
  }
})();
