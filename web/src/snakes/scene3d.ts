import * as THREE from "three";
import { LADDERS, RARE_LADDERS, SNAKES } from "./engine";
import { NUM_FONT_3D, PAD, S, W, center, lookKey, numberAt3D, paintNumbers, paintPlank, paintRail, paintSurface, palette, type Look } from "./board";
import { SnakeArt, type SnakeOverlay } from "./snake2d";
import { buildFigure, gloss, gold, mat } from "./models3d";
import type { PieceId } from "./tokens";

/* The WebGL 3D board (Three.js): one of three board models (a framed tray of raised squares, a polished marble slab, or
   flat tiles with brass inlay and carved corners) in a light theme, modelled ladders and the token figures under real
   lights and shadows, and the snakes painted in 2D (snake2d.ts) on a flat layer lying just above the squares, under the
   numbers and the tokens. Pure presentation: it only draws what SnakesGame tells it (token positions, the snake's mouth,
   facing and bulge during a swallow); the game rules never pass through here.
   World units: 1 = one square. The board's playing area spans -5..5 on x and z; +z faces the players. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = any;

/** One token to draw: where it stands (board units), how high it is lifted (h) and scaled (s); while climbing a ladder it
    leans toward `dir` (radians on the board, 0 = toward +x) by `lean` and sways side to side by `sway`. */
export type Piece3D = { seat: number; piece: PieceId; color: string; x: number; y: number; h: number; s: number; active: boolean; lean?: number; sway?: number; dir?: number };
/** Effects over the board: a snake's open mouth, a swallowed token's bulge, gold sparkles (age 0..1) and a landing ring. */
/** What to draw over the board this frame: the snakes' mouth and bulge (snake2d.ts), the squares tokens stand on (the
    snakes turn toward a token next to them), whether the snakes may slither (false: reduced motion or a hidden page),
    gold sparkles and the landing ring. */
export type Overlay3D = SnakeOverlay & { tokens?: number[]; motion?: boolean; sparks?: { x: number; y: number; h: number; age: number }[]; burst?: { x: number; y: number; k: number } };
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
  /** The painted snakes: drawn into a canvas that lies on the playing surface as a transparent texture. */
  private snakeArt: SnakeArt; private snakeCanvas = document.createElement("canvas"); private snakeTex: Obj = null; private snakeMesh: Obj = null;
  private size = { w: 1, h: 1 };
  private aniso = 4; private low: boolean; private look: Look;
  private sparks: Obj[] = []; private burst: Obj;
  elevation = 55;

  private ratioCap = 2; private dpr = 1; private level = 0;
  constructor(canvas: HTMLCanvasElement, look: Look, low: boolean, opts: { testLite?: boolean } = {}) {
    this.snakeArt = new SnakeArt(low ? 2.2 : 3);
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
    B.clear();
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
      const tm = new THREE.Mesh(tiles, new THREE.MeshStandardMaterial({ map: surfTex, roughness: .5, metalness: 0, envMapIntensity: .8 }));
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
      const stoneM = new THREE.MeshPhysicalMaterial({ map: stoneTex, roughness: .28, metalness: 0, clearcoat: .7, clearcoatRoughness: .12, envMapIntensity: .9 });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, TILE_TOP - BASE - .004, HALF * 2), stoneM);
      slab.position.y = (TILE_TOP - .004 + BASE) / 2; slab.castShadow = true; slab.receiveShadow = true; B.add(slab);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshPhysicalMaterial({ map: surfTex, roughness: .24, metalness: 0, clearcoat: .8, clearcoatRoughness: .1, envMapIntensity: .9 }));
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
      const top = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshPhysicalMaterial({ map: surfTex, roughness: .32, metalness: 0, clearcoat: .5, clearcoatRoughness: .2, envMapIntensity: .8 }));
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
    // snakes: painted in 2D on a transparent layer just above the squares (and above the inlay's brass strips), under
    // the ladders, the numbers and the tokens; it catches the tokens' and ladders' shadows like the board does
    const spx = this.low ? 1024 : 1536; this.snakeCanvas.width = this.snakeCanvas.height = spx;
    const stex = T(this.snakeCanvas); stex.anisotropy = Math.min(4, this.aniso); this.snakeTex = stex;
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ map: stex, transparent: true, depthWrite: false, roughness: .55, metalness: 0, alphaTest: .01 }));
    sm.rotation.x = -Math.PI / 2; sm.position.y = TILE_TOP + .026; sm.receiveShadow = true; sm.renderOrder = 2; this.snakeMesh = sm; B.add(sm);
    B.traverse((o: Obj) => { if (o.layers.mask === 1) o.layers.set(L_BOARD); });
    this.renderer.shadowMap.needsUpdate = true;
  }
  /** The wooden rim: four planks with grain running along them and a rounded top edge. */
  private woodRim(B: Obj, rimTex: Obj, hgt: number) {
    const rimMat = new THREE.MeshStandardMaterial({ map: rimTex, roughness: .5, metalness: 0 });
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
    const rungs = Math.floor((len * 60) / 19);
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
  frame(pieces: Piece3D[], ov: Overlay3D): boolean {
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
    // the snakes: slithering, heads turning, the swallow
    const busy = this.paintSnakes(ov);
    this.render();
    return busy;
  }
  /** For tests: the snake heads' angles. */
  snakeState() { return this.snakeArt.state(); }
  /** Repaints the snake layer for this moment. Returns true while a head is turning or a tongue is out. */
  private paintSnakes(ov: Overlay3D) {
    const c = this.snakeCanvas, g = c.getContext("2d")!, k = c.width / (S * 10);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(k, 0, 0, k, -PAD * k, -PAD * k);
    const busy = this.snakeArt.paint(g, performance.now(), ov, ov.tokens ?? [], ov.motion !== false);
    if (this.snakeTex) this.snakeTex.needsUpdate = true;
    return busy;
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
