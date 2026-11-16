/* Background colours for the app ("Look" in Settings). Only the background changes; gold, saffron buttons and the
   game art stay the same. Emerald, Ruby and Indigo are free; the others are unlocked with coins or a level
   (src/economy/rules.ts SHOP). The choice is kept on this phone in localStorage rc-app-bg. */
import { useSyncExternalStore } from "react";

export interface Bg { id: string; name: string; dark: string; mid: string; light: string; bar: string }
export const BGS: Bg[] = [
  { id: "bg-emerald", name: "Royal Emerald", dark: "#072A20", mid: "#0B3B2D", light: "#1B6B50", bar: "#0E3F31" },
  { id: "bg-ruby", name: "Ruby Maroon", dark: "#2A0710", mid: "#4A0E1C", light: "#7A1A2E", bar: "#3A0A16" },
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
  subs.forEach(f => f());
}
/** CSS variables for a background colour, set on the app shell. */
export function bgVars(id: string): Record<string, string> {
  const b = BGS.find(x => x.id === id) ?? BGS[0];
  return { "--rx-dark": b.dark, "--rx-mid": b.mid, "--rx-light": b.light, "--rx-bar": b.bar };
}
