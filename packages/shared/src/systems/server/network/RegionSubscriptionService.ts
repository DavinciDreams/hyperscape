/**
 * RegionSubscriptionService — concrete implementation of
 * `IRegionSubscriptionService` (Phase A3 substrate interface).
 *
 * Per `PLAN_ENGINE_API_EXTRACTION.md` Phase B3 (2026-04-26).
 * Extracts ServerNetwork's `updatePlayerRegionSubscriptions` +
 * `resubscribePlayerRegionTopics` private methods into a standalone
 * service class. ServerNetwork's constructor instantiates it and
 * pins it to `world.regionSubscriptions`.
 *
 * Dependencies (injected via constructor):
 *  - `spatialIndex` — to compute subscription diffs and resolve
 *    region keys → topic strings.
 *  - `broadcastService` — to look up `getPlayerSocket(playerId)` (so
 *    we can fetch the per-socket pubsub adapter via `getAdapter`)
 *    and `getAdapter(socketId)` for spectator sockets.
 *  - `spectatorsByPlayer` — read-only view of ServerNetwork's
 *    "spectator follows player" map. Spectator subscriptions piggy-
 *    back on the followed player's region transitions. Passed as a
 *    getter so the service sees the live map without coupling to
 *    ServerNetwork's class identity.
 *
 * Boot order: ServerNetwork constructs this in its constructor (Phase
 * B3) right after the spatial index + broadcast service. By the time
 * any plugin onEnable runs, `world.regionSubscriptions` is populated.
 */

import type { ISpatialIndex } from "./substrate/spatial-index";
import type { IBroadcastService } from "./substrate/broadcast-service";
import type { IRegionSubscriptionService } from "./substrate/region-subscription-service";

export interface RegionSubscriptionServiceDeps {
  readonly spatialIndex: ISpatialIndex;
  readonly broadcastService: IBroadcastService;
  /**
   * Live accessor for the spectator-following-player map. Returns
   * `undefined` when no spectators are following the given player.
   * The service does not mutate the map — only reads from it during
   * region-change updates.
   */
  readonly getSpectatorsForPlayer: (
    playerId: string,
  ) => ReadonlySet<string> | undefined;
}

export class RegionSubscriptionService implements IRegionSubscriptionService {
  private readonly spatialIndex: ISpatialIndex;
  private readonly broadcastService: IBroadcastService;
  private readonly getSpectatorsForPlayer: (
    playerId: string,
  ) => ReadonlySet<string> | undefined;

  constructor(deps: RegionSubscriptionServiceDeps) {
    this.spatialIndex = deps.spatialIndex;
    this.broadcastService = deps.broadcastService;
    this.getSpectatorsForPlayer = deps.getSpectatorsForPlayer;
  }

  updatePlayerRegionSubscriptions(
    playerId: string,
    oldKey: number,
    newKey: number,
  ): void {
    if (oldKey === newKey) return;

    const diff = this.spatialIndex.getRegionSubscriptionDiff(oldKey, newKey);
    const adapter = this.getAdapterForPlayer(playerId);
    if (adapter) {
      for (const key of diff.unsubscribe) {
        adapter.unsubscribe(this.spatialIndex.getRegionTopic(key));
      }
      for (const key of diff.subscribe) {
        adapter.subscribe(this.spatialIndex.getRegionTopic(key));
      }
    }

    this.updateSpectatorSubscriptions(playerId, diff);
  }

  resubscribePlayerRegionTopics(
    playerId: string,
    oldKey: number,
    worldX: number,
    worldZ: number,
  ): void {
    const oldKeys = this.spatialIndex.getAdjacentRegionKeysFromKey(oldKey);
    const newKeys = this.spatialIndex.getAdjacentRegionKeys(worldX, worldZ);

    const adapter = this.getAdapterForPlayer(playerId);
    if (adapter) {
      for (let i = 0; i < oldKeys.length; i++) {
        adapter.unsubscribe(this.spatialIndex.getRegionTopic(oldKeys[i]));
      }
      for (let i = 0; i < newKeys.length; i++) {
        adapter.subscribe(this.spatialIndex.getRegionTopic(newKeys[i]));
      }
    }

    // Compute the spectator-applicable subscribe/unsubscribe diff:
    // anything in newKeys not in oldKeys → subscribe; anything in
    // oldKeys not in newKeys → unsubscribe.
    const oldKeySet = new Set(oldKeys);
    const newKeySet = new Set(newKeys);
    const subKeys: number[] = [];
    const unsubKeys: number[] = [];
    for (let i = 0; i < newKeys.length; i++) {
      if (!oldKeySet.has(newKeys[i])) subKeys.push(newKeys[i]);
    }
    for (let i = 0; i < oldKeys.length; i++) {
      if (!newKeySet.has(oldKeys[i])) unsubKeys.push(oldKeys[i]);
    }
    if (subKeys.length > 0 || unsubKeys.length > 0) {
      this.updateSpectatorSubscriptions(playerId, {
        subscribe: subKeys,
        unsubscribe: unsubKeys,
      });
    }
  }

  /** Resolve the player's pubsub adapter via broadcast-service lookup. */
  private getAdapterForPlayer(playerId: string) {
    const socket = this.broadcastService.getPlayerSocket(playerId);
    if (!socket) return undefined;
    return this.broadcastService.getAdapter(socket.id);
  }

  /**
   * Apply a subscribe/unsubscribe diff to every spectator following
   * `followedPlayerId`. Typical case is 0-2 spectators per player.
   */
  private updateSpectatorSubscriptions(
    followedPlayerId: string,
    diff: {
      readonly subscribe: readonly number[];
      readonly unsubscribe: readonly number[];
    },
  ): void {
    const spectatorIds = this.getSpectatorsForPlayer(followedPlayerId);
    if (!spectatorIds || spectatorIds.size === 0) return;

    for (const socketId of spectatorIds) {
      const spectAdapter = this.broadcastService.getAdapter(socketId);
      if (!spectAdapter) continue;
      for (const key of diff.unsubscribe) {
        spectAdapter.unsubscribe(this.spatialIndex.getRegionTopic(key));
      }
      for (const key of diff.subscribe) {
        spectAdapter.subscribe(this.spatialIndex.getRegionTopic(key));
      }
    }
  }
}
