/**
 * Tree Types — Single Source of Truth
 *
 * All tree type definitions live here. Every other file that needs tree type
 * information imports from this module instead of defining its own copy.
 *
 * To add a new tree type: add an entry to TREE_TYPES below.
 * To rename a tree type: change the key and update the manifest ID accordingly.
 * To remove a tree type: delete the entry.
 *
 * The manifest (woodcutting.json) must have a matching "id": "tree_<key>" entry
 * for each tree type listed here. The manifest holds runtime data (drops, XP,
 * model paths) while this file holds the structural/gameplay config.
 */

export interface TreeTypeDefinition {
  /** Display name shown in UI (e.g., "Oak Tree") */
  name: string;
  /** Woodcutting level required to chop */
  levelRequired: number;
  /** Spawn weight in default biome (0 = doesn't spawn by default) */
  spawnWeight: number;
}

/**
 * Master tree type registry.
 *
 * Keys are subtypes (e.g., "oak"). The manifest ID is "tree_<key>".
 * Add, rename, or remove entries here — everything else derives from this.
 */
export const TREE_TYPES = {
  fir: {
    name: "Fir Tree",
    levelRequired: 1,
    spawnWeight: 10,
  },
  pine: {
    name: "Pine Tree",
    levelRequired: 1,
    spawnWeight: 10,
  },
  oak: {
    name: "Oak Tree",
    levelRequired: 15,
    spawnWeight: 10,
  },
  birch: {
    name: "Birch Tree",
    levelRequired: 1,
    spawnWeight: 10,
  },
  bamboo: {
    name: "Bamboo Tree",
    levelRequired: 1,
    spawnWeight: 10,
  },
  chinaPine: {
    name: "China Pine",
    levelRequired: 1,
    spawnWeight: 10,
  },
  maple: {
    name: "Maple Tree",
    levelRequired: 45,
    spawnWeight: 10,
  },
  coconut: {
    name: "Coconut Palm",
    levelRequired: 1,
    spawnWeight: 10,
  },
  palm: {
    name: "Desert Palm",
    levelRequired: 1,
    spawnWeight: 10,
  },
  dead: {
    name: "Dead Tree",
    levelRequired: 1,
    spawnWeight: 10,
  },
  cactus: {
    name: "Cactus",
    levelRequired: 1,
    spawnWeight: 10,
  },
  knotwood: {
    name: "Knotwood Tree",
    levelRequired: 1,
    spawnWeight: 80,
  },
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

/**
 * Build the spawn distribution map for BiomeTreeConfig.
 * Only includes types with spawnWeight > 0.
 * Keys are "tree_<subType>" to match manifest IDs.
 */
export function getDefaultTreeDistribution(): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const [key, def] of Object.entries(TREE_TYPES)) {
    if (def.spawnWeight > 0) {
      distribution[`tree_${key}`] = def.spawnWeight;
    }
  }
  return distribution;
}
