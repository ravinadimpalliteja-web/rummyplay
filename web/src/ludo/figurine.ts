/* The Ambaro elephant as a 3D figurine (the same carved-toy style as the Snakes & Ladders pieces), built from smooth
   shapes in code and rendered once per player colour into pictures the flat Ludo board shows as its tokens.
   An ivory elephant, trunk raised, with gold tusks, anklets, ear trim and headdress set with emeralds; a blanket in the
   player's colour with a gold lotus, gold hem and tassels; a golden ambari whose canopy is in the player's colour; all
   on a round base lacquered in the player's colour with a gold rim. The 3D library loads only when Ludo needs it; until
   the pictures are ready (or if the phone can't draw 3D) the tokens show the logo artwork instead. */
import { useEffect, useState } from "react";
import type { Color } from "./engine";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = any;
type V3 = [number, number, number];

/** Player colours: lacquer for the base and canopy, cloth for the blanket. */
const PAINT: Record<Color, { lac: string; cloth: string }> = {
  red: { lac: "#c42a3a", cloth: "#b3202f" },
  green: { lac: "#1c9a58", cloth: "#16864c" },
  yellow: { lac: "#e8a417", cloth: "#e09a12" },
  blue: { lac: "#2f62c9", cloth: "#2954b5" },
};
export const FIG_SIZE = 384;

