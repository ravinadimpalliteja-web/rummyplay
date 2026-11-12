import { SNAKES } from "./engine";
import { S, center, snakePath, type Pt } from "./board";

/* Painted 2D snakes for both boards (the WebGL board shows them on a flat layer just above the squares; the lighter
   board on its own canvas), drawn in code with no image files and modelled on real Indian snakes:
   - each snake's skin (scales in rows, belly plates at the edges, counter-shading and the species' pattern) is painted
     once into a long strip; every frame the strip is laid along the snake's path in short slices, so the scales follow
     the curve, stretch on the outside of a bend and bunch on the inside, and the belly plates show along the inner edge;
   - a gentle travelling S-wave makes the body slither (strongest mid-body, none at the head or tail tip);
   - the head is drawn per species (shape, head plates, lip scales, eyes with the right pupils, brow scales, nostrils,
     heat pits) and can turn (up to 70 degrees, the neck bending with it), rear, open its jaws toward a token, flick its
     forked tongue and lunge;
   - a swallowed token travels down the body as a bulge in the player's colour.
   Everything here is presentation only: the rules and the timing of the swallow come from engine.ts. */

type Kind = "cobra" | "kingcobra" | "viper" | "pitviper" | "krait" | "python" | "vine" | "rat";
type Species = {
  name: string; base: string; spine: string; belly: string; iris: string; slit: boolean; keeled: boolean;
  half: number;                    // body half-width at its thickest, in board units
  headL: number; headW: number;    // head length and half-width, as multiples of `half`
  shape: "triangle" | "round" | "pointed" | "oval"; gloss: number; pits: "none" | "facial" | "labial";
};
export const SPECIES2D: Record<Kind, Species> = {
  cobra: { name: "Spectacled cobra", base: "#6e5733", spine: "#4b3b22", belly: "#e8d6a2", iris: "#3a2414", slit: false, keeled: false, half: 9.4, headL: 3.1, headW: 1.28, shape: "round", gloss: .55, pits: "none" },
  viper: { name: "Russell's viper", base: "#b98b54", spine: "#9c7140", belly: "#efe2c4", iris: "#caa24c", slit: true, keeled: true, half: 9.4, headL: 3.1, headW: 1.62, shape: "triangle", gloss: .35, pits: "facial" },
  krait: { name: "Common krait", base: "#171a24", spine: "#0c0e14", belly: "#e8e8e2", iris: "#0b0b0d", slit: false, keeled: false, half: 7.6, headL: 3.3, headW: 1.3, shape: "oval", gloss: 1, pits: "none" },
  kingcobra: { name: "King cobra", base: "#3a3f26", spine: "#262a17", belly: "#efe2a0", iris: "#2a1d0e", slit: false, keeled: false, half: 10.2, headL: 3.4, headW: 1.34, shape: "round", gloss: .7, pits: "none" },
  pitviper: { name: "Malabar pit viper", base: "#d0652a", spine: "#a9471a", belly: "#f6d9a4", iris: "#e6c04a", slit: true, keeled: true, half: 8.6, headL: 3.1, headW: 1.62, shape: "triangle", gloss: .45, pits: "facial" },
  python: { name: "Indian rock python", base: "#a9a486", spine: "#8d8868", belly: "#ece6cc", iris: "#b5873a", slit: true, keeled: false, half: 9.5, headL: 3.3, headW: 1.25, shape: "oval", gloss: .5, pits: "labial" },
  vine: { name: "Green vine snake", base: "#5db62f", spine: "#3f9420", belly: "#a9dc6c", iris: "#d8c04a", slit: false, keeled: false, half: 5.2, headL: 5.4, headW: 1.55, shape: "pointed", gloss: .6, pits: "none" },
  rat: { name: "Indian rat snake", base: "#a98a3e", spine: "#8a6d2a", belly: "#f0e1a6", iris: "#5a3a16", slit: false, keeled: true, half: 8.2, headL: 3.4, headW: 1.32, shape: "round", gloss: .45, pits: "none" },
};
/** Which species each snake on the board is. */
/* every snake on the board has its own colours: king cobra (olive-black, yellow bands), Russell's viper (warm tan),
   rock python (olive-grey), green vine snake (bright green), rat snake (yellow-brown), krait (black and white) and
   Malabar pit viper (orange) */
export const SNAKE_KIND: Record<number, Kind> = { 97: "kingcobra", 87: "viper", 95: "python", 70: "vine", 36: "rat", 27: "krait", 23: "pitviper", 49: "viper", 60: "krait", 66: "python", 73: "rat", 82: "vine", 93: "viper", 98: "cobra" };
const kindOf = (head: number): Kind => SNAKE_KIND[head] ?? (["viper", "krait", "python", "rat", "vine", "cobra"] as Kind[])[head % 6];

export type SnakeMouth = { head: number; open: number; facing?: number; lunge?: number; tongue?: number; still?: boolean };
export type SnakeOverlay = { mouth?: SnakeMouth; bulge?: { head: number; k: number; color: string } };

