/* Royal Club Chess — the 3D board.
   A marble-and-gold board on a dark table, with turned ivory-and-gold and obsidian-and-gold pieces, soft shadows and
   reflections. Built entirely in code; the chess page (public/chess/index.html) keeps all the rules and simply tells
   this board what to show. Loaded only when the 3D view is chosen, so the flat board stays as light as before.

   Later, artist-made models (one GLB per piece) can replace the turned pieces: see MODEL_URL below.

   API (window.RoyalChess3D):
     mount(container, { onTap(square) }) -> board
     board.update(state)   state = { board, orient, selected, targets, last, check, hint, animate }
     board.destroy() */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

type Letter = string;            // "P" "n" ... (uppercase white)
type Move = { from: string; to: string; piece: Letter; captured?: Letter | null; flag?: string; promotion?: Letter | null; color?: "w" | "b" };
export type State = {
  board: (Letter | null)[][];    // row 0 = rank 8, col 0 = file a
  orient: "w" | "b";
  selected?: string | null;
  targets?: { sq: string; capture: boolean }[];
  last?: Move | null;
  check?: string | null;
  hint?: { from: string; to: string } | null;
  animate?: boolean;             // true when `last` is a new move to play out
};
type Obj = any;                  // three.js is untyped in this project

const FILES = "abcdefgh";
const reduced = (() => {
  try { const v = localStorage.getItem("rc-reduce-motion"); if (v === "on") return true; if (v === "off") return false; } catch { /* ignore */ }
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
})();
const sqX = (sq: string) => FILES.indexOf(sq[0]) - 3.5;
const sqZ = (sq: string) => 3.5 - (Number(sq[1]) - 1);            // rank 1 nearest white (+z)
const at = (sq: string) => new THREE.Vector3(sqX(sq), BOARD_TOP, sqZ(sq));
const BOARD_TOP = 0.16;
const HY = 1.32;                 // pieces are turned a little taller than they are wide, like a tournament set

/* ---------- textures drawn in code ---------- */
function rnd(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function marbleBoard(size = 1024) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d")!, q = size / 8, r = rnd(7);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const dark = (row + col) % 2 === 1, x = col * q, y = row * q;
    const grad = g.createLinearGradient(x, y, x + q, y + q);
    if (dark) { grad.addColorStop(0, "#21473a"); grad.addColorStop(.55, "#173628"); grad.addColorStop(1, "#0f271d"); }
    else { grad.addColorStop(0, "#fbf5e8"); grad.addColorStop(.6, "#efe4cc"); grad.addColorStop(1, "#e4d4b2"); }
    g.fillStyle = grad; g.fillRect(x, y, q, q);
    // veins: soft wandering lines
    g.save(); g.beginPath(); g.rect(x, y, q, q); g.clip();
    for (let v = 0; v < 5; v++) {
      g.beginPath();
      let px = x + r() * q, py = y + r() * q, a = r() * Math.PI * 2;
      g.moveTo(px, py);
      for (let s = 0; s < 14; s++) { a += (r() - .5) * .9; px += Math.cos(a) * q * .09; py += Math.sin(a) * q * .09; g.lineTo(px, py); }
      g.strokeStyle = dark ? `rgba(${120 + r() * 60},${170 + r() * 50},${120 + r() * 40},${.08 + r() * .14})` : `rgba(${150 + r() * 40},${130 + r() * 30},${90 + r() * 30},${.08 + r() * .16})`;
      g.lineWidth = .6 + r() * 2.2; g.stroke();
    }
    g.restore();
    g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, q - 1, q - 1);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function frameLabels(size = 1024, inner = 8, outer = 9.4) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d")!, u = size / outer, m = (outer - inner) / 2 * u;
  g.fillStyle = "#e9c873"; g.font = `700 ${Math.round(u * .26)}px Georgia, serif`; g.textAlign = "center"; g.textBaseline = "middle";
  for (let i = 0; i < 8; i++) {
    const x = m + (i + .5) * u, y = m + (i + .5) * u;
    g.fillText(FILES[i], x, size - m / 2); g.fillText(FILES[i], x, m / 2);
    g.fillText(String(8 - i), m / 2, y); g.fillText(String(8 - i), size - m / 2, y);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function woodTexture(size = 512) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d")!, r = rnd(3);
  g.fillStyle = "#3a2213"; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const y = r() * size; g.strokeStyle = `rgba(${90 + r() * 50},${50 + r() * 30},${20 + r() * 15},${.15 + r() * .25})`; g.lineWidth = 1 + r() * 4;
    g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= size; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 4 + (r() - .5) * 3); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function radial(inner: string, outer: string, size = 256) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d")!, gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------- the pieces: turned ivory / obsidian with gold collars and a jewelled gold base ---------- */
