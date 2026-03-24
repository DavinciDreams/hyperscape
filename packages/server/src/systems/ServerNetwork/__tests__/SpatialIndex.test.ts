/**
 * SpatialIndex Unit Tests
 *
 * Tests region-based spatial indexing for interest management:
 * - Player position tracking and region assignment
 * - Nearby player queries (3×3 region grid)
 * - Region subscription diffs for pub/sub topic management
 * - Region topic caching
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SpatialIndex } from "../SpatialIndex";

/** Region size matches the constant in SpatialIndex.ts */
const REGION_SIZE = 21;

describe("SpatialIndex", () => {
  let index: SpatialIndex;

  beforeEach(() => {
    index = new SpatialIndex();
  });

  describe("updatePlayerPosition", () => {
    it("returns null on first insertion (no previous region)", () => {
      const result = index.updatePlayerPosition("p1", 10, 10);
      expect(result).toBeNull();
    });

    it("returns null when player stays in same region", () => {
      index.updatePlayerPosition("p1", 5, 5);
      const result = index.updatePlayerPosition("p1", 6, 6);
      expect(result).toBeNull();
    });

    it("returns region change when crossing region boundary", () => {
      index.updatePlayerPosition("p1", 0, 0);
      const result = index.updatePlayerPosition("p1", REGION_SIZE + 1, 0);
      expect(result).not.toBeNull();
      expect(result!.oldKey).not.toBe(result!.newKey);
    });
  });

  describe("getPlayersNear", () => {
    it("finds player in same region", () => {
      index.updatePlayerPosition("p1", 10, 10);
      const nearby = index.getPlayersNear(10, 10);
      expect(nearby).toContain("p1");
    });

    it("finds players in adjacent regions", () => {
      // Place player in adjacent region
      index.updatePlayerPosition("p1", 0, 0);
      index.updatePlayerPosition("p2", REGION_SIZE, 0);

      const nearby = index.getPlayersNear(0, 0);
      expect(nearby).toContain("p1");
      expect(nearby).toContain("p2");
    });

    it("does not find players far away", () => {
      index.updatePlayerPosition("p1", 0, 0);
      index.updatePlayerPosition("far", REGION_SIZE * 5, REGION_SIZE * 5);

      const nearby = index.getPlayersNear(0, 0);
      expect(nearby).toContain("p1");
      expect(nearby).not.toContain("far");
    });

    it("returns empty for regions with no players", () => {
      const nearby = index.getPlayersNear(9999, 9999);
      expect(nearby).toHaveLength(0);
    });
  });

  describe("removePlayer", () => {
    it("removes player from queries", () => {
      index.updatePlayerPosition("p1", 10, 10);
      expect(index.getPlayersNear(10, 10)).toContain("p1");

      index.removePlayer("p1");
      expect(index.getPlayersNear(10, 10)).not.toContain("p1");
    });

    it("does not throw for unknown player", () => {
      expect(() => index.removePlayer("unknown")).not.toThrow();
    });
  });

  describe("getRegionSubscriptionDiff", () => {
    it("returns empty diff for same region", () => {
      index.updatePlayerPosition("p1", 0, 0);
      const key = index.getPlayerRegionKey("p1")!;

      const diff = index.getRegionSubscriptionDiff(key, key);
      expect(diff.subscribe).toHaveLength(0);
      expect(diff.unsubscribe).toHaveLength(0);
    });

    it("returns 3 subscribe + 3 unsubscribe for cardinal move", () => {
      // Move one region east: 6 old regions drop off left, 6 new on right
      // Actually for a 3×3 grid moving 1 region: 3 new columns, 3 old columns
      index.updatePlayerPosition("p1", 0, 0);
      const oldKey = index.getPlayerRegionKey("p1")!;

      index.updatePlayerPosition("p1", REGION_SIZE, 0);
      const newKey = index.getPlayerRegionKey("p1")!;

      const diff = index.getRegionSubscriptionDiff(oldKey, newKey);

      // Moving 1 region over: 3 new regions, 3 old regions
      expect(diff.subscribe).toHaveLength(3);
      expect(diff.unsubscribe).toHaveLength(3);

      // No overlap between subscribe and unsubscribe
      for (const key of diff.subscribe) {
        expect(diff.unsubscribe).not.toContain(key);
      }
    });

    it("returns 5 subscribe + 5 unsubscribe for diagonal move", () => {
      index.updatePlayerPosition("p1", 0, 0);
      const oldKey = index.getPlayerRegionKey("p1")!;

      index.updatePlayerPosition("p1", REGION_SIZE, REGION_SIZE);
      const newKey = index.getPlayerRegionKey("p1")!;

      const diff = index.getRegionSubscriptionDiff(oldKey, newKey);

      // Diagonal 1-region move: 5 new, 5 old, 4 shared
      expect(diff.subscribe).toHaveLength(5);
      expect(diff.unsubscribe).toHaveLength(5);
    });

    it("returns 9 subscribe + 9 unsubscribe for far teleport", () => {
      index.updatePlayerPosition("p1", 0, 0);
      const oldKey = index.getPlayerRegionKey("p1")!;

      // Move far enough that no regions overlap
      index.updatePlayerPosition("p1", REGION_SIZE * 10, REGION_SIZE * 10);
      const newKey = index.getPlayerRegionKey("p1")!;

      const diff = index.getRegionSubscriptionDiff(oldKey, newKey);

      // No overlap at all
      expect(diff.subscribe).toHaveLength(9);
      expect(diff.unsubscribe).toHaveLength(9);
    });
  });

  describe("getRegionTopic", () => {
    it("returns consistent topic strings", () => {
      const topic1 = index.getRegionTopic(42);
      const topic2 = index.getRegionTopic(42);

      expect(topic1).toBe("region:42");
      expect(topic1).toBe(topic2); // Same reference (cached)
    });
  });

  describe("getAdjacentRegionKeys", () => {
    it("returns exactly 9 keys", () => {
      const keys = index.getAdjacentRegionKeys(100, 100);
      expect(keys).toHaveLength(9);
    });

    it("returns unique keys for non-boundary positions", () => {
      const keys = index.getAdjacentRegionKeys(100, 100);
      const unique = new Set(keys);
      expect(unique.size).toBe(9);
    });
  });
});