/* ---------- small helpers ---------- */
const hex = (h: string) => { const m = h.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); if (m) return [+m[1], +m[2], +m[3]]; const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`; };
const rgba = (h: string, a: number) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const LIGHT = { x: -.55, y: -.83 };                   // light comes from the top left, as on the rest of the board
const STEP = 4;                                       // body slice length, board units

/** The body's half-width along its length (k 0 = just behind the head, 1 = tail tip): a neck a little narrower than
    the head, thickest a third of the way along, then a long fine taper to a pointed tail. */
const profile = (k: number) => (k < .07 ? .8 + .2 * smooth(0, .07, k) * .75 : k < .33 ? .95 + .05 * smooth(.07, .33, k) : Math.max(.035, 1 - Math.pow((k - .33) / .67, 1.08) * .975));

/* ---------- the skin strip: painted once per snake ---------- */
type Strip = { c: HTMLCanvasElement; res: number; len: number; h: number };
function paintStrip(kind: Kind, total: number, res: number, seed: number): Strip {
  const sp = SPECIES2D[kind], len = Math.ceil(total * res) + 4, h = Math.max(24, Math.round(sp.half * 2 * res * 1.15));
  const c = document.createElement("canvas"); c.width = len; c.height = h;
  const g = c.getContext("2d")!, r = rng(seed), U = (u: number) => u * res, Vy = (v: number) => v * h;
  // counter-shading: belly plates at both edges (v < .09, v > .91), light flanks, a darker spine at v = .5
  const cs = g.createLinearGradient(0, 0, 0, h);
  cs.addColorStop(0, sp.belly); cs.addColorStop(.085, sp.belly); cs.addColorStop(.1, mix(sp.base, sp.belly, .35));
  cs.addColorStop(.3, sp.base); cs.addColorStop(.5, sp.spine); cs.addColorStop(.7, sp.base);
  cs.addColorStop(.9, mix(sp.base, sp.belly, .35)); cs.addColorStop(.915, sp.belly); cs.addColorStop(1, sp.belly);
  g.fillStyle = cs; g.fillRect(0, 0, len, h);
  // belly plates: wide transverse scutes along each edge
  for (let u = 0; u < total; u += 2.3) for (const [a, b] of [[0, .09], [.91, 1]]) {
    g.fillStyle = "rgba(0,0,0,.16)"; g.fillRect(U(u), Vy(a), Math.max(1, res * .35), Vy(b - a));
    g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(U(u) + res * .4, Vy(a), Math.max(1, res * .3), Vy(b - a));
  }
  // an uneven blob, for natural pattern edges
  const blob = (cu: number, cv: number, ru: number, rv: number, fill: string, edge?: string, edgeW = 1) => {
    const n = 12, rr = Array.from({ length: n }, () => .78 + r() * .4);
    g.beginPath();
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, q = rr[i % n]; const x = U(cu + Math.cos(a) * ru * q), y = Vy(cv + Math.sin(a) * rv * q); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); if (edge) { g.strokeStyle = edge; g.lineWidth = edgeW * res; g.stroke(); } g.fillStyle = fill; g.fill();
  };
  // a band across the back with ragged edges (fades out on the belly plates)
  const band = (cu: number, wu: number, fill: string, v0 = .09, v1 = .91) => {
    const n = 10, jl = Array.from({ length: n + 1 }, () => (r() - .5) * wu * .5), jr = Array.from({ length: n + 1 }, () => (r() - .5) * wu * .5);
    g.beginPath();
    for (let i = 0; i <= n; i++) g.lineTo(U(cu - wu / 2 + jl[i]), Vy(v0 + (v1 - v0) * i / n));
    for (let i = n; i >= 0; i--) g.lineTo(U(cu + wu / 2 + jr[i]), Vy(v0 + (v1 - v0) * i / n));
    g.closePath(); g.fillStyle = fill; g.fill();
  };
  const T = total;
  if (kind === "viper") {                    // three rows of dark chain spots, black-ringed with a pale outer rim
    for (let u = 10; u < T * .93; u += 13) {
      const k = u / T, sc = 1 - k * .55;
      blob(u, .5, 5.2 * sc, .17, "#5e3315", "#f2e2bd", 1.4); blob(u, .5, 4.2 * sc, .13, "#5e3315", "#160c06", .9);
      for (const v of [.2, .8]) { blob(u + 6.5, v, 3.6 * sc, .1, "#5e3315", "#f2e2bd", 1.1); blob(u + 6.5, v, 2.8 * sc, .075, "#5e3315", "#160c06", .7); }
    }
  } else if (kind === "krait") {              // glossy blue-black with thin white bands, often paired, clearer toward the tail
    for (let u = 9; u < T * .97; u += 11) { const a = .55 + .45 * (u / T); band(u, 1.1, `rgba(242,242,236,${a})`, .1, .9); if (r() < .6) band(u + 2.2, .8, `rgba(242,242,236,${a * .8})`, .14, .86); }
  } else if (kind === "python") {             // tan with large dark blotches, dark-edged, along the back and flanks
    for (let u = 8; u < T * .95; u += 15) {
      blob(u, .5, 6.5, .2, "#6a4522", "#2c1a0b", 1.2);
      for (const v of [.2, .8]) if (r() < .85) blob(u + 7.5, v, 3.6, .1, "#6a4522", "#2c1a0b", .9);
    }
  } else if (kind === "vine") {               // slender bright green, a fine pale line low on each flank
    g.fillStyle = "rgba(242,232,106,.75)"; g.fillRect(0, Vy(.13), len, Math.max(1, Vy(.025))); g.fillRect(0, Vy(.845), len, Math.max(1, Vy(.025)));
  } else if (kind === "rat") {                // yellow-brown, dark crossbars coming in toward the tail
    for (let u = T * .42; u < T * .97; u += 8) { const a = smooth(.42, .7, u / T) * .85; band(u, 2.6, `rgba(48,34,14,${a})`); }
    for (let i = 0; i < 70; i++) blob(r() * T * .5, .15 + r() * .7, .9, .03, "rgba(70,50,20,.25)");
  } else if (kind === "kingcobra") {         // olive-black with pale yellow chevron bands, brighter toward the head
    for (let u = 6; u < T * .96; u += 11) {
      const a = .75 - .4 * (u / T), cu = u;
      g.fillStyle = `rgba(236,214,120,${a})`; g.beginPath();
      g.moveTo(U(cu), Vy(.12)); g.lineTo(U(cu + 4.5), Vy(.5)); g.lineTo(U(cu), Vy(.88)); g.lineTo(U(cu + 1.6), Vy(.88)); g.lineTo(U(cu + 6.1), Vy(.5)); g.lineTo(U(cu + 1.6), Vy(.12)); g.closePath(); g.fill();
    }
  } else if (kind === "pitviper") {          // orange with dark brown blotches along the back and flanks
    for (let u = 7; u < T * .94; u += 10) {
      blob(u, .5, 3.6, .14, "#4a1e0c", "#2a1006", .6);
      for (const v of [.22, .78]) if (r() < .8) blob(u + 5, v, 2.2, .07, "#5a2510");
    }
  } else {                                    // cobra: brown-olive with faint pale crossbands
    for (let u = 22; u < T * .95; u += 16) band(u, 2.4, "rgba(230,212,160,.28)");
    for (let i = 0; i < 90; i++) blob(r() * T, .15 + r() * .7, .8, .025, "rgba(40,28,14,.22)");
  }
  // overlapping dorsal scales in rows (they get smaller with the body toward the head and tail as the strip is laid)
  const rows = 11, rowH = (.82) / rows, sl = 2.3;
  for (let row = 0; row < rows; row++) {
    const v = .09 + rowH * (row + .5), off = (row % 2) * sl / 2;
    for (let u = off; u < T; u += sl) {
      const x = U(u), y = Vy(v), hw = U(sl * .58), hh = Vy(rowH * .62);
      g.beginPath(); g.moveTo(x - hw, y); g.quadraticCurveTo(x - hw * .2, y - hh * 1.1, x + hw, y); g.quadraticCurveTo(x - hw * .2, y + hh * 1.1, x - hw, y);
      g.strokeStyle = "rgba(0,0,0,.22)"; g.lineWidth = Math.max(.6, res * .22); g.stroke();
      g.fillStyle = "rgba(255,255,255,.05)"; g.fill();
      if (sp.keeled) { g.strokeStyle = "rgba(255,255,255,.16)"; g.lineWidth = Math.max(.5, res * .16); g.beginPath(); g.moveTo(x - hw * .6, y); g.lineTo(x + hw * .55, y); g.stroke(); }
    }
  }
  return { c, res, len, h };
}

/* ---------- the head ---------- */
/** Half-width of the head outline at x (head-local, x from -L/2 at the back to +L/2 at the snout tip), per species. */
function headHalf(sp: Species, L: number, W: number, x: number) {
  const f = (x + L / 2) / L;                              // 0 back .. 1 snout tip
  let w: number;
  if (sp.shape === "triangle") w = f < .22 ? .72 + .28 * smooth(0, .22, f) : 1 - .58 * Math.pow((f - .22) / .78, 1.05);
  else if (sp.shape === "pointed") w = f < .2 ? .8 + .2 * smooth(0, .2, f) : 1 - .86 * Math.pow((f - .2) / .8, .9);
  else if (sp.shape === "oval") w = f < .35 ? .86 + .14 * smooth(0, .35, f) : 1 - .48 * Math.pow((f - .35) / .65, 1.6);
  else w = f < .3 ? .84 + .16 * smooth(0, .3, f) : 1 - .44 * Math.pow((f - .3) / .7, 1.9);
  const tip = f > .93 ? Math.sqrt(Math.max(0, 1 - Math.pow((f - .93) / .07, 2))) : 1;
  return W * w * tip;
}
/** Draws a head (in head-local space: origin at the head's centre, +x toward the snout) with its mouth `open` (0..1). */
function drawHead(g: CanvasRenderingContext2D, kind: Kind, sp: Species, L: number, W: number, open: number, tongue: number, lower: string) {
  const N = 26, xs = Array.from({ length: N + 1 }, (_, i) => -L / 2 + (L * i) / N);
  const side = (s: number) => xs.map(x => ({ x, y: s * headHalf(sp, L, W, x) }));
  const hingeX = -L * .3, gape = open * (35 * Math.PI) / 180;           // each jaw swings up to 35 degrees: 70 apart
  const fill = (pts: Pt[], style: string | CanvasGradient) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fillStyle = style; g.fill(); };
  const grad = (y0: number, y1: number, top: string) => { const gr = g.createLinearGradient(-L * .2, y0, L * .2, y1); gr.addColorStop(0, mix(top, "#ffffff", .22)); gr.addColorStop(.55, top); gr.addColorStop(1, mix(top, "#000000", .35)); return gr; };
  const eye = (x: number, y: number, s: number, alpha: number) => {
    if (alpha <= .01) return;
    const re = W * (kind === "vine" ? .3 : .27);
    g.save(); g.globalAlpha = alpha;
    g.fillStyle = "#120c08"; g.beginPath(); g.ellipse(x, y, re * 1.15, re * 1.05, 0, 0, Math.PI * 2); g.fill();          // dark rim
    const ig = g.createRadialGradient(x - re * .3, y - re * .3, re * .1, x, y, re); ig.addColorStop(0, mix(sp.iris, "#ffffff", .35)); ig.addColorStop(1, sp.iris);
    g.fillStyle = ig; g.beginPath(); g.arc(x, y, re * .9, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#050505"; g.beginPath();
    if (sp.slit) g.ellipse(x, y, re * .18, re * .78, 0, 0, Math.PI * 2); else g.arc(x, y, re * .42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.95)"; g.beginPath(); g.arc(x - re * .32, y - re * .34, re * .2, 0, Math.PI * 2); g.fill();         // catch-light
    // the brow (supraocular) scale jutting over the eye: makes the snake look alert
    g.strokeStyle = "rgba(0,0,0,.55)"; g.lineWidth = re * .32; g.lineCap = "round";
    g.beginPath(); g.arc(x - re * .1, y, re * 1.25, s < 0 ? Math.PI * 1.08 : Math.PI * .58, s < 0 ? Math.PI * 1.42 : Math.PI * .92); g.stroke();
    g.restore();
  };
  // one jaw: a half of the head outline, rotated about the hinge
  const half = (s: number, rot: number, top: string | null, withEye: number, isLower: boolean) => {
    g.save(); g.translate(hingeX, 0); g.rotate(rot); g.translate(-hingeX, 0);
    const pts = [...side(s), ...xs.slice().reverse().map(x => ({ x, y: s * Math.min(headHalf(sp, L, W, x) * .08, 0.6) }))];
    if (top) fill(pts, grad(s * W, 0, top));
    const ex = L * .14, ey = s * headHalf(sp, L, W, L * .14) * .66;
    // lip scales along the jaw edge
    g.strokeStyle = isLower ? "rgba(90,70,40,.35)" : "rgba(0,0,0,.28)"; g.lineWidth = .45;
    for (let x = -L * .32; x < L * .42; x += L * .085) { const y = s * headHalf(sp, L, W, x); g.beginPath(); g.arc(x + L * .04, y * .9, L * .045, s < 0 ? Math.PI * .1 : -Math.PI * .9, s < 0 ? Math.PI * .9 : -Math.PI * .1); g.stroke(); }
    if (!isLower) {
      // the mouth line along the jaw
      g.strokeStyle = "rgba(20,10,4,.55)"; g.lineWidth = .5; g.beginPath();
      for (let x = -L * .28; x <= L * .44; x += L * .04) { const y = s * headHalf(sp, L, W, x) * .9; if (x === -L * .28) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
      // nostril, heat pits
      g.fillStyle = "#140a05"; g.beginPath(); g.ellipse(L * .4, s * W * .2, L * .025, W * .07, 0, 0, Math.PI * 2); g.fill();
      if (sp.pits === "facial") { g.beginPath(); g.ellipse(L * .29, s * headHalf(sp, L, W, L * .29) * .72, L * .03, W * .08, 0, 0, Math.PI * 2); g.fill(); }
      if (sp.pits === "labial") for (const x of [L * .3, L * .36, L * .42]) { g.beginPath(); g.arc(x, s * headHalf(sp, L, W, x) * .82, W * .055, 0, Math.PI * 2); g.fill(); }
      eye(ex, ey, s, withEye);
    } else if (withEye > 0) eye(ex, ey, s, withEye);
    g.restore();
  };
  const top = sp.base;
  if (open < .02) {
    // closed: the whole head seen from above
    const pts = [...side(-1), ...side(1).reverse()];
    fill(pts, grad(-W, W, top));
    headMarks(g, kind, sp, L, W);
    half(-1, 0, null, 1, false); half(1, 0, null, 1, false);
    if (tongue > 0) drawTongue(g, L, W, tongue, 0);
    return;
  }
  // open: the head rolls to show its jaws in profile, swinging apart about the hinge (each up to 35 degrees). The
  // closed head fades out over the first part of the opening so nothing jumps.
  const jawUpper: Pt[] = [], jawLower: Pt[] = [];
  for (let i = 0; i <= 16; i++) { const f = i / 16, x = hingeX + (L * .5 - hingeX) * f; jawUpper.push({ x, y: -W * (.82 * (1 - Math.pow(f, 2.2)) + .12) * (f > .9 ? Math.sqrt(Math.max(0, 1 - Math.pow((f - .9) / .1, 2))) : 1) }); }
  for (let i = 0; i <= 16; i++) { const f = i / 16, x = hingeX + (L * .46 - hingeX) * f; jawLower.push({ x, y: W * (.5 * (1 - Math.pow(f, 1.6)) + .08) * (f > .9 ? Math.sqrt(Math.max(0, 1 - Math.pow((f - .9) / .1, 2))) : 1) }); }
  const closeEdge = (pts: Pt[]) => [{ x: hingeX - L * .2, y: 0 }, ...pts, { x: pts[pts.length - 1].x, y: 0 }];
  // the inside of the mouth: pink lining darkening toward the throat, with the glottis
  const tipU = { x: hingeX + Math.cos(-gape) * (L * .5 - hingeX), y: Math.sin(-gape) * (L * .5 - hingeX) }, tipL = { x: hingeX + Math.cos(gape) * (L * .46 - hingeX), y: Math.sin(gape) * (L * .46 - hingeX) };
  const mg = g.createRadialGradient(hingeX, 0, 1, hingeX, 0, L * .75); mg.addColorStop(0, "#5a1222"); mg.addColorStop(.35, "#b8475d"); mg.addColorStop(1, "#ee9aaa");
  g.fillStyle = mg; g.beginPath(); g.moveTo(hingeX - L * .02, 0); g.lineTo(tipU.x, tipU.y * .9); g.quadraticCurveTo(hingeX + (L * .5 - hingeX) * 1.05, 0, tipL.x, tipL.y * .9); g.closePath(); g.fill();
  g.save(); g.translate(hingeX, 0); g.rotate(gape * .55);
  g.fillStyle = "#3d0a16"; g.beginPath(); g.ellipse(L * .28, 0, L * .085, W * .07, 0, 0, Math.PI * 2); g.fill();          // glottis
  g.fillStyle = "#e8a0ae"; g.beginPath(); g.ellipse(L * .27, -W * .02, L * .05, W * .025, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  if (tongue > 0) drawTongue(g, L, W, tongue, hingeX + L * .25);
  // lower jaw: pale, with chin (infralabial) scales along its edge
  g.save(); g.translate(hingeX, 0); g.rotate(gape); g.translate(-hingeX, 0);
  fill(closeEdge(jawLower), grad(W * .5, 0, lower));
  g.strokeStyle = "rgba(110,90,60,.45)"; g.lineWidth = .4;
  for (let x = hingeX + L * .05; x < L * .42; x += L * .07) { g.beginPath(); g.arc(x, W * .02, L * .04, 0, Math.PI); g.stroke(); }
  g.restore();
  // upper jaw: the snout, the eye under its brow scale, nostril, heat pits, a pale lip edge with lip scales, two fangs
  g.save(); g.translate(hingeX, 0); g.rotate(-gape); g.translate(-hingeX, 0);
  fill(closeEdge(jawUpper), grad(-W, 0, top));
  g.fillStyle = rgba(sp.belly, .55); g.beginPath(); g.moveTo(hingeX - L * .1, 0); jawUpper.forEach(p => g.lineTo(p.x, Math.max(p.y, -W * .16))); g.lineTo(L * .5, 0); g.closePath(); g.fill();
  g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = .4;
  for (let x = hingeX + L * .05; x < L * .46; x += L * .07) { g.beginPath(); g.arc(x, -W * .02, L * .04, Math.PI, Math.PI * 2); g.stroke(); }
  g.fillStyle = "#fbf7ec"; g.strokeStyle = "rgba(60,40,20,.5)"; g.lineWidth = .3;
  for (const fx of [L * .34, L * .4]) { g.beginPath(); g.moveTo(fx - L * .025, 0); g.quadraticCurveTo(fx + L * .015, W * .2, fx - L * .012, W * .36); g.quadraticCurveTo(fx + L * .018, W * .18, fx + L * .028, 0); g.closePath(); g.fill(); g.stroke(); }
  g.fillStyle = "#140a05"; g.beginPath(); g.ellipse(L * .42, -W * .3, L * .025, W * .06, 0, 0, Math.PI * 2); g.fill();
  if (sp.pits === "facial") { g.beginPath(); g.ellipse(L * .3, -W * .24, L * .028, W * .065, 0, 0, Math.PI * 2); g.fill(); }
  if (sp.pits === "labial") for (const x of [L * .26, L * .33, L * .4]) { g.beginPath(); g.arc(x, -W * .11, W * .045, 0, Math.PI * 2); g.fill(); }
  eye(L * .06, -W * .5, -1, 1);
  g.restore();
  if (open < .22) {                                        // the closed head fading out as the jaws part
    g.save(); g.globalAlpha = 1 - open / .22;
    fill([...side(-1), ...side(1).reverse()], grad(-W, W, top)); headMarks(g, kind, sp, L, W);
    half(-1, 0, null, 1, false); half(1, 0, null, 1, false);
    g.restore();
  }
}
function drawTongue(g: CanvasRenderingContext2D, L: number, W: number, ext: number, fromX: number) {
  const x0 = fromX, x1 = L * .44 + L * .55 * ext;
  if (x1 <= L * .3) return;
  g.save(); g.strokeStyle = "#2b0a12"; g.lineCap = "round"; g.lineWidth = Math.max(.45, W * .075);
  g.beginPath(); g.moveTo(x0, 0); g.lineTo(x1, 0); g.stroke();
  g.strokeStyle = "rgba(170,40,60,.8)"; g.lineWidth = Math.max(.25, W * .035); g.beginPath(); g.moveTo(x0, 0); g.lineTo(x1, 0); g.stroke();
  g.strokeStyle = "#2b0a12"; g.lineWidth = Math.max(.35, W * .05);
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x1, 0); g.quadraticCurveTo(x1 + L * .06, s * W * .04, x1 + L * .11, s * W * .16); g.stroke(); }
  g.restore();
}
/** Species marks on top of a closed head: large head plates (scutes) and each species' own markings. */
function headMarks(g: CanvasRenderingContext2D, kind: Kind, sp: Species, L: number, W: number) {
  g.save();
  g.strokeStyle = kind === "krait" ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.24)"; g.lineWidth = .45;
  if (kind !== "viper") {
    // parietals (back), frontal (centre), supraoculars (over the eyes), prefrontals and internasals (front)
    const ln = (pts: number[][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * L, y * W) : g.moveTo(x * L, y * W))); g.stroke(); };
    ln([[-.42, 0], [-.05, 0]]); ln([[-.05, -.24], [.22, -.2], [.26, 0], [.22, .2], [-.05, .24], [-.05, -.24]]);
    ln([[.26, 0], [.44, 0]]); ln([[.22, -.2], [.36, -.42]]); ln([[.22, .2], [.36, .42]]); ln([[.33, -.32], [.33, .32]]);
    ln([[-.05, -.24], [-.3, -.62]]); ln([[-.05, .24], [-.3, .62]]);
  } else {
    // Russell's viper: small keeled head scales, a pale V and dark spots on the crown
    for (let i = 0; i < 40; i++) { const x = (-.4 + (i % 8) * .1) * L, y = (-.6 + Math.floor(i / 8) * .3) * W; if (Math.abs(y) < headHalf(sp, L, W, x) * .85) { g.beginPath(); g.arc(x, y, W * .07, 0, Math.PI * 2); g.stroke(); } }
    g.strokeStyle = "rgba(244,230,196,.85)"; g.lineWidth = W * .12; g.lineCap = "round";
    g.beginPath(); g.moveTo(-L * .4, -W * .62); g.lineTo(L * .32, -W * .05); g.lineTo(L * .32, W * .05); g.lineTo(-L * .4, W * .62); g.stroke();
    g.fillStyle = "#5e3315"; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(-L * .2, s * W * .3, L * .1, W * .16, 0, 0, Math.PI * 2); g.fill(); }
  }
  if (kind === "kingcobra") {                  // the king cobra's pair of large occipital scales behind the crown, and pale bands
    g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = .55;
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(-L * .3, s * W * .2, L * .13, W * .22, 0, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = "rgba(236,214,120,.55)"; for (const x of [-L * .44, L * .02]) { g.beginPath(); g.ellipse(x, 0, L * .03, W * .8, 0, 0, Math.PI * 2); g.fill(); }
  }
  if (kind === "pitviper") { g.strokeStyle = "rgba(60,20,6,.75)"; g.lineWidth = W * .1; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(L * .22, s * W * .5); g.lineTo(-L * .45, s * W * .9); g.stroke(); } }
  if (kind === "python") {                     // the dark spearhead on the crown
    g.fillStyle = "rgba(80,50,22,.75)"; g.beginPath(); g.moveTo(L * .38, 0); g.lineTo(-L * .38, -W * .5); g.lineTo(-L * .2, 0); g.lineTo(-L * .38, W * .5); g.closePath(); g.fill();
  }
  if (kind === "vine") { g.strokeStyle = "rgba(242,232,106,.9)"; g.lineWidth = W * .1; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-L * .45, s * W * .8); g.lineTo(L * .4, s * W * .18); g.stroke(); } }
  if (kind === "rat") { g.strokeStyle = "rgba(40,28,10,.6)"; g.lineWidth = W * .08; for (const s of [-1, 1]) for (const x of [-.1, .08, .24]) { g.beginPath(); g.moveTo(x * L, s * headHalf(sp, L, W, x * L) * .98); g.lineTo(x * L, s * headHalf(sp, L, W, x * L) * .7); g.stroke(); } }
  // a soft glossy highlight on the crown
  const hl = g.createRadialGradient(-L * .1, -W * .35, 0, -L * .1, -W * .35, L * .45);
  hl.addColorStop(0, `rgba(255,255,255,${.28 * sp.gloss + .08})`); hl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = hl; g.beginPath(); g.ellipse(0, 0, L * .5, W, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

/* ---------- one snake ---------- */
type SnakeState = {
  head: number; tail: number; kind: Kind; sp: Species; base: Pt[]; normals: Pt[]; s: number[]; total: number;
  strip: Strip | null; headImg: HTMLCanvasElement | null; rest: number; ang: number; tongue: number; tongueT0: number; nextFlick: number; seed: number;
};

/** All the snakes on the board, with the state of their heads (turning, mouths, tongues) between frames. */
export class SnakeArt {
  private snakes: SnakeState[] = [];
  private last = 0;
  constructor(private res = 3) {
    const entries = Object.entries(SNAKES).map(([h, t]) => [+h, t] as [number, number]);
    entries.forEach(([head, tail], i) => {
      const raw = snakePath(head, tail), kind = kindOf(head), sp = SPECIES2D[kind];
      // resample the route at even steps
      const len = [0]; for (let j = 1; j < raw.length; j++) len.push(len[j - 1] + Math.hypot(raw[j].x - raw[j - 1].x, raw[j].y - raw[j - 1].y));
      const total = len[len.length - 1], n = Math.max(8, Math.round(total / STEP)), base: Pt[] = [], s: number[] = [];
      let j = 1;
      for (let q = 0; q <= n; q++) {
        const sd = (q / n) * total; while (j < raw.length - 1 && len[j] < sd) j++;
        const f = (sd - len[j - 1]) / ((len[j] - len[j - 1]) || 1);
        base.push({ x: raw[j - 1].x + (raw[j].x - raw[j - 1].x) * f, y: raw[j - 1].y + (raw[j].y - raw[j - 1].y) * f }); s.push(sd);
      }
      const normals = base.map((_, q) => { const a = base[Math.max(0, q - 1)], b = base[Math.min(base.length - 1, q + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }; });
      const p0 = base[0], p1 = base[Math.min(base.length - 1, 3)], rest = Math.atan2(p0.y - p1.y, p0.x - p1.x);
      this.snakes.push({ head, tail, kind, sp, base, normals, s, total, strip: null, headImg: null, rest, ang: rest, tongue: 0, tongueT0: -1, nextFlick: 2000 + i * 900, seed: 101 + i * 37 });
    });
  }
  /** For tests: each head's current and resting angle (radians, board space). */
  state() { return this.snakes.map(sn => ({ head: sn.head, ang: sn.ang, rest: sn.rest, kind: sn.kind })); }
  /** The angle (radians, board space) from a snake's head square toward square `from`. */
  static facingFrom(head: number, from: number) { const a = center(head), b = center(from); return Math.atan2(b.y - a.y, b.x - a.x); }

  /** Paints every snake into `g` (already scaled to board units). `motion` false freezes the slithering (reduced motion
      or a paused page); `tokens` are the squares tokens stand on (for the idle head turns). Returns true while a head
      is still turning or a tongue is out (so the caller keeps redrawing). */
  paint(g: CanvasRenderingContext2D, now: number, ov: SnakeOverlay, tokens: number[], motion: boolean): boolean {
    const dt = this.last ? Math.min(250, now - this.last) : 16; this.last = now;   // real elapsed time, so heads turn on schedule even when frames are slow
    let busy = false;
    for (const sn of this.snakes) busy = this.paintOne(g, sn, now, dt, ov, tokens, motion) || busy;
    return busy;
  }

  private paintOne(g: CanvasRenderingContext2D, sn: SnakeState, now: number, dt: number, ov: SnakeOverlay, tokens: number[], motion: boolean): boolean {
    if (!sn.strip) sn.strip = paintStrip(sn.kind, sn.total, this.res, sn.seed);
    const sp = sn.sp, mouth = ov.mouth && ov.mouth.head === sn.head ? ov.mouth : null, bulge = ov.bulge && ov.bulge.head === sn.head ? ov.bulge : null;
    const open = mouth ? Math.max(0, Math.min(1, mouth.open)) : 0, lunge = mouth?.lunge ?? 0;
    const HALF = sp.half, L = sp.headL * HALF, HW = sp.headW * HALF;
    // where the head should face: toward the token that is arriving (swallow), toward a token on a neighbouring square
    // (idle curiosity), or straight ahead; never more than 70 degrees from its resting angle
    let target = sn.rest, quick = false;
    if (mouth && mouth.facing !== undefined) { target = mouth.facing; quick = true; }
    else {
      const hc = center(sn.head); let best = Infinity;
      for (const t of tokens) { if (t <= 0 || t === sn.head) continue; const c = center(t), d = Math.hypot(c.x - hc.x, c.y - hc.y); if (d < S * 1.5 && d < best) { best = d; target = Math.atan2(c.y - hc.y, c.x - hc.x); } }
    }
    const lim = (70 * Math.PI) / 180, rel = Math.max(-lim, Math.min(lim, wrap(target - sn.rest)));
    target = sn.rest + rel;
    if (mouth?.still) sn.ang = target;
    else { const tau = quick ? 45 : 650; sn.ang += wrap(target - sn.ang) * (1 - Math.exp(-dt / tau)); }
    const turning = Math.abs(wrap(target - sn.ang)) > .01;
    // the tongue: flicks during the swallow (given by the overlay), now and then when a token is close
    let tongue = mouth?.tongue ?? 0;
    if (!mouth) {
      const near = Math.abs(wrap(target - sn.rest)) > .001;
      if (sn.tongueT0 < 0 && motion && now > sn.nextFlick && (near || Math.random() < .002)) { sn.tongueT0 = now; }
      if (sn.tongueT0 >= 0) {
        const t = (now - sn.tongueT0) / 520;
        if (t >= 1) { sn.tongueT0 = -1; sn.nextFlick = now + (near ? 2500 : 9000) + Math.random() * 3500; }
        else tongue = Math.max(0, Math.sin(t * Math.PI * 2)) * (t < .5 ? 1 : .8);
      }
    }
    // the body: slithering wave, neck bent toward the head's facing, the lunge, the bulge and the cobra's hood
    const phase = motion ? now / 1000 : 0, n = sn.base.length, P: Pt[] = new Array(n), Wd: number[] = new Array(n);
    const turn = wrap(sn.ang - sn.rest), neckLen = L * 1.7, hc = sn.base[0];
    const lx = Math.cos(sn.ang) * lunge * 4.5, ly = Math.sin(sn.ang) * lunge * 4.5;
    for (let q = 0; q < n; q++) {
      const s = sn.s[q], k = s / sn.total, env = smooth(0, .16, k) * (1 - smooth(.78, 1, k));
      const wv = 2.6 * env * Math.sin((s / 68) * Math.PI * 2 - phase * Math.PI * 2 * .32);
      let x = sn.base[q].x + sn.normals[q].x * wv, y = sn.base[q].y + sn.normals[q].y * wv;
      const wgt = sn.kind === "kingcobra" ? 0 : 1 - smooth(0, neckLen, s);          // the king cobra keeps its spread hood still and turns only its head
      if (wgt > 0) {
        const a = turn * wgt, dx = x - hc.x, dy = y - hc.y, c = Math.cos(a), si = Math.sin(a);
        x = hc.x + dx * c - dy * si + lx * wgt; y = hc.y + dx * si + dy * c + ly * wgt;
      }
      P[q] = { x, y };
      let w = HALF * profile(k);
      if (bulge) { const sb = bulge.k * sn.total; w *= 1 + .62 * Math.exp(-Math.pow((s - sb) / 10, 2)); }
      if (sn.kind === "kingcobra") { const hood = s > 6 && s < 50 ? Math.sin(Math.PI * Math.pow((s - 6) / 44, .8)) : 0; w *= 1 + (1.35 + .45 * open) * Math.pow(Math.max(0, hood), .5); }
      if (sn.kind === "cobra") { const hood = s > 3 && s < 30 ? Math.sin(Math.PI * (s - 3) / 27) : 0; w *= 1 + (1.45 + .45 * open) * Math.pow(Math.max(0, hood), .7); }
      Wd[q] = w;
    }
    const head = { x: hc.x + lx, y: hc.y + ly };
    // contact shadow, deeper where the body is thickest (drawn in a few runs of similar width)
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    for (const [grow, alpha, ox, oy] of [[5, .1, 2.6, 3.4], [1.5, .16, 1.6, 2.2]] as const) {
      const runs = 8, per = Math.ceil(n / runs);
      for (let r0 = 0; r0 < n - 1; r0 += per) {
        const r1 = Math.min(n - 1, r0 + per), wm = Wd[Math.min(n - 1, r0 + (per >> 1))];
        g.strokeStyle = `rgba(20,12,4,${(alpha * (.45 + .55 * wm / HALF)).toFixed(3)})`; g.lineWidth = wm * 2 + grow;
        g.beginPath(); for (let q = r0; q <= r1; q++) { const p = P[q]; if (q === r0) g.moveTo(p.x + ox, p.y + oy); else g.lineTo(p.x + ox, p.y + oy); } g.stroke();
      }
    }
    g.restore();
    // the body itself: the skin strip laid along the path, slice by slice, tail first so the head end lies on top
    const st = sn.strip, vs = st.h;
    for (let q = n - 2; q >= 0; q--) {
      const a = P[q], b = P[q + 1], dx = b.x - a.x, dy = b.y - a.y, seg = Math.hypot(dx, dy) || .001, w = (Wd[q] + Wd[q + 1]) / 2;
      // which way does the body bend here? the inner side shows a little more of the belly plates
      const pa = P[Math.max(0, q - 2)], pb = P[Math.min(n - 1, q + 3)];
      const bend = Math.max(-1, Math.min(1, ((b.x - pa.x) * (pb.y - a.y) - (b.y - pa.y) * (pb.x - a.x)) / (seg * seg * 30)));
      const v0 = .08 - Math.max(0, -bend) * .07, v1 = .92 + Math.max(0, bend) * .07;
      const u0 = sn.s[q] * st.res, du = Math.max(1, (sn.s[q + 1] - sn.s[q]) * st.res);
      g.save(); g.translate(a.x, a.y); g.rotate(Math.atan2(dy, dx));
      g.drawImage(st.c, u0, v0 * vs, du, (v1 - v0) * vs, -.6, -w, seg + 1.4, w * 2);
      g.restore();
    }
    // outline, so the silhouette reads crisply on light boards
    g.save(); g.strokeStyle = "rgba(25,15,6,.38)"; g.lineWidth = .7;
    for (const sd of [-1, 1]) {
      g.beginPath();
      for (let q = 0; q < n; q++) { const p = P[q], x = p.x + sn.normals[q].x * Wd[q] * sd, y = p.y + sn.normals[q].y * Wd[q] * sd; if (q) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    g.restore();
    // the swallowed token showing through: a tinted swelling in the player's colour
    if (bulge) {
      const sb = Math.min(sn.total - 1, Math.max(2, bulge.k * sn.total)), q = Math.min(n - 2, Math.max(0, Math.round(sb / (sn.total / (n - 1))))), a = P[q], b = P[q + 1];
      g.save(); g.translate(a.x, a.y); g.rotate(Math.atan2(b.y - a.y, b.x - a.x));
      const gr = g.createRadialGradient(-2, -Wd[q] * .4, 1, 0, 0, Wd[q] * 1.6); gr.addColorStop(0, rgba(bulge.color, .5)); gr.addColorStop(1, rgba(bulge.color, 0));
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 13, Wd[q] * .95, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    // the glossy highlight along the top of the body, on the side toward the light
    g.save(); g.lineCap = "round";
    const runs = 10, per = Math.ceil(n / runs);
    for (let r0 = 0; r0 < n - 1; r0 += per) {
      const r1 = Math.min(n - 1, r0 + per), mid = Math.min(n - 1, r0 + (per >> 1)), nm = sn.normals[mid], toward = nm.x * LIGHT.x + nm.y * LIGHT.y > 0 ? 1 : -1, wm = Wd[mid];
      for (const [wf, a] of [[.42, .1 + .12 * sp.gloss], [.14, .12 + .22 * sp.gloss]] as const) {
        g.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`; g.lineWidth = Math.max(.4, wm * wf);
        g.beginPath(); for (let q = r0; q <= r1; q++) { const p = P[q], o = Wd[q] * .38 * toward; const x = p.x + sn.normals[q].x * o, y = p.y + sn.normals[q].y * o; if (q === r0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
      }
    }
    g.restore();
    // the king cobra's hood: pale chevrons across the spread hood and a dark rim along its edges
    if (sn.kind === "kingcobra") {
      g.save();
      for (const sd of [-1, 1]) {
        g.strokeStyle = "rgba(14,16,8,.55)"; g.lineWidth = 1.1; g.beginPath();
        for (let q = 2; q < Math.min(n, Math.round(50 / STEP)); q++) { const p = P[q], x = p.x + sn.normals[q].x * Wd[q] * sd * .97, y = p.y + sn.normals[q].y * Wd[q] * sd * .97; if (q === 2) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
      }
      for (const sAt of [16, 26, 36]) {
        const q = Math.min(n - 2, Math.round(sAt / STEP)), a = P[q], b = P[q + 1], w = Wd[q];
        g.save(); g.translate(a.x, a.y); g.rotate(Math.atan2(b.y - a.y, b.x - a.x));
        g.strokeStyle = "rgba(240,220,130,.8)"; g.lineWidth = Math.max(.8, w * .1); g.lineJoin = "round";
        g.beginPath(); g.moveTo(-w * .2, -w * .85); g.lineTo(w * .25, 0); g.lineTo(-w * .2, w * .85); g.stroke(); g.restore();
      }
      g.restore();
    }
    // the cobra's hood marking: the spectacle on the back of the spread hood
    if (sn.kind === "cobra") {
      const q = Math.min(n - 2, Math.round(14 / STEP)), a = P[q], b = P[q + 1], w = Wd[q];
      g.save(); g.translate(a.x, a.y); g.rotate(Math.atan2(b.y - a.y, b.x - a.x));
      g.strokeStyle = "rgba(236,222,180,.9)"; g.lineWidth = w * .13;
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(0, s * w * .42, w * .26, w * .24, 0, 0, Math.PI * 2); g.stroke(); g.fillStyle = "rgba(30,20,10,.85)"; g.beginPath(); g.arc(0, s * w * .42, w * .11, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.moveTo(w * .2, -w * .3); g.quadraticCurveTo(w * .45, 0, w * .2, w * .3); g.stroke();
      g.restore();
    }
    // the head: rearing a little as the mouth opens, its shadow falling further
    const rear = 1 + .1 * open;
    g.save(); g.translate(head.x + 2.2 + 2.5 * open, head.y + 3 + 2.5 * open); g.rotate(sn.ang);          // its shadow, cast down-right
    g.fillStyle = `rgba(20,12,4,${.16 + .06 * open})`; g.beginPath(); g.ellipse(0, 0, L * .46 * rear, HW * (.85 - .3 * open) * rear, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    g.save(); g.translate(head.x, head.y); g.rotate(sn.ang);
    if (open < .02 && tongue <= 0) {
      // a closed head at rest is drawn once into its own small canvas and reused (heads are the costliest part)
      const k = this.res * 1.7, bw = L * 1.1, bh = HW * 2.4;
      if (!sn.headImg) {
        const c = document.createElement("canvas"); c.width = Math.ceil(bw * k); c.height = Math.ceil(bh * k);
        const hg = c.getContext("2d")!; hg.setTransform(k, 0, 0, k, (bw / 2) * k, (bh / 2) * k);
        drawHead(hg, sn.kind, sp, L, HW, 0, 0, sp.belly); sn.headImg = c;
      }
      g.drawImage(sn.headImg, -bw / 2, -bh / 2, bw, bh);
    } else {
      // the open jaws are seen in profile: keep the upper jaw (with the eye) on the upper side of the screen
      g.scale(rear, Math.cos(sn.ang) < 0 ? -rear : rear);
      drawHead(g, sn.kind, sp, L, HW, open, tongue, sp.belly);
    }
    g.restore();
    return turning || tongue > 0 || sn.tongueT0 >= 0;
  }
}
