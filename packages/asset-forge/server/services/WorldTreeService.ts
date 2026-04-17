/**
 * WorldTreeService — Generates tree positions using the EXACT game code.
 *
 * Runs the actual BiomeResourceGenerator.generateTrees() from @hyperforge/shared
 * with the real BiomeSystem and terrain height computation. No reimplementation,
 * no coordinate hacks — this IS the game's tree generation code.
 *
 * Results are cached because regenerating 10,000 tiles takes ~2-5 seconds.
 */

// Direct source imports — Bun resolves .ts natively in workspace packages
import { generateTrees } from "../../../shared/src/systems/shared/world/BiomeResourceGenerator";
import type { ResourceGenerationContext } from "../../../shared/src/systems/shared/world/BiomeResourceGenerator";
import type { BiomeTreeConfig } from "../../../shared/src/types/world/world-types";
import { getTreeConfigForBiome } from "../../../shared/src/systems/shared/world/TerrainBiomeTypes";
import {
  getGameWorldContext,
  createTileRng,
  GAME_SEED,
  GAME_TILE_SIZE,
  GAME_WORLD_SIZE,
  GAME_WATER_THRESHOLD,
} from "./GameWorldContext";

/**
 * Vegetation override config from the editor UI.
 * Keyed by biome type (e.g., "forest", "canyon", "tundra").
 * When provided, these override the hardcoded getTreeConfigForBiome() defaults.
 */
export type VegetationOverrides = Record<string, Partial<BiomeTreeConfig>>;

// ============== PUBLIC API ==============

export interface WorldTreeData {
  /** Tree species subtype (e.g. "fir", "oak", "maple") */
  s: string;
  /** World position X (centered coords) */
  x: number;
  /** World position Y (height) */
  y: number;
  /** World position Z (centered coords) */
  z: number;
  /** Scale multiplier (from scaleVariation) */
  sc: number;
  /** Y-axis rotation in radians */
  r: number;
}

export interface WorldTreeResponse {
  trees: WorldTreeData[];
  tileSize: number;
  worldSize: number;
  seed: number;
  generationTimeMs: number;
}

let cachedResult: WorldTreeResponse | null = null;
let cachedOverridesKey: string | null = null;

/**
 * Resolve the tree config for a biome, applying editor vegetation overrides
 * on top of the hardcoded defaults when available.
 */
function resolveTreeConfig(
  biomeId: string,
  overrides?: VegetationOverrides,
): BiomeTreeConfig {
  const base = getTreeConfigForBiome(biomeId);
  const override = overrides?.[biomeId];
  if (!override) return base;

  // Deep-merge per-species configs: override fields merge onto base fields
  // so changing weight doesn't lose maxHeight/waterAffinity from defaults
  const mergedTrees: Record<string, (typeof base.trees)[string]> = {
    ...base.trees,
  };
  if (override.trees) {
    for (const [speciesId, speciesOverride] of Object.entries(override.trees)) {
      const baseSpecies = base.trees[speciesId];
      mergedTrees[speciesId] = baseSpecies
        ? { ...baseSpecies, ...speciesOverride }
        : speciesOverride;
    }
  }

  return {
    ...base,
    ...override,
    trees: mergedTrees,
  };
}

export function generateWorldTrees(
  overrides?: VegetationOverrides,
  seed: number = GAME_SEED,
): WorldTreeResponse {
  // Cache key includes overrides AND seed so changing either regenerates
  const cacheKey = `${seed}:${overrides ? JSON.stringify(overrides) : ""}`;
  if (cachedResult && cachedOverridesKey === cacheKey) return cachedResult;

  console.log(
    `[WorldTreeService] Generating trees with seed=${seed} (GAME_SEED=${GAME_SEED})`,
  );
  const startTime = performance.now();
  const ctx = getGameWorldContext(seed);

  // Generate trees for all tiles using centered tile coordinates (game's system)
  const halfTiles = Math.floor(GAME_WORLD_SIZE / 2);
  const allTrees: WorldTreeData[] = [];

  for (let tileX = -halfTiles; tileX < halfTiles; tileX++) {
    for (let tileZ = -halfTiles; tileZ < halfTiles; tileZ++) {
      // Get tile biome at origin (matching game's getBiomeForTile)
      const tileBiome = ctx.getDominantBiome(
        tileX * GAME_TILE_SIZE,
        tileZ * GAME_TILE_SIZE,
      );
      const treeConfig = resolveTreeConfig(tileBiome, overrides);

      if (!treeConfig.enabled || treeConfig.density <= 0) continue;

      const resourceCtx: ResourceGenerationContext = {
        tileX,
        tileZ,
        tileKey: `${tileX}_${tileZ}`,
        tileSize: GAME_TILE_SIZE,
        waterThreshold: GAME_WATER_THRESHOLD,
        getHeightAt: ctx.getHeightAt,
        getDominantBiome: ctx.getDominantBiome,
        // Pass override-aware resolver so per-position biome resolution also uses overrides
        resolveTreeConfig: overrides
          ? (biomeId: string) => resolveTreeConfig(biomeId, overrides)
          : undefined,
        createRng: (salt) => createTileRng(seed, tileX, tileZ, salt),
      };

      const trees = generateTrees(resourceCtx, treeConfig);

      for (const node of trees) {
        const pos = node.position as { x: number; y: number; z: number };
        // World position = tileX * tileSize + localX (centered world coords)
        allTrees.push({
          s: node.subType ?? "oak",
          x: tileX * GAME_TILE_SIZE + pos.x,
          y: pos.y,
          z: tileZ * GAME_TILE_SIZE + pos.z,
          sc: node.scale ?? 1,
          r: node.rotation ?? 0,
        });
      }
    }
  }

  const elapsed = performance.now() - startTime;
  console.log(
    `[WorldTreeService] Generated ${allTrees.length} trees in ${elapsed.toFixed(0)}ms${overrides ? " (with overrides)" : ""}`,
  );

  cachedResult = {
    trees: allTrees,
    tileSize: GAME_TILE_SIZE,
    worldSize: GAME_WORLD_SIZE,
    seed,
    generationTimeMs: Math.round(elapsed),
  };
  cachedOverridesKey = cacheKey;

  return cachedResult;
}

export function clearWorldTreeCache(): void {
  cachedResult = null;
  cachedOverridesKey = null;
}
