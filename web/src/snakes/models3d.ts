import * as THREE from "three";
import { pieceById, type PieceId } from "./tokens";

/* The player tokens as polished 3D figurines, built from smooth shapes in code (no model files, light enough for phones):
   four glossy turned pawns; eight people (explorers, a cricketer, a chef, a classical dancer and a scholar) with natural
   proportions, a little heroic so faces still read at board size; and nine animals sitting or standing on a small round
   base. Every figure stands at y = 0, faces +z (toward the players), is about 0.8 tall and keeps within 0.16 of its
   centre at the feet, so a token in the middle of a square never covers the square's number. If building a figure ever
   fails, a plain pawn in the token's colour is used instead. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = any;
type V3 = [number, number, number];

const cache = new Map<string, Obj>();
const once = <T,>(key: string, make: () => T): T => { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g as T; };
const SPH = () => once("sph", () => new THREE.SphereGeometry(1, 40, 28));
const CYL = () => once("cyl", () => new THREE.CylinderGeometry(1, 1, 1, 40));
const TOR = (tube: number) => once("tor" + tube, () => new THREE.TorusGeometry(1, tube, 14, 48));
const DOME = (frac: number) => once("dome" + frac, () => new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI * frac));
const CONE = () => once("cone", () => new THREE.ConeGeometry(1, 1, 32));
const BOX = () => once("box", () => new THREE.BoxGeometry(1, 1, 1));
/** A tapered limb (wider at the top). */
const LIMB = (r1: number, r2: number, l: number) => once(`limb${r1.toFixed(4)}/${r2.toFixed(4)}/${l.toFixed(4)}`, () => new THREE.CylinderGeometry(r1, r2, l, 24));
const lathe = (key: string, prof: number[][], seg = 48) => once("lathe" + key, () => new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), seg));

/** Satin finish (skin, cloth, fur). */
export const mat = (color: string, rough = .6) => once("m" + color + rough, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }));
/** Glossy lacquer (pawns, eyes, the base). */
export const gloss = (color: string, rough = .18) => once("g" + color + rough, () => new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 1, clearcoatRoughness: .08 }));
/** Polished gold. */
export const gold = () => once("gold", () => new THREE.MeshStandardMaterial({ color: "#e2bf6a", roughness: .25, metalness: 1 }));
/** Skin with a soft sheen. */
const skinMat = (color: string) => once("skin" + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: .52, metalness: 0, sheen: .4, sheenColor: new THREE.Color("#ffd9c4"), sheenRoughness: .6 }));
/** A painted pattern (stripes, spots, checks) as a material; `draw` paints a 256 x 128 canvas. */
const painted = (key: string, rough: number, draw: (g: CanvasRenderingContext2D) => void) => once("p" + key, () => {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128; draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: rough });
});

function part(g: Obj, m: Obj, p: V3, s: V3 | number = 1, r: V3 = [0, 0, 0]) {
  const o = new THREE.Mesh(g, m);
  o.position.set(p[0], p[1], p[2]);
  if (typeof s === "number") o.scale.setScalar(s); else o.scale.set(s[0], s[1], s[2]);
  o.rotation.set(r[0], r[1], r[2]); o.castShadow = true; o.receiveShadow = true;
  return o;
}
const ball = (G: Obj, m: Obj, p: V3, s: V3 | number, r?: V3) => G.add(part(SPH(), m, p, s, r));
const rod = (G: Obj, m: Obj, p: V3, rad: number, len: number, r?: V3) => G.add(part(CYL(), m, p, [rad, len, rad], r));
const ring = (G: Obj, m: Obj, p: V3, rad: number, tube = .12, r: V3 = [Math.PI / 2, 0, 0]) => G.add(part(TOR(tube), m, p, rad, r));
const box = (G: Obj, m: Obj, p: V3, s: V3, r?: V3) => G.add(part(BOX(), m, p, s, r));
const cone = (G: Obj, m: Obj, p: V3, s: V3, r?: V3) => G.add(part(CONE(), m, p, s, r));
/** A limb between two points (a tapered cylinder with rounded ends). */
function limb(G: Obj, m: Obj, a: V3, b: V3, r1: number, r2 = r1) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
  const o = new THREE.Mesh(LIMB(r1, r2, len), m); o.position.copy(va).add(vb).multiplyScalar(.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), va.clone().sub(vb).normalize()); o.castShadow = true; G.add(o);
  ball(G, m, a, r1); ball(G, m, b, r2);
}
/** A smooth tube through points (tails, trunks, necks). */
const tube = (G: Obj, m: Obj, pts: V3[], r: number, seg = 18) => G.add(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, 8), m, [0, 0, 0]));

/** The small round base characters and animals stand on: dark lacquer with a gold rim. */
function base(G: Obj) {
  rod(G, gloss("#2b2218", .22), [0, .018, 0], .14, .036);
  ring(G, gold(), [0, .036, 0], .137, .07);
}
/** An eye: dark glossy iris with a catch-light (and a white around it when `white`). */
const eye = (G: Obj, p: V3, r: number, white = false) => {
  if (white) ball(G, mat("#fbf7f0", .3), [p[0], p[1], p[2] - r * .25], [r * 1.35, r * 1.25, r * .7]);
  ball(G, gloss("#1b120c", .1), p, [r, r * 1.1, r * .7]);
  ball(G, mat("#ffffff", .2), [p[0] + r * .3, p[1] + r * .35, p[2] + r * .55], r * .3);
};

