import { describe, it, expect } from "vitest";
import {
  createSeededRng,
  hashString,
  dist2,
  weightedSelect,
} from "@/components/WorldStudio/utils/procgenUtils";

// ────────────────────────────────────────
// createSeededRng
// ────────────────────────────────────────

describe("createSeededRng", () => {
  it("returns values in [0, 1)", () => {
    const rng = createSeededRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic — same seed produces same sequence", () => {
    const a = createSeededRng(12345);
    const b = createSeededRng(12345);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds produce different sequences", () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    // Collect first 10 values from each
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    // Extremely unlikely for two different seeds to produce the same sequence
    expect(seqA).not.toEqual(seqB);
  });

  it("does not repeat immediately", () => {
    const rng = createSeededRng(999);
    const first = rng();
    const second = rng();
    expect(first).not.toBe(second);
  });

  it("handles seed of 0", () => {
    const rng = createSeededRng(0);
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it("handles negative seeds", () => {
    const rng = createSeededRng(-42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ────────────────────────────────────────
// hashString
// ────────────────────────────────────────

describe("hashString", () => {
  it("returns same hash for same string", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
  });

  it("returns different hashes for different strings", () => {
    expect(hashString("hello")).not.toBe(hashString("world"));
  });

  it("returns 0 for empty string", () => {
    expect(hashString("")).toBe(0);
  });

  it("handles single character", () => {
    const h = hashString("a");
    expect(typeof h).toBe("number");
    expect(Number.isFinite(h)).toBe(true);
  });

  it("handles long strings without overflow to NaN", () => {
    const long = "a".repeat(10000);
    const h = hashString(long);
    expect(Number.isFinite(h)).toBe(true);
    expect(Number.isNaN(h)).toBe(false);
  });

  it("is sensitive to character order", () => {
    expect(hashString("ab")).not.toBe(hashString("ba"));
  });

  it("returns a 32-bit integer (result of |0)", () => {
    const h = hashString("test");
    expect(h).toBe(h | 0); // Stays the same after int32 coercion
  });
});

// ────────────────────────────────────────
// dist2
// ────────────────────────────────────────

describe("dist2", () => {
  it("returns 0 for identical points", () => {
    expect(dist2(5, 10, 5, 10)).toBe(0);
  });

  it("returns squared Euclidean distance", () => {
    // (3, 0) to (0, 4) → d² = 9 + 16 = 25
    expect(dist2(3, 0, 0, 4)).toBe(25);
  });

  it("is symmetric", () => {
    expect(dist2(1, 2, 3, 4)).toBe(dist2(3, 4, 1, 2));
  });

  it("handles negative coordinates", () => {
    expect(dist2(-1, -1, 1, 1)).toBe(8);
  });

  it("returns correct value for unit distance", () => {
    expect(dist2(0, 0, 1, 0)).toBe(1);
    expect(dist2(0, 0, 0, 1)).toBe(1);
  });
});

// ────────────────────────────────────────
// weightedSelect
// ────────────────────────────────────────

describe("weightedSelect", () => {
  it("returns null for empty array", () => {
    const rng = createSeededRng(1);
    expect(weightedSelect([], rng)).toBeNull();
  });

  it("returns the only item when array has one element", () => {
    const rng = createSeededRng(1);
    const item = { id: "only", weight: 5 };
    expect(weightedSelect([item], rng)).toBe(item);
  });

  it("returns first item when all weights are zero", () => {
    const rng = createSeededRng(1);
    const items = [
      { id: "a", weight: 0 },
      { id: "b", weight: 0 },
    ];
    expect(weightedSelect(items, rng)).toBe(items[0]);
  });

  it("selects items proportionally to weight over many trials", () => {
    const rng = createSeededRng(42);
    const items = [
      { id: "heavy", weight: 90 },
      { id: "light", weight: 10 },
    ];

    const counts: Record<string, number> = { heavy: 0, light: 0 };
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      const selected = weightedSelect(items, rng);
      if (selected) counts[selected.id]++;
    }

    // "heavy" should be selected roughly 90% of the time
    const heavyRatio = counts.heavy / trials;
    expect(heavyRatio).toBeGreaterThan(0.85);
    expect(heavyRatio).toBeLessThan(0.95);
  });

  it("always returns a valid item, never undefined", () => {
    const rng = createSeededRng(123);
    const items = [
      { id: "a", weight: 1 },
      { id: "b", weight: 1 },
      { id: "c", weight: 1 },
    ];
    for (let i = 0; i < 100; i++) {
      const result = weightedSelect(items, rng);
      expect(result).not.toBeNull();
      expect(items).toContain(result);
    }
  });

  it("handles items with very different weights", () => {
    const rng = createSeededRng(7);
    const items = [
      { id: "rare", weight: 0.001 },
      { id: "common", weight: 999.999 },
    ];

    const counts: Record<string, number> = { rare: 0, common: 0 };
    for (let i = 0; i < 1000; i++) {
      const selected = weightedSelect(items, rng);
      if (selected) counts[selected.id]++;
    }

    // "common" should dominate
    expect(counts.common).toBeGreaterThan(990);
  });
});
