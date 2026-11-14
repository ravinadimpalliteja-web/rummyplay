/* Royal Club inside the Android app (Capacitor): make the pages feel like an app, not a website.
   Loaded by every page; does nothing in a normal browser.
   - html.rc-app class for app-only styles (no website footer or top-bar links, no text selection or long-press
     menus, no tap flash, no overscroll bounce)
   - navigator.vibrate goes through the Haptics plugin, so the games' existing buzzes work on Android phones */
(function () {
  var C = window.Capacitor;
  if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return;
  var root = document.documentElement;
  root.classList.add('rc-app');

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
      if (ms > 0) { try { H.vibrate({ duration: Math.min(ms, 1000) }); } catch (e) { /* no vibrator */ } }
      return true;
    };
    try { Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true }); } catch (e) { /* read-only: keep the WebView's own */ }
  }
})();