/* ---------- traditional pawns ---------- */
function pawn(color: string) {
  const G = new THREE.Group();
  G.add(part(lathe("pawn", [[0, 0], [.16, 0], [.17, .02], [.162, .05], [.13, .07], [.1, .11], [.078, .2], [.064, .3], [.06, .36], [.1, .38], [.104, .395], [.075, .412], [.055, .425], [0, .43]], 40), gloss(color, .14), [0, 0, 0]));
  ball(G, gloss(color, .14), [0, .52, 0], .1);
  return G;
}

/* ---------- people ---------- */
type Look = { skin: string; hair: string; top: string; legs: string; shoes: string; build?: number; shorts?: boolean; sleeves?: "long" | "short"; hairStyle?: "short" | "long" | "bun" | "bald"; brows?: string; lips?: string };
const HEAD: V3 = [0, .665, .004], HR = .078;
/** A standing figure about 0.75 tall (head centre at y 0.665, a little over four and a half heads tall), on a base.
    Arms hang at the sides unless `arms` is false (then the caller adds them). */
function person(o: Look, arms = true) {
  const G = new THREE.Group(), b = o.build ?? 1;
  base(G);
  const skin = skinMat(o.skin), top = mat(o.top, .66), legs = mat(o.legs, .72), shoes = gloss(o.shoes, .35);
  for (const s of [-1, 1]) {
    ball(G, shoes, [s * .037, .053, .014], [.031, .021, .05]);                                         // shoes
    limb(G, o.shorts ? skin : legs, [s * .037, .075, 0], [s * .039, .22, 0], .022, .025);           // lower leg
    limb(G, legs, [s * .039, .22, 0], [s * .043, .345, 0], o.shorts ? .032 : .028, .034);            // upper leg
  }
  ball(G, legs, [0, .355, 0], [.075 * b, .045, .052]);                                                 // hips
  G.add(part(lathe("torso", [[0, 0], [.066, 0], [.07, .05], [.078, .11], [.087, .17], [.083, .195], [.05, .212], [0, .216]], 28), top, [0, .36, 0], [b, 1, .72]));
  if (arms) for (const s of [-1, 1]) {
    limb(G, top, [s * .09 * b, .55, 0], [s * .106 * b, .45, .008], .023, .02);                      // upper arm
    limb(G, o.sleeves === "short" ? skin : top, [s * .106 * b, .45, .008], [s * .111 * b, .36, .024], .019, .017);   // forearm
    ball(G, skin, [s * .113 * b, .343, .027], [.019, .023, .019]);                                    // hand
  }
  rod(G, skin, [0, .59, 0], .024, .04);                                                               // neck
  headWithFace(G, o, skin);
  return { G, skin, top, legs };
}
function headWithFace(G: Obj, o: Look, skin: Obj) {
  const [hx, hy, hz] = HEAD;
  ball(G, skin, HEAD, [HR * .93, HR, HR * .96]);                                                       // head
  ball(G, skin, [hx, hy - HR * .42, hz + HR * .28], [HR * .62, HR * .5, HR * .62]);                     // jaw and chin
  for (const s of [-1, 1]) {
    eye(G, [hx + s * HR * .34, hy + HR * .08, hz + HR * .84], HR * .13, true);
    box(G, mat(o.brows ?? o.hair, .8), [hx + s * HR * .35, hy + HR * .3, hz + HR * .86], [HR * .34, HR * .07, HR * .06], [0, 0, s * -.12]);   // brows
    ball(G, skin, [hx + s * HR * .92, hy, hz - HR * .05], [HR * .14, HR * .22, HR * .12]);           // ears
    ball(G, mat("#f19a8e", .7), [hx + s * HR * .55, hy - HR * .25, hz + HR * .72], [HR * .16, HR * .1, HR * .06]);   // cheeks
  }
  ball(G, skin, [hx, hy - HR * .08, hz + HR * .98], [HR * .13, HR * .17, HR * .14]);                    // nose
  G.add(part(once("mouth", () => new THREE.TorusGeometry(1, .28, 6, 14, Math.PI)), mat(o.lips ?? "#a3443a", .5), [hx, hy - HR * .38, hz + HR * .86], HR * .2, [0, 0, Math.PI]));
  const hair = mat(o.hair, .78);
  if (o.hairStyle !== "bald") G.add(part(DOME(.48), hair, [hx, hy + HR * .06, hz - HR * .06], [HR * 1.02, HR * 1.05, HR * 1.04], [-.3, 0, 0]));
  if (o.hairStyle === "long") { ball(G, hair, [hx, hy - HR * .35, hz - HR * .6], [HR * .95, HR * 1.1, HR * .5]); }
  if (o.hairStyle === "bun") ball(G, hair, [hx, hy + HR * .55, hz - HR * .75], HR * .5);
}
const TOP_OF_HEAD = HEAD[1] + HR;

