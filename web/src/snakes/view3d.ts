import { PAD, THICK, W } from "./board";

/* The 3D view: the flat board picture is tilted back with the browser's own 3D transform (done by the graphics chip, no
   3D engine). Tokens are not part of that picture; they are drawn upright on a flat canvas above it, at the screen
   positions worked out here with the very same transform, so they stand exactly on their squares. Pure presentation:
   nothing here touches the game state. */
/** k: how much taller than wide the board is drawn (1 = square; upright phones use their spare height, up to MAX_STRETCH). */
export type View = { B: number; left: number; top: number; A: number; D: number; m: DOMMatrix; sw: number; sh: number; k: number };
export const MAX_STRETCH = 1.18;

/** Camera distance, in board widths: lower is a stronger perspective. */
const DIST = 2.4;
const tf = (A: number, D: number, k: number) => [A ? `perspective(${D}px) rotateX(${A}deg)` : "", k !== 1 ? `scale(1, ${k})` : ""].join(" ").trim();
const mat = (A: number, D: number, k = 1) => { const t = tf(A, D, k); return t ? new DOMMatrix(t) : new DOMMatrix(); };

function raw(m: DOMMatrix, B: number, x: number, y: number, z: number) {
  const p = m.transformPoint(new DOMPoint((x / W) * B - B / 2, (y / W) * B - B / 2, (z / W) * B, 1));
  return { x: p.x / p.w + B / 2, y: p.y / p.w + B / 2, w: p.w };
}

/** Fits the tilted board (with its front edge and the tokens standing on the back row) into a sw x sh area.
    A is the tilt in degrees (0 = flat, seen from straight above). On upright phones (narrow space) the width is the limit:
    the whole board fills the width with a thin margin, and it is drawn a little taller than wide to use the spare height. */
export function fitView(sw: number, sh: number, A: number): View {
  const narrow = sw < sh * .9, e = narrow ? -PAD * .25 : 0;            // upright phones: the whole frame shows, with a thin margin at the screen edges
  const measure = (k: number) => {
    const m1 = mat(A, DIST, k);
    const corners = [[e, e, 0], [W - e, e, 0], [e, W - e, 0], [W - e, W - e, 0]];
    if (!narrow) corners.push([0, 0, 0], [W, 0, 0], [0, W, 0], [W, W, 0], [0, W, -THICK], [W, W, -THICK]);
    const pts = corners.map(([x, y, z]) => raw(m1, 1, x, y, z));
    // room above the back row for the tokens standing there (on a flat board they may overlap the rim)
    const above = A ? 46 : narrow ? 0 : 22;
    if (above) for (const [x] of [[0], [W]]) { const p = raw(m1, 1, x, 0, 0); pts.push({ x: p.x, y: p.y - above / W / p.w, w: p.w }); }
    const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x)), minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
    // keep a little room below for the board's shadow on the tilted board
    const ew = maxX - minX, eh = maxY - minY, room = A && !narrow ? sh * .04 : 0, B = Math.max(60, Math.min(sw / ew, (sh - room) / eh));
    return { k, B, ew, eh, room, minX, minY, fits: eh * B <= (sh - room) * .97 };
  };
  // upright phones: the width is the limit, so draw the board a little taller than wide to use the spare height
  let f = measure(1);
  if (narrow) for (let k = MAX_STRETCH; k > 1.005; k -= .01) { const g = measure(k); if (g.fits && g.B >= f.B * .999) { f = g; break; } }
  const { k, B, ew, eh, room, minX, minY } = f;
  return { B, A, k, D: DIST * B, m: mat(A, DIST * B, k), sw, sh, left: (sw - ew * B) / 2 - minX * B, top: (sh - room - eh * B) / 2 - minY * B };
}

/** Screen position (in the stage's CSS px) of board point (x, y) at height z, with u = screen px per board unit there. */
export function project(v: View, x: number, y: number, z = 0) {
  const r = raw(v.m, v.B, x, y, z);
  return { x: r.x + v.left, y: r.y + v.top, u: v.B / W / r.w };
}
/** How flat the board looks at (x, y): the screen height of a small step down the board over the width of a step across. */
export function squash(v: View, x: number, y: number) {
  const a = project(v, x, y), b = project(v, x, y + 4), c = project(v, x + 4, y);
  return Math.max(.2, Math.min(1, (b.y - a.y) / ((c.x - a.x) || 1)));
}
/** CSS for an element showing the board picture (or another layer of it) in this view. */
export const planeStyle = (v: View) => ({ left: v.left + "px", top: v.top + "px", width: v.B + "px", height: v.B + "px", transform: tf(v.A, v.D, v.k) || "none" });
