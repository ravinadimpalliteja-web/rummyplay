/* Live updates for the Play Store app: new game code without a Play Store update.
   How it works:
   - The "Publish live update" GitHub workflow (run by hand) builds the website, zips it and puts the zip plus
     manifest.json on the "live-update" release page.
   - When the app starts or comes back to the front, it reads manifest.json. If there is a newer version that
     this app can run, it downloads the zip in the background and switches to it the next time the app starts.
   - notifyAppReady() tells the updater this version started fine. If a new version fails to start, the
     updater goes back to the previous one by itself.
   Only the bundled app updates this way. The test app opens the test site, so it is always up to date already. */
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { App } from "@capacitor/app";
import { CapacitorUpdater } from "@capgo/capacitor-updater";

/** The version of the code in this bundle: the git commit it was built from (set by the build), "dev" locally. */
declare const __BUNDLE_VERSION__: string;
export const BUNDLE_VERSION = typeof __BUNDLE_VERSION__ === "string" && __BUNDLE_VERSION__ ? __BUNDLE_VERSION__ : "dev";

const MANIFEST_URL = String(import.meta.env.VITE_LIVE_UPDATE_URL ?? "").trim()
  || "https://github.com/ravinadimpalliteja-web/rummyplay/releases/download/live-update/manifest.json";

type Manifest = { version?: string; url?: string; minNative?: number };

let checking = false;
async function check(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    // Native HTTP (not fetch), so the redirect to GitHub's file storage is not blocked by CORS.
    const res = await CapacitorHttp.get({ url: `${MANIFEST_URL}?t=${Date.now()}`, responseType: "json" });
    const m: Manifest = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    if (res.status !== 200 || !m || typeof m.version !== "string" || typeof m.url !== "string" || !/^https:\/\//.test(m.url)) return;
    if (m.version === BUNDLE_VERSION) return;                       // already running it
    const info = await App.getInfo();
    if (m.minNative && (Number(info.build) || 0) < m.minNative) return; // needs a newer app from the Play Store
    const { bundles } = await CapacitorUpdater.list();
    const ready = bundles.find(b => b.version === m.version && b.status === "success");
    const bundle = ready ?? await CapacitorUpdater.download({ url: m.url, version: m.version });
    await CapacitorUpdater.next({ id: bundle.id });                 // used from the next app start
  } catch (e) {
    console.warn("Live update check failed", e);                   // offline or no update published yet
  } finally {
    checking = false;
  }
}

/** Call once when the app starts. Does nothing on the website or in the test app. */
export function startLiveUpdates(): void {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("CapacitorUpdater")) return;
  void CapacitorUpdater.notifyAppReady().catch(() => {});
  if (location.hostname !== "localhost") return;                   // test app: runs the test site directly
  void check();
  void App.addListener("resume", () => { void check(); });
}