function youngExplorer() {
  const { G } = person({ skin: "#e9b98a", hair: "#4a2c18", top: "#d9bb7e", legs: "#6d6a3a", shoes: "#5a3418", shorts: true, sleeves: "short", build: .95 });
  box(G, mat("#3f7d47", .7), [0, .47, -.075], [.11, .13, .055]); box(G, mat("#2f6f39", .7), [0, .42, -.105], [.08, .05, .02]);   // backpack
  for (const s of [-1, 1]) box(G, mat("#2f6f39", .7), [s * .045, .49, .055], [.014, .13, .01]);                              // straps
  for (const s of [-1, 1]) { rod(G, gloss("#2b2f36", .3), [s * .015, .5, .066], .012, .026, [Math.PI / 2, 0, 0]); ball(G, gloss("#9fd3ff", .1), [s * .015, .5, .08], [.009, .009, .002]); }   // binoculars
  rod(G, mat("#c8a565", .7), [0, TOP_OF_HEAD - .025, 0], .118, .008);                                 // safari hat
  G.add(part(DOME(.5), mat("#dcc083", .7), [0, TOP_OF_HEAD - .023, 0], [.075, .06, .078]));
  rod(G, mat("#7a5a2e", .6), [0, TOP_OF_HEAD - .012, 0], .076, .013);
  return G;
}
function jungleAdventurer() {
  const { G } = person({ skin: "#f1c9a2", hair: "#a4471f", top: "#2aa596", legs: "#5a4632", shoes: "#6b3a1c", build: .9, hairStyle: "long", lips: "#c0504a" });
  ring(G, mat("#d9483b", .7), [0, .58, .004], .036, .35);                                            // scarf
  box(G, mat("#5b3a1a", .7), [0, .47, .056], [.012, .2, .008], [0, 0, .72]);                           // satchel strap
  box(G, mat("#a8743b", .6), [.078, .38, .04], [.05, .045, .025]);                                    // satchel
  rod(G, mat("#1f8f84", .65), [0, TOP_OF_HEAD - .02, 0], .125, .008);                                 // wide hat
  G.add(part(DOME(.5), mat("#26a596", .65), [0, TOP_OF_HEAD - .018, 0], [.076, .06, .078]));
  rod(G, mat("#f1c34a", .5), [0, TOP_OF_HEAD - .008, 0], .077, .013);
  ball(G, mat("#e56a4a", .6), [.06, TOP_OF_HEAD + .025, -.01], [.009, .036, .008], [0, 0, -.6]);       // feather
  return G;
}
function mountainAdventurer() {
  const { G } = person({ skin: "#d9a679", hair: "#3a2414", top: "#3f6fc8", legs: "#3c3f47", shoes: "#4a2a14", build: 1.05 });
  ball(G, mat("#4a2c18", .85), [0, .632, .045], [.055, .04, .04]);                                     // beard
  box(G, mat("#e07a2c", .7), [0, .49, -.085], [.13, .17, .07]);                                       // big backpack
  rod(G, mat("#4b9a5a", .75), [0, .59, -.085], .028, .16, [0, 0, Math.PI / 2]);                        // rolled mat
  rod(G, mat("#d9483b", .7), [0, .7, 0], .074, .022);                                                 // bandana
  ball(G, mat("#d9483b", .7), [-.068, .695, -.035], .013);
  for (const s of [-1, 1]) box(G, mat("#b3561a", .7), [s * .045, .49, .058], [.013, .13, .01]);
  rod(G, gold(), [0, .47, .063], .016, .005, [Math.PI / 2, 0, 0]);                                     // compass
  return G;
}
function outdoorExplorer() {
  const { G } = person({ skin: "#9c6b48", hair: "#1d120a", top: "#3c9a5f", legs: "#5b4a3a", shoes: "#2e1d10", build: 1 });
  for (const y of [.41, .46, .51]) ring(G, mat("#2a7a4a", .7), [0, y, 0], .079, .09);                // puffer jacket ridges
  ring(G, mat("#f1c34a", .6), [0, .575, .004], .032, .3);                                            // collar
  G.add(part(DOME(.5), mat("#e0a526", .8), [0, .69, 0], [.08, .075, .082]));                            // beanie
  ring(G, mat("#c4861a", .8), [0, .695, 0], .077, .14);
  ball(G, mat("#f4ead2", .9), [0, .77, 0], .02);
  box(G, mat("#f4ead2", .8), [-.12, .35, .04], [.05, .04, .004], [0, .4, 0]);                          // map
  rod(G, mat("#a8743b", .7), [.125, .37, .03], .006, .64);                                             // hiking stick
  return G;
}
function cricketer() {
  const { G, skin } = person({ skin: "#c98f62", hair: "#20140c", top: "#f6f3ea", legs: "#efebe0", shoes: "#f4f1ea", build: 1 }, false);
  const white = mat("#f6f3ea", .66), pad = mat("#fbfaf6", .5);
  for (const s of [-1, 1]) box(G, pad, [s * .038, .16, .03], [.042, .14, .03]);                       // batting pads
  ring(G, mat("#1f8a5b", .6), [0, .575, .004], .03, .3);                                             // green collar trim
  // arms: both hands together on the bat handle, the bat resting by the right foot
  for (const s of [-1, 1]) { limb(G, white, [s * .09, .55, 0], [s * .085, .45, .04], .023, .02); limb(G, white, [s * .085, .45, .04], [.03, .38, .07], .019, .017); }
  for (const s of [-1, 1]) ball(G, mat("#f0ede4", .5), [.03 + s * .012, .37 - s * .012, .075], [.024, .024, .022]);   // gloves
  rod(G, mat("#2a2a2a", .5), [.04, .33, .08], .011, .09, [0, 0, -.12]);                                // bat handle (grip)
  box(G, mat("#e7c88f", .5), [.055, .19, .085], [.04, .2, .016], [0, 0, -.12]);                         // bat blade
  // a green cap with a gold badge
  G.add(part(DOME(.5), mat("#1f7a52", .6), [0, TOP_OF_HEAD - .02, -.003], [.081, .06, .083]));
  box(G, mat("#1f7a52", .6), [0, TOP_OF_HEAD - .022, .075], [.08, .006, .06], [.15, 0, 0]);
  ball(G, gold(), [0, TOP_OF_HEAD + .005, .07], [.012, .012, .004]);
  void skin;
  return G;
}
function chef() {
  const { G } = person({ skin: "#e8b58e", hair: "#3a2414", top: "#fbfaf6", legs: "#2b2b30", shoes: "#1c1c1f", build: 1.05 }, false);
  const white = mat("#fbfaf6", .62), skin = skinMat("#e8b58e");
  for (const [x, y] of [[-.025, .5], [.025, .5], [-.025, .45], [.025, .45], [-.025, .4], [.025, .4]]) ball(G, gloss("#1d1d22", .3), [x, y, .06], .007);   // double-breasted buttons
  ring(G, mat("#d23b3b", .6), [0, .58, .004], .033, .32); cone(G, mat("#d23b3b", .6), [0, .55, .05], [.02, .04, .01], [Math.PI, 0, 0]);   // neckerchief
  box(G, mat("#f2efe8", .7), [0, .29, .055], [.12, .12, .01]);                                       // apron
  // left arm at the side; right arm raised holding a wooden spoon
  limb(G, white, [-.095, .55, 0], [-.11, .45, .01], .023, .02); limb(G, white, [-.11, .45, .01], [-.114, .36, .025], .019, .017); ball(G, skin, [-.116, .343, .028], .02);
  limb(G, white, [.095, .55, 0], [.13, .48, .05], .023, .02); limb(G, white, [.13, .48, .05], [.11, .56, .1], .019, .017); ball(G, skin, [.108, .575, .105], .02);
  rod(G, mat("#b07a3e", .55), [.105, .63, .11], .006, .13, [-.2, 0, .1]); ball(G, mat("#b07a3e", .55), [.112, .7, .124], [.018, .026, .01]);
  // the tall toque
  rod(G, white, [0, TOP_OF_HEAD + .015, 0], .072, .05);
  for (const [x, z] of [[0, 0], [.04, .025], [-.04, .025], [.04, -.025], [-.04, -.025]]) ball(G, white, [x, TOP_OF_HEAD + .075, z], .05);
  return G;
}
function dancer() {
  // a classical dancer: pleated silk dress with gold borders, a jasmine bun, gold jewellery, one hand raised in a graceful pose
  const G = new THREE.Group(); base(G);
  const skin = skinMat("#b9825a"), silk = mat("#c2185b", .45), border = gold(), blouse = mat("#7b1fa2", .5);
  for (const s of [-1, 1]) { ball(G, skin, [s * .035, .052, .02], [.026, .016, .045]); ring(G, border, [s * .035, .075, .005], .022, .25); }   // feet and anklets
  G.add(part(lathe("skirt", [[0, .07], [.12, .07], [.112, .12], [.09, .22], [.07, .33], [.062, .37], [0, .37]], 28), silk, [0, 0, 0]));   // flared skirt
  for (const y of [.072, .11]) ring(G, border, [0, y, 0], y < .1 ? .12 : .114, .05);                 // gold borders
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(G, mat("#e5397a", .45), [Math.cos(a) * .1, .17, Math.sin(a) * .1], [.012, .17, .012], [Math.sin(a) * .25, 0, -Math.cos(a) * .25]); }   // pleats
  G.add(part(lathe("dtorso", [[0, 0], [.058, 0], [.062, .06], [.074, .12], [.078, .17], [.05, .19], [0, .195]], 26), blouse, [0, .37, 0], [1, 1, .72]));
  box(G, silk, [.02, .47, .047], [.05, .2, .012], [0, 0, -.45]);                                     // drape over the shoulder
  ring(G, border, [0, .53, .012], .045, .12, [Math.PI / 2 - .5, 0, 0]);                              // necklace
  // arms: right raised in a mudra, left curved at the waist
  limb(G, skin, [.08, .54, 0], [.13, .62, .02], .019, .017); limb(G, skin, [.13, .62, .02], [.11, .72, .04], .016, .014); ball(G, skin, [.108, .74, .045], [.017, .022, .012]);
  limb(G, skin, [-.08, .54, 0], [-.12, .47, .03], .019, .017); limb(G, skin, [-.12, .47, .03], [-.07, .42, .06], .016, .014); ball(G, skin, [-.062, .415, .065], .017);
  for (const [x, y, z] of [[.115, .69, .035], [-.1, .44, .05]]) ring(G, border, [x, y, z], .018, .25);   // bangles
  rod(G, skin, [0, .585, 0], .022, .035);
  headWithFace(G, { skin: "#b9825a", hair: "#151010", top: "", legs: "", shoes: "", hairStyle: "bun", lips: "#a3243a" }, skin);
  for (let i = 0; i < 7; i++) { const a = -1.2 + i * .4; ball(G, mat("#fbf8ef", .5), [HEAD[0] + Math.sin(a) * .045, HEAD[1] + HR * .55 + Math.cos(a) * .045, HEAD[2] - HR * .78], .011); }   // jasmine around the bun
  ball(G, mat("#d9483b", .5), [0, HEAD[1] + HR * .2, HEAD[2] + HR * .98], .007);                      // bindi
  for (const s of [-1, 1]) ball(G, border, [s * HR * .95, HEAD[1] - HR * .3, HEAD[2]], .011);          // earrings
  return G;
}
function scholar() {
  // a scholar in a long kurta and shawl, round spectacles, holding an open book
  const { G } = person({ skin: "#d8a67c", hair: "#d9d4cc", top: "#1f3f7a", legs: "#efe6d2", shoes: "#5a3418", build: 1, hairStyle: "short", brows: "#cfc7bb" }, false);
  const kurta = mat("#1f3f7a", .62), skin = skinMat("#d8a67c");
  G.add(part(lathe("kurta", [[0, .2], [.085, .2], [.08, .3], [.075, .37], [0, .37]], 26), kurta, [0, 0, 0], [1, 1, .78]));   // long kurta over the legs
  ring(G, gold(), [0, .2, 0], .082, .06, [Math.PI / 2, 0, 0]);
  box(G, mat("#e0b05a", .6), [-.035, .46, .045], [.04, .24, .012], [0, 0, .5]);                      // shawl across the chest
  ball(G, mat("#e0b05a", .6), [-.075, .56, .0], [.04, .03, .055]);
  ball(G, mat("#e8e2d8", .8), [0, .62, .05], [.05, .045, .035]);                                       // short white beard
  for (const s of [-1, 1]) { ring(G, gold(), [HEAD[0] + s * HR * .34, HEAD[1] + HR * .08, HEAD[2] + HR * .99], HR * .2, .12, [0, 0, 0]); }   // spectacles
  box(G, gold(), [0, HEAD[1] + HR * .08, HEAD[2] + HR * .99], [HR * .2, HR * .04, HR * .04]);
  // both hands holding an open book in front of the chest
  for (const s of [-1, 1]) { limb(G, kurta, [s * .09, .55, 0], [s * .1, .45, .04], .023, .02); limb(G, kurta, [s * .1, .45, .04], [s * .05, .43, .09], .019, .017); ball(G, skin, [s * .045, .43, .1], .019); }
  for (const s of [-1, 1]) { box(G, mat("#8a2a1e", .6), [s * .038, .45, .1], [.075, .006, .06], [-.9, s * .25, 0]); box(G, mat("#fbf6e8", .7), [s * .036, .452, .103], [.068, .004, .054], [-.9, s * .25, 0]); }
  return G;
}

