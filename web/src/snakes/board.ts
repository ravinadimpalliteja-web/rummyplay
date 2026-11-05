import { LADDERS, SNAKES } from "./engine";

/* The board is drawn on a 644 x 644 logical canvas: a raised wooden rim (PAD) with a gold inlay around 10 x 10 raised wooden
   squares of 60, numbered in a zigzag from the bottom left. Everything is painted in code (no image files), so it stays sharp
   at any size. The screen tilts this flat picture in 3D (see view3d.ts); tokens are drawn upright on top of it. */
export const PAD = 22, S = 60, W = S * 10 + PAD * 2;
/** How deep the board is (its front edge), in board units. */
export const THICK = 26;
const K = 1.45;                                    // snake size: bodies, heads and markings are drawn this much larger than before
export type Pt = { x: number; y: number };

/* ---------- woods ---------- */
export type WoodId = "maple" | "teak" | "rosewood" | "walnut" | "sheesham";
/* tileA / tileB: the two alternating square woods; ink / inkEdge: number colour and its outline (dark on light woods). */
type Wood = { name: string; base: string; light: string; dark: string; grain: string; contrast: number; frame: string; tileA: string; tileB: string; ink: string; inkEdge: string };
export const WOODS: Record<WoodId, Wood> = {
  maple: { name: "Golden oak", base: "#b8783c", light: "#e2b878", dark: "#7a4519", grain: "#4e2a0c", contrast: .8, frame: "#6a3512", tileA: "#f0bd70", tileB: "#cc8640", ink: "#2b1405", inkEdge: "rgba(255,244,220,.92)" },
  teak: { name: "Teak", base: "#a8692f", light: "#c98b4a", dark: "#73421a", grain: "#4a2a0e", contrast: .9, frame: "#7a4518", tileA: "#d9a465", tileB: "#a86a30", ink: "#25110a", inkEdge: "rgba(255,240,214,.9)" },
  rosewood: { name: "Rosewood", base: "#6f2b1d", light: "#8f4029", dark: "#40150c", grain: "#260905", contrast: .9, frame: "#4a170e", tileA: "#a95c41", tileB: "#7a3424", ink: "#fff4dc", inkEdge: "rgba(30,8,2,.92)" },
  walnut: { name: "Walnut", base: "#5b3c27", light: "#7c5538", dark: "#33200f", grain: "#1c1007", contrast: .85, frame: "#3a2414", tileA: "#97704f", tileB: "#684632", ink: "#fff4dc", inkEdge: "rgba(20,10,2,.92)" },
  sheesham: { name: "Sheesham", base: "#8c5a33", light: "#c99360", dark: "#4b2a13", grain: "#2c1609", contrast: 1.1, frame: "#5a3418", tileA: "#d6a46e", tileB: "#9c6438", ink: "#24110a", inkEdge: "rgba(255,240,214,.9)" },
};
export const WOOD_IDS = Object.keys(WOODS) as WoodId[];

export const center = (n: number): Pt => {
  const row = Math.floor((n - 1) / 10);
  let col = (n - 1) % 10;
  if (row % 2) col = 9 - col;
  return { x: PAD + col * S + S / 2, y: PAD + (9 - row) * S + S / 2 };
};
/** Where a token stands on square n when it is alone: right of and below the middle, clear of the square's number. */
export const spot = (n: number): Pt => { const c = center(n); return { x: c.x + 17, y: c.y + 15 }; };
/** Where tokens stand when 2 to 4 share a square: a row along the bottom of the square, smaller, still clear of the number. */
export const SHARED: Record<number, { pts: [number, number][]; s: number }> = {
  2: { pts: [[-7, 22], [15, 22]], s: .62 }, 3: { pts: [[-15, 19], [3, 19], [21, 19]], s: .55 }, 4: { pts: [[-21, 17], [-6, 17], [9, 17], [24, 17]], s: .46 },
};
/** On the WebGL 3D board (numbers at the front-left of each square, tokens standing upright): a lone token stands at the
    back-right of its square; 2 to 4 tokens stand smaller in a row across the middle, so none hides a number or another token. */
export const spot3D = (n: number): Pt => { const c = center(n); return { x: c.x + 21, y: c.y - 13 }; };
export const SHARED3D: Record<number, { pts: [number, number][]; s: number }> = {
  2: { pts: [[-10, -4], [18, -4]], s: .5 }, 3: { pts: [[-17, -4], [2, -4], [21, -4]], s: .46 }, 4: { pts: [[-20, -4], [-5, -4], [10, -4], [25, -4]], s: .4 },
};
/** Where a token waits before entering (on the rim, just left of square 1). */
export const OFF: Pt = { x: PAD * .4, y: center(1).y + 15 };

/** Centre line of a snake from head to tail; also the path a token slides down. */
/** Each snake's planned route (board units, head first): worked out once so its body goes around every ladder
    (a path search over the board, then checked by layoutIssues() and a server test). The curve below smooths it. */
