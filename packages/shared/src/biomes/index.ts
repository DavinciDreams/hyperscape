import type { Biome as ManifestBiome } from "@hyperforge/manifest-schema";

import { BIOMES } from "../data/world-structure.js";
import { BiomesRegistry } from "./BiomesRegistry.js";

export {
  BiomesNotLoadedError,
  BiomesRegistry,
  UnknownBiomeError,
} from "./BiomesRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ biomes })` can live-dispatch
 * authored biome catalogs (difficulty + height + terrain tags)
 * to procgen/terrain classification on the next authority resolve.
 */
export const biomesRegistry = new BiomesRegistry();

/**
 * Resolve the effective biome catalog with the canonical
 * registry-prefer-fallback semantics shared across every consumer
 * that iterates ALL biomes (terrain palette init, vegetation
 * placement, terrain classification, etc.).
 *
 * Loaded registry wins (returns the manifest's authored biomes).
 * Unloaded registry falls back to the in-tree `BIOMES` constant.
 * The cast at the boundary mirrors `getEffectiveWorldAreas` —
 * schema validation is the right gate; consumers reading common
 * fields (`color`, `id`, etc.) won't notice the type difference.
 *
 * Use this instead of writing the conditional inline in every
 * consumer — keeps the deletion of the legacy constant a one-place
 * change when the substrate is ready.
 */
export function getEffectiveBiomes(): ManifestBiome[] {
  if (biomesRegistry.isLoaded()) {
    return biomesRegistry.all() as ManifestBiome[];
  }
  return Object.values(BIOMES) as unknown as ManifestBiome[];
}

/**
 * Non-throwing per-id biome lookup with the canonical registry-prefer-
 * fallback semantics. Returns the registry's biome when loaded and
 * present, the in-tree `BIOMES[id]` otherwise (which itself may be
 * undefined if the id isn't authored). Used by consumers that
 * already had a per-id fallback chain (`terrainWithBiome.getBiomeData?.(id)
 * ?? BIOMES[id]`) — slot this in front to honor PIE hot-reload of
 * the registry without changing fallback behavior.
 */
export function resolveBiomeOrFallback(id: string): ManifestBiome | undefined {
  if (biomesRegistry.isLoaded()) {
    return biomesRegistry.has(id)
      ? (biomesRegistry.get(id) as ManifestBiome)
      : undefined;
  }
  return BIOMES[id] as unknown as ManifestBiome | undefined;
}

/**
 * Is biome data available from any source (registry or legacy)?
 * Replaces the `Object.keys(BIOMES).length > 0` idiom that several
 * consumers use as a "skip until data ready" gate.
 */
export function isBiomesDataAvailable(): boolean {
  return biomesRegistry.isLoaded() || Object.keys(BIOMES).length > 0;
}
