/**
 * Faithfulness + defensiveness tests for `AchievementsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  AchievementsManifestSchema,
  type AchievementsManifest,
} from "./achievements.js";

const reference: AchievementsManifest = [
  {
    id: "first_kill",
    name: "First Blood",
    description: "Defeat your first enemy",
    hidden: false,
    rarity: "common",
    points: 5,
    icon: "asset://achievements/first_kill.png",
    category: "combat",
    prerequisites: [],
    trigger: { kind: "event", event: "combat:enemy_killed", match: {} },
  },
  {
    id: "slayer_10",
    name: "Slayer I",
    description: "Defeat 10 enemies",
    hidden: false,
    rarity: "uncommon",
    points: 10,
    category: "combat",
    prerequisites: ["first_kill"],
    trigger: {
      kind: "count",
      event: "combat:enemy_killed",
      match: {},
      threshold: 10,
    },
  },
  {
    id: "woodcutter_50",
    name: "Seasoned Woodcutter",
    description: "Reach woodcutting level 50",
    hidden: false,
    rarity: "rare",
    points: 25,
    prerequisites: [],
    trigger: {
      kind: "stat",
      stat: "skill.woodcutting.level",
      threshold: 50,
    },
  },
];

describe("AchievementsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = AchievementsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal entry", () => {
    const minimal = [
      {
        id: "basic",
        name: "Basic",
        trigger: { kind: "event", event: "system:login" },
      },
    ];
    const parsed = AchievementsManifestSchema.parse(minimal);
    expect(parsed[0].hidden).toBe(false);
    expect(parsed[0].rarity).toBe("common");
    expect(parsed[0].points).toBe(0);
    expect(parsed[0].prerequisites).toEqual([]);
    expect(parsed[0].description).toBe("");
    if (parsed[0].trigger.kind === "event") {
      expect(parsed[0].trigger.match).toEqual({});
    }
  });

  it("rejects unknown trigger kind", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        trigger: { kind: "timer", seconds: 10 },
      },
    ];
    expect(AchievementsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects count threshold <= 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        trigger: {
          kind: "count",
          event: "combat:enemy_killed",
          threshold: 0,
        },
      },
    ];
    expect(AchievementsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown rarity", () => {
    const bad = [{ ...reference[0], rarity: "mythic" }];
    expect(AchievementsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate achievement ids", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(AchievementsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects self-referential prerequisite", () => {
    const bad = [{ ...reference[0], prerequisites: [reference[0].id] }];
    expect(AchievementsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects prerequisite pointing at unknown id", () => {
    const bad = [{ ...reference[0], prerequisites: ["nope"] }];
    expect(AchievementsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative points", () => {
    const bad = [{ ...reference[0], points: -1 }];
    expect(AchievementsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty event name on trigger", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        trigger: { kind: "event", event: "" },
      },
    ];
    expect(AchievementsManifestSchema.safeParse(bad).success).toBe(false);
  });
});
