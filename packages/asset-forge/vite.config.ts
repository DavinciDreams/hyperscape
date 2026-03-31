import fs from "fs";
import path from "path";
import { createRequire } from "module";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";

/**
 * Vite plugin to serve game manifest files directly from the server package.
 * This lets the EditorWorld's DataManager load biomes.json etc. without
 * requiring the game server (port 5555) to be running.
 */
function serveGameAssets(): Plugin {
  const manifestsDir = path.resolve(
    __dirname,
    "../server/world/assets/manifests",
  );
  const gameAssetsDir = path.resolve(__dirname, "../server/world/assets");

  return {
    name: "serve-game-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/game-assets/")) return next();

        // Strip /game-assets/ prefix
        const assetPath = req.url.replace(/^\/game-assets\//, "");

        // Try manifests dir first (higher priority), then general assets dir
        const manifestFile = path.join(
          manifestsDir,
          assetPath.replace(/^manifests\//, ""),
        );
        const generalFile = path.join(gameAssetsDir, assetPath);

        const filePath = assetPath.startsWith("manifests/")
          ? manifestFile
          : generalFile;

        // Prevent path traversal
        const resolvedPath = path.resolve(filePath);
        if (
          !resolvedPath.startsWith(manifestsDir) &&
          !resolvedPath.startsWith(gameAssetsDir)
        ) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }

        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
          const ext = path.extname(resolvedPath);
          const contentType =
            ext === ".json"
              ? "application/json"
              : ext === ".png"
                ? "image/png"
                : "application/octet-stream";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Access-Control-Allow-Origin", "*");
          fs.createReadStream(resolvedPath).pipe(res);
        } else {
          res.statusCode = 404;
          res.end("Not found");
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const require = createRequire(import.meta.url);
  const env = loadEnv(mode, process.cwd(), "");
  const uiPort = Number(env.ASSET_FORGE_PORT) || 3400;
  const apiPort = Number(env.ASSET_FORGE_API_PORT) || 3401;
  const threeRoot = path.dirname(path.dirname(require.resolve("three")));

  return {
    plugins: [react(), serveGameAssets()],
    // Define process.env for pre-built packages that use it (e.g., MovementUtils.ts)
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode),
      "process.env.GAME_MODE": JSON.stringify(env.GAME_MODE || ""),
    },
    build: {
      target: "esnext", // Support top-level await
      chunkSizeWarningLimit: 9000, // Asset tooling intentionally ships large WebGPU/PhysX chunks
    },
    resolve: {
      dedupe: ["react", "react-dom", "react/jsx-runtime", "three"],
      alias: {
        "@": path.resolve(__dirname, "src"),
        react: path.resolve(__dirname, "../../node_modules/react"),
        "react-dom": path.resolve(__dirname, "../../node_modules/react-dom"),
        "react/jsx-runtime": path.resolve(
          __dirname,
          "../../node_modules/react/jsx-runtime",
        ),
        // Three.js WebGPU module
        "three/webgpu": path.resolve(threeRoot, "build/three.webgpu.js"),
        "three/tsl": path.resolve(threeRoot, "build/three.tsl.js"),
        // Three.js addons (examples/jsm)
        "three/addons": path.resolve(threeRoot, "examples/jsm"),
        // Ensure single Three.js instance across all packages
        three: threeRoot,
        // Direct source imports for game-world tree generation (exact same code path)
        // These must come BEFORE the general @hyperscape/shared alias
        "@hyperscape/shared/world/BiomeResourceGenerator": path.resolve(
          __dirname,
          "../shared/src/systems/shared/world/BiomeResourceGenerator.ts",
        ),
        "@hyperscape/shared/world/TerrainBiomeTypes": path.resolve(
          __dirname,
          "../shared/src/systems/shared/world/TerrainBiomeTypes.ts",
        ),
        "@hyperscape/shared/constants/TreeTypes": path.resolve(
          __dirname,
          "../shared/src/constants/TreeTypes.ts",
        ),
        // Use client-only build of shared to exclude server-side modules (fs-extra, etc.)
        "@hyperscape/shared": path.resolve(
          __dirname,
          "../shared/build/framework.client.js",
        ),
        // Workspace package aliases
        "@hyperscape/decimation": path.resolve(
          __dirname,
          "../decimation/dist/index.js",
        ),
        "@hyperscape/impostor": path.resolve(
          __dirname,
          "../impostors/dist/index.js",
        ),
        // Procgen package aliases for terrain, vegetation, etc.
        // NOTE: More specific paths must come BEFORE less specific paths
        "@hyperscape/procgen/terrain": path.resolve(
          __dirname,
          "../procgen/dist/terrain/index.js",
        ),
        "@hyperscape/procgen/vegetation": path.resolve(
          __dirname,
          "../procgen/dist/vegetation/index.js",
        ),
        "@hyperscape/procgen/grass": path.resolve(
          __dirname,
          "../procgen/dist/grass/index.js",
        ),
        "@hyperscape/procgen/building/viewer": path.resolve(
          __dirname,
          "../procgen/src/building/viewer/index.ts",
        ),
        "@hyperscape/procgen/building/town": path.resolve(
          __dirname,
          "../procgen/dist/building/town/index.js",
        ),
        "@hyperscape/procgen/building": path.resolve(
          __dirname,
          "../procgen/dist/building/index.js",
        ),
        "@hyperscape/procgen/rock": path.resolve(
          __dirname,
          "../procgen/dist/rock/index.js",
        ),
        "@hyperscape/procgen/plant": path.resolve(
          __dirname,
          "../procgen/dist/plant/index.js",
        ),
        "@hyperscape/procgen/items/dock": path.resolve(
          __dirname,
          "../procgen/dist/items/dock/index.js",
        ),
        "@hyperscape/procgen/items": path.resolve(
          __dirname,
          "../procgen/dist/items/index.js",
        ),
        "@hyperscape/procgen": path.resolve(
          __dirname,
          "../procgen/dist/index.js",
        ),
      },
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "three",
        "@react-three/fiber",
        "@react-three/drei",
      ],
      // Exclude Node.js-only modules that shouldn't be bundled for browser
      exclude: ["fs-extra", "graceful-fs", "better-sqlite3", "knex"],
      esbuildOptions: {
        target: "esnext", // Support top-level await in dependencies like yoga-layout
        resolveExtensions: [".mjs", ".js", ".jsx", ".json", ".ts", ".tsx"],
      },
    },
    server: {
      port: uiPort,
      // Allow Vite to serve files from workspace packages (procgen, shared, etc.)
      fs: {
        allow: [
          // Allow the monorepo root and all packages
          path.resolve(__dirname, "../.."),
        ],
      },
      proxy: {
        "/api": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
        "/assets": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
        "/game-models": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
