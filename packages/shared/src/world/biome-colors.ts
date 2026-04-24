/**
 * biome-colors — re-export stub
 *
 * The implementation moved to @hyperforge/procgen/terrain/biome-colors to
 * break the shared↔procgen circular dependency. shared now re-exports so
 * existing importers (TerrainShader.ts, world/index.ts) keep working
 * unchanged.
 */

export {
  type MineBiomePalette,
  MINE_BIOME_PALETTES,
  ROAD_COLORS,
} from "@hyperforge/procgen/terrain";
