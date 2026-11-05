import * as THREE from "three";
import { LADDERS, SNAKES } from "./engine";
import { NUM_FONT_3D, S, SPECIES, W, center, numberAt3D, paintNumbers, paintPlank, paintSurface, snakePath, speciesOf, type WoodId } from "./board";
import { buildFigure, gloss, gold, mat } from "./models3d";
import type { PieceId } from "./tokens";

/* The WebGL 3D board (Three.js): raised wooden squares, a rim with a gold inlay, modelled snakes and ladders, and the
   twelve token figures, under real lights and shadows. Pure presentation: it only draws what SnakesGame tells it
   (token positions, the snake mouth and bulge during a swallow); the game rules never pass through here.
   World units: 1 = one square. The board's playing area spans -5..5 on x and z; +z faces the players. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = any;

export type Piece3D = { seat: number; piece: PieceId; color: string; x: number; y: number; h: number; s: number; active: boolean };
export type Overlay3D = { mouth?: { head: number; open: number }; bulge?: { head: number; k: number; color: string } };
export type Box = { x0: number; x1: number; y0: number; y1: number };

const wx = (x: number) => (x - W / 2) / S, wz = (y: number) => (y - W / 2) / S;
const TILE_TOP = .14, RIM = .62, HALF = 5 + RIM, RIM_TOP = .26, BASE = -.5;
const L_BOARD = 0, L_NUMBERS = 1, L_TOKENS = 2;
/** Token figures are modelled about 0.9 squares tall; on the board they stand this much larger. */
const FIG = 1.32;
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
function skinCanvases(spIdx: number) {
  const sp = SPECIES[spIdx], w = 512, h = 128;
  const col = document.createElement("canvas"); col.width = w; col.height = h;
  const g = col.getContext("2d")!;
  g.fillStyle = sp.body; g.fillRect(0, 0, w, h);
  // belly (around v = .75), soft edges
  const bg = g.createLinearGradient(0, h * .55, 0, h * .95);
  bg.addColorStop(0, sp.body); bg.addColorStop(.25, sp.belly); bg.addColorStop(.75, sp.belly); bg.addColorStop(1, sp.body);
  g.fillStyle = bg; g.fillRect(0, h * .55, w, h * .4);
  // pattern on the back (v around .25)
  const top = h * .25;
  const name = sp.name;
  g.save();
  if (name === "Ruby" || name === "Tiger" || name === "Jade") {
    const c = name === "Ruby" ? "rgba(246,196,58,.95)" : name === "Tiger" ? "rgba(70,36,8,.88)" : "rgba(10,90,78,.9)", n = name === "Tiger" ? 9 : 6, bw = name === "Ruby" ? 16 : name === "Tiger" ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const x = (i + .5) * (w / n);
      g.fillStyle = c; g.beginPath(); g.ellipse(x, top, bw, h * .3, 0, 0, Math.PI * 2); g.fill();
      if (name === "Jade") { g.beginPath(); g.ellipse(x + 14, top, bw, h * .3, 0, 0, Math.PI * 2); g.fill(); }
    }
  } else if (name === "Sapphire") {
    for (let i = 0; i < 6; i++) { const x = (i + .5) * (w / 6); g.fillStyle = "rgba(150,205,255,.9)"; g.strokeStyle = "rgba(15,50,120,.7)"; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 26, top); g.lineTo(x, top - 22); g.lineTo(x + 26, top); g.lineTo(x, top + 22); g.closePath(); g.fill(); g.stroke(); }
  } else {
    const c = name === "Emerald" ? "#2a7420" : "#e7a6ff";
    for (let i = 0; i < 12; i++) { const x = (i + .5) * (w / 12); for (const dv of [-.11, .11]) { g.fillStyle = c; g.beginPath(); g.ellipse(x + (dv > 0 ? 10 : 0), top + dv * h, 9, 7, 0, 0, Math.PI * 2); g.fill(); } }
  }
  g.restore();
  // scales: a fine grid of overlapping arcs, darker edges and a lighter centre
  const bump = document.createElement("canvas"); bump.width = w; bump.height = h;
  const b = bump.getContext("2d")!; b.fillStyle = "#808080"; b.fillRect(0, 0, w, h);
  const sx = 12, sy = 9;
  for (let y = 0; y < h + sy; y += sy) for (let x = 0; x < w + sx; x += sx) {
    const ox = (Math.round(y / sy) % 2) * sx / 2;
    const gr = b.createRadialGradient(x + ox - 2, y - 2, 1, x + ox, y, sx * .7);
    gr.addColorStop(0, "#c8c8c8"); gr.addColorStop(.8, "#7a7a7a"); gr.addColorStop(1, "#404040");
    b.fillStyle = gr; b.beginPath(); b.ellipse(x + ox, y, sx * .62, sy * .7, 0, 0, Math.PI * 2); b.fill();
    g.strokeStyle = "rgba(0,0,0,.16)"; g.lineWidth = 1; g.beginPath(); g.arc(x + ox, y, sx * .55, Math.PI * .1, Math.PI * .9); g.stroke();
  }
  return { col, bump };
}

