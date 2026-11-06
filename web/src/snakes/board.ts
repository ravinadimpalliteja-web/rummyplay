import { LADDERS, RARE_LADDERS, SNAKES } from "./engine";
import { MOKSH_DEVA, MOKSH_LATIN } from "./moksh";

/* The board is drawn on a 644 x 644 logical canvas: a rim (PAD) around 10 x 10 squares of 60, numbered in a zigzag from the
   bottom left. Everything is painted in code (no image files), so it stays sharp at any size. There are three board models
   (a framed tray of raised squares, a polished marble slab, and flat tiles with brass inlay), each in four light themes, so
   the numbers and tokens always stand out. The screen tilts this flat picture in 3D (view3d.ts) or builds it in WebGL
   (scene3d.ts); tokens are drawn upright on top. */
export const PAD = 22, S = 60, W = S * 10 + PAD * 2;
/** How deep the board is (its front edge), in board units. */
export const THICK = 26;
export type Pt = { x: number; y: number };

/* ---------- board models and themes ---------- */
export type ModelId = "tray" | "marble" | "inlay";
export type ThemeId = "ivory" | "mint" | "sandstone" | "pearl";
export type Look = { model: ModelId; theme: ThemeId };
export const MODELS: Record<ModelId, { name: string; blurb: string }> = {
  marble: { name: "Royal Marble", blurb: "Polished veined marble, engraved lines, gold border" },
  tray: { name: "Classic Tray", blurb: "Raised squares of natural wood in a framed rim" },
  inlay: { name: "Palace Inlay", blurb: "Wood veneer tiles, brass inlay, carved corners" },
};
export const MODEL_IDS = Object.keys(MODELS) as ModelId[];
export const THEMES: Record<ThemeId, { name: string; swatch: [string, string, string] }> = {
  ivory: { name: "Ivory", swatch: ["#fbf5e6", "#efe1c3", "#9a6a3a"] },
  mint: { name: "Mint", swatch: ["#eef8f1", "#d3ebdc", "#136b4b"] },
  sandstone: { name: "Sandstone", swatch: ["#f9ead3", "#edd1aa", "#a4583a"] },
  pearl: { name: "Pearl", swatch: ["#f7f7fa", "#e4e6ef", "#56627a"] },
};
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
export const DEFAULT_LOOK: Look = { model: "marble", theme: "ivory" };
/** Every colour a board needs. tileA / tileB: the alternating squares; grain: their texture lines; groove: the gap or engraved
    line between squares; rim*: the frame; ink / inkEdge: the numbers; metal: gold or brass trim (light, mid, dark). */
export type Pal = {
  tileA: string; tileB: string; grain: string; contrast: number; groove: string;
  rim: string; rimLight: string; rimDark: string; rimGrain: string; ink: string; inkEdge: string;
  metal: [string, string, string]; vein: string; stone: string;
};
const BASE_PAL: Record<ThemeId, Omit<Pal, "groove" | "stone"> & { stoneRim: string }> = {
  ivory: { tileA: "#fbf5e6", tileB: "#efe0c0", grain: "#a8844e", contrast: .55, rim: "#9a6a3a", rimLight: "#cf9f64", rimDark: "#5a361a", rimGrain: "#3a2210",
    ink: "#2a1d10", inkEdge: "rgba(255,252,242,.92)", metal: ["#fff1b8", "#d9aa4a", "#8f6418"], vein: "#b6a382", stoneRim: "#e6dac2" },
  mint: { tileA: "#eef8f1", tileB: "#d2eadb", grain: "#5f9474", contrast: .5, rim: "#136b4b", rimLight: "#33a376", rimDark: "#073d29", rimGrain: "#03281a",
    ink: "#10281c", inkEdge: "rgba(250,255,251,.92)", metal: ["#fff1b8", "#d9aa4a", "#8f6418"], vein: "#86b39a", stoneRim: "#cfe6d8" },
  sandstone: { tileA: "#f9ead3", tileB: "#ecd0a8", grain: "#a8744a", contrast: .55, rim: "#a4583a", rimLight: "#d4875e", rimDark: "#62301b", rimGrain: "#3d1a0c",
    ink: "#2e1a0d", inkEdge: "rgba(255,250,240,.92)", metal: ["#fff1b8", "#d9aa4a", "#8f6418"], vein: "#c79c6c", stoneRim: "#ead2b0" },
  pearl: { tileA: "#f7f7fa", tileB: "#e3e6ef", grain: "#8a91a8", contrast: .45, rim: "#56627a", rimLight: "#8592ad", rimDark: "#2d3548", rimGrain: "#1a2030",
    ink: "#1d2333", inkEdge: "rgba(255,255,255,.94)", metal: ["#fff6d6", "#dcc07a", "#8f7430"], vein: "#9da3b8", stoneRim: "#dfe1ea" },
};
/** The colours for one model in one theme. The marble slab uses the theme's stone for its border; the other two a wooden rim. */
export function palette(look: Look): Pal {
  const b = BASE_PAL[look.theme] ?? BASE_PAL.ivory, m = look.model;
  const groove = m === "tray" ? mix(b.tileB, b.rimDark, .55) : m === "marble" ? mix(b.vein, "#3a2a18", .35) : b.metal[1];
  return { ...b, groove, stone: b.stoneRim, tileB: m === "marble" ? mix(b.tileA, b.tileB, .6) : b.tileB };
}
const BASE_PAL_TILEB = (l: Look) => (BASE_PAL[l.theme] ?? BASE_PAL.ivory).tileB;
export const lookKey = (l: Look) => l.model + "-" + l.theme;