type Mats = { body: Obj; gold: Obj; jewel: Obj };
function makeMats(): { w: Mats; b: Mats } {
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9ab45, metalness: 1, roughness: .28 });
  return {
    w: { body: new THREE.MeshPhysicalMaterial({ color: 0xf3e7cc, roughness: .32, clearcoat: .7, clearcoatRoughness: .18, sheen: .4, sheenColor: 0xfff3d6 }), gold, jewel: new THREE.MeshStandardMaterial({ color: 0x0f8a5f, roughness: .15, metalness: .2, emissive: 0x053d29, emissiveIntensity: .4 }) },
    b: { body: new THREE.MeshPhysicalMaterial({ color: 0x17191b, roughness: .22, clearcoat: 1, clearcoatRoughness: .12, metalness: .15 }), gold, jewel: new THREE.MeshStandardMaterial({ color: 0xb3122a, roughness: .15, metalness: .2, emissive: 0x4a0510, emissiveIntensity: .4 }) },
  };
}
const v2 = (pts: number[][]) => pts.map(([x, y]) => new THREE.Vector2(x, y));
const BASE = [[0, 0], [.36, 0], [.375, .015], [.375, .055], [.355, .075], [.315, .09], [.29, .105], [.26, .115]];
const PROFILE: Record<string, number[][]> = {
  P: [...BASE, [.17, .13], [.13, .18], [.1, .26], [.09, .3], [.15, .315], [.15, .335], [.09, .35], [0, .35]],
  R: [...BASE, [.23, .13], [.21, .18], [.195, .4], [.235, .43], [.245, .52], [.18, .52], [.18, .49], [0, .49]],
  B: [...BASE, [.18, .13], [.125, .2], [.085, .4], [.15, .415], [.15, .435], [.08, .45], [0, .45]],
  Q: [...BASE, [.2, .13], [.145, .2], [.095, .46], [.17, .485], [.17, .505], [.1, .52], [.12, .6], [.175, .69], [.15, .705], [.1, .67], [0, .67]],
  K: [...BASE, [.21, .13], [.15, .2], [.1, .5], [.18, .525], [.18, .545], [.11, .565], [.13, .66], [.165, .74], [.12, .755], [0, .755]],
  N: [...BASE, [.2, .13], [.17, .17], [.2, .21], [.2, .225], [0, .225]],
};
const COLLARS: Record<string, [number, number][]> = {            // [radius, height] of gold bands
  P: [[.3, .1], [.152, .325]], R: [[.3, .1], [.24, .435]], B: [[.3, .1], [.152, .425]], Q: [[.3, .1], [.172, .495]], K: [[.3, .1], [.182, .535]], N: [[.3, .1], [.2, .217]],
};
const geoCache = new Map<string, Obj>();
const geo = (key: string, make: () => Obj) => { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; };

