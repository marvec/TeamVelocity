import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Static SPA — no SSR, no server. Files in public/ (incl. public/data/) are
// served at the site root, so the committed sample fixtures live at
// /data/sample/*. `base: "./"` keeps a built dist/ openable from any subpath.
// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
