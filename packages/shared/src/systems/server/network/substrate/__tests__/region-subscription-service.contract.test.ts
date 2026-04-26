/**
 * Contract test for `IRegionSubscriptionService` (Phase A3) against
 * the concrete `RegionSubscriptionService` extracted in Phase B3.
 *
 * Validates:
 *  1. The class is assignable to the substrate interface.
 *  2. Subscribe/unsubscribe diffs are correctly applied to the
 *     player's adapter via the broadcast service.
 *  3. Spectator subscriptions piggy-back on the followed-player's
 *     region transitions.
 *  4. `oldKey === newKey` is a no-op (no adapter calls).
 *  5. Resubscribe (full 3x3 swap) for teleport-style jumps.
 *
 * No game state involved — pure substrate.
 */

import { describe, expect, it } from "vitest";
import { SpatialIndex } from "../../SpatialIndex";
import { RegionSubscriptionService } from "../../RegionSubscriptionService";
import type { IBroadcastService } from "../broadcast-service";
import type { IRegionSubscriptionService } from "../region-subscription-service";

interface AdapterCall {
  socketId: string;
  op: "subscribe" | "unsubscribe";
  topic: string;
}

function makeFakeBroadcastService(opts: {
  playerSockets: Map<string, string>;
  calls: AdapterCall[];
}): IBroadcastService {
  return {
    sendToAll: () => 0,
    setSpatialIndex: () => {},
    setUwsApp: () => {},
    sendToPlayer: () => false,
    getPlayerSocket(playerId: string) {
      const id = opts.playerSockets.get(playerId);
      return id ? ({ id } as never) : undefined;
    },
    onSocketDisconnected: () => {},
    sendToSocket: () => false,
    sendToSpectators: () => 0,
    sendToNearby: () => 0,
    drainSendTimeMs: () => 0,
    drainPubsubStats: () => 0,
    getAdapter(socketId: string) {
      return {
        subscribe(topic: string) {
          opts.calls.push({ socketId, op: "subscribe", topic });
        },
        unsubscribe(topic: string) {
          opts.calls.push({ socketId, op: "unsubscribe", topic });
        },
      };
    },
  };
}

describe("RegionSubscriptionService contract", () => {
  it("the concrete class is assignable to the interface", () => {
    const idx = new SpatialIndex();
    const svc: IRegionSubscriptionService = new RegionSubscriptionService({
      spatialIndex: idx,
      broadcastService: makeFakeBroadcastService({
        playerSockets: new Map(),
        calls: [],
      }),
      getSpectatorsForPlayer: () => undefined,
    });
    expect(svc).toBeDefined();
  });

  it("noop when oldKey === newKey", () => {
    const idx = new SpatialIndex();
    const calls: AdapterCall[] = [];
    const svc = new RegionSubscriptionService({
      spatialIndex: idx,
      broadcastService: makeFakeBroadcastService({
        playerSockets: new Map([["p1", "sock1"]]),
        calls,
      }),
      getSpectatorsForPlayer: () => undefined,
    });
    svc.updatePlayerRegionSubscriptions("p1", 42, 42);
    expect(calls).toEqual([]);
  });

  it("applies subscribe/unsubscribe diff to the player's adapter", () => {
    const idx = new SpatialIndex();
    idx.updatePlayerPosition("p1", 0, 0);
    const oldKey = idx.getPlayerRegionKey("p1")!;
    const change = idx.updatePlayerPosition("p1", 25, 0);
    expect(change).not.toBeNull();

    const calls: AdapterCall[] = [];
    const svc = new RegionSubscriptionService({
      spatialIndex: idx,
      broadcastService: makeFakeBroadcastService({
        playerSockets: new Map([["p1", "sock1"]]),
        calls,
      }),
      getSpectatorsForPlayer: () => undefined,
    });
    svc.updatePlayerRegionSubscriptions("p1", oldKey, change!.newKey);

    // Adjacent move ⇒ 3 subscribe + 3 unsubscribe.
    const subs = calls.filter((c) => c.op === "subscribe");
    const unsubs = calls.filter((c) => c.op === "unsubscribe");
    expect(subs.length).toBe(3);
    expect(unsubs.length).toBe(3);
    // All calls hit the player's socket.
    expect(calls.every((c) => c.socketId === "sock1")).toBe(true);
    // Topics are well-formed.
    expect(subs.every((c) => c.topic.startsWith("region:"))).toBe(true);
  });

  it("propagates the diff to spectators following the player", () => {
    const idx = new SpatialIndex();
    idx.updatePlayerPosition("p1", 0, 0);
    const oldKey = idx.getPlayerRegionKey("p1")!;
    const change = idx.updatePlayerPosition("p1", 25, 0);

    const calls: AdapterCall[] = [];
    const spectators = new Map([["p1", new Set(["spec1", "spec2"])]]);
    const svc = new RegionSubscriptionService({
      spatialIndex: idx,
      broadcastService: makeFakeBroadcastService({
        playerSockets: new Map([["p1", "sock1"]]),
        calls,
      }),
      getSpectatorsForPlayer: (playerId) => spectators.get(playerId),
    });
    svc.updatePlayerRegionSubscriptions("p1", oldKey, change!.newKey);

    // Player + 2 spectators × (3 sub + 3 unsub) = 18 calls total.
    expect(calls.length).toBe(18);
    expect(calls.filter((c) => c.socketId === "sock1").length).toBe(6);
    expect(calls.filter((c) => c.socketId === "spec1").length).toBe(6);
    expect(calls.filter((c) => c.socketId === "spec2").length).toBe(6);
  });

  it("resubscribePlayerRegionTopics swaps full 3x3 grids for teleport jumps", () => {
    const idx = new SpatialIndex();
    idx.updatePlayerPosition("p1", 0, 0);
    const oldKey = idx.getPlayerRegionKey("p1")!;

    // Big jump — won't be adjacent to the old region.
    idx.updatePlayerPosition("p1", 1000, 1000);

    const calls: AdapterCall[] = [];
    const svc = new RegionSubscriptionService({
      spatialIndex: idx,
      broadcastService: makeFakeBroadcastService({
        playerSockets: new Map([["p1", "sock1"]]),
        calls,
      }),
      getSpectatorsForPlayer: () => undefined,
    });
    svc.resubscribePlayerRegionTopics("p1", oldKey, 1000, 1000);

    // Teleport ⇒ unsub all 9 old + sub all 9 new = 18 calls.
    expect(calls.filter((c) => c.op === "unsubscribe").length).toBe(9);
    expect(calls.filter((c) => c.op === "subscribe").length).toBe(9);
  });

  it("no-op when player has no socket (e.g. embedded agent)", () => {
    const idx = new SpatialIndex();
    idx.updatePlayerPosition("p1", 0, 0);
    const oldKey = idx.getPlayerRegionKey("p1")!;
    const change = idx.updatePlayerPosition("p1", 25, 0);

    const calls: AdapterCall[] = [];
    const svc = new RegionSubscriptionService({
      spatialIndex: idx,
      // Player has no socket — embedded agent has no pubsub adapter.
      broadcastService: makeFakeBroadcastService({
        playerSockets: new Map(),
        calls,
      }),
      getSpectatorsForPlayer: () => undefined,
    });
    svc.updatePlayerRegionSubscriptions("p1", oldKey, change!.newKey);

    expect(calls).toEqual([]);
  });
});
