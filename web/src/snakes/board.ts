import { LADDERS, SNAKES } from "./engine";

/* The board is drawn on a 624 x 624 logical canvas: a thin raised wooden frame (PAD) around 10 x 10 carved squares of 60,
   numbered in a zigzag from the bottom left. Everything is painted in code (no image files), so it stays sharp at any size. */
export const PAD = 12, S = 60, W = S * 10 + PAD * 2;
const K = 1.45;                                    // snake size: bodies, heads and markings are drawn this much larger than before
export type Pt = { x: number; y: number };

/* ---------- woods ---------- */
export type WoodId = "teak" | "rosewood" | "walnut" | "sheesham";
type Wood = { name: string; base: string; light: string; dark: string; grain: string; contrast: number; frame: string; stain: number };
export const WOODS: Record<WoodId, Wood> = {
  teak: { name: "Teak", base: "#a8692f", light: "#c98b4a", dark: "#73421a", grain: "#4a2a0e", contrast: .9, frame: "#7a4518", stain: .10 },
  rosewood: { name: "Rosewood", base: "#6f2b1d", light: "#8f4029", dark: "#40150c", grain: "#260905", contrast: .9, frame: "#4a170e", stain: .12 },
  walnut: { name: "Walnut", base: "#5b3c27", light: "#7c5538", dark: "#33200f", grain: "#1c1007", contrast: .85, frame: "#3a2414", stain: .12 },
  sheesham: { name: "Sheesham", base: "#8c5a33", light: "#c99360", dark: "#4b2a13", grain: "#2c1609", contrast: 1.2, frame: "#5a3418", stain: .10 },
};
export const WOOD_IDS = Object.keys(WOODS) as WoodId[];

export const center = (n: number): Pt => {
  const row = Math.floor((n - 1) / 10);
  let col = (n - 1) % 10;
  if (row % 2) col = 9 - col;
  return { x: PAD + col * S + S / 2, y: PAD + (9 - row) * S + S / 2 };
};
/** Where a token waits before entering (on the frame, just left of square 1). */
export const OFF: Pt = { x: PAD - S / 3, y: center(1).y };

/** Centre line of a snake from head to tail; also the path a token slides down. */
export function snakePath(head: number, tail: number): Pt[] {
  const h = center(head), t = center(tail);
  const dx = t.x - h.x, dy = t.y - h.y, len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len, waves = Math.max(1.5, Math.round(len / 78) + .5), amp = Math.min(26, 13 + len / 28), pts: Pt[] = [];
  for (let i = 0; i <= 120; i++) {
    const k = i / 120, env = Math.sin(Math.min(1, k * 1.15) * Math.PI) * .85 + .15;
    const w = Math.sin(k * Math.PI * waves) * amp * env;
    pts.push({ x: h.x + dx * k + nx * w, y: h.y + dy * k + ny * w });
  }
  return pts;
}

