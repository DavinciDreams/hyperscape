/**
 * Tree Types — MANIFEST FAÇADE
 *
 * As of Phase A2 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, the tree catalog
 * lives in `trees.json`, validated at module load time against
 * `TreeManifestSchema` from `@hyperforge/manifest-schema`.
 *
 * The JSON authoritative copy is served from
 * `packages/server/world/assets/manifests/trees.json` (editor-editable,
 * loaded at runtime). This TS file preserves the exact legacy export shape
 * (TreeId, TREE_TYPES, TreeSubType, TREE_SUBTYPE_KEYS, getTreeLevelRequired,
 * treeIdToSubType) so every consumer keeps working.
 *
 * To add/remove/rename a tree, edit the JSON — not this file.
 *
 * Per-biome tree configs (distribution, placement, density) live in
 * TerrainBiomeTypes.ts alongside the BiomeType enum.
 */

import { TreeManifestSchema } from "@hyperforge/manifest-schema";

import treeManifestJson from "./trees.json" with { type: "json" };

const manifest = TreeManifestSchema.parse(treeManifestJson);

/**
 * Enum of all tree IDs — values match the manifest resource IDs.
 * Use this instead of hardcoded "tree_xxx" strings everywhere.
 *
 * NOTE: This enum is hardcoded for type-level ergonomics (TreeId.Oak in
 * consumer code). We assert at module-load time that every enum entry exists
 * in the validated JSON with matching `id`.
 */
export enum TreeId {
  Pine = "tree_pine",
  Oak = "tree_oak",
  Maple = "tree_maple",
  Palm = "tree_palm",
  Banana = "tree_banana",
  Dead = "tree_dead",
  PineDead = "tree_pineDead",
  Bamboo = "tree_bamboo",
  Eucalyptus = "tree_eucalyptus",
  General = "tree_general",
  Magic = "tree_magic",
  Mahogany = "tree_mahogany",
}

/** Extract the subtype key from a TreeId (e.g. TreeId.Oak → "oak") */
export function treeIdToSubType(id: string): string {
  return id.replace("tree_", "");
}

/** Landscape placement rules for a tree type within a biome. */
export interface TreePlacementRules {
  /**
   * How strongly this tree prefers water-adjacent placement (0–1).
   * 0 = no preference, 1 = only spawns near water.
   * When > 0, a radial distance-to-water search is performed and trees
   * beyond waterMaxDistance are rejected with probability waterAffinity.
   */
  waterAffinity?: number;
  /** Horizontal search radius (meters) when looking for nearby water. Default 40. */
  waterSearchRadius?: number;
  /** Max horizontal distance from shore (meters) before rejection kicks in. Default 30. */
  waterMaxDistance?: number;
  /** @deprecated Use waterMaxDistance instead. Kept for backward compat. */
  waterProximityHeight?: number;
  /** Reject placement if position is below this height above water threshold */
  avoidsWaterBelow?: number;
  /** Minimum terrain height for spawning (world units) */
  minHeight?: number;
  /** Maximum terrain height for spawning (world units) */
  maxHeight?: number;
}

/** Spawn weight + placement rules combined — used in per-biome tree configs. */
export interface TreeSpawnConfig extends TreePlacementRules {
  /** Relative spawn weight (higher = more likely). */
  weight: number;
}

export interface TreeTypeDefinition {
  /** Display name shown in UI (e.g., "Oak Tree") */
  name: string;
  /** Woodcutting level required to chop */
  levelRequired: number;
}

/**
 * Master tree type registry, derived from trees.json.
 *
 * Keys are subtypes (e.g., "oak"). Placement rules live in per-biome configs
 * in TerrainBiomeTypes.ts.
 */
function buildTreeTypes(): Record<string, TreeTypeDefinition> {
  const out: Record<string, TreeTypeDefinition> = {};
  for (const [subtype, entry] of Object.entries(manifest.trees)) {
    out[subtype] = { name: entry.name, levelRequired: entry.levelRequired };
  }
  // Runtime assertion: every TreeId value must appear in the manifest
  for (const treeId of Object.values(TreeId)) {
    const subtype = treeIdToSubType(treeId);
    if (!out[subtype]) {
      throw new Error(
        `TreeTypes façade: TreeId.${treeId} has no matching entry in trees.json (expected key "${subtype}")`,
      );
    }
    const expectedId = manifest.trees[subtype]?.id;
    if (expectedId !== treeId) {
      throw new Error(
        `TreeTypes façade: trees.json["${subtype}"].id is "${expectedId}" but TreeId value is "${treeId}"`,
      );
    }
  }
  return Object.freeze(out);
}

export const TREE_TYPES: Readonly<Record<string, TreeTypeDefinition>> =
  buildTreeTypes();

/**
 * All valid tree subtype keys (e.g., "oak", "maple").
 *
 * Derived from the JSON import's literal type (pre-parse), so we keep the
 * narrow discriminated union at the type level while the runtime value still
 * comes from the validated manifest.
 */
export type TreeSubType = keyof typeof treeManifestJson.trees;

/** All valid tree subtype keys as a runtime array */
export const TREE_SUBTYPE_KEYS: readonly TreeSubType[] = Object.freeze(
  Object.keys(TREE_TYPES) as TreeSubType[],
);

/**
 * Get the level requirement for a tree subtype.
 * Returns 1 for unknown types.
 */
export function getTreeLevelRequired(subType: string): number {
  return TREE_TYPES[subType]?.levelRequired ?? 1;
}
