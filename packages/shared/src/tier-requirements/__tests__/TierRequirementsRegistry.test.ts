import { TierRequirementsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  TierRequirementsNotLoadedError,
  TierRequirementsRegistry,
  UnknownTierError,
} from "../TierRequirementsRegistry.js";

function manifest() {
  return TierRequirementsManifestSchema.parse({
    melee: {
      bronze: { attack: 1, defence: 1 },
      iron: { attack: 1, defence: 1 },
      steel: { attack: 5, defence: 5 },
      mithril: { attack: 20, defence: 20 },
    },
    tools: {
      bronze: { attack: 1, woodcutting: 1, mining: 1 },
      iron: { attack: 1, woodcutting: 1, mining: 1 },
      steel: { attack: 5, woodcutting: 6, mining: 6 },
    },
    ranged: {
      bronze: { ranged: 1, defence: 1 },
      oak: { ranged: 5, defence: 1 },
    },
    magic: {
      earth: { magic: 1 },
      mystic: { magic: 20, defence: 20 },
    },
  });
}

describe("TierRequirementsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new TierRequirementsRegistry().manifest).toThrow(
      TierRequirementsNotLoadedError,
    );
  });
});

describe("TierRequirementsRegistry — lookup", () => {
  it("resolves all four families", () => {
    const r = new TierRequirementsRegistry(manifest());
    expect(r.melee("steel")).toEqual({ attack: 5, defence: 5 });
    expect(r.tools("steel").woodcutting).toBe(6);
    expect(r.ranged("oak").ranged).toBe(5);
    expect(r.magic("mystic").defence).toBe(20);
  });

  it("throws on unknown", () => {
    const r = new TierRequirementsRegistry(manifest());
    expect(() => r.melee("void")).toThrow(UnknownTierError);
    expect(() => r.tools("void")).toThrow(UnknownTierError);
    expect(() => r.ranged("void")).toThrow(UnknownTierError);
    expect(() => r.magic("void")).toThrow(UnknownTierError);
  });
});

describe("TierRequirementsRegistry — meets predicates", () => {
  it("melee under-met fails", () => {
    const r = new TierRequirementsRegistry(manifest());
    expect(r.meetsMelee("mithril", { attack: 10, defence: 20 })).toBe(false);
    expect(r.meetsMelee("mithril", { attack: 20, defence: 20 })).toBe(true);
  });

  it("tools requires all three", () => {
    const r = new TierRequirementsRegistry(manifest());
    expect(
      r.meetsTools("steel", { attack: 5, woodcutting: 6, mining: 5 }),
    ).toBe(false);
    expect(
      r.meetsTools("steel", { attack: 5, woodcutting: 6, mining: 6 }),
    ).toBe(true);
  });

  it("ranged gates", () => {
    const r = new TierRequirementsRegistry(manifest());
    expect(r.meetsRanged("oak", { ranged: 5, defence: 1 })).toBe(true);
    expect(r.meetsRanged("oak", { ranged: 4, defence: 5 })).toBe(false);
  });

  it("magic treats defence as optional", () => {
    const r = new TierRequirementsRegistry(manifest());
    expect(r.meetsMagic("earth", { magic: 1 })).toBe(true);
    expect(r.meetsMagic("mystic", { magic: 20, defence: 20 })).toBe(true);
    expect(r.meetsMagic("mystic", { magic: 20, defence: 15 })).toBe(false);
  });
});
