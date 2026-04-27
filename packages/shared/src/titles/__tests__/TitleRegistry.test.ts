import { TitlesManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  formatByMode,
  TitleRegistry,
  UnknownTitleError,
} from "../TitleRegistry.js";

function manifest() {
  return TitlesManifestSchema.parse([
    {
      id: "dragonSlayer",
      name: "Dragon Slayer",
      displayKey: "titles.dragonSlayer",
      displayMode: "prefix",
      rarity: "epic",
      unlockConditions: [
        { kind: "achievement", achievementId: "ach_dragon_slain" },
        { kind: "bossKillCount", npcId: "ancientDragon", requiredKills: 10 },
      ],
    },
    {
      id: "grandmasterChef",
      name: "Grandmaster Chef",
      displayKey: "titles.chef",
      displayMode: "suffix",
      rarity: "legendary",
      unlockConditions: [
        { kind: "skillLevel", skillId: "cooking", requiredLevel: 99 },
      ],
    },
    {
      id: "seasonalChampion",
      name: "Season Champion",
      displayKey: "titles.seasonChamp",
      displayMode: "replace",
      rarity: "mythic",
      unlockConditions: [
        {
          kind: "leaderboardBracket",
          leaderboardId: "pvpSeason1",
          bracketId: "top1",
        },
      ],
      revocation: {
        revokeOnCadenceRollover: true,
        expireAfterDays: 90,
        revocableByGm: true,
      },
    },
    {
      id: "gmSpecial",
      name: "GM Special",
      displayKey: "titles.gmSpecial",
      displayMode: "suffix",
      rarity: "legendary",
      unlockConditions: [{ kind: "manual" }],
    },
    {
      id: "purchasedVip",
      name: "VIP",
      displayKey: "titles.vip",
      displayMode: "prefix",
      rarity: "rare",
      unlockConditions: [{ kind: "purchase", cost: 1000, currencyId: "gold" }],
    },
  ]);
}

describe("TitleRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new TitleRegistry(manifest());
    expect(r.size).toBe(5);
    expect(r.has("dragonSlayer")).toBe(true);
  });

  it("throws UnknownTitleError on miss", () => {
    const r = new TitleRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownTitleError);
  });
});

describe("TitleRegistry — unlocks", () => {
  it("achievement condition", () => {
    const r = new TitleRegistry(manifest());
    const e = r.evaluateUnlock("dragonSlayer", {
      completedAchievementIds: new Set(["ach_dragon_slain"]),
    });
    expect(e.unlocked).toBe(true);
    expect(e.matchedConditionKind).toBe("achievement");
  });

  it("falls through to bossKillCount when achievement missing", () => {
    const r = new TitleRegistry(manifest());
    const e = r.evaluateUnlock("dragonSlayer", {
      bossKills: new Map([["ancientDragon", 15]]),
    });
    expect(e.unlocked).toBe(true);
    expect(e.matchedConditionKind).toBe("bossKillCount");
  });

  it("not unlocked when none match", () => {
    const r = new TitleRegistry(manifest());
    const e = r.evaluateUnlock("dragonSlayer", {
      bossKills: new Map([["ancientDragon", 1]]),
    });
    expect(e.unlocked).toBe(false);
  });

  it("skillLevel condition respects threshold", () => {
    const r = new TitleRegistry(manifest());
    expect(
      r.evaluateUnlock("grandmasterChef", {
        skillLevels: new Map([["cooking", 50]]),
      }).unlocked,
    ).toBe(false);
    expect(
      r.evaluateUnlock("grandmasterChef", {
        skillLevels: new Map([["cooking", 99]]),
      }).unlocked,
    ).toBe(true);
  });

  it("leaderboardBracket uses composite key", () => {
    const r = new TitleRegistry(manifest());
    expect(
      r.evaluateUnlock("seasonalChampion", {
        leaderboardBracketAwards: new Set(["pvpSeason1|top1"]),
      }).unlocked,
    ).toBe(true);
    expect(
      r.evaluateUnlock("seasonalChampion", {
        leaderboardBracketAwards: new Set(["pvpSeason1|top10"]),
      }).unlocked,
    ).toBe(false);
  });

  it("manual unlocks require explicit grant", () => {
    const r = new TitleRegistry(manifest());
    expect(r.evaluateUnlock("gmSpecial", {}).unlocked).toBe(false);
    expect(
      r.evaluateUnlock("gmSpecial", {
        manualGrants: new Set(["gmSpecial"]),
      }).unlocked,
    ).toBe(true);
  });

  it("purchase qualifies when affordable", () => {
    const r = new TitleRegistry(manifest());
    expect(
      r.evaluateUnlock("purchasedVip", {
        currencyBalances: new Map([["gold", 500]]),
      }).unlocked,
    ).toBe(false);
    expect(
      r.evaluateUnlock("purchasedVip", {
        currencyBalances: new Map([["gold", 5000]]),
      }).unlocked,
    ).toBe(true);
  });

  it("qualifiedTitles returns all currently unlocked", () => {
    const r = new TitleRegistry(manifest());
    const out = r.qualifiedTitles({
      skillLevels: new Map([["cooking", 99]]),
      completedAchievementIds: new Set(["ach_dragon_slain"]),
    });
    expect(out).toContain("dragonSlayer");
    expect(out).toContain("grandmasterChef");
    expect(out).not.toContain("seasonalChampion");
  });
});

describe("TitleRegistry — display", () => {
  it("prefix/suffix/replace format correctly", () => {
    expect(formatByMode("prefix", "Alice", "Champion")).toBe("Champion Alice");
    expect(formatByMode("suffix", "Alice", "the Valiant")).toBe(
      "Alice the Valiant",
    );
    expect(formatByMode("replace", "Alice", "Chosen One")).toBe("Chosen One");
  });

  it("formatNameplate uses registered mode", () => {
    const r = new TitleRegistry(manifest());
    expect(r.formatNameplate("dragonSlayer", "Alice", "Dragonslayer")).toBe(
      "Dragonslayer Alice",
    );
    expect(r.formatNameplate("grandmasterChef", "Alice", "the Chef")).toBe(
      "Alice the Chef",
    );
  });
});

describe("TitleRegistry — expiry", () => {
  it("isExpired false when expireAfterDays=0", () => {
    const r = new TitleRegistry(manifest());
    // dragonSlayer has default revocation (expireAfterDays=0)
    expect(r.isExpired("dragonSlayer", 0, 1e14)).toBe(false);
  });

  it("isExpired true after configured duration", () => {
    const r = new TitleRegistry(manifest());
    const grant = 0;
    const dayMs = 24 * 60 * 60 * 1000;
    expect(r.isExpired("seasonalChampion", grant, 89 * dayMs)).toBe(false);
    expect(r.isExpired("seasonalChampion", grant, 90 * dayMs)).toBe(true);
    expect(r.isExpired("seasonalChampion", grant, 91 * dayMs)).toBe(true);
  });
});

describe("TitleRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new TitleRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new TitleRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new TitleRegistry();
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