/** A snake's body: a tube along its path, thick behind the head and tapering to a fine tail, its belly flat on the board. */
function snakeBody(head: number, tail: number, R: number) {
  const pts = snakePath(head, tail).map(p => new THREE.Vector3(wx(p.x), 0, wz(p.y)));
  const len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = len[len.length - 1];
  const at = (s: number) => { let i = 1; while (i < pts.length - 1 && len[i] < s) i++; const f = (s - len[i - 1]) / ((len[i] - len[i - 1]) || 1); return pts[i - 1].clone().lerp(pts[i], f); };
  const width = (k: number) => (k < .06 ? .62 + .38 * (k / .06) : k < .35 ? 1 : Math.max(.08, 1 - Math.pow((k - .35) / .65, 1.25) * .94));
  const radius = (s: number) => R * width(s / total);
  const N = 110, RS = 12, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * total, c = at(s), a = at(Math.max(0, s - .05)), b = at(Math.min(total, s + .05));
    const t = b.sub(a).normalize(), side = new THREE.Vector3(-t.z, 0, t.x), r = radius(s), cy = TILE_TOP + r * .62;
    for (let j = 0; j <= RS; j++) {
      const ang = (j / RS) * Math.PI * 2, sn = Math.sin(ang), up = sn >= 0 ? sn * .92 : sn * .62;
      pos.push(c.x + side.x * Math.cos(ang) * r, cy + up * r, c.z + side.z * Math.cos(ang) * r);
      uv.push(s / SKIN_LEN, j / RS);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < RS; j++) { const a = i * (RS + 1) + j, b = a + RS + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return { g, at, radius, total, cyAt: (s: number) => TILE_TOP + radius(s) * .62 };
}

/** A friendly snake head: rounded skull, big eyes, a hinged lower jaw (opens to swallow) and a forked tongue. */
function snakeHead(sp: (typeof SPECIES)[number], R: number) {
  const grp = new THREE.Group(), skull = new THREE.Group(), jaw = new THREE.Group();
  const SPH = new THREE.SphereGeometry(1, 20, 14), headM = new THREE.MeshStandardMaterial({ color: sp.head, roughness: .42 });
  const k = R / .17 * .95;
  const add = (to: Obj, g: Obj, m: Obj, p: number[], s: number[] | number, r: number[] = [0, 0, 0]) => { const o = new THREE.Mesh(g, m); o.position.set(p[0] * k, p[1] * k, p[2] * k); if (typeof s === "number") o.scale.setScalar(s * k); else o.scale.set(s[0] * k, s[1] * k, s[2] * k); o.rotation.set(r[0], r[1], r[2]); o.castShadow = true; to.add(o); return o; };
  add(skull, SPH, headM, [0, .03, .1], [.2, .12, .27]);
  add(skull, SPH, mat(sp.belly, .5), [0, .0, .16], [.15, .06, .2]);
  for (const s of [-1, 1]) {
    add(skull, SPH, gloss("#fffdf6", .2), [s * .1, .1, .17], .06);
    add(skull, SPH, gloss(sp.eye, .2), [s * .108, .105, .215], .036);
    add(skull, SPH, gloss("#0b0b0b", .1), [s * .11, .107, .238], .022);
    add(skull, SPH, mat("#ffffff", .3), [s * .1, .125, .25], .009);
    add(skull, SPH, gloss("#111111", .3), [s * .035, .06, .36], .012);
  }
  add(jaw, SPH, headM, [0, -.04, .1], [.17, .05, .23]);
  add(jaw, SPH, mat("#b23345", .6), [0, -.005, .12], [.13, .025, .19]);
  jaw.position.set(0, -.01 * k, -.02 * k);
  const tongue = new THREE.Group(), red = mat("#d61f2c", .5), CY = new THREE.CylinderGeometry(1, 1, 1, 6);
  add(tongue, CY, red, [0, 0, .42], [.008, .12, .008], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) add(tongue, CY, red, [s * .015, 0, .5], [.006, .05, .006], [Math.PI / 2, 0, s * .6]);
  grp.add(skull, jaw, tongue);
  return { grp, skull, jaw, tongue };
}

/* ---------- the scene ---------- */
export class BoardScene {
  renderer: Obj; scene: Obj; camera: Obj; light: Obj;
  private board = new THREE.Group(); private numbersMesh: Obj = null; private texes: Obj[] = [];
  private figures = new Map<number, { id: PieceId; grp: Obj; fig: Obj; ring: Obj; glow: Obj }>();
  private snakes = new Map<number, { body: ReturnType<typeof snakeBody>; head: ReturnType<typeof snakeHead>; color: string; headPos: Obj; dir: Obj }>();
  private bulge: Obj;
  private size = { w: 1, h: 1 };
  private aniso = 4; private low: boolean; private wood: WoodId;
  elevation = 55;

  private ratioCap = 2; private dpr = 1; private level = 0;
  constructor(canvas: HTMLCanvasElement, wood: WoodId, low: boolean, opts: { testLite?: boolean } = {}) {
    this.low = low; this.wood = wood; this.ratioCap = opts.testLite ? .75 : low ? 1.5 : 2;
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
    // the table only catches shadows; the page shows the green felt behind
    const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: .5 }));
    table.rotation.x = -Math.PI / 2; table.position.y = BASE - .01; table.receiveShadow = true; scene.add(table);
    this.camera = new THREE.PerspectiveCamera(30, 1, .5, 120);
    this.camera.layers.enableAll();
    const bm = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshPhysicalMaterial({ color: "#888", roughness: .4, clearcoat: .5 }));
    bm.visible = false; bm.castShadow = true; this.bulge = bm; scene.add(bm);
    scene.add(this.board);
    this.buildBoard();
  }

  /* ----- board, snakes, ladders, leaves ----- */
  private buildBoard() {
    const B = this.board, wood = this.wood, px = this.low ? 1536 : 2048;
    for (const t of this.texes) t.dispose(); this.texes = [];
    B.traverse((o: Obj) => { o.geometry?.dispose?.(); });
    B.clear(); this.snakes.clear();
    const T = (c: HTMLCanvasElement, srgb = true) => { const t = canvasTex(c, this.aniso, srgb); this.texes.push(t); return t; };
    // squares: one merged mesh of 100 bevelled tiles; texture mapped from above
    const surf = document.createElement("canvas"); paintSurface(surf, px, wood);
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
    const tm = new THREE.Mesh(tiles, new THREE.MeshStandardMaterial({ map: T(surf), roughness: .48, metalness: 0, envMapIntensity: .9 }));
    tm.receiveShadow = true; tm.castShadow = true; B.add(tm);
    // the well under the squares and the board's body
    const floor = new THREE.Mesh(new THREE.BoxGeometry(10.04, -BASE, 10.04), mat("#2a1407", .9)); floor.position.y = BASE / 2; floor.receiveShadow = true; B.add(floor);
    // rim: four planks with grain running along them, a rounded top edge and a gold inlay on the inside
    const plank = document.createElement("canvas"); paintPlank(plank, 1024, 96, wood, 11);
    const rimTex = T(plank); rimTex.wrapS = rimTex.wrapT = THREE.RepeatWrapping;
    const rimMat = new THREE.MeshStandardMaterial({ map: rimTex, roughness: .5, metalness: 0 });
    const hgt = RIM_TOP - BASE;
    for (const [x, z, w, d] of [[0, -(5 + RIM / 2), HALF * 2, RIM], [0, 5 + RIM / 2, HALF * 2, RIM], [-(5 + RIM / 2), 0, RIM, 10], [5 + RIM / 2, 0, RIM, 10]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), rimMat); m.position.set(x, BASE + hgt / 2, z); m.castShadow = true; m.receiveShadow = true; B.add(m);
      if (d === RIM) { const lip = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, w, 12), rimMat); lip.rotation.z = Math.PI / 2; lip.position.set(x, RIM_TOP, z + (z > 0 ? RIM / 2 : -RIM / 2)); B.add(lip); }
    }
    for (const [x, z, w, d] of [[0, -5.12, 10.3, .045], [0, 5.12, 10.3, .045], [-5.12, 0, .045, 10.3], [5.12, 0, .045, 10.3]]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(w, .03, d), gold()); g.position.set(x, RIM_TOP + .012, z); B.add(g);
    }
    // numbers: their own transparent layer drawn above snakes and ladders, so a number is never hidden
    const nc = document.createElement("canvas"); paintNumbers(nc, px, wood);
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: T(nc), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    nm.rotation.x = -Math.PI / 2; nm.position.y = TILE_TOP + .002; nm.renderOrder = 10; setLayer(nm, L_NUMBERS); this.numbersMesh = nm; B.add(nm);
    // ladders
    const lp = document.createElement("canvas"); paintPlank(lp, 512, 64, wood, 31, "light");
    const lt = T(lp); lt.wrapS = lt.wrapT = THREE.RepeatWrapping;
    const lm = new THREE.MeshStandardMaterial({ map: lt, color: "#f2cf98", roughness: .5 });
    for (const [s, e] of Object.entries(LADDERS)) this.ladder(+s, e, lm);
    // snakes
    const skins = new Map<number, { col: Obj; bump: Obj }>();
    Object.entries(SNAKES).forEach(([h, t]) => {
      const head = +h, sp = speciesOf(head), si = SPECIES.indexOf(sp);
      let sk = skins.get(si); if (!sk) { const c = skinCanvases(si); sk = { col: T(c.col), bump: T(c.bump, false) }; for (const x of [sk.col, sk.bump]) { x.wrapS = THREE.RepeatWrapping; x.wrapT = THREE.ClampToEdgeWrapping; x.flipY = false; x.needsUpdate = true; } skins.set(si, sk); }
      const R = .21, body = snakeBody(head, t, R);
      const m = new THREE.Mesh(body.g, new THREE.MeshStandardMaterial({ map: sk.col, bumpMap: sk.bump, bumpScale: 2.2, roughness: .5, envMapIntensity: .55 }));
      m.castShadow = true; m.receiveShadow = true; B.add(m);
      const hd = snakeHead(sp, R * 1.05), p0 = body.at(0), p1 = body.at(.35), dir = p0.clone().sub(p1).normalize();
      hd.grp.position.set(p0.x - dir.x * .08, body.cyAt(0) + .01, p0.z - dir.z * .08);
      hd.grp.rotation.y = Math.atan2(dir.x, dir.z);
      B.add(hd.grp);
      this.snakes.set(head, { body, head: hd, color: sp.body, headPos: p0, dir });
    });
    // palm leaves at the corners
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
    B.traverse((o: Obj) => { if (o.layers.mask === 1) o.layers.set(L_BOARD); });
    this.renderer.shadowMap.needsUpdate = true;
  }
  private ladder(a: number, b: number, m: Obj) {
    const p1 = center(a), p2 = center(b), s = new THREE.Vector3(wx(p1.x), 0, wz(p1.y)), e = new THREE.Vector3(wx(p2.x), 0, wz(p2.y));
    const d = e.clone().sub(s), len = d.length(), u = d.clone().normalize(), side = new THREE.Vector3(-u.z, 0, u.x), ang = Math.atan2(u.x, u.z), half = .24, ext = .16;
    const rail = new THREE.CylinderGeometry(.06, .06, len + ext * 2, 14), rung = new THREE.CylinderGeometry(.04, .04, half * 2 + .06, 10);
    for (const sg of [1, -1]) {
      const r = new THREE.Mesh(rail, m), c = s.clone().add(e).multiplyScalar(.5).addScaledVector(side, half * sg);
      r.position.set(c.x, TILE_TOP + .06, c.z); r.rotation.set(Math.PI / 2, 0, 0); r.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), ang);
      r.castShadow = true; r.receiveShadow = true; this.board.add(r);
    }
    const rungs = Math.floor((len * 60) / 19);
    for (let i = 1; i < rungs; i++) {
      const c = s.clone().addScaledVector(d, i / rungs), r = new THREE.Mesh(rung, m);
      r.position.set(c.x, TILE_TOP + .085, c.z); r.rotation.set(0, 0, Math.PI / 2); r.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), ang);
      r.castShadow = true; r.receiveShadow = true; this.board.add(r);
    }
  }
  setWood(w: WoodId) { if (w !== this.wood) { this.wood = w; this.buildBoard(); } }

  /* ----- camera: a slightly raised view from the players' side, fitted to the space ----- */
  resize(w: number, h: number, dpr: number) {
    this.size = { w, h };
    this.dpr = dpr; this.renderer.setPixelRatio(Math.min(dpr, this.ratioCap)); this.renderer.setSize(w, h, false);
    const cam = this.camera, aspect = w / h;
    this.elevation = aspect > 1.15 ? 57 : aspect < .85 ? 60 : 58;
    cam.aspect = aspect; cam.clearViewOffset();
    const el = (this.elevation * Math.PI) / 180, dirv = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    const pts: Obj[] = [];
    for (const x of [-HALF, HALF]) for (const z of [-HALF, HALF]) { pts.push(new THREE.Vector3(x, RIM_TOP, z), new THREE.Vector3(x, BASE, z)); }
    for (const x of [-4.6, 4.6]) pts.push(new THREE.Vector3(x, FIG * .95, -4.6));            // tokens standing on the back row
    const extent = (d: number) => {
      cam.position.copy(dirv).multiplyScalar(d); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { const q = p.clone().project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      return { x0, x1, y0, y1 };
    };
    let lo = 5, hi = 120;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2, e = extent(mid); if (Math.max((e.x1 - e.x0) / 2, (e.y1 - e.y0) / 2) > .97) lo = mid; else hi = mid; }
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
        const grp = new THREE.Group(), fig = buildFigure(p.piece);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.24, .026, 10, 48), new THREE.MeshStandardMaterial({ color: p.color, roughness: .4, emissive: p.color, emissiveIntensity: .25 }));
        ring.rotation.x = Math.PI / 2; ring.position.y = .015;
        const glow = new THREE.Mesh(new THREE.TorusGeometry(.285, .03, 10, 48), new THREE.MeshBasicMaterial({ color: "#ffd56e", transparent: true, opacity: .9, toneMapped: false }));
        glow.rotation.x = Math.PI / 2; glow.position.y = .02;
        grp.add(fig, ring, glow); setLayer(grp, L_TOKENS); grp.traverse((o: Obj) => { if (o.isMesh && o !== glow) o.castShadow = true; });
        this.scene.add(grp); f = { id: p.piece, grp, fig, ring, glow }; this.figures.set(p.seat, f);
      }
      const visible = p.s > .02;
      f.grp.visible = visible;
      f.grp.position.set(wx(p.x + SHIFT.x), TILE_TOP + p.h / S, wz(p.y + SHIFT.y)); f.grp.scale.setScalar(Math.max(.001, p.s) * FIG);
      f.glow.visible = p.active;
    }
    for (const [seat, f] of this.figures) if (!seen.has(seat)) f.grp.visible = false;
    // snake effects
    for (const [head, sn] of this.snakes) {
      const open = ov.mouth && ov.mouth.head === head ? ov.mouth.open : 0;
      sn.head.jaw.rotation.x = open * .75; sn.head.skull.rotation.x = -open * .28; sn.head.tongue.visible = open < .05;
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
      return { n, ...box([[a.x, a.y - 16], [a.x + tw, a.y - 16], [a.x, a.y + 1], [a.x + tw, a.y + 1]].map(([x, y]) => this.toScreen(wx(x), TILE_TOP, wz(y)))) };
    });
    const tokens: (Box & { seat: number })[] = [];
    for (const [seat, f] of this.figures) {
      if (!f.grp.visible) continue;
      f.grp.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(f.fig), pts: { x: number; y: number }[] = [];
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) pts.push(this.toScreen(x, y, z));
      const b = box(pts), w = b.x1 - b.x0;
      tokens.push({ seat, x0: b.x0 + w * .08, x1: b.x1 - w * .08, y0: b.y0, y1: b.y1 });      // the figure, less the very tips of hat brims
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
