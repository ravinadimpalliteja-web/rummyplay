import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/* The EKAH page (public/ekah/) is plain HTML and cannot read Vite settings, so the build writes ekah/config.js
   with the same VITE_ROOM_SERVER_URL and Supabase settings (both public) the React pages use. The dev server serves the same file. */
/* The room server. Rooms moved from Render (wss://royal-club-rooms.onrender.com) to Cloudflare in November 2026:
   faster from India and it never sleeps. VITE_ROOM_SERVER_URL can still choose another server, but an old Render
   address left in a build setting is upgraded to Cloudflare. To go back to Render, change ROOMS_DEFAULT and remove the
   upgrade below. */
const ROOMS_DEFAULT = "wss://royal-club-rooms.ravi-nadimpalli-teja.workers.dev";
const roomServer = (value: unknown): string => {
  const v = String(value ?? "").trim();
  return !/^wss?:\/\//.test(v) || /onrender\.com/.test(v) ? ROOMS_DEFAULT : v;
};

function ekahConfig(): Plugin {
  let source = "";
  return {
    name: "ekah-config",
    configResolved(config) {
      const url = roomServer(config.env.VITE_ROOM_SERVER_URL);
      const sbUrl = String(config.env.VITE_SUPABASE_URL ?? "").trim(), sbKey = String(config.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
      source = `window.RC_ROOM_SERVER_URL = ${JSON.stringify(/^wss?:\/\//.test(url) ? url : "")};\n`
        + `window.RC_SUPABASE_URL = ${JSON.stringify(/^https:\/\//.test(sbUrl) ? sbUrl.replace(/\/+$/, "") : "")};\n`
        + `window.RC_SUPABASE_KEY = ${JSON.stringify(sbKey)};\n`;
    },
    configureServer(server) {
      server.middlewares.use("/ekah/config.js", (_req, res) => {
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.end(source);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "ekah/config.js", source });
    }
  };
}

declare const process: { env: Record<string, string | undefined>; cwd(): string };

export default defineConfig(({ mode }) => ({
  plugins: [react(), ekahConfig()],
  /* Which code this bundle holds (the git commit), so the app's live updates can tell if it is up to date. */
  define: {
    __BUNDLE_VERSION__: JSON.stringify((process.env.BUNDLE_VERSION ?? "").trim() || "dev"),
    /* the room server the React pages use (see roomServer above) */
    __ROOM_SERVER_URL__: JSON.stringify(roomServer(loadEnv(mode, process.cwd(), "VITE_").VITE_ROOM_SERVER_URL ?? process.env.VITE_ROOM_SERVER_URL))
  },
  server: { host: "0.0.0.0" },
  build: { outDir: "dist", sourcemap: true }
}));
