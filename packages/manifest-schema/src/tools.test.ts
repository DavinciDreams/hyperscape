/**
 * Faithfulness test: representative tool entries (matching the mix of
 * woodcutting, mining, and fishing rows in `tools.json`) MUST parse cleanly.
 */

import { describe, expect, it } from "vitest";

import { ToolsManifestSchema, type ToolsManifest } from "./tools.js";

const reference: ToolsManifest = [
  {
    itemId: "bronze_hatchet",
    skill: "woodcutting",
    tier: "bronze",
    levelRequired: 1,
    priority: 1,
  },
  {
    itemId: "rune_pickaxe",
    skill: "mining",
    tier: "rune",
    levelRequired: 41,
    priority: 7,
  },
  {
    itemId: "fly_fishing_rod",
    skill: "fishing",
    tier: "fly",
    levelRequired: 20,
    priority: 3,
    rollTicks: 5,
    bonusRollTicks: 3,
    bonusTickChance: 0.25,
  },
];

describe("ToolsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = ToolsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects unknown skill values", () => {
    const bad = [{ ...reference[0], skill: "cooking" }];
    const result = ToolsManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects non-positive levelRequired", () => {
    const bad = [{ ...reference[0], levelRequired: 0 }];
    const result = ToolsManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects bonusTickChance outside [0, 1]", () => {
    const bad = [{ ...reference[2], bonusTickChance: 1.5 }];
    const result = ToolsManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts fishing-specific tier strings", () => {
    const ok: ToolsManifest = [
      {
        itemId: "small_net",
        skill: "fishing",
        tier: "net",
        levelRequired: 1,
        priority: 1,
      },
    ];
    const result = ToolsManifestSchema.safeParse(ok);
    expect(result.success).toBe(true);
  });
});
