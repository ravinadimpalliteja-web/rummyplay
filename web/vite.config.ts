import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/* The EKAH page (public/ekah/) is plain HTML and cannot read Vite settings, so the build writes ekah/config.js
   with the same VITE_ROOM_SERVER_URL and Supabase settings (both public) the React pages use. The dev server serves the same file. */
function ekahConfig(): Plugin {
  let source = "";
  return {
    name: "ekah-config",
    configResolved(config) {
      const url = String(config.env.VITE_ROOM_SERVER_URL ?? "").trim();
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

export default defineConfig({
  plugins: [react(), ekahConfig()],
  server: { host: "0.0.0.0" },
  build: { outDir: "dist", sourcemap: true }
});
