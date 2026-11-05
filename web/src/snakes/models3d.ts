import * as THREE from "three";
import type { PieceId } from "./tokens";

/* The twelve player tokens as small 3D figures, built from simple shapes (no model files), in the same colours and with
   the same details as their pictures in tokens.ts: four glossy pawns, four explorers, four animals. Each figure stands
   on the board at y = 0, faces +z (toward the players) and is about 0.9 squares tall. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = any;

const geo = new Map<string, Obj>();
const once = (key: string, make: () => Obj) => { let g = geo.get(key); if (!g) { g = make(); geo.set(key, g); } return g; };
const SPH = () => once("sph", () => new THREE.SphereGeometry(1, 18, 12));
const CYL = () => once("cyl", () => new THREE.CylinderGeometry(1, 1, 1, 20));
const TOR = (tube = .14) => once("tor" + tube, () => new THREE.TorusGeometry(1, tube, 8, 32));
const CAP = (r: number, l: number) => once(`cap${r}/${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 12));
const CAPSULE_TOP = (frac: number) => once("cap-top" + frac, () => new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI * frac));

const mats = new Map<string, Obj>();
/** Satin finish (skin, cloth, fur). */
export const mat = (color: string, rough = .62) => once("m" + color + rough, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }));
/** Glossy lacquer (pawns, eyes, the stand). */
export const gloss = (color: string, rough = .2) => {
  const k = "g" + color + rough; let m = mats.get(k);
  if (!m) { m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 1, clearcoatRoughness: .1 }); mats.set(k, m); }
  return m;
};
/** Polished gold. */
export const gold = () => { let m = mats.get("gold"); if (!m) { m = new THREE.MeshStandardMaterial({ color: "#e2b44e", roughness: .28, metalness: 1 }); mats.set("gold", m); } return m; };

function part(g: Obj, material: Obj, p: [number, number, number], s: [number, number, number] | number = 1, r: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Mesh(g, material);
  m.position.set(p[0], p[1], p[2]);
  if (typeof s === "number") m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.rotation.set(r[0], r[1], r[2]);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const ball = (grp: Obj, c: Obj, p: [number, number, number], s: [number, number, number] | number, r?: [number, number, number]) => grp.add(part(SPH(), c, p, s, r));
const rod = (grp: Obj, c: Obj, p: [number, number, number], radius: number, len: number, r?: [number, number, number]) => grp.add(part(CYL(), c, p, [radius, len, radius], r));
const ring = (grp: Obj, c: Obj, p: [number, number, number], radius: number, r: [number, number, number] = [Math.PI / 2, 0, 0], tube = .14) => grp.add(part(TOR(tube), c, p, radius, r));
const box = (grp: Obj, c: Obj, p: [number, number, number], s: [number, number, number], r?: [number, number, number]) => grp.add(part(once("box", () => new THREE.BoxGeometry(1, 1, 1)), c, p, s, r));

/** The polished stand that characters and animals stand on: dark lacquer with a gold rim. */
function stand(grp: Obj) {
  rod(grp, gloss("#3a2512", .25), [0, .03, 0], .25, .06);
  ring(grp, gold(), [0, .058, 0], .245, undefined, .07);
}
/** A friendly face: glossy eyes with catch-lights, rosy cheeks and a smile, on a head of radius `r` centred at (0, y, z). */
function face(grp: Obj, y: number, z: number, r: number, o: { dx?: number; eye?: string; smile?: boolean; cheeks?: boolean } = {}) {
  const dx = (o.dx ?? .36) * r, ey = y + r * .08, ez = z + r * .9;
  for (const s of [-1, 1]) {
    ball(grp, gloss(o.eye ?? "#20140c", .15), [s * dx, ey, ez], [r * .15, r * .2, r * .1]);
    ball(grp, mat("#ffffff", .3), [s * dx + r * .05, ey + r * .07, ez + r * .08], r * .045);
    if (o.cheeks !== false) ball(grp, mat("#ff8f8f", .7), [s * r * .58, y - r * .22, z + r * .78], [r * .14, r * .08, r * .05]);
  }
  if (o.smile !== false) grp.add(part(once("smile", () => new THREE.TorusGeometry(1, .2, 6, 18, Math.PI)), mat("#7a2a1a", .5), [0, y - r * .2, z + r * .95], r * .2, [0, 0, Math.PI]));
}

/* ---------- traditional pawns: one turned, glossy piece ---------- */
function pawn(color: string) {
  const grp = new THREE.Group();
  const prof = [[0, 0], [.27, 0], [.285, .025], [.275, .06], [.22, .09], [.17, .13], [.13, .22], [.105, .33], [.095, .41], [.16, .435], [.165, .455], [.12, .475], [.085, .49], [0, .5]];
  const lathe = once("pawn", () => new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 36));
  grp.add(part(lathe, gloss(color, .16), [0, 0, 0]));
  ball(grp, gloss(color, .16), [0, .62, 0], .155);
  return grp;
}