/* ---------- helpers ---------- */
/** Draws `draw` onto a small offscreen canvas covering `box` (logical px) and composites it, so blur filters stay cheap. */
function onLayer(g: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, draw: (c: CanvasRenderingContext2D) => void) {
  const dpr = g.getTransform().a || 1;
  const x = Math.max(0, Math.floor(box.x)), y = Math.max(0, Math.floor(box.y));
  const w = Math.min(W - x, Math.ceil(box.w + box.x - x)), h = Math.min(W - y, Math.ceil(box.h + box.y - y));
  if (w <= 0 || h <= 0) return;
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
  const cg = c.getContext("2d")!;
  cg.setTransform(dpr, 0, 0, dpr, -x * dpr, -y * dpr);
  draw(cg);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(c, Math.round(x * dpr), Math.round(y * dpr)); g.restore();
}
const boxOf = (pts: Pt[], pad: number) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
};
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgba = (h: string, a: number) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`; };
const LIGHT = { x: -0.55, y: -0.83 };                                   // light comes from the top left

/** Wood grain filling a rectangle: broad colour bands, flowing grain lines, pores and the odd knot. */
function grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wood: Wood, seed: number, vertical = false) {
  const r = rng(seed);
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (vertical) { g.translate(x + w, y); g.rotate(Math.PI / 2); [w, h] = [h, w]; x = 0; y = 0; }
  const band = g.createLinearGradient(0, y, 0, y + h);
  for (let i = 0; i <= 12; i++) band.addColorStop(i / 12, mix(wood.base, r() < .5 ? wood.light : wood.dark, r() * .45 * wood.contrast));
  g.fillStyle = band; g.fillRect(x, y, w, h);
  const lines = Math.round(h / 2.3);
  const f1 = .004 + r() * .004, f2 = .013 + r() * .01;
  for (let i = 0; i < lines; i++) {
    const y0 = y + (i / lines) * h + (r() - .5) * 3, p1 = r() * 6.3, p2 = r() * 6.3, a1 = 4 + r() * 9, a2 = .8 + r() * 2.2;
    const dark = r() < .62;
    g.strokeStyle = rgba(dark ? wood.grain : wood.light, (dark ? .05 + r() * .13 : .04 + r() * .09) * wood.contrast);
    g.lineWidth = .35 + r() * (dark ? 1.3 : 1);
    g.beginPath();
    for (let xx = x; xx <= x + w + 8; xx += 8) {
      const yy = y0 + Math.sin(xx * f1 + p1) * a1 + Math.sin(xx * f2 + p2) * a2;
      if (xx === x) g.moveTo(xx, yy); else g.lineTo(xx, yy);
    }
    g.stroke();
  }
  // pores
  g.fillStyle = rgba(wood.grain, .18 * wood.contrast);
  for (let i = 0; i < w * h / 90; i++) g.fillRect(x + r() * w, y + r() * h, 1.4 + r() * 2.2, .6);
  // a knot or two
  const knots = r() < .7 ? 1 + Math.floor(r() * 2) : 0;
  for (let k = 0; k < knots; k++) {
    const kx = x + r() * w, ky = y + r() * h, rx = 6 + r() * 7;
    for (let ring = 0; ring < 7; ring++) {
      g.strokeStyle = rgba(wood.grain, .22 - ring * .025); g.lineWidth = 1;
      g.beginPath(); g.ellipse(kx, ky, rx + ring * 3.2, (rx + ring * 3.2) * .42, 0, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = rgba(wood.grain, .45); g.beginPath(); g.ellipse(kx, ky, rx * .55, rx * .25, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

/* ---------- board ---------- */
function frameAndSquares(g: CanvasRenderingContext2D, wood: Wood) {
  // frame: four mitred planks, grain running along each
  const fw = { ...wood, base: wood.frame, light: mix(wood.frame, wood.light, .5), dark: wood.dark };
  grain(g, 0, 0, W, PAD, fw, 11);
  grain(g, 0, W - PAD, W, PAD, fw, 12);
  grain(g, 0, 0, PAD, W, fw, 13, true);
  grain(g, W - PAD, 0, PAD, W, fw, 14, true);
  // mitre joints and bevel
  g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1;
  for (const [a, b, c, d] of [[0, 0, PAD, PAD], [W, 0, W - PAD, PAD], [0, W, PAD, W - PAD], [W, W, W - PAD, W - PAD]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
  const bevel = (x1: number, y1: number, x2: number, y2: number, c: string, w: number) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  bevel(1, 1, W - 1, 1, "rgba(255,240,210,.35)", 2); bevel(1, 1, 1, W - 1, "rgba(255,240,210,.28)", 2);
  bevel(1, W - 1, W - 1, W - 1, "rgba(0,0,0,.45)", 2); bevel(W - 1, 1, W - 1, W - 1, "rgba(0,0,0,.4)", 2);
  // playing surface: one panel, slightly lower than the frame
  grain(g, PAD, PAD, S * 10, S * 10, wood, 21);
  bevel(PAD, PAD + .5, W - PAD, PAD + .5, "rgba(0,0,0,.55)", 2.5); bevel(PAD + .5, PAD, PAD + .5, W - PAD, "rgba(0,0,0,.5)", 2.5);
  bevel(PAD, W - PAD - .5, W - PAD, W - PAD - .5, "rgba(255,235,200,.25)", 1.5); bevel(W - PAD - .5, PAD, W - PAD - .5, W - PAD, "rgba(255,235,200,.2)", 1.5);
  // alternate squares carry a slightly darker oil stain, like a hand-made board
  for (let n = 1; n <= 100; n++) {
    const p = center(n), row = Math.floor((n - 1) / 10), col = (n - 1) % 10;
    if ((row + col) % 2) { g.fillStyle = `rgba(30,12,2,${wood.stain})`; g.fillRect(p.x - S / 2, p.y - S / 2, S, S); }
  }
  // carved grooves between squares: a dark cut with a lit lower edge
  for (let i = 1; i < 10; i++) {
    const v = PAD + i * S;
    bevel(v, PAD, v, W - PAD, "rgba(15,6,0,.55)", 1.6); bevel(v + 1.4, PAD, v + 1.4, W - PAD, "rgba(255,230,190,.16)", 1);
    bevel(PAD, v, W - PAD, v, "rgba(15,6,0,.55)", 1.6); bevel(PAD, v + 1.4, W - PAD, v + 1.4, "rgba(255,230,190,.16)", 1);
  }
  // square 100: an inlaid brass-and-ivory lotus
  const m = center(100);
  const halo = g.createRadialGradient(m.x, m.y, 4, m.x, m.y, 34);
  halo.addColorStop(0, "rgba(255,215,140,.35)"); halo.addColorStop(1, "rgba(255,215,140,0)");
  g.fillStyle = halo; g.fillRect(m.x - S / 2, m.y - S / 2, S, S);
  lotus(g, m.x + 4, m.y + 2);
}

/** Square numbers, drawn last so snakes and ladders never hide them: bold ivory figures with a dark outline. */
function numbers(g: CanvasRenderingContext2D) {
  g.save();
  g.textAlign = "left"; g.textBaseline = "alphabetic"; g.lineJoin = "round";
  for (let n = 1; n <= 100; n++) {
    const p = center(n), x = p.x - S / 2 + 4, y = p.y - S / 2 + 19, t = String(n);
    g.font = "800 19px 'DM Sans', system-ui, sans-serif";
    g.lineWidth = 4.2; g.strokeStyle = "rgba(22,10,2,.92)"; g.strokeText(t, x, y);
    g.fillStyle = n === 100 ? "#ffe08a" : "#fff4dc"; g.fillText(t, x, y);
  }
  const s = center(1);
  g.textAlign = "center"; g.font = "800 10px 'DM Sans', system-ui, sans-serif"; g.lineWidth = 3;
  g.strokeText("START", s.x, s.y + 24); g.fillStyle = "#ffe08a"; g.fillText("START", s.x, s.y + 24);
  const m = center(100);
  g.font = "700 12px 'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Mangal', sans-serif";
  g.strokeText("मोक्ष", m.x + 4, m.y + 25); g.fillStyle = "#ffe08a"; g.fillText("मोक्ष", m.x + 4, m.y + 25);
  g.restore();
}

function lotus(g: CanvasRenderingContext2D, x: number, y: number) {
  const petal = (ang: number, len: number, wid: number, inner: boolean) => {
    g.save(); g.translate(x, y + 7); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(wid, -len * .55, 0, -len); g.quadraticCurveTo(-wid, -len * .55, 0, 0);
    const gr = g.createLinearGradient(0, 0, 0, -len);
    if (inner) { gr.addColorStop(0, "#e9d9b8"); gr.addColorStop(1, "#fffaf0"); } else { gr.addColorStop(0, "#9a6a22"); gr.addColorStop(.6, "#e1b65c"); gr.addColorStop(1, "#fbe3a0"); }
    g.fillStyle = gr; g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 2; g.shadowOffsetY = 1; g.fill();
    g.shadowColor = "transparent"; g.strokeStyle = "rgba(60,30,0,.5)"; g.lineWidth = .7; g.stroke(); g.restore();
  };
  for (const a of [-1.3, 1.3, -0.85, 0.85]) petal(a, 17, 7, false);
  for (const a of [-0.4, 0.4]) petal(a, 19, 7, true);
  petal(0, 21, 7.5, true);
  g.fillStyle = "#c9962f"; g.beginPath(); g.ellipse(x, y + 8, 10, 3, 0, 0, Math.PI * 2); g.fill();
}

/* ---------- ladders: round wooden rails and rungs, casting shadows on the board ---------- */
function ladder(g: CanvasRenderingContext2D, a: number, b: number) {
  const p1 = center(a), p2 = center(b), dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, half = 11;
  const ext = 9, s1 = { x: p1.x - ux * ext, y: p1.y - uy * ext }, s2 = { x: p2.x + ux * ext, y: p2.y + uy * ext };
  const rungs = Math.floor(len / 19);
  const cylinder = (x1: number, y1: number, x2: number, y2: number, r: number, base: string, light: string, dark: string) => {
    const dxx = x2 - x1, dyy = y2 - y1, l = Math.hypot(dxx, dyy), px = -dyy / l, py = dxx / l;
    const gr = g.createLinearGradient(x1 + px * r, y1 + py * r, x1 - px * r, y1 - py * r);
    const lit = px * LIGHT.x + py * LIGHT.y > 0;                         // which side faces the light
    gr.addColorStop(0, lit ? light : dark); gr.addColorStop(.45, base); gr.addColorStop(1, lit ? dark : light);
    g.fillStyle = gr; g.beginPath();
    g.moveTo(x1 + px * r, y1 + py * r); g.lineTo(x2 + px * r, y2 + py * r); g.arc(x2, y2, r, Math.atan2(py, px), Math.atan2(-py, -px));
    g.lineTo(x1 - px * r, y1 - py * r); g.arc(x1, y1, r, Math.atan2(-py, -px), Math.atan2(py, px)); g.closePath(); g.fill();
  };
  // shadow first
  g.save(); g.filter = "blur(3px)"; g.fillStyle = "rgba(0,0,0,.42)";
  for (const s of [1, -1]) { g.beginPath(); g.moveTo(s1.x + nx * half * s + 4, s1.y + ny * half * s + 6); g.lineTo(s2.x + nx * half * s + 4, s2.y + ny * half * s + 6); g.lineWidth = 7; g.strokeStyle = "rgba(0,0,0,.42)"; g.stroke(); }
  for (let i = 1; i < rungs; i++) { const k = i / rungs, x = p1.x + dx * k + 4, y = p1.y + dy * k + 6; g.beginPath(); g.moveTo(x + nx * half, y + ny * half); g.lineTo(x - nx * half, y - ny * half); g.lineWidth = 4; g.stroke(); }
  g.restore();
  for (let i = 1; i < rungs; i++) {
    const k = i / rungs, x = p1.x + dx * k, y = p1.y + dy * k;
    cylinder(x + nx * half, y + ny * half, x - nx * half, y - ny * half, 2.3, "#b98a52", "#e9c48c", "#6d4a22");
  }
  for (const s of [1, -1]) cylinder(s1.x + nx * half * s, s1.y + ny * half * s, s2.x + nx * half * s, s2.y + ny * half * s, 3.4, "#a8763f", "#e2b77b", "#5a3a17");
  for (let i = 1; i < rungs; i++) {                                     // wooden pegs where rungs meet rails
    const k = i / rungs, x = p1.x + dx * k, y = p1.y + dy * k;
    for (const s of [1, -1]) { g.fillStyle = "#4a2e10"; g.beginPath(); g.arc(x + nx * half * s, y + ny * half * s, 1.3, 0, Math.PI * 2); g.fill(); }
  }
}

/* ---------- snakes: Indian species with scaled, rounded bodies ---------- */
type Species = { name: string; body: string; belly: string; head: string; eye: string; pupil: "slit" | "round"; hood: boolean; mark: (ctx: MarkCtx) => void };
type MarkCtx = { g: CanvasRenderingContext2D; at: (s: number) => { p: Pt; n: Pt; t: Pt; w: number }; total: number; k: number };
const band = (c: MarkCtx, s: number, thick: number, color: string, across = 1) => {
  const { g } = c, a = c.at(s); if (!a) return;
  g.strokeStyle = color; g.lineWidth = thick * c.k; g.beginPath();
  g.moveTo(a.p.x + a.n.x * a.w * .6 * across, a.p.y + a.n.y * a.w * .6 * across); g.lineTo(a.p.x - a.n.x * a.w * .6 * across, a.p.y - a.n.y * a.w * .6 * across); g.stroke();
};
const blot = (c: MarkCtx, s: number, off: number, rx: number, ry: number, fill: string, edge: string, edgeW = 1.2) => {
  const { g } = c, a = c.at(s); if (!a) return;
  g.save(); g.translate(a.p.x + a.n.x * off * a.w, a.p.y + a.n.y * off * a.w); g.rotate(Math.atan2(a.t.y, a.t.x));
  g.beginPath(); g.ellipse(0, 0, rx * c.k, Math.min(ry * c.k, a.w * .5), 0, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill(); g.strokeStyle = edge; g.lineWidth = edgeW * c.k; g.stroke(); g.restore();
};
const each = (c: MarkCtx, first: number, gap: number, endPad: number, f: (s: number) => void) => { for (let s = first * c.k; s < c.total - endPad * c.k; s += gap * c.k) f(s); };
const SPECIES: Species[] = [
  { name: "Indian python", body: "#9a8657", belly: "#d7c89c", head: "#7c6a43", eye: "#b8892a", pupil: "slit", hood: false,
    mark: (c) => each(c, 10, 17, 16, (s) => { blot(c, s, 0, 7.5, 7, "#5a4026", "#2e1f10", 1.6); blot(c, s + 8 * c.k, .62, 3, 2.4, "#4a331d", "#2e1f10", .8); blot(c, s + 8 * c.k, -.62, 3, 2.4, "#4a331d", "#2e1f10", .8); }) },
  { name: "King cobra", body: "#4d4a26", belly: "#cfc488", head: "#5b5730", eye: "#3a2a12", pupil: "round", hood: true,
    mark: (c) => each(c, 14, 12, 8, (s) => band(c, s, 2.4, "rgba(232,222,150,.85)")) },
  { name: "Russell's viper", body: "#a77f4b", belly: "#e2cfa4", head: "#8d673a", eye: "#c49a3c", pupil: "slit", hood: false,
    mark: (c) => each(c, 9, 13, 12, (s) => { blot(c, s, 0, 5.4, 4.2, "#5b3a1c", "#141008", 1.3); blot(c, s + 6.5 * c.k, .66, 2.8, 2.3, "#5b3a1c", "#141008", .9); blot(c, s + 6.5 * c.k, -.66, 2.8, 2.3, "#5b3a1c", "#141008", .9); }) },
  { name: "Common krait", body: "#1d1f28", belly: "#6c6e78", head: "#22242e", eye: "#111", pupil: "round", hood: false,
    mark: (c) => each(c, 16, 13, 6, (s) => { band(c, s, 1.3, "rgba(240,240,236,.92)"); band(c, s + 3.2 * c.k, 1.3, "rgba(240,240,236,.92)"); }) },
  { name: "Spectacled cobra", body: "#6a4728", belly: "#d6b98a", head: "#5e3f22", eye: "#2a1a0c", pupil: "round", hood: true,
    mark: (c) => each(c, 20, 19, 10, (s) => band(c, s, 4, "rgba(40,22,8,.35)")) },
  { name: "Green vine snake", body: "#4f8a2e", belly: "#c8e08a", head: "#4a8229", eye: "#d1b23a", pupil: "slit", hood: false,
    mark: () => { /* plain green with a pale belly line */ } },
];
const speciesOf = (head: number) => SPECIES[Math.max(0, Object.keys(SNAKES).indexOf(String(head))) % SPECIES.length];

/** Shape of one snake: its centre line, cumulative length, width and a lookup by distance from the head. */
type Geom = { pts: Pt[]; len: number[]; total: number; WD: number[]; L: Pt[]; R: Pt[]; tan: (i: number) => Pt; at: (s: number) => { p: Pt; n: Pt; t: Pt; w: number }; angle: number };
const geoms = new Map<string, Geom>();
function geom(head: number, tail: number): Geom {
  const key = head + ">" + tail, hit = geoms.get(key); if (hit) return hit;
  const pts = snakePath(head, tail), N = pts.length, len: number[] = [0];
  for (let i = 1; i < N; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = len[N - 1], maxW = 15.5 * K;
  // a real snake's build: narrow neck, thickest a third of the way down, a long fine tail
  const width = (k: number) => maxW * (k < .06 ? .62 + .38 * (k / .06) : k < .35 ? 1 : Math.max(.08, 1 - Math.pow((k - .35) / .65, 1.25) * .94));
  const tan = (i: number) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
  const L: Pt[] = [], R: Pt[] = [], WD: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = tan(i), n = { x: -t.y, y: t.x }, w = width(len[i] / total) / 2; WD.push(w * 2);
    L.push({ x: pts[i].x + n.x * w, y: pts[i].y + n.y * w }); R.push({ x: pts[i].x - n.x * w, y: pts[i].y - n.y * w });
  }
  const at = (s: number) => {
    if (s < 0 || s > total) return null as unknown as { p: Pt; n: Pt; t: Pt; w: number };
    let i = 1; while (i < N - 1 && len[i] < s) i++;
    const f = (s - len[i - 1]) / ((len[i] - len[i - 1]) || 1), t = tan(i);
    return { p: { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f }, n: { x: -t.y, y: t.x }, t, w: WD[i] };
  };
  const angle = Math.atan2(pts[0].y - pts[3].y, pts[0].x - pts[3].x);
  const g = { pts, len, total, WD, L, R, tan, at, angle };
  geoms.set(key, g); return g;
}

function snake(g: CanvasRenderingContext2D, head: number, tail: number, sp: Species, seed: number) {
  const r = rng(seed);
  const { pts, total, WD, L, R, tan, at, angle } = geom(head, tail), N = pts.length;
  const outline = () => { g.beginPath(); g.moveTo(L[0].x, L[0].y); for (let i = 1; i < N; i++) g.lineTo(L[i].x, L[i].y); for (let i = N - 1; i >= 0; i--) g.lineTo(R[i].x, R[i].y); g.closePath(); };

  // shadow on the wood
  g.save(); g.filter = "blur(4px)"; g.translate(5, 7); outline(); g.fillStyle = "rgba(0,0,0,.45)"; g.fill();
  g.beginPath(); g.ellipse(pts[0].x + Math.cos(angle) * (sp.hood ? 0 : 8 * K), pts[0].y + Math.sin(angle) * (sp.hood ? 0 : 8 * K), (sp.hood ? 17 : 11) * K, (sp.hood ? 15 : 8) * K, angle, 0, Math.PI * 2); g.fill(); g.restore();
  // a cobra's spread hood sits under the head
  if (sp.hood) hood(g, pts[0], angle, sp);
  // body
  outline(); g.fillStyle = sp.body; g.fill();
  g.save(); outline(); g.clip();
  // belly colour showing along the lower side
  g.fillStyle = rgba(sp.belly, .55); g.beginPath();
  for (let i = 0; i < N; i++) { const t = tan(i), n = { x: -t.y, y: t.x }, w = WD[i] / 2, side = n.x * LIGHT.x + n.y * LIGHT.y > 0 ? -1 : 1; const q = { x: pts[i].x + n.x * w * side, y: pts[i].y + n.y * w * side }; i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }
  for (let i = N - 1; i >= 0; i--) { const t = tan(i), n = { x: -t.y, y: t.x }, w = WD[i] / 2, side = n.x * LIGHT.x + n.y * LIGHT.y > 0 ? -1 : 1; g.lineTo(pts[i].x + n.x * w * side * .35, pts[i].y + n.y * w * side * .35); }
  g.closePath(); g.fill();
  sp.mark({ g, at, total, k: K });
  // scales: staggered rows of small overlapping arcs, each with a faint glint
  const sc = 2.6, step = 3.6;
  g.lineWidth = .65;
  for (let s = 2; s < total; s += step) {
    const a = at(s); if (!a) continue;
    const ang = Math.atan2(a.t.y, a.t.x), rows = Math.max(2, Math.round(a.w / 4)), off = (Math.round(s / step) % 2) * .5, rr = Math.min(sc, a.w / 4);
    for (let j = 0; j <= rows; j++) {
      const across = ((j + off) / rows - .5) * a.w, cx = a.p.x + a.n.x * across, cy = a.p.y + a.n.y * across;
      g.strokeStyle = "rgba(0,0,0,.24)"; g.beginPath(); g.arc(cx, cy, rr, ang + Math.PI * .5, ang + Math.PI * 1.5); g.stroke();
      g.strokeStyle = "rgba(255,255,255,.09)"; g.beginPath(); g.arc(cx - a.t.x * .7, cy - a.t.y * .7, rr, ang + Math.PI * .6, ang + Math.PI * 1.1); g.stroke();
    }
  }
  // rounded shading: dark flanks and a soft highlight on the side facing the light
  g.filter = "blur(3.4px)";
  const strip = (from: number, to: number, color: string) => {
    g.beginPath();
    for (let i = 0; i < N; i++) { const t = tan(i), n = { x: -t.y, y: t.x }, w = WD[i] / 2; const q = { x: pts[i].x + n.x * w * from, y: pts[i].y + n.y * w * from }; i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }
    for (let i = N - 1; i >= 0; i--) { const t = tan(i), n = { x: -t.y, y: t.x }, w = WD[i] / 2; g.lineTo(pts[i].x + n.x * w * to, pts[i].y + n.y * w * to); }
    g.closePath(); g.fillStyle = color; g.fill();
  };
  strip(1.3, .45, "rgba(0,0,0,.42)"); strip(-.45, -1.3, "rgba(0,0,0,.42)");
  g.filter = "blur(1.6px)";
  // the lit side is whichever normal points toward the light, segment by segment
  g.beginPath();
  for (let i = 0; i < N; i++) { const t = tan(i), n = { x: -t.y, y: t.x }, w = WD[i] / 2, sd = n.x * LIGHT.x + n.y * LIGHT.y > 0 ? 1 : -1; const q = { x: pts[i].x + n.x * w * .62 * sd, y: pts[i].y + n.y * w * .62 * sd }; i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }
  for (let i = N - 1; i >= 0; i--) { const t = tan(i), n = { x: -t.y, y: t.x }, w = WD[i] / 2, sd = n.x * LIGHT.x + n.y * LIGHT.y > 0 ? 1 : -1; g.lineTo(pts[i].x + n.x * w * .12 * sd, pts[i].y + n.y * w * .12 * sd); }
  g.closePath(); g.fillStyle = "rgba(255,250,235,.3)"; g.fill();
  g.filter = "none";
  g.restore();
  outline(); g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 1; g.stroke();
  snakeHead(g, pts[0], angle, WD[0], sp, r() < .5);
}

function hood(g: CanvasRenderingContext2D, p: Pt, ang: number, sp: Species) {
  g.save(); g.translate(p.x, p.y); g.rotate(ang); g.scale(K, K);
  const gr = g.createRadialGradient(-6, -4, 2, -6, 0, 17);
  gr.addColorStop(0, mixHex(sp.body, "#ffffff", .25)); gr.addColorStop(.7, sp.body); gr.addColorStop(1, mixHex(sp.body, "#000000", .45));
  // a spread hood: widest just behind the head, narrowing back into the neck
  g.beginPath(); g.moveTo(4, -6.5);
  g.bezierCurveTo(2, -15.5, -10, -16.5, -16, -9); g.quadraticCurveTo(-21, -4, -24, 0);
  g.quadraticCurveTo(-21, 4, -16, 9); g.bezierCurveTo(-10, 16.5, 2, 15.5, 4, 6.5); g.closePath();
  g.fillStyle = gr; g.fill();
  g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = .9; g.stroke();
  // hood markings: spectacles for the spectacled cobra, chevrons for the king cobra
  if (sp.name === "Spectacled cobra") {
    g.strokeStyle = "rgba(245,230,190,.85)"; g.lineWidth = 1.6;
    g.beginPath(); g.arc(-8, -6.5, 3.4, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(-8, 6.5, 3.4, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-11.5, -3.5); g.quadraticCurveTo(-13.5, 0, -11.5, 3.5); g.stroke();
    g.fillStyle = "rgba(20,10,4,.75)"; g.beginPath(); g.arc(-8, -6.5, 1.6, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(-8, 6.5, 1.6, 0, Math.PI * 2); g.fill();
  } else {
    g.strokeStyle = "rgba(225,215,140,.6)"; g.lineWidth = 1.3;
    for (const x of [-15, -9]) { g.beginPath(); g.moveTo(x, -11); g.quadraticCurveTo(x + 4, 0, x, 11); g.stroke(); }
  }
  g.restore();
}
const mixHex = (a: string, b: string, t: number) => mix(a, b, t);

function snakeHead(g: CanvasRenderingContext2D, p: Pt, ang: number, neckPx: number, sp: Species, tongue: boolean, open = 0) {
  g.save(); g.translate(p.x, p.y); g.rotate(ang); g.scale(K, K);
  const neck = neckPx / K, viper = sp.name === "Russell's viper", hw = neck * (viper ? .78 : sp.hood ? .6 : .66), len = viper ? 17 : 15;
  if (open > 0) {
    // mouth open: cover the closed head with the throat, then draw the two jaws swung apart
    const piv = len * .12, a = open * .5;
    // the throat shows only between the two jaws
    const tip = (side: number) => { const x = len - piv, y = side * hw * .12; return { x: piv + x * Math.cos(side * a) - y * Math.sin(side * a), y: x * Math.sin(side * a) + y * Math.cos(side * a) }; };
    const up = tip(-1), lo = tip(1);
    g.beginPath(); g.moveTo(piv, 0); g.lineTo(up.x, up.y); g.quadraticCurveTo(len + hw * .2, 0, lo.x, lo.y); g.closePath();
    const th = g.createRadialGradient(piv + 1, 0, .5, piv + 2, 0, len * .9);
    th.addColorStop(0, "#2a050a"); th.addColorStop(.55, "#8e2633"); th.addColorStop(1, "#d86b7a");
    g.fillStyle = th; g.fill();
    for (const side of [-1, 1]) {
      g.save(); g.translate(piv, 0); g.rotate(side * a); g.translate(-piv, 0);
      g.beginPath();
      if (side < 0) { g.moveTo(-3, -neck * .48); g.bezierCurveTo(3, -hw * 1.05, len * .7, -hw * .9, len, -hw * .25); g.quadraticCurveTo(len + 1.5, -hw * .05, len - 1, 0); g.lineTo(-3, 0); }
      else { g.moveTo(-3, neck * .48); g.bezierCurveTo(3, hw * 1.05, len * .7, hw * .9, len, hw * .25); g.quadraticCurveTo(len + 1.5, hw * .05, len - 1, 0); g.lineTo(-3, 0); }
      g.closePath();
      const jg = g.createLinearGradient(0, side * -hw, 0, side * hw * .2);
      jg.addColorStop(0, mix(sp.head, "#000000", .35)); jg.addColorStop(.6, sp.head); jg.addColorStop(1, mix(sp.head, "#ffffff", .2));
      g.fillStyle = jg; g.fill(); g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = .7; g.stroke();
      // fangs and the eye on this jaw
      g.fillStyle = "#fbf6e8"; g.beginPath(); g.moveTo(len - 3.2, 0); g.lineTo(len - 2.4, side * -.4); g.lineTo(len - 1.6, side * 2.6); g.closePath(); g.fill();
      const ex = len * .58, ey = side * hw * .66;
      g.fillStyle = sp.eye; g.beginPath(); g.ellipse(ex, ey, 2.4, 2.1, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#050505"; g.beginPath(); g.ellipse(ex, ey, sp.pupil === "slit" ? .55 : 1.25, sp.pupil === "slit" ? 1.8 : 1.25, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.restore();
    return;
  }
  const shape = () => {
    g.beginPath(); g.moveTo(-3, -neck * .48);
    g.bezierCurveTo(3, -hw * 1.05, len * .7, -hw * (viper ? 1 : .9), len, -hw * .25);
    g.quadraticCurveTo(len + 2.2, 0, len, hw * .25);
    g.bezierCurveTo(len * .7, hw * (viper ? 1 : .9), 3, hw * 1.05, -3, neck * .48); g.closePath();
  };
  const gr = g.createRadialGradient(len * .35, -hw * .45, 1, len * .45, 0, len);
  gr.addColorStop(0, mix(sp.head, "#ffffff", .3)); gr.addColorStop(.55, sp.head); gr.addColorStop(1, mix(sp.head, "#000000", .5));
  shape(); g.fillStyle = gr; g.fill(); g.strokeStyle = "rgba(0,0,0,.55)"; g.lineWidth = .8; g.stroke();
  // head plates
  g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = .6;
  g.beginPath(); g.moveTo(len * .35, -hw * .35); g.quadraticCurveTo(len * .55, 0, len * .35, hw * .35); g.stroke();
  g.beginPath(); g.moveTo(len * .62, -hw * .25); g.quadraticCurveTo(len * .78, 0, len * .62, hw * .25); g.stroke();
  if (viper) { g.fillStyle = "rgba(60,35,15,.6)"; g.beginPath(); g.ellipse(len * .3, 0, 4, hw * .45, 0, 0, Math.PI * 2); g.fill(); }
  // eyes
  for (const s of [-1, 1]) {
    const ex = len * .58, ey = s * hw * .66;
    g.fillStyle = sp.eye; g.beginPath(); g.ellipse(ex, ey, 2.4, 2.1, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = .6; g.stroke();
    g.fillStyle = "#050505";
    if (sp.pupil === "slit") { g.beginPath(); g.ellipse(ex, ey, .55, 1.8, 0, 0, Math.PI * 2); g.fill(); }
    else { g.beginPath(); g.arc(ex, ey, 1.25, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "rgba(255,255,255,.85)"; g.beginPath(); g.arc(ex - .7, ey - .7, .55, 0, Math.PI * 2); g.fill();
  }
  // nostrils
  g.fillStyle = "rgba(0,0,0,.65)";
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(len - 1.6, s * hw * .2, .7, .45, 0, 0, Math.PI * 2); g.fill(); }
  // a flicking tongue on some snakes
  if (tongue) {
    g.strokeStyle = "#b3141c"; g.lineWidth = 1.1; g.lineCap = "round";
    g.beginPath(); g.moveTo(len + 1.5, 0); g.lineTo(len + 7, 0); g.lineTo(len + 10, -2.2); g.moveTo(len + 7, 0); g.lineTo(len + 10, 2.2); g.stroke();
  }
  g.restore();
}

/* ---------- final polish: varnish sheen and vignette ---------- */
function varnish(g: CanvasRenderingContext2D) {
  const sheen = g.createLinearGradient(0, 0, W, W);
  sheen.addColorStop(0, "rgba(255,245,220,.10)"); sheen.addColorStop(.35, "rgba(255,245,220,.02)"); sheen.addColorStop(.5, "rgba(255,245,220,.07)"); sheen.addColorStop(.62, "rgba(255,245,220,0)"); sheen.addColorStop(1, "rgba(0,0,0,.10)");
  g.fillStyle = sheen; g.fillRect(0, 0, W, W);
  const v = g.createRadialGradient(W / 2, W / 2, W * .35, W / 2, W / 2, W * .75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.28)");
  g.fillStyle = v; g.fillRect(0, 0, W, W);
}

/** Paints the static board (frame, carved squares, ladders, snakes) into `layer` at the given pixel ratio. */
export function paintBoard(layer: HTMLCanvasElement, dpr: number, woodId: WoodId = "teak") {
  const wood = WOODS[woodId] ?? WOODS.teak;
  layer.width = layer.height = Math.round(W * dpr);
  const g = layer.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  frameAndSquares(g, wood);
  Object.entries(LADDERS).forEach(([a, b]) => onLayer(g, boxOf([center(+a), center(b)], 34), (c) => ladder(c, +a, b)));
  Object.entries(SNAKES).forEach(([h, t], i) => onLayer(g, boxOf(snakePath(+h, t), 54), (c) => snake(c, +h, t, SPECIES[i % SPECIES.length], 100 + i)));
  varnish(g);
  numbers(g);
}

/* ---------- moving parts drawn over the board during animations ---------- */
/** The snake at `head` with its mouth open (0 = closed, 1 = wide). */
export function paintSnakeMouth(g: CanvasRenderingContext2D, head: number, open: number) {
  const tail = SNAKES[head]; if (!tail) return;
  const sp = speciesOf(head), gm = geom(head, tail);
  if (sp.hood) hood(g, gm.pts[0], gm.angle, sp);
  snakeHead(g, gm.pts[0], gm.angle, gm.WD[0], sp, false, Math.max(0.001, open));
}
/** A swallowed pawn as a bulge travelling down the snake's body (`k` 0 = at the head, 1 = at the tail). */
export function paintSnakeBulge(g: CanvasRenderingContext2D, head: number, k: number, color: string) {
  const tail = SNAKES[head]; if (!tail) return;
  const sp = speciesOf(head), gm = geom(head, tail), a = gm.at(Math.min(gm.total - 1, Math.max(4, k * gm.total)));
  if (!a) return;
  const ang = Math.atan2(a.t.y, a.t.x), rw = Math.max(a.w * .7, 8.5), rl = rw * 1.85;
  g.save(); g.translate(a.p.x, a.p.y); g.rotate(ang);
  g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(3, 4, rl, rw, 0, 0, Math.PI * 2); g.fill();
  const gr = g.createRadialGradient(-rl * .25, -rw * .45, 1, 0, 0, rl);
  gr.addColorStop(0, mix(sp.body, "#ffffff", .45)); gr.addColorStop(.5, mix(sp.body, color, .22)); gr.addColorStop(1, mix(sp.body, "#000000", .45));
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, rl, rw, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = .8; g.stroke();
  g.restore();
}
/** Points a pawn steps through while climbing: each rung from the bottom, then the top square. */
export function ladderSteps(a: number, b: number, rungs: number): Pt[] {
  const p1 = center(a), p2 = center(b), out: Pt[] = [];
  for (let i = 1; i <= rungs; i++) { const k = i / rungs; out.push({ x: p1.x + (p2.x - p1.x) * k, y: p1.y + (p2.y - p1.y) * k }); }
  return out;
}

/** A polished playing piece: a glossy enamel dome on a brass base, with its shadow. */
export function paintToken(g: CanvasRenderingContext2D, p: Pt, color: string, label: string, active: boolean, scale = 1) {
  if (scale <= 0.02) return;
  const r = 15.5 * scale;
  g.save(); g.filter = "blur(2.5px)"; g.fillStyle = "rgba(0,0,0,.5)"; g.beginPath(); g.ellipse(p.x + 4, p.y + 6, r, r * .75, 0, 0, Math.PI * 2); g.fill(); g.restore();
  if (active) { g.strokeStyle = "rgba(255,228,150,.95)"; g.lineWidth = 2.5; g.beginPath(); g.arc(p.x, p.y, r + 5, 0, Math.PI * 2); g.stroke(); }
  const brass = g.createRadialGradient(p.x - 5, p.y - 6, 2, p.x, p.y, r);
  brass.addColorStop(0, "#fff4c8"); brass.addColorStop(.5, "#d6a743"); brass.addColorStop(1, "#6e4c10");
  g.fillStyle = brass; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
  const dome = g.createRadialGradient(p.x - 3.5, p.y - 4.5, 1, p.x, p.y, r * .77);
  dome.addColorStop(0, mix(color, "#ffffff", .55)); dome.addColorStop(.45, color); dome.addColorStop(1, mix(color, "#000000", .45));
  g.fillStyle = dome; g.beginPath(); g.arc(p.x, p.y, r * .77, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(255,255,255,.65)"; g.beginPath(); g.ellipse(p.x - r * .24, p.y - r * .3, r * .24, r * .14, -.6, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(255,255,255,.95)"; g.font = `800 ${Math.round(12 * scale)}px 'DM Sans', sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(label, p.x, p.y + 1.5); g.textBaseline = "alphabetic";
}
