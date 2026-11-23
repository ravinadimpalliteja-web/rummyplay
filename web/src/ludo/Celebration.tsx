/* Finish celebrations, one for each place (shown over the whole screen, never blocking taps):
   - 1st, the Ambari procession: the Ambaro elephant in the winner's colour walks across the screen carrying its
     ambari, under a shower of marigold petals, with a crown and "Ambaro Champion". Only 1st place gets this.
   - 2nd, diya lights: a row of oil lamps lights up one by one, with a silver glow.
   - 3rd, a light shower of marigold petals.
   The last player gets no animation, just the finish screen. Sounds are played by the game (LudoGame). */
import { useEffect, type CSSProperties } from "react";
import type { Color } from "./engine";
import { Piece } from "./pieces";

const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

/** Marigold petals (and a few jasmine buds) drifting down on a full-screen canvas. */
export function petals(ms: number, count: number) {
  if (typeof document === "undefined") return;
  const reduced = reducedMotion();
  const cv = document.createElement("canvas");
  cv.className = "ld-petals"; cv.setAttribute("aria-hidden", "true");
  document.body.appendChild(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = window.innerWidth, H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext("2d"); if (!g) { cv.remove(); return; }
  g.scale(dpr, dpr);
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const COLS = ["#ff9f1c", "#ffb627", "#f77f00", "#ffd166", "#e85d04", "#fff4e0"];
  const n = reduced ? Math.round(count / 3) : count;
  const ps = Array.from({ length: n }, () => ({
    x: rnd(0, W), y: rnd(-H * .9, -10), vy: rnd(.9, 2.2), sway: rnd(.6, 1.6), ph: rnd(0, 6.3), r: rnd(0, 6.3), spin: rnd(-.05, .05),
    w: rnd(5, 9), h: rnd(3, 5.5), c: COLS[Math.floor(Math.random() * COLS.length)],
  }));
  const t0 = performance.now();
  const frame = (now: number) => {
    const t = now - t0;
    g.clearRect(0, 0, W, H);
    const fade = t > ms - 700 ? Math.max(0, (ms - t) / 700) : 1;
    for (const p of ps) {
      p.y += p.vy; p.ph += .03; p.x += Math.sin(p.ph) * p.sway; p.r += p.spin;
      g.save(); g.globalAlpha = fade; g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.c; g.beginPath(); g.ellipse(0, 0, p.w, p.h, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(120,50,0,.25)"; g.beginPath(); g.ellipse(-p.w * .35, 0, p.w * .3, p.h * .3, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    if (t < ms) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}

const COLOR_HEX: Record<Color, string> = { red: "#c8323f", green: "#1f9a5c", yellow: "#e3a21a", blue: "#2f63c4" };

/** A clay diya with its flame. */
const Diya = ({ i }: { i: number }) => <svg className="ld-diya" viewBox="0 0 40 36" style={{ "--i": i } as CSSProperties} aria-hidden="true">
  <path className="ld-diya-flame" d="M20 3 C24 9 25 13 23 16.6 C22 18.4 18 18.4 17 16.6 C15 13 16 9 20 3 Z" />
  <path d="M20 9.6 C21.6 12 21.8 14 21 15.6 C20.4 16.4 19.6 16.4 19 15.6 C18.2 14 18.4 12 20 9.6 Z" fill="#fff6c8" className="ld-diya-core" />
  <path d="M3 20 C6 31 34 31 37 20 C30 23 10 23 3 20 Z" fill="#b5562a" stroke="#6e2c10" strokeWidth=".8" />
  <path d="M3 20 C10 23 30 23 37 20 C36 18.6 34 18.6 33 19.2 C26 21 14 21 7 19.2 C6 18.6 4 18.6 3 20 Z" fill="#d9783f" />
  <path d="M8 25 h24" stroke="#e9c46a" strokeWidth="1.2" strokeDasharray="1.6 2.2" />
</svg>;

export function Celebration({ place, color, name, onDone }: { place: number; color: Color; name: string; onDone: () => void }) {
  const ms = place === 0 ? 4600 : place === 1 ? 3200 : 2600;
  useEffect(() => {
    if (place === 0) petals(ms, 140); else if (place === 2) petals(ms, 70);
    const id = window.setTimeout(onDone, ms);
    return () => window.clearTimeout(id);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const you = name === "You";
  if (place === 0) return <div className="ld-cel ld-cel-1" style={{ "--win": COLOR_HEX[color] } as CSSProperties} aria-hidden="true">
    <div className="ld-cel-title">
      <span className="ld-cel-crown">♛</span>
      <strong>Ambaro Champion</strong>
      <em>{you ? "You win!" : `${name} wins!`}</em>
    </div>
    <div className="ld-cel-road" />
    <div className="ld-cel-walk"><div className="ld-cel-bob"><Piece set="ambaro" color={color} /></div></div>
  </div>;
  if (place === 1) return <div className="ld-cel ld-cel-2" aria-hidden="true">
    <div className="ld-cel-label"><strong>2nd place</strong><em>{you ? "Well played!" : name}</em></div>
    <div className="ld-diyas">{Array.from({ length: 7 }, (_, i) => <Diya key={i} i={i} />)}</div>
  </div>;
  return <div className="ld-cel ld-cel-3" aria-hidden="true">
    <div className="ld-cel-label"><strong>3rd place</strong><em>{you ? "Nicely done!" : name}</em></div>
  </div>;
}
