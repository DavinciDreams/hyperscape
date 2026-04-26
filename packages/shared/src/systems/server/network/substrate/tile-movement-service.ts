/**
 * Engine substrate — `ITileMovementService`.
 *
 * Per `PLAN_ENGINE_API_EXTRACTION.md` Phase A4. Captures the
 * tile-based movement primitives that game-side managers
 * (Pending- and Follow-managers, post-migration TileMovementManager
 * orchestration) need to consume without depending on ServerNetwork's
 * concrete movement implementation.
 *
 * This interface previously lived in `network/interfaces.ts` as
 * `ITileMovementManager` (added during the original
 * PLAN_SERVERNETWORK_MIGRATION step 1 exactly so consumers could
 * decouple from the concrete class). Phase A4 relocates it here
 * and renames it `ITileMovementService` for consistency with the
 * rest of the substrate naming. The old name remains available as
 * an alias from `network/interfaces.ts` for back-compat.
 *
 * Surface boundary:
 *  - The 6 methods below are what Pending- and Follow-managers
 *    actually call. They're engine primitives — pathfinding +
 *    server-initiated movement + simple queries.
 *  - Higher-level concerns (packet handlers, anti-cheat callbacks,
 *    tick orchestration, agility-progress tracking) stay on the
 *    concrete `TileMovementManager` class. Once TMM migrates to
 *    plugin (Phase E), it consumes substrate via this interface and
 *    layers its own gameplay state on top.
 *
 * Boot order: ServerNetwork's CONSTRUCTOR (Phase B, future commit)
 * will instantiate the concrete service and pin it to
 * `world.tileMovement`. Both production server and PIE call the
 * constructor at register-time, before either host's `plugin.onEnable`
 * runs — so `world.tileMovement` is always populated when game-side
 * consumers look it up.
 */

import type { AttackType, TileCoord } from "../../../../index";

/**
 * Tile-based movement service. Game-side managers (PendingTrade,
 * PendingDuelChallenge, PendingAttack, PendingCook, PendingGather,
 * Follow) consume this interface to steer players around the world
 * without depending on ServerNetwork's concrete movement state.
 */
export interface ITileMovementService {
  /**
   * Server-initiated movement toward a target position.
   * Used for combat follow, pending interactions, and post-teleport routing.
   */
  movePlayerToward(
    playerId: string,
    targetPosition: { x: number; y: number; z: number },
    running?: boolean,
    attackRange?: number,
    attackType?: AttackType,
  ): void;

  /** Cancel any active path for a player. */
  stopPlayer(playerId: string): void;

  /** Whether the player is currently running (vs walking). */
  getIsRunning(playerId: string): boolean;

  /**
   * BFS outward from a world position for the closest walkable tile.
   * Returns null if no walkable tile is found within the search radius.
   */
  findClosestWalkableTile(
    targetPos: { x: number; z: number },
    maxSearchRadius?: number,
  ): TileCoord | null;

  /**
   * Register an emote to play when the player arrives at their destination.
   * Used for gathering animations (fishing, etc.).
   */
  setArrivalEmote(playerId: string, emote: string): void;

  /**
   * Return the tile the player occupied before their current tile. Used by
   * FollowManager to implement classic-MMORPG-style follow mechanics.
   */
  getPreviousTile(playerId: string): TileCoord;
}
