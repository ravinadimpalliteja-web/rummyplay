import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";

/** True when Royal Club runs inside the Android/iOS app instead of a browser. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/** Android back button inside the app. `onBack` returns true when it handled the press
    (for example, going from a game back to the home screen); otherwise the app closes. */
export function onNativeBack(onBack: () => boolean): () => void {
  if (!isNativeApp()) return () => {};
  const handle = NativeApp.addListener("backButton", () => {
    if (!onBack()) void NativeApp.exitApp();
  });
  return () => { void handle.then(h => h.remove()); };
}

/** Links to the plain-HTML game pages (EKAH, Chess). Inside the app the page file is named in full,
    because the app's built-in file server does not turn "/ekah/" into "/ekah/index.html" by itself. */
export function pageHref(href: string): string {
  if (!isNativeApp()) return href;
  return href.replace(/^(\/[a-z-]+\/)(\?|$)/, "$1index.html$2");
}
