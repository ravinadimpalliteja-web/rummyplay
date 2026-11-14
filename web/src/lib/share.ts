/* Room invites: a WhatsApp share and a copy that work both on the website and inside the Android app.

   - Inside the app the page address is https://localhost (the games are bundled), which is useless to a friend,
     so invites always point at the public site address instead.
   - The invite carries a join link (…/?join=ludo&room=K7QM&pass=4821) that opens the game with the code and
     passcode already filled in.
   - WhatsApp: in the app, window.open() does nothing (the WebView has no new windows), so the app navigates to the
     wa.me link instead; Capacitor hands any outside address to Android, which opens WhatsApp. On the website a new
     tab opens wa.me, which goes on to the WhatsApp app (phone) or WhatsApp Web (computer).
   - Copy: navigator.clipboard is refused in some WebViews and older browsers, so a hidden-textarea copy is the
     fallback. */
import { isNativeApp } from "./native";

/** The address friends should open. Set VITE_PUBLIC_SITE_URL at launch (https://royalclubgames.com). */
export function siteUrl(): string {
  const env = String(import.meta.env.VITE_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (env) return env;
  const o = window.location.origin;
  if (isNativeApp() || /\/\/localhost(:\d+)?$/.test(o) || !/^https?:/.test(o)) return "https://test.royalclubgames.com";
  return o;
}

export function joinLink(game: "ludo" | "snakes", code: string, pass: string): string {
  return `${siteUrl()}/?join=${game}&room=${encodeURIComponent(code)}&pass=${encodeURIComponent(pass)}`;
}

export function inviteText(gameName: string, game: "ludo" | "snakes", code: string, pass: string): string {
  return `Join my Royal Club ${gameName} room!\nRoom code: ${code}\nPasscode: ${pass}\nTap to join: ${joinLink(game, code, pass)}`;
}

export function shareOnWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  if (isNativeApp()) { window.location.href = url; return; }
  const w = window.open(url, "_blank", "noopener");
  if (!w) window.location.href = url;
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* try the old way */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; ta.style.left = "-9999px";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}

/** A join link the page was opened with (?join=ludo&room=K7QM&pass=4821), or null. Removes it from the address bar. */
export function takeJoinLink(): { game: "ludo" | "snakes"; code: string; pass: string } | null {
  try {
    const q = new URLSearchParams(window.location.search), game = q.get("join"), code = (q.get("room") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if ((game !== "ludo" && game !== "snakes") || code.length !== 4) return null;
    const pass = (q.get("pass") ?? "").replace(/\D/g, "").slice(0, 4);
    window.history.replaceState(null, "", window.location.pathname);
    return { game, code, pass };
  } catch { return null; }
}