export const SNAKE_WAYPOINTS: Record<number, [number, number][]> = {
  49: [[538, 358], [538, 478], [418, 598]],
  60: [[58, 298], [58, 478], [118, 538]],
  64: [[238, 238], [250, 250], [250, 526], [238, 538]],
  73: [[478, 178], [598, 298]],
  82: [[118, 118], [214, 214], [214, 358], [202, 370]],
  93: [[478, 58], [452, 135], [440, 215], [385, 240], [352, 285]],
  98: [[178, 58], [286, 166], [286, 322], [250, 358], [238, 358]],
};
/** How far a snake's body swings either side of its route (board units). */
export const SNAKE_WAVE = 5;
/** Centre line of a snake from head to tail: a smooth curve through its route with a gentle S-wave (also the path a
    swallowed token slides down). Falls back to a straight route between the two squares. */
export function snakePath(head: number, tail: number): Pt[] {
  const raw = SNAKE_WAYPOINTS[head] ?? [[center(head).x, center(head).y], [center(tail).x, center(tail).y]];
  const wp = raw.map(([x, y]) => ({ x, y }));
  const cat = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number) => {
    const t2 = t * t, t3 = t2 * t, f = (a: number, b: number, c: number, d: number) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
  };
  const dense: Pt[] = [];
  for (let i = 0; i < wp.length - 1; i++) for (let j = 0; j < 30; j++) dense.push(cat(wp[Math.max(0, i - 1)], wp[i], wp[i + 1], wp[Math.min(wp.length - 1, i + 2)], j / 30));
  dense.push(wp[wp.length - 1]);
  const len = [0]; for (let i = 1; i < dense.length; i++) len.push(len[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
  const total = len[len.length - 1], N = 120, out: Pt[] = [], waves = Math.max(2, Math.round(total / 70));
  let j = 1;
  for (let i = 0; i <= N; i++) {
    const sd = (i / N) * total; while (j < dense.length - 1 && len[j] < sd) j++;
    const f = (sd - len[j - 1]) / ((len[j] - len[j - 1]) || 1), a = dense[j - 1], b = dense[j];
    const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const k = i / N, w = Math.sin(k * Math.PI * waves) * SNAKE_WAVE * Math.sin(Math.min(1, k * 1.1) * Math.PI);
    out.push({ x: x - ((b.y - a.y) / tl) * w, y: y + ((b.x - a.x) / tl) * w });
  }
  return out;
}
/** Checks the layout: no snake body touches a ladder, and every snake stays on the board. Returns the problems found
    (empty when all is well). Widths are the widest drawn (the 3D board): snake 11.4, ladder 18 either side of its line. */
export function layoutIssues(snakeHalf = 11.4, ladderHalf = 18): string[] {
  const issues = new Set<string>();
  const segD = (p: Pt, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
  for (const [h, t] of Object.entries(SNAKES)) {
    const pts = snakePath(+h, t);
    for (const p of pts) {
      for (const [a, b] of Object.entries(LADDERS)) if (segD(p, center(+a), center(b)) < snakeHalf + ladderHalf) issues.add(`snake ${h}-${t} touches ladder ${a}-${b}`);
      if (p.x - snakeHalf < PAD || p.x + snakeHalf > W - PAD || p.y - snakeHalf < PAD || p.y + snakeHalf > W - PAD) issues.add(`snake ${h}-${t} leaves the board`);
    }
  }
  return [...issues];
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
function grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wood: Wood, seed: number, vertical = false, knotChance = .7) {
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
  const knots = r() < knotChance ? 1 + Math.floor(r() * 2) : 0;
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
const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
};
const poly = (g: CanvasRenderingContext2D, pts: number[][], fill: string) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };

/** One raised wooden square: its own grain, a lit top-left bevel, a shaded bottom-right bevel and a soft dome sheen. */
function tile(g: CanvasRenderingContext2D, x: number, y: number, s: number, wood: Wood, base: string, seed: number, vertical: boolean) {
  const tw = { ...wood, base, light: mix(base, "#ffdca6", .32), dark: mix(base, "#7a3a0c", .32), grain: mix(wood.grain, "#8a4a14", .35), contrast: wood.contrast * .62 };
  g.save(); rr(g, x, y, s, s, 3.4); g.clip();
  grain(g, x, y, s, s, tw, seed, vertical, .1);
  const b = 4.4;
  poly(g, [[x, y], [x + s, y], [x + s - b, y + b], [x + b, y + b]], "rgba(255,236,196,.5)");
  poly(g, [[x, y], [x + b, y + b], [x + b, y + s - b], [x, y + s]], "rgba(255,236,196,.3)");
  poly(g, [[x, y + s], [x + b, y + s - b], [x + s - b, y + s - b], [x + s, y + s]], "rgba(45,18,3,.45)");
  poly(g, [[x + s, y], [x + s, y + s], [x + s - b, y + s - b], [x + s - b, y + b]], "rgba(45,18,3,.32)");
  const sh = g.createRadialGradient(x + s * .34, y + s * .28, 2, x + s * .5, y + s * .5, s * .78);
  sh.addColorStop(0, "rgba(255,240,205,.16)"); sh.addColorStop(.6, "rgba(255,240,205,0)"); sh.addColorStop(1, "rgba(20,8,0,.1)");
  g.fillStyle = sh; g.fillRect(x, y, s, s);
  g.restore();
}

function frameAndSquares(g: CanvasRenderingContext2D, wood: Wood) {
  // rim: four mitred planks, grain running along each
  const fw = { ...wood, base: wood.frame, light: mix(wood.frame, wood.light, .5), dark: wood.dark };
  grain(g, 0, 0, W, PAD, fw, 11);
  grain(g, 0, W - PAD, W, PAD, fw, 12);
  grain(g, 0, 0, PAD, W, fw, 13, true);
  grain(g, W - PAD, 0, PAD, W, fw, 14, true);
  g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1;
  for (const [a, b, c, d] of [[0, 0, PAD, PAD], [W, 0, W - PAD, PAD], [0, W, PAD, W - PAD], [W, W, W - PAD, W - PAD]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
  const line = (x1: number, y1: number, x2: number, y2: number, c: string, w: number) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  // rounded rim: a lit outer edge and a soft roll toward the squares
  line(1.5, 1.5, W - 1.5, 1.5, "rgba(255,238,205,.45)", 3); line(1.5, 1.5, 1.5, W - 1.5, "rgba(255,238,205,.3)", 3);
  line(1, W - 1, W - 1, W - 1, "rgba(0,0,0,.5)", 2); line(W - 1, 1, W - 1, W - 1, "rgba(0,0,0,.45)", 2);
  const roll = g.createLinearGradient(0, 0, 0, PAD);
  roll.addColorStop(0, "rgba(255,240,210,.18)"); roll.addColorStop(.5, "rgba(255,240,210,0)"); roll.addColorStop(1, "rgba(0,0,0,.25)");
  g.fillStyle = roll; g.fillRect(0, 0, W, PAD);
  // gold inlay, just inside the rim (Royal Club gold)
  const gold = g.createLinearGradient(0, 0, W, W);
  gold.addColorStop(0, "#fff0b8"); gold.addColorStop(.3, "#d9aa4a"); gold.addColorStop(.55, "#f6dc8e"); gold.addColorStop(1, "#9c6f22");
  g.strokeStyle = gold; g.lineWidth = 2.4; g.strokeRect(PAD - 7, PAD - 7, S * 10 + 14, S * 10 + 14);
  g.strokeStyle = "rgba(40,18,0,.55)"; g.lineWidth = .8; g.strokeRect(PAD - 5.4, PAD - 5.4, S * 10 + 10.8, S * 10 + 10.8);
  // the well the squares sit in: a dark groove between every square
  g.fillStyle = "#2a1407"; g.fillRect(PAD - 1.5, PAD - 1.5, S * 10 + 3, S * 10 + 3);
  const inner = g.createLinearGradient(0, PAD, 0, W - PAD);
  inner.addColorStop(0, "rgba(0,0,0,.35)"); inner.addColorStop(1, "rgba(0,0,0,0)");
  // raised squares in two alternating woods, grain turned on alternate squares like parquet
  for (let n = 1; n <= 100; n++) {
    const p = center(n), row = Math.floor((n - 1) / 10), col = (n - 1) % 10, gap = 1.3;
    tile(g, p.x - S / 2 + gap, p.y - S / 2 + gap, S - gap * 2, wood, (row + col) % 2 ? wood.tileB : wood.tileA, 1000 + n * 7, (row + col) % 2 === 1);
  }
  // square 100: a warm gold glow and a chequered finish flag
  const m = center(100);
  const halo = g.createRadialGradient(m.x + 6, m.y + 4, 3, m.x, m.y, 40);
  halo.addColorStop(0, "rgba(255,214,120,.55)"); halo.addColorStop(1, "rgba(255,214,120,0)");
  g.fillStyle = halo; g.fillRect(m.x - S / 2 + 1, m.y - S / 2 + 1, S - 2, S - 2);
  flag(g, m.x + 12, m.y - 18);
  // square 1: a green START plaque
  start(g, center(1));
}

/** A small chequered finish flag on a gold pole. */
function flag(g: CanvasRenderingContext2D, x: number, y: number) {
  g.save();
  g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(x + 2, y + 34, 5, 2, 0, 0, Math.PI * 2); g.fill();
  const pole = g.createLinearGradient(x - 1.5, 0, x + 1.5, 0); pole.addColorStop(0, "#fff0b8"); pole.addColorStop(1, "#9c6f22");
  g.fillStyle = pole; g.fillRect(x - 1.3, y, 2.6, 34);
  const c = 4.2;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const wave = Math.sin(i * .9) * 1.4;
    g.fillStyle = (i + j) % 2 ? "#151515" : "#fbf8f0"; g.fillRect(x + 1.3 + i * c, y + 1 + j * c + wave, c + .3, c + .3);
  }
  g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = .6; g.strokeRect(x + 1.3, y + 1, c * 4, c * 3 + 1.4);
  g.fillStyle = "#ffe08a"; g.beginPath(); g.arc(x, y, 2.3, 0, Math.PI * 2); g.fill();
  g.restore();
}
/** The START plaque on square 1: green enamel framed in gold, with an arrow. */
function start(g: CanvasRenderingContext2D, p: Pt, atTop = false) {
  const x = p.x - S / 2 + 4, y = atTop ? p.y - S / 2 + 5 : p.y + 6, w = S - 8, h = 19;
  g.save();
  g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 3; g.shadowOffsetY = 1.5;
  rr(g, x, y, w, h, 4); const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, "#1f8a5b"); gr.addColorStop(1, "#0b4a31"); g.fillStyle = gr; g.fill();
  g.shadowColor = "transparent"; g.strokeStyle = "#e9c877"; g.lineWidth = 1.4; g.stroke();
  g.fillStyle = "#ffe9a8"; g.font = "800 10.5px 'DM Sans', system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("START", p.x + 4, y + h / 2 + .5);
  g.strokeStyle = "#ffe9a8"; g.lineWidth = 1.6; g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath(); g.moveTo(x + 4, y + h / 2); g.lineTo(x + 11, y + h / 2); g.moveTo(x + 8.5, y + h / 2 - 3); g.lineTo(x + 11, y + h / 2); g.lineTo(x + 8.5, y + h / 2 + 3); g.stroke();
  g.restore();
}

/** Square numbers, drawn last so snakes and ladders never hide them: bold figures in the top-left corner of each square,
    dark on light woods (ivory on dark woods), with an outline so they stay clear where a snake or ladder crosses. */
export const NUM_FONT = "800 20px 'DM Sans', system-ui, sans-serif";
export const numberAt = (n: number): Pt => { const p = center(n); return { x: p.x - S / 2 + 4, y: p.y - S / 2 + 22 }; };
/** On the WebGL 3D board numbers sit at the front-left of each square (nearest the players), so a token standing
    toward the back of its square never hides one. */
export const NUM_FONT_3D = "800 22px 'DM Sans', system-ui, sans-serif";
export const numberAt3D = (n: number): Pt => { const p = center(n); return { x: p.x - S / 2 + 4, y: p.y + S / 2 - 6 }; };
function numbers(g: CanvasRenderingContext2D, wood: Wood, front = false) {
  g.save();
  g.textAlign = "left"; g.textBaseline = "alphabetic"; g.lineJoin = "round"; g.font = front ? NUM_FONT_3D : NUM_FONT;
  for (let n = 1; n <= 100; n++) {
    const { x, y } = (front ? numberAt3D : numberAt)(n), t = String(n);
    g.lineWidth = 4; g.strokeStyle = wood.inkEdge; g.strokeText(t, x, y);
    g.fillStyle = wood.ink; g.fillText(t, x, y);
  }
  g.restore();
}

/* ---------- ladders: round wooden rails and rungs, casting shadows on the board ---------- */
function ladder(g: CanvasRenderingContext2D, a: number, b: number) {
  const p1 = center(a), p2 = center(b), dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, half = 14;
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
  g.save(); g.filter = "blur(3.5px)"; g.strokeStyle = "rgba(0,0,0,.45)"; g.lineCap = "round";
  for (const s of [1, -1]) { g.beginPath(); g.moveTo(s1.x + nx * half * s + 6, s1.y + ny * half * s + 9); g.lineTo(s2.x + nx * half * s + 6, s2.y + ny * half * s + 9); g.lineWidth = 9; g.stroke(); }
  for (let i = 1; i < rungs; i++) { const k = i / rungs, x = p1.x + dx * k + 6, y = p1.y + dy * k + 9; g.beginPath(); g.moveTo(x + nx * half, y + ny * half); g.lineTo(x - nx * half, y - ny * half); g.lineWidth = 5.5; g.stroke(); }
  g.restore();
  for (let i = 1; i < rungs; i++) {
    const k = i / rungs, x = p1.x + dx * k, y = p1.y + dy * k;
    cylinder(x + nx * half, y + ny * half, x - nx * half, y - ny * half, 3.1, "#c78b45", "#f4d196", "#6b4318");
  }
  for (const s of [1, -1]) cylinder(s1.x + nx * half * s, s1.y + ny * half * s, s2.x + nx * half * s, s2.y + ny * half * s, 4.6, "#b8782f", "#f2c882", "#5a3210");
  for (let i = 1; i < rungs; i++) {                                     // wooden pegs where rungs meet rails
    const k = i / rungs, x = p1.x + dx * k, y = p1.y + dy * k;
    for (const s of [1, -1]) { g.fillStyle = "#4a2a0c"; g.beginPath(); g.arc(x + nx * half * s, y + ny * half * s, 1.6, 0, Math.PI * 2); g.fill(); g.fillStyle = "rgba(255,230,180,.5)"; g.beginPath(); g.arc(x + nx * half * s - .5, y + ny * half * s - .5, .6, 0, Math.PI * 2); g.fill(); }
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
/* Friendly, glossy snakes in clear colours, each with its own pattern. Cycled over the board's snakes in order. */
export const SPECIES: Species[] = [
  { name: "Emerald", body: "#3c9a30", belly: "#dcf08e", head: "#46a83a", eye: "#ffd94a", pupil: "round", hood: false,
    mark: (c) => each(c, 12, 13, 14, (s) => { blot(c, s, .38, 2.6, 2.1, "#2a7420", "rgba(0,0,0,0)", 0); blot(c, s + 6.5 * c.k, -.38, 2.6, 2.1, "#2a7420", "rgba(0,0,0,0)", 0); }) },
  { name: "Ruby", body: "#cc3428", belly: "#ffe3a6", head: "#d5402f", eye: "#ffe07a", pupil: "round", hood: false,
    mark: (c) => each(c, 13, 15, 10, (s) => band(c, s, 3.4, "rgba(246,196,58,.95)")) },
  { name: "Sapphire", body: "#2c69cc", belly: "#cfe7ff", head: "#3577dc", eye: "#ffe07a", pupil: "round", hood: false,
    mark: (c) => each(c, 11, 14, 12, (s) => blot(c, s, 0, 4.4, 3.4, "rgba(150,205,255,.85)", "rgba(15,50,120,.6)", .8)) },
  { name: "Amethyst", body: "#8644c4", belly: "#f3d4ff", head: "#904ecf", eye: "#ffe07a", pupil: "round", hood: false,
    mark: (c) => each(c, 12, 12, 12, (s) => { blot(c, s, .42, 2.2, 2, "#e7a6ff", "rgba(0,0,0,0)", 0); blot(c, s + 6 * c.k, -.42, 2.2, 2, "#e7a6ff", "rgba(0,0,0,0)", 0); }) },
  { name: "Tiger", body: "#e2862a", belly: "#ffeab8", head: "#e99234", eye: "#fff1a8", pupil: "round", hood: false,
    mark: (c) => each(c, 14, 11, 10, (s) => band(c, s, 2.3, "rgba(70,36,8,.85)")) },
  { name: "Jade", body: "#1d9c8b", belly: "#d4f7eb", head: "#24a895", eye: "#ffe07a", pupil: "round", hood: false,
    mark: (c) => each(c, 14, 15, 10, (s) => { band(c, s, 1.5, "rgba(10,90,78,.9)"); band(c, s + 3.6 * c.k, 1.5, "rgba(10,90,78,.9)"); }) },
];
export const speciesOf = (head: number) => SPECIES[Math.max(0, Object.keys(SNAKES).indexOf(String(head))) % SPECIES.length];

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
  g.beginPath(); g.ellipse(pts[0].x + Math.cos(angle) * 8 * K, pts[0].y + Math.sin(angle) * 8 * K, 11 * K, 9 * K, angle, 0, Math.PI * 2); g.fill(); g.restore();
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
  g.closePath(); g.fillStyle = "rgba(255,252,240,.4)"; g.fill();
  // a crisp specular streak along the lit side
  g.filter = "blur(.6px)"; g.lineWidth = 1.3; g.strokeStyle = "rgba(255,255,255,.45)"; g.lineCap = "round"; g.beginPath();
  for (let i = 3; i < N * .8; i++) { const t = tan(i), n = { x: -t.y, y: t.x }, w = WD[i] / 2, sd = n.x * LIGHT.x + n.y * LIGHT.y > 0 ? 1 : -1; const q = { x: pts[i].x + n.x * w * .45 * sd, y: pts[i].y + n.y * w * .45 * sd }; i > 3 ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }
  g.stroke();
  g.filter = "none";
  g.restore();
  outline(); g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 1; g.stroke();
  snakeHead(g, pts[0], angle, WD[0], sp, r() < .7);
}

const mixHex = (a: string, b: string, t: number) => mix(a, b, t);

/** A friendly eye: white, a coloured iris, a round pupil and a bright catch-light. */
function eye(g: CanvasRenderingContext2D, x: number, y: number, sp: Species) {
  g.fillStyle = "#fffdf6"; g.beginPath(); g.ellipse(x, y, 3.3, 3, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(0,0,0,.55)"; g.lineWidth = .6; g.stroke();
  g.fillStyle = sp.eye; g.beginPath(); g.arc(x + .5, y, 2.1, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#0b0b0b"; g.beginPath(); g.arc(x + .7, y, 1.35, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#ffffff"; g.beginPath(); g.arc(x - .1, y - .8, .7, 0, Math.PI * 2); g.fill();
}

/** A rounded, friendly head with big eyes (closed), or the two jaws swung apart with the throat showing (`open` > 0). */
function snakeHead(g: CanvasRenderingContext2D, p: Pt, ang: number, neckPx: number, sp: Species, tongue: boolean, open = 0) {
  g.save(); g.translate(p.x, p.y); g.rotate(ang); g.scale(K, K);
  const neck = neckPx / K, hw = neck * .8, len = 16;
  if (open > 0) {
    const piv = len * .12, a = open * .5;
    const tip = (side: number) => { const x = len - piv, y = side * hw * .12; return { x: piv + x * Math.cos(side * a) - y * Math.sin(side * a), y: x * Math.sin(side * a) + y * Math.cos(side * a) }; };
    const up = tip(-1), lo = tip(1);
    g.beginPath(); g.moveTo(piv, 0); g.lineTo(up.x, up.y); g.quadraticCurveTo(len + hw * .2, 0, lo.x, lo.y); g.closePath();
    const th = g.createRadialGradient(piv + 1, 0, .5, piv + 2, 0, len * .9);
    th.addColorStop(0, "#3a070d"); th.addColorStop(.55, "#b23345"); th.addColorStop(1, "#f08a98");
    g.fillStyle = th; g.fill();
    for (const side of [-1, 1]) {
      g.save(); g.translate(piv, 0); g.rotate(side * a); g.translate(-piv, 0);
      g.beginPath(); g.moveTo(-3, side * neck * .48); g.bezierCurveTo(3, side * hw * 1.1, len * .72, side * hw, len, side * hw * .3); g.quadraticCurveTo(len + 1.8, side * hw * .05, len - 1, 0); g.lineTo(-3, 0); g.closePath();
      const jg = g.createLinearGradient(0, side * -hw, 0, side * hw * .2);
      jg.addColorStop(0, mix(sp.head, "#000000", .3)); jg.addColorStop(.6, sp.head); jg.addColorStop(1, mix(sp.head, "#ffffff", .25));
      g.fillStyle = jg; g.fill(); g.strokeStyle = "rgba(0,0,0,.55)"; g.lineWidth = .7; g.stroke();
      eye(g, len * .5, side * hw * .62, sp);
      g.restore();
    }
    g.restore();
    return;
  }
  const shape = () => {
    g.beginPath(); g.moveTo(-3, -neck * .48);
    g.bezierCurveTo(2, -hw * 1.15, len * .78, -hw * 1.02, len, -hw * .32);
    g.quadraticCurveTo(len + 2.6, 0, len, hw * .32);
    g.bezierCurveTo(len * .78, hw * 1.02, 2, hw * 1.15, -3, neck * .48); g.closePath();
  };
  const gr = g.createRadialGradient(len * .38, -hw * .4, 1, len * .45, 0, len * 1.05);
  gr.addColorStop(0, mix(sp.head, "#ffffff", .42)); gr.addColorStop(.5, sp.head); gr.addColorStop(1, mix(sp.head, "#000000", .42));
  shape(); g.fillStyle = gr; g.fill(); g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = .8; g.stroke();
  // pale chin and a gentle smile
  g.save(); shape(); g.clip(); g.fillStyle = rgba(sp.belly, .45); g.beginPath(); g.ellipse(len * .55, 0, len * .42, hw * .28, 0, 0, Math.PI * 2); g.fill(); g.restore();
  g.strokeStyle = "rgba(40,10,5,.55)"; g.lineWidth = .7; g.lineCap = "round";
  g.beginPath(); g.moveTo(len * .55, -hw * .22); g.quadraticCurveTo(len * .95, 0, len * .55, hw * .22); g.stroke();
  // big eyes on top of the head
  for (const s of [-1, 1]) eye(g, len * .46, s * hw * .62, sp);
  // nostrils
  g.fillStyle = "rgba(0,0,0,.6)";
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(len - 1.4, s * hw * .18, .65, .42, 0, 0, Math.PI * 2); g.fill(); }
  // gloss on the crown of the head
  g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.ellipse(len * .25, -hw * .35, 3.6, 1.4, -.25, 0, Math.PI * 2); g.fill();
  if (tongue) {
    g.strokeStyle = "#d61f2c"; g.lineWidth = 1.15; g.lineCap = "round";
    g.beginPath(); g.moveTo(len + 1.6, 0); g.lineTo(len + 6.5, 0); g.lineTo(len + 9.2, -2); g.moveTo(len + 6.5, 0); g.lineTo(len + 9.2, 2); g.stroke();
  }
  g.restore();
}

/* ---------- final polish: varnish sheen and vignette ---------- */
function varnish(g: CanvasRenderingContext2D) {
  const sheen = g.createLinearGradient(0, 0, W, W);
  sheen.addColorStop(0, "rgba(255,245,220,.10)"); sheen.addColorStop(.35, "rgba(255,245,220,.02)"); sheen.addColorStop(.5, "rgba(255,245,220,.07)"); sheen.addColorStop(.62, "rgba(255,245,220,0)"); sheen.addColorStop(1, "rgba(0,0,0,.10)");
  g.fillStyle = sheen; g.fillRect(0, 0, W, W);
  const v = g.createRadialGradient(W / 2, W / 2, W * .35, W / 2, W / 2, W * .75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.16)");
  g.fillStyle = v; g.fillRect(0, 0, W, W);
}

/** Paints the static board (frame, carved squares, ladders, snakes) into `layer` at the given pixel ratio. */
export function paintBoard(layer: HTMLCanvasElement, dpr: number, woodId: WoodId = "maple") {
  const wood = WOODS[woodId] ?? WOODS.maple;
  layer.width = layer.height = Math.round(W * dpr);
  const g = layer.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  frameAndSquares(g, wood);
  Object.entries(LADDERS).forEach(([a, b]) => onLayer(g, boxOf([center(+a), center(b)], 34), (c) => ladder(c, +a, b)));
  Object.entries(SNAKES).forEach(([h, t], i) => onLayer(g, boxOf(snakePath(+h, t), 54), (c) => snake(c, +h, t, SPECIES[i % SPECIES.length], 100 + i)));
  varnish(g);
  numbers(g, wood);
}

/* ---------- moving parts drawn over the board during animations ---------- */
/** The snake at `head` with its mouth open (0 = closed, 1 = wide). */
export function paintSnakeMouth(g: CanvasRenderingContext2D, head: number, open: number) {
  const tail = SNAKES[head]; if (!tail) return;
  const sp = speciesOf(head), gm = geom(head, tail);
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
  out[out.length - 1] = spot(b);                                          // step off the top rung onto the square
  return out;
}

/** A player's token standing upright on the (possibly tilted) board, drawn in screen pixels.
    (x, y): where its stand touches the board; u: screen px per board unit there; sq: how flat the board looks there (1 = face on).
    A contact shadow and a ring in the player's colour sit on the board; the active player's token also gets a gold glow.
    `lift` raises the token off the board (hops), in board units. Until `img` has loaded a plain disc is drawn. */
/** Height of a standing token, in board units (a square is 60). */
export const PIECE_H = 52;
export function paintPiece(g: CanvasRenderingContext2D, x: number, y: number, u: number, sq: number, ring: string, img: HTMLImageElement | null, active: boolean, scale = 1, lift = 0) {
  if (scale <= 0.02) return;
  const k = u * scale, h = PIECE_H * k, w = h * (100 / 120), top = y - lift * u;
  g.save();
  g.fillStyle = `rgba(0,0,0,${(.45 * Math.max(.3, 1 - lift / 26)).toFixed(3)})`;
  g.beginPath(); g.ellipse(x + 2 * k, y + 1.2 * k, 15.5 * k * (1 - Math.min(.3, lift / 60)), 15.5 * k * sq, 0, 0, Math.PI * 2); g.fill();
  if (active) {
    g.strokeStyle = "rgba(255,226,140,.95)"; g.lineWidth = 2.6 * u; g.shadowColor = "rgba(255,206,100,.95)"; g.shadowBlur = 10 * u;
    g.beginPath(); g.ellipse(x, y, 19.5 * k, 19.5 * k * sq, 0, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0;
  }
  g.strokeStyle = ring; g.lineWidth = 2.6 * k; g.beginPath(); g.ellipse(x, y, 15 * k, 15 * k * sq, 0, 0, Math.PI * 2); g.stroke();
  if (img && img.complete && img.naturalWidth) g.drawImage(img, x - w / 2, top - h * (106 / 120), w, h);
  else { g.fillStyle = ring; g.beginPath(); g.arc(x, top - 12 * k, 12 * k, 0, Math.PI * 2); g.fill(); g.strokeStyle = "#fffaf0"; g.lineWidth = 2 * u; g.stroke(); }
  g.restore();
}

type ProjFn = (x: number, y: number, z?: number) => { x: number; y: number; u: number };
/** What sits under and around the tilted board: its shadow on the table, the board's front and side edges, and palm leaves at the corners. */
export function paintBase(g: CanvasRenderingContext2D, P: ProjFn, woodId: WoodId) {
  const wood = WOODS[woodId] ?? WOODS.maple, T = THICK;
  const q = (pts: { x: number; y: number }[]) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
  const c0 = P(0, 0, -T), c1 = P(W, 0, -T), c2 = P(W, W, -T), c3 = P(0, W, -T), u = P(W / 2, W, 0).u;
  // soft shadow on the table
  g.save(); g.filter = `blur(${Math.round(16 * u)}px)`; g.fillStyle = "rgba(0,0,0,.6)";
  q([c0, c1, c2, c3].map(p => ({ x: p.x, y: p.y + 14 * u }))); g.fill(); g.restore();
  g.save(); g.filter = `blur(${Math.round(4 * u)}px)`; g.fillStyle = "rgba(0,0,0,.55)"; q([c0, c1, c2, c3].map(p => ({ x: p.x, y: p.y + 3 * u }))); g.fill(); g.restore();
  // side and front edges of the board (only the ones facing us)
  const faces: [{ x: number; y: number }[], number][] = [
    [[P(0, 0, 0), P(0, W, 0), c3, c0], .62], [[P(W, W, 0), P(W, 0, 0), c1, c2], .62], [[P(0, W, 0), P(W, W, 0), c2, c3], 1],
  ];
  for (const [pts, light] of faces) {
    const area = (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) - (pts[1].y - pts[0].y) * (pts[2].x - pts[0].x);
    if (area <= 0.5) continue;
    const gr = g.createLinearGradient(0, Math.min(pts[0].y, pts[1].y), 0, Math.max(pts[2].y, pts[3].y));
    gr.addColorStop(0, mix(wood.frame, wood.light, .35 * light)); gr.addColorStop(.25, mix(wood.frame, "#000000", .1 + (1 - light) * .3)); gr.addColorStop(1, mix(wood.frame, "#000000", .55));
    q(pts); g.fillStyle = gr; g.fill();
    // grain along the edge
    g.save(); q(pts); g.clip(); g.lineWidth = Math.max(.6, .8 * u);
    for (let i = 1; i < 7; i++) {
      const t = i / 7, a = { x: pts[0].x + (pts[3].x - pts[0].x) * t, y: pts[0].y + (pts[3].y - pts[0].y) * t }, b = { x: pts[1].x + (pts[2].x - pts[1].x) * t, y: pts[1].y + (pts[2].y - pts[1].y) * t };
      g.strokeStyle = `rgba(30,12,2,${.12 + (i % 3) * .05})`; g.beginPath(); g.moveTo(a.x, a.y);
      g.bezierCurveTo(a.x + (b.x - a.x) * .33, a.y + (b.y - a.y) * .33 + Math.sin(i * 2.1) * 2 * u, a.x + (b.x - a.x) * .66, a.y + (b.y - a.y) * .66 - Math.sin(i * 1.3) * 2 * u, b.x, b.y); g.stroke();
    }
    g.restore();
    g.strokeStyle = `rgba(255,232,190,${.35 * light})`; g.lineWidth = 1.2 * u; g.beginPath(); g.moveTo(pts[0].x, pts[0].y); g.lineTo(pts[1].x, pts[1].y); g.stroke();
  }
  // palm leaves peeking out from behind the four corners
  const corners: [number, number, number][] = [[0, 0, -2.4], [W, 0, -.74], [0, W, 2.5], [W, W, .64]];
  for (const [x, y, out] of corners) { const p = P(x, y, -T * .5); leaves(g, p.x, p.y, out, 66 * p.u); }
}
function leaves(g: CanvasRenderingContext2D, x: number, y: number, out: number, size: number) {
  for (const [k, l] of [[-1.05, .7], [-.55, .92], [0, 1], [.55, .92], [1.05, .7]] as [number, number][]) {
    const len = size * l, wid = size * .2;
    g.save(); g.translate(x, y); g.rotate(out + k);
    const gr = g.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, "#174d16"); gr.addColorStop(.45, "#2f8a27"); gr.addColorStop(1, "#7cc84a");
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * .45, -wid * 1.1, len, 0); g.quadraticCurveTo(len * .45, wid * .9, 0, 0);
    g.fillStyle = gr; g.shadowColor = "rgba(0,0,0,.4)"; g.shadowBlur = size * .08; g.fill(); g.shadowColor = "transparent";
    g.strokeStyle = "rgba(15,55,10,.65)"; g.lineWidth = Math.max(.6, size * .025); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * .5, -wid * .1, len * .97, 0); g.stroke();
    g.strokeStyle = "rgba(15,55,10,.35)";
    for (let i = 1; i < 6; i++) { const t = i / 6, cx = len * t; g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx + len * .07, -wid * .8 * (1 - t * .6)); g.moveTo(cx, 0); g.lineTo(cx + len * .07, wid * .7 * (1 - t * .6)); g.stroke(); }
    g.restore();
  }
}