export const center = (n: number): Pt => {
  const row = Math.floor((n - 1) / 10);
  let col = (n - 1) % 10;
  if (row % 2) col = 9 - col;
  return { x: PAD + col * S + S / 2, y: PAD + (9 - row) * S + S / 2 };
};
/* Tokens stand in the middle of their square, filling about three quarters of it. Each square's number is embossed into
   the board along the top edge of its square (100 keeps its corner under the MOKSH plaque). */
/** Flat or tilted picture board: where a lone token's stand touches the board, so its figure looks centred on the square. */
export const spot = (n: number): Pt => { const c = center(n); return { x: c.x, y: c.y + 9 }; };
/** Tokens sharing a square (2 to 4), smaller, laid out around the middle and clear of the number in the front-left corner. */
export const SHARED: Record<number, { pts: [number, number][]; s: number }> = {
  2: { pts: [[-13, 4], [13, 4]], s: .6 }, 3: { pts: [[-12, -4], [12, -4], [12, 18]], s: .48 }, 4: { pts: [[-12, -4], [12, -4], [5, 16], [21, 16]], s: .41 },
};
/** WebGL 3D board: a lone token stands exactly on the centre of its square. */
export const spot3D = (n: number): Pt => center(n);
export const SHARED3D: Record<number, { pts: [number, number][]; s: number }> = {
  2: { pts: [[-15, -3], [15, -3]], s: .54 }, 3: { pts: [[-15, -10], [15, -10], [12, 12]], s: .45 }, 4: { pts: [[-15, -12], [15, -12], [4, 12], [22, 12]], s: .4 },
};
/** Where a token waits before entering (on the rim, just left of square 1). */
export const OFF: Pt = { x: PAD * .4, y: center(1).y + 6 };

/** Centre line of a snake from head to tail; also the path a token slides down. */
/** Each snake's planned route (board units, head first): worked out once so its body goes around every ladder
    (a path search over the board, then checked by layoutIssues() and a server test). The curve below smooths it. */
/* Each snake's head sits in the middle of its square, facing the square tokens arrive from (one before it); the body
   leaves from behind the head and slithers to the tail. Routes planned to keep every body clear of every ladder and
   every other snake (checked by a server test). */
export const SNAKE_WAYPOINTS: Record<number, [number, number][]> = {
  23: [[172, 472], [150, 500], [154, 538], [122, 566], [112, 592]],
  27: [[412, 472], [436, 506], [430, 540], [396, 562], [412, 592]],
  36: [[292, 412], [290, 442], [343, 491], [263, 542], [292, 592]],
  70: [[592, 232], [600, 262], [578, 288], [598, 316], [574, 342], [548, 372]],
  87: [[412, 112], [447, 131], [396, 199], [440, 281], [412, 352]],
  95: [[352, 52], [317, 71], [360, 133], [273, 174], [292, 232]],
  97: [[232, 52], [231, 100], [214, 152], [146, 229], [183, 333], [112, 412]],
};
/** The snake drawn as a cobra: a raised, spread hood facing the arriving tokens. */
export const COBRA_HEAD = 97;
/** How far a snake's body swings either side of its route (board units). */
export const SNAKE_WAVE = 7;
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
    (empty when all is well). Widths are the widest drawn (the 3D board): snake 10.8, ladder 18 either side of its line. */
