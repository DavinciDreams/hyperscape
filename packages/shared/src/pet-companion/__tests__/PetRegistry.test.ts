import { PetCompanionManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PetRegistry, UnknownPetError } from "../PetRegistry.js";

function manifest() {
  return PetCompanionManifestSchema.parse([
    {
      id: "warWolf",
      name: "War Wolf",
      category: "combat",
      stats: {
        maxHealth: 100,
        baseAttack: 10,
        baseDefense: 5,
        moveSpeed: 6,
        ownerStatScaling: 0.5,
      },
      abilities: [
        { id: "pounce", priority: 70, cooldownSec: 12 },
        { id: "howl", priority: 30, cooldownSec: 30 },
        { id: "bite", priority: 90, cooldownSec: 4 },
      ],
      summonRules: {
        allowInCombat: true,
        allowInSafeZones: true,
        allowWhileMounted: false,
        summonCooldownSec: 10,
        maxActive: 1,
      },
      progression: {
        enabled: true,
        maxLevel: 10,
        xpPerLevel: 100,
        statGrowthPerLevel: 0.1,
      },
    },
    {
      id: "minionHorde",
      name: "Minion",
      category: "combat",
      abilities: [],
      summonRules: {
        maxActive: 5,
        summonCooldownSec: 1,
      },
    },
    {
      id: "sparkle",
      name: "Sparkle",
      category: "cosmetic",
      abilities: [],
    },
  ]);
}

describe("PetRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new PetRegistry(manifest());
    expect(r.size).toBe(3);
    expect(r.has("warWolf")).toBe(true);
  });

  it("throws on miss", () => {
    const r = new PetRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownPetError);
  });

  it("filters by category", () => {
    const r = new PetRegistry(manifest());
    expect(r.byCategory("cosmetic").map((p) => p.id)).toEqual(["sparkle"]);
  });
});

describe("PetRegistry — canSummon", () => {
  const baseCtx = {
    inCombat: false,
    inSafeZone: false,
    mounted: false,
    currentActiveCount: 0,
    secondsSinceLastSummon: 1000,
  };

  it("allows valid summon", () => {
    const r = new PetRegistry(manifest());
    expect(r.canSummon("warWolf", baseCtx).allowed).toBe(true);
  });

  it("blocks when mounted", () => {
    const r = new PetRegistry(manifest());
    const out = r.canSummon("warWolf", { ...baseCtx, mounted: true });
    expect(out.reason).toBe("mounted-forbidden");
  });

  it("blocks when max active reached", () => {
    const r = new PetRegistry(manifest());
    const out = r.canSummon("warWolf", { ...baseCtx, currentActiveCount: 1 });
    expect(out.reason).toBe("max-active");
  });

  it("allows multiple minions", () => {
    const r = new PetRegistry(manifest());
    const out = r.canSummon("minionHorde", {
      ...baseCtx,
      currentActiveCount: 4,
    });
    expect(out.allowed).toBe(true);
  });

  it("blocks on cooldown", () => {
    const r = new PetRegistry(manifest());
    const out = r.canSummon("warWolf", {
      ...baseCtx,
      secondsSinceLastSummon: 1,
    });
    expect(out.reason).toBe("cooldown");
  });
});

describe("PetRegistry — effectiveStats", () => {
  it("level 1 = no growth multiplier", () => {
    const r = new PetRegistry(manifest());
    const s = r.effectiveStats("warWolf", {
      level: 1,
      ownerAttack: 100,
      ownerDefense: 50,
    });
    expect(s.maxHealth).toBe(100);
    expect(s.attack).toBe(60); // 10 + 100*0.5
    expect(s.defense).toBe(30); // 5 + 50*0.5
  });

  it("level 5 applies growth to base stats only", () => {
    const r = new PetRegistry(manifest());
    const s = r.effectiveStats("warWolf", {
      level: 5,
      ownerAttack: 100,
      ownerDefense: 50,
    });
    // growthMul = 1 + 0.1*(5-1) = 1.4
    expect(s.maxHealth).toBe(140);
    expect(s.attack).toBe(Math.round(10 * 1.4 + 100 * 0.5));
    expect(s.defense).toBe(Math.round(5 * 1.4 + 50 * 0.5));
  });

  it("progression disabled = level 0 math", () => {
    const r = new PetRegistry(manifest());
    const s = r.effectiveStats("minionHorde", {
      level: 99,
      ownerAttack: 0,
      ownerDefense: 0,
    });
    expect(s.maxHealth).toBe(10); // default base
  });
});

describe("PetRegistry — resolveLevel", () => {
  it("total xp 0 = level 1", () => {
    const r = new PetRegistry(manifest());
    const l = r.resolveLevel("warWolf", 0);
    expect(l.level).toBe(1);
    expect(l.xpIntoNext).toBe(0);
    expect(l.xpForNext).toBe(100);
  });

  it("crosses level boundary", () => {
    const r = new PetRegistry(manifest());
    const l = r.resolveLevel("warWolf", 250);
    expect(l.level).toBe(3);
    expect(l.xpIntoNext).toBe(50);
  });

  it("caps at maxLevel", () => {
    const r = new PetRegistry(manifest());
    const l = r.resolveLevel("warWolf", 99_999);
    expect(l.level).toBe(10);
    expect(l.xpIntoNext).toBe(0);
  });

  it("disabled progression returns level 0", () => {
    const r = new PetRegistry(manifest());
    const l = r.resolveLevel("sparkle", 500);
    expect(l.level).toBe(0);
  });
});

describe("PetRegistry — prioritizedAbilities", () => {
  it("sorts descending by priority", () => {
    const r = new PetRegistry(manifest());
    const ids = r.prioritizedAbilities("warWolf").map((a) => a.id);
    expect(ids).toEqual(["bite", "pounce", "howl"]);
  });

  it("cosmetic pets return empty", () => {
    const r = new PetRegistry(manifest());
    expect(r.prioritizedAbilities("sparkle")).toEqual([]);
  });
});
