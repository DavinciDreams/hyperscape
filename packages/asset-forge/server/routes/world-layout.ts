/**
 * World Layout Route — Serves game-accurate town and road positions.
 *
 * GET /api/world/layout — Returns all towns, buildings, and roads generated
 * by the game's actual TownGenerator + BFS road pathfinding. Cached after first call.
 */

import { Elysia } from "elysia";
import {
  generateWorldLayout,
  clearWorldLayoutCache,
} from "../services/WorldLayoutService";

export const worldLayoutRoutes = new Elysia({
  prefix: "/api/world",
  name: "world-layout",
})
  .get("/layout", () => {
    return generateWorldLayout();
  })
  .post("/layout/invalidate", () => {
    clearWorldLayoutCache();
    return { ok: true };
  });
