/**
 * Engine substrate — `ISpatialIndex`.
 *
 * Per `PLAN_ENGINE_API_EXTRACTION.md` Phase A1. Captures the public
 * surface of the concrete `SpatialIndex` (in `../SpatialIndex.ts`) so
 * that game-side consumers (TileMovementManager, Pending*Manager,
 * FollowManager — currently all in `@hyperforge/shared`, target
 * `@hyperforge/hyperscape`) can read region/player state via a
 * world-level lookup (`world.spatialIndex`) without depending on
 * ServerNetwork's concrete instance.
 *
 * Boot order: ServerNetwork's CONSTRUCTOR (Phase B, future commit)
 * will instantiate the concrete class and pin it to
 * `world.spatialIndex`. Both server and PIE call the constructor at
 * `world.register("network", ServerNetwork)` time, before either
 * host's `plugin.onEnable` phase — so the property is always
 * populated when downstream consumers look it up.
 *
 * Stateful semantics:
 *  - `updatePlayerPosition` is THE entry point for movement events.
 *    It is the only mutator that returns a `RegionChange`, signalling
 *    that pubsub subscriptions need updating
 *    (`IRegionSubscriptionService` will own that side).
 *  - Buffer-returning methods (`getPlayersNear`,
 *    `getAdjacentRegionKeys`, `getRegionSubscriptionDiff`) hand back
 *    INTERNAL buffers reused across calls. Callers MUST consume the
 *    result before the next index call. The interface signals this
 *    by typing returns as `readonly` views — consumers should not
 *    cache or hold them across awaits.
 */

/** Return value of `updatePlayerPosition` when a player crosses a region boundary. */
export interface RegionChange {
  readonly oldKey: number;
  readonly newKey: number;
}

/** Subscription delta returned from `getRegionSubscriptionDiff`. */
export interface RegionSubscriptionDiff {
  readonly subscribe: readonly number[];
  readonly unsubscribe: readonly number[];
}

/**
 * Region-based spatial index for player positions.
 *
 * The index buckets players into ~63×63-tile regions and exposes
 * 3×3-region neighborhood queries used by the broadcast layer for
 * locality (`sendToNearby`, region-topic pubsub).
 */
export interface ISpatialIndex {
  /**
   * Update or insert a player's tile position. Returns a `RegionChange`
   * iff the player moved between regions (used to drive pubsub
   * subscribe/unsubscribe diffs); returns `null` for moves that stay
   * within the same region.
   */
  updatePlayerPosition(
    playerId: string,
    worldX: number,
    worldZ: number,
  ): RegionChange | null;

  /** Drop all index state for a player (call on disconnect). */
  removePlayer(playerId: string): void;

  /**
   * Player ids inside the 3×3-region grid (~63×63 tiles) around the
   * given world coordinates.
   *
   * Returns an internal buffer; consume before the next call.
   */
  getPlayersNear(worldX: number, worldZ: number): readonly string[];

  /** The numeric region key currently occupied by a player, or undefined if not tracked. */
  getPlayerRegionKey(playerId: string): number | undefined;

  /** Cached pubsub topic string for a numeric region key (`region:<n>`). */
  getRegionTopic(regionKey: number): string;

  /**
   * Region keys for the 3×3 neighborhood around the given world
   * coordinates. Returns an internal buffer; consume before the
   * next call.
   */
  getAdjacentRegionKeys(worldX: number, worldZ: number): readonly number[];

  /**
   * Region keys for the 3×3 neighborhood around the given region key.
   * Same buffer-reuse contract as `getAdjacentRegionKeys`.
   */
  getAdjacentRegionKeysFromKey(regionKey: number): readonly number[];

  /**
   * Subscription delta between two 3×3 grids — typically 3 subscribe
   * + 3 unsubscribe for an adjacent move, vs 9+9 for the naive case.
   * Returns INTERNAL buffers; consume before the next call.
   */
  getRegionSubscriptionDiff(
    oldKey: number,
    newKey: number,
  ): RegionSubscriptionDiff;

  /** Discard all tracking state (called on shutdown). */
  destroy(): void;
}
