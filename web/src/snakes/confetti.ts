/* Celebration confetti on a full-screen canvas that never blocks taps.
   big = first place: two side cannons, a top sprinkle and twinkling gold stars. Otherwise a smaller sprinkle. */
const COLORS = ["#f6d36b", "#e8b33c", "#ff5d73", "#4fb3ff", "#57d68d", "#c77dff", "#ffffff", "#ff9f43"];
type P = { x: number; y: number; vx: number; vy: number; r: number; spin: number; w: number; h: number; c: string; star: boolean; life: number };

export function celebrate(big: boolean) {
  if (typeof document === "undefined") return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const cv = document.createElement("canvas");
  cv.className = "sl-confetti"; cv.setAttribute("aria-hidden", "true");
  document.body.appendChild(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = window.innerWidth, H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext("2d")!; g.scale(dpr, dpr);
  const ps: P[] = [], rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const piece = (x: number, y: number, vx: number, vy: number, star = false): P => ({ x, y, vx, vy, r: rnd(0, 6.3), spin: rnd(-.25, .25), w: rnd(5, 9), h: rnd(8, 14), c: COLORS[Math.floor(Math.random() * COLORS.length)], star, life: 0 });
  const n = reduced ? (big ? 40 : 18) : big ? 230 : 80;
  if (big) {
    for (let i = 0; i < n * .38; i++) { ps.push(piece(-10, H * .78, rnd(4, 11), rnd(-17, -9))); ps.push(piece(W + 10, H * .78, rnd(-11, -4), rnd(-17, -9))); }
    for (let i = 0; i < n * .24; i++) ps.push(piece(rnd(0, W), rnd(-H * .4, -10), rnd(-1, 1), rnd(1, 4)));
    for (let i = 0; i < 26; i++) ps.push(piece(rnd(W * .1, W * .9), rnd(H * .15, H * .6), 0, 0, true));
  } else {
    for (let i = 0; i < n; i++) ps.push(piece(rnd(W * .15, W * .85), rnd(-H * .3, -10), rnd(-1.2, 1.2), rnd(1.5, 4)));
  }
  const t0 = performance.now(), max = big ? 4200 : 2600;
  const frame = (now: number) => {
    const el = now - t0;
    g.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of ps) {
      p.life++;
      if (p.star) {
        const tw = Math.max(0, Math.sin((el / 1000) * 5 + p.r * 3)) * Math.max(0, 1 - el / max);
        if (tw <= 0.01) continue; alive++;
        g.save(); g.translate(p.x, p.y); g.rotate(el / 900 + p.r); g.globalAlpha = tw; g.fillStyle = "#ffe9a3";
        g.beginPath(); for (let k = 0; k < 8; k++) { const rr = k % 2 ? 2.5 : 9; g.lineTo(Math.cos((k * Math.PI) / 4) * rr, Math.sin((k * Math.PI) / 4) * rr); } g.closePath(); g.fill(); g.restore();
        continue;
      }
      p.vy += .32; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += Math.min(p.vy, 7); p.r += p.spin;
      if (p.y > H + 30) continue;
      alive++;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.cos(p.life * .18 + p.r));
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    if (alive && el < max + 1500) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}

/* Fireworks for the champion: rockets climb from the bottom and burst into rings of sparks in the players' colours,
   each spark trailing and fading, with a soft glow. About `ms` long; never blocks taps. */
export function fireworks(ms = 2800, colors: string[] = COLORS) {
  if (typeof document === "undefined") return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;
  const cv = document.createElement("canvas");
  cv.className = "sl-confetti"; cv.setAttribute("aria-hidden", "true");
  document.body.appendChild(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = window.innerWidth, H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext("2d")!; g.scale(dpr, dpr);
  type Rocket = { x: number; y: number; vy: number; tx: number; ty: number; c: string; at: number; done: boolean };
  type Spark = { x: number; y: number; vx: number; vy: number; c: string; life: number; max: number };
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const rockets: Rocket[] = [], sparks: Spark[] = [];
  const shots = Math.max(5, Math.round(ms / 380));
  for (let i = 0; i < shots; i++) {
    const tx = rnd(W * .14, W * .86), ty = rnd(H * .14, H * .45);
    rockets.push({ x: tx + rnd(-30, 30), y: H + 10, vy: 0, tx, ty, c: colors[i % colors.length], at: i * (ms * .7 / shots), done: false });
  }
  const t0 = performance.now();
  let last = t0;
  const frame = (now: number) => {
    const el = now - t0, dt = Math.min(40, now - last) / 16.7; last = now;
    g.globalCompositeOperation = "destination-out"; g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(0, 0, W, H);   // trails
    g.globalCompositeOperation = "lighter";
    for (const r of rockets) {
      if (r.done || el < r.at) continue;
      const k = Math.min(1, (el - r.at) / 520), e = 1 - Math.pow(1 - k, 2.4);
      r.y = H + 10 + (r.ty - H - 10) * e;
      g.fillStyle = "#fff4d0"; g.beginPath(); g.arc(r.x + (r.tx - r.x) * e, r.y, 2.2, 0, 6.3); g.fill();
      if (k >= 1) {
        r.done = true;
        const n = 46, speed = rnd(3.2, 4.6);
        for (let j = 0; j < n; j++) {
          const a = (j / n) * Math.PI * 2 + rnd(-.05, .05), s = speed * rnd(.75, 1.05);
          sparks.push({ x: r.tx, y: r.ty, vx: Math.cos(a) * s, vy: Math.sin(a) * s, c: j % 5 === 0 ? "#fff6d8" : r.c, life: 0, max: rnd(48, 70) });
        }
      }
    }
    for (const p of sparks) {
      if (p.life > p.max) continue;
      p.life += dt; p.vx *= .965; p.vy = p.vy * .965 + .07 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = Math.max(0, 1 - p.life / p.max);
      g.globalAlpha = a; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, 1.6 + a * 1.6, 0, 6.3); g.fill();
    }
    g.globalAlpha = 1;
    if (el < ms + 1400) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}
