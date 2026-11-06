import * as THREE from "three";
import { LADDERS, RARE_LADDERS, SNAKES } from "./engine";
import { NUM_FONT_3D, S, SPECIES, W, center, lookKey, numberAt3D, paintNumbers, paintPlank, paintRail, paintSurface, palette, snakePath, speciesOf, type Look } from "./board";
import { buildFigure, gloss, gold, mat } from "./models3d";
import type { PieceId } from "./tokens";

/* The WebGL 3D board (Three.js): one of three board models (a framed tray of raised squares, a polished marble slab, or
   flat tiles with brass inlay and carved corners) in a light theme, modelled snakes and ladders, and the token figures,
   under real lights and shadows. Pure presentation: it only draws what SnakesGame tells it
   (token positions, the snake mouth and bulge during a swallow); the game rules never pass through here.
   World units: 1 = one square. The board's playing area spans -5..5 on x and z; +z faces the players. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = any;

/** One token to draw: where it stands (board units), how high it is lifted (h) and scaled (s); while climbing a ladder it
    leans toward `dir` (radians on the board, 0 = toward +x) by `lean` and sways side to side by `sway`. */
export type Piece3D = { seat: number; piece: PieceId; color: string; x: number; y: number; h: number; s: number; active: boolean; lean?: number; sway?: number; dir?: number };
/** Effects over the board: a snake's open mouth, a swallowed token's bulge, gold sparkles (age 0..1) and a landing ring. */
export type Overlay3D = { mouth?: { head: number; open: number }; bulge?: { head: number; k: number; color: string }; sparks?: { x: number; y: number; h: number; age: number }[]; burst?: { x: number; y: number; k: number } };
export type Box = { x0: number; x1: number; y0: number; y1: number };

const wx = (x: number) => (x - W / 2) / S, wz = (y: number) => (y - W / 2) / S;
const TILE_TOP = .14, RIM = .62, HALF = 5 + RIM, RIM_TOP = .26, BASE = -.5;
const L_BOARD = 0, L_NUMBERS = 1, L_TOKENS = 2;
/** Token figures are modelled about 0.85 squares tall on a base 0.27 across; on the board they stand this much larger
    (big enough that their faces and details read at board size). */
const FIG = 1.8;
/** Extra shift for token positions, in board units (positions already come laid out for the 3D board). */
const SHIFT = { x: 0, y: 0 };

