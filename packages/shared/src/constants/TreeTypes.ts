/**
 * Tree Types — Single Source of Truth
 *
 * All tree type definitions live here. Every other file that needs tree type
 * information imports from this module instead of defining its own copy.
 *
 * To add a new tree type: add an entry to TREE_TYPES and TreeId below.
 * To rename a tree type: change the key/enum and update the manifest ID.
 * To remove a tree type: delete the entry from both.
 *
 * The manifest (woodcutting.json) must have a matching "id" entry that equals
 * the TreeId enum value for each tree type listed here.
 *
 * Per-biome tree configs (distribution, placement, density) live in
 * TerrainBiomeTypes.ts alongside the BiomeType enum.
 */

/**
 * Enum of all tree IDs — values match the manifest resource IDs.
 * Use this instead of hardcoded "tree_xxx" strings everywhere.
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
  Willow = "tree_willow",
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
 * Master tree type registry.
 *
 * Keys are subtypes (e.g., "oak"). Placement rules live in per-biome configs
 * in TerrainBiomeTypes.ts.
 */
export const TREE_TYPES = {
  pine: { name: "Pine Tree", levelRequired: 1 },
  oak: { name: "Oak Tree", levelRequired: 15 },
  maple: { name: "Maple Tree", levelRequired: 45 },
  palm: { name: "Desert Palm", levelRequired: 1 },
  banana: { name: "Banana Tree", levelRequired: 1 },
  dead: { name: "Dead Tree", levelRequired: 1 },
  pineDead: { name: "Dead Pine", levelRequired: 1 },
  bamboo: { name: "Bamboo", levelRequired: 1 },
  eucalyptus: { name: "Eucalyptus Tree", levelRequired: 30 },
  general: { name: "Tree", levelRequired: 1 },
  magic: { name: "Magic Tree", levelRequired: 60 },
  mahogany: { name: "Mahogany Tree", levelRequired: 50 },
  willow: { name: "Willow Tree", levelRequired: 30 },
} as const satisfies Record<string, TreeTypeDefinition>;

/** All valid tree subtype keys (e.g., "oak", "willow") */
export type TreeSubType = keyof typeof TREE_TYPES;

/** All valid tree subtype keys as a runtime array */
export const TREE_SUBTYPE_KEYS = Object.keys(TREE_TYPES) as TreeSubType[];

/**
 * Get the level requirement for a tree subtype.
 * Returns 1 for unknown types.
 */
export function getTreeLevelRequired(subType: string): number {
  return (
    (TREE_TYPES as Record<string, TreeTypeDefinition>)[subType]
      ?.levelRequired ?? 1
  );
}
