/**
 * storeAssignment — Pure logic for building-to-store-to-NPC mapping
 *
 * Maps building types to store types and assigns NPCs to buildings
 * based on manifest data. Town size determines which stores appear.
 *
 * No ECS dependencies — operates on plain data.
 */

// ============== TYPES ==============

/** Minimal building info for store assignment */
export interface StoreBuilding {
  id: string;
  type: string;
}

/** NPC manifest entry (subset needed for store assignment) */
export interface StoreNPCEntry {
  id: string;
  name: string;
  buildingRole?: string;
  storeId?: string;
  services?: {
    enabled: boolean;
    types: string[];
  };
}

/** Result of store assignment for one building */
export interface StoreAssignment {
  buildingId: string;
  buildingType: string;
  npcId: string;
  npcName: string;
  storeId: string;
}

/** Town size category */
export type TownSizeCategory = "hamlet" | "village" | "town" | "city";

// ============== BUILDING → STORE MAPPING ==============

/**
 * Default mapping from building type to store type.
 * Used when NPC manifests don't have explicit buildingRole fields.
 */
export const BUILDING_STORE_MAP: Record<string, string> = {
  store: "general_store",
  smithy: "sword_store",
  "magic-shop": "magic_store",
  "range-shop": "range_store",
  "fishing-shop": "fishing_store",
  "armor-shop": "armor_store",
  "crafting-shop": "crafting_store",
};

/**
 * Default mapping from store type to fallback NPC ID.
 * Used when no NPC with matching buildingRole is found in manifests.
 */
const STORE_DEFAULT_NPC: Record<string, string> = {
  general_store: "shopkeeper",
  sword_store: "torvin",
  magic_store: "wizard_zamorin",
  range_store: "bowyer",
  fishing_store: "fisherman_pete",
  armor_store: "armorer",
  crafting_store: "crafting_supplier",
};

// ============== TOWN SIZE → STORE AVAILABILITY ==============

/**
 * Which store types are available at each town size.
 * Smaller towns get fewer stores; cities get all.
 */
export const TOWN_SIZE_STORES: Record<TownSizeCategory, string[]> = {
  hamlet: ["general_store"],
  village: ["general_store", "sword_store"],
  town: [
    "general_store",
    "sword_store",
    "armor_store",
    "magic_store",
    "fishing_store",
  ],
  city: [
    "general_store",
    "sword_store",
    "armor_store",
    "magic_store",
    "range_store",
    "fishing_store",
    "crafting_store",
  ],
};

// ============== ASSIGNMENT LOGIC ==============

/**
 * Build a lookup from buildingRole → NPC entry using manifest data.
 * Falls back to the hardcoded STORE_DEFAULT_NPC if no manifest match.
 */
function buildRoleLookup(npcs: StoreNPCEntry[]): Map<string, StoreNPCEntry> {
  const lookup = new Map<string, StoreNPCEntry>();

  // First pass: NPCs with explicit buildingRole
  for (const npc of npcs) {
    if (npc.buildingRole && !lookup.has(npc.buildingRole)) {
      lookup.set(npc.buildingRole, npc);
    }
  }

  return lookup;
}

/**
 * Assign stores to buildings in a town based on building types, town size,
 * and NPC manifest data.
 *
 * @param buildings - Buildings in the town
 * @param townSize - Town size category (determines store availability)
 * @param npcs - NPC manifest entries (used to look up buildingRole and storeId)
 * @returns Array of store assignments
 */
export function assignStores(
  buildings: StoreBuilding[],
  townSize: TownSizeCategory,
  npcs: StoreNPCEntry[],
): StoreAssignment[] {
  const allowedStores = new Set(
    TOWN_SIZE_STORES[townSize] ?? TOWN_SIZE_STORES.hamlet,
  );
  const roleLookup = buildRoleLookup(npcs);
  const npcById = new Map(npcs.map((n) => [n.id, n]));
  const assignments: StoreAssignment[] = [];

  for (const building of buildings) {
    // 1. Get the store type for this building
    const storeType = BUILDING_STORE_MAP[building.type];
    if (!storeType) continue; // Not a shop building

    // 2. Check if this store type is allowed for the town size
    if (!allowedStores.has(storeType)) continue;

    // 3. Find the NPC for this building
    let npcId: string | undefined;
    let npcName: string = "Shopkeeper";
    let assignedStoreId = storeType;

    // Try manifest-based lookup (buildingRole)
    const roleNpc = roleLookup.get(building.type);
    if (roleNpc) {
      npcId = roleNpc.id;
      npcName = roleNpc.name;
      if (roleNpc.storeId) assignedStoreId = roleNpc.storeId;
    }

    // Fallback to hardcoded mapping
    if (!npcId) {
      const fallbackId = STORE_DEFAULT_NPC[storeType];
      if (fallbackId) {
        const fallbackNpc = npcById.get(fallbackId);
        npcId = fallbackId;
        npcName = fallbackNpc?.name ?? fallbackId;
      }
    }

    if (!npcId) continue;

    assignments.push({
      buildingId: building.id,
      buildingType: building.type,
      npcId,
      npcName,
      storeId: assignedStoreId,
    });
  }

  return assignments;
}

/**
 * Given a town's buildings and NPC manifests, determine which buildings
 * should have shopkeeper NPCs and what stores they manage.
 * Returns a Map from buildingId → { npcId, storeId }.
 */
export function buildStoreMap(
  buildings: StoreBuilding[],
  townSize: TownSizeCategory,
  npcs: StoreNPCEntry[],
): Map<string, { npcId: string; npcName: string; storeId: string }> {
  const assignments = assignStores(buildings, townSize, npcs);
  const map = new Map<
    string,
    { npcId: string; npcName: string; storeId: string }
  >();
  for (const a of assignments) {
    map.set(a.buildingId, {
      npcId: a.npcId,
      npcName: a.npcName,
      storeId: a.storeId,
    });
  }
  return map;
}
