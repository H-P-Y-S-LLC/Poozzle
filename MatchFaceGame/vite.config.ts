import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    assetsDir: ".",
    sourcemap: false,
    rollupOptions: {
      input: {
        main: "index.html",
        gallery: "asset-gallery.html",
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
  },
});
