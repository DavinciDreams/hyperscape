/**
 * distance-live.ts
 *
 * Provider-first live-getters for the authored distance tuning
 * (GAME_CONSTANTS.DISTANCE) fields that may change at runtime through
 * PIE hot-reload. Reads through the module-level `gameProvider`
 * singleton and falls back to the boot-frozen `DISTANCE_CONSTANTS`
 * values when the provider is unloaded.
 *
 * The pre-computed `_SQ` (distance-squared) helpers exist because
 * callers in hot paths compare squared distances to avoid a `sqrt`.
 * The schema only stores the raw meters — squaring is cheap (one
 * multiply) and done per-getter-call so manifest hot-reload is
 * honored immediately.
 */

import { gameProvider } from "../GameProvider";
import { DISTANCE_CONSTANTS } from "../../constants/GameConstants";

// ============================================================================
// Simulation — server-side dormant thresholds
// ============================================================================

/** Max range (m) a server broadcasts entity updates to connected clients. */
export function getNetworkBroadcastDistance(): number {
  return (
    gameProvider.getManifest()?.distance.simulation.networkBroadcast ??
    DISTANCE_CONSTANTS.SIMULATION.NETWORK_BROADCAST
  );
}

/** Squared network-broadcast distance for dot-product checks. */
export function getNetworkBroadcastDistanceSq(): number {
  const v = getNetworkBroadcastDistance();
  return v * v;
}

/** Radius (m) around a player within which spatial chunks remain active. */
export function getChunkActiveDistance(): number {
  return (
    gameProvider.getManifest()?.distance.simulation.chunkActive ??
    DISTANCE_CONSTANTS.SIMULATION.CHUNK_ACTIVE
  );
}

/** Squared chunk-active distance. */
export function getChunkActiveDistanceSq(): number {
  const v = getChunkActiveDistance();
  return v * v;
}

/** Hysteresis band (m) before a chunk flips between active/dormant. */
export function getChunkHysteresis(): number {
  return (
    gameProvider.getManifest()?.distance.simulation.chunkHysteresis ??
    DISTANCE_CONSTANTS.SIMULATION.CHUNK_HYSTERESIS
  );
}

// ============================================================================
// Render — client-side cull distances (squared for hot-path checks)
// ============================================================================

/** Raw render distance for mob entities (meters). */
export function getMobRenderDistance(): number {
  return (
    gameProvider.getManifest()?.distance.render.mob ??
    DISTANCE_CONSTANTS.RENDER.MOB
  );
}

/** Squared render distance for mob entities. */
export function getMobRenderDistanceSq(): number {
  const v = getMobRenderDistance();
  return v * v;
}

/** Raw fade-start distance for mob entities (meters). */
export function getMobFadeStartDistance(): number {
  return (
    gameProvider.getManifest()?.distance.render.mobFadeStart ??
    DISTANCE_CONSTANTS.RENDER.MOB_FADE_START
  );
}

/** Squared fade-start distance for mob entities. */
export function getMobFadeStartDistanceSq(): number {
  const v = getMobFadeStartDistance();
  return v * v;
}

/** Raw render distance for NPC entities (meters). */
export function getNpcRenderDistance(): number {
  return (
    gameProvider.getManifest()?.distance.render.npc ??
    DISTANCE_CONSTANTS.RENDER.NPC
  );
}

/** Squared render distance for NPC entities. */
export function getNpcRenderDistanceSq(): number {
  const v = getNpcRenderDistance();
  return v * v;
}

/** Raw fade-start distance for NPC entities (meters). */
export function getNpcFadeStartDistance(): number {
  return (
    gameProvider.getManifest()?.distance.render.npcFadeStart ??
    DISTANCE_CONSTANTS.RENDER.NPC_FADE_START
  );
}

/** Squared fade-start distance for NPC entities. */
export function getNpcFadeStartDistanceSq(): number {
  const v = getNpcFadeStartDistance();
  return v * v;
}

/** Raw render distance for player entities (meters). */
export function getPlayerRenderDistance(): number {
  return (
    gameProvider.getManifest()?.distance.render.player ??
    DISTANCE_CONSTANTS.RENDER.PLAYER
  );
}

/** Squared render distance for player entities. */
export function getPlayerRenderDistanceSq(): number {
  const v = getPlayerRenderDistance();
  return v * v;
}

/** Raw fade-start distance for player entities (meters). */
export function getPlayerFadeStartDistance(): number {
  return (
    gameProvider.getManifest()?.distance.render.playerFadeStart ??
    DISTANCE_CONSTANTS.RENDER.PLAYER_FADE_START
  );
}

/** Squared fade-start distance for player entities. */
export function getPlayerFadeStartDistanceSq(): number {
  const v = getPlayerFadeStartDistance();
  return v * v;
}

/** Squared render distance for item entities. */
export function getItemRenderDistanceSq(): number {
  const v =
    gameProvider.getManifest()?.distance.render.item ??
    DISTANCE_CONSTANTS.RENDER.ITEM;
  return v * v;
}

// ============================================================================
// Animation LOD — per-frame update-rate thresholds
// ============================================================================

/** Distance under which animations run at full frame rate (meters). */
export function getAnimationLodFullDistance(): number {
  return (
    gameProvider.getManifest()?.distance.animationLod.full ??
    DISTANCE_CONSTANTS.ANIMATION_LOD.FULL
  );
}

/** Distance under which animations run at half frame rate (meters). */
export function getAnimationLodHalfDistance(): number {
  return (
    gameProvider.getManifest()?.distance.animationLod.half ??
    DISTANCE_CONSTANTS.ANIMATION_LOD.HALF
  );
}

/** Distance under which animations run at quarter frame rate (meters). */
export function getAnimationLodQuarterDistance(): number {
  return (
    gameProvider.getManifest()?.distance.animationLod.quarter ??
    DISTANCE_CONSTANTS.ANIMATION_LOD.QUARTER
  );
}

/** Distance under which animations are frozen in idle pose (meters). */
export function getAnimationLodFrozenDistance(): number {
  return (
    gameProvider.getManifest()?.distance.animationLod.frozen ??
    DISTANCE_CONSTANTS.ANIMATION_LOD.FROZEN
  );
}

/** Default animation LOD cull distance (meters). */
export function getAnimationLodCulledDistance(): number {
  return (
    gameProvider.getManifest()?.distance.animationLod.culled ??
    DISTANCE_CONSTANTS.ANIMATION_LOD.CULLED
  );
}
