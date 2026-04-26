/**
 * Contract test for `ISpatialIndex`.
 *
 * Per `PLAN_ENGINE_API_EXTRACTION.md` Phase A1. Validates that:
 *  1. The concrete `SpatialIndex` class satisfies the substrate
 *     interface — caught at compile time by the `implements` clause,
 *     re-asserted at test time via type-only assignment.
 *  2. Behavior contracts hold for the operations downstream consumers
 *     will rely on once they migrate to the interface
 *     (Pending-managers, FollowManager, TileMovementManager).
 *
 * No game state involved — pure substrate. Future phases that move
 * the consumers out of shared will add their own contract tests
 * against the same interface.
 */

import { describe, expect, it } from "vitest";
import { SpatialIndex } from "../../SpatialIndex";
import type { ISpatialIndex } from "../spatial-index";

describe("ISpatialIndex contract — SpatialIndex concrete class", () => {
  it("the concrete class is assignable to the interface", () => {
    // Type-only assertion: forces a compile error if the public
    // surface of `SpatialIndex` ever drifts from `ISpatialIndex`.
    const _index: ISpatialIndex = new SpatialIndex();
    expect(_index).toBeDefined();
  });

  it("updatePlayerPosition returns null on first insert", () => {
    const index: ISpatialIndex = new SpatialIndex();
    const change = index.updatePlayerPosition("p1", 100, 100);
    expect(change).toBeNull();
  });

  it("updatePlayerPosition returns null when staying within the same region", () => {
    const index: ISpatialIndex = new SpatialIndex();
    // Region size is 21 tiles. Picking two tiles inside the same
    // region (both within [0, 20]) so floor(x/21) + floor(z/21) is
    // identical for both calls.
    index.updatePlayerPosition("p1", 5, 5);
    const change = index.updatePlayerPosition("p1", 10, 10);
    expect(change).toBeNull();
  });

  it("updatePlayerPosition returns RegionChange when crossing a region boundary", () => {
    const index: ISpatialIndex = new SpatialIndex();
    index.updatePlayerPosition("p1", 0, 0);
    // Move ~50 tiles east — guaranteed to cross at least one region.
    const change = index.updatePlayerPosition("p1", 50, 0);
    expect(change).not.toBeNull();
    expect(change!.oldKey).not.toBe(change!.newKey);
  });

  it("getPlayersNear returns players within the 3×3 neighborhood", () => {
    const index: ISpatialIndex = new SpatialIndex();
    index.updatePlayerPosition("p1", 100, 100);
    index.updatePlayerPosition("p2", 105, 105);
    const nearby = index.getPlayersNear(100, 100);
    expect(nearby).toContain("p1");
    expect(nearby).toContain("p2");
  });

  it("removePlayer drops the player from the index", () => {
    const index: ISpatialIndex = new SpatialIndex();
    index.updatePlayerPosition("p1", 100, 100);
    expect(index.getPlayerRegionKey("p1")).toBeDefined();
    index.removePlayer("p1");
    expect(index.getPlayerRegionKey("p1")).toBeUndefined();
  });

  it("getRegionTopic returns a `region:<key>` string", () => {
    const index: ISpatialIndex = new SpatialIndex();
    index.updatePlayerPosition("p1", 100, 100);
    const key = index.getPlayerRegionKey("p1")!;
    const topic = index.getRegionTopic(key);
    expect(topic).toMatch(/^region:-?\d+$/);
  });

  it("getAdjacentRegionKeys returns 9 keys for a 3×3 neighborhood", () => {
    const index: ISpatialIndex = new SpatialIndex();
    const keys = index.getAdjacentRegionKeys(100, 100);
    expect(keys.length).toBe(9);
    // All 9 keys distinct.
    expect(new Set(keys).size).toBe(9);
  });

  it("getRegionSubscriptionDiff yields a small delta for an adjacent move", () => {
    const index: ISpatialIndex = new SpatialIndex();
    index.updatePlayerPosition("p1", 0, 0);
    const oldKey = index.getPlayerRegionKey("p1")!;
    // Crossing one region boundary east.
    const change = index.updatePlayerPosition("p1", 25, 0);
    expect(change).not.toBeNull();
    const diff = index.getRegionSubscriptionDiff(oldKey, change!.newKey);
    // Adjacent move ⇒ 3 sub + 3 unsub instead of full 9+9.
    expect(diff.subscribe.length).toBe(3);
    expect(diff.unsubscribe.length).toBe(3);
  });

  it("destroy clears all tracking state", () => {
    const index: ISpatialIndex = new SpatialIndex();
    index.updatePlayerPosition("p1", 100, 100);
    index.destroy();
    expect(index.getPlayerRegionKey("p1")).toBeUndefined();
  });
});
