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

  // ---------- screens & toasts ----------
  function show(id) {
    ['home', 'lobby', 'game'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
    if (id !== 'game') { $('resultOverlay').classList.add('hidden'); $('pickerOverlay').classList.add('hidden'); }
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

  function nm(i, cap) {
    if (!view) return '';
    if (i === view.you) return cap === false ? 'you' : 'You';
    return view.players[i].name;
  }
  function sortHand(h) {
    const so = { AGNI: 0, JAL: 1, PRITHVI: 2, VAYU: 3 }, to = { num: 0, maya: 1, chakra: 2, rin: 3, brahma: 4, mahakal: 5 };
    return h.slice().sort((a, b) => (a.suit ? so[a.suit] : 9) - (b.suit ? so[b.suit] : 9) || to[a.type] - to[b.type] || (a.value || 0) - (b.value || 0));
  }

  function eventText(ev) {
    switch (ev.type) {
      case 'skip': return [ev.pi === view.you ? 'You are skipped' : nm(ev.pi) + ' is skipped', ev.pi === view.you];
      case 'reverse': return ['Chakra! Direction reversed'];
      case 'draws': return [nm(ev.pi) + (ev.pi === view.you ? ' draw ' : ' draws ') + ev.n, ev.pi === view.you];
      case 'ekah': return [nm(ev.pi) + (ev.pi === view.you ? ' called' : ' calls') + ' EKAH!'];
      case 'caught': return [ev.pi === view.you ? nm(ev.by) + ' caught you! Draw 2' : nm(ev.by) + ' caught ' + nm(ev.pi, false) + '! +2 cards', ev.pi === view.you];
      case 'reshuffle': return ['Pile shuffled back into the deck'];
      case 'round': return ['Round ' + ev.round];
      default: return null;
    }
  }

  function render(v) {
    const first = !view;
    view = v;
    show('game');
    const n = v.players.length;
    $('meta').textContent = 'Round ' + v.round + ' · first to ' + v.target;

    // opponents
    let html = '';
    for (let k = 1; k < n; k++) {
      const i = (v.you + k) % n, p = v.players[i];
      const active = v.phase === 'play' && v.turn === i;
      let minis = '';
      for (let j = 0; j < Math.min(p.count, 7); j++) minis += backHTML();
      html += '<div class="opp' + (active ? ' active' : '') + (p.away ? ' away' : '') + '">' +
        (p.count === 1 && v.phase === 'play' ? '<span class="badge">EKAH</span>' : '') +
        '<div class="avatar" style="--c:' + AVATAR_COLORS[i % AVATAR_COLORS.length] + '">' + esc(p.name.charAt(0).toUpperCase()) + '</div>' +
        '<div class="name">' + esc(p.name) + (p.away ? ' (away)' : '') + '</div>' +
        '<div class="mini">' + minis + '</div>' +
        '<div class="count">' + p.count + (p.count === 1 ? ' card' : ' cards') + ' · ' + p.score + ' pts</div>' +
        (v.vulnerable === i && v.phase === 'play' ? '<button class="catch" data-catch="' + i + '">Catch!</button>' : '') +
        '</div>';
    }
    $('opps').innerHTML = html;

    // centre
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
    const lastPlay = v.events.slice().reverse().find((e) => e.type === 'play');
    $('lastMove').textContent = lastPlay && v.phase === 'play' ? nm(lastPlay.pi) + ' played ' + E.cardName(lastPlay.card) + (lastPlay.card.suit ? '' : ' · ' + SUIT_LABEL[lastPlay.color]) : '';

    // status & buttons
    const msg = $('statusMsg');
    msg.classList.toggle('turn', myTurn);
    if (v.phase !== 'play') msg.textContent = '';
    else if (myTurn && v.pendingDrawn !== null) msg.textContent = 'It fits! Play it or keep it';
    else if (myTurn) msg.textContent = v.legal.length ? 'Your turn' : 'No match: tap the deck to draw';
    else msg.textContent = nm(v.turn) + ' is playing…';
    const needEkah = myTurn && v.hand.length === 2;
    if (!needEkah) armed = false;
    $('ekahBtn').classList.toggle('hidden', !needEkah);
    $('ekahBtn').classList.toggle('armed', armed);
    $('ekahBtn').classList.toggle('nudge', needEkah && !armed);
    $('ekahBtn').textContent = armed ? 'EKAH! ✓' : 'EKAH!';
    $('passBtn').classList.toggle('hidden', !(myTurn && v.pendingDrawn !== null));

    // hand
    const hand = sortHand(v.hand);
    const legal = new Set(v.legal);
    const nowIds = new Set(hand.map((c) => c.id));
    $('hand').innerHTML = hand.map((c) => {
      const ok = legal.has(c.id);
      const cls = (ok ? ' playable' : (myTurn ? ' dim' : '')) + (!first && !prevHand.has(c.id) ? ' new' : '');
      return cardHTML(c, 'button', 'data-id="' + c.id + '"' + (ok ? '' : ' tabindex="-1"')).replace('class="card', 'class="card' + cls);
    }).join('');
    prevHand = nowIds;
    fitHand();

    // events → toasts
    if (lastSeq === null || first) lastSeq = v.seq;
    for (const ev of v.events) {
      if (ev.seq <= lastSeq) continue;
      const t = eventText(ev);
      if (t) toast(t[0], t[1]);
    }
    lastSeq = v.seq;

    // results
    if (v.phase === 'roundOver' || v.phase === 'matchOver') showResults(v);
    else $('resultOverlay').classList.add('hidden');
    if (v.phase !== 'play') $('pickerOverlay').classList.add('hidden');
  }

  function fitHand() {
    const h = $('hand');
    const cards = h.children;
    if (!cards.length) return;
    const cw = cards[0].offsetWidth;
    const avail = h.clientWidth - 16;
    const k = cards.length;
    let ov = k > 1 ? (avail - k * cw) / (k - 1) : 0;
    ov = Math.max(-cw * 0.68, Math.min(-6, ov));
    h.style.setProperty('--ov', ov + 'px');
  }
  window.addEventListener('resize', fitHand);

  function showResults(v) {
    const w = v.winner, match = v.phase === 'matchOver';
    $('resTitle').textContent = (w === v.you ? 'You win' : v.players[w].name + ' wins') + (match ? ' the match!' : ' the round!');
    $('resSub').textContent = '+' + v.roundPoints + ' points from the cards left in other hands' + (match ? '' : ' · first to ' + v.target + ' wins');
    const rows = v.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.score - a.p.score);
    $('resScores').innerHTML = '<tr><td><b>Player</b></td><td class="n">Cards left</td><td class="n">Score</td></tr>' +
      rows.map((r) => '<tr class="' + (r.i === w ? 'win' : '') + '"><td>' + esc(r.i === v.you ? r.p.name + ' (you)' : r.p.name) + '</td><td class="n">' + r.p.count + '</td><td class="n">' + r.p.score + '</td></tr>').join('');
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
    if (armed) toast('EKAH! called. Now play your card');
    if (view) render(view);
  });
  $('opps').addEventListener('click', (e) => {
    const b = e.target.closest('[data-catch]');
    if (b && ctrl) ctrl.act({ type: 'catch', target: Number(b.dataset.catch) });
  });
  $('nextRound').addEventListener('click', () => ctrl && ctrl.act({ type: 'nextRound' }));
  function goHome(skipLeave) {
    if (ctrl && skipLeave !== true) ctrl.leave();
    ctrl = null; view = null; lastSeq = null; lastTop = null; prevHand = new Set(); armed = false;
    show('home');
  }
  $('resHome').addEventListener('click', () => goHome());
  $('leaveGame').addEventListener('click', () => goHome());
  $('leaveLobby').addEventListener('click', () => goHome());

  // ---------- vs computer ----------
  function LocalGame(name, bots) {
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5).slice(0, bots);
    const g = E.createGame([{ name: name }].concat(names.map((n) => ({ name: n, isBot: true }))));
    let t1 = null, t2 = null, live = true;
    function push() { if (!live) return; render(E.viewFor(g, 0)); schedule(); }
    function schedule() {
      clearTimeout(t1); clearTimeout(t2);
      if (g.phase !== 'play') return;
      if (g.turn !== 0) {
        const turn = g.turn, seq = g.seq;
        t1 = setTimeout(() => {
          if (g.turn !== turn || g.seq !== seq || g.phase !== 'play') return;
          E.applyAction(g, turn, E.botAction(g, turn));
          push();
        }, 950 + Math.random() * 450);
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
            }, 650 + Math.random() * 500);
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
  $('name').value = store.get('rc-player-name') || store.get('ekahName') || '';
  $('homeFan').innerHTML = [{ type: 'num', suit: 'AGNI', value: 7 }, { type: 'maya', suit: 'JAL' }, { type: 'num', suit: 'PRITHVI', value: 9 }, { type: 'mahakal', suit: null }].map((c) => cardHTML(c)).join('');
  $('playLocal').addEventListener('click', () => {
    ctrl = LocalGame(playerName(), Number($('bots').value));
    ctrl.start();
  });
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