/* ---------- animals ---------- */
const stripes = () => painted("tiger", .7, (g) => {
  g.fillStyle = "#e8892e"; g.fillRect(0, 0, 256, 128); g.fillStyle = "#1f140c";
  for (let i = 0; i < 14; i++) { const x = i * 18.3 + 6; g.beginPath(); g.moveTo(x, 8); g.quadraticCurveTo(x + 8, 40, x - 2, 64); g.quadraticCurveTo(x + 6, 90, x + 1, 120); g.lineTo(x + 5, 120); g.quadraticCurveTo(x + 11, 90, x + 4, 64); g.quadraticCurveTo(x + 13, 40, x + 5, 8); g.closePath(); g.fill(); }
});
const spots = () => painted("chital", .68, (g) => {
  g.fillStyle = "#c27a3c"; g.fillRect(0, 0, 256, 128);
  let seed = 7; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  g.fillStyle = "#fbf3e2"; for (let i = 0; i < 70; i++) { g.beginPath(); g.ellipse(r() * 256, 20 + r() * 70, 3 + r() * 2.5, 2.4 + r() * 1.6, 0, 0, Math.PI * 2); g.fill(); }
});
type Sit = { fur: Obj; chest: Obj; paws?: Obj };
/** A sitting four-legged animal: haunches, upright chest, straight front legs. Returns the head's centre. */
function sitting(G: Obj, o: Sit): V3 {
  base(G);
  ball(G, o.fur, [0, .14, -.035], [.1, .1, .12]);                                                     // haunches
  for (const s of [-1, 1]) { ball(G, o.fur, [s * .07, .1, -.01], [.04, .07, .07]); ball(G, o.paws ?? o.fur, [s * .065, .048, .06], [.03, .018, .04]); }   // hind legs
  ball(G, o.fur, [0, .3, .02], [.078, .13, .072], [-.18, 0, 0]);                                      // body
  ball(G, o.chest, [0, .29, .07], [.052, .09, .03], [-.18, 0, 0]);                                    // chest
  for (const s of [-1, 1]) { limb(G, o.fur, [s * .04, .3, .07], [s * .038, .07, .085], .023, .019); ball(G, o.paws ?? o.fur, [s * .038, .05, .098], [.023, .016, .032]); }   // front legs
  return [0, .5, .06];
}
function lion() {
  const G = new THREE.Group(), fur = mat("#d9a14a", .7), mane = mat("#a8571f", .85), light = mat("#f1cf8a", .65);
  const [hx, hy, hz] = sitting(G, { fur, chest: light });
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; ball(G, mane, [hx + Math.cos(a) * .072, hy + Math.sin(a) * .078, hz - .03], .042); }   // mane
  ball(G, mane, [hx, hy - .02, hz - .05], [.09, .105, .065]);
  ball(G, fur, [hx, hy, hz], [.064, .068, .064]);
  ball(G, light, [hx, hy - .028, hz + .05], [.036, .027, .028]);                                      // muzzle
  ball(G, gloss("#5a2e1a", .3), [hx, hy - .008, hz + .073], [.014, .009, .009]);                      // nose
  for (const s of [-1, 1]) { eye(G, [hx + s * .025, hy + .018, hz + .055], .009); ball(G, fur, [hx + s * .05, hy + .056, hz - .005], [.018, .018, .011]); }
  tube(G, fur, [[.04, .08, -.12], [.13, .06, -.1], [.17, .1, -.02], [.15, .16, .03]], .011); ball(G, mane, [.15, .17, .035], .024);
  return G;
}
function tiger() {
  const G = new THREE.Group(), fur = stripes(), white = mat("#f6efe4", .65);
  const [hx, hy, hz] = sitting(G, { fur, chest: white, paws: white });
  ball(G, fur, [hx, hy, hz], [.07, .066, .066]);
  for (const s of [-1, 1]) { ball(G, white, [hx + s * .033, hy - .028, hz + .05], [.031, .025, .025]); eye(G, [hx + s * .027, hy + .017, hz + .058], .009); ball(G, fur, [hx + s * .053, hy + .053, hz - .005], [.02, .02, .011]); ball(G, white, [hx + s * .053, hy + .053, hz + .004], [.011, .011, .005]); }
  ball(G, gloss("#c9566a", .3), [hx, hy - .009, hz + .073], [.012, .009, .009]);
  tube(G, fur, [[.04, .08, -.12], [.14, .05, -.09], [.17, .1, 0], [.15, .17, .04]], .013); ball(G, mat("#1f140c", .7), [.148, .18, .045], .015);
  return G;
}
function fox() {
  const G = new THREE.Group(), fur = mat("#d96a24", .65), white = mat("#f7f1ea", .6), dark = mat("#2b1d16", .7);
  const [hx, hy, hz] = sitting(G, { fur, chest: white, paws: dark });
  ball(G, fur, [hx, hy, hz], [.055, .052, .055]);
  cone(G, fur, [hx, hy - .013, hz + .07], [.03, .075, .026], [Math.PI / 2, 0, 0]);                    // snout
  cone(G, white, [hx, hy - .024, hz + .064], [.024, .064, .017], [Math.PI / 2, 0, 0]);
  ball(G, gloss("#1b120c", .2), [hx, hy - .013, hz + .108], .01);
  for (const s of [-1, 1]) { eye(G, [hx + s * .022, hy + .015, hz + .044], .008); cone(G, fur, [hx + s * .033, hy + .065, hz - .005], [.024, .055, .013], [0, 0, s * -.25]); cone(G, dark, [hx + s * .034, hy + .078, hz + .002], [.013, .032, .006], [0, 0, s * -.25]); }
  const tail = new THREE.CatmullRomCurve3([[.03, .06, -.12], [.12, .04, -.08], [.16, .06, .02], [.15, .1, .08]].map(p => new THREE.Vector3(...p)));
  for (let i = 0; i <= 8; i++) { const p = tail.getPoint(i / 8), r = .02 + Math.sin((i / 8) * Math.PI) * .028; ball(G, i > 6 ? white : fur, [p.x, p.y, p.z], r); }   // bushy tail, white tip
  return G;
}
function monkey() {
  // a langur-style monkey sitting with a banana: brown fur, a pale heart-shaped face, big ears and a curling tail
  const G = new THREE.Group(), fur = mat("#8a5a34", .8), face = skinMat("#e9c19c"), light = mat("#c79566", .75);
  base(G);
  ball(G, fur, [0, .13, -.02], [.095, .085, .1]);                                                     // seat
  for (const s of [-1, 1]) { limb(G, fur, [s * .06, .12, .03], [s * .05, .07, .09], .03, .024); ball(G, face, [s * .048, .05, .105], [.024, .014, .03]); }   // folded legs and feet
  ball(G, fur, [0, .27, 0], [.08, .11, .07]);                                                         // body
  ball(G, light, [0, .26, .05], [.05, .075, .03]);                                                    // belly
  for (const s of [-1, 1]) { limb(G, fur, [s * .07, .34, .0], [s * .08, .24, .05], .022, .02); limb(G, fur, [s * .08, .24, .05], [s * .03, .22, .09], .019, .017); ball(G, face, [s * .025, .22, .095], .018); }
  cone(G, mat("#f2cf3a", .5), [0, .25, .1], [.014, .09, .014], [0, 0, 1.2]); ball(G, mat("#7a5a1a", .6), [-.04, .27, .1], .007);   // banana
  const [hx, hy, hz] = [0, .44, .02];
  ball(G, fur, [hx, hy, hz], [.075, .075, .07]);
  ball(G, face, [hx, hy - .01, hz + .045], [.055, .058, .035]);                                       // face
  ball(G, face, [hx, hy - .035, hz + .07], [.033, .024, .022]);                                       // muzzle
  for (const s of [-1, 1]) { eye(G, [hx + s * .021, hy + .008, hz + .078], .009); ball(G, face, [hx + s * .078, hy + .005, hz], [.026, .03, .012]); ball(G, mat("#c99a7a", .7), [hx + s * .078, hy + .005, hz + .006], [.015, .019, .006]); }
  ball(G, fur, [hx, hy + .05, hz + .035], [.06, .025, .03]);                                           // brow ridge of fur
  G.add(part(once("mouth", () => new THREE.TorusGeometry(1, .28, 6, 14, Math.PI)), mat("#6a3a2a", .5), [hx, hy - .045, hz + .088], .012, [0, 0, Math.PI]));
  tube(G, fur, [[0, .1, -.1], [.08, .05, -.15], [.15, .1, -.12], [.15, .22, -.08], [.1, .26, -.06]], .011, 24);   // curling tail
  return G;
}
function deer() {
  // a spotted chital deer standing: slender legs, white spots, big ears, small branching antlers and a white tail
  const G = new THREE.Group(), fur = spots(), plain = mat("#c27a3c", .68), white = mat("#fbf3e2", .6), dark = mat("#3a2414", .5);
  base(G);
  ball(G, fur, [0, .27, -.01], [.07, .068, .13]);                                                      // body
  ball(G, white, [0, .24, -.01], [.05, .04, .11]);                                                     // pale belly
  for (const [x, z] of [[-.035, .07], [.035, .07], [-.035, -.085], [.035, -.085]]) { limb(G, plain, [x, .25, z], [x, .09, z + .005], .017, .011); limb(G, plain, [x, .09, z + .005], [x, .05, z + .01], .011, .009); ball(G, dark, [x, .045, z + .012], [.012, .01, .015]); }
  ball(G, white, [0, .3, -.14], [.02, .03, .015]);                                                      // tail
  limb(G, fur, [0, .32, .09], [0, .44, .12], .03, .024);                                               // neck
  ball(G, white, [0, .36, .125], [.024, .04, .02]);                                                    // throat
  const [hx, hy, hz] = [0, .48, .13];
  ball(G, plain, [hx, hy, hz], [.042, .045, .05]);
  ball(G, plain, [hx, hy - .02, hz + .045], [.026, .025, .035]);                                      // muzzle
  ball(G, gloss("#1b120c", .2), [hx, hy - .02, hz + .078], .009);
  for (const s of [-1, 1]) {
    eye(G, [hx + s * .028, hy + .01, hz + .03], .009);
    ball(G, plain, [hx + s * .055, hy + .03, hz - .01], [.03, .016, .012], [0, 0, s * .5]);            // ears
    ball(G, mat("#f0d8c0", .7), [hx + s * .055, hy + .03, hz - .004], [.02, .01, .005], [0, 0, s * .5]);
    limb(G, mat("#8a6a42", .6), [hx + s * .02, hy + .04, hz - .01], [hx + s * .05, hy + .13, hz - .03], .006, .004);   // antlers
    limb(G, mat("#8a6a42", .6), [hx + s * .035, hy + .085, hz - .02], [hx + s * .02, hy + .12, hz + .005], .004, .003);
  }
  return G;
}
function peacock() {
  // a peacock with its train fanned out behind: deep blue body, a crest, and green feathers with eye spots
  const G = new THREE.Group(), blue = gloss("#1f4fb8", .3), teal = mat("#127a6f", .45), gold2 = mat("#d9b23a", .4);
  base(G);
  for (const s of [-1, 1]) { limb(G, mat("#b8a38a", .6), [s * .025, .16, .0], [s * .028, .045, .02], .009, .007); ball(G, mat("#b8a38a", .6), [s * .028, .04, .035], [.014, .006, .02]); }   // legs
  ball(G, blue, [0, .22, 0], [.055, .065, .08], [-.3, 0, 0]);                                         // body
  ball(G, mat("#2a6a3a", .5), [0, .24, -.05], [.05, .055, .05]);                                      // back
  limb(G, blue, [0, .25, .04], [0, .38, .06], .03, .022);                                              // neck
  ball(G, blue, [0, .41, .065], [.03, .03, .035]);                                                     // head
  for (const s of [-1, 1]) { ball(G, mat("#ffffff", .4), [s * .018, .415, .085], [.008, .005, .005]); eye(G, [s * .02, .412, .088], .006); }
  cone(G, mat("#8a7a62", .5), [0, .405, .105], [.008, .026, .006], [Math.PI / 2, 0, 0]);               // beak
  for (let i = -1; i <= 1; i++) { rod(G, teal, [i * .01, .45, .06], .002, .05, [0, 0, i * .25]); ball(G, blue, [i * .022, .475, .06], .008); }   // crest
  // the train: feathers in a fan behind, each with an eye spot near its tip
  const feather = mat("#2f8a3a", .45);
  for (let i = 0; i < 13; i++) {
    const a = -1.25 + (i / 12) * 2.5, len = .3, cx = Math.sin(a) * len * .55, cy = .22 + Math.cos(a) * len * .7, z = -.095 - Math.cos(a) * .02;
    G.add(part(SPH(), feather, [cx, cy, z], [.032, len * .55, .006], [0, 0, -a]));
    const tx = Math.sin(a) * len * 1.0, ty = .22 + Math.cos(a) * len * 1.18;
    ball(G, gold2, [tx, ty, z + .004], [.026, .03, .004]);
    ball(G, teal, [tx, ty, z + .007], [.017, .02, .004]);
    ball(G, mat("#173a8a", .4), [tx, ty, z + .01], [.009, .011, .003]);
  }
  return G;
}
function panda() {
  const G = new THREE.Group(), white = mat("#f7f8f9", .7), black = mat("#1d2026", .75);
  base(G);
  ball(G, white, [0, .19, 0], [.12, .14, .11]);                                                       // round sitting body
  ball(G, black, [0, .26, 0], [.122, .05, .112]);                                                     // black shoulder band
  for (const s of [-1, 1]) { ball(G, black, [s * .065, .07, .05], [.045, .04, .06]); limb(G, black, [s * .1, .28, .03], [s * .085, .16, .08], .035, .03); }
  rod(G, mat("#7cc46a", .5), [.075, .2, .1], .01, .22, [0, 0, -.15]);                                 // bamboo
  ball(G, mat("#5fae52", .6), [.09, .32, .1], [.03, .008, .014], [0, 0, .5]);
  const hy = .41;
  for (const s of [-1, 1]) ball(G, black, [s * .058, hy + .062, -.01], .028);
  ball(G, white, [0, hy, 0], [.082, .076, .078]);
  for (const s of [-1, 1]) { ball(G, black, [s * .028, hy + .008, .066], [.02, .026, .012], [0, 0, s * -.5]); ball(G, mat("#ffffff", .3), [s * .028, hy + .011, .075], .0065); ball(G, gloss("#0c0c0c", .1), [s * .028, hy + .011, .079], .0038); }
  ball(G, white, [0, hy - .026, .064], [.032, .024, .021]);
  ball(G, gloss("#1d2026", .3), [0, hy - .017, .083], [.013, .009, .009]);
  return G;
}
function elephant() {
  const G = new THREE.Group(), grey = mat("#8e98a8", .72);
  base(G);
  for (const [x, z] of [[-.05, .05], [.05, .05], [-.05, -.06], [.05, -.06]]) { rod(G, grey, [x, .11, z], .027, .15); ball(G, mat("#f0e9dc", .5), [x, .04, z + .023], [.016, .008, .006]); }
  ball(G, grey, [0, .245, -.01], [.092, .088, .125]);                                                 // body
  const cloth = once("cloth", () => new THREE.CylinderGeometry(.094, .094, .13, 24, 1, true, -Math.PI / 2, Math.PI));
  G.add(part(cloth, once("clothm", () => new THREE.MeshStandardMaterial({ color: "#c9443b", roughness: .7, side: THREE.DoubleSide })), [0, .255, -.01], [1, 1, 1], [Math.PI / 2, Math.PI / 2, 0]));
  ring(G, gold(), [0, .27, .115], .07, .05, [0, 0, 0]);
  ball(G, grey, [0, .33, .1], [.068, .07, .066]);                                                     // head
  for (const s of [-1, 1]) { ball(G, grey, [s * .074, .33, .07], [.052, .064, .012], [0, s * .5, 0]); ball(G, mat("#e7a9b5", .7), [s * .072, .33, .078], [.034, .042, .006], [0, s * .5, 0]); eye(G, [s * .032, .345, .158], .008); }
  tube(G, grey, [[0, .31, .16], [0, .25, .19], [0, .17, .2], [.01, .12, .22], [.03, .11, .235]], .017, 20);
  for (const s of [-1, 1]) cone(G, mat("#fffaf0", .35), [s * .026, .28, .17], [.008, .04, .008], [-2, 0, s * -.3]);
  return G;
}
function rabbit() {
  const G = new THREE.Group(), white = mat("#f5f0f2", .72), pink = mat("#f2aac0", .6);
  base(G);
  ball(G, white, [0, .15, -.02], [.1, .11, .12]);                                                     // haunches
  ball(G, white, [0, .25, .02], [.066, .1, .066]);                                                    // body
  for (const s of [-1, 1]) { ball(G, white, [s * .06, .05, .05], [.03, .018, .065]); limb(G, white, [s * .035, .24, .07], [s * .035, .12, .085], .016, .014); }
  ball(G, white, [0, .14, -.13], .03);                                                                // tail
  cone(G, mat("#f08a2c", .6), [.04, .18, .1], [.014, .08, .014], [Math.PI * .9, 0, .4]);              // carrot
  ball(G, mat("#4fa84a", .6), [.058, .225, .1], [.016, .007, .007], [0, 0, 1]);
  const hy = .39;
  ball(G, white, [0, hy, .03], [.062, .06, .062]);
  for (const s of [-1, 1]) { ball(G, white, [s * .026, hy + .13, 0], [.019, .078, .013], [0, 0, s * -.12]); ball(G, pink, [s * .026, hy + .13, .009], [.011, .06, .005], [0, 0, s * -.12]); eye(G, [s * .026, hy + .013, .085], .009); }
  ball(G, gloss("#f07a98", .3), [0, hy - .01, .092], [.01, .008, .007]);
  return G;
}

const BUILD: Record<PieceId, () => Obj> = {
  "pawn-gold": () => pawn("#e9b93e"), "pawn-green": () => pawn("#22a85e"), "pawn-red": () => pawn("#d93a46"), "pawn-blue": () => pawn("#3b6fd9"),
  "young-explorer": youngExplorer, "jungle-adventurer": jungleAdventurer, "mountain-adventurer": mountainAdventurer, "outdoor-explorer": outdoorExplorer,
  cricketer, chef, dancer, scholar,
  lion, panda, elephant, rabbit, peacock, monkey, fox, tiger, deer,
};
/** A new 3D figure for a token (shares geometry and materials with other figures). Falls back to a plain pawn. */
export function buildFigure(id: PieceId): Obj {
  let g: Obj;
  try { g = (BUILD[id] ?? BUILD["pawn-gold"])(); } catch { g = pawn(pieceById(id).accent); }
  g.name = id;
  return g;
}
