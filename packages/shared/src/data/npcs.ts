/**
 * NPC Database
 *
 * ALL NPC data is loaded from JSON manifests at runtime by DataManager.
 * This keeps NPC definitions data-driven and separate from code.
 *
 * Available 3D model types (in /assets/world/forge/):
 * - goblin/goblin_rigged.glb     → Used for goblins
 * - thug/thug_rigged.glb         → Used for bandits
 * - human/human_rigged.glb       → Used for guards, knights, warriors, rangers, shopkeepers
 * - troll/troll_rigged.glb       → Used for hobgoblins
 * - imp/imp_rigged.glb           → Used for dark warriors
 *
 * To add new NPCs:
 * 1. Add entry to world/assets/manifests/npcs.json
 * 2. Use one of the existing modelPath types above
 * 3. OR generate new model in 3D Asset Forge
 * 4. Restart server to reload manifests
 *
 * DO NOT add NPC data here - keep it in JSON!
 */

import {
  NpcsManifestSchema,
  type NpcsManifest,
} from "@hyperforge/manifest-schema";

import type { NPCData, NPCCategory } from "../types/core/core";
import {
  calculateCombatLevel,
  normalizeCombatSkills,
} from "../utils/game/CombatLevelCalculator";

import npcsSpawnConstantsJson from "./npcs-spawn-constants.json" with { type: "json" };

const npcsManifest = NpcsManifestSchema.parse(npcsSpawnConstantsJson);

/**
 * NPC Database - Populated at runtime from JSON manifests
 * DataManager.loadNPCs() reads world/assets/manifests/npcs.json
 */
export const ALL_NPCS: Map<string, NPCData> = new Map();

/**
 * Helper Functions
 */

// Get NPC by ID
export function getNPCById(npcId: string): NPCData | null {
  return ALL_NPCS.get(npcId) || null;
}

// Get NPCs by category
export function getNPCsByCategory(category: NPCCategory): NPCData[] {
  return Array.from(ALL_NPCS.values()).filter(
    (npc) => npc.category === category,
  );
}

// Get NPCs by biome
export function getNPCsByBiome(biome: string): NPCData[] {
  return Array.from(ALL_NPCS.values()).filter((npc) =>
    npc.spawnBiomes?.includes(biome),
  );
}

// Get NPCs by level range
export function getNPCsByLevelRange(
  minLevel: number,
  maxLevel: number,
): NPCData[] {
  return Array.from(ALL_NPCS.values()).filter(
    (npc) => npc.stats.level >= minLevel && npc.stats.level <= maxLevel,
  );
}

// Get combat NPCs (mob, boss, quest with combat)
export function getCombatNPCs(): NPCData[] {
  return Array.from(ALL_NPCS.values()).filter(
    (npc) =>
      npc.category === "mob" ||
      npc.category === "boss" ||
      npc.category === "quest",
  );
}

// Get service NPCs (neutral)
export function getServiceNPCs(): NPCData[] {
  return Array.from(ALL_NPCS.values()).filter(
    (npc) => npc.category === "neutral",
  );
}

// Check if NPC can drop specific item
export function canNPCDropItem(npcId: string, itemId: string): boolean {
  const npc = getNPCById(npcId);
  if (!npc) return false;

  // Check default drop
  if (
    npc.drops.defaultDrop.enabled &&
    npc.drops.defaultDrop.itemId === itemId
  ) {
    return true;
  }

  // Check all drop tiers
  const allDrops = [
    ...npc.drops.always,
    ...npc.drops.common,
    ...npc.drops.uncommon,
    ...npc.drops.rare,
    ...npc.drops.veryRare,
  ];

  return allDrops.some((drop) => drop.itemId === itemId);
}

// Calculate NPC drops with RNG
export function calculateNPCDrops(
  npcId: string,
): Array<{ itemId: string; quantity: number }> {
  const npc = getNPCById(npcId);
  if (!npc) return [];

  const drops: Array<{ itemId: string; quantity: number }> = [];

  // Add default drop if enabled
  if (npc.drops.defaultDrop.enabled) {
    drops.push({
      itemId: npc.drops.defaultDrop.itemId,
      quantity: npc.drops.defaultDrop.quantity,
    });
  }

  // Process all drop tiers
  const processDrop = (drop: {
    itemId: string;
    minQuantity: number;
    maxQuantity: number;
    chance: number;
  }) => {
    if (Math.random() < drop.chance) {
      const quantity = Math.floor(
        Math.random() * (drop.maxQuantity - drop.minQuantity + 1) +
          drop.minQuantity,
      );
      drops.push({ itemId: drop.itemId, quantity });
    }
  };

  // Always drops (100% chance)
  npc.drops.always.forEach(processDrop);

  // Roll for other tiers
  npc.drops.common.forEach(processDrop);
  npc.drops.uncommon.forEach(processDrop);
  npc.drops.rare.forEach(processDrop);
  npc.drops.veryRare.forEach(processDrop);

  return drops;
}

