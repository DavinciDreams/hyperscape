/**
 * spawnTableBuilder — Derive spawn rules from tier level ranges + manifest data
 *
 * Filters game manifests (mobs, ores, trees, fishing) by the tier's level
 * range, applies biome affinity weights, and produces spawn rule tables
 * that the entity populator uses for weighted random selection.
 */

import type {
  DifficultyTierConfig,
  RegionSpawnRules,
  ManifestData,
  ManifestNPC,
} from "../types";
import { getTreeConfigForBiome } from "@hyperscape/shared/world/TerrainBiomeTypes";

// ============== BIOME AFFINITY WEIGHTS ==============

/** Biome affinity weights for resource types — e.g. forests favor woodcutting */
export const BIOME_RESOURCE_WEIGHTS: Record<
  string,
  Partial<Record<string, number>>
> = {
  forest: { woodcutting: 2.0, mining: 0.5 },
  mountains: { mining: 2.0, woodcutting: 0.3 },
  plains: { farming: 1.5 },
  lakes: { fishing: 2.0 },
  swamp: { fishing: 1.5, woodcutting: 0.7 },
  desert: { mining: 1.3 },
  valley: { woodcutting: 1.2, farming: 1.3 },
  tundra: { mining: 1.0 },
};

// ============== SPAWN TABLE DERIVATION ==============

export function deriveSpawnRules(
  tier: DifficultyTierConfig,
  biome: string,
  manifests: ManifestData,
): RegionSpawnRules {
  const [minLevel, maxLevel] = tier.levelRange;
  const [minResLevel, maxResLevel] = tier.resourceLevelRange;
  const biomeWeights = BIOME_RESOURCE_WEIGHTS[biome] ?? {};

  // Filter mobs by level range overlap: mob [mobMin..mobMax] overlaps tier [minLevel..maxLevel]
  const mobTable: RegionSpawnRules["mobs"] =
    tier.mobDensityMultiplier > 0
      ? {
          mode: "replace" as const,
          table: manifests.npcs
            .filter(
              (npc: ManifestNPC) =>
                npc.category === "mob" &&
                npc.levelRange[0] <= maxLevel &&
                npc.levelRange[1] >= minLevel,
            )
            .map((npc: ManifestNPC) => ({
              mobId: npc.id,
              weight: 10,
            })),
          densityMultiplier: tier.mobDensityMultiplier,
        }
      : undefined;

  // Build resource table from all gathering types
  const resourceEntries: Array<{
    resourceId: string;
    weight: number;
    clusterSize?: number;
    affinity?: "water" | "mountain" | "road" | "any";
  }> = [];

  // Mining rocks
  for (const rock of manifests.miningRocks) {
    if (
      rock.levelRequired >= minResLevel &&
      rock.levelRequired <= maxResLevel
    ) {
      const biomeBonus = biomeWeights["mining"] ?? 1.0;
      resourceEntries.push({
        resourceId: rock.id,
        weight: 10 * biomeBonus,
        clusterSize: rock.levelRequired >= 55 ? 1 : 2,
      });
    }
  }

  // Trees — only include species that belong in this biome's tree config.
  // e.g. maple/knotwood only in forest zones, cactus/palm only in canyon.
  const biomeTreeConfig = getTreeConfigForBiome(biome);
  const allowedTreeIds = new Set(Object.keys(biomeTreeConfig.trees));

  for (const tree of manifests.trees) {
    if (
      tree.levelRequired >= minResLevel &&
      tree.levelRequired <= maxResLevel &&
      allowedTreeIds.has(tree.id)
    ) {
      const biomeBonus = biomeWeights["woodcutting"] ?? 1.0;
      resourceEntries.push({
        resourceId: tree.id,
        weight: 10 * biomeBonus,
        clusterSize: tree.levelRequired >= 60 ? 1 : 3,
      });
    }
  }

  // Fishing spots — affinity: "water" ensures placement near shoreline
  for (const spot of manifests.fishingSpots) {
    if (
      spot.levelRequired >= minResLevel &&
      spot.levelRequired <= maxResLevel
    ) {
      const biomeBonus = biomeWeights["fishing"] ?? 1.0;
      resourceEntries.push({
        resourceId: spot.id,
        weight: 10 * biomeBonus,
        affinity: "water",
      });
    }
  }

  const resourceTable: RegionSpawnRules["resources"] =
    resourceEntries.length > 0
      ? {
          mode: "replace" as const,
          table: resourceEntries,
          densityMultiplier: tier.resourceDensityMultiplier,
        }
      : undefined;

  return {
    mobs: mobTable,
    resources: resourceTable,
  };
}