/** True when this device can draw WebGL (checked once). */
let glOk: boolean | null = null;
export function canWebGL() {
  if (glOk !== null) return glOk;
  try { const c = document.createElement("canvas"); glOk = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { glOk = false; }
  return glOk;
}

function canvasTex(c: HTMLCanvasElement, aniso: number, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso; t.needsUpdate = true;
  return t;
}
const setLayer = (o: Obj, l: number) => o.traverse((c: Obj) => c.layers.set(l));

/* ---------- snake skins ---------- */
const SKIN_LEN = 1.4;                                                // world length one skin picture covers
/** Seeded random numbers, so every skin comes out the same on every device and visit. */
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
/** A colour made lighter (f > 0, towards white) or darker (f < 0), as CSS. */
const shade = (c: string, f: number) => { const k = new THREE.Color(c); if (f >= 0) k.lerp(new THREE.Color(1, 1, 1), f); else k.multiplyScalar(1 + f); return "#" + k.getHexString(); };
/* The skin picture runs along the body (u, head first) and around it (v): the spine is at v = .25, the sides at v = 0, .5
   and 1, the belly between v = .62 and .88. First the colour pattern is painted freely (counter-shading, then the
   species' marks with uneven natural edges and a darker rim, then fine speckle); then the skin is rebuilt scale by scale,
   each scale taking the pattern colour at its centre, as on a real snake, with overlapping dorsal scales on the back and
   wide belly plates underneath. Matching bump and roughness pictures make the scales raised and glossy and the skin
   between them dark and matte. Everything repeats seamlessly along the body. */
function skinCanvases(spIdx: number, low: boolean) {
  const sp = SPECIES[spIdx], w = low ? 512 : 1024, h = w / 2, k = w / 1024, R = rng(97 + spIdx * 131);
  const mk = () => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const wrapX = (fn: (dx: number) => void) => { for (const dx of [-w, 0, w]) fn(dx); };
  const BELLY0 = .62, BELLY1 = .88;
  // 1. the pattern
  const pat = mk(), p = pat.getContext("2d")!;
  const base = p.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, sp.body); base.addColorStop(.25, shade(sp.body, -.2)); base.addColorStop(.5, sp.body);
  base.addColorStop(.57, shade(sp.body, .12)); base.addColorStop(BELLY0 + .02, sp.belly); base.addColorStop(BELLY1 - .02, sp.belly);
  base.addColorStop(.93, shade(sp.body, .12)); base.addColorStop(1, sp.body);
  p.fillStyle = base; p.fillRect(0, 0, w, h);
  const blob = (x: number, y: number, rx: number, ry: number, fill: string, edge: string | null, pts = 14, rough = .22) => {
    const r = Array.from({ length: pts }, () => 1 - rough + R() * rough * 1.6);
    wrapX(dx => {
      p.beginPath();
      for (let i = 0; i <= pts; i++) { const a = (i / pts) * Math.PI * 2, q = r[i % pts]; const X = x + dx + Math.cos(a) * rx * q, Y = y + Math.sin(a) * ry * q; if (i) p.lineTo(X, Y); else p.moveTo(X, Y); }
      p.closePath(); if (edge) { p.strokeStyle = edge; p.lineWidth = 5 * k; p.lineJoin = "round"; p.stroke(); } p.fillStyle = fill; p.fill();
    });
  };
  /** A band across the back and down both sides (not under the belly), with wobbly edges. */
  const band = (x: number, half: number, fill: string, edge: string | null) => {
    const n = 12, a = Array.from({ length: n + 1 }, () => (R() - .5) * half * .7), b = Array.from({ length: n + 1 }, () => (R() - .5) * half * .7);
    for (const dy of [0, h]) wrapX(dx => {
      p.beginPath();
      for (let i = 0; i <= n; i++) { const v = -.1 + (i / n) * .7, taper = 1 - Math.max(0, (v - .45) / .25) * .6; p.lineTo(x + dx - half * taper + a[i], v * h + dy); }
      for (let i = n; i >= 0; i--) { const v = -.1 + (i / n) * .7, taper = 1 - Math.max(0, (v - .45) / .25) * .6; p.lineTo(x + dx + half * taper + b[i], v * h + dy); }
      p.closePath(); if (edge) { p.strokeStyle = edge; p.lineWidth = 6 * k; p.lineJoin = "round"; p.stroke(); } p.fillStyle = fill; p.fill();
    });
  };
  const n = (count: number, fn: (x: number) => void) => { for (let i = 0; i < count; i++) fn((i + .5) * (w / count) + (R() - .5) * (w / count) * .25); };
  const dark = shade(sp.body, -.55);
  switch (sp.name) {
    case "Emerald":            // green tree python: dark paired saddles and a broken row of pale flecks along the spine
      n(9, x => { blot2(x); });
      break;
    case "Ruby":               // banded: yellow rings edged in black
      n(6, x => band(x, 26 * k, "#f6c43a", "#1c0d08"));
      break;
    case "Sapphire":           // carpet-python diamonds: pale centres, dark outlines, dark flecks on the flanks
      n(6, x => { blob(x, h * .25, 46 * k, h * .19, "rgba(160,210,255,1)", "#0f2a66", 4, .12); blob(x, h * .25, 16 * k, h * .06, sp.body, null, 8); });
      n(14, x => { for (const v of [.06, .44]) blob(x, h * v, 7 * k, h * .03, dark, null, 9, .35); });
      break;
    case "Amethyst":           // paired lilac spots ringed in deep purple
      n(8, x => { blob(x, h * .14, 22 * k, h * .08, "#f0c2ff", "#3a1260", 11); blob(x + 40 * k, h * .36, 22 * k, h * .08, "#f0c2ff", "#3a1260", 11); });
      break;
    case "Tiger":              // irregular dark stripes that thin out down the sides
      n(7, x => band(x, 24 * k, "#2e1503", null));
      break;
    case "Cobra":              // faint pale cross-bands on dark olive-brown
      n(9, x => band(x, 5 * k, "rgba(214,196,150,.6)", null));
      break;
    default:                   // Jade: double dark bands
      n(6, x => { band(x - 16 * k, 10 * k, "#063a32", null); band(x + 16 * k, 10 * k, "#063a32", null); });
  }
  function blot2(x: number) {
    blob(x, h * .14, 30 * k, h * .1, "#16480f", null, 12, .3); blob(x + 50 * k, h * .36, 30 * k, h * .1, "#16480f", null, 12, .3);
    blob(x + 25 * k, h * .25, 10 * k, h * .04, "#f3f7c4", null, 9, .3);
  }
  // fine speckle so no two scales look exactly alike
  for (let i = 0; i < 2600 * k * k * 4; i++) { p.fillStyle = R() < .5 ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.06)"; p.fillRect(R() * w, R() * h, 2 * k + 1, 2 * k + 1); }
  const px = p.getImageData(0, 0, w, h).data;
  const at = (x: number, y: number) => { const X = ((Math.round(x) % w) + w) % w, Y = Math.max(0, Math.min(h - 1, Math.round(y))), i = (Y * w + X) * 4; return `rgb(${px[i]},${px[i + 1]},${px[i + 2]})`; };

  // 2. the skin, scale by scale
  const col = mk(), g = col.getContext("2d")!, bump = mk(), b = bump.getContext("2d")!, rough = mk(), r = rough.getContext("2d")!;
  g.fillStyle = shade(sp.body, -.4); g.fillRect(0, 0, w, h);                  // skin showing between the scales
  b.fillStyle = "#262626"; b.fillRect(0, 0, w, h);
  r.fillStyle = "#d8d8d8"; r.fillRect(0, 0, w, h);
  const C = 26, ROWS = 20, sx = w / C, sy = h / ROWS;
  for (let row = 0; row <= ROWS; row++) {
    const cy = row * sy, v = cy / h;
    if (v > BELLY0 - .015 && v < BELLY1 + .015) continue;                     // the belly gets plates instead
    for (let c = 0; c < C; c++) {
      const cx = c * sx + (row % 2) * sx / 2, base = at(cx, cy), j = (R() - .5) * .14, fill = j >= 0 ? shade(base, j) : shade(base, j);
      wrapX(dx => {
        const X = cx + dx;
        if (X < -sx || X > w + sx) return;
        const path = () => { g.beginPath(); g.ellipse(X, cy, sx * .56, sy * .64, 0, 0, Math.PI * 2); };
        const gr = g.createRadialGradient(X - sx * .12, cy - sy * .15, 1, X, cy, sx * .62);
        gr.addColorStop(0, shade(fill, .12)); gr.addColorStop(.6, fill); gr.addColorStop(1, shade(fill, -.2));
        path(); g.fillStyle = gr; g.fill();
        g.strokeStyle = "rgba(255,255,255,.10)"; g.lineWidth = 1.2 * k + .4; g.beginPath(); g.moveTo(X - sx * .3, cy); g.lineTo(X + sx * .3, cy); g.stroke();   // the keel
        const bg = b.createRadialGradient(X - sx * .1, cy - sy * .1, 1, X, cy, sx * .6);
        bg.addColorStop(0, "#ececec"); bg.addColorStop(.7, "#a8a8a8"); bg.addColorStop(1, "#5c5c5c");
        b.beginPath(); b.ellipse(X, cy, sx * .56, sy * .64, 0, 0, Math.PI * 2); b.fillStyle = bg; b.fill();
        r.beginPath(); r.ellipse(X, cy, sx * .5, sy * .58, 0, 0, Math.PI * 2); r.fillStyle = "#585858"; r.fill();
      });
    }
  }
  // belly plates: one wide plate per step along the body, the front edge raised and lit, the rear edge in shadow
  const y0 = BELLY0 * h, y1 = BELLY1 * h;
  for (let c = 0; c < C; c++) {
    const x0 = c * sx, fill = at(x0 + sx / 2, (y0 + y1) / 2);
    const lg = g.createLinearGradient(x0, 0, x0 + sx, 0); lg.addColorStop(0, shade(fill, .1)); lg.addColorStop(.75, fill); lg.addColorStop(1, shade(fill, -.32));
    g.fillStyle = lg; g.beginPath(); g.rect(x0 + sx * .04, y0, sx * .92, y1 - y0); g.fill();
    const bl = b.createLinearGradient(x0, 0, x0 + sx, 0); bl.addColorStop(0, "#dcdcdc"); bl.addColorStop(.8, "#9a9a9a"); bl.addColorStop(1, "#505050");
    b.fillStyle = bl; b.beginPath(); b.rect(x0 + sx * .04, y0, sx * .92, y1 - y0); b.fill();
    r.fillStyle = "#6a6a6a"; r.fillRect(x0 + sx * .08, y0 + 2, sx * .84, y1 - y0 - 4);
  }
  return { col, bump, rough };
}
/** Small overlapping scales for the heads (a grey bump picture, repeated over the head). */
let headBump: Obj = null;
function headScales() {
  if (headBump) return headBump;
  const w = 256, h = 128, c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d")!; g.fillStyle = "#3a3a3a"; g.fillRect(0, 0, w, h);
  const sx = 16, sy = 12;
  for (let row = 0; row <= h / sy; row++) for (let i = -1; i <= w / sx; i++) {
    const x = i * sx + (row % 2) * sx / 2, y = row * sy, gr = g.createRadialGradient(x - 2, y - 2, 1, x, y, sx * .6);
    gr.addColorStop(0, "#e8e8e8"); gr.addColorStop(.75, "#9a9a9a"); gr.addColorStop(1, "#5a5a5a");
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, sx * .55, sy * .62, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 4); t.needsUpdate = true;
  headBump = t; return t;
}

/** A snake's body: a tube along its path, thick behind the head and tapering to a fine tail, its belly flat on the board. */
/** `rise`: how high the head and neck are lifted off the board (h) over the first `len` of the body, and whether the
    neck spreads into a cobra's hood (wide and flat, facing forward). */
