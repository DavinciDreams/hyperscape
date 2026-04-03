/**
 * zoneNaming — Derive human-readable zone names from tier + biome + direction
 *
 * Names follow the pattern: "{Direction} {Biome} ({TierName})"
 * Example: "Northern Forest (Beginner)", "Western Mountains (Dangerous)"
 * Duplicate names get numeric suffixes.
 */

import type { DifficultyTierConfig } from "../types";
import type { TownInfo } from "../../WorldBuilder/DifficultyHeatmap";
import { zoneCentroid, type RawZone } from "./zoneFloodFill";

export function nameZones(
  zones: RawZone[],
  tiers: DifficultyTierConfig[],
  towns: TownInfo[],
): Map<number, string> {
  const names = new Map<number, string>();
  const usedNames = new Set<string>();

  for (const zone of zones) {
    const tier = tiers[zone.tierIndex];
    if (!tier) continue;
    const centroid = zoneCentroid(zone);

    // Find nearest town for direction reference
    let direction = "";
    if (towns.length > 0) {
      let nearestTown: TownInfo | null = null;
      let nearestDist = Infinity;
      for (const town of towns) {
        const d2 =
          (centroid.x - town.position.x) ** 2 +
          (centroid.z - town.position.z) ** 2;
        if (d2 < nearestDist) {
          nearestDist = d2;
          nearestTown = town;
        }
      }
      if (nearestTown) {
        const dx = centroid.x - nearestTown.position.x;
        const dz = centroid.z - nearestTown.position.z;
        const angle = Math.atan2(dz, dx) * (180 / Math.PI);
        if (angle >= -22.5 && angle < 22.5) direction = "Eastern";
        else if (angle >= 22.5 && angle < 67.5) direction = "Southeastern";
        else if (angle >= 67.5 && angle < 112.5) direction = "Southern";
        else if (angle >= 112.5 && angle < 157.5) direction = "Southwestern";
        else if (angle >= 157.5 || angle < -157.5) direction = "Western";
        else if (angle >= -157.5 && angle < -112.5) direction = "Northwestern";
        else if (angle >= -112.5 && angle < -67.5) direction = "Northern";
        else direction = "Northeastern";
      }
    }

    // Capitalize biome
    const biomeName = zone.biome.charAt(0).toUpperCase() + zone.biome.slice(1);
    let name = `${direction} ${biomeName} (${tier.name})`.trim();

    // Deduplicate
    if (usedNames.has(name)) {
      let suffix = 2;
      while (usedNames.has(`${name} ${suffix}`)) suffix++;
      name = `${name} ${suffix}`;
    }
    usedNames.add(name);
    names.set(zone.id, name);
  }

  return names;
}
