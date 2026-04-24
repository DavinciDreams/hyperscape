/**
 * Faithfulness + defensiveness tests for `TitlesManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { TitlesManifestSchema, type TitlesManifest } from "./titles.js";

const reference: TitlesManifest = [
  {
    id: "titleDragonslayer",
    name: "Dragonslayer",
    displayKey: "title.dragonslayer",
    description: "Awarded to those who have felled a dragon.",
    iconId: "iconDragon",
    displayMode: "suffix",
    rarity: "epic",
    color: "#aa2233",
    unlockConditions: [
      {
        kind: "bossKillCount",
        npcId: "npcAncientDragon",
        requiredKills: 1,
      },
      {
        kind: "achievement",
        achievementId: "achievementFirstDragonDown",
      },
    ],
    revocation: {
      revokeOnCadenceRollover: false,
      expireAfterDays: 0,
      revocableByGm: true,
    },
    hiddenUntilEarned: true,
    showInAchievementsTab: true,
  },
  {
    id: "titleChampion",
    name: "Champion",
    displayKey: "title.champion",
    description: "Held by the #1 PvP rated player of the season.",
    iconId: "iconCrown",
    displayMode: "prefix",
    rarity: "legendary",
    color: "#ffcc00",
    unlockConditions: [
      {
        kind: "leaderboardBracket",
        leaderboardId: "globalPvpRating",
        bracketId: "top1",
      },
    ],
    revocation: {
      revokeOnCadenceRollover: true,
      expireAfterDays: 0,
      revocableByGm: true,
    },
    hiddenUntilEarned: false,
    showInAchievementsTab: true,
  },
  {
    id: "titleCosmetic",
    name: "Cosmetic Title",
    displayKey: "title.cosmetic",
    description: "A store-bought title.",
    iconId: "",
    displayMode: "suffix",
    rarity: "common",
    color: "",
    unlockConditions: [
      {
        kind: "purchase",
        cost: 1000,
        currencyId: "gold",
      },
    ],
    revocation: {
      revokeOnCadenceRollover: false,
      expireAfterDays: 0,
      revocableByGm: true,
    },
    hiddenUntilEarned: false,
    showInAchievementsTab: false,
  },
  {
    id: "titleGmOnly",
    name: "Developer",
    displayKey: "title.developer",
    description: "Granted only by GM action.",
    iconId: "iconWrench",
    displayMode: "prefix",
    rarity: "mythic",
    color: "#00ffff",
    unlockConditions: [{ kind: "manual" }],
    revocation: {
      revokeOnCadenceRollover: false,
      expireAfterDays: 0,
      revocableByGm: true,
    },
    hiddenUntilEarned: true,
    showInAchievementsTab: false,
  },
];

describe("TitlesManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = TitlesManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("parses an empty manifest", () => {
    expect(TitlesManifestSchema.safeParse([]).success).toBe(true);
  });

  it("applies defaults on minimal title", () => {
    const minimal = [
      {
        id: "minimalTitle",
        name: "Minimal",
        displayKey: "title.minimal",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [{ kind: "manual" }],
      },
    ];
    const result = TitlesManifestSchema.safeParse(minimal);
    if (!result.success) {
      throw new Error(
        `Minimal failed:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    const title = result.data[0];
    expect(title.description).toBe("");
    expect(title.iconId).toBe("");
    expect(title.color).toBe("");
    expect(title.revocation.revokeOnCadenceRollover).toBe(false);
    expect(title.revocation.expireAfterDays).toBe(0);
    expect(title.revocation.revocableByGm).toBe(true);
    expect(title.hiddenUntilEarned).toBe(true);
    expect(title.showInAchievementsTab).toBe(true);
  });

  it("rejects duplicate title ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [{ kind: "manual" }],
      },
      {
        id: "dup",
        name: "B",
        displayKey: "k.b",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [{ kind: "manual" }],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty unlockConditions", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate unlock condition kinds", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [
          { kind: "achievement", achievementId: "a1" },
          { kind: "achievement", achievementId: "a2" },
        ],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts multiple unlock conditions of different kinds (OR semantics)", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [
          { kind: "achievement", achievementId: "a1" },
          { kind: "quest", questId: "q1" },
          { kind: "manual" },
        ],
      },
    ];
    expect(TitlesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects empty displayKey", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [{ kind: "manual" }],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown displayMode", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "banner",
        rarity: "common",
        unlockConditions: [{ kind: "manual" }],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown rarity", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "godlike",
        unlockConditions: [{ kind: "manual" }],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid color format", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        color: "red",
        unlockConditions: [{ kind: "manual" }],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts 'replace' displayMode", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "replace",
        rarity: "common",
        unlockConditions: [{ kind: "manual" }],
      },
    ];
    expect(TitlesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects bossKillCount with zero required kills", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [
          { kind: "bossKillCount", npcId: "npcBoss", requiredKills: 0 },
        ],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects skillLevel with level > 100", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [
          { kind: "skillLevel", skillId: "mining", requiredLevel: 150 },
        ],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects purchase with zero cost", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [{ kind: "purchase", cost: 0 }],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts purchase with non-default currencyId", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [
          { kind: "purchase", cost: 100, currencyId: "honorToken" },
        ],
      },
    ];
    expect(TitlesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown unlock condition kind", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [{ kind: "dreamSequence" }],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects expireAfterDays > 3650 (10 years)", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [{ kind: "manual" }],
        revocation: { expireAfterDays: 9999 },
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts expireAfterDays in valid range", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [{ kind: "manual" }],
        revocation: { expireAfterDays: 30 },
      },
    ];
    expect(TitlesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects invalid title id format", () => {
    const bad = [
      {
        id: "Not Valid",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [{ kind: "manual" }],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [{ kind: "manual" }],
        extraField: "nope",
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown field on revocation (strict mode)", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [{ kind: "manual" }],
        revocation: { extraField: "nope" },
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects leaderboardBracket with invalid bracketId format", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        displayKey: "k.a",
        displayMode: "suffix",
        rarity: "common",
        unlockConditions: [
          {
            kind: "leaderboardBracket",
            leaderboardId: "board",
            bracketId: "Not Valid",
          },
        ],
      },
    ];
    expect(TitlesManifestSchema.safeParse(bad).success).toBe(false);
  });
});