/* ---------- textures for the WebGL 3D board (scene3d.ts) ---------- */
/** The playing surface (10 x 10 squares, no rim) as a texture: each square's own grain in two alternating woods,
    the START plaque and the finish flag. `px` is the canvas size in pixels. Numbers are painted separately. */
export function paintSurface(c: HTMLCanvasElement, px: number, woodId: WoodId) {
  const wood = WOODS[woodId] ?? WOODS.maple, k = px / (S * 10);
  c.width = c.height = px;
  const g = c.getContext("2d")!; g.setTransform(k, 0, 0, k, -PAD * k, -PAD * k);
  g.fillStyle = "#2a1407"; g.fillRect(PAD, PAD, S * 10, S * 10);
  for (let n = 1; n <= 100; n++) {
    const p = center(n), row = Math.floor((n - 1) / 10), col = (n - 1) % 10, base = (row + col) % 2 ? wood.tileB : wood.tileA;
    const tw = { ...wood, base, light: mix(base, "#ffdca6", .32), dark: mix(base, "#7a3a0c", .32), grain: mix(wood.grain, "#8a4a14", .35), contrast: wood.contrast * .62 };
    grain(g, p.x - S / 2, p.y - S / 2, S, S, tw, 1000 + n * 7, (row + col) % 2 === 1, .1);
  }
  const m = center(100), halo = g.createRadialGradient(m.x + 6, m.y + 4, 3, m.x, m.y, 40);
  halo.addColorStop(0, "rgba(255,214,120,.55)"); halo.addColorStop(1, "rgba(255,214,120,0)");
  g.fillStyle = halo; g.fillRect(m.x - S / 2, m.y - S / 2, S, S);
  flag(g, m.x + 12, m.y - 18);
  start(g, center(1), true);
}
/** The square numbers alone, on a transparent texture covering the playing surface (drawn above snakes and ladders). */
export function paintNumbers(c: HTMLCanvasElement, px: number, woodId: WoodId) {
  const wood = WOODS[woodId] ?? WOODS.maple, k = px / (S * 10);
  c.width = c.height = px;
  const g = c.getContext("2d")!; g.setTransform(k, 0, 0, k, -PAD * k, -PAD * k);
  numbers(g, wood, true);
}
/** A plank of wood (rim, sides, ladder rails), grain running along it. */
export function paintPlank(c: HTMLCanvasElement, w: number, h: number, woodId: WoodId, seed: number, which: "frame" | "light" = "frame") {
  const wood = WOODS[woodId] ?? WOODS.maple;
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const base = which === "frame" ? wood.frame : wood.tileB;
  grain(g, 0, 0, w, h, { ...wood, base, light: mix(base, wood.light, .5), dark: mix(base, "#000000", .3) }, seed, false, .5);
}
