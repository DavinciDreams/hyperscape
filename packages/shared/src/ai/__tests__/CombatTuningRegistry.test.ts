import {
  CombatTuningManifestSchema,
  type CombatTuningManifest,
  type CombatTuningProfile,
} from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  CombatTuningRegistry,
  UnknownCombatTuningProfileError,
  profileToResolvedTuning,
} from "../CombatTuningRegistry.js";

/**
 * Canonical two-profile fixture: mirrors the legacy `DuelCombatConfig`
 * defaults for `standard` and a lightly-tweaked `tournament` variant
 * so cross-profile resolution paths can be exercised.
 */
function makeFixture(): CombatTuningManifest {
  const raw = [
    {
      id: "standard",
      name: "Standard Duel",
      description: "Default duel tuning",
      tickMs: 600,
      hpThresholdsPct: { heal: 40, aggressive: 70, defensive: 30 },
      engagementRanges: {
        melee: { min: 0.8, max: 1.8 },
        ranged: { min: 5, max: 8 },
        mage: { min: 5, max: 8 },
      },
      offensivePrayers: {
        melee: "superhuman_strength",
        ranged: "hawk_eye",
        mage: "mystic_lore",
      },
      defensivePrayer: "rock_skin",
      movement: { moveCooldownMs: 1200, strafeStep: 1.35 },
      noFood: false,
      useLlmTactics: false,
    },
    {
      id: "tournament",
      name: "Tournament (no food)",
      description: "Competitive no-food variant",
      tickMs: 500,
      hpThresholdsPct: { heal: 50, aggressive: 80, defensive: 25 },
      engagementRanges: {
        melee: { min: 0.8, max: 1.6 },
        ranged: { min: 6, max: 9 },
        mage: { min: 6, max: 9 },
      },
      offensivePrayers: {
        melee: "ultimate_strength",
        ranged: "eagle_eye",
        mage: "augury",
      },
      defensivePrayer: "steel_skin",
      movement: { moveCooldownMs: 900, strafeStep: 1.5 },
      noFood: true,
      useLlmTactics: true,
    },
  ];
  return CombatTuningManifestSchema.parse(raw);
}

describe("profileToResolvedTuning", () => {
  it("collapses per-role fields to the agent's active role (melee)", () => {
    const [standard] = makeFixture();
    const resolved = profileToResolvedTuning(standard, "melee");
    expect(resolved).toEqual({
      tickMs: 600,
      combatRole: "melee",
      healThresholdPct: 40,
      aggressiveThresholdPct: 70,
      defensiveThresholdPct: 30,
      offensivePrayerId: "superhuman_strength",
      defensivePrayerId: "rock_skin",
      engagementRange: { min: 0.8, max: 1.8 },
      moveCooldownMs: 1200,
      strafeStep: 1.35,
      noFood: false,
      useLlmTactics: false,
    });
  });

  it("picks the ranged engagement range + prayer when role = ranged", () => {
    const [standard] = makeFixture();
    const resolved = profileToResolvedTuning(standard, "ranged");
    expect(resolved.combatRole).toBe("ranged");
    expect(resolved.engagementRange).toEqual({ min: 5, max: 8 });
    expect(resolved.offensivePrayerId).toBe("hawk_eye");
  });

  it("picks the mage engagement range + prayer when role = mage", () => {
    const [standard] = makeFixture();
    const resolved = profileToResolvedTuning(standard, "mage");
    expect(resolved.combatRole).toBe("mage");
    expect(resolved.engagementRange).toEqual({ min: 5, max: 8 });
    expect(resolved.offensivePrayerId).toBe("mystic_lore");
  });
});

