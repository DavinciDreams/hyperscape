import { PrayersManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  PrayersNotLoadedError,
  PrayersRegistry,
  UnknownPrayerError,
} from "../PrayersRegistry.js";

function manifest() {
  return PrayersManifestSchema.parse({
    prayers: [
      {
        id: "thick_skin",
        name: "Thick Skin",
        description: "+5% defense",
        icon: "💪",
        level: 1,
        category: "defensive",
        drainEffect: 2,
        bonuses: { defenseMultiplier: 1.05 },
        conflicts: ["rock_skin", "steel_skin"],
      },
      {
        id: "rock_skin",
        name: "Rock Skin",
        description: "+10% defense",
        icon: "🪨",
        level: 10,
        category: "defensive",
        drainEffect: 6,
        bonuses: { defenseMultiplier: 1.1 },
        conflicts: ["thick_skin", "steel_skin"],
      },
      {
        id: "steel_skin",
        name: "Steel Skin",
        description: "+15% defense",
        icon: "🛡",
        level: 30,
        category: "defensive",
        drainEffect: 12,
        bonuses: { defenseMultiplier: 1.15 },
        conflicts: ["thick_skin", "rock_skin"],
      },
      {
        id: "burst_of_strength",
        name: "Burst of Strength",
        description: "+5% strength",
        icon: "⚔",
        level: 4,
        category: "offensive",
        drainEffect: 2,
        bonuses: { strengthMultiplier: 1.05 },
        conflicts: [],
      },
    ],
  });
}

describe("PrayersRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new PrayersRegistry().manifest).toThrow(PrayersNotLoadedError);
  });
});

describe("PrayersRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new PrayersRegistry(manifest());
    expect(r.has("thick_skin")).toBe(true);
    expect(r.get("rock_skin").level).toBe(10);
  });

  it("throws on unknown", () => {
    const r = new PrayersRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownPrayerError);
  });

  it("filters by category", () => {
    const r = new PrayersRegistry(manifest());
    expect(r.byCategory("offensive").map((p) => p.id)).toEqual([
      "burst_of_strength",
    ]);
    expect(r.byCategory("defensive").length).toBe(3);
  });
});

describe("PrayersRegistry — gates", () => {
  it("level gate", () => {
    const r = new PrayersRegistry(manifest());
    expect(r.canActivate("rock_skin", 9)).toBe(false);
    expect(r.canActivate("rock_skin", 10)).toBe(true);
  });
});

describe("PrayersRegistry — conflicts", () => {
  it("returns conflict list", () => {
    const r = new PrayersRegistry(manifest());
    expect(r.conflictsFor("thick_skin").sort()).toEqual([
      "rock_skin",
      "steel_skin",
    ]);
  });

  it("applyActivation removes conflicts and adds self", () => {
    const r = new PrayersRegistry(manifest());
    const next = r.applyActivation(
      "steel_skin",
      new Set(["thick_skin", "burst_of_strength"]),
    );
    expect(next.has("thick_skin")).toBe(false);
    expect(next.has("burst_of_strength")).toBe(true);
    expect(next.has("steel_skin")).toBe(true);
  });

  it("applyActivation of non-conflicting keeps others", () => {
    const r = new PrayersRegistry(manifest());
    const next = r.applyActivation(
      "burst_of_strength",
      new Set(["thick_skin"]),
    );
    expect(next.has("thick_skin")).toBe(true);
    expect(next.has("burst_of_strength")).toBe(true);
  });
});

describe("PrayersRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new PrayersRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new PrayersRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new PrayersRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
