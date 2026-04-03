/**
 * World Trees Route — Serves exact game tree positions.
 *
 * GET  /api/world/trees — Returns tree positions using default biome configs
 * POST /api/world/trees — Returns tree positions with vegetation config overrides
 * POST /api/world/trees/invalidate — Clears the server-side tree cache
 */

import { Elysia } from "elysia";
import {
  generateWorldTrees,
  clearWorldTreeCache,
} from "../services/WorldTreeService";
import type { VegetationOverrides } from "../services/WorldTreeService";

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
  });