export function layoutIssues(snakeHalf = 10.8, ladderHalf = 18): string[] {
  const issues = new Set<string>();
  const segD = (p: Pt, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
  for (const [h, t] of Object.entries(SNAKES)) {
    const pts = snakePath(+h, t);
    for (const p of pts) {
      for (const [a, b] of Object.entries({ ...LADDERS, ...RARE_LADDERS })) if (segD(p, center(+a), center(b)) < snakeHalf + ladderHalf) issues.add(`snake ${h}-${t} touches ladder ${a}-${b}`);
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
const hex = (h: string) => { const m = h.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); if (m) return [+m[1], +m[2], +m[3]]; const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
/** Whether square n is a "second tone" square: a true chessboard pattern on screen (the numbering zigzags row by row). */
const altSquare = (n: number) => { const row = Math.floor((n - 1) / 10), c = (n - 1) % 10, col = row % 2 ? 9 - c : c; return (row + col) % 2 === 1; };
const rgba = (h: string, a: number) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`; };
const LIGHT = { x: -0.55, y: -0.83 };                                   // light comes from the top left

type Wood = { base: string; light: string; dark: string; grain: string; contrast: number };

/* ---------- natural textures: smooth noise, wood and marble painted pixel by pixel ---------- */
/** Seeded smooth value noise (0..1) and fractal noise built from it. */
function makeNoise(seed: number) {
  const r = rng(seed), perm = new Uint8Array(512), val = new Float32Array(256);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) val[i] = r();
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = val[perm[perm[X] + Y]], b = val[perm[perm[X + 1] + Y]], c = val[perm[perm[X] + Y + 1]], d = val[perm[perm[X + 1] + Y + 1]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x: number, y: number, oct = 4) => { let s = 0, amp = .5, f = 1, norm = 0; for (let i = 0; i < oct; i++) { s += amp * noise(x * f, y * f); norm += amp; amp *= .5; f *= 2.03; } return s / norm; };
  return { noise, fbm };
}
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Paints `w` x `h` board units at (x, y) pixel by pixel: `shade(u, v)` gives the colour at a point (in board units)
    as [r, g, b]. The picture is made at up to `maxScale` pixels per unit (smooth enough for stone and wood) and drawn
    scaled to the context's resolution. */
function pixels(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, maxScale: number, shade: (u: number, v: number) => [number, number, number]) {
  const t = g.getTransform(), sc = Math.max(.6, Math.min(maxScale, Math.hypot(t.a, t.b)));
  const pw = Math.max(2, Math.ceil(w * sc)), ph = Math.max(2, Math.ceil(h * sc));
  const c = document.createElement("canvas"); c.width = pw; c.height = ph;
  const cx = c.getContext("2d")!, img = cx.createImageData(pw, ph), d = img.data;
  for (let py = 0, i = 0; py < ph; py++) for (let px = 0; px < pw; px++, i += 4) {
    const [R, G, B] = shade((px + .5) / sc, (py + .5) / sc);
    d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.imageSmoothingQuality = "high"; g.drawImage(c, x, y, w, h); g.restore();
}
const lerp3 = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Natural wood filling a rectangle: growth rings bent by slow waves, darker latewood bands, fine streaks along the
    grain, soft colour clouds and (now and then) a knot that the rings flow around. `vertical` turns the grain to run
    up and down; `straight` gives the tight, even grain of quarter-sawn veneer. */
function grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wood: Wood, seed: number, vertical = false, knotChance = .7, straight = false) {
  const r = rng(seed), N = makeNoise(seed * 7 + 3);
  const base = hex(wood.base), light = hex(wood.light), dark = hex(wood.dark), gr = hex(wood.grain), k = wood.contrast;
  const along = vertical ? h : w, across = vertical ? w : h;
  const ringF = straight ? .55 + r() * .25 : .16 + r() * .12, warpA = straight ? 2.5 : 10 + r() * 10, off = r() * 200;
  const knots = r() < knotChance ? Array.from({ length: 1 + Math.floor(r() * 2) }, () => ({ u: r() * along, v: r() * across, s: 4 + r() * 6 })) : [];
  pixels(g, x, y, w, h, straight ? 2.6 : 2.2, (px, py) => {
    const u = vertical ? py : px, v = vertical ? px : py;
    let ring = v + N.fbm(u * .006 + off, v * .02, 3) * warpA * 2 - warpA;
    let knotDark = 0;
    for (const kn of knots) {                                  // rings swirl around a knot
      const du = (u - kn.u) * .55, dv = v - kn.v, d2 = du * du + dv * dv, e = Math.exp(-d2 / (kn.s * kn.s * 6));
      ring += e * Math.sign(dv || 1) * kn.s * 2.2; knotDark = Math.max(knotDark, Math.exp(-d2 / (kn.s * kn.s * .5)));
    }
    const f = (ring * ringF) % 1, fr = f < 0 ? f + 1 : f;
    const late = smooth(.62, .9, fr) * (1 - smooth(.93, 1, fr));                       // latewood band
    const streak = N.noise(u * .09 + off, v * 2.2) - .5;                                // fine streaks along the grain
    const cloud = N.fbm(u * .015 + 9, v * .03 + off, 3);
    let c = lerp3(base, cloud > .5 ? light : dark, Math.abs(cloud - .5) * 1.1 * k);
    c = lerp3(c, gr, Math.min(1, late * .55 * k + Math.max(0, streak) * .28 * k + knotDark * .7));
    c = lerp3(c, light, Math.max(0, -streak) * .18 * k);
    return c;
  });
}
/** Polished marble: a soft cloudy ground crossed by flowing veins (main veins that fade in and out, and a web of finer
    ones), all bent by turbulence the way real stone is, with a faint crystalline speckle. Each seed is a different cut. */
function stone(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, vein: string, seed: number, veins = 3) {
  const r = rng(seed), N = makeNoise(seed * 13 + 5), B = hex(base), V = hex(vein), Wt = [255, 255, 255];
  const ang = r() * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang), freq = (.012 + veins * .0022) * Math.PI * 2;
  const o1 = r() * 100, o2 = r() * 100, o3 = r() * 100, deep = lerp3(V, [40, 34, 30], .35);
  pixels(g, x, y, w, h, 1.9, (u, v) => {
    const t = N.fbm(u * .022 + o1, v * .022 + o2, 5);
    const s1 = Math.sin((u * ca + v * sa) * freq + t * 11);
    const main = Math.pow(1 - Math.abs(s1), 12) * smooth(.3, .7, N.fbm(u * .01 + o3, v * .01, 2));    // main veins fade in and out
    const s2 = Math.sin((u * sa - v * ca) * freq * 2.3 + N.fbm(u * .05 + o2, v * .05 + o3, 4) * 16);
    const fine = Math.pow(1 - Math.abs(s2), 26) * .55;
    const cloud = N.fbm(u * .01 + o3, v * .01 + o1, 3);
    let c = lerp3(B, cloud > .5 ? Wt : V, Math.abs(cloud - .5) * (cloud > .5 ? .5 : .32));
    c = lerp3(c, V, Math.min(1, fine * .7));
    c = lerp3(c, deep, Math.min(1, main * .85));
    const sp = N.noise(u * 1.7 + o1, v * 1.7) > .93 ? .06 : 0;                                       // crystal glints
    return lerp3(c, Wt, sp);
  });
}

/* ---------- board ---------- */
const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
};
const poly = (g: CanvasRenderingContext2D, pts: number[][], fill: string) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };
const tileWood = (pal: Pal, base: string): Wood => ({ base, light: mix(base, "#ffffff", .6), dark: mix(base, pal.grain, .2), grain: mix(pal.grain, base, .25), contrast: pal.contrast * .7 });
const rimWood = (pal: Pal): Wood => ({ base: pal.rim, light: pal.rimLight, dark: pal.rimDark, grain: pal.rimGrain, contrast: .85 });
const metalGrad = (g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, m: [string, string, string]) => {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, m[0]); gr.addColorStop(.3, m[1]); gr.addColorStop(.55, mix(m[0], m[1], .4)); gr.addColorStop(1, m[2]); return gr;
};

/** One raised square (the tray board): its own light wood, a lit top-left bevel, a shaded bottom-right bevel and a soft sheen. */
function tile(g: CanvasRenderingContext2D, x: number, y: number, s: number, pal: Pal, base: string, seed: number, vertical: boolean) {
  g.save(); rr(g, x, y, s, s, 3.4); g.clip();
  grain(g, x, y, s, s, tileWood(pal, base), seed, vertical, .05);
  const b = 4.2;
  poly(g, [[x, y], [x + s, y], [x + s - b, y + b], [x + b, y + b]], "rgba(255,255,255,.55)");
  poly(g, [[x, y], [x + b, y + b], [x + b, y + s - b], [x, y + s]], "rgba(255,255,255,.35)");
  poly(g, [[x, y + s], [x + b, y + s - b], [x + s - b, y + s - b], [x + s, y + s]], rgba(pal.rimDark, .32));
  poly(g, [[x + s, y], [x + s, y + s], [x + s - b, y + s - b], [x + s - b, y + b]], rgba(pal.rimDark, .22));
  const sh = g.createRadialGradient(x + s * .34, y + s * .28, 2, x + s * .5, y + s * .5, s * .78);
  sh.addColorStop(0, "rgba(255,255,255,.2)"); sh.addColorStop(.6, "rgba(255,255,255,0)"); sh.addColorStop(1, rgba(pal.rimDark, .06));
  g.fillStyle = sh; g.fillRect(x, y, s, s);
  g.restore();
}
/** The faces of the 100 squares for one model, covering the playing area (PAD..W-PAD), with the START plaque and the
    gold MOKSH engraving on square 100. Used by the picture board and as the WebGL board's surface texture. */
function squares(g: CanvasRenderingContext2D, look: Look, pal: Pal) {
  const A = PAD, L = S * 10;
  if (look.model === "tray") {
    g.fillStyle = pal.groove; g.fillRect(A - 1.5, A - 1.5, L + 3, L + 3);
    for (let n = 1; n <= 100; n++) {
      const p = center(n), gap = 1.4, alt = altSquare(n);
      tile(g, p.x - S / 2 + gap, p.y - S / 2 + gap, S - gap * 2, pal, alt ? pal.tileB : pal.tileA, 1000 + n * 7, alt);
    }
  } else if (look.model === "marble") {
    for (let n = 1; n <= 100; n++) {                                           // each square cut from its own piece of stone
      const p = center(n), alt = altSquare(n);
      stone(g, p.x - S / 2, p.y - S / 2, S, S, alt ? mix(pal.tileA, BASE_PAL_TILEB(look), .7) : pal.tileA, alt ? mix(pal.vein, "#5a4a38", .25) : pal.vein, 500 + n * 31, alt ? 4 : 3);
    }
    // engraved lines: a dark cut with a bright lower lip
    for (let i = 1; i < 10; i++) {
      const v = A + i * S;
      g.fillStyle = rgba(pal.groove, .55); g.fillRect(v - 1.1, A, 1.6, L); g.fillRect(A, v - 1.1, L, 1.6);
      g.fillStyle = "rgba(255,255,255,.75)"; g.fillRect(v + .5, A, .8, L); g.fillRect(A, v + .5, L, .8);
    }
    const sheen = g.createLinearGradient(A, A, A + L, A + L);
    sheen.addColorStop(0, "rgba(255,255,255,.22)"); sheen.addColorStop(.42, "rgba(255,255,255,0)"); sheen.addColorStop(.5, "rgba(255,255,255,.12)"); sheen.addColorStop(.6, "rgba(255,255,255,0)");
    g.fillStyle = sheen; g.fillRect(A, A, L, L);
  } else {
    for (let n = 1; n <= 100; n++) {
      const p = center(n), alt = altSquare(n), base = alt ? pal.tileB : pal.tileA;          // quarter-sawn veneer, grain turning tile to tile
      grain(g, p.x - S / 2, p.y - S / 2, S, S, tileWood(pal, base), 300 + n * 13, alt, 0, true);
      const sh = g.createLinearGradient(p.x - S / 2, p.y - S / 2, p.x + S / 2, p.y + S / 2);
      sh.addColorStop(0, "rgba(255,255,255,.22)"); sh.addColorStop(.5, "rgba(255,255,255,0)"); sh.addColorStop(1, rgba(pal.grain, .08));
      g.fillStyle = sh; g.fillRect(p.x - S / 2, p.y - S / 2, S, S);
      // a small carved diamond in the corners where four tiles meet (drawn on the tile's back-right corner)
    }
    // brass strips between the tiles (the WebGL board adds them as real metal on top)
    for (let i = 0; i <= 10; i++) {
      const v = A + i * S, w = i === 0 || i === 10 ? 3.4 : 2.4;
      g.fillStyle = metalGrad(g, v - w, A, v + w, A, pal.metal); g.fillRect(v - w / 2, A, w, L);
      g.fillStyle = metalGrad(g, A, v - w, A, v + w, pal.metal); g.fillRect(A, v - w / 2, L, w);
    }
    for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) {              // brass studs where strips cross
      const x = A + i * S, y = A + j * S, gr = g.createRadialGradient(x - .8, y - .8, .2, x, y, 3.4);
      gr.addColorStop(0, pal.metal[0]); gr.addColorStop(.6, pal.metal[1]); gr.addColorStop(1, pal.metal[2]);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
    }
  }
  finishSquare(g, pal);
  start(g, center(1));
}

/** Square 100, the goal: an emerald enamel panel in a double gold frame, with मोक्ष over MOKSH engraved in gold
    (the number 100 sits in its usual front-left corner, in gold). */
function finishSquare(g: CanvasRenderingContext2D, pal: Pal) {
  const m = center(100), x = m.x - S / 2, y = m.y - S / 2, i = 2.2;
  g.save();
  g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 3; g.shadowOffsetY = 1;
  rr(g, x + i, y + i, S - i * 2, S - i * 2, 4);
  const en = g.createRadialGradient(m.x - 8, m.y - 14, 2, m.x, m.y, 46); en.addColorStop(0, "#23a06c"); en.addColorStop(.55, "#0f6b47"); en.addColorStop(1, "#06402a");
  g.fillStyle = en; g.fill(); g.shadowColor = "transparent";
  g.strokeStyle = metalGrad(g, x, y, x + S, y + S, pal.metal); g.lineWidth = 1.8; g.stroke();
  g.lineWidth = .7; g.strokeRect(x + i + 2.6, y + i + 2.6, S - i * 2 - 5.2, S - i * 2 - 5.2);
  g.restore();
  engraveMoksh(g, m.x + 1, m.y - 9.5, 47);
}
/** मोक्ष (and MOKSH beneath it) cut into the board and gilded, centred on (cx, cy). Light comes from the top left, so the
    cut's top-left inner wall is in shadow and its lower-right wall catches the light. */
export function engraveMoksh(g: CanvasRenderingContext2D, cx: number, cy: number, width = 46) {
  const deva = new Path2D(MOKSH_DEVA.d), latin = new Path2D(MOKSH_LATIN.d);
  const dw = MOKSH_DEVA.x1 - MOKSH_DEVA.x0, ds = width / dw, dh = (MOKSH_DEVA.y1 - MOKSH_DEVA.y0) * ds;
  const lw = width * .78, ls = lw / (MOKSH_LATIN.x1 - MOKSH_LATIN.x0), lh = (MOKSH_LATIN.y1 - MOKSH_LATIN.y0) * ls, gap = 2.4;
  const top = cy - (dh + gap + lh) / 2;
  const parts: [Path2D, number, number, number][] = [
    [deva, cx - width / 2 - MOKSH_DEVA.x0 * ds, top - MOKSH_DEVA.y0 * ds, ds],
    [latin, cx - lw / 2 - MOKSH_LATIN.x0 * ls, top + dh + gap - MOKSH_LATIN.y0 * ls, ls],
  ];
  const base = g.getTransform();
  for (const [p, ox, oy, s] of parts) {
    const M = (dx: number, dy: number) => base.multiply(new DOMMatrix([s, 0, 0, s, ox + dx, oy + dy]));
    // the cut's dark shadow just below and right of each letter
    g.save(); g.setTransform(M(.35, .55)); g.fillStyle = "rgba(0,20,10,.7)"; g.filter = "blur(.5px)"; g.fill(p); g.restore();
    // the gilded letter
    g.save(); g.setTransform(M(0, 0)); g.fillStyle = metalGrad(g, 0, -900, 0, 160, ["#fff3c2", "#dcae4c", "#93661a"]); g.fill(p); g.restore();
    // inner shadow on the top-left walls and a light rim on the lower-right walls
    for (const [dx, dy, col] of [[.9, 1.1, "rgba(70,40,5,.6)"], [-.6, -.7, "rgba(255,250,225,.8)"]] as [number, number, string][]) {
      g.save(); g.setTransform(M(0, 0)); g.clip(p);
      g.setTransform(M(dx, dy));
      const hole = new Path2D(); hole.rect(-4000, -4000, 12000, 12000); hole.addPath(p);
      g.fillStyle = col; g.fill(hole, "evenodd"); g.restore();
    }
  }
}

/** The frame around the squares, for one model: a wooden rim with a gold inlay (tray), a marble border with a gold band
    (marble), or a carved wooden rim with gold rosettes at the corners (inlay). */
function frame(g: CanvasRenderingContext2D, look: Look, pal: Pal) {
  const line = (x1: number, y1: number, x2: number, y2: number, c: string, w: number) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  if (look.model === "marble") {
    stone(g, 0, 0, W, W, pal.stone, pal.vein, 41, 6);
    line(1.5, 1.5, W - 1.5, 1.5, "rgba(255,255,255,.7)", 3); line(1.5, 1.5, 1.5, W - 1.5, "rgba(255,255,255,.5)", 3);
    line(1, W - 1, W - 1, W - 1, rgba(pal.groove, .7), 2); line(W - 1, 1, W - 1, W - 1, rgba(pal.groove, .6), 2);
  } else {
    const fw = rimWood(pal);
    grain(g, 0, 0, W, PAD, fw, 11); grain(g, 0, W - PAD, W, PAD, fw, 12);
    grain(g, 0, 0, PAD, W, fw, 13, true); grain(g, W - PAD, 0, PAD, W, fw, 14, true);
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1;
    for (const [a, b, c, d] of [[0, 0, PAD, PAD], [W, 0, W - PAD, PAD], [0, W, PAD, W - PAD], [W, W, W - PAD, W - PAD]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
    line(1.5, 1.5, W - 1.5, 1.5, "rgba(255,238,205,.45)", 3); line(1.5, 1.5, 1.5, W - 1.5, "rgba(255,238,205,.3)", 3);
    line(1, W - 1, W - 1, W - 1, "rgba(0,0,0,.5)", 2); line(W - 1, 1, W - 1, W - 1, "rgba(0,0,0,.45)", 2);
    const roll = g.createLinearGradient(0, 0, 0, PAD);
    roll.addColorStop(0, "rgba(255,240,210,.18)"); roll.addColorStop(.5, "rgba(255,240,210,0)"); roll.addColorStop(1, "rgba(0,0,0,.25)");
    g.fillStyle = roll; g.fillRect(0, 0, W, PAD);
  }
  // the gold band just inside the frame
  g.strokeStyle = metalGrad(g, 0, 0, W, W, pal.metal); g.lineWidth = look.model === "marble" ? 4.2 : 2.4;
  g.strokeRect(PAD - 7, PAD - 7, S * 10 + 14, S * 10 + 14);
  g.strokeStyle = rgba(pal.rimDark, .45); g.lineWidth = .8; g.strokeRect(PAD - 4.6, PAD - 4.6, S * 10 + 9.2, S * 10 + 9.2);
  if (look.model === "inlay") for (const [x, y] of [[PAD / 2, PAD / 2], [W - PAD / 2, PAD / 2], [PAD / 2, W - PAD / 2], [W - PAD / 2, W - PAD / 2]]) rosette(g, x, y, PAD * .42, pal);
}
/** A carved gold rosette (the inlay board's corners). */
function rosette(g: CanvasRenderingContext2D, x: number, y: number, r: number, pal: Pal) {
  g.save(); g.translate(x, y);
  g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.arc(1, 1.4, r * 1.05, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.fillStyle = metalGrad(g, -r, -r, r, r, pal.metal); g.beginPath(); g.ellipse(0, -r * .55, r * .28, r * .5, 0, 0, Math.PI * 2); g.fill(); }
  const gr = g.createRadialGradient(-r * .2, -r * .2, .3, 0, 0, r * .45); gr.addColorStop(0, pal.metal[0]); gr.addColorStop(1, pal.metal[2]);
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r * .38, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** The START plaque on square 1, along its front edge beside the number: green enamel framed in gold, with an arrow. */
function start(g: CanvasRenderingContext2D, p: Pt) {
  const x = p.x - 11, y = p.y + S / 2 - 18, w = S / 2 + 7, h = 13;
  g.save();
  g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 2.5; g.shadowOffsetY = 1;
  rr(g, x, y, w, h, 3.5); const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, "#1f8a5b"); gr.addColorStop(1, "#0b4a31"); g.fillStyle = gr; g.fill();
  g.shadowColor = "transparent"; g.strokeStyle = "#e9c877"; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = "#ffe9a8"; g.font = "800 8px 'DM Sans', system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("START", x + w / 2 + 3, y + h / 2 + .5);
  g.strokeStyle = "#ffe9a8"; g.lineWidth = 1.3; g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath(); g.moveTo(x + 3, y + h / 2); g.lineTo(x + 8, y + h / 2); g.moveTo(x + 6, y + h / 2 - 2.3); g.lineTo(x + 8, y + h / 2); g.lineTo(x + 6, y + h / 2 + 2.3); g.stroke();
  g.restore();
}

/** Square numbers, drawn last so snakes and ladders never hide them: bold figures in the front-left corner of each square
    (nearest the players, where a token standing in the middle never covers them), dark with a light outline. */
export const NUM_FONT = "800 15px 'DM Sans', system-ui, sans-serif";
/** Where square n's number sits (text baseline, left end) for a font of `size` px: along the top edge of the square;
    100 keeps its front-left corner, under the MOKSH plaque. */
export const numberAt = (n: number, size = 19): Pt => { const p = center(n); return n === 100 ? { x: p.x - S / 2 + 4.5, y: p.y + S / 2 - 5.5 } : { x: p.x - S / 2 + 4.5, y: p.y - S / 2 + size * .8 + 3 }; };
/** The 3D board's numbers are larger: its tokens stand in the middle of their squares, clear of the corner. */
export const NUM_FONT_3D = "800 18px 'DM Sans', system-ui, sans-serif";
export const numberAt3D = (n: number) => numberAt(n, 18);
/** The square numbers, made to read at a glance: each sits on a soft light label (so marble veins, wood grain or a
    snake passing underneath never muddle it), with a crisp light outline around dark, heavy digits. */
function numbers(g: CanvasRenderingContext2D, pal: Pal, font = NUM_FONT) {
  g.save();
  g.textAlign = "left"; g.textBaseline = "alphabetic"; g.lineJoin = "round"; g.font = font;
  const size = +(font.match(/(\d+)px/)?.[1] ?? 19);
  for (let n = 1; n <= 100; n++) {
    const { x, y } = numberAt(n, size), t = String(n), tw = g.measureText(t).width;
    if (n === 100) {                                     // 100: gold on the emerald MOKSH plaque
      g.lineWidth = size * .28; g.strokeStyle = "rgba(4,40,24,.95)"; g.strokeText(t, x, y);
      g.fillStyle = "#ffe39a"; g.fillText(t, x, y); continue;
    }
    // embossed into the board, with no background: a soft shadow below-right, a light edge above-left (light comes from
    // the top left), then the digits themselves in the board's ink, slightly see-through so the surface shows
    void tw;
    const o = Math.max(.6, size * .05);
    g.fillStyle = "rgba(0,0,0,.32)"; g.fillText(t, x + o, y + o);
    g.fillStyle = "rgba(255,255,255,.85)"; g.fillText(t, x - o * .8, y - o * .8);
    g.fillStyle = rgba(pal.ink.startsWith("#") ? pal.ink : "#2a1d10", .8); g.fillText(t, x, y);
  }
  g.restore();
}

/* ---------- ladders: bold rails of dark polished wood with light rungs, so they stand out on light boards ---------- */
export const LADDER_HALF = 15;
const WOOD_RAIL = { base: "#7a3a16", light: "#c97a45", dark: "#3a1606" }, WOOD_RUNG = { base: "#e2a55a", light: "#ffe0a8", dark: "#8a5520" };
/** The rare golden ladder (see RARE_LADDERS) is drawn in polished gold so players can tell it apart. */
const GOLD_RAIL = { base: "#c9952e", light: "#fff0b0", dark: "#6e4a0c" }, GOLD_RUNG = { base: "#f0cf6a", light: "#fff8d6", dark: "#9a7420" };
function ladder(g: CanvasRenderingContext2D, a: number, b: number, golden = false) {
  const RAIL = golden ? GOLD_RAIL : WOOD_RAIL, RUNG = golden ? GOLD_RUNG : WOOD_RUNG;
  const p1 = center(a), p2 = center(b), dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, half = LADDER_HALF;
  const ext = 10, s1 = { x: p1.x - ux * ext, y: p1.y - uy * ext }, s2 = { x: p2.x + ux * ext, y: p2.y + uy * ext };
  const rungs = Math.max(5, Math.floor(len / 19));
  const cylinder = (x1: number, y1: number, x2: number, y2: number, r: number, c: { base: string; light: string; dark: string }) => {
    const dxx = x2 - x1, dyy = y2 - y1, l = Math.hypot(dxx, dyy), px = -dyy / l, py = dxx / l;
    const gr = g.createLinearGradient(x1 + px * r, y1 + py * r, x1 - px * r, y1 - py * r);
    const lit = px * LIGHT.x + py * LIGHT.y > 0;                         // which side faces the light
    gr.addColorStop(0, lit ? c.light : c.dark); gr.addColorStop(.42, c.base); gr.addColorStop(1, lit ? c.dark : c.light);
    g.fillStyle = gr; g.beginPath();
    g.moveTo(x1 + px * r, y1 + py * r); g.lineTo(x2 + px * r, y2 + py * r); g.arc(x2, y2, r, Math.atan2(py, px), Math.atan2(-py, -px));
    g.lineTo(x1 - px * r, y1 - py * r); g.arc(x1, y1, r, Math.atan2(-py, -px), Math.atan2(py, px)); g.closePath(); g.fill();
    g.strokeStyle = "rgba(30,10,0,.55)"; g.lineWidth = .7; g.stroke();
  };
  // shadow first
  g.save(); g.filter = "blur(3px)"; g.strokeStyle = "rgba(40,20,0,.5)"; g.lineCap = "round";
  for (const s of [1, -1]) { g.beginPath(); g.moveTo(s1.x + nx * half * s + 6, s1.y + ny * half * s + 8); g.lineTo(s2.x + nx * half * s + 6, s2.y + ny * half * s + 8); g.lineWidth = 10; g.stroke(); }
  for (let i = 1; i < rungs; i++) { const k = i / rungs, x = p1.x + dx * k + 6, y = p1.y + dy * k + 8; g.beginPath(); g.moveTo(x + nx * half, y + ny * half); g.lineTo(x - nx * half, y - ny * half); g.lineWidth = 6; g.stroke(); }
  g.restore();
  for (let i = 1; i < rungs; i++) {
    const k = i / rungs, x = p1.x + dx * k, y = p1.y + dy * k;
    cylinder(x + nx * half, y + ny * half, x - nx * half, y - ny * half, 3.5, RUNG);
  }
  for (const s of [1, -1]) cylinder(s1.x + nx * half * s, s1.y + ny * half * s, s2.x + nx * half * s, s2.y + ny * half * s, 5.4, RAIL);
  for (const [p, sgn] of [[s1, 1], [s2, -1]] as [Pt, number][]) for (const s of [1, -1]) {      // gold caps at the rail ends
    const cx = p.x + nx * half * s - ux * sgn * 1.5, cy = p.y + ny * half * s - uy * sgn * 1.5, gr = g.createRadialGradient(cx - 1.2, cy - 1.2, .4, cx, cy, 5.4);
    gr.addColorStop(0, "#fff1b8"); gr.addColorStop(.55, "#d9aa4a"); gr.addColorStop(1, "#7a5212");
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
  }
  for (let i = 1; i < rungs; i++) {                                     // pegs where rungs meet rails
    const k = i / rungs, x = p1.x + dx * k, y = p1.y + dy * k;
    for (const s of [1, -1]) { g.fillStyle = "#2a0f02"; g.beginPath(); g.arc(x + nx * half * s, y + ny * half * s, 1.8, 0, Math.PI * 2); g.fill(); g.fillStyle = "rgba(255,230,180,.55)"; g.beginPath(); g.arc(x + nx * half * s - .5, y + ny * half * s - .5, .7, 0, Math.PI * 2); g.fill(); }
  }
}

/* The snakes are painted and animated in snake2d.ts (on both boards). */

/* ---------- final polish: varnish sheen and vignette ---------- */
function varnish(g: CanvasRenderingContext2D) {
  const sheen = g.createLinearGradient(0, 0, W, W);
  sheen.addColorStop(0, "rgba(255,245,220,.10)"); sheen.addColorStop(.35, "rgba(255,245,220,.02)"); sheen.addColorStop(.5, "rgba(255,245,220,.07)"); sheen.addColorStop(.62, "rgba(255,245,220,0)"); sheen.addColorStop(1, "rgba(0,0,0,.10)");
  g.fillStyle = sheen; g.fillRect(0, 0, W, W);
  const v = g.createRadialGradient(W / 2, W / 2, W * .35, W / 2, W / 2, W * .75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.08)");
  g.fillStyle = v; g.fillRect(0, 0, W, W);
}

/** Paints the static board (frame, squares, ladders, snakes, numbers) for one model and theme into `layer` at the given pixel ratio. */
/** The board picture (frame, squares, embossed numbers, ladders, varnish). The snakes are painted and animated
    separately (snake2d.ts) on a layer above this one. `numbers: false` leaves the numbers out. */
export function paintBoard(layer: HTMLCanvasElement, dpr: number, look: Look = DEFAULT_LOOK, opts: { numbers?: boolean } = {}) {
  const pal = palette(look);
  layer.width = layer.height = Math.round(W * dpr);
  const g = layer.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  frame(g, look, pal);
  squares(g, look, pal);
  Object.entries(LADDERS).forEach(([a, b]) => onLayer(g, boxOf([center(+a), center(b)], 36), (c) => ladder(c, +a, b)));
  Object.entries(RARE_LADDERS).forEach(([a, b]) => onLayer(g, boxOf([center(+a), center(b)], 36), (c) => ladder(c, +a, b, true)));
  varnish(g);
  if (opts.numbers !== false) numbers(g, pal);
}
/** The square numbers alone on a transparent board-sized layer (the lighter board shows it above the snakes). */
export function paintNumberLayer(layer: HTMLCanvasElement, dpr: number, look: Look = DEFAULT_LOOK) {
  layer.width = layer.height = Math.round(W * dpr);
  const g = layer.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  numbers(g, palette(look));
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
export const PIECE_H = 54;                       // a lone token is about three quarters of a square wide
export function paintPiece(g: CanvasRenderingContext2D, x: number, y: number, u: number, sq: number, ring: string, img: HTMLImageElement | null, active: boolean, scale = 1, lift = 0, lean = 0) {
  if (scale <= 0.02) return;
  const k = u * scale, h = PIECE_H * k, w = h * (100 / 120), top = y - lift * u;
  g.save();
  g.fillStyle = `rgba(0,0,0,${(.4 * Math.max(.3, 1 - lift / 26)).toFixed(3)})`;
  g.beginPath(); g.ellipse(x + 1.6 * k, y + 1 * k, 13 * k * (1 - Math.min(.3, lift / 60)), 13 * k * sq, 0, 0, Math.PI * 2); g.fill();
  if (active) {
    g.strokeStyle = "rgba(255,226,140,.95)"; g.lineWidth = 2.4 * u; g.shadowColor = "rgba(255,206,100,.95)"; g.shadowBlur = 9 * u;
    g.beginPath(); g.ellipse(x, y, 16.5 * k, 16.5 * k * sq, 0, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0;
  }
  g.strokeStyle = ring; g.lineWidth = 2.4 * k; g.beginPath(); g.ellipse(x, y, 12.5 * k, 12.5 * k * sq, 0, 0, Math.PI * 2); g.stroke();
  if (lean) { g.translate(x, top); g.rotate(lean); g.translate(-x, -top); }
  if (img && img.complete && img.naturalWidth) g.drawImage(img, x - w / 2, top - h * (106 / 120), w, h);
  else { g.fillStyle = ring; g.beginPath(); g.arc(x, top - 12 * k, 12 * k, 0, Math.PI * 2); g.fill(); g.strokeStyle = "#fffaf0"; g.lineWidth = 2 * u; g.stroke(); }
  g.restore();
}

type ProjFn = (x: number, y: number, z?: number) => { x: number; y: number; u: number };
/** What sits under and around the tilted board: its shadow on the table, the board's front and side edges, and palm leaves at the corners. */
export function paintBase(g: CanvasRenderingContext2D, P: ProjFn, look: Look = DEFAULT_LOOK) {
  const pal = palette(look), T = THICK, edge = look.model === "marble" ? { frame: mix(pal.stone, pal.vein, .35), light: "#ffffff" } : { frame: pal.rim, light: pal.rimLight };
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
    gr.addColorStop(0, mix(edge.frame, edge.light, .35 * light)); gr.addColorStop(.25, mix(edge.frame, "#000000", .1 + (1 - light) * .3)); gr.addColorStop(1, mix(edge.frame, "#000000", .5));
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
/** The playing surface (10 x 10 squares, no rim) as a texture for one model and theme, with the START plaque and the
    MOKSH engraving. `px` is the canvas size in pixels. Numbers are painted separately. */
export function paintSurface(c: HTMLCanvasElement, px: number, look: Look = DEFAULT_LOOK) {
  const k = px / (S * 10);
  c.width = c.height = px;
  const g = c.getContext("2d")!; g.setTransform(k, 0, 0, k, -PAD * k, -PAD * k);
  squares(g, look, palette(look));
}
/** The square numbers alone, on a transparent texture covering the playing surface (drawn above snakes and ladders). */
export function paintNumbers(c: HTMLCanvasElement, px: number, look: Look = DEFAULT_LOOK) {
  const k = px / (S * 10);
  c.width = c.height = px;
  const g = c.getContext("2d")!; g.setTransform(k, 0, 0, k, -PAD * k, -PAD * k);
  numbers(g, palette(look), NUM_FONT_3D);
}
/** The frame's material as a strip `w` x `h` px: wood with the grain running along it, or the marble slab's stone. */
export function paintPlank(c: HTMLCanvasElement, w: number, h: number, look: Look, seed: number) {
  const pal = palette(look);
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  if (look.model === "marble") stone(g, 0, 0, w, h, pal.stone, pal.vein, seed, 4);
  else grain(g, 0, 0, w, h, rimWood(pal), seed, false, .5);
}
/** Polished dark wood for the ladder rails (the same on every board, so ladders always stand out). */
export function paintRail(c: HTMLCanvasElement, w: number, h: number, seed: number) {
  c.width = w; c.height = h;
  grain(c.getContext("2d")!, 0, 0, w, h, { base: WOOD_RAIL.base, light: WOOD_RAIL.light, dark: WOOD_RAIL.dark, grain: "#1e0a02", contrast: .8 }, seed, false, 0);
}
