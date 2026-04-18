/**
 * Spatial Index for Interest Management
 *
 * Tracks player positions in a region-based grid (21×21 tiles per region,
 * matching AggroSystem) to enable O(k) nearby-player queries instead of
 * O(n) full broadcasts.
 *
 * Used by BroadcastManager.sendToNearby() to limit network traffic to
 * players who can actually see the event.
 *
 * Also provides region topic helpers for uWS native pub/sub — topic strings
 * are cached to avoid hot-path allocation.
 */

/** Region size in tiles — matches AggroSystem TOLERANCE_REGION_SIZE */
const REGION_SIZE = 21;

/** Return value of updatePlayerPosition when a region change occurred */
export interface RegionChange {
  oldKey: number;
  newKey: number;
}

export class SpatialIndex {
  /** regionKey (numeric) → Set<playerId> - uses numeric keys to avoid string allocations */
  private playersByRegion = new Map<number, Set<string>>();
  /** playerId → regionKey (numeric) */
  private playerRegion = new Map<string, number>();

  /** Pre-allocated buffer for zero-allocation queries */
  private readonly _nearbyBuffer: string[] = [];

  /** Large prime for region key calculation to minimize collisions */
  private static readonly REGION_KEY_OFFSET = 1_000_000;

  /** Cached "region:<key>" topic strings to avoid allocation in hot path */
  private regionTopicCache = new Map<number, string>();

  /** Pre-allocated buffers for adjacent region key queries */
  private readonly _adjacentKeysBuffer: number[] = new Array(9);
  private readonly _diffSubscribeBuffer: number[] = [];
  private readonly _diffUnsubscribeBuffer: number[] = [];

  /**
   * Update (or insert) a player's position in the index.
   * Call this on every PLAYER_POSITION_UPDATED event.
   *
   * @returns RegionChange if the player moved to a different region, null otherwise
   */
  updatePlayerPosition(
    playerId: string,
    worldX: number,
    worldZ: number,
  ): RegionChange | null {
    const tileX = Math.floor(worldX);
    const tileZ = Math.floor(worldZ);
    const newKey = this.regionKey(tileX, tileZ);
    const oldKey = this.playerRegion.get(playerId);

    if (oldKey === newKey) return null; // No region change

    // Remove from old region
    if (oldKey !== undefined) {
      const oldSet = this.playersByRegion.get(oldKey);
      if (oldSet) {
        oldSet.delete(playerId);
        if (oldSet.size === 0) {
          this.playersByRegion.delete(oldKey);
        }
      }
    }

    // Add to new region
    let regionSet = this.playersByRegion.get(newKey);
    if (!regionSet) {
      regionSet = new Set();
      this.playersByRegion.set(newKey, regionSet);
    }
    regionSet.add(playerId);
    this.playerRegion.set(playerId, newKey);

    return oldKey !== undefined ? { oldKey, newKey } : null;
  }

