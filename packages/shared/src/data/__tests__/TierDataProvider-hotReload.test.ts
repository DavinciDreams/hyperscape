/**
 * Tests for TierDataProvider.hotReload — the entry point the editor's
 * PIE session uses to push tier-requirement manifest edits into the
 * running game without a Stop → Play cycle (Phase B3.1).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  TierDataProvider,
  type TierRequirementsManifest,
  type TierableItem,
} from "../TierDataProvider";

function makeManifest(
  overrides: Partial<TierRequirementsManifest> = {},
): TierRequirementsManifest {
  return {
    melee: {
      bronze: { attack: 1, defence: 1 },
      steel: { attack: 5, defence: 5 },
    },
    tools: {
      bronze: { attack: 1, woodcutting: 1, mining: 1 },
    },
    ranged: {
      oak: { ranged: 5, defence: 5 },
    },
    magic: {
      air: { magic: 1 },
    },
    ...overrides,
  };
}

function bronzeSword(): TierableItem {
  return {
    id: "bronze_sword",
    type: "weapon",
    tier: "bronze",
    equipSlot: "weapon",
    attackType: "MELEE",
  };
}

describe("TierDataProvider.hotReload", () => {
  beforeEach(() => {
    TierDataProvider.hotReload(makeManifest());
  });

  it("swaps the active manifest and picks up edits on next lookup", () => {
    const before = TierDataProvider.getRequirements(bronzeSword());
    expect(before?.attack).toBe(1);

    TierDataProvider.hotReload(
      makeManifest({
        melee: {
          bronze: { attack: 25, defence: 25 },
          steel: { attack: 5, defence: 5 },
        },
      }),
    );

    const after = TierDataProvider.getRequirements(bronzeSword());
    expect(after?.attack).toBe(25);
  });

  it("rejects malformed manifests and leaves prior state intact", () => {
    const before = TierDataProvider.getRequirements(bronzeSword());
    expect(before?.attack).toBe(1);

    // Melee tier data requires `defence`; this should throw.
    expect(() =>
      TierDataProvider.hotReload({
        ...makeManifest(),
        // @ts-expect-error — deliberately malformed to exercise validation
        melee: { bronze: { attack: 99 } },
      }),
    ).toThrow();

    // Prior manifest is still active.
    const after = TierDataProvider.getRequirements(bronzeSword());
    expect(after?.attack).toBe(1);
  });
});
