import { RespawnManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  RespawnPolicyResolver,
  UnknownBindPointError,
} from "../RespawnPolicyResolver.js";

function manifest(overrides: Record<string, unknown> = {}) {
  return RespawnManifestSchema.parse({
    enabled: true,
    bindPoints: [
      {
        id: "stormwindGy",
        name: "Stormwind Graveyard",
        kind: "graveyard",
        zoneId: "stormwind",
        position: { x: 0, y: 0, z: 0 },
        allowBindHere: false,
      },
      {
        id: "stormwindInn",
        name: "Stormwind Inn",
        kind: "innkeeper",
        zoneId: "stormwind",
        position: { x: 10, y: 0, z: 0 },
        allowBindHere: true,
        minCharacterLevel: 0,
      },
      {
        id: "darnassus",
        name: "Darnassus Capital",
        kind: "capitalSpawn",
        zoneId: "teldrassil",
        position: { x: 100, y: 0, z: 0 },
        allowBindHere: true,
        minCharacterLevel: 20,
        factionAllowList: ["alliance"],
      },
      {
        id: "guildHall",
        name: "Guild Hall Hearth",
        kind: "custom",
        customKey: "guildHall",
        zoneId: "guildWard",
        position: { x: 50, y: 0, z: 0 },
        allowBindHere: true,
      },
    ],
    deathPenalty: {
      xpLossFractionOfLevel: 0.25,
      xpLossCanDelevel: true,
      goldLossFraction: 0.5,
      goldLossMaxCurrency: 10000,
      durabilityLossFraction: 0.1,
      dropItemsOnDeath: true,
      dropPolicy: "lowestValueFirst",
      maxItemsDropped: 3,
      dropGraceSec: 30,
    },
    corpseRun: {
      enabled: true,
      ghostSpeedMultiplier: 1.5,
    },
    resurrection: {
      sicknessMinutes: 10,
      sicknessStatReductionFraction: 0.75,
      sicknessMinCharacterLevel: 10,
      allowInstantResByAbility: true,
      autoResAtBindAfterSec: 30,
    },
    ...overrides,
  });
}

describe("RespawnPolicyResolver — lookup", () => {
  it("indexes bind points by id", () => {
    const r = new RespawnPolicyResolver(manifest());
    expect(r.size).toBe(4);
    expect(r.has("stormwindInn")).toBe(true);
    expect(r.get("stormwindInn").kind).toBe("innkeeper");
  });

  it("get throws UnknownBindPointError on miss", () => {
    const r = new RespawnPolicyResolver(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownBindPointError);
  });

  it("isEnabled mirrors manifest", () => {
    const r = new RespawnPolicyResolver(manifest());
    expect(r.isEnabled).toBe(true);
  });

  it("loadFromJson validates", () => {
    const r = new RespawnPolicyResolver();
    r.loadFromJson({
      enabled: true,
      bindPoints: [
        {
          id: "a",
          name: "A",
          kind: "innkeeper",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
          allowBindHere: true,
        },
      ],
    });
    expect(r.size).toBe(1);
  });
});

describe("RespawnPolicyResolver — selectableBindPointsFor", () => {
  it("excludes allowBindHere=false", () => {
    const r = new RespawnPolicyResolver(manifest());
    const out = r.selectableBindPointsFor({ characterLevel: 30 });
    expect(out.map((b) => b.id)).not.toContain("stormwindGy");
  });

  it("gates by minCharacterLevel", () => {
    const r = new RespawnPolicyResolver(manifest());
    const low = r.selectableBindPointsFor({
      characterLevel: 10,
      factionId: "alliance",
    });
    expect(low.map((b) => b.id)).not.toContain("darnassus");
    const high = r.selectableBindPointsFor({
      characterLevel: 50,
      factionId: "alliance",
    });
    expect(high.map((b) => b.id)).toContain("darnassus");
  });

  it("gates by factionAllowList", () => {
    const r = new RespawnPolicyResolver(manifest());
    const horde = r.selectableBindPointsFor({
      characterLevel: 50,
      factionId: "horde",
    });
    expect(horde.map((b) => b.id)).not.toContain("darnassus");
  });
});

