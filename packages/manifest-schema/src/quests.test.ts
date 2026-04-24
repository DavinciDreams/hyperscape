/**
 * Faithfulness test: a representative quests manifest covering every
 * discriminated-union stage type (dialogue/kill/gather/interact) MUST parse
 * cleanly.
 */

import { describe, expect, it } from "vitest";

import { QuestsManifestSchema, type QuestsManifest } from "./quests.js";

const reference: QuestsManifest = {
  fresh_catch: {
    id: "fresh_catch",
    name: "Fresh Catch",
    description: "Catch three fish for the innkeeper.",
    difficulty: "novice",
    questPoints: 1,
    replayable: false,
    requirements: {
      quests: [],
      skills: { fishing: 1 },
      items: [],
    },
    startNpc: "innkeeper_brookhaven",
    stages: [
      {
        type: "dialogue",
        id: "stage_talk",
        description: "Talk to the innkeeper",
        npcId: "innkeeper_brookhaven",
      },
      {
        type: "gather",
        id: "stage_gather",
        description: "Catch 3 raw shrimp",
        target: "raw_shrimp",
        count: 3,
      },
    ],
    onStart: {
      items: [{ itemId: "small_net", quantity: 1 }],
      dialogue: "Take this net, lad.",
    },
    rewards: {
      questPoints: 1,
      items: [{ itemId: "gold_coin", quantity: 50 }],
      xp: { fishing: 100 },
    },
  },
  goblin_menace: {
    id: "goblin_menace",
    name: "Goblin Menace",
    description: "Clear the goblins from the east road.",
    difficulty: "intermediate",
    questPoints: 2,
    replayable: false,
    requirements: {
      quests: ["fresh_catch"],
      skills: { attack: 10 },
      items: [],
    },
    startNpc: "captain_of_the_guard",
    placementRules: {
      placement: "near_road",
      biomePreference: "grassland",
      maxDistFromTown: 300,
    },
    stages: [
      {
        type: "kill",
        id: "stage_kill",
        description: "Slay 5 goblins",
        target: "goblin",
        count: 5,
      },
      {
        type: "interact",
        id: "stage_report",
        description: "Plant the guard banner",
        target: "guard_banner",
        count: 1,
      },
    ],
    onStart: {},
    rewards: {
      questPoints: 2,
      items: [{ itemId: "bronze_sword", quantity: 1 }],
      xp: { attack: 250 },
    },
  },
};

describe("QuestsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = QuestsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("accepts a quest without placementRules", () => {
    // The first quest already omits placementRules; re-verify the shape.
    const result = QuestsManifestSchema.safeParse({
      fresh_catch: reference.fresh_catch,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a quest with zero stages", () => {
    const bad = {
      ...reference,
      fresh_catch: {
        ...reference.fresh_catch,
        stages: [] as never,
      },
    };
    const result = QuestsManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown stage discriminator", () => {
    const bad = {
      fresh_catch: {
        ...reference.fresh_catch,
        stages: [
          {
            type: "ride",
            id: "stage_ride",
            description: "Ride a mount",
            target: "horse",
            count: 1,
          },
        ],
      },
    };
    const result = QuestsManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a kill stage with non-positive count", () => {
    const bad = {
      goblin_menace: {
        ...reference.goblin_menace,
        stages: [
          {
            type: "kill",
            id: "stage_kill",
            description: "Slay goblins",
            target: "goblin",
            count: 0,
          },
        ],
      },
    };
    const result = QuestsManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a requirements.items row with non-positive quantity", () => {
    const bad = {
      fresh_catch: {
        ...reference.fresh_catch,
        requirements: {
          ...reference.fresh_catch.requirements,
          items: [{ itemId: "gold_coin", quantity: 0 }],
        },
      },
    };
    const result = QuestsManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
