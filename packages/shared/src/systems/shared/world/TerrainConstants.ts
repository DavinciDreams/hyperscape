/**
 * TerrainConstants — re-export stub
 *
 * The implementation moved to @hyperforge/procgen/terrain/TerrainConstants to
 * break the shared↔procgen circular dependency. shared now re-exports so
 * existing importers (TerrainShader.ts, world/index.ts) keep working
 * unchanged.
 */

export {
  type RGB,
  TERRAIN_SHADER,
  TUNDRA,
  FOREST,
  CANYON,
  ACCENT,
} from "@hyperforge/procgen/terrain";
