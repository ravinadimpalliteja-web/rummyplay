import type { CapacitorConfig } from "@capacitor/cli";

/* Royal Club Android app (Capacitor).
   - Default ("bundled"): the games ship inside the app from dist/, so vs-computer play works offline.
   - Test build: the GitHub workflow sets CAP_SERVER_URL=https://test.royalclubgames.com, so the test app
     opens the test site directly and picks up every game change without a new APK. */
declare const process: { env: Record<string, string | undefined> };
const liveUrl = (process.env.CAP_SERVER_URL ?? "").trim();

const config: CapacitorConfig = {
  appId: "com.royalclubgames.app",
  appName: "Royal Club",
  webDir: "dist",
  backgroundColor: "#FAF5E9",
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: "#FAF5E9", showSpinner: false }
  },
  ...(liveUrl ? { server: { url: liveUrl, cleartext: false } } : {})
};

export default config;
