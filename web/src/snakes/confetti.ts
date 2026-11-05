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
