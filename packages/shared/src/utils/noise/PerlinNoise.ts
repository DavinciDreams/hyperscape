/**
 * PerlinNoise — re-export stub
 *
 * The implementation moved to @hyperforge/procgen/math/PerlinNoise to break
 * the shared↔procgen circular dependency. shared now re-exports so existing
 * importers (TerrainShader.ts, GrassWorker.ts, world/index.ts) keep working
 * unchanged.
 */

export {
  createPermutation,
  perlin2D,
  seamlessPerlin2D,
  seamlessFbm,
  buildPerlinNoiseJS,
} from "@hyperforge/procgen/math";
