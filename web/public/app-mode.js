/* Royal Club inside the Android app (Capacitor): make the pages feel like an app, not a website.
   Loaded by every page; does nothing in a normal browser.
   - html.rc-app class for app-only styles (no website footer or top-bar links, no text selection or long-press
     menus, no tap flash, no overscroll bounce)
   - navigator.vibrate goes through the Haptics plugin, so the games' existing buzzes work on Android phones */
/* Finished games, for coins and XP: every game calls rcReport(game, result, info) once when a game ends
   (result: "win", "lose", "draw" or "done" for pass & play). The app's Rewards (src/economy) collects the list
   when the home screen opens. Kept on this device in localStorage rc-game-events, newest 50.
   Stats: a finished practice game (against the computer, or a solo puzzle) also goes to the player's account as
   running totals (Supabase record_my_practice) when they're signed in. Room games pass info.online and are
   left to the room server, which records them itself. info: { online, place, players, score, timeMs }. */
window.rcReport = function (game, result, info) {
  try {
    var k = 'rc-game-events', list = JSON.parse(window.localStorage.getItem(k) || '[]');
    if (!Array.isArray(list)) list = [];
    list.push({ g: String(game), r: String(result), at: Date.now() });
    window.localStorage.setItem(k, JSON.stringify(list.slice(-50)));
  } catch (e) { /* storage off */ }
  window.rcPractice(game, result, info);
};
/* Practice stats (same rules as src/lib/report.ts for the React games). Never throws; quietly skips when signed out. */
window.rcPractice = function (game, result, info) {
  info = info || {};
  var outcome = { win: 'win', daily: 'win', lose: 'loss', draw: 'draw' }[result];
  var url = String(window.RC_SUPABASE_URL || ''), key = String(window.RC_SUPABASE_KEY || '');
  if (!outcome || info.online || !url || !key || !/^[a-z][a-z0-9]{1,19}$/.test(String(game))) return;
  var store = 'sb-' + url.replace(/^https:\/\//, '').split('.')[0] + '-auth-token';
  var num = function (v) { return typeof v === 'number' && isFinite(v) ? Math.round(v) : null; };
  var body = JSON.stringify({ p_game: String(game), p_outcome: outcome,
    p_place: (info.players || 0) >= 3 ? num(info.place) : null, p_score: num(info.score), p_time_ms: outcome === 'win' ? num(info.timeMs) : null });
  function session() { try { var x = JSON.parse(window.localStorage.getItem(store) || 'null'); return x && x.access_token && !(x.user && x.user.is_anonymous) ? x : null; } catch (e) { return null; } }
  function fresh() {
    var x = session();
    if (!x) return Promise.resolve(null);
    if (x.expires_at && x.expires_at * 1000 > Date.now() + 60000) return Promise.resolve(x.access_token);
    return fetch(url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: x.refresh_token }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (n) {
        if (!n || !n.access_token) return null;
        if (!n.expires_at && n.expires_in) n.expires_at = Math.floor(Date.now() / 1000) + n.expires_in;
        try { window.localStorage.setItem(store, JSON.stringify(n)); } catch (e) { /* storage off */ }
        return n.access_token;
      });
  }
  function send(tries) {
    fresh().then(function (tok) {
      if (!tok) return;
      return fetch(url + '/rest/v1/rpc/record_my_practice', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: body })
        .then(function (r) { if (r.status >= 500 && tries > 0) setTimeout(function () { send(tries - 1); }, 4000); });
    }).catch(function () { if (tries > 0) setTimeout(function () { send(tries - 1); }, 4000); });
  }
  send(1);
};
(function () {
  var C = window.Capacitor;
  if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return;
  var root = document.documentElement;
  root.classList.add('rc-app');
  if (!document.getElementById('ambaro-native-skin')) {
    var nativeSkin = document.createElement('link');
    nativeSkin.id = 'ambaro-native-skin';
    nativeSkin.rel = 'stylesheet';
    nativeSkin.href = '/app-native.css';
    document.head.appendChild(nativeSkin);
  }

  var css = [
    'html.rc-app{-webkit-tap-highlight-color:transparent;overscroll-behavior:none}',
    'html.rc-app body{overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
    'html.rc-app input,html.rc-app textarea,html.rc-app select,html.rc-app [contenteditable]{-webkit-user-select:text;user-select:text}',
    'html.rc-app img{-webkit-user-drag:none}',
    /* website-only parts of the main site */
    'html.rc-app .app-shell>footer{display:none!important}',
    'html.rc-app .topbar nav{display:none!important}'
  ].join('\n');
  var style = document.createElement('style');
  style.id = 'rc-app-style';
  style.textContent = css;
  (document.head || root).appendChild(style);

  var H = C.Plugins && C.Plugins.Haptics;
  if (H && typeof H.vibrate === 'function') {
    var vibrate = function (p) {
      var ms = 0;
      if (Array.isArray(p)) { for (var i = 0; i < p.length; i += 2) ms += Number(p[i]) || 0; }   // on-times only
      else ms = Number(p) || 0;
      var off = false;
      try { off = window.localStorage.getItem('rc-vibrate') === 'off'; } catch (e) { /* storage off */ }   // Settings › Vibration
      if (ms > 0 && !off) { try { H.vibrate({ duration: Math.min(ms, 1000) }); } catch (e) { /* no vibrator */ } }
      return true;
    };
    try { Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true }); } catch (e) { /* read-only: keep the WebView's own */ }
  }

  /* App skin (app-skin.css + app-skin.js): the app lobby look for EKAH, Chess, Sudoku and Word Puzzle. */
  if (/^\/(ekah|chess|sudoku|words)\/(index\.html)?$/.test(location.pathname)) {
    var skinCss = document.createElement('link');
    skinCss.rel = 'stylesheet';
    skinCss.href = '/app-skin.css';
    document.head.appendChild(skinCss);
    var skinJs = document.createElement('script');
    skinJs.src = '/app-skin.js';
    document.head.appendChild(skinJs);
  }

  var A = C.Plugins && C.Plugins.App;
  var goBack = function () { if (window.history.length > 1) window.history.back(); else window.location.href = '/'; };

  /* Full screen during games: while a game board is on screen the status bar (time, network, battery) is hidden;
     a swipe down from the top shows it for a moment. Menus and lobbies keep it, on the dark bar behind it
     (capacitor.config.ts). Game boards: Ludo .ld-screen, Snakes .sl-screen, Spades .game-screen, and the
     #game screen of EKAH, Chess and Sudoku. */
  var SB = C.Plugins && C.Plugins.SystemBars;
  var GAME_SEL = '.ld-screen, .sl-screen, .game-screen, #game:not(.hidden):not([hidden])';
  var inGame = function () { var el = document.querySelector(GAME_SEL); return !!el && el.getClientRects().length > 0; };
  var full = null, queued = false;
  var syncBars = function (force) {
    var want = inGame();
    if (!SB || (!force && want === full)) return;
    full = want;
    try { var p = want ? SB.hide({ bar: 'StatusBar' }) : SB.show({ bar: 'StatusBar' }); if (p && p.catch) p.catch(function () {}); } catch (e) { /* older app */ }
  };
  var queueSync = function () {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () { queued = false; syncBars(false); });
  };
  document.addEventListener('DOMContentLoaded', function () {
    syncBars(true);
    new MutationObserver(queueSync).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  });
  if (A) A.addListener('resume', function () { syncBars(true); });   // Android can bring the bar back after the app was away

  /* rcConfirm({title, text, stay, leave}) → Promise<boolean>: the same ivory "Leave this game?" dialog as the main
     app (big gold STAY, smaller red leave button) for EKAH, Chess and Sudoku. true = leave. */
  var openDialog = null;
  window.rcConfirm = function (o) {
    o = o || {};
    return new Promise(function (resolve) {
      if (openDialog) openDialog(false);
      var scrim = document.createElement('div');
      scrim.setAttribute('role', 'presentation');
      scrim.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(5,12,9,.74);font-family:"Baloo 2",system-ui,sans-serif';
      scrim.innerHTML =
        '<div role="alertdialog" aria-modal="true" aria-labelledby="rc-dlg-t" aria-describedby="rc-dlg-p" style="position:relative;width:min(100%,350px);margin-top:28px;padding:44px 20px 20px;border-radius:28px;text-align:center;color:#3A1F0A;background:linear-gradient(180deg,#FFFBF2,#F6E9CF);border:4px solid #E9C46A;box-shadow:0 10px 0 #6E4E12,0 30px 60px rgba(0,0,0,.6)">' +
          '<span aria-hidden="true" style="position:absolute;left:50%;top:-34px;transform:translateX(-50%);display:flex;width:64px;height:64px;border-radius:32px;align-items:center;justify-content:center;color:#fff;background:radial-gradient(circle at 35% 30%,#FF8A7A,#B3261E 60%,#6E120D);border:4px solid #FFFBF2;box-shadow:0 6px 0 #6E120D"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/></svg></span>' +
          '<h2 id="rc-dlg-t" style="margin:0;font:700 25px/1.2 Cinzel,Georgia,serif;color:#5A1A0E"></h2>' +
          '<p id="rc-dlg-p" style="margin:8px 0 0;font-size:16px;font-weight:600;line-height:1.38;color:#5B4632"></p>' +
          '<div style="display:flex;flex-direction:column;gap:12px;margin-top:18px">' +
            '<button type="button" data-v="0" style="height:58px;border:0;border-radius:24px;font:800 21px/1 &quot;Baloo 2&quot;,system-ui,sans-serif;letter-spacing:.06em;color:#2A1605;background:linear-gradient(180deg,#FFE29A,#F5C542 55%,#D9A72C);box-shadow:0 5px 0 #B8862B,inset 0 3px 0 rgba(255,255,255,.3)"></button>' +
            '<button type="button" data-v="1" style="height:48px;border:0;border-radius:20px;font:800 17px/1 &quot;Baloo 2&quot;,system-ui,sans-serif;color:#fff;background:linear-gradient(180deg,#E25A4C,#C0392B 60%,#A12A1E);box-shadow:0 5px 0 #7A1A10,inset 0 3px 0 rgba(255,255,255,.25)"></button>' +
          '</div></div>';
      scrim.querySelector('h2').textContent = o.title || 'Leave this game?';
      scrim.querySelector('p').textContent = o.text || '';
      var stay = scrim.querySelector('[data-v="0"]'), leave = scrim.querySelector('[data-v="1"]');
      stay.textContent = o.stay || 'STAY & PLAY';
      leave.textContent = o.leave || 'Leave game';
      var done = function (v) {
        if (openDialog !== done) return;
        openDialog = null;
        scrim.remove();
        resolve(v);
      };
      openDialog = done;
      stay.addEventListener('click', function () { done(false); });
      leave.addEventListener('click', function () { done(true); });
      scrim.addEventListener('click', function (e) { if (e.target === scrim) done(false); });
      document.body.appendChild(scrim);
      stay.focus();
    });
  };

  /* The Android back button.
     - Simple pages (Privacy, Terms, account deletion) mark <body data-app-back="page">: back a page, or home.
     - EKAH, Chess and Sudoku (pages with a #game screen): an open dialog closes first; a page may handle back itself
       with window.rcAppBack() (return true when handled); during a game it asks "Leave this game?" and then calls
       window.rcLeaveGame() if the page has one, otherwise goes back. Elsewhere it goes back a page or home.
     - The main app (Home, Ludo, Snakes, Spades) handles the back button in React (src/lib/native.ts). */
  document.addEventListener('DOMContentLoaded', function () {
    if (!A || !document.body) return;
    if (document.body.getAttribute('data-app-back') === 'page') { A.addListener('backButton', goBack); return; }
    if (!document.getElementById('game')) return;
    A.addListener('backButton', function () {
      if (openDialog) { openDialog(false); return; }
      if (typeof window.rcAppBack === 'function' && window.rcAppBack()) return;
      if (inGame()) {
        window.rcConfirm({ title: 'Leave this game?', text: 'Games against the computer are saved, so you can continue later.' }).then(function (ok) {
          if (!ok) return;
          if (typeof window.rcLeaveGame === 'function') window.rcLeaveGame(); else goBack();
        });
        return;
      }
      goBack();
    });
  });

  /* Crash reports (Firebase Crashlytics): only in app builds made with a Firebase project (the workflow adds the
     plugin when the GOOGLE_SERVICES_JSON secret exists). App crashes are caught natively; this also sends
     JavaScript errors from the games, with the page and line, so we can fix them. No names, coins or game data
     are sent. At most 20 reports per page load. */
  var FC = C.Plugins && C.Plugins.FirebaseCrashlytics;
  if (FC && typeof C.isPluginAvailable === 'function' && C.isPluginAvailable('FirebaseCrashlytics')) {
    var sent = 0;
    var report = function (msg) {
      if (sent++ >= 20) return;
      try { FC.recordException({ message: String(msg).slice(0, 1000) }).catch(function () {}); } catch (e) { /* plugin off */ }
    };
    window.addEventListener('error', function (e) {
      var where = (e.filename || location.pathname).replace(location.origin, '') + ':' + (e.lineno || 0);
      report((e.message || 'Error') + ' @ ' + where);
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e.reason;
      report('Unhandled: ' + (r && r.message ? r.message : String(r)) + ' @ ' + location.pathname);
    });
  }
})();
