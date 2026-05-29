import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Prevent Vite from obscuring Rust errors
  clearScreen: false,
  // Tauri expects a fixed port, fail if that port is not available
  server: {
    strictPort: true,
    port: 5173,
  },
  // Set env prefix so Tauri env variables are visible
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri supports modern JS features
    target: "es2021",
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: "dist",
  },
});
