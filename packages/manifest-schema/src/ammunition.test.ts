import { describe, expect, it } from "vitest";

import {
  AmmunitionManifestSchema,
  type AmmunitionManifest,
} from "./ammunition.js";

const hyperscapeAmmunition: AmmunitionManifest = {
  $schema: "hyperforge.ammunition.v1",
  bowTiers: {
    shortbow: 1,
    oak_shortbow: 5,
    willow_shortbow: 20,
    maple_shortbow: 30,
    longbow: 1,
    oak_longbow: 5,
    willow_longbow: 20,
    maple_longbow: 30,
  },
  arrows: {
    bronze_arrow: {
      id: "bronze_arrow",
      name: "Bronze arrow",
      rangedStrength: 7,
      requiredRangedLevel: 1,
      requiredBowTier: 1,
    },
    iron_arrow: {
      id: "iron_arrow",
      name: "Iron arrow",
      rangedStrength: 10,
      requiredRangedLevel: 1,
      requiredBowTier: 1,
    },
    steel_arrow: {
      id: "steel_arrow",
      name: "Steel arrow",
      rangedStrength: 16,
      requiredRangedLevel: 5,
      requiredBowTier: 5,
    },
    mithril_arrow: {
      id: "mithril_arrow",
      name: "Mithril arrow",
      rangedStrength: 22,
      requiredRangedLevel: 20,
      requiredBowTier: 20,
    },
    adamant_arrow: {
      id: "adamant_arrow",
      name: "Adamant arrow",
      rangedStrength: 31,
      requiredRangedLevel: 30,
      requiredBowTier: 30,
    },
  },
};

describe("AmmunitionManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = AmmunitionManifestSchema.safeParse(hyperscapeAmmunition);
    if (!result.success) {
      throw new Error(
        `Hyperscape ammunition manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects non-integer ranged strength", () => {
    const bad: AmmunitionManifest = {
      ...hyperscapeAmmunition,
      arrows: {
        ...hyperscapeAmmunition.arrows,
        bronze_arrow: {
          ...hyperscapeAmmunition.arrows.bronze_arrow,
          rangedStrength: 7.5,
        },
      },
    };
    expect(AmmunitionManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative bow tier", () => {
    const bad = {
      ...hyperscapeAmmunition,
      bowTiers: { ...hyperscapeAmmunition.bowTiers, shortbow: -1 },
    };
    expect(AmmunitionManifestSchema.safeParse(bad).success).toBe(false);
  });
});