  /**
   * Get player IDs within a 3×3 region grid (~63×63 tiles) around a world position.
   *
   * Returns an internal buffer — callers must consume before the next call.
   */
  getPlayersNear(worldX: number, worldZ: number): string[] {
    const tileX = Math.floor(worldX);
    const tileZ = Math.floor(worldZ);
    const centerRX = Math.floor(tileX / REGION_SIZE);
    const centerRZ = Math.floor(tileZ / REGION_SIZE);

    const buf = this._nearbyBuffer;
    buf.length = 0;

    // PERF: Use numeric keys to avoid string allocations in hot path
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = this.regionKeyFromCoords(centerRX + dx, centerRZ + dz);
        const players = this.playersByRegion.get(key);
        if (players) {
          for (const pid of players) {
            buf.push(pid);
          }
        }
      }
    }

    return buf;
  }

  /**
   * Remove a player from the index (call on disconnect / entity removal).
   */
  removePlayer(playerId: string): void {
    const regionKey = this.playerRegion.get(playerId);
    if (regionKey !== undefined) {
      const regionSet = this.playersByRegion.get(regionKey);
      if (regionSet) {
        regionSet.delete(playerId);
        if (regionSet.size === 0) {
          this.playersByRegion.delete(regionKey);
        }
      }
      this.playerRegion.delete(playerId);
    }
  }

  /**
   * Get the current region key for a player, or undefined if not tracked.
   */
  getPlayerRegionKey(playerId: string): number | undefined {
    return this.playerRegion.get(playerId);
  }

  /**
   * Get cached topic string for a region key.
   * Lazily creates and caches "region:<key>" strings.
   */
  getRegionTopic(regionKey: number): string {
    let topic = this.regionTopicCache.get(regionKey);
    if (topic === undefined) {
      topic = `region:${regionKey}`;
      this.regionTopicCache.set(regionKey, topic);
    }
    return topic;
  }

  /**
   * Get 9 adjacent region keys (3×3 grid) for a world position.
   * Returns an internal buffer — callers must consume before the next call.
   */
  getAdjacentRegionKeys(worldX: number, worldZ: number): number[] {
    const tileX = Math.floor(worldX);
    const tileZ = Math.floor(worldZ);
    const centerRX = Math.floor(tileX / REGION_SIZE);
    const centerRZ = Math.floor(tileZ / REGION_SIZE);
    return this.fillAdjacentKeys(centerRX, centerRZ);
  }

  /**
   * Get 9 adjacent region keys (3×3 grid) from a region key.
   * Returns an internal buffer — callers must consume before the next call.
   */
  getAdjacentRegionKeysFromKey(regionKey: number): number[] {
    const { rx, rz } = this.regionCoordsFromKey(regionKey);
    return this.fillAdjacentKeys(rx, rz);
  }

  /**
   * Compute the subscription diff between old and new 3×3 region grids.
   * Typically 3 subscribe + 3 unsubscribe instead of 9+9 for adjacent moves.
   *
   * Returns internal buffers — callers must consume before the next call.
   */
  getRegionSubscriptionDiff(
    oldKey: number,
    newKey: number,
  ): { subscribe: number[]; unsubscribe: number[] } {
    const oldCoords = this.regionCoordsFromKey(oldKey);
    const newCoords = this.regionCoordsFromKey(newKey);

    // Build sets of old and new 3×3 keys
    const oldKeys = new Set<number>();
    const newKeys = new Set<number>();

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        oldKeys.add(
          this.regionKeyFromCoords(oldCoords.rx + dx, oldCoords.rz + dz),
        );
        newKeys.add(
          this.regionKeyFromCoords(newCoords.rx + dx, newCoords.rz + dz),
        );
      }
    }

    const sub = this._diffSubscribeBuffer;
    const unsub = this._diffUnsubscribeBuffer;
    sub.length = 0;
    unsub.length = 0;

    for (const key of newKeys) {
      if (!oldKeys.has(key)) sub.push(key);
    }
    for (const key of oldKeys) {
      if (!newKeys.has(key)) unsub.push(key);
    }

    return { subscribe: sub, unsubscribe: unsub };
  }

  /** Discard all tracking data. */
  destroy(): void {
    this.playersByRegion.clear();
    this.playerRegion.clear();
    this._nearbyBuffer.length = 0;
    this.regionTopicCache.clear();
  }

  /** Calculate numeric region key - avoids string allocation */
  private regionKey(tileX: number, tileZ: number): number {
    const rx = Math.floor(tileX / REGION_SIZE);
    const rz = Math.floor(tileZ / REGION_SIZE);
    return this.regionKeyFromCoords(rx, rz);
  }

  /** Calculate numeric region key from region coordinates */
  private regionKeyFromCoords(rx: number, rz: number): number {
    return (
      (rx + SpatialIndex.REGION_KEY_OFFSET) *
        (2 * SpatialIndex.REGION_KEY_OFFSET) +
      (rz + SpatialIndex.REGION_KEY_OFFSET)
    );
  }

  /** Reverse a region key back to region coordinates */
  private regionCoordsFromKey(key: number): { rx: number; rz: number } {
    const width = 2 * SpatialIndex.REGION_KEY_OFFSET;
    const rx = Math.floor(key / width) - SpatialIndex.REGION_KEY_OFFSET;
    const rz = (key % width) - SpatialIndex.REGION_KEY_OFFSET;
    return { rx, rz };
  }

  /** Fill adjacent keys buffer from region coordinates */
  private fillAdjacentKeys(centerRX: number, centerRZ: number): number[] {
    const buf = this._adjacentKeysBuffer;
    let i = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        buf[i++] = this.regionKeyFromCoords(centerRX + dx, centerRZ + dz);
      }
    }
    return buf;
  }
}
