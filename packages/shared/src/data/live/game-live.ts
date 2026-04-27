/**
 * game-live.ts
 *
 * Provider-first live-getters for the authored game manifest fields that
 * may change at runtime through PIE hot-reload. Reads through the module-
 * level `gameProvider` singleton and falls back to the boot-frozen
 * `GAME_CONSTANTS` values when the provider is unloaded.
 *
 * Scope: only fields that have a corresponding entry in `GameManifestSchema`.
 * Legacy-only fields (e.g. `UI.HEALTH_BAR_*`) continue to read through
 * `GAME_CONSTANTS` directly until the schema is extended.
 */

import { gameProvider } from "../GameProvider";
import {
  CONTEXT_MENU_COLORS,
  GAME_CONSTANTS,
} from "../../constants/GameConstants";

/** Default starting health for a player entity (HP points). */
export function getDefaultHealth(): number {
  return (
    gameProvider.getManifest()?.player.defaultHealth ??
    GAME_CONSTANTS.PLAYER.DEFAULT_HEALTH
  );
}

/** Default maximum health ceiling for a player entity (HP points). */
export function getDefaultMaxHealth(): number {
  return (
    gameProvider.getManifest()?.player.defaultMaxHealth ??
    GAME_CONSTANTS.PLAYER.DEFAULT_MAX_HEALTH
  );
}

/** Passive health regeneration rate (HP per second or per tick — unit-
 *  preserving from legacy `GAME_CONSTANTS.PLAYER.HEALTH_REGEN_RATE`). */
export function getHealthRegenRate(): number {
  return (
    gameProvider.getManifest()?.player.healthRegenRate ??
    GAME_CONSTANTS.PLAYER.HEALTH_REGEN_RATE
  );
}

/** Home-teleport cooldown in milliseconds. */
export function getHomeTeleportCooldownMs(): number {
  return (
    gameProvider.getManifest()?.homeTeleport.cooldownMs ??
    GAME_CONSTANTS.HOME_TELEPORT.COOLDOWN_MS
  );
}

/** Home-teleport cast time in milliseconds (interruptible by movement/combat). */
export function getHomeTeleportCastTimeMs(): number {
  return (
    gameProvider.getManifest()?.homeTeleport.castTimeMs ??
    GAME_CONSTANTS.HOME_TELEPORT.CAST_TIME_MS
  );
}

/** Home-teleport cast time in ticks (server-side processing). */
export function getHomeTeleportCastTimeTicks(): number {
  return (
    gameProvider.getManifest()?.homeTeleport.castTimeTicks ??
    GAME_CONSTANTS.HOME_TELEPORT.CAST_TIME_TICKS
  );
}

/** Maximum inventory slot count for a player. */
export function getMaxInventorySlots(): number {
  return (
    gameProvider.getManifest()?.inventory.maxInventorySlots ??
    GAME_CONSTANTS.INVENTORY.MAX_INVENTORY_SLOTS
  );
}

/** Global cap on live bandit-class mobs worldwide. */
export function getMaxBanditMobsWorld(): number {
  return (
    gameProvider.getManifest()?.mob.maxBanditMobsWorld ??
    GAME_CONSTANTS.MOB.MAX_BANDIT_MOBS_WORLD
  );
}

/**
 * Live list of mob type ids that count against the global bandit cap.
 * Read through the provider so PIE edits can add/remove cap entries without
 * requiring a class reload.
 */
export function getBanditMobIdsForGlobalCap(): readonly string[] {
  return (
    gameProvider.getManifest()?.mob.banditMobIdsForGlobalCap ??
    GAME_CONSTANTS.MOB.BANDIT_MOB_IDS_FOR_GLOBAL_CAP
  );
}

/**
 * Predicate: does this mob id count toward the bandit global cap?
 * Uses a short array `includes()` since the cap list is tiny (currently 2–3
 * entries), which is O(n) with n≈3 and avoids per-call Set allocation.
 */
export function isBanditMobForGlobalCap(mobId: string): boolean {
  return getBanditMobIdsForGlobalCap().includes(mobId);
}

// === WORLD ===

/** Spatial partition chunk size (m) used by `SpatialEntityRegistry`. */
export function getWorldChunkSize(): number {
  return (
    gameProvider.getManifest()?.world.chunkSize ??
    GAME_CONSTANTS.WORLD.CHUNK_SIZE
  );
}

// === TERRAIN ===

/** World-space Y height below which terrain is considered submerged. */
export function getWaterThreshold(): number {
  return (
    gameProvider.getManifest()?.terrain.waterThreshold ??
    GAME_CONSTANTS.TERRAIN.WATER_THRESHOLD
  );
}

/** Vertical buffer added above `waterThreshold` for vegetation cutoff. */
export function getWaterEdgeBuffer(): number {
  return (
    gameProvider.getManifest()?.terrain.waterEdgeBuffer ??
    GAME_CONSTANTS.TERRAIN.WATER_EDGE_BUFFER
  );
}

/** Minimum depth below `waterThreshold` to render visible water surfaces. */
export function getMinVisibleWaterDepth(): number {
  return (
    gameProvider.getManifest()?.terrain.minVisibleWaterDepth ??
    GAME_CONSTANTS.TERRAIN.MIN_VISIBLE_WATER_DEPTH
  );
}

/** Maximum walkable slope (tan of angle) for pathfinding and movement. */
export function getMaxWalkableSlope(): number {
  return (
    gameProvider.getManifest()?.terrain.maxWalkableSlope ??
    GAME_CONSTANTS.TERRAIN.MAX_WALKABLE_SLOPE
  );
}

/** Distance (m) used to sample neighboring heights for slope calculation. */
export function getSlopeCheckDistance(): number {
  return (
    gameProvider.getManifest()?.terrain.slopeCheckDistance ??
    GAME_CONSTANTS.TERRAIN.SLOPE_CHECK_DISTANCE
  );
}

/** World-space tile size (m) of the gameplay grid. */
export function getTileSize(): number {
  return (
    gameProvider.getManifest()?.terrain.tileSize ??
    GAME_CONSTANTS.TERRAIN.TILE_SIZE
  );
}

/** World-space tile size (m) of a terrain mesh chunk. */
export function getTerrainTileSize(): number {
  return (
    gameProvider.getManifest()?.terrain.terrainTileSize ??
    GAME_CONSTANTS.TERRAIN.TERRAIN_TILE_SIZE
  );
}

// === CONTEXT MENU COLORS ===

/** tile-based-MMORPG-style context-menu name color for item entries (hex #RRGGBB). */
export function getContextMenuItemColor(): string {
  return (
    gameProvider.getManifest()?.contextMenuColors.item ??
    CONTEXT_MENU_COLORS.ITEM
  );
}

/** tile-based-MMORPG-style context-menu name color for NPC/mob entries (hex #RRGGBB). */
export function getContextMenuNpcColor(): string {
  return (
    gameProvider.getManifest()?.contextMenuColors.npc ?? CONTEXT_MENU_COLORS.NPC
  );
}

/** tile-based-MMORPG-style context-menu name color for world-object/resource entries. */
export function getContextMenuObjectColor(): string {
  return (
    gameProvider.getManifest()?.contextMenuColors.object ??
    CONTEXT_MENU_COLORS.OBJECT
  );
}

/** tile-based-MMORPG-style context-menu name color for player entries (hex #RRGGBB). */
export function getContextMenuPlayerColor(): string {
  return (
    gameProvider.getManifest()?.contextMenuColors.player ??
    CONTEXT_MENU_COLORS.PLAYER
  );
}