type Rise = { h: number; len: number; hood: boolean };
function snakeBody(head: number, tail: number, R: number, rise: Rise = { h: 0, len: 1, hood: false }) {
  const pts = snakePath(head, tail).map(p => new THREE.Vector3(wx(p.x), 0, wz(p.y)));
  const len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = len[len.length - 1];
  const at = (s: number) => { let i = 1; while (i < pts.length - 1 && len[i] < s) i++; const f = (s - len[i - 1]) / ((len[i] - len[i - 1]) || 1); return pts[i - 1].clone().lerp(pts[i], f); };
  // a real snake's build: a slim neck behind the head, the body filling out to its thickest around a third of the way
  // along, then a long, even taper to a fine tail tip
  const width = (k: number) => (k < .1 ? .7 + .3 * smooth01(k / .1) : k < .4 ? 1 : Math.max(.05, 1 - Math.pow((k - .4) / .6, 1.35) * .95));
  const radius = (s: number) => R * width(s / total);
  const lift = (s: number) => rise.h * (1 - smooth01(s / rise.len));
  const hoodAt = (s: number) => { if (!rise.hood) return 0; const a = rise.len * .06, b = rise.len * .7; return s <= a || s >= b ? 0 : Math.pow(Math.sin(Math.PI * (s - a) / (b - a)), .7); };
  const N = 150, RS = 20, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * total, c = at(s), a = at(Math.max(0, s - .05)), b = at(Math.min(total, s + .05));
    const t = b.sub(a).normalize(), side = new THREE.Vector3(-t.z, 0, t.x), r = radius(s), cy = TILE_TOP + r * .5 + lift(s), hd = hoodAt(s);
    for (let j = 0; j <= RS; j++) {
      const ang = (j / RS) * Math.PI * 2, sn = Math.sin(ang), up = (sn >= 0 ? Math.pow(sn, .85) * .86 : sn * .5) * (1 - .55 * hd), wide = r * (1.08 + 1.5 * hd);   // rounded back, flat belly; the hood spreads wide and flat
      pos.push(c.x + side.x * Math.cos(ang) * wide, cy + up * r, c.z + side.z * Math.cos(ang) * wide);
      uv.push(s / SKIN_LEN, j / RS);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < RS; j++) { const a = i * (RS + 1) + j, b = a + RS + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return { g, at, radius, total, cyAt: (s: number) => TILE_TOP + radius(s) * .5 + lift(s) };
}

/** How wide every snake's mouth gapes at rest (the lower jaw's angle, in radians). */
const GAPE = .62;
const smooth01 = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
/** A tube of changing cross-section along z (from z0 to z1): `w(f)` is the half-width, `top(f)` and `bot(f)` the height
    above and below the centre line, f running 0..1 from back to front; the front end closes to a point. Texture u runs
    along it (scaled to match the body's skin) and v around it, with the back on top as on the body. */
function headTube(z0: number, z1: number, w: (f: number) => number, top: (f: number) => number, bot: (f: number) => number, uScale: number, flatTop = .78) {
  const ST = 22, AR = 24, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= ST; i++) {
    const f = i / ST, z = z0 + (z1 - z0) * f, tip = f > .9 ? Math.sqrt(Math.max(0, 1 - Math.pow((f - .9) / .1, 2))) : 1;
    for (let j = 0; j <= AR; j++) {
      const a = (j / AR) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const y = sn >= 0 ? Math.pow(sn, flatTop) * top(f) : sn * bot(f);
      pos.push(c * w(f) * tip, y * tip, z); uv.push(f * uScale, j / AR);
    }
  }
  for (let i = 0; i < ST; i++) for (let j = 0; j < AR; j++) { const a = i * (AR + 1) + j, b = a + AR + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** A realistic snake head: a long, slightly flattened wedge that widens over the jaw hinge and narrows to a rounded
    snout, covered in the snake's own scaled skin; small glossy eyes set high on the sides, with vertical slit pupils
    under a jutting brow scale; two nostrils; a hinged lower jaw in the belly colour with a pink mouth inside (it opens
    to swallow) and a forked tongue. Faces +z; the jaw hinge is at the origin. */
function snakeHead(sp: (typeof SPECIES)[number], R: number, skin?: { col: Obj; bump: Obj; rough: Obj }) {
  const grp = new THREE.Group(), skull = new THREE.Group(), jaw = new THREE.Group();
  const L = R * 3.3, z0 = -L * .22, z1 = L * .78, uS = L / SKIN_LEN;
  const headM = skin ? new THREE.MeshPhysicalMaterial({ map: skin.col, bumpMap: skin.bump, bumpScale: 1.6, roughnessMap: skin.rough, roughness: 1, clearcoat: .5, clearcoatRoughness: .3, sheen: .3, sheenColor: new THREE.Color(sp.head) })
    : new THREE.MeshPhysicalMaterial({ color: sp.head, roughness: .42, clearcoat: .5 });
  const bellyM = new THREE.MeshPhysicalMaterial({ color: sp.belly, roughness: .5, clearcoat: .3 });
  // half-width: a slim neck, widest over the jaw hinge, then a gently narrowing, rounded snout
  const w = (f: number) => R * (f < .3 ? .78 + .34 * smooth01(f / .3) : 1.12 - .62 * Math.pow((f - .3) / .7, 1.5));
  const top = (f: number) => R * (f < .3 ? .55 + .12 * smooth01(f / .3) : .67 - .33 * Math.pow((f - .3) / .7, 1.2));
  const sk = new THREE.Mesh(headTube(z0, z1, w, top, (f) => R * (.2 - .06 * f), uS), headM); sk.castShadow = true; skull.add(sk);
  // lower jaw: a shallow wedge under the skull, pale like the belly, with the pink mouth lining on top
  const jw = (f: number) => w(Math.min(1, f + .02)) * .9;
  const jawMesh = new THREE.Mesh(headTube(z0 + L * .05, z1 - L * .02, jw, () => R * .05, (f) => R * (.3 - .16 * f), uS, 1), bellyM);
  jawMesh.position.y = -R * .17; jawMesh.castShadow = true; jaw.add(jawMesh);
  const mouth = new THREE.Mesh(headTube(z0 + L * .12, z1 - L * .08, (f) => jw(f) * .82, () => R * .015, () => R * .04, 1, 1), mat("#c4566a", .55));
  mouth.position.y = -R * .13; jaw.add(mouth);
  // eyes: high on the sides, about two thirds of the way forward, looking out and a little ahead
  const SPH = new THREE.SphereGeometry(1, 20, 14);
  const fe = .6, ez = z0 + (z1 - z0) * fe, ex = w(fe) * .82, ey = top(fe) * .55, er = R * .17;
  for (const s of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(s * ex, ey, ez); eye.rotation.y = s * (Math.PI / 2 - .5); skull.add(eye);
    const part = (m: Obj, p: number[], sc: number[]) => { const o = new THREE.Mesh(SPH, m); o.position.set(p[0], p[1], p[2]); o.scale.set(sc[0], sc[1], sc[2]); eye.add(o); return o; };
    part(mat("#14100c", .6), [0, 0, -er * .2], [er * 1.12, er * 1.02, er * .7]);              // dark socket rim
    part(gloss(sp.eye, .15), [0, 0, 0], [er, er * .95, er * .6]);                                // iris
    part(gloss("#050505", .05), [0, 0, er * .38], [er * .16, er * .72, er * .2]);              // vertical slit pupil
    part(mat("#ffffff", .1), [er * .3, er * .38, er * .5], [er * .16, er * .16, er * .12]);    // catch-light
    const brow = new THREE.Mesh(SPH, headM); brow.position.set(s * (ex - er * .2), ey + er * .85, ez); brow.scale.set(er * 1.15, er * .45, er * 1.4); brow.rotation.z = s * -.35; skull.add(brow);   // brow scale
  }
  for (const s of [-1, 1]) { const n = new THREE.Mesh(SPH, mat("#0d0907", .8)); n.position.set(s * R * .16, top(.95) * .7, z1 - L * .06); n.scale.set(R * .05, R * .035, R * .04); skull.add(n); }   // nostrils
  // forked tongue (flicks out when the mouth is closed)
  const tongue = new THREE.Group(), red = mat("#c0182a", .5), CY = new THREE.CylinderGeometry(1, 1, 1, 6);
  const tp = (p: number[], sc: number[], r: number[]) => { const o = new THREE.Mesh(CY, red); o.position.set(p[0], p[1], p[2]); o.scale.set(sc[0], sc[1], sc[2]); o.rotation.set(r[0], r[1], r[2]); tongue.add(o); };
  tp([0, -R * .1, z1 + R * .25], [R * .035, R * .7, R * .035], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) tp([s * R * .06, -R * .1, z1 + R * .7], [R * .025, R * .28, R * .025], [Math.PI / 2, 0, s * .6]);
  // the inside of the gaping mouth: a pink palate under the skull and two curved fangs
  const pal = new THREE.Mesh(SPH, mat("#c4566a", .5)); pal.position.set(0, -R * .2, z0 + L * .55); pal.scale.set(w(.55) * .78, R * .04, L * .38); skull.add(pal);
  const fangM = gloss("#fbf6ea", .2), CONE = new THREE.ConeGeometry(1, 1, 10);
  for (const s of [-1, 1]) { const fg = new THREE.Mesh(CONE, fangM); fg.position.set(s * w(.86) * .55, -R * .3, z1 - L * .12); fg.scale.set(R * .05, R * .22, R * .05); fg.rotation.set(Math.PI + .25, 0, 0); skull.add(fg); }
  jaw.rotation.x = GAPE; skull.rotation.x = -GAPE * .35; tongue.visible = false;
  grp.add(skull, jaw, tongue);
  return { grp, skull, jaw, tongue };
}

/** A cobra's raised front: the neck rises almost straight up from the ground at `base`, spreading into a broad, flat
    hood facing `f` (its pale throat to the front, the patterned back behind, with the spectacle mark), then narrowing
    again under the head at `top`. */
function cobraNeck(base: Obj, f: Obj, R: number, H: number, skinM: Obj, belly: string) {
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3().crossVectors(up, f).normalize();
  const P = (fw: number, h: number) => base.clone().addScaledVector(f, fw).addScaledVector(up, h);
  const spine = new THREE.CatmullRomCurve3([P(.05, 0), P(-.05, H * .32), P(-.02, H * .68), P(.06, H)]);
  const ST = 30, AR = 26, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const hoodAt = (u: number) => (u < .3 ? 0 : u > .95 ? 0 : Math.pow(Math.sin(Math.PI * (u - .3) / .65), .6));
  for (let i = 0; i <= ST; i++) {
    const u = i / ST, c = spine.getPoint(u), hd = hoodAt(u), w = R * (.95 + .9 * hd), th = R * (.9 - .3 * hd);
    for (let j = 0; j <= AR; j++) {
      const a = (j / AR) * Math.PI * 2;
      const p = c.clone().addScaledVector(side, Math.cos(a) * w).addScaledVector(f, -Math.sin(a) * th);   // v .25 = back (pattern), .75 = throat
      pos.push(p.x, p.y, p.z); uv.push((u * H) / SKIN_LEN, j / AR);
    }
  }
  for (let i = 0; i < ST; i++) for (let j = 0; j < AR; j++) { const a = i * (AR + 1) + j, b = a + AR + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  // the hood: a broad rounded plate spread on the raised neck just under the head, facing f. Its front is the pale
  // throat crossed by two dark bands; its back carries the skin pattern and the spectacle mark.
  const marks: Obj[] = [], SPH = new THREE.SphereGeometry(1, 28, 18), hc = spine.getPoint(.56), hw = R * 3.3, hh = H * .5, ht = R * .32;
  // the hood leans back a little, as a rearing cobra's does, so it faces up toward the viewer as well as forward
  const n = f.clone().add(new THREE.Vector3(0, .85, 0)).normalize();
  const orient = (o: Obj, at: Obj) => { o.position.copy(at); o.lookAt(at.clone().add(n)); return o; };
  const back = orient(new THREE.Mesh(SPH, skinM), hc.clone().addScaledVector(n, -ht * .3)); back.scale.set(hw, hh, ht); back.castShadow = true; marks.push(back);
  const throatM = new THREE.MeshPhysicalMaterial({ color: belly, roughness: .5, clearcoat: .35 });
  const front = orient(new THREE.Mesh(SPH, throatM), hc.clone().addScaledVector(n, ht * .25)); front.scale.set(hw * .86, hh * .9, ht * .8); marks.push(front);
  const bandM = mat("#2c2117", .6);
  for (const dy of [-.18, -.02]) { const bnd = orient(new THREE.Mesh(SPH, bandM), hc.clone().addScaledVector(n, ht * .62).add(new THREE.Vector3(0, hh * dy, 0))); bnd.scale.set(hw * .62, hh * .07, ht * .3); marks.push(bnd); }
  const pale = mat("#e9dcb4", .55), dark = mat("#2a2016", .6);
  for (const sd of [-1, 1]) {                                              // the spectacle on the back
    const at = hc.clone().addScaledVector(side, sd * hw * .3).addScaledVector(n, -ht * 1.22).add(new THREE.Vector3(0, hh * .12, 0));
    const ring = orient(new THREE.Mesh(new THREE.TorusGeometry(R * .32, R * .08, 8, 24), pale), at); marks.push(ring);
    const dot = orient(new THREE.Mesh(SPH, dark), at.clone().addScaledVector(n, -.004)); dot.scale.set(R * .15, R * .15, R * .04); marks.push(dot);
  }
  return { g, top: spine.getPoint(1), marks };
}

/** Several box geometries joined into one (fewer draw calls). */
function mergeBoxes(gs: Obj[]) {
  let n = 0; for (const g of gs) n += (g.index ? g.toNonIndexed() : g).attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
  for (const g0 of gs) { const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position, nn = g.attributes.normal; P.set(p.array, o * 3); N.set(nn.array, o * 3); o += p.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.BufferAttribute(P, 3)); out.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  return out;
}
/** A carved gold rosette: eight petals around a domed centre (the inlay board's corners). */
function rosette(metal: Obj, x: number, y: number, z: number) {
  const g = new THREE.Group(), petal = new THREE.SphereGeometry(1, 14, 8);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, m = new THREE.Mesh(petal, metal); m.scale.set(.055, .025, .11); m.position.set(Math.cos(a) * .12, 0, Math.sin(a) * .12); m.rotation.y = -a + Math.PI / 2; m.castShadow = true; g.add(m); }
  const c = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 10), metal); c.scale.y = .6; g.add(c);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.2, .018, 8, 32), metal); ring.rotation.x = Math.PI / 2; g.add(ring);
  g.position.set(x, y, z);
  return g;
}

