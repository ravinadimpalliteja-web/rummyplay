/* How each Snakes & Ladders token moves and sounds. Purely visual: the time each move takes never changes (online rooms
   stay in step with the server), only the body language inside that time.

   Gaits (walking from square to square):
     glide    classic pawns: a smooth little hop
     walk     people: two quick steps per square, swaying from foot to foot
     bound    big cats, fox and deer: one long springy leap, stretching out and landing with a squash
     hop      rabbit: two springy hops
     plod     elephant and panda: a heavy, rolling waddle that thumps down
     scamper  monkey: three quick bouncy skips
     flutter  peacock: a fluttering glide, wings wobbling
   Climbs (going up a ladder) use the same families: people climb hand over hand, the monkey swings up fast, cats leap
   rung to rung, heavy animals haul themselves up, the rabbit hops, the peacock flutters up. */
import type { PieceId } from "./tokens";

export type Gait = "glide" | "walk" | "bound" | "hop" | "plod" | "scamper" | "flutter";
export type Voice = "chime" | "man" | "woman" | "boy" | "big-cat" | "elephant" | "monkey" | "small" | "panda" | "fox" | "peacock";

const GAIT: Record<PieceId, Gait> = {
  "pawn-gold": "glide", "pawn-green": "glide", "pawn-red": "glide", "pawn-blue": "glide",
  "young-explorer": "walk", "jungle-adventurer": "walk", "mountain-adventurer": "walk", "outdoor-explorer": "walk",
  cricketer: "walk", chef: "walk", dancer: "walk", scholar: "walk",
  lion: "bound", tiger: "bound", fox: "bound", deer: "bound", rabbit: "hop", elephant: "plod", panda: "plod", monkey: "scamper", peacock: "flutter",
};
const VOICE: Record<PieceId, Voice> = {
  "pawn-gold": "chime", "pawn-green": "chime", "pawn-red": "chime", "pawn-blue": "chime",
  "young-explorer": "boy", "jungle-adventurer": "woman", "mountain-adventurer": "man", "outdoor-explorer": "man",
  cricketer: "man", chef: "man", dancer: "woman", scholar: "man",
  lion: "big-cat", tiger: "big-cat", elephant: "elephant", monkey: "monkey", rabbit: "small", deer: "small", panda: "panda", fox: "fox", peacock: "peacock",
};
export const gaitOf = (id: PieceId | undefined): Gait => (id && GAIT[id]) || "glide";
export const voiceOf = (id: PieceId | undefined): Voice => (id && VOICE[id]) || "chime";

/** Body pose at time t (0..1) of one step: h = lift in board units, s = scale, sway = side tilt (radians),
    lean = forward lean (radians), k = how far along the step (0..1, eased to suit the gait). */
export type Pose = { h: number; s: number; sway: number; lean: number; k: number };
const smooth = (t: number) => t * t * (3 - 2 * t);
export function stepPose(g: Gait, t: number, n: number): Pose {
  const side = n % 2 ? 1 : -1;
  switch (g) {
    case "walk": {                      // two steps: bob twice, rock from one foot to the other
      const b = Math.abs(Math.sin(t * Math.PI * 2));
      return { h: b * 5, s: 1 - .03 * (1 - b), sway: Math.sin(t * Math.PI * 2) * .13, lean: .08, k: t };
    }
    case "bound": {                     // crouch, spring, stretch out in the air, land with a squash
      const k = smooth(Math.min(1, Math.max(0, (t - .12) / .78)));
      const air = t < .12 ? 0 : t > .9 ? 0 : Math.sin(((t - .12) / .78) * Math.PI);
      const crouch = t < .12 ? (t / .12) : t > .9 ? (1 - (t - .9) / .1) : 0;
      return { h: air * 20, s: 1 - crouch * .1 + air * .04, sway: 0, lean: .35 * air - .15 * crouch, k };
    }
    case "hop": {                       // two springy hops with a squash on each landing
      const ph = (t * 2) % 1, air = Math.sin(ph * Math.PI);
      return { h: air * 13, s: 1 - (1 - air) * .1, sway: 0, lean: .12 * air, k: t };
    }
    case "plod": {                      // heavy waddle: low lift, big side roll, a thump at the end
      const k = smooth(t), b = Math.sin(t * Math.PI);
      return { h: b * 3, s: t > .85 ? 1 - (1 - (t - .85) / .15) * .06 : 1, sway: side * b * .2, lean: .05, k };
    }
    case "scamper": {                   // three quick skips
      const ph = (t * 3) % 1, air = Math.sin(ph * Math.PI);
      return { h: air * 7, s: 1, sway: Math.sin(t * Math.PI * 3) * .12, lean: .2, k: t };
    }
    case "flutter": {                   // a fluttering glide, wings wobbling
      const b = Math.sin(t * Math.PI);
      return { h: b * 15 + Math.sin(t * Math.PI * 6) * 2 * b, s: 1 + .04 * b, sway: Math.sin(t * Math.PI * 6) * .1 * b, lean: .1, k: smooth(t) };
    }
    default:
      return { h: Math.sin(t * Math.PI) * 12, s: 1, sway: 0, lean: 0, k: t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 };
  }
}

/** Body pose for one rung of a ladder climb (t 0..1, i = rung number). */
export function rungPose(g: Gait, t: number, i: number, last: boolean): Pose {
  const side = i % 2 ? 1 : -1, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, b = Math.sin(t * Math.PI);
  if (last) return { h: b * 12, s: 1 + .1 * b, sway: 0, lean: 0, k: e };
  switch (g) {
    case "walk": return { h: b * 6, s: 1, sway: side * .2 * b, lean: .32, k: e };                       // hand over hand
    case "scamper": return { h: b * 10, s: 1, sway: side * .34 * b, lean: .4, k: smooth(t) };           // swings up, arm to arm
    case "bound": return { h: b * 12, s: 1 - (1 - b) * .06, sway: 0, lean: .45 * b + .1, k: smooth(Math.min(1, t * 1.15)) };   // leaps rung to rung
    case "hop": return { h: b * 11, s: 1 - (1 - b) * .08, sway: 0, lean: .2, k: e };
    case "plod": return { h: b * 3, s: 1 - .05 * b, sway: side * .12 * b, lean: .25, k: t < .35 ? t * .4 : .14 + (t - .35) / .65 * .86 };   // hauls itself up
    case "flutter": return { h: b * 14 + Math.sin(t * Math.PI * 4) * 2, s: 1, sway: Math.sin(t * Math.PI * 4) * .12, lean: .1, k: e };
    default: return { h: b * 6, s: 1, sway: side * .2 * b, lean: .32, k: e };
  }
}