/* ---------- explorers and adventurers: chibi figures on a stand ---------- */
type Person = { skin: string; shirt: string; pants: string; boots: string; hair: string };
function person(o: Person) {
  const grp = new THREE.Group();
  stand(grp);
  const skin = mat(o.skin, .55), shirt = mat(o.shirt, .7), pants = mat(o.pants, .75);
  for (const s of [-1, 1]) {
    grp.add(part(CAP(.046, .1), pants, [s * .055, .15, 0]));
    ball(grp, mat(o.boots, .45), [s * .056, .085, .018], [.058, .036, .074]);
    grp.add(part(CAP(.036, .12), shirt, [s * .135, .335, .01], 1, [0, 0, s * .32]));
    ball(grp, skin, [s * .165, .255, .02], .038);
    ball(grp, skin, [s * .165, .61, -.005], [.032, .042, .028]);
  }
  grp.add(part(CAP(.112, .1), shirt, [0, .335, 0], [1, 1, .86]));
  ball(grp, skin, [0, .61, 0], .165);
  face(grp, .6, 0, .165);
  grp.add(part(CAPSULE_TOP(.42), mat(o.hair, .8), [0, .615, -.008], [.172, .172, .172], [-.18, 0, 0]));
  return { grp, skin, shirt };
}
function youngExplorer() {
  const { grp } = person({ skin: "#e9b98a", shirt: "#d9bb7e", pants: "#6d6a3a", boots: "#6b3f1f", hair: "#4a2c18" });
  box(grp, mat("#3f8a4a", .7), [0, .36, -.125], [.22, .21, .1]);
  box(grp, mat("#2f6f39", .7), [0, .3, -.18], [.15, .08, .04]);
  for (const s of [-1, 1]) box(grp, mat("#2f6f39", .7), [s * .06, .36, .09], [.025, .2, .02]);
  for (const s of [-1, 1]) { rod(grp, gloss("#2b2f36", .3), [s * .026, .385, .105], .024, .05, [Math.PI / 2, 0, 0]); ball(grp, gloss("#9fd3ff", .1), [s * .026, .385, .132], [.016, .016, .004]); }
  rod(grp, mat("#c8a565", .7), [0, .74, 0], .24, .014);
  grp.add(part(CAPSULE_TOP(.5), mat("#dcc083", .7), [0, .742, 0], [.135, .1, .135]));
  rod(grp, mat("#7a5a2e", .6), [0, .76, 0], .137, .028);
  return grp;
}
function jungleAdventurer() {
  const { grp } = person({ skin: "#f3cda6", shirt: "#2fb3a1", pants: "#5a4632", boots: "#7a4724", hair: "#b5532a" });
  grp.add(part(CAP(.045, .16), mat("#a4471f", .8), [.02, .5, -.15], 1, [.5, 0, -.15]));
  ring(grp, mat("#d9483b", .7), [0, .455, .005], .1, [Math.PI / 2, 0, 0], .28);
  for (const s of [-1, 1]) box(grp, mat("#8a5a2b", .8), [s * .075, .335, .095], [.05, .2, .02]);
  box(grp, mat("#5b3a1a", .7), [0, .34, .1], [.025, .26, .015], [0, 0, .75]);
  box(grp, mat("#a8743b", .6), [.13, .24, .06], [.1, .08, .045]);
  rod(grp, mat("#1f8f84", .65), [0, .745, 0], .27, .016);
  grp.add(part(CAPSULE_TOP(.5), mat("#26a596", .65), [0, .748, 0], [.14, .105, .14]));
  rod(grp, mat("#f1c34a", .5), [0, .765, 0], .142, .026);
  ball(grp, mat("#e56a4a", .6), [.12, .81, -.02], [.025, .085, .02], [0, 0, -.6]);
  return grp;
}
function mountainAdventurer() {
  const { grp } = person({ skin: "#d9a679", shirt: "#3f7fd6", pants: "#3c3f47", boots: "#5a3218", hair: "#3a2414" });
  ball(grp, mat("#4a2c18", .85), [0, .545, .045], [.15, .09, .125]);
  ball(grp, mat("#4a2c18", .85), [0, .57, .155], [.05, .016, .02]);
  box(grp, mat("#e07a2c", .7), [0, .4, -.15], [.26, .3, .13]);
  rod(grp, mat("#4b9a5a", .75), [0, .58, -.15], .055, .34, [0, 0, Math.PI / 2]);
  rod(grp, mat("#d9483b", .7), [0, .69, 0], .171, .05);
  ball(grp, mat("#d9483b", .7), [-.16, .68, -.06], .028);
  for (const s of [-1, 1]) box(grp, mat("#b3561a", .7), [s * .06, .35, .095], [.024, .2, .02]);
  rod(grp, gold(), [0, .34, .1], .036, .012, [Math.PI / 2, 0, 0]);
  rod(grp, mat("#fff7d6", .4), [0, .34, .107], .025, .004, [Math.PI / 2, 0, 0]);
  return grp;
}
function outdoorExplorer() {
  const { grp } = person({ skin: "#a87650", shirt: "#3c9a5f", pants: "#5b4a3a", boots: "#3a2414", hair: "#1d120a" });
  for (const y of [.28, .34, .4]) ring(grp, mat("#1f6a3d", .7), [0, y, 0], .112, [Math.PI / 2, 0, 0], .13);
  ring(grp, mat("#f1c34a", .6), [0, .455, .005], .095, [Math.PI / 2, 0, 0], .25);
  grp.add(part(CAPSULE_TOP(.5), mat("#e0a526", .8), [0, .64, 0], [.178, .17, .178]));
  ring(grp, mat("#c4861a", .8), [0, .665, 0], .168, [Math.PI / 2, 0, 0], .17);
  ball(grp, mat("#f4ead2", .9), [0, .82, 0], .045);
  box(grp, mat("#f4ead2", .8), [-.2, .27, .07], [.1, .075, .008], [0, .3, 0]);
  rod(grp, mat("#a8743b", .7), [.205, .3, .02], .012, .56);
  ball(grp, mat("#7a5a2e", .7), [.205, .585, .02], .02);
  return grp;
}

