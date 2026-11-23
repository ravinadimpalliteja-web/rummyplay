/* Royal Club first-play coach tips: a few short bubbles that point at the real controls, shown once per game.
   window.rcCoach(key, steps) -> Promise (resolves when closed or when already seen on this device).
   steps: [{ text, target }] where target is a selector or an element (optional: no target = centred card).
   window.rcCoach.active is true while tips are on screen (games pause computer moves meanwhile).
   Shared by every game; the React games load it the same way (index.html). */
(function () {
  'use strict';
  if (window.rcCoach) return;
  var CSS = '' +
    '.rcc-scrim{position:fixed;inset:0;z-index:2147483000;pointer-events:auto}' +
    '.rcc-hole{position:fixed;border-radius:18px;box-shadow:0 0 0 9999px rgba(6,10,20,.62),0 0 0 3px #FFD45F,0 0 24px 6px rgba(255,212,95,.55);transition:all .35s cubic-bezier(.3,1.2,.4,1);pointer-events:none}' +
    '.rcc-hole.none{box-shadow:0 0 0 9999px rgba(6,10,20,.62)}' +
    '.rcc-tip{position:fixed;left:50%;width:min(320px,86vw);transform:translateX(-50%);background:#FFF8EA;color:#2A1605;border-radius:18px;padding:14px 16px 12px;' +
      'box-shadow:0 14px 40px rgba(0,0,0,.45),inset 0 0 0 2px #E9C46A;font:600 15px/1.4 "Baloo 2","Inter",system-ui,sans-serif;animation:rccin .35s cubic-bezier(.3,1.5,.5,1)}' +
    '.rcc-tip b.rcc-k{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#B8862B;margin-bottom:2px}' +
    '.rcc-row{display:flex;align-items:center;gap:8px;margin-top:10px}' +
    '.rcc-dots{display:flex;gap:5px;flex:1}.rcc-dots i{width:7px;height:7px;border-radius:50%;background:#E6D6B0}.rcc-dots i.on{background:#B8862B}' +
    '.rcc-skip{background:none;border:0;color:#8A6A40;font:700 14px "Baloo 2",system-ui,sans-serif;padding:8px 6px;cursor:pointer}' +
    '.rcc-next{border:0;border-radius:12px;background:linear-gradient(180deg,#FFD98A,#E9B44C);box-shadow:0 3px 0 #A9782A;color:#2A1605;font:800 15px "Baloo 2",system-ui,sans-serif;padding:8px 18px;min-height:40px;cursor:pointer}' +
    '.rcc-arrow{position:absolute;left:50%;width:16px;height:16px;background:#FFF8EA;transform:translateX(-50%) rotate(45deg);box-shadow:inset 2px 2px 0 #E9C46A}' +
    '@keyframes rccin{from{opacity:0;transform:translate(-50%,10px) scale(.92)}}' +
    '@media (prefers-reduced-motion:reduce){.rcc-hole{transition:none}.rcc-tip{animation:none}}';
  function seen(key) { try { return localStorage.getItem('rc-coach-' + key) === '1'; } catch (e) { return false; } }
  function mark(key) { try { localStorage.setItem('rc-coach-' + key, '1'); } catch (e) { /* storage off */ } }

  function coach(key, steps, opts) {
    opts = opts || {};
    if (!steps || !steps.length || (!opts.force && seen(key))) return Promise.resolve(false);
    if (coach.active) return Promise.resolve(false);
    if (!document.getElementById('rcc-css')) { var st = document.createElement('style'); st.id = 'rcc-css'; st.textContent = CSS; document.head.appendChild(st); }
    coach.active = true;
    return new Promise(function (resolve) {
      var i = 0;
      var scrim = document.createElement('div'); scrim.className = 'rcc-scrim'; scrim.setAttribute('role', 'dialog'); scrim.setAttribute('aria-modal', 'true'); scrim.setAttribute('aria-label', 'Tips');
      var hole = document.createElement('div'); hole.className = 'rcc-hole';
      var tip = document.createElement('div'); tip.className = 'rcc-tip';
      scrim.appendChild(hole); scrim.appendChild(tip); document.body.appendChild(scrim);
      function done() {
        mark(key); coach.active = false;
        window.removeEventListener('resize', paint);
        scrim.remove(); resolve(true);
      }
      function paint() {
        var s = steps[i];
        var el = typeof s.target === 'string' ? document.querySelector(s.target) : s.target;
        var r = el && el.getBoundingClientRect && el.getBoundingClientRect();
        var vw = window.innerWidth, vh = window.innerHeight;
        if (r && r.width && r.height) {
          var pad = s.pad == null ? 8 : s.pad;
          hole.className = 'rcc-hole';
          hole.style.left = (r.left - pad) + 'px'; hole.style.top = (r.top - pad) + 'px';
          hole.style.width = (r.width + pad * 2) + 'px'; hole.style.height = (r.height + pad * 2) + 'px';
        } else {
          hole.className = 'rcc-hole none';
          hole.style.left = vw / 2 + 'px'; hole.style.top = vh / 2 + 'px'; hole.style.width = hole.style.height = '0px';
          r = null;
        }
        tip.innerHTML = (s.title ? '<b class="rcc-k">' + s.title + '</b>' : '') + '<div>' + s.text + '</div>' +
          '<div class="rcc-row"><span class="rcc-dots">' + steps.map(function (_, k) { return '<i class="' + (k === i ? 'on' : '') + '"></i>'; }).join('') + '</span>' +
          (i < steps.length - 1 ? '<button type="button" class="rcc-skip">Skip</button>' : '') +
          '<button type="button" class="rcc-next">' + (i < steps.length - 1 ? 'Next' : 'Got it') + '</button></div>';
        var arrow = document.createElement('span'); arrow.className = 'rcc-arrow';
        tip.style.top = tip.style.bottom = '';
        if (r) {
          var below = r.top + r.height / 2 < vh / 2;          // target in the top half: tip goes below it
          if (below) { tip.style.top = Math.min(vh - 170, r.bottom + 18) + 'px'; arrow.style.top = '-7px'; }
          else { tip.style.bottom = Math.min(vh - 170, vh - r.top + 18) + 'px'; arrow.style.bottom = '-7px'; }
          var cx = Math.max(24, Math.min(vw - 24, r.left + r.width / 2));
          var tw = Math.min(320, vw * 0.86), tl = vw / 2 - tw / 2;
          arrow.style.left = Math.max(18, Math.min(tw - 18, cx - tl)) + 'px';
          tip.appendChild(arrow);
        } else tip.style.top = (vh / 2 - 70) + 'px';
        tip.style.animation = 'none'; void tip.offsetWidth; tip.style.animation = '';
        tip.querySelector('.rcc-next').focus();
      }
      tip.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.classList.contains('rcc-skip')) return done();
        if (++i >= steps.length) return done();
        paint();
      });
      scrim.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(); });
      window.addEventListener('resize', paint);
      paint();
    });
  }
  coach.active = false;
  coach.seen = seen;
  coach.reset = function (key) { try { localStorage.removeItem('rc-coach-' + key); } catch (e) { /* ignore */ } };
  window.rcCoach = coach;
})();
