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
  Fir = "tree_fir",
  Pine = "tree_pine",
  Oak = "tree_oak",
  Birch = "tree_birch",
  Bamboo = "tree_bamboo",
  ChinaPine = "tree_chinaPine",
  Maple = "tree_maple",
  Coconut = "tree_coconut",
  Palm = "tree_palm",
  Dead = "tree_dead",
  Cactus = "tree_cactus",
  Knotwood = "tree_knotwood",
  WindPine = "tree_windPine",
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
   * At intermediate values, spawn probability scales with water proximity.
   */
  waterAffinity?: number;
  /** If waterAffinity > 0, the max height above water to consider "near water" */
  waterProximityHeight?: number;
  /** Reject placement if position is below this height above water threshold */
  avoidsWaterBelow?: number;
  /** Minimum terrain height for spawning (world units) */
  minHeight?: number;
  /** Maximum terrain height for spawning (world units) */
  maxHeight?: number;
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
  fir: { name: "Fir Tree", levelRequired: 1 },
  pine: { name: "Pine Tree", levelRequired: 1 },
  oak: { name: "Oak Tree", levelRequired: 15 },
  birch: { name: "Birch Tree", levelRequired: 1 },
  bamboo: { name: "Bamboo Tree", levelRequired: 1 },
  chinaPine: { name: "China Pine", levelRequired: 1 },
  maple: { name: "Maple Tree", levelRequired: 45 },
  coconut: { name: "Coconut Palm", levelRequired: 1 },
  palm: { name: "Desert Palm", levelRequired: 1 },
  dead: { name: "Dead Tree", levelRequired: 1 },
  cactus: { name: "Cactus", levelRequired: 1 },
  knotwood: { name: "Knotwood Tree", levelRequired: 1 },
  windPine: { name: "Wind Pine", levelRequired: 1 },
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
