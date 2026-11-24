/* Royal Club rooms for the plain-HTML games (Chess): the room server address, this device's seat token, the signed-in
   Ambaro account (rooms need a username) and a connection that reconnects to the same seat after a drop.
   Same rules as EKAH's client.js and the React games (src/domain/online.ts). Needs /ekah/config.js loaded first. */
(function () {
  'use strict';
  if (window.RCRoom) return;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage off */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage off */ } },
  };
  function serverUrl() {
    const host = location.hostname;
    const testing = host === 'localhost' || host === '127.0.0.1' || host.startsWith('deploy-preview-') || host.includes('--') || host.startsWith('test.');
    let q = testing ? new URLSearchParams(location.search).get('server') : null;
    try {
      if (testing) { if (q === 'off') { sessionStorage.removeItem('rc-server'); q = null; } else if (q) sessionStorage.setItem('rc-server', q); else q = sessionStorage.getItem('rc-server'); }
    } catch (e) { /* storage off */ }
    const url = String(q || window.RC_ROOM_SERVER_URL || '').trim();
    return /^wss?:\/\//.test(url) ? url : '';
  }
  function deviceToken() {
    let t = store.get('rc-token');
    if (!t || !/^[A-Za-z0-9_-]{8,64}$/.test(t)) {
      const b = new Uint8Array(18); crypto.getRandomValues(b);
      t = Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 32);
      store.set('rc-token', t);
    }
    return t;
  }
  function randomPasscode() { const b = new Uint32Array(1); crypto.getRandomValues(b); return String(b[0] % 10000).padStart(4, '0'); }
  const SB_URL = String(window.RC_SUPABASE_URL || ''), SB_KEY = String(window.RC_SUPABASE_KEY || '');
  const SB_STORE = SB_URL ? 'sb-' + SB_URL.replace(/^https:\/\//, '').split('.')[0] + '-auth-token' : '';
  function readSession() { try { const s = JSON.parse(store.get(SB_STORE) || 'null'); return s && s.access_token ? s : null; } catch (e) { return null; } }
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
          method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }),
        });
        if (!res.ok) return null;
        const fresh = await res.json();
        if (!fresh.access_token) return null;
        if (!fresh.expires_at && fresh.expires_in) fresh.expires_at = Math.floor(Date.now() / 1000) + fresh.expires_in;
        s = fresh; store.set(SB_STORE, JSON.stringify(fresh));
      } catch (e) { return null; }
    }
    return { token: s.access_token, username };
  }
  /** Invite links point at the public site (inside the app the page is https://localhost). */
  function siteUrl() {
    const set = String(window.RC_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
    if (set) return set;
    const isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    return isApp || /\/\/localhost(:\d+)?$/.test(location.origin) || !/^https?:/.test(location.origin) ? 'https://test.royalclubgames.com' : location.origin;
  }
  /**
   * connect({ game, roomKey, first, onState, onError, onGone, onStatus })
   * first: the create/join message, or null to rejoin the saved room. Returns { send, leave, close }.
   * A dropped connection reconnects to the same seat (up to 8 tries, backing off).
   */
  function connect(o) {
    let ws = null, live = true, tries = 0, timer = 0, joined = false;
    const api = {};
    function open() {
      const url = serverUrl();
      if (!url) { o.onError && o.onError('Online rooms are not switched on for this version yet.', true); return; }
      o.onStatus && o.onStatus(tries ? 'reconnecting' : 'connecting');
      ws = new WebSocket(url);
      ws.onopen = () => {
        tries = 0;
        const code = store.get(o.roomKey);
        ws.send(JSON.stringify(code ? { t: 'hello', game: o.game, code, token: deviceToken() } : o.first));
      };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m && m.t === 'ping') { ws.send('{"t":"pong"}'); return; }
        if (m.t === 'state') {
          if (m.game !== o.game) return;
          joined = true; store.set(o.roomKey, m.code); o.onStatus && o.onStatus('online'); o.onState(m);
        } else if (m.t === 'none') {
          store.del(o.roomKey);
          if (o.first && !joined) ws.send(JSON.stringify(o.first)); else { live = false; ws.close(); o.onGone && o.onGone(); }
        } else if (m.t === 'err') {
          if (!joined) { live = false; ws.close(); }
          o.onError && o.onError(m.msg, !joined, !!m.auth);
        } else if (m.t === 'left') { store.del(o.roomKey); }
      };
      ws.onclose = () => {
        if (!live) return;
        if (!store.get(o.roomKey)) { if (!joined) o.onError && o.onError('Could not reach the room server. Try again in a moment.', true); return; }
        tries++;
        if (tries > 8) { o.onError && o.onError('Connection lost', true); o.onGone && o.onGone(); return; }
        o.onStatus && o.onStatus('reconnecting');
        timer = setTimeout(() => live && open(), Math.min(8000, 700 * Math.pow(2, tries)));
      };
    }
    api.send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
    api.leave = () => {
      live = false; clearTimeout(timer);
      api.send({ t: 'leave' }); store.del(o.roomKey);
      setTimeout(() => { try { ws.close(); } catch (e) { /* closed */ } }, 150);
    };
    api.close = () => { live = false; clearTimeout(timer); try { ws.close(); } catch (e) { /* closed */ } };
    open();
    return api;
  }
  window.RCRoom = { serverUrl, deviceToken, randomPasscode, roomUser, roomAuth, siteUrl, connect, saved: (k) => store.get(k), SIGNIN_URL: '/?signin=rooms' };
})();
