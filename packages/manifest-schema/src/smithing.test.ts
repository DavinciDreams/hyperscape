/**
 * Faithfulness test: a smithing manifest built from the values currently
 * hardcoded in `packages/shared/src/constants/SmithingConstants.ts` MUST
 * parse cleanly.
 */

import { describe, expect, it } from "vitest";

import { SmithingManifestSchema, type SmithingManifest } from "./smithing.js";

const hyperscapeSmithingManifest: SmithingManifest = {
  $schema: "hyperforge.smithing.v1",
  items: {
    hammerItemId: "hammer",
    coalItemId: "coal",
  },
  timing: {
    defaultSmeltingTicks: 4,
    defaultSmithingTicks: 4,
  },
  validation: {
    maxQuantity: 10000,
    minQuantity: 1,
    maxItemIdLength: 64,
  },
  messages: {
    alreadySmelting: "You are already smelting.",
    noItems: "You have no items.",
    noOres: "You don't have the ores to smelt anything.",
    invalidBar: "Invalid bar type.",
    levelTooLowSmelt: "You need level {level} Smithing to smelt that.",
    smeltingStart: "You begin smelting {item}s.",
    outOfMaterials: "You have run out of materials.",
    smeltSuccess: "You smelt a {item}.",
    ironSmeltFail: "The ore is too impure and you fail to smelt it.",

    alreadySmithing: "You are already smithing.",
    noHammer: "You need a hammer to work the metal on this anvil.",
    noBars: "You don't have the bars to smith anything.",
    invalidRecipe: "Invalid smithing recipe.",
    levelTooLowSmith: "You need level {level} Smithing to make that.",
    smithingStart: "You begin smithing {item}s.",
    outOfBars: "You have run out of bars.",
    smithSuccess: "You hammer the {metal} and make a {item}.",
  },
};

describe("SmithingManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = SmithingManifestSchema.safeParse(hyperscapeSmithingManifest);
    if (!result.success) {
      throw new Error(
        `Hyperscape smithing manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects wrong schema version", () => {
    const wrong = {
      ...hyperscapeSmithingManifest,
      $schema: "hyperforge.smithing.v0",
    };
    const result = SmithingManifestSchema.safeParse(wrong);
    expect(result.success).toBe(false);
  });

  it("rejects empty hammer item id", () => {
    const bad = {
      ...hyperscapeSmithingManifest,
      items: { ...hyperscapeSmithingManifest.items, hammerItemId: "" },
    };
    const result = SmithingManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects non-positive smelting ticks", () => {
    const bad = {
      ...hyperscapeSmithingManifest,
      timing: { ...hyperscapeSmithingManifest.timing, defaultSmeltingTicks: 0 },
    };
    const result = SmithingManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
