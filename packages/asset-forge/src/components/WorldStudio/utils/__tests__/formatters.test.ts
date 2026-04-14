import { describe, it, expect } from "vitest";
import { fmtPos, fmtLevel, fmtLevelRange, fmtDistance } from "../formatters";

// ────────────────────────────────────────
// fmtPos
// ────────────────────────────────────────

describe("fmtPos", () => {
  it("formats integer coordinates", () => {
    expect(fmtPos(10, 20)).toBe("(10, 20)");
  });

  it("rounds floating-point coordinates", () => {
    expect(fmtPos(10.7, 20.3)).toBe("(11, 20)");
    expect(fmtPos(10.5, 20.5)).toBe("(11, 21)");
    expect(fmtPos(10.4, 20.1)).toBe("(10, 20)");
  });

  it("handles negative coordinates", () => {
    expect(fmtPos(-15, -30)).toBe("(-15, -30)");
    expect(fmtPos(-0.7, -0.3)).toBe("(-1, 0)");
  });

  it("handles zero coordinates", () => {
    expect(fmtPos(0, 0)).toBe("(0, 0)");
  });

  it("handles large numbers", () => {
    expect(fmtPos(99999, 100000)).toBe("(99999, 100000)");
    expect(fmtPos(-99999, -100000)).toBe("(-99999, -100000)");
  });

  it("handles mixed positive and negative", () => {
    expect(fmtPos(-5, 10)).toBe("(-5, 10)");
    expect(fmtPos(5, -10)).toBe("(5, -10)");
  });
});

// ────────────────────────────────────────
// fmtLevel
// ────────────────────────────────────────

describe("fmtLevel", () => {
  it("formats a positive level", () => {
    expect(fmtLevel(5)).toBe("Lv5");
  });

  it("formats level zero", () => {
    expect(fmtLevel(0)).toBe("Lv0");
  });

  it("formats a large level", () => {
    expect(fmtLevel(999)).toBe("Lv999");
  });

  it("formats a negative level", () => {
    expect(fmtLevel(-1)).toBe("Lv-1");
  });
});

// ────────────────────────────────────────
// fmtLevelRange
// ────────────────────────────────────────

describe("fmtLevelRange", () => {
  it("formats a level range", () => {
    expect(fmtLevelRange(1, 10)).toBe("Lv1-10");
  });

  it("formats same min and max", () => {
    expect(fmtLevelRange(5, 5)).toBe("Lv5-5");
  });

  it("formats zero-based range", () => {
    expect(fmtLevelRange(0, 3)).toBe("Lv0-3");
  });

  it("formats large range", () => {
    expect(fmtLevelRange(1, 999)).toBe("Lv1-999");
  });

  it("formats negative range values", () => {
    expect(fmtLevelRange(-5, -1)).toBe("Lv-5--1");
  });
});

// ────────────────────────────────────────
// fmtDistance
// ────────────────────────────────────────

describe("fmtDistance", () => {
  it("formats an integer distance", () => {
    expect(fmtDistance(100)).toBe("100m");
  });

  it("rounds a floating-point distance", () => {
    expect(fmtDistance(42.7)).toBe("43m");
    expect(fmtDistance(42.3)).toBe("42m");
    expect(fmtDistance(42.5)).toBe("43m");
  });

  it("formats zero distance", () => {
    expect(fmtDistance(0)).toBe("0m");
  });

  it("formats negative distance", () => {
    expect(fmtDistance(-10)).toBe("-10m");
    expect(fmtDistance(-0.4)).toBe("0m");
  });

  it("formats large distance", () => {
    expect(fmtDistance(50000)).toBe("50000m");
  });
});
