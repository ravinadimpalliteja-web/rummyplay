/* The home screen's 3D game glider: the selected game sits big and lit in the centre, the others turn away at an
   angle on both sides. Drag with a finger: the cards follow it, keep gliding after a flick and settle on the
   nearest game. Selection is manual: gliding only changes which game is in the centre; a game opens only when its
   centre card is tapped. Tapping a side card glides it to the centre. Arrow keys work too.

   Smoothness: the cards are moved by writing transform and opacity directly in requestAnimationFrame (no React
   render per frame, nothing that needs layout or repaint), and the glide eases out exponentially, so it does not
   stutter on ordinary Android phones. With "Less motion" (Settings) or the phone's "reduce motion", cards jump
   straight to their place. */
import { useEffect, useLayoutEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { motionReduced } from "../lib/motion";

type Drag = { id: number; x: number; pos: number; moved: boolean; samples: [number, number][] };

export default function Glider<T extends string>({ items, selected, onSelect, onOpen, render, label }: {
  items: T[];
  selected: T;
  onSelect: (id: T) => void;              // the centre game changed (after a drag, a tap on a side card or a key)
  onOpen: (id: T) => void;                // the centre card was tapped
  render: (id: T) => ReactNode;           // card contents
  label: (id: T) => string;               // game name, for screen readers
}) {
  const n = items.length;
  const stage = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const start = Math.max(0, items.indexOf(selected));
  const st = useRef({ pos: start, target: start, w: 240, raf: 0, last: 0, drag: null as Drag | null, noClick: false });
  const reduce = useRef(false);
  const mod = (k: number) => ((k % n) + n) % n;
  /** The position on the endless loop closest to `from` that shows game j. */
  const nearest = (j: number, from: number) => {
    let best = j, gap = Infinity;
    for (let c = Math.floor(from) - n; c <= Math.ceil(from) + n; c++) if (mod(c) === j && Math.abs(c - from) < gap) { gap = Math.abs(c - from); best = c; }
    return best;
  };

  const layout = () => {
    const s = st.current, w = s.w;
    cards.current.forEach((el, j) => {
      if (!el) return;
      const d = mod(j - s.pos + n / 2) - n / 2;                  // -n/2 … n/2: the short way round
      const a = Math.abs(d), sign = Math.sign(d);
      const x = sign * (Math.min(a, 1) * w * 0.8 + Math.max(a - 1, 0) * w * 0.34);
      const rot = -Math.max(-1.3, Math.min(1.3, d)) * 44;
      const scale = 1 - Math.min(a, 2) * 0.15;
      el.style.transform = `translate3d(calc(-50% + ${x.toFixed(1)}px),0,${(-a * 80).toFixed(1)}px) rotateY(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      el.style.zIndex = String(100 - Math.round(a * 10));
      el.style.opacity = a > 2.25 ? "0" : a > 1.75 ? ((2.25 - a) / 0.5).toFixed(2) : "1";
      const dim = el.lastElementChild as HTMLElement | null;      // .rx-gc-dim: darkens the side cards
      if (dim) dim.style.opacity = (Math.min(a, 1.6) * 0.34).toFixed(2);
      const centre = a < 0.5;
      el.classList.toggle("centre", centre);
      el.tabIndex = centre ? 0 : -1;
      el.setAttribute("aria-hidden", a > 1.5 ? "true" : "false");
    });
  };
  const tick = (t: number) => {
    const s = st.current;
    const dt = s.last ? Math.min(48, t - s.last) : 16;
    s.last = t;
    s.pos += (s.target - s.pos) * (reduce.current ? 1 : 1 - Math.exp(-dt / 90));
    if (Math.abs(s.target - s.pos) < 0.002) s.pos = s.target;
    layout();
    if (s.pos !== s.target && !s.drag) s.raf = requestAnimationFrame(tick);
    else { s.raf = 0; s.last = 0; }
  };
  const run = () => { const s = st.current; if (!s.raf) { s.last = 0; s.raf = requestAnimationFrame(tick); } };
  const goTo = (target: number, tell = true) => {
    const s = st.current;
    const changed = mod(target) !== mod(Math.round(s.target));
    s.target = target;
    run();
    if (tell && changed) onSelect(items[mod(target)]);
  };

  // card width (for drag distances), kept up to date when the screen size changes
  useLayoutEffect(() => {
    reduce.current = motionReduced();
    const measure = () => { const c = cards.current.find(Boolean); if (c && c.offsetWidth) st.current.w = c.offsetWidth; layout(); };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (ro && stage.current) ro.observe(stage.current);
    return () => { ro?.disconnect(); cancelAnimationFrame(st.current.raf); st.current.raf = 0; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // selected from outside (a medallion, or the app opening on a game): glide there
  useEffect(() => {
    const i = items.indexOf(selected), s = st.current;
    if (i < 0 || mod(Math.round(s.target)) === i) return;
    goTo(nearest(i, s.pos), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const endDrag = (e: PointerEvent) => {
    const s = st.current, d = s.drag;
    if (!d || d.id !== e.pointerId) return;
    s.drag = null;
    if (!d.moved) { run(); return; }                              // a tap: the card's click handles it
    s.noClick = true;                                             // the click that ends a drag must not open a game
    const [t0, x0] = d.samples[0], [t1, x1] = d.samples[d.samples.length - 1];
    const v = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;                // px per ms over the last few moves
    const fling = Math.max(-2, Math.min(2, (-v * 200) / (s.w * 0.8)));
    goTo(Math.round(s.pos + fling));
  };

  return <div ref={stage} className="rx-stage" role="group" aria-roledescription="carousel" aria-label="Games: drag, or use the arrow keys"
    onPointerDown={e => {
      if (e.button !== 0 || n < 2) return;
      const s = st.current;
      s.noClick = false;
      cancelAnimationFrame(s.raf); s.raf = 0;
      s.drag = { id: e.pointerId, x: e.clientX, pos: s.pos, moved: false, samples: [[e.timeStamp, e.clientX]] };
    }}
    onPointerMove={e => {
      const s = st.current, d = s.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      if (!d.moved) {
        if (Math.abs(dx) < 8) return;
        d.moved = true;
        try { stage.current?.setPointerCapture(e.pointerId); } catch { /* pointer gone */ }
      }
      s.pos = d.pos - dx / (s.w * 0.8);
      s.target = s.pos;
      d.samples.push([e.timeStamp, e.clientX]);
      if (d.samples.length > 6) d.samples.shift();
      layout();
    }}
    onPointerUp={endDrag}
    onPointerCancel={endDrag}
    onClickCapture={e => { if (st.current.noClick) { st.current.noClick = false; e.stopPropagation(); e.preventDefault(); } }}
    onKeyDown={e => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        goTo(Math.round(st.current.target) + (e.key === "ArrowRight" ? 1 : -1));
        requestAnimationFrame(() => cards.current[mod(Math.round(st.current.target))]?.focus({ preventScroll: true }));
      }
    }}>
    <div className="rx-glow" aria-hidden="true" />
    <div className="rx-floor" aria-hidden="true" />
    {items.map((id, j) => <button key={id} ref={el => { cards.current[j] = el; }} type="button" className="rx-gc"
      aria-label={`${label(id)}${id === selected ? ", tap to open" : ""}`}
      onClick={() => {
        const s = st.current;
        if (mod(Math.round(s.target)) === j && Math.abs(s.pos - s.target) < 0.35) onOpen(id);
        else goTo(nearest(j, s.pos));
      }}>
      {render(id)}
      <span className="rx-gc-dim" aria-hidden="true" />
    </button>)}
  </div>;
}
