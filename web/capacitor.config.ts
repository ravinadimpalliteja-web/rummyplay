import type { CapacitorConfig } from "@capacitor/cli";

/* Ambaro Android app (Capacitor). The app id stays com.royalclubgames.app (changing it would make a different app).
   - Default ("bundled"): the games ship inside the app from dist/, so vs-computer play works offline.
   - Test build: the GitHub workflow sets CAP_SERVER_URL=https://test.royalclubgames.com, so the test app
     opens the test site directly and picks up every game change without a new APK. */
declare const process: { env: Record<string, string | undefined> };
const liveUrl = (process.env.CAP_SERVER_URL ?? "").trim();
const appName = (process.env.ANDROID_APP_NAME ?? "Ambaro").trim() || "Ambaro";

const config: CapacitorConfig = {
  appId: "com.royalclubgames.app",
  appName,
  webDir: "dist",
  /* Shown behind the status and navigation bars (and while a page loads): the app's dark night-green. */
  backgroundColor: "#06140F",
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: "#0B3B2D", showSpinner: false },
    /* No page asks for viewport-fit=cover, so Capacitor keeps every screen between the status bar and the
       navigation bar (native padding): nothing is ever drawn under the time, network or battery icons.
       style DARK = light icons, readable on the dark bars. During a game the status bar is hidden for a
       full-screen board (app-mode.js); a swipe down from the top shows it for a moment. */
    SystemBars: { insetsHandling: "css", style: "DARK" },
    /* Live updates (src/lib/liveUpdate.ts) decide themselves when to download; the plugin only installs and,
       if a new version does not start within 10 s, goes back to the previous one. A new app from the
       Play Store drops downloaded updates, so it always starts on its own packaged code. */
    CapacitorUpdater: { autoUpdate: false, appReadyTimeout: 10000, resetWhenUpdate: true }
  },
  ...(liveUrl ? { server: { url: liveUrl, cleartext: false } } : {})
};

export default config;
