/* Background colours for the app ("Look" in Settings). Only the background changes; gold, saffron buttons and the
   game art stay the same. Emerald (the default), Maroon, Cream and Indigo are free; the others are unlocked with
   coins or a level (src/economy/rules.ts SHOP). The choice is kept on this phone in localStorage rc-app-bg.
   dark/mid/light/bar are the deep colours used by the game lobbies and menus (and the app for the dark looks).
   Festive Cream is the one light look: the app tabs turn cream (shellVars + .rx-light in app-shell.css) under a maroon
   band with the logo, while the game lobbies and menus, which are drawn for a deep background, use that maroon. */
import { useSyncExternalStore } from "react";

export interface Bg { id: string; name: string; dark: string; mid: string; light: string; bar: string; cream?: boolean }
export const BGS: Bg[] = [
  { id: "bg-emerald", name: "Royal Emerald", dark: "#072A20", mid: "#0B3B2D", light: "#1B6B50", bar: "#0E3F31" },
  { id: "bg-ruby", name: "Royal Maroon", dark: "#2C0207", mid: "#4A0510", light: "#7A1426", bar: "#3A040C" },
  { id: "bg-cream", name: "Festive Cream", dark: "#3E030B", mid: "#5A0612", light: "#8A1E30", bar: "#4A0510", cream: true },
  { id: "bg-indigo", name: "Midnight Indigo", dark: "#0B1030", mid: "#18205A", light: "#2C3A8C", bar: "#121A48" },
  { id: "bg-purple", name: "Royal Purple", dark: "#1C0A2E", mid: "#33124F", light: "#5A2A86", bar: "#2A0F42" },
  { id: "bg-peacock", name: "Peacock Teal", dark: "#04222A", mid: "#0A3F4C", light: "#157A8C", bar: "#08323D" },
];
const KEY = "rc-app-bg";
let current = (() => { try { const v = window.localStorage.getItem(KEY); return BGS.some(b => b.id === v) ? v! : BGS[0].id; } catch { return BGS[0].id; } })();
const subs = new Set<() => void>();
export const useBg = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => current, () => current);
export function setBg(id: string) {
  if (!BGS.some(b => b.id === id)) return;
  current = id;
  try { window.localStorage.setItem(KEY, id); } catch { /* storage off */ }
  paintRoot(id);
  subs.forEach(f => f());
}
export const isCream = (id: string) => !!BGS.find(b => b.id === id)?.cream;
/** CSS variables for a background colour: the deep colours, used by the game lobbies and menus. */
export function bgVars(id: string): Record<string, string> {
  const b = BGS.find(x => x.id === id) ?? BGS[0];
  return { "--rx-dark": b.dark, "--rx-mid": b.mid, "--rx-light": b.light, "--rx-bar": b.bar };
}
/** CSS variables for the app tabs (home, friends, rewards, profile, settings): cream for Festive Cream. */
export function shellVars(id: string): Record<string, string> {
  return isCream(id) ? { "--rx-dark": "#F2DDBB", "--rx-mid": "#FBEEDB", "--rx-light": "#FFFBF3", "--rx-bar": "#FFFFFF" } : bgVars(id);
}
/* The same deep colours on <html>, for the game screens styled in plain CSS (waiting rooms, token picker, names). */
function paintRoot(id: string) {
  try { const s = document.documentElement.style; for (const [k, v] of Object.entries(bgVars(id))) s.setProperty(k, v); } catch { /* no DOM */ }
}
paintRoot(current);
