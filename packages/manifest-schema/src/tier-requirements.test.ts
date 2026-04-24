import { describe, expect, it } from "vitest";

import {
  TierRequirementsManifestSchema,
  type TierRequirementsManifest,
} from "./tier-requirements.js";

const hyperscapeTiers: TierRequirementsManifest = {
  melee: {
    bronze: { attack: 1, defence: 1 },
    iron: { attack: 1, defence: 1 },
    steel: { attack: 5, defence: 5 },
    mithril: { attack: 20, defence: 20 },
    adamant: { attack: 30, defence: 30 },
    rune: { attack: 40, defence: 40 },
  },
  tools: {
    bronze: { attack: 1, woodcutting: 1, mining: 1 },
    steel: { attack: 5, woodcutting: 6, mining: 6 },
    mithril: { attack: 20, woodcutting: 21, mining: 21 },
  },
  ranged: {
    oak: { ranged: 5, defence: 5 },
    willow: { ranged: 20, defence: 20 },
  },
  magic: {
    air: { magic: 1 },
    earth: { magic: 10, defence: 10 },
  },
};

describe("TierRequirementsManifestSchema", () => {
  it("parses a realistic manifest cleanly", () => {
    const result = TierRequirementsManifestSchema.safeParse(hyperscapeTiers);
    if (!result.success) {
      throw new Error(
        `Tier requirements manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects non-integer level", () => {
    const bad = {
      ...hyperscapeTiers,
      melee: { bronze: { attack: 1.5, defence: 1 } },
    };
    expect(TierRequirementsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects level above 99", () => {
    const bad = {
      ...hyperscapeTiers,
      magic: { air: { magic: 120 } },
    };
    expect(TierRequirementsManifestSchema.safeParse(bad).success).toBe(false);
  });
});
