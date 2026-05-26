import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// On `vite build` we target a GitHub Pages project site served under
// https://<user>.github.io/poe2-skilltree/. Dev keeps base "/".
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/poe2-skilltree/" : "/",
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
}));