function knightHead(): Obj {
  const s = new THREE.Shape();
  s.moveTo(-.15, 0); s.lineTo(.13, 0);
  s.quadraticCurveTo(.15, .1, .2, .18); s.quadraticCurveTo(.26, .24, .3, .27);
  s.quadraticCurveTo(.33, .31, .29, .35); s.quadraticCurveTo(.2, .38, .13, .43);
  s.lineTo(.1, .52); s.lineTo(.05, .45); s.lineTo(.0, .5); s.lineTo(-.04, .42);
  s.quadraticCurveTo(-.13, .36, -.16, .26); s.quadraticCurveTo(-.19, .14, -.15, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: .15, bevelEnabled: true, bevelThickness: .035, bevelSize: .03, bevelSegments: 4, curveSegments: 10 });
  g.translate(0, 0, -.075); g.scale(1.1, HY, 1.1); g.computeVertexNormals(); return g;
}
function mane(): Obj {
  const s = new THREE.Shape();
  s.moveTo(-.05, .44); s.quadraticCurveTo(-.17, .36, -.2, .2); s.lineTo(-.17, .05); s.quadraticCurveTo(-.13, .3, -.02, .41); s.lineTo(-.05, .44);
  const g = new THREE.ExtrudeGeometry(s, { depth: .07, bevelEnabled: true, bevelThickness: .015, bevelSize: .012, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -.035); g.scale(1.1, HY, 1.1); return g;
}

function buildPiece(letter: Letter, mats: { w: Mats; b: Mats }): Obj {
  const white = letter === letter.toUpperCase(), T = letter.toUpperCase(), m = white ? mats.w : mats.b;
  const grp = new THREE.Group(); grp.userData.letter = letter;
  const body = new THREE.Group(); grp.add(body); grp.userData.body = body;
  const add = (g: Obj, mat: Obj, y = 0, x = 0, z = 0) => { const me = new THREE.Mesh(g, mat); me.position.set(x, y * HY, z); me.castShadow = true; me.receiveShadow = true; body.add(me); return me; };
  add(geo("lathe" + T, () => new THREE.LatheGeometry(v2(PROFILE[T]), 40).scale(1, HY, 1)), m.body);
  add(geo("baseRim", () => new THREE.TorusGeometry(.372, .016, 10, 48).rotateX(Math.PI / 2)), m.gold, .04);
  for (const [r, y] of COLLARS[T]) add(geo(`band${r}`, () => new THREE.TorusGeometry(r, .013, 8, 40).rotateX(Math.PI / 2)), m.gold, y);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; add(geo("gem", () => new THREE.SphereGeometry(.022, 12, 10)), m.jewel, .036, Math.cos(a) * .376, Math.sin(a) * .376); }
  switch (T) {
    case "P": add(geo("pawnHead", () => new THREE.SphereGeometry(.11, 28, 20)), m.body, .44); break;
    case "R":
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const me = add(geo("merlon", () => new THREE.BoxGeometry(.09, .07, .07)), m.body, .555, Math.cos(a) * .2, Math.sin(a) * .2); me.rotation.y = -a; }
      add(geo("rookGold", () => new THREE.CylinderGeometry(.17, .17, .012, 32)), m.gold, .492);
      break;
    case "B": {
      add(geo("mitre", () => new THREE.LatheGeometry(v2([[0, .43], [.1, .47], [.125, .55], [.105, .63], [.055, .7], [0, .725]]), 32).scale(1, HY, 1)), m.body);
      add(geo("bishopTop", () => new THREE.SphereGeometry(.035, 16, 12)), m.gold, .755);
      const slit = add(geo("slit", () => new THREE.BoxGeometry(.012, .13, .2)), m.gold, .585, .03); slit.rotation.z = -.55;
      break;
    }
    case "Q":
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; add(geo("pearl", () => new THREE.SphereGeometry(.028, 12, 10)), m.gold, .71, Math.cos(a) * .158, Math.sin(a) * .158); }
      add(geo("queenTop", () => new THREE.SphereGeometry(.055, 20, 16)), m.gold, .73);
      add(geo("queenGem", () => new THREE.SphereGeometry(.025, 12, 10)), m.jewel, .79);
      break;
    case "K":
      add(geo("crossV", () => new THREE.BoxGeometry(.055, .24, .055)), m.gold, .85);
      add(geo("crossH", () => new THREE.BoxGeometry(.15, .05, .05)), m.gold, .875);
      add(geo("kingGem", () => new THREE.SphereGeometry(.022, 12, 10)), m.jewel, .875, 0, .03);
      break;
    case "N": {
      const head = add(geo("knightHead", knightHead), m.body, .2);
      head.rotation.y = white ? Math.PI / 2 : -Math.PI / 2;
      const mn = add(geo("mane", mane), m.gold, .2); mn.rotation.y = head.rotation.y;
      for (const side of [-1, 1]) {
        const eye = add(geo("eye", () => new THREE.SphereGeometry(.018, 10, 8)), m.jewel, .2 + .37, 0, 0);
        const fx = .19 * 1.1, fz = side * .115;          // eye on each side of the head, in head space -> rotate into place
        const c = Math.cos(head.rotation.y), s2 = Math.sin(head.rotation.y);
        eye.position.x = fx * c + fz * s2; eye.position.z = -fx * s2 + fz * c;
      }
      break;
    }
  }
  return grp;
}

