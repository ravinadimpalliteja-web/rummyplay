/* "Reduce animations": a per-device setting shared by all games (Ludo, Snakes & Ladders, Chess), on top of the
   phone's own "reduce motion" accessibility setting. Stored in localStorage as rc-reduce-motion = "on" / "off". */
const KEY = "rc-reduce-motion";
export function motionPref(): "on" | "off" | null {
  try { const v = window.localStorage.getItem(KEY); return v === "on" || v === "off" ? v : null; } catch { return null; }
}
/** True when animations should be cut down: the player chose it, or the phone asks for less motion (unless the player turned it off). */
export function motionReduced(): boolean {
  if (typeof window === "undefined") return false;
  const p = motionPref();
  if (p) return p === "on";
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
export function setMotionReduced(on: boolean) { try { window.localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage off */ } }