/**
 * Calculate NPC combat level using OSRS-accurate formula (delegates to CombatLevelCalculator)
 */
export function calculateNPCCombatLevel(npc: NPCData): number {
  return calculateCombatLevel(
    normalizeCombatSkills({
      attack: npc.stats.attack,
      strength: npc.stats.strength,
      defense: npc.stats.defense,
      hitpoints: npc.stats.health,
      ranged: npc.stats.ranged,
      magic: npc.stats.magic,
      prayer: 1,
    }),
  );
}

/**
 * Spawning Constants per GDD — sourced from
 * `npcs-spawn-constants.json` via `NpcsManifestSchema`.
 *
 * Exported as a mutable object (not `Object.freeze`) so
 * `hotReloadNpcSpawnConstants(manifest)` can rewrite the fields
 * in-place for editor hot-reload. `MobNPCSystem` and any other
 * consumer reads through `NPC_SPAWN_CONSTANTS.X` at lookup time,
 * so the new values take effect on the next spawn tick.
 */
export const NPC_SPAWN_CONSTANTS: {
  GLOBAL_RESPAWN_TIME: number;
  MAX_NPCS_PER_ZONE: number;
  SPAWN_RADIUS_CHECK: number;
  AGGRO_LEVEL_THRESHOLD: number;
} = {
  GLOBAL_RESPAWN_TIME: npcsManifest.spawnConstants.globalRespawnTime,
  MAX_NPCS_PER_ZONE: npcsManifest.spawnConstants.maxNpcsPerZone,
  SPAWN_RADIUS_CHECK: npcsManifest.spawnConstants.spawnRadiusCheck,
  AGGRO_LEVEL_THRESHOLD: npcsManifest.spawnConstants.aggroLevelThreshold,
};

/**
 * Hot-reload the `NPC_SPAWN_CONSTANTS` record in-place from a new
 * `NpcsManifest`. Zod-validates the input; on failure the existing
 * constants are retained and the error bubbles to the caller.
 *
 * Used by `PIEEditorSession.updateManifests({ npcs })` for live
 * spawn-rule tuning without a Stop → Play cycle.
 */
export function hotReloadNpcSpawnConstants(manifest: NpcsManifest): void {
  const parsed = NpcsManifestSchema.parse(manifest);
  NPC_SPAWN_CONSTANTS.GLOBAL_RESPAWN_TIME =
    parsed.spawnConstants.globalRespawnTime;
  NPC_SPAWN_CONSTANTS.MAX_NPCS_PER_ZONE = parsed.spawnConstants.maxNpcsPerZone;
  NPC_SPAWN_CONSTANTS.SPAWN_RADIUS_CHECK =
    parsed.spawnConstants.spawnRadiusCheck;
  NPC_SPAWN_CONSTANTS.AGGRO_LEVEL_THRESHOLD =
    parsed.spawnConstants.aggroLevelThreshold;
}

/**
 * Hot-reload the `ALL_NPCS` map from a fully-normalized list of NPC
 * definitions. Clears the existing entries in-place (preserving the
 * stable top-level reference so consumers reading `ALL_NPCS.get(id)`
 * at lookup time pick up edits) and re-populates from the new list.
 *
 * Caller is responsible for normalizing the input (`NPCDataInput[]` →
 * `NPCData[]`). `DataManager.normalizeNPC` is the canonical
 * normalization path; PIE / future hot-reload bridges should call
 * it before invoking this function. No additional validation here —
 * this is the hot-path mutator, not a gate.
 *
 * Future PIE wiring slot:
 *   `PIEEditorSession.updateManifests({ npcDefinitions })` →
 *     `hotReloadNPCs(normalizedList)`
 *
 * Until that wiring lands, this function is unused at runtime — added
 * so the next session can plug in the consumer without touching
 * `data/npcs.ts` again.
 */
export function hotReloadNPCs(npcs: readonly NPCData[]): void {
  ALL_NPCS.clear();
  for (const npc of npcs) {
    ALL_NPCS.set(npc.id, npc);
  }
}
