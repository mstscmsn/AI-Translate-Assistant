import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { build as buildWithEsbuild } from "esbuild";
import type { Plugin } from "vite";

const resolvePath = (path: string) =>
  decodeURIComponent(new URL(path, import.meta.url).pathname);

export default defineConfig({
  plugins: [react(), classicContentScriptPlugin()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolvePath("popup.html"),
        options: resolvePath("options.html"),
        background: resolvePath("src/background/index.ts")
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") return "background.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});

function classicContentScriptPlugin(): Plugin {
  return {
    name: "classic-content-script-bundle",
    apply: "build",
    async generateBundle() {
      const result = await buildWithEsbuild({
        entryPoints: [resolvePath("src/content/index.ts")],
        outfile: "content.js",
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "chrome109",
        minify: true,
        legalComments: "none",
        write: false
      });

      const code = result.outputFiles[0]?.text ?? "";
      if (/^\s*(?:import|export)\s/m.test(code)) {
        throw new Error("content.js must be a classic script without ESM imports/exports.");
      }

      this.emitFile({
        type: "asset",
        fileName: "content.js",
        source: code
      });
    }
  };
}