function build(THREE: Obj, color: Color): Obj {
  const G = new THREE.Group();
  const cache = new Map<string, Obj>();
  const once = <T,>(k: string, make: () => T): T => { let v = cache.get(k); if (!v) { v = make(); cache.set(k, v); } return v as T; };
  const SPH = once("sph", () => new THREE.SphereGeometry(1, 40, 28));
  const CYL = once("cyl", () => new THREE.CylinderGeometry(1, 1, 1, 40));
  const CONE = once("cone", () => new THREE.ConeGeometry(1, 1, 28));
  const TOR = (t: number) => once("tor" + t, () => new THREE.TorusGeometry(1, t, 14, 48));
  const ivory = new THREE.MeshPhysicalMaterial({ color: "#fbf4e6", roughness: .42, metalness: 0, sheen: .35, sheenColor: new THREE.Color("#fff6e4"), sheenRoughness: .6 });
  const ivoryD = new THREE.MeshPhysicalMaterial({ color: "#efe2c8", roughness: .5, metalness: 0 });
  const gold = new THREE.MeshStandardMaterial({ color: "#e4bd62", roughness: .24, metalness: 1 });
  const goldDark = new THREE.MeshStandardMaterial({ color: "#b8862c", roughness: .3, metalness: 1 });
  const emerald = new THREE.MeshPhysicalMaterial({ color: "#14a865", roughness: .08, metalness: 0, clearcoat: 1, transmission: 0, emissive: "#05391f", emissiveIntensity: .25 });
  const lac = new THREE.MeshPhysicalMaterial({ color: PAINT[color].lac, roughness: .16, metalness: 0, clearcoat: 1, clearcoatRoughness: .08 });
  const cloth = new THREE.MeshPhysicalMaterial({ color: PAINT[color].cloth, roughness: .62, metalness: 0, sheen: .4, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: .55, side: THREE.DoubleSide });
  const eyeM = new THREE.MeshPhysicalMaterial({ color: "#1b120c", roughness: .1, clearcoat: 1 });

  const part = (g: Obj, m: Obj, p: V3, s: V3 | number = 1, r: V3 = [0, 0, 0]) => {
    const o = new THREE.Mesh(g, m); o.position.set(...p);
    if (typeof s === "number") o.scale.setScalar(s); else o.scale.set(...s);
    o.rotation.set(...r); G.add(o); return o;
  };
  const ball = (m: Obj, p: V3, s: V3 | number, r?: V3) => part(SPH, m, p, s, r);
  const rod = (m: Obj, p: V3, rad: number, len: number, r?: V3) => part(CYL, m, p, [rad, len, rad], r);
  const ring = (m: Obj, p: V3, rad: number | V3, t = .12, r: V3 = [Math.PI / 2, 0, 0]) => part(TOR(t), m, p, rad, r);
  const cone = (m: Obj, p: V3, s: V3, r?: V3) => part(CONE, m, p, s, r);
  const tube = (m: Obj, pts: V3[], r: number, seg = 24) => part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, 12), m, [0, 0, 0]);
  const limb = (m: Obj, a: V3, b: V3, r1: number, r2 = r1) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 24), m);
    o.position.copy(va).add(vb).multiplyScalar(.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), va.clone().sub(vb).normalize()); G.add(o);
    ball(m, a, r1); ball(m, b, r2);
  };
  const gem = (p: V3, s = .016) => { ball(gold, p, [s * 1.35, s * 1.35, s * .5]); ball(emerald, [p[0] + .002, p[1], p[2]], [s, s, s * .7]); };

  // the base: lacquered in the player's colour, gold rim and top
  rod(lac, [0, .03, 0], .235, .06);
  ring(gold, [0, .06, 0], .232, .055);
  rod(gold, [0, .063, 0], .21, .006);
  ring(goldDark, [0, .003, 0], .236, .03);

  // legs with gold anklets and toenails (the elephant faces +x)
  for (const [x, z] of [[.085, .062], [.085, -.062], [-.085, .062], [-.085, -.062]] as const) {
    limb(x > 0 ? ivory : ivoryD, [x, .23, z], [x, .09, z], .043, .04);
    ring(gold, [x, .115, z], .043, .14);
    ring(gold, [x, .135, z], .041, .08);
    for (const dz of [-.022, 0, .022]) ball(gold, [x + .036, .078, z + dz], [.01, .009, .01]);
  }
  // body and tail
  ball(ivory, [0, .27, 0], [.17, .12, .11]);
  tube(ivoryD, [[-.16, .29, 0], [-.19, .24, 0], [-.2, .18, .01]], .012, 16);
  cone(gold, [-.2, .155, .01], [.018, .05, .018], [Math.PI, 0, 0]);

  // head, ears, eyes, tusks and the raised trunk
  ball(ivory, [.17, .325, 0], [.098, .1, .092]);
  for (const s of [-1, 1]) {
    // big fan ears with a gold edge
    ball(goldDark, [.14, .315, s * .108], [.092, .112, .014], [0, s * -.3, 0]);
    ball(ivory, [.143, .317, s * .112], [.085, .104, .015], [0, s * -.3, 0]);
    ball(gold, [.15, .27, s * .118], [.05, .03, .006], [0, s * -.3, 0]);
    ball(eyeM, [.24, .348, s * .05], [.011, .013, .009]);
    ball(new THREE.MeshBasicMaterial({ color: "#ffffff" }), [.249, .353, s * .052], .0035);
    limb(new THREE.MeshPhysicalMaterial({ color: "#fff8ea", roughness: .25, clearcoat: .6 }), [.235, .275, s * .035], [.3, .26, s * .05], .014, .006);
    ring(gold, [.245, .272, s * .038], .015, .25, [0, Math.PI / 2, 0]);
  }
  tube(ivory, [[.245, .305, 0], [.285, .285, 0], [.32, .33, 0], [.335, .4, 0], [.315, .455, 0], [.285, .46, 0]], .025, 32);
  ball(ivory, [.283, .457, 0], .022);
  // gold headdress with emeralds
  ring(gold, [.2, .385, 0], [.07, .075, .07], .09, [0, 0, .95]);
  ball(gold, [.245, .385, 0], [.022, .03, .02], [0, 0, -.5]);
  gem([.256, .381, 0], .016);
  for (const s of [-1, 1]) gem([.232, .37, s * .052], .01);

  // the blanket (jhool): cloth over the back in the player's colour, gold hem and tassels, a gold lotus on each side
  const jhool = new THREE.CylinderGeometry(.124, .124, .22, 32, 1, true, -.45, Math.PI + .9);
  part(jhool, cloth, [-.01, .27, 0], 1, [0, 0, Math.PI / 2]);
  for (const s of [-1, 1]) {
    const y = .27 - .124 * Math.sin(.45), z = s * .124 * Math.cos(.45);
    tube(gold, [[-.12, y, z], [-.01, y - .004, z * 1.01], [.1, y, z]], .006, 12);
    for (const x of [-.09, -.045, 0, .045, .09]) { cone(gold, [x, y - .018, z], [.008, .024, .008], [Math.PI, 0, 0]); ball(gold, [x, y - .032, z], .006); }
    // gold lotus in a laurel
    const lz = s * .127, lp: V3 = [-.015, .285, lz];
    for (const [a, l] of [[0, .05], [.6, .044], [-.6, .044], [1.15, .034], [-1.15, .034]] as const)
      ball(gold, [lp[0] + Math.sin(a) * l * .5, lp[1] + Math.cos(a) * l * .42, lz], [.014, l * .52, .005], [0, 0, -a]);
    ball(gold, [lp[0], lp[1] - .006, lz], [.03, .008, .005]);
    ring(gold, [lp[0], lp[1] + .006, lz], [.058, .058, .058], .035, [0, 0, 0]);
  }

  // the golden ambari, canopy in the player's colour
  const ay = .395;
  part(new THREE.BoxGeometry(1, 1, 1), gold, [-.01, ay, 0], [.2, .028, .17]);
  part(new THREE.BoxGeometry(1, 1, 1), goldDark, [-.01, ay + .02, 0], [.19, .012, .16]);
  for (const [x, z] of [[.08, .07], [.08, -.07], [-.1, .07], [-.1, -.07]] as const) {
    rod(gold, [x, ay + .055, z], .011, .085);
    ball(gold, [x, ay + .1, z], .016);
  }
  // low gold railing with small arches
  for (const z of [-.074, .074]) { part(new THREE.BoxGeometry(1, 1, 1), gold, [-.01, ay + .035, z], [.19, .01, .008]); for (const x of [-.06, -.01, .04]) ring(goldDark, [x, ay + .022, z], .016, .18, [0, 0, 0]); }
  for (const x of [-.105, .085]) part(new THREE.BoxGeometry(1, 1, 1), gold, [x, ay + .035, 0], [.008, .01, .15]);
  // the canopy: a full dome in the player's colour, gold ring, ribs and finial
  part(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), lac, [-.01, ay + .1, 0], [.14, .1, .115]);
  ring(gold, [-.01, ay + .1, 0], [.14, .115, .12], .11);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; tube(gold, [[-.01 + Math.cos(a) * .14, ay + .1, Math.sin(a) * .115], [-.01 + Math.cos(a) * .1, ay + .17, Math.sin(a) * .082], [-.01, ay + .2, 0]], .0045, 10); }
  cone(gold, [-.01, ay + .225, 0], [.018, .05, .018]);
  ball(gold, [-.01, ay + .255, 0], .014);
  gem([.128, ay + .115, 0], .018);
  for (const s of [-1, 1]) gem([-.01, ay + .115, s * .117], .013);
  gem([.09, ay, 0], .012);

  // neck strap with an emerald pendant
  ring(gold, [.11, .31, 0], [.085, .1, .1], .09, [0, Math.PI / 2, .35]);
  gem([.155, .255, 0], .014);
  return G;
}

