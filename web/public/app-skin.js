/* App skin for the plain-HTML games (EKAH, Chess, Sudoku, Word Puzzle), Android app only.
   Loaded by app-mode.js together with app-skin.css; the website never loads it.
   It gives each game's start screen the same look as the app lobby of Ludo and Snakes (src/app/AppLobby.tsx):
   - the chosen app background colour (Settings › Look, localStorage rc-app-bg) as CSS variables;
   - an artwork header (web/public/art/<game>.svg, the same art as the app home) with a round back button,
     a rules / learn button, the game's name and a players line;
   - icons and a short line on the mode buttons, so they read like the lobby's mode cards.
   Every control the page already has stays where its own script expects it; this only adds and restyles. */
(function () {
  'use strict';
  var html = document.documentElement;
  var BGS = {
    'bg-emerald': ['#072A20', '#0B3B2D', '#1B6B50'], 'bg-ruby': ['#2A0710', '#4A0E1C', '#7A1A2E'],
    'bg-indigo': ['#0B1030', '#18205A', '#2C3A8C'], 'bg-purple': ['#1C0A2E', '#33124F', '#5A2A86'], 'bg-peacock': ['#04222A', '#0A3F4C', '#157A8C']
  };
  var bg = BGS['bg-emerald'];
  try { bg = BGS[window.localStorage.getItem('rc-app-bg')] || bg; } catch (e) { /* storage off */ }
  html.style.setProperty('--rx-dark', bg[0]);
  html.style.setProperty('--rx-mid', bg[1]);
  html.style.setProperty('--rx-light', bg[2]);

  var ICON = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    learn: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M7 9v5c0 1.5 2.2 3 5 3s5-1.5 5-3V9"/><path d="M21 7v6"/>',
    bot: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4"/><circle cx="9" cy="13" r="1.3" fill="currentColor"/><circle cx="15" cy="13" r="1.3" fill="currentColor"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    friends: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.3.2 4 1.8 4.5 4.5"/>'
  };
  var svg = function (k, s) { return '<svg width="' + (s || 24) + '" height="' + (s || 24) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + '</svg>'; };

  /* Per game: where the start screen is, what the header says, which existing controls the round buttons use,
     and the mode buttons to decorate ([selector, icon, short line]). */
  var GAMES = {
    ekah: { screen: '#home', title: 'EKAH', meta: '2–6 players · about 15 min', back: '#home .club-back', info: ['#openGuide', 'help', 'How to play'],
      modes: [['#tabLocal', 'bot', 'Play anytime · works offline'], ['#tabFriends', 'friends', 'Create a room or join with a code'], ['#tabOnline', 'friends', 'Coming soon']] },
    chess: { screen: '#setup', title: 'Chess', meta: '2 players · three computer levels', back: '#clubLink', info: ['#learnLink', 'learn', 'Learn Chess'],
      modes: [['[data-mode="ai"]', 'bot', ''], ['[data-mode="local"]', 'phone', ''], ['[data-mode="multiplayer"]', 'friends', '']] },
    sudoku: { screen: '#setup', title: 'Sudoku', meta: 'A new daily puzzle · 4 levels', back: '#clubLink', info: ['#learnLink', 'learn', 'Learn Sudoku'], modes: [] },
    words: { frame: true, back: '#backBtn' }
  };
  var id = (location.pathname.match(/^\/(ekah|chess|sudoku|words)\/(?:index\.html)?$/) || [])[1];
  var cfg = id && GAMES[id];
  if (!cfg) return;
  html.classList.add('rc-skin', 'rc-skin-' + id);

  var go = function (sel) {
    var el = document.querySelector(sel);
    if (!el) { window.location.href = '/'; return; }
    if (el.tagName === 'A' && el.getAttribute('href')) window.location.href = el.getAttribute('href'); else el.click();
  };

  var build = function () {
    if (cfg.frame) return;                              // Word Puzzle: one screen, restyled by app-skin.css only
    var screen = document.querySelector(cfg.screen);
    if (!screen || screen.querySelector('.as-hero')) return;
    var hero = document.createElement('header');
    hero.className = 'as-hero';
    hero.innerHTML =
      '<img class="as-art" src="/art/' + id + '.svg" alt="" decoding="async">' +
      '<span class="as-shade" aria-hidden="true"></span>' +
      '<span class="as-top">' +
        '<button type="button" class="as-round" data-as="back" aria-label="Back to Royal Club">' + svg('back') + '</button>' +
        '<button type="button" class="as-round" data-as="info" aria-label="' + cfg.info[2] + '">' + svg(cfg.info[1], 22) + '</button>' +
      '</span>' +
      '<span class="as-title"><span class="as-name"></span><span class="as-meta"></span></span>';
    hero.querySelector('.as-name').textContent = cfg.title;
    hero.querySelector('.as-meta').textContent = cfg.meta;
    hero.querySelector('[data-as="back"]').addEventListener('click', function () { go(cfg.back); });
    hero.querySelector('[data-as="info"]').addEventListener('click', function () { go(cfg.info[0]); });
    screen.insertBefore(hero, screen.firstChild);

    /* Mode buttons become lobby cards: icon | name over a short line | tick. The button's own contents move into
       the text column (EKAH: plain text; Chess: <b> name and <span> line, its own .ico is hidden by the CSS). */
    cfg.modes.forEach(function (m) {
      var b = screen.querySelector(m[0]);
      if (!b || b.querySelector('.as-ico')) return;
      b.classList.add('as-mode');
      var txt = document.createElement('span');
      txt.className = 'as-txt';
      Array.prototype.slice.call(b.childNodes).forEach(function (n) {
        if (n.nodeType === 1 && n.classList.contains('ico')) return;
        if (n.nodeType === 3) { if (!n.textContent.trim()) return; var s = document.createElement('strong'); s.textContent = n.textContent.trim(); txt.appendChild(s); n.remove(); return; }
        txt.appendChild(n);
      });
      if (m[2]) { var sub = document.createElement('small'); sub.className = 'as-sub'; sub.textContent = m[2]; txt.appendChild(sub); }
      b.insertAdjacentHTML('afterbegin', '<span class="as-ico" aria-hidden="true">' + svg(m[1]) + '</span>');
      b.appendChild(txt);
      b.insertAdjacentHTML('beforeend', '<span class="as-check" aria-hidden="true"></span>');
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