/* ---------- the scene ---------- */
export class BoardScene {
  renderer: Obj; scene: Obj; camera: Obj; light: Obj;
  private board = new THREE.Group(); private numbersMesh: Obj = null; private texes: Obj[] = [];
  private figures = new Map<number, { id: PieceId; grp: Obj; tilt: Obj; fig: Obj; ring: Obj; glow: Obj }>();
  private snakes = new Map<number, { body: ReturnType<typeof snakeBody>; head: ReturnType<typeof snakeHead>; color: string; headPos: Obj; dir: Obj }>();
  private bulge: Obj;
  private size = { w: 1, h: 1 };
  private aniso = 4; private low: boolean; private look: Look;
  private sparks: Obj[] = []; private burst: Obj;
  elevation = 55;

  private ratioCap = 2; private dpr = 1; private level = 0;
  constructor(canvas: HTMLCanvasElement, look: Look, low: boolean, opts: { testLite?: boolean } = {}) {
    this.low = low; this.look = look; this.ratioCap = opts.testLite ? .75 : low ? 1.5 : 2;
    const r = new THREE.WebGLRenderer({ canvas, antialias: !opts.testLite, alpha: true, powerPreference: "high-performance" });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.shadowMap.autoUpdate = false;
    r.autoClear = false;
    this.renderer = r; this.aniso = Math.min(8, r.capabilities.getMaxAnisotropy());
    const scene = new THREE.Scene(); this.scene = scene;
    // soft studio reflections, built here (no image files)
    const pm = new THREE.PMREMGenerator(r), env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
    const cols: number[] = [], pos = sky.geometry.attributes.position, c1 = new THREE.Color("#fff1d8"), c2 = new THREE.Color("#0b4a31");
    for (let i = 0; i < pos.count; i++) { const t = (pos.getY(i) / 20 + 1) / 2, c = c2.clone().lerp(c1, Math.pow(t, 1.6)); cols.push(c.r, c.g, c.b); }
    sky.geometry.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); env.add(sky);
    for (const [x, y, z, s] of [[-8, 12, 6, 6], [9, 9, -4, 4]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.7, 3.2), side: THREE.DoubleSide })); p.position.set(x, y, z); p.lookAt(0, 0, 0); env.add(p); }
    scene.environment = pm.fromScene(env, .04).texture; scene.environmentIntensity = .55; pm.dispose();
    // the key light (casts the shadows) and a soft fill
    const light = new THREE.DirectionalLight("#fff0da", 2.9);
    light.position.set(-5.5, 12, 7); light.castShadow = true;
    const sc = light.shadow.camera; sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 2; sc.far = 30;
    light.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048); light.shadow.bias = -.0004; light.shadow.normalBias = .025;
    light.layers.enableAll(); sc.layers.enableAll(); scene.add(light); this.light = light;
    const fill = new THREE.HemisphereLight("#fff6e6", "#0b3a26", .2); fill.layers.enableAll(); scene.add(fill);
    // extra light on the tokens only (they are drawn in their own pass): a soft front light from the players' side so faces
    // and clothing read, and a warm rim light from behind that outlines each figure against the board
    const front = new THREE.DirectionalLight("#fff4e4", 1.1); front.position.set(1.5, 6, 12); front.layers.set(L_TOKENS); scene.add(front);
    const rim = new THREE.DirectionalLight("#ffe2a8", 1.6); rim.position.set(3, 7, -10); rim.layers.set(L_TOKENS); scene.add(rim);
    const tokFill = new THREE.HemisphereLight("#fffaf0", "#2a4a3a", .35); tokFill.layers.set(L_TOKENS); scene.add(tokFill);
    // the table only catches shadows; the page shows the green felt behind
    const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: .5 }));
    table.rotation.x = -Math.PI / 2; table.position.y = BASE - .01; table.receiveShadow = true; scene.add(table);
    this.camera = new THREE.PerspectiveCamera(30, 1, .5, 120);
    this.camera.layers.enableAll();
    const bm = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshPhysicalMaterial({ color: "#888", roughness: .4, clearcoat: .5 }));
    bm.visible = false; bm.castShadow = true; this.bulge = bm; scene.add(bm);
    // gold sparkles (a small pool, reused) and the ring that flashes when a token lands at the top of a ladder
    const sc2 = document.createElement("canvas"); sc2.width = sc2.height = 64;
    const sg = sc2.getContext("2d")!, gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,245,1)"); gr.addColorStop(.22, "rgba(255,236,170,1)"); gr.addColorStop(.5, "rgba(255,200,80,.55)"); gr.addColorStop(1, "rgba(255,180,40,0)");
    sg.fillStyle = gr; sg.fillRect(0, 0, 64, 64);
    sg.strokeStyle = "rgba(255,250,220,.9)"; sg.lineWidth = 2; sg.beginPath(); sg.moveTo(32, 4); sg.lineTo(32, 60); sg.moveTo(4, 32); sg.lineTo(60, 32); sg.stroke();
    const st = new THREE.CanvasTexture(sc2); st.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < 48; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, color: "#ffd04a", transparent: true, depthWrite: false, toneMapped: false }));
      sp.visible = false; sp.layers.set(L_TOKENS); scene.add(sp); this.sparks.push(sp);
    }
    const ringM = new THREE.MeshBasicMaterial({ color: "#f2b632", transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.burst = new THREE.Mesh(new THREE.TorusGeometry(.5, .035, 8, 48), ringM); this.burst.rotation.x = Math.PI / 2; this.burst.visible = false; this.burst.layers.set(L_TOKENS); scene.add(this.burst);
    scene.add(this.board);
    this.buildBoard();
  }

  /* ----- board, snakes, ladders, leaves ----- */
  private buildBoard() {
    const B = this.board, look = this.look, pal = palette(look), px = this.low ? 1536 : 2048;
    for (const t of this.texes) t.dispose(); this.texes = [];
    B.traverse((o: Obj) => { o.geometry?.dispose?.(); });
    B.clear(); this.snakes.clear();
    const T = (c: HTMLCanvasElement, srgb = true) => { const t = canvasTex(c, this.aniso, srgb); this.texes.push(t); return t; };
    const surf = document.createElement("canvas"); paintSurface(surf, px, look);
    const surfTex = T(surf), hgt = RIM_TOP - BASE;
    const plank = document.createElement("canvas"); paintPlank(plank, 1024, 96, look, 11);
    const rimTex = T(plank); rimTex.wrapS = rimTex.wrapT = THREE.RepeatWrapping;
    const metal = new THREE.MeshStandardMaterial({ color: pal.metal[1], roughness: .26, metalness: 1, envMapIntensity: 1.2 });
    if (look.model === "tray") {
      // raised squares: one merged mesh of 100 bevelled tiles; texture mapped from above
      const sh = new THREE.Shape(), a = .44, r = .06;
      sh.moveTo(-a + r, -a); sh.lineTo(a - r, -a); sh.quadraticCurveTo(a, -a, a, -a + r); sh.lineTo(a, a - r); sh.quadraticCurveTo(a, a, a - r, a); sh.lineTo(-a + r, a); sh.quadraticCurveTo(-a, a, -a, a - r); sh.lineTo(-a, -a + r); sh.quadraticCurveTo(-a, -a, -a + r, -a);
      let tile = new THREE.ExtrudeGeometry(sh, { depth: .08, bevelEnabled: true, bevelThickness: .03, bevelSize: .025, bevelSegments: 2, curveSegments: 2 });
      tile.rotateX(-Math.PI / 2); tile.translate(0, .03, 0); if (tile.index) tile = tile.toNonIndexed();
      const tp = tile.attributes.position, tn = tile.attributes.normal, n = tp.count, P = new Float32Array(n * 300), N = new Float32Array(n * 300), U = new Float32Array(n * 200);
      for (let k = 0; k < 100; k++) {
        const c = center(k + 1), cx = wx(c.x), cz = wz(c.y);
        for (let i = 0; i < n; i++) {
          const x = tp.getX(i) + cx, y = tp.getY(i), z = tp.getZ(i) + cz, o = (k * n + i);
          P[o * 3] = x; P[o * 3 + 1] = y; P[o * 3 + 2] = z; N[o * 3] = tn.getX(i); N[o * 3 + 1] = tn.getY(i); N[o * 3 + 2] = tn.getZ(i);
          U[o * 2] = (x + 5) / 10; U[o * 2 + 1] = 1 - (z + 5) / 10;
        }
      }
      tile.dispose();
      const tiles = new THREE.BufferGeometry();
      tiles.setAttribute("position", new THREE.BufferAttribute(P, 3)); tiles.setAttribute("normal", new THREE.BufferAttribute(N, 3)); tiles.setAttribute("uv", new THREE.BufferAttribute(U, 2));
      const tm = new THREE.Mesh(tiles, new THREE.MeshPhysicalMaterial({ map: surfTex, bumpMap: surfTex, bumpScale: .9, roughness: .5, metalness: 0, clearcoat: .25, clearcoatRoughness: .45, envMapIntensity: .8 }));
      tm.receiveShadow = true; tm.castShadow = true; B.add(tm);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(10.04, -BASE, 10.04), mat(pal.groove, .9)); floor.position.y = BASE / 2; floor.receiveShadow = true; B.add(floor);
      this.woodRim(B, rimTex, hgt);
      for (const [x, z, w, d] of [[0, -5.12, 10.3, .045], [0, 5.12, 10.3, .045], [-5.12, 0, .045, 10.3], [5.12, 0, .045, 10.3]]) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(w, .03, d), metal); g.position.set(x, RIM_TOP + .012, z); B.add(g);
      }
      this.leaves(B);
    } else if (look.model === "marble") {
      // one polished slab of stone; the squares, their engraved lines and the MOKSH engraving are in its top texture
      const stoneTex = rimTex.clone(); stoneTex.needsUpdate = true; this.texes.push(stoneTex); stoneTex.repeat.set(3, 3);
      const stoneM = new THREE.MeshPhysicalMaterial({ map: stoneTex, roughness: .22, metalness: 0, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1 });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, TILE_TOP - BASE - .004, HALF * 2), stoneM);
      slab.position.y = (TILE_TOP - .004 + BASE) / 2; slab.castShadow = true; slab.receiveShadow = true; B.add(slab);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshPhysicalMaterial({ map: surfTex, bumpMap: surfTex, bumpScale: .25, roughness: .2, metalness: 0, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1 }));
      top.rotation.x = -Math.PI / 2; top.position.y = TILE_TOP; top.receiveShadow = true; B.add(top);
      // a raised gold border around the squares and a gold lip around the slab's top edge
      for (const [x, z, w, d] of [[0, -5.1, 10.32, .1], [0, 5.1, 10.32, .1], [-5.1, 0, .1, 10.32], [5.1, 0, .1, 10.32]]) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(w, .035, d), metal); g.position.set(x, TILE_TOP + .012, z); g.castShadow = true; B.add(g);
      }
      for (const [x, z, w, rot] of [[0, -HALF, HALF * 2, Math.PI / 2], [0, HALF, HALF * 2, Math.PI / 2], [-HALF, 0, HALF * 2, 0], [HALF, 0, HALF * 2, 0]] as number[][]) {
        const lip = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, w, 10), metal);
        if (rot) lip.rotation.z = rot; else lip.rotation.x = Math.PI / 2;
        lip.position.set(x, TILE_TOP - .01, z); B.add(lip);
      }
    } else {
      // flat tiles with real brass strips between them; a carved wooden rim with gold rosettes on raised corner blocks
      const floor = new THREE.Mesh(new THREE.BoxGeometry(10.04, TILE_TOP - BASE, 10.04), mat(pal.tileB, .6)); floor.position.y = (TILE_TOP + BASE) / 2; floor.receiveShadow = true; B.add(floor);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshPhysicalMaterial({ map: surfTex, bumpMap: surfTex, bumpScale: .5, roughness: .36, metalness: 0, clearcoat: .55, clearcoatRoughness: .22, envMapIntensity: .8 }));
      top.rotation.x = -Math.PI / 2; top.position.y = TILE_TOP + .001; top.receiveShadow = true; B.add(top);
      const strips: Obj[] = [];
      for (let i = 0; i <= 10; i++) {
        const v = -5 + i, w = i === 0 || i === 10 ? .08 : .055;
        const a2 = new THREE.BoxGeometry(w, .022, 10 + w); a2.translate(v, TILE_TOP + .011, 0); strips.push(a2);
        const b2 = new THREE.BoxGeometry(10 + w, .022, w); b2.translate(0, TILE_TOP + .011, v); strips.push(b2);
      }
      const merged = mergeBoxes(strips); strips.forEach(g => g.dispose());
      const sm = new THREE.Mesh(merged, metal); sm.receiveShadow = true; B.add(sm);
      const stud = new THREE.InstancedMesh(new THREE.SphereGeometry(.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), metal, 81), m4 = new THREE.Matrix4();
      let k2 = 0; for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) { m4.makeTranslation(-5 + i, TILE_TOP + .018, -5 + j); stud.setMatrixAt(k2++, m4); }
      B.add(stud);
      this.woodRim(B, rimTex, hgt);
      const corner = new THREE.MeshStandardMaterial({ map: rimTex, color: "#ffffff", roughness: .45 });
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const blk = new THREE.Mesh(new THREE.BoxGeometry(RIM + .08, hgt + .1, RIM + .08), corner);
        blk.position.set(cx * (5 + RIM / 2), BASE + (hgt + .1) / 2, cz * (5 + RIM / 2)); blk.castShadow = true; blk.receiveShadow = true; B.add(blk);
        B.add(rosette(metal, cx * (5 + RIM / 2), RIM_TOP + .1, cz * (5 + RIM / 2)));
      }
      for (const [x, z, w, d] of [[0, -5.1, 10.2, .05], [0, 5.1, 10.2, .05], [-5.1, 0, .05, 10.2], [5.1, 0, .05, 10.2]]) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(w, .03, d), metal); g.position.set(x, RIM_TOP + .012, z); B.add(g);
      }
    }
    // numbers: their own transparent layer drawn above snakes and ladders, so a number is never hidden
    const nc = document.createElement("canvas"); paintNumbers(nc, px, look);
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: T(nc), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    nm.rotation.x = -Math.PI / 2; nm.position.y = TILE_TOP + .002; nm.renderOrder = 10; setLayer(nm, L_NUMBERS); this.numbersMesh = nm; B.add(nm);
    // ladders: dark polished rails, light rungs and gold caps, the same on every board so they always stand out
    const lp = document.createElement("canvas"); paintRail(lp, 512, 64, 31);
    const lt = T(lp); lt.wrapS = lt.wrapT = THREE.RepeatWrapping;
    const railM = new THREE.MeshPhysicalMaterial({ map: lt, roughness: .35, clearcoat: .6, clearcoatRoughness: .2 });
    const rungM = new THREE.MeshStandardMaterial({ color: "#e9ad62", roughness: .42 });
    for (const [s, e] of Object.entries(LADDERS)) this.ladder(+s, e, railM, rungM, metal);
    // the rare golden ladder, in polished gold so it stands apart
    const goldRail = new THREE.MeshPhysicalMaterial({ color: "#d4a640", roughness: .26, metalness: .85, clearcoat: .6, clearcoatRoughness: .15 });
    const goldRung = new THREE.MeshStandardMaterial({ color: "#f2d47a", roughness: .3, metalness: .75 });
    for (const [s, e] of Object.entries(RARE_LADDERS)) this.ladder(+s, e, goldRail, goldRung, metal);
    // snakes
    const skins = new Map<number, { col: Obj; bump: Obj; rough: Obj }>();
    Object.entries(SNAKES).forEach(([h, t]) => {
      const head = +h, sp = speciesOf(head), si = SPECIES.indexOf(sp);
      let sk = skins.get(si); if (!sk) { const c = skinCanvases(si, this.low); sk = { col: T(c.col), bump: T(c.bump, false), rough: T(c.rough, false) }; for (const x of [sk.col, sk.bump, sk.rough]) { x.wrapS = THREE.RepeatWrapping; x.wrapT = THREE.ClampToEdgeWrapping; x.flipY = false; x.needsUpdate = true; } skins.set(si, sk); }
      const cobra = sp.hood, R = cobra ? .2 : .18, rise: Rise = cobra ? { h: 0, len: 1, hood: false } : { h: .12, len: .5, hood: false };
      const body = snakeBody(head, t, R, rise);
      const skinM = new THREE.MeshPhysicalMaterial({ map: sk.col, bumpMap: sk.bump, bumpScale: 2.6, roughnessMap: sk.rough, roughness: 1, clearcoat: .45, clearcoatRoughness: .32, envMapIntensity: .7, sheen: .3, sheenColor: new THREE.Color(shade(sp.body, .5)), sheenRoughness: .5 });
      const m = new THREE.Mesh(body.g, skinM);
      m.castShadow = true; m.receiveShadow = true; B.add(m);
      const hd = snakeHead(sp, R, sk), p0 = body.at(0);
      // every head faces the square tokens arrive from (the one before it); the neck bends to suit the body's path
      const sq = center(head), prev = center(head - 1);
      const dir = new THREE.Vector3(wx(prev.x) - wx(sq.x), 0, wz(prev.y) - wz(sq.y)).normalize();
      const L = R * 3.3;
      hd.grp.rotation.order = "YXZ";
      if (cobra) {
        // the cobra rears its front third almost straight up from its coil, the hood spread wide, turned toward the
        // arriving tokens (and a little toward the players, so the hood shows), the head on top looking down at them
        const f = dir.clone().add(new THREE.Vector3(0, 0, 1.5)).normalize();
        // the rearing neck stands a little in front of the head's square, so on screen the raised head sits over it
        const base = new THREE.Vector3(p0.x, TILE_TOP + R * .45, p0.z + .3).addScaledVector(f, -.08);
        const neck = cobraNeck(base, f, R, .85, skinM, sp.belly);
        const nm = new THREE.Mesh(neck.g, skinM); nm.castShadow = true; nm.receiveShadow = true; B.add(nm);
        for (const part of neck.marks) B.add(part);
        hd.grp.position.copy(neck.top).addScaledVector(f, L * .18).add(new THREE.Vector3(0, R * .45, 0));
        hd.grp.rotation.y = Math.atan2(f.x, f.z); hd.grp.rotation.x = .38;
      } else {
        const centre = new THREE.Vector3(wx(sq.x), 0, wz(sq.y)).addScaledVector(dir, -L * .28);      // the head centred on its square
        hd.grp.position.set(centre.x, body.cyAt(0) + R * .2, centre.z);
        hd.grp.rotation.y = Math.atan2(dir.x, dir.z); hd.grp.rotation.x = .1;
      }
      B.add(hd.grp);
      this.snakes.set(head, { body, head: hd, color: sp.body, headPos: p0, dir });
    });
    B.traverse((o: Obj) => { if (o.layers.mask === 1) o.layers.set(L_BOARD); });
    this.renderer.shadowMap.needsUpdate = true;
  }
  /** The wooden rim: four planks with grain running along them and a rounded top edge. */
  private woodRim(B: Obj, rimTex: Obj, hgt: number) {
    const rimMat = new THREE.MeshPhysicalMaterial({ map: rimTex, bumpMap: rimTex, bumpScale: .8, roughness: .48, metalness: 0, clearcoat: .3, clearcoatRoughness: .4 });
    for (const [x, z, w, d] of [[0, -(5 + RIM / 2), HALF * 2, RIM], [0, 5 + RIM / 2, HALF * 2, RIM], [-(5 + RIM / 2), 0, RIM, 10], [5 + RIM / 2, 0, RIM, 10]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), rimMat); m.position.set(x, BASE + hgt / 2, z); m.castShadow = true; m.receiveShadow = true; B.add(m);
      if (d === RIM) { const lip = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, w, 12), rimMat); lip.rotation.z = Math.PI / 2; lip.position.set(x, RIM_TOP, z + (z > 0 ? RIM / 2 : -RIM / 2)); B.add(lip); }
    }
  }
  /** Palm leaves at the corners (the classic tray only). */
  private leaves(B: Obj) {
    const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(.5, .2, 1, 0); leafShape.quadraticCurveTo(.5, -.16, 0, 0);
    const leafG = new THREE.ShapeGeometry(leafShape, 10), leafMs = ["#2f8a27", "#3f9a2c", "#246f1f"].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .55, side: THREE.DoubleSide }));
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const out = Math.atan2(cz, cx);
      for (let i = 0; i < 6; i++) {
        const lf = new THREE.Mesh(leafG, leafMs[i % 3]), ang = out + (i - 2.5) * .32, l = 1.2 - Math.abs(i - 2.5) * .12;
        lf.scale.set(l, l, l); lf.rotation.set(-Math.PI / 2, 0, 0);
        const holder = new THREE.Group(); holder.add(lf); holder.rotation.set(0, -ang, .22 + (i % 2) * .12);
        holder.position.set(cx * (HALF - .1), BASE + .25, cz * (HALF - .1)); lf.castShadow = true; B.add(holder);
      }
    }
  }
  private ladder(a: number, b: number, railM: Obj, rungM: Obj, metal: Obj) {
    const p1 = center(a), p2 = center(b), s = new THREE.Vector3(wx(p1.x), 0, wz(p1.y)), e = new THREE.Vector3(wx(p2.x), 0, wz(p2.y));
    const d = e.clone().sub(s), len = d.length(), u = d.clone().normalize(), side = new THREE.Vector3(-u.z, 0, u.x), ang = Math.atan2(u.x, u.z), half = .25, ext = .17, RY = TILE_TOP + .085;
    const rail = new THREE.CylinderGeometry(.072, .072, len + ext * 2, 16), rung = new THREE.CylinderGeometry(.046, .046, half * 2 + .04, 12), cap = new THREE.SphereGeometry(.088, 14, 10);
    for (const sg of [1, -1]) {
      const r = new THREE.Mesh(rail, railM), c = s.clone().add(e).multiplyScalar(.5).addScaledVector(side, half * sg);
      r.position.set(c.x, RY, c.z); r.rotation.set(Math.PI / 2, 0, 0); r.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), ang);
      r.castShadow = true; r.receiveShadow = true; this.board.add(r);
      for (const [p, k] of [[s, -1], [e, 1]] as [Obj, number][]) { const m = new THREE.Mesh(cap, metal), q = p.clone().addScaledVector(side, half * sg).addScaledVector(u, (ext + .01) * k); m.position.set(q.x, RY, q.z); m.castShadow = true; this.board.add(m); }
    }
    const rungs = Math.max(5, Math.floor((len * 60) / 19));      // short ladders still get a full set of rungs
    for (let i = 1; i < rungs; i++) {
      const c = s.clone().addScaledVector(d, i / rungs), r = new THREE.Mesh(rung, rungM);
      r.position.set(c.x, RY + .03, c.z); r.rotation.set(0, 0, Math.PI / 2); r.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), ang);
      r.castShadow = true; r.receiveShadow = true; this.board.add(r);
    }
  }
  setLook(l: Look) { if (lookKey(l) !== lookKey(this.look)) { this.look = l; this.buildBoard(); } }

  /* ----- camera: a slightly raised view from the players' side, fitted to the space ----- */
  resize(w: number, h: number, dpr: number) {
    this.size = { w, h };
    this.dpr = dpr; this.renderer.setPixelRatio(Math.min(dpr, this.ratioCap)); this.renderer.setSize(w, h, false);
    const cam = this.camera, aspect = w / h;
    this.elevation = aspect > 1.15 ? 58 : aspect < .9 ? 71 : 63;
    cam.aspect = aspect; cam.clearViewOffset();
    const el = (this.elevation * Math.PI) / 180, dirv = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    const pts: Obj[] = [];
    for (const x of [-HALF, HALF]) for (const z of [-HALF, HALF]) { pts.push(new THREE.Vector3(x, RIM_TOP, z), new THREE.Vector3(x, BASE, z)); }
    for (const x of [-4.5, 4.5]) pts.push(new THREE.Vector3(x, FIG * .8, -4.5));             // tokens standing on the back row
    const extent = (d: number) => {
      cam.position.copy(dirv).multiplyScalar(d); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { const q = p.clone().project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      return { x0, x1, y0, y1 };
    };
    let lo = 5, hi = 120;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2, e = extent(mid); if (Math.max((e.x1 - e.x0) / 2, (e.y1 - e.y0) / 2) > .985) lo = mid; else hi = mid; }
    const e = extent(hi), cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2;
    cam.setViewOffset(w, h, (cx * w) / 2, (-cy * h) / 2, w, h); cam.updateProjectionMatrix();
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** One step lighter when frames are slow: lower resolution, then no shadows. Returns false when there is nothing left to drop. */
  degrade() {
    this.level++;
    if (this.level === 1 && this.ratioCap > 1) { this.ratioCap = 1; this.resize(this.size.w, this.size.h, this.dpr); return true; }
    if (this.level <= 2 && this.renderer.shadowMap.enabled) { this.renderer.shadowMap.enabled = false; this.scene.traverse((o: Obj) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: Obj) => { m.needsUpdate = true; }); }); return true; }
    return false;
  }
  /** Screen position (CSS px within the canvas) of a world point. */
  toScreen(x: number, y: number, z: number) { const q = new THREE.Vector3(x, y, z).project(this.camera); return { x: (q.x + 1) / 2 * this.size.w, y: (1 - q.y) / 2 * this.size.h }; }

  /* ----- per frame: tokens and swallow effects, then draw ----- */
  frame(pieces: Piece3D[], ov: Overlay3D) {
    const seen = new Set<number>();
    for (const p of pieces) {
      seen.add(p.seat);
      let f = this.figures.get(p.seat);
      if (!f || f.id !== p.piece) {
        if (f) this.scene.remove(f.grp);
        const grp = new THREE.Group(), tilt = new THREE.Group(), fig = buildFigure(p.piece);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.19, .024, 10, 48), new THREE.MeshStandardMaterial({ color: p.color, roughness: .4, emissive: p.color, emissiveIntensity: .3 }));
        ring.rotation.x = Math.PI / 2; ring.position.y = .012;
        const glow = new THREE.Mesh(new THREE.TorusGeometry(.23, .028, 10, 48), new THREE.MeshBasicMaterial({ color: "#ffd56e", transparent: true, opacity: .9, toneMapped: false }));
        glow.rotation.x = Math.PI / 2; glow.position.y = .016;
        tilt.add(fig); grp.add(tilt, ring, glow); setLayer(grp, L_TOKENS); grp.traverse((o: Obj) => { if (o.isMesh && o !== glow) o.castShadow = true; });
        this.scene.add(grp); f = { id: p.piece, grp, tilt, fig, ring, glow }; this.figures.set(p.seat, f);
      }
      const visible = p.s > .02;
      f.grp.visible = visible;
      f.grp.position.set(wx(p.x + SHIFT.x), TILE_TOP + p.h / S, wz(p.y + SHIFT.y)); f.grp.scale.setScalar(Math.max(.001, p.s) * FIG);
      f.glow.visible = p.active;
      // climbing: lean into the direction of travel and sway side to side, hand over hand
      const dx = Math.cos(p.dir ?? 0), dz = Math.sin(p.dir ?? 0);
      const qLean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dz, 0, -dx).normalize(), p.lean ?? 0);
      const qSway = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dx, 0, dz).normalize(), p.sway ?? 0);
      f.tilt.quaternion.copy(qLean).multiply(qSway);
      f.fig.rotation.x = -((this.elevation - 24) * Math.PI) / 180;          // lean back toward the camera so faces show under hats, as board-game standees do
    }
    for (const [seat, f] of this.figures) if (!seen.has(seat)) f.grp.visible = false;
    // gold sparkles and the landing ring
    const sp = ov.sparks ?? [];
    this.sparks.forEach((m, i) => {
      const k = sp[i]; m.visible = !!k; if (!k) return;
      const life = 1 - k.age, size = (.09 + .13 * Math.sin(Math.min(1, k.age * 3) * Math.PI / 2)) * life;
      m.position.set(wx(k.x), TILE_TOP + k.h / S + .2 + k.age * .55, wz(k.y)); m.scale.setScalar(Math.max(.001, size)); m.material.opacity = Math.min(1, life * 1.4);
    });
    if (ov.burst) { const k = ov.burst.k; this.burst.visible = true; this.burst.position.set(wx(ov.burst.x), TILE_TOP + .03, wz(ov.burst.y)); this.burst.scale.setScalar(.35 + k * 1.1); this.burst.material.opacity = (1 - k) * .9; }
    else this.burst.visible = false;
    // snake effects
    for (const [head, sn] of this.snakes) {
      const open = ov.mouth && ov.mouth.head === head ? ov.mouth.open : 0;
      sn.head.jaw.rotation.x = GAPE + open * .4; sn.head.skull.rotation.x = -GAPE * .35 - open * .15; sn.head.tongue.visible = false;   // always gaping, wider to swallow
    }
    const bl = ov.bulge && this.snakes.get(ov.bulge.head);
    if (bl && ov.bulge) {
      const s = Math.min(bl.body.total - .05, Math.max(.1, ov.bulge.k * bl.body.total)), c = bl.body.at(s), r = bl.body.radius(s);
      this.bulge.visible = true; this.bulge.position.set(c.x, bl.body.cyAt(s) + r * .1, c.z); this.bulge.scale.set(Math.max(r * 1.55, .14), Math.max(r * 1.35, .12), Math.max(r * 1.55, .14));
      this.bulge.material.color.set(bl.color).lerp(new THREE.Color(ov.bulge.color), .2);
    } else this.bulge.visible = false;
    this.render();
  }
  render() {
    const r = this.renderer, cam = this.camera;
    r.shadowMap.needsUpdate = true;
    r.clear();
    cam.layers.set(L_BOARD); r.render(this.scene, cam);
    r.shadowMap.needsUpdate = false;
    cam.layers.set(L_NUMBERS); r.render(this.scene, cam);
    cam.layers.set(L_TOKENS); r.render(this.scene, cam);
    cam.layers.enableAll();
  }

  /** For tests: how long a frame takes, with and without shadows. */
  perf() {
    const gl = this.renderer.getContext(), t = () => { gl.finish(); return performance.now(); };
    const time = (f: () => void) => { f(); const a = t(); for (let i = 0; i < 3; i++) f(); return Math.round((t() - a) / 3); };
    const full = time(() => this.render());
    this.renderer.shadowMap.enabled = false; const noShadow = time(() => this.render()); this.renderer.shadowMap.enabled = true;
    const one = time(() => { this.renderer.clear(); this.renderer.render(this.scene, this.camera); });
    return { full, noShadow, onePass: one, px: this.renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(), calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles };
  }
  /** For tests: screen boxes (CSS px within the canvas) of every square number and every visible token. */
  debug() {
    const m = document.createElement("canvas").getContext("2d")!; m.font = NUM_FONT_3D;
    const box = (pts: { x: number; y: number }[]): Box => ({ x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) });
    const numbers = Array.from({ length: 100 }, (_, i) => {
      const n = i + 1, a = numberAt3D(n), tw = m.measureText(String(n)).width;
      return { n, ...box([[a.x, a.y - 14], [a.x + tw, a.y - 14], [a.x, a.y + 1], [a.x + tw, a.y + 1]].map(([x, y]) => this.toScreen(wx(x), TILE_TOP, wz(y)))) };
    });
    const tokens: (Box & { seat: number; off: number })[] = [];
    for (const [seat, f] of this.figures) {
      if (!f.grp.visible) continue;
      f.grp.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(f.fig), pts: { x: number; y: number }[] = [];
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) pts.push(this.toScreen(x, y, z));
      const b = box(pts), w = b.x1 - b.x0;
      // how far the token stands from the centre of the square under it (in squares; 0 = dead centre)
      const bx = f.grp.position.x, bz = f.grp.position.z, off = Math.hypot(bx - (Math.floor(bx + 5) - 4.5), bz - (Math.floor(bz + 5) - 4.5));
      tokens.push({ seat, x0: b.x0 + w * .08, x1: b.x1 - w * .08, y0: b.y0, y1: b.y1, off });      // the figure, less the very tips of hat brims
    }
    const sq = (n: number) => { const c = center(n), a = this.toScreen(wx(c.x - 30), TILE_TOP, wz(c.y - 30)), b = this.toScreen(wx(c.x + 30), TILE_TOP, wz(c.y + 30)); return { w: b.x - a.x, h: b.y - a.y }; };
    const corners = [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]].map(([x, z]) => this.toScreen(x, RIM_TOP, z));
    const fontAt = (z: number) => { const a = this.toScreen(0, TILE_TOP, z), b = this.toScreen(22 / S, TILE_TOP, z); return b.x - a.x; };
    return { numbers, tokens, topSquare: sq(95), bottomSquare: sq(5), fontTop: fontAt(-4.5), fontBottom: fontAt(4.5), projRect: box(corners), elevation: this.elevation };
  }

  dispose() {
    for (const t of this.texes) t.dispose();
    this.scene.traverse((o: Obj) => { o.geometry?.dispose?.(); const mm = o.material; if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x: Obj) => x.dispose?.()); });
    this.scene.environment?.dispose?.();
    this.renderer.dispose();
  }
}