describe("RespawnPolicyResolver — selectDefaultBindPoint", () => {
  it("returns innkeeper when no housing present", () => {
    const r = new RespawnPolicyResolver(manifest());
    const b = r.selectDefaultBindPoint({ characterLevel: 10 });
    expect(b?.id).toBe("stormwindInn");
  });

  it("returns null when enabled=false", () => {
    const r = new RespawnPolicyResolver(manifest({ enabled: false }));
    expect(r.selectDefaultBindPoint({ characterLevel: 10 })).toBeNull();
  });
});

describe("RespawnPolicyResolver — resolveDeathOutcome", () => {
  it("computes xp/gold/durability loss + item drops", () => {
    const r = new RespawnPolicyResolver(manifest());
    const out = r.resolveDeathOutcome(
      { characterLevel: 30, xpIntoLevelFraction: 0.5 },
      5000,
      20,
    );
    expect(out.xpLost).toBeCloseTo(0.25);
    expect(out.goldLost).toBe(2500);
    expect(out.durabilityLossFraction).toBeCloseTo(0.1);
    expect(out.itemsDroppedCount).toBe(3);
    expect(out.dropPolicy).toBe("lowestValueFirst");
  });

  it("caps gold loss at goldLossMaxCurrency", () => {
    const r = new RespawnPolicyResolver(manifest());
    const out = r.resolveDeathOutcome({ characterLevel: 30 }, 100_000, 0);
    expect(out.goldLost).toBe(10000);
  });

  it("levelDropped=true when xp loss > xp into level and delevel allowed", () => {
    const r = new RespawnPolicyResolver(manifest());
    const out = r.resolveDeathOutcome(
      { characterLevel: 30, xpIntoLevelFraction: 0.1 },
      0,
      0,
    );
    expect(out.levelDropped).toBe(true);
  });

  it("levelDropped=false when delevel disabled", () => {
    const m = manifest();
    m.deathPenalty.xpLossCanDelevel = false;
    const r = new RespawnPolicyResolver(m);
    const out = r.resolveDeathOutcome(
      { characterLevel: 30, xpIntoLevelFraction: 0.0 },
      0,
      0,
    );
    expect(out.levelDropped).toBe(false);
  });

  it("item drop count is 0 when dropItemsOnDeath=false", () => {
    const m = manifest();
    m.deathPenalty.dropItemsOnDeath = false;
    m.deathPenalty.dropPolicy = "none";
    m.deathPenalty.maxItemsDropped = 0;
    const r = new RespawnPolicyResolver(m);
    const out = r.resolveDeathOutcome({ characterLevel: 10 }, 100, 5);
    expect(out.itemsDroppedCount).toBe(0);
  });

  it("rejects negative carriedGold", () => {
    const r = new RespawnPolicyResolver(manifest());
    expect(() => r.resolveDeathOutcome({ characterLevel: 10 }, -1, 0)).toThrow(
      TypeError,
    );
  });
});

describe("RespawnPolicyResolver — resolveResurrectionOutcome", () => {
  it("applies sickness when level >= floor and bind point enables it", () => {
    const r = new RespawnPolicyResolver(manifest());
    const bind = r.get("stormwindInn");
    const out = r.resolveResurrectionOutcome({ characterLevel: 30 }, bind);
    expect(out.appliesSickness).toBe(true);
    expect(out.sicknessMinutes).toBe(10);
  });

  it("skips sickness below floor level", () => {
    const r = new RespawnPolicyResolver(manifest());
    const bind = r.get("stormwindInn");
    const out = r.resolveResurrectionOutcome({ characterLevel: 5 }, bind);
    expect(out.appliesSickness).toBe(false);
  });

  it("abilityInstant skips sickness when allowed", () => {
    const r = new RespawnPolicyResolver(manifest());
    const out = r.resolveResurrectionOutcome(
      { characterLevel: 50 },
      "abilityInstant",
    );
    expect(out.appliesSickness).toBe(false);
  });

  it("bind point with applyResurrectionSickness=false skips sickness", () => {
    const m = manifest();
    m.bindPoints[1].applyResurrectionSickness = false;
    const r = new RespawnPolicyResolver(m);
    const out = r.resolveResurrectionOutcome(
      { characterLevel: 50 },
      r.get("stormwindInn"),
    );
    expect(out.appliesSickness).toBe(false);
  });
});