describe("CombatTuningRegistry", () => {
  it("empty registry: size 0, no ids, has() false", () => {
    const reg = new CombatTuningRegistry();
    expect(reg.size).toBe(0);
    expect(reg.profileIds).toEqual([]);
    expect(reg.has("standard")).toBe(false);
    expect(reg.get("standard")).toBeUndefined();
  });

  it("constructor accepts a pre-validated manifest", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    expect(reg.size).toBe(2);
    expect(reg.profileIds).toEqual(["standard", "tournament"]);
    expect(reg.has("standard")).toBe(true);
    expect(reg.has("tournament")).toBe(true);
  });

  it("load() replaces contents (not merge)", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    expect(reg.size).toBe(2);

    const [standard] = makeFixture();
    const replacement: CombatTuningProfile[] = [
      { ...standard, id: "only-one" },
    ];
    reg.load(CombatTuningManifestSchema.parse(replacement));
    expect(reg.size).toBe(1);
    expect(reg.has("standard")).toBe(false);
    expect(reg.has("only-one")).toBe(true);
  });

  it("loadFromJson() validates via Zod", () => {
    const reg = new CombatTuningRegistry();
    const raw = makeFixture();
    reg.loadFromJson(raw);
    expect(reg.size).toBe(2);
  });

  it("loadFromJson() throws on malformed input", () => {
    const reg = new CombatTuningRegistry();
    expect(() => reg.loadFromJson([{ id: "bad" }])).toThrow();
    // Registry should remain empty — parse failed before load().
    expect(reg.size).toBe(0);
  });

  it("get() returns the raw profile (not collapsed)", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const standard = reg.get("standard");
    expect(standard).toBeDefined();
    expect(standard?.engagementRanges.ranged).toEqual({ min: 5, max: 8 });
    expect(standard?.offensivePrayers.mage).toBe("mystic_lore");
  });

  it("resolve() returns collapsed tuning for the given role", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const melee = reg.resolve("standard", "melee");
    expect(melee.engagementRange).toEqual({ min: 0.8, max: 1.8 });
    expect(melee.offensivePrayerId).toBe("superhuman_strength");

    const ranged = reg.resolve("standard", "ranged");
    expect(ranged.engagementRange).toEqual({ min: 5, max: 8 });
    expect(ranged.offensivePrayerId).toBe("hawk_eye");
  });

  it("resolve() throws UnknownCombatTuningProfileError on miss", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    let caught: unknown;
    try {
      reg.resolve("ghost", "melee");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnknownCombatTuningProfileError);
    const err = caught as UnknownCombatTuningProfileError;
    expect(err.profileId).toBe("ghost");
    expect(err.availableIds).toEqual(["standard", "tournament"]);
    expect(err.message).toContain("ghost");
    expect(err.message).toContain("standard");
    expect(err.message).toContain("tournament");
  });

  it("UnknownCombatTuningProfileError surfaces '(none loaded)' when registry is empty", () => {
    const reg = new CombatTuningRegistry();
    try {
      reg.resolve("standard", "melee");
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownCombatTuningProfileError);
      expect((err as Error).message).toContain("(none loaded)");
    }
  });

  it("resolveWithFallback() returns the primary when it exists", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const tuning = reg.resolveWithFallback("standard", "tournament", "melee");
    expect(tuning.tickMs).toBe(600); // from standard, not tournament (500)
    expect(tuning.noFood).toBe(false);
  });

  it("resolveWithFallback() falls through when the primary is missing", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const tuning = reg.resolveWithFallback("ghost", "tournament", "mage");
    expect(tuning.tickMs).toBe(500); // from tournament
    expect(tuning.noFood).toBe(true);
    expect(tuning.engagementRange).toEqual({ min: 6, max: 9 });
    expect(tuning.offensivePrayerId).toBe("augury");
  });

  it("resolveWithFallback() throws when both primary and fallback are missing", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    expect(() => reg.resolveWithFallback("ghost", "phantom", "melee")).toThrow(
      UnknownCombatTuningProfileError,
    );
  });

  it("tournament fixture round-trips through resolve() correctly", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const resolved = reg.resolve("tournament", "mage");
    expect(resolved).toEqual({
      tickMs: 500,
      combatRole: "mage",
      healThresholdPct: 50,
      aggressiveThresholdPct: 80,
      defensiveThresholdPct: 25,
      offensivePrayerId: "augury",
      defensivePrayerId: "steel_skin",
      engagementRange: { min: 6, max: 9 },
      moveCooldownMs: 900,
      strafeStep: 1.5,
      noFood: true,
      useLlmTactics: true,
    });
  });
});

describe("CombatTuningRegistry — helpers (merged from combat-tuning/)", () => {
  it("require(id) throws UnknownCombatTuningProfileError on miss", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    expect(() => reg.require("ghost")).toThrow(UnknownCombatTuningProfileError);
  });

  it("require(id) returns the profile on hit", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    expect(reg.require("standard").name).toBe("Standard Duel");
  });

  it("engagementRangeFor returns the per-role window", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const p = reg.require("standard");
    expect(reg.engagementRangeFor(p, "melee")).toEqual({ min: 0.8, max: 1.8 });
    expect(reg.engagementRangeFor(p, "ranged")).toEqual({ min: 5, max: 8 });
    expect(reg.engagementRangeFor(p, "mage")).toEqual({ min: 5, max: 8 });
  });

  it("offensivePrayerFor returns the per-role prayer id", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const p = reg.require("standard");
    expect(reg.offensivePrayerFor(p, "melee")).toBe("superhuman_strength");
    expect(reg.offensivePrayerFor(p, "ranged")).toBe("hawk_eye");
    expect(reg.offensivePrayerFor(p, "mage")).toBe("mystic_lore");
  });
});

describe("CombatTuningRegistry — classifyHpPhase", () => {
  it("returns desperate when own HP below defensive threshold", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const p = reg.require("standard");
    expect(reg.classifyHpPhase(p, 20, 80)).toBe("desperate");
  });

  it("returns finishing when opponent HP below 25% (and own OK)", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const p = reg.require("standard");
    expect(reg.classifyHpPhase(p, 80, 20)).toBe("finishing");
  });

  it("returns trading otherwise", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const p = reg.require("standard");
    expect(reg.classifyHpPhase(p, 60, 60)).toBe("trading");
  });

  it("desperate beats finishing when both apply", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const p = reg.require("standard");
    // own 20 < defensive 30, opp 10 < 25 → desperate wins
    expect(reg.classifyHpPhase(p, 20, 10)).toBe("desperate");
  });

  it("rejects out-of-range HP percent", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const p = reg.require("standard");
    expect(() => reg.classifyHpPhase(p, 101, 50)).toThrow(TypeError);
    expect(() => reg.classifyHpPhase(p, -1, 50)).toThrow(TypeError);
    expect(() => reg.classifyHpPhase(p, Number.NaN, 50)).toThrow(TypeError);
  });
});

describe("CombatTuningRegistry — shouldHeal", () => {
  it("heals below the profile's heal threshold", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const p = reg.require("standard");
    expect(reg.shouldHeal(p, 39)).toBe(true);
    expect(reg.shouldHeal(p, 40)).toBe(false);
  });

  it("noFood profile never heals", () => {
    const reg = new CombatTuningRegistry(makeFixture());
    const p = reg.require("tournament"); // noFood: true in fixture
    expect(reg.shouldHeal(p, 10)).toBe(false);
    expect(reg.shouldHeal(p, 49)).toBe(false);
  });
});

describe("CombatTuningRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new CombatTuningRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(makeFixture());
    r.load(makeFixture());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new CombatTuningRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(makeFixture());
    off();
    r.load(makeFixture());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new CombatTuningRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(makeFixture());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