/* ---------- rendering the four colours (once per visit) ---------- */
let pictures: Record<Color, string> | null = null;
let started = false;
const listeners = new Set<() => void>();

async function renderAll() {
  const THREE: Obj = await import("three");
  const canvas = document.createElement("canvas");
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  try {
    r.setPixelRatio(1); r.setSize(FIG_SIZE, FIG_SIZE, false);
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.05;
    r.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    // soft studio reflections (as the Snakes & Ladders board), so gold and lacquer shine
    const pm = new THREE.PMREMGenerator(r), env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
    const cols: number[] = [], pos = sky.geometry.attributes.position, c1 = new THREE.Color("#fff1d8"), c2 = new THREE.Color("#3a1a10");
    for (let i = 0; i < pos.count; i++) { const t = (pos.getY(i) / 20 + 1) / 2, c = c2.clone().lerp(c1, Math.pow(t, 1.4)); cols.push(c.r, c.g, c.b); }
    sky.geometry.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); env.add(sky);
    for (const [x, y, z, s] of [[-8, 12, 6, 6], [9, 9, -4, 4]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.7, 3.2), side: THREE.DoubleSide })); p.position.set(x, y, z); p.lookAt(0, 0, 0); env.add(p); }
    scene.environment = pm.fromScene(env, .04).texture; scene.environmentIntensity = .85; pm.dispose();
    const key = new THREE.DirectionalLight("#fff0da", 2.6); key.position.set(2, 5, 4); scene.add(key);
    const rim = new THREE.DirectionalLight("#ffe2a8", 1.4); rim.position.set(-3, 4, -4); scene.add(rim);
    scene.add(new THREE.HemisphereLight("#fffaf0", "#5a3a20", .5));
    // seen from the front-right and above, like a piece on a table
    const cam = new THREE.PerspectiveCamera(19.2, 1, .1, 20);
    cam.position.set(.6, 1.0, 2.0); cam.lookAt(.04, .305, 0);
    const out = {} as Record<Color, string>;
    for (const c of ["red", "green", "yellow", "blue"] as Color[]) {
      const fig = build(THREE, c); fig.rotation.y = -.35; scene.add(fig);
      r.render(scene, cam);
      out[c] = canvas.toDataURL("image/png");
      scene.remove(fig);
      fig.traverse((o: Obj) => { o.geometry?.dispose?.(); });
    }
    pictures = out;
  } finally {
    r.dispose(); r.forceContextLoss?.();
  }
}

/** The figurine pictures, or null while they are being made (or if this device can't draw 3D). */
export function useFigurines(): Record<Color, string> | null {
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump(n => n + 1);
    listeners.add(on);
    if (!started) {
      started = true;
      renderAll().then(() => listeners.forEach(f => f())).catch(() => { /* no 3D here: keep the artwork tokens */ });
    }
    return () => { listeners.delete(on); };
  }, []);
  return pictures;
}
