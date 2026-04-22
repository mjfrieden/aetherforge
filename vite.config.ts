import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/client",
  publicDir: "static",
  build: {
    outDir: "../../public",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "src/client/index.html"),
        login: resolve(__dirname, "src/client/login.html"),
        register: resolve(__dirname, "src/client/register.html"),
        game: resolve(__dirname, "src/client/game.html"),
      },
    },
  },
});
