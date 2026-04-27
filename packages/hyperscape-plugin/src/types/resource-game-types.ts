/**
 * Resource / processing / death game types — relocated from
 * `@hyperforge/shared/types/game/resource-processing-types` 2026-04-27
 * (top-10 #8, slice 30).
 *
 * The footprint primitives (`ResourceFootprint`, `FootprintDimensions`,
 * `FootprintSpec`, `FOOTPRINT_SIZES`, `resolveFootprint`) stay in
 * shared because they're engine substrate — consumed by
 * `types/entities/entities.ts`, `TerrainSystem`, `RaycastService`,
 * `StationDataProvider`. Game-specific types (Resource, ResourceDrop,
 * Fire, ProcessingAction, DeathData) live here because the only
 * consumers are plugin-side systems (ResourceSystem,
 * ResourceTileDebugSystem, SkillsSystem, PendingGatherManager,
 * PendingCookManager).
 *
 * Note: the `Fire` type below is kept for parity with the original
 * file but appears to be effectively dead — the active `FireManager`
 * in `shared/systems/shared/entities/processing/FireManager.ts` uses
 * its own local `Fire` interface from a sibling `types.ts`. Plugin
 * code references the shared `Fire` type only via the barrel
 * re-export.
 */

import type * as THREE from "three";
import type { Position3D, ResourceFootprint } from "@hyperforge/shared";

/**
 * Resource - a gatherable resource in the world
 */
export interface Resource {
  id: string;
  type: "tree" | "fishing_spot" | "ore" | "herb_patch" | "mine";
  name: string;
  position: Position3D;
  skillRequired: string;
  levelRequired: number;
  toolRequired: string; // Tool item ID
  /** Secondary consumable required (e.g., "fishing_bait" for rod fishing, "feathers" for fly fishing) */
  secondaryRequired?: string;
  respawnTime: number; // Milliseconds
  isAvailable: boolean;
  lastDepleted: number;
  drops: ResourceDrop[];
  /** Tile footprint - defaults to "standard" (1×1) if not specified */
  footprint?: ResourceFootprint;
}

/**
 * Resource drop - what a resource can drop when gathered
 *
 * For fishing with classic MMORPG priority rolling:
 * - `levelRequired`: Minimum skill level to catch this fish
 * - `catchLow`: Catch rate at level 1 (x/256 numerator)
 * - `catchHigh`: Catch rate at level 99 (x/256 numerator)
 *
 * Fish are rolled in priority order (highest level first).
 */
export interface ResourceDrop {
  itemId: string;
  itemName: string;
  quantity: number;
  chance: number; // 0-1 (for weighted random) or 1.0 (for priority rolling)
  xpAmount: number;
  stackable: boolean;
  /** Skill level required to catch this specific item */
  levelRequired?: number;
  /** classic MMORPG catch rate numerator at level 1 (x/256) */
  catchLow?: number;
  /** classic MMORPG catch rate numerator at level 99 (x/256) */
  catchHigh?: number;
}

// ============== FIRE TYPES ==============

/**
 * Fire - a fire created by the firemaking skill
 */
export interface Fire {
  id: string;
  position: Position3D;
  playerId: string; // Who lit the fire
  createdAt: number;
  duration: number; // How long fire lasts in milliseconds
  isActive: boolean;
  mesh?: THREE.Object3D;
}

// ============== PROCESSING TYPES ==============

/**
 * Processing action - firemaking and cooking actions
 *
 * Note: Item IDs are always strings. The manifest uses string IDs
 * (e.g., "raw_shrimp", "logs") as the source of truth.
 */
export interface ProcessingAction {
  playerId: string;
  actionType: "firemaking" | "cooking";
  primaryItem: { id: string; slot: number }; // Item being used (tinderbox/raw fish)
  targetItem?: { id: string; slot: number }; // Target item (logs/fire)
  targetFire?: string; // Fire ID for cooking
  startPosition?: Position3D; // Cached position at start (for firemaking movement detection)
  startTime: number;
  duration: number;
  xpReward: number;
  skillRequired: string;
}

// ============== DEATH AND RESPAWN TYPES ==============

/**
 * Death data - information about a player's death
 */
export interface DeathData {
  playerId: string;
  deathLocation: Position3D;
  killedBy: string;
  deathTime: number;
  respawnTime: number;
  itemsDropped?: string[];
}
