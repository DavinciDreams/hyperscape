/**
 * World Trees Route — Serves exact game tree positions.
 *
 * GET  /api/world/trees — Returns procgen tree positions using default biome configs
 * POST /api/world/trees — Returns procgen tree positions with vegetation config overrides
 * POST /api/world/trees/invalidate — Clears the server-side tree cache
 * GET  /api/world/manifest-trees — Returns curated trees from world.json (the game's source of truth)
 */

import { Elysia } from "elysia";
import * as fs from "fs";
import * as path from "path";
import {
  generateWorldTrees,
  clearWorldTreeCache,
} from "../services/WorldTreeService";
import type { VegetationOverrides } from "../services/WorldTreeService";

/**
 * Read curated trees from world.json (manifests-staging).
 * This is the game's source of truth — the 2K trees that actually exist in-game,
 * exported from World Studio via the manifest compiler.
 */
function getManifestTrees(): {
  trees: Array<{
    s: string;
    x: number;
    y: number;
    z: number;
    sc: number;
    r: number;
  }>;
  found: boolean;
} {
  const worldJsonPath = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "server",
    "world",
    "assets",
    "manifests-staging",
    "world.json",
  );
  try {
    if (!fs.existsSync(worldJsonPath)) {
      return { trees: [], found: false };
    }
    const raw = fs.readFileSync(worldJsonPath, "utf-8");
    const worldJson = JSON.parse(raw) as {
      entities?: {
        trees?: Array<{
          s: string;
          x: number;
          y: number;
          z: number;
          sc: number;
          r: number;
        }>;
      };
    };
    const trees = worldJson.entities?.trees ?? [];
    return { trees, found: trees.length > 0 };
  } catch {
    return { trees: [], found: false };
  }
}

export const worldTreeRoutes = new Elysia({
  prefix: "/api/world",
  name: "world-trees",
})
  .get("/trees", () => {
    return generateWorldTrees();
  })
  .post("/trees", ({ body }) => {
    const b = body as { vegetation?: VegetationOverrides; seed?: number };
    return generateWorldTrees(b?.vegetation ?? undefined, b?.seed);
  })
  .post("/trees/invalidate", () => {
    clearWorldTreeCache();
    return { ok: true };
  })
  .get("/manifest-trees", () => {
    const result = getManifestTrees();
    return {
      trees: result.trees,
      source: result.found ? "world.json" : "none",
      count: result.trees.length,
    };
  });