/* ---------- the board ---------- */
class Board3D {
  private renderer: Obj; private scene: Obj; private camera: Obj; private el: HTMLElement; private ro: ResizeObserver;
  private mats = makeMats(); private pieces = new Map<string, Obj>(); private marks: Obj; private markGeo: Record<string, Obj> = {};
  private az = 0; private el0 = 40; private elev = 40; private azBase = 0; private orient: "w" | "b" = "w";
  private tweens: { t0: number; dur: number; f: (k: number) => void; done?: () => void }[] = [];
  private raf = 0; private dirty = true; private lastKey = ""; private selected: string | null = null; private onTap: (sq: string) => void;
  private alive = true; private pending: State | null = null; private after: (() => void) | null = null;

  constructor(el: HTMLElement, opts: { onTap: (sq: string) => void }) {
    this.el = el; this.onTap = opts.onTap;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.className = "b3d-canvas"; el.appendChild(r.domElement);
    const sc = this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), .04).texture; sc.environmentIntensity = .55;
    this.camera = new THREE.PerspectiveCamera(30, 1, .1, 100);

    // lights: warm key from the front left with soft shadows, cool fill, a little glow from above
    sc.add(new THREE.HemisphereLight(0xfff1d6, 0x20140c, .35));
    const key = new THREE.DirectionalLight(0xffe7c2, 2.2); key.position.set(-5, 11, 6); key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536); key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 1; key.shadow.camera.far = 30; key.shadow.bias = -.0004; key.shadow.normalBias = .02; key.shadow.radius = 4; sc.add(key);
    const fill = new THREE.DirectionalLight(0xbcd2ff, .5); fill.position.set(6, 6, -4); sc.add(fill);

    // table, frame, gold trim, marble squares and coordinates
    const table = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: radial("#3b2a1a", "#0b0705"), roughness: .9 }));
    table.rotation.x = -Math.PI / 2; table.position.y = -.2; table.receiveShadow = true; sc.add(table);
    const wood = woodTexture(); wood.repeat.set(2, 2);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(9.4, .36, 9.4), new THREE.MeshPhysicalMaterial({ map: wood, roughness: .35, clearcoat: .8, clearcoatRoughness: .2 }));
    frame.position.y = -.03; frame.castShadow = true; frame.receiveShadow = true; sc.add(frame);
    const goldTrim = new THREE.MeshStandardMaterial({ color: 0xd4a63e, metalness: 1, roughness: .3 });
    for (const [w, d, x, z] of [[8.18, .09, 0, 4.045], [8.18, .09, 0, -4.045], [.09, 8.18, 4.045, 0], [.09, 8.18, -4.045, 0], [9.42, .05, 0, 4.69], [9.42, .05, 0, -4.69], [.05, 9.42, 4.69, 0], [.05, 9.42, -4.69, 0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, .05, d), goldTrim); b.position.set(x, BOARD_TOP + .005, z); b.castShadow = true; sc.add(b);
    }
    const squares = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshPhysicalMaterial({ map: marbleBoard(), roughness: .22, clearcoat: .9, clearcoatRoughness: .08 }));
    squares.rotation.x = -Math.PI / 2; squares.position.y = BOARD_TOP + .002; squares.receiveShadow = true; sc.add(squares);
    const labels = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 9.4), new THREE.MeshBasicMaterial({ map: frameLabels(), transparent: true, depthWrite: false }));
    labels.rotation.x = -Math.PI / 2; labels.position.y = BOARD_TOP - .005; sc.add(labels);

    // square highlights (selection, last move, targets, check, hint)
    this.marks = new THREE.Group(); sc.add(this.marks);
    this.markGeo.square = new THREE.PlaneGeometry(.98, .98).rotateX(-Math.PI / 2);
    this.markGeo.dot = new THREE.CircleGeometry(.14, 28).rotateX(-Math.PI / 2);
    this.markGeo.ring = new THREE.RingGeometry(.38, .46, 40).rotateX(-Math.PI / 2);

    // input: tap a square, drag to turn and tilt the board
    const cv = r.domElement as HTMLCanvasElement; cv.style.touchAction = "none";
    let down: { x: number; y: number; az: number; el: number; drag: boolean; id: number } | null = null;
    cv.addEventListener("pointerdown", (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, az: this.az, el: this.elev, drag: false, id: e.pointerId }; cv.setPointerCapture?.(e.pointerId); });
    cv.addEventListener("pointermove", (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.drag && Math.hypot(dx, dy) > 8) down.drag = true;
      if (down.drag) { this.az = Math.max(-1, Math.min(1, down.az - dx * .006)); this.elev = Math.max(24, Math.min(80, down.el + dy * .25)); this.place(); }
    });
    const up = (e: PointerEvent) => { if (!down) return; const d = down; down = null; if (!d.drag) { const sq = this.pick(e); if (sq) this.onTap(sq); } };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", () => { down = null; });
    cv.addEventListener("dblclick", () => { this.az = 0; this.elev = this.el0; this.place(); });

    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el);
    this.resize(); this.place(); this.loop();
  }
  private resize() {
    const w = this.el.clientWidth || 300, h = this.el.clientHeight || 300;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.place();
  }
  /** Camera on a sphere around the board centre; distance chosen so the whole board fits. */
  private place() {
    const a = this.azBase + this.az, e = this.elev * Math.PI / 180;
    const fit = 9.6 / (2 * Math.tan((this.camera.fov * Math.PI / 180) / 2)) / Math.min(1, this.camera.aspect);
    const d = fit * (1.02 + .06 * Math.cos(e));
    this.camera.position.set(Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d, Math.cos(a) * Math.cos(e) * d);
    this.camera.lookAt(Math.sin(a) * .3 * Math.cos(e), 0, Math.cos(a) * .3 * Math.cos(e));     // aim a touch nearer than the centre: the board sits centred on screen
    this.dirty = true;
  }
  private pick(e: PointerEvent): string | null {
    const rect = (this.renderer.domElement as HTMLCanvasElement).getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(p, this.camera);
    // a tap on a piece counts for its square
    const hits = ray.intersectObjects([...this.pieces.values()], true);
    for (const h of hits) { let o = h.object; while (o && !o.userData.sq) o = o.parent; if (o?.userData.sq) return o.userData.sq; }
    const pt = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_TOP), pt)) return null;
    const col = Math.floor(pt.x + 4), row = Math.floor(4 - pt.z);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return FILES[col] + (row + 1);
  }

  /* ---------- pieces ---------- */
  private create(letter: Letter, sq: string) {
    const g = buildPiece(letter, this.mats); g.position.copy(at(sq)); g.userData.sq = sq; this.scene.add(g); return g;
  }
  private remove(g: Obj) { this.scene.remove(g); g.traverse((o: Obj) => { if (o.material?.userData?.clone) o.material.dispose(); }); }
  private sync(board: (Letter | null)[][]) {
    const want = new Map<string, Letter>();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = board[r][c]; if (p) want.set(FILES[c] + (8 - r), p); }
    for (const [sq, g] of [...this.pieces]) if (want.get(sq) !== g.userData.letter) { this.remove(g); this.pieces.delete(sq); }
    for (const [sq, p] of want) {
      let g = this.pieces.get(sq);
      if (!g) { g = this.create(p, sq); this.pieces.set(sq, g); }
      g.position.copy(at(sq)); g.rotation.set(0, 0, 0); g.userData.sq = sq; g.userData.body.position.set(0, 0, 0); g.userData.body.rotation.set(0, 0, 0); g.userData.body.scale.set(1, 1, 1); g.quaternion.identity(); g.scale.setScalar(1); g.visible = true;
    }
    this.dirty = true;
  }

  private tween(dur: number, f: (k: number) => void, done?: () => void) { this.tweens.push({ t0: performance.now(), dur, f, done }); this.dirty = true; }

  /** Plays out a move: slide (the knight leaps), the captured piece topples and fades, castling moves the rook too. */
  private playMove(m: Move, after: () => void) {
    const mover = this.pieces.get(m.from); if (!mover) { after(); return; }
    const epSq = m.flag === "e" ? m.to[0] + m.from[1] : m.to;
    const victim = m.captured ? this.pieces.get(epSq) : null;
    this.pieces.delete(m.from); if (victim) this.pieces.delete(epSq); this.pieces.set(m.to, mover); mover.userData.sq = m.to;
    const T = m.piece.toUpperCase(), from = at(m.from), to = at(m.to), dist = from.distanceTo(to);
    const leap = T === "N", dur = reduced ? 160 : Math.min(760, 340 + dist * 70) + (leap ? 120 : 0) + (victim ? 120 : 0);
    const dir = new THREE.Vector3().subVectors(to, from).setY(0).normalize();
    let toppled = false;
    this.tween(dur, k => {
      const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      mover.position.lerpVectors(from, to, e);
      const lift = leap ? Math.sin(k * Math.PI) * (.9 + dist * .05) : Math.sin(k * Math.PI) * (T === "P" ? .12 : .2);
      mover.position.y = BOARD_TOP + lift;
      // lean into the move, settle upright on landing
      const tilt = Math.sin(k * Math.PI) * (leap ? .35 : .12);
      mover.userData.body.rotation.set(dir.z * tilt, 0, -dir.x * tilt);
      if (victim && !toppled && k > .72) { toppled = true; this.topple(victim, dir, T); }
    }, () => {
      mover.position.copy(to); mover.userData.body.rotation.set(0, 0, 0);
      // a little landing squash
      if (!reduced) this.tween(180, k => { const s = 1 - Math.sin(k * Math.PI) * .06; mover.userData.body.scale.set(1 + (1 - s) * .6, s, 1 + (1 - s) * .6); }, () => mover.userData.body.scale.set(1, 1, 1));
      if (victim && !toppled) this.topple(victim, dir, T);
      after();
    });
    if (m.flag === "k" || m.flag === "q") {
      const rank = m.from[1], rf = (m.flag === "k" ? "h" : "a") + rank, rt = (m.flag === "k" ? "f" : "d") + rank, rook = this.pieces.get(rf);
      if (rook) {
        this.pieces.delete(rf); this.pieces.set(rt, rook); rook.userData.sq = rt; const a = at(rf), b = at(rt);
        this.tween(reduced ? 160 : 520, k => { const e = k * k * (3 - 2 * k); rook.position.lerpVectors(a, b, e); rook.position.y = BOARD_TOP + Math.sin(k * Math.PI) * .25; }, () => rook.position.copy(b));
      }
    }
  }
  /** The captured piece is struck: it rocks back, topples over away from the attacker, slides off and fades. */
  private topple(g: Obj, dir: Obj, by: string) {
    g.traverse((o: Obj) => { if (o.isMesh) { const m = o.material.clone(); m.transparent = true; m.userData.clone = true; o.material = m; } });
    const start = g.position.clone(), axis = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const heavy = by === "R" || by === "K", fling = by === "N" ? 1.6 : heavy ? .6 : 1;
    const flash = new THREE.Mesh(this.markGeo.ring, new THREE.MeshBasicMaterial({ color: 0xffd36e, transparent: true, opacity: .9, depthWrite: false }));
    flash.position.set(start.x, BOARD_TOP + .02, start.z); this.scene.add(flash);
    this.tween(reduced ? 200 : 820, k => {
      const fall = Math.min(1, k / .45), e = 1 - Math.pow(1 - fall, 3);
      const q = new THREE.Quaternion().setFromAxisAngle(axis, e * Math.PI / 2 * 1.05);
      g.quaternion.copy(q);
      g.position.set(start.x + dir.x * k * .55 * fling, BOARD_TOP + (heavy ? -k * .15 : Math.sin(Math.min(1, k * 1.4) * Math.PI) * .25 * fling) - Math.max(0, k - .6) * .5, start.z + dir.z * k * .55 * fling);
      const op = 1 - Math.max(0, (k - .45) / .55);
      g.traverse((o: Obj) => { if (o.isMesh) o.material.opacity = op; });
      flash.scale.setScalar(1 + k * 1.6); flash.material.opacity = .9 * (1 - Math.min(1, k * 2));
    }, () => { this.remove(g); this.scene.remove(flash); flash.material.dispose(); });
  }

  /* ---------- highlights ---------- */
  private mark(sq: string, kind: "square" | "dot" | "ring", color: number, opacity: number, lift = .004) {
    const m = new THREE.Mesh(this.markGeo[kind], new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    const p = at(sq); m.position.set(p.x, BOARD_TOP + lift, p.z); m.renderOrder = 2; this.marks.add(m);
  }
  private drawMarks(s: State) {
    for (const m of [...this.marks.children]) { this.marks.remove(m); m.material.dispose(); }
    if (s.last) { this.mark(s.last.from, "square", 0xf3cf6a, .3); this.mark(s.last.to, "square", 0xf3cf6a, .38); }
    if (s.hint) { this.mark(s.hint.from, "square", 0x46d38f, .45); this.mark(s.hint.to, "square", 0x46d38f, .55); }
    if (s.check) this.mark(s.check, "square", 0xe8463c, .55, .006);
    if (s.selected) this.mark(s.selected, "square", 0xf6d77a, .6, .006);
    for (const t of s.targets ?? []) t.capture ? this.mark(t.sq, "ring", 0xffd36e, .85, .008) : this.mark(t.sq, "dot", 0x0b2a20, .45, .008);
  }

  update(s: State) {
    if (!this.alive) return;
    if (this.tweens.length) { this.pending = s; return; }          // finish the move being shown first
    if (s.orient !== this.orient || !this.pieces.size) { this.orient = s.orient; this.azBase = s.orient === "w" ? 0 : Math.PI; this.az = 0; this.place(); }
    const key = s.last ? `${s.last.from}${s.last.to}${s.last.piece}` : "";
    const fresh = s.animate && s.last && key !== this.lastKey && this.pieces.size > 0;
    this.lastKey = key; this.selected = s.selected ?? null;
    this.drawMarks(s);
    if (fresh) { this.after = () => { this.after = null; this.sync(s.board); }; this.playMove(s.last!, () => {}); }
    else this.sync(s.board);
    this.dirty = true;
  }

  private loop = () => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (this.tweens.length) {
      for (const t of [...this.tweens]) {
        const k = Math.min(1, (now - t.t0) / t.dur); t.f(k);
        if (k >= 1) { this.tweens.splice(this.tweens.indexOf(t), 1); t.done?.(); }
      }
      if (!this.tweens.length) { this.after?.(); if (this.pending) { const p = this.pending; this.pending = null; this.update({ ...p, animate: false }); } }
      this.dirty = true;
    }
    // the selected piece floats up and breathes gently
    for (const [sq, g] of this.pieces) {
      const want = sq === this.selected ? .14 + (reduced ? 0 : Math.sin(now / 320) * .025) : 0, b = g.userData.body;
      if (Math.abs(b.position.y - want) > .001) { b.position.y += (want - b.position.y) * .25; this.dirty = true; }
      if (sq === this.selected && !reduced) this.dirty = true;
    }
    if (this.dirty) { this.dirty = false; this.renderer.render(this.scene, this.camera); }
  };

  destroy() {
    this.alive = false; cancelAnimationFrame(this.raf); this.ro.disconnect();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}

function webglOk() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } }
export function mount(el: HTMLElement, opts: { onTap: (sq: string) => void }) { return new Board3D(el, opts); }
(window as unknown as { RoyalChess3D: unknown }).RoyalChess3D = { mount, supported: webglOk };