/* ---------- animals ---------- */
function animalBody(grp: Obj, fur: Obj, belly: Obj) {
  stand(grp);
  ball(grp, fur, [0, .23, 0], [.165, .16, .145]);
  ball(grp, belly, [0, .21, .095], [.1, .1, .06]);
}
function lion() {
  const grp = new THREE.Group(), fur = mat("#e2a13e", .7), face2 = mat("#ffd77a", .6), mane = mat("#c96a24", .85);
  animalBody(grp, fur, mat("#fbe3a4", .7));
  for (const s of [-1, 1]) { ball(grp, fur, [s * .075, .085, .07], [.06, .04, .075]); ball(grp, fur, [s * .14, .22, .05], [.05, .085, .05], [0, 0, s * .3]); }
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ball(grp, mane, [Math.cos(a) * .15, .56 + Math.sin(a) * .155, -.04], .066); }
  ball(grp, mane, [0, .56, -.06], .16);
  for (const s of [-1, 1]) { ball(grp, face2, [s * .11, .69, 0], .045); ball(grp, mat("#c9783a", .7), [s * .11, .69, .03], .022); }
  ball(grp, face2, [0, .555, .02], .14);
  face(grp, .57, .02, .14, { cheeks: true, smile: false });
  for (const s of [-1, 1]) ball(grp, mat("#fff4d6", .6), [s * .033, .5, .14], .042);
  ball(grp, gloss("#6b3a1f", .3), [0, .535, .16], [.03, .02, .02]);
  const tail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[.1, .14, -.1], [.2, .16, -.14], [.24, .26, -.12], [.27, .34, -.1]].map(([x, y, z]) => new THREE.Vector3(x, y, z))), 16, .016, 8);
  grp.add(part(tail, fur, [0, 0, 0])); ball(grp, mane, [.275, .36, -.1], .035);
  return grp;
}
function panda() {
  const grp = new THREE.Group(), white = mat("#f7f8f9", .7), black = mat("#1d2026", .75);
  animalBody(grp, white, mat("#ffffff", .7));
  for (const s of [-1, 1]) { ball(grp, black, [s * .08, .085, .07], [.07, .045, .085]); ball(grp, black, [s * .145, .25, .05], [.06, .1, .06], [0, 0, s * .35]); }
  rod(grp, mat("#7cc46a", .5), [.17, .29, .08], .018, .42, [0, 0, -.1]);
  for (const y of [.2, .32, .42]) ring(grp, mat("#3f8a3a", .5), [.17 - (y - .29) * .1, y, .08], .02, [Math.PI / 2, 0, 0], .2);
  ball(grp, mat("#5fae52", .6), [.2, .49, .08], [.06, .018, .03], [0, 0, .5]);
  for (const s of [-1, 1]) ball(grp, black, [s * .13, .69, -.01], .058);
  ball(grp, white, [0, .55, 0], .175);
  for (const s of [-1, 1]) ball(grp, black, [s * .063, .565, .145], [.05, .065, .03], [0, 0, s * -.55]);
  face(grp, .555, 0, .175, { eye: "#0c0c0c", dx: .37 });
  for (const s of [-1, 1]) ball(grp, mat("#ffffff", .4), [s * .064, .57, .172], [.022, .026, .01]);
  ball(grp, gloss("#1d2026", .3), [0, .52, .17], [.03, .02, .02]);
  return grp;
}
function elephant() {
  const grp = new THREE.Group(), grey = mat("#8d9bb0", .7);
  stand(grp);
  ball(grp, grey, [0, .24, 0], [.175, .145, .16]);
  const cloth = once("cloth", () => new THREE.CylinderGeometry(.18, .18, .22, 28, 1, true, -Math.PI / 2, Math.PI));
  const m = part(cloth, new THREE.MeshStandardMaterial({ color: "#d9483b", roughness: .7, side: THREE.DoubleSide }), [0, .27, -.02], [1, 1, 1], [0, 0, Math.PI / 2]);
  m.rotation.set(Math.PI / 2, Math.PI / 2, 0); grp.add(m);
  ring(grp, gold(), [0, .27, .2], .17, [0, 0, 0], .06);
  for (const [x, z] of [[-.08, .07], [.08, .07], [-.08, -.07], [.08, -.07]]) { rod(grp, grey, [x, .11, z], .05, .1); ball(grp, mat("#f4ead2", .5), [x, .075, z + .045], [.03, .015, .012]); }
  for (const s of [-1, 1]) { ball(grp, grey, [s * .17, .55, -.01], [.13, .15, .03], [0, s * .45, 0]); ball(grp, mat("#f2a9b8", .7), [s * .165, .55, .012], [.08, .1, .012], [0, s * .45, 0]); }
  ball(grp, grey, [0, .52, .03], .155);
  face(grp, .55, .03, .15, { smile: false });
  const trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, .48, .16], [0, .42, .21], [-.01, .34, .23], [.02, .29, .25], [.06, .3, .26]].map(([x, y, z]) => new THREE.Vector3(x, y, z))), 24, .034, 10);
  grp.add(part(trunk, grey, [0, 0, 0]));
  for (const s of [-1, 1]) grp.add(part(once("tusk", () => new THREE.ConeGeometry(.018, .09, 10)), mat("#fffaf0", .35), [s * .06, .43, .17], 1, [-1.9, 0, s * -.35]));
  return grp;
}
function rabbit() {
  const grp = new THREE.Group(), white = mat("#f6f1f4", .75), pink = mat("#f4a6bc", .6);
  animalBody(grp, white, mat("#ffffff", .7));
  ball(grp, white, [0, .2, -.15], .055);
  for (const s of [-1, 1]) { ball(grp, white, [s * .08, .08, .08], [.07, .04, .095]); ball(grp, white, [s * .14, .23, .05], [.05, .08, .05], [0, 0, s * .3]); }
  grp.add(part(once("carrot", () => new THREE.ConeGeometry(.032, .17, 12)), mat("#f08a2c", .6), [.13, .24, .11], 1, [Math.PI, 0, .45]));
  ball(grp, mat("#4fa84a", .6), [.165, .33, .11], [.035, .015, .015], [0, 0, 1]);
  for (const s of [-1, 1]) { ball(grp, white, [s * .065, .78, -.015], [.045, .17, .03], [0, 0, s * -.15]); ball(grp, pink, [s * .065, .78, .01], [.025, .13, .012], [0, 0, s * -.15]); }
  ball(grp, white, [0, .53, 0], .16);
  face(grp, .545, 0, .16);
  ball(grp, gloss("#f07a98", .3), [0, .52, .155], [.022, .016, .014]);
  box(grp, mat("#ffffff", .3), [0, .475, .148], [.024, .02, .006]);
  for (const s of [-1, 1]) for (const dy of [0, -.012]) box(grp, mat("#9a8a90", .6), [s * .12, .5 + dy, .13], [.075, .002, .002], [0, 0, s * (dy ? .15 : -.1)]);
  return grp;
}

const BUILD: Record<PieceId, () => Obj> = {
  "pawn-gold": () => pawn("#f2c14e"), "pawn-green": () => pawn("#2fbf6c"), "pawn-red": () => pawn("#e8434f"), "pawn-blue": () => pawn("#3d7be8"),
  "young-explorer": youngExplorer, "jungle-adventurer": jungleAdventurer, "mountain-adventurer": mountainAdventurer, "outdoor-explorer": outdoorExplorer,
  lion, panda, elephant, rabbit,
};
/** A new 3D figure for a token (shares geometry and materials with other figures). */
export function buildFigure(id: PieceId): Obj {
  const g = (BUILD[id] ?? BUILD["pawn-gold"])();
  g.name = id;
  return g;
}
