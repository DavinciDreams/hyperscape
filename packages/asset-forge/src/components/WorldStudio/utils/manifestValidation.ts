/**
 * manifestValidation — Cross-manifest reference validation for generated entities
 *
 * Validates that all entity references in auto-gen / procgen output exist
 * in the loaded manifests. Catches broken references before they hit runtime.
 */

import type {
  PlacedMobSpawn,
  PlacedResource,
  PlacedStation,
  ManifestData,
} from "../types";

export interface ManifestValidationError {
  level: "error" | "warning";
  entity: string;
  message: string;
}

/**
 * Validate that all mob, resource, and station references in generated entities
 * have corresponding entries in the loaded manifests.
 */
export function validateManifestReferences(
  mobs: PlacedMobSpawn[],
  resources: PlacedResource[],
  stations: PlacedStation[],
  manifests: ManifestData,
): ManifestValidationError[] {
  const errors: ManifestValidationError[] = [];

  // Build lookup sets from manifests
  const validMobIds = new Set(manifests.npcs.map((n) => n.id));
  const validMiningIds = new Set(manifests.miningRocks.map((r) => r.id));
  const validTreeIds = new Set(manifests.trees.map((t) => t.id));
  const validFishingIds = new Set(manifests.fishingSpots.map((f) => f.id));
  const validStationTypes = new Set(manifests.stations.map((s) => s.type));

  // Validate mob references
  const checkedMobIds = new Set<string>();
  for (const mob of mobs) {
    if (checkedMobIds.has(mob.mobId)) continue;
    checkedMobIds.add(mob.mobId);
    if (!validMobIds.has(mob.mobId)) {
      errors.push({
        level: "error",
        entity: mob.mobId,
        message: `Mob "${mob.mobId}" not found in npcs.json manifest`,
      });
    }
  }

  // Validate resource references
  const checkedResourceIds = new Set<string>();
  for (const res of resources) {
    if (checkedResourceIds.has(res.resourceId)) continue;
    checkedResourceIds.add(res.resourceId);

    const isValid =
      validMiningIds.has(res.resourceId) ||
      validTreeIds.has(res.resourceId) ||
      validFishingIds.has(res.resourceId);

    if (!isValid) {
      errors.push({
        level: "error",
        entity: res.resourceId,
        message: `Resource "${res.resourceId}" not found in mining, woodcutting, or fishing manifests`,
      });
    }
  }

  // Validate station references
  const checkedStationTypes = new Set<string>();
  for (const sta of stations) {
    if (checkedStationTypes.has(sta.stationType)) continue;
    checkedStationTypes.add(sta.stationType);
    if (!validStationTypes.has(sta.stationType)) {
      errors.push({
        level: "warning",
        entity: sta.stationType,
        message: `Station type "${sta.stationType}" not found in stations.json manifest`,
      });
    }
  }

  return errors;
}
