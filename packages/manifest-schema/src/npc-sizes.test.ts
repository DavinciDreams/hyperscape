import { describe, expect, it } from "vitest";

import { NPCSizesManifestSchema, type NPCSizesManifest } from "./npc-sizes.js";

const hyperscapeNpcSizesManifest: NPCSizesManifest = {
  $schema: "hyperforge.npc-sizes.v1",
  sizes: {
    goblin: { width: 1, depth: 1 },
    cow: { width: 1, depth: 1 },
    chicken: { width: 1, depth: 1 },
    rat: { width: 1, depth: 1 },
    spider: { width: 1, depth: 1 },
    skeleton: { width: 1, depth: 1 },
    zombie: { width: 1, depth: 1 },
    imp: { width: 1, depth: 1 },
    general_graardor: { width: 2, depth: 2 },
    kril_tsutsaroth: { width: 2, depth: 2 },
    commander_zilyana: { width: 2, depth: 2 },
    kreearra: { width: 2, depth: 2 },
    giant_mole: { width: 2, depth: 2 },
    kalphite_queen: { width: 2, depth: 2 },
    corporeal_beast: { width: 3, depth: 3 },
    cerberus: { width: 3, depth: 3 },
    king_black_dragon: { width: 3, depth: 3 },
    vorkath: { width: 4, depth: 4 },
    olm_head: { width: 5, depth: 5 },
  },
};

describe("NPCSizesManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = NPCSizesManifestSchema.safeParse(hyperscapeNpcSizesManifest);
    if (!result.success) {
      throw new Error(
        `Hyperscape npc-sizes manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects zero width", () => {
    const bad = {
      ...hyperscapeNpcSizesManifest,
      sizes: {
        ...hyperscapeNpcSizesManifest.sizes,
        goblin: { width: 0, depth: 1 },
      },
    };
    expect(NPCSizesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-integer depth", () => {
    const bad = {
      ...hyperscapeNpcSizesManifest,
      sizes: {
        ...hyperscapeNpcSizesManifest.sizes,
        goblin: { width: 1, depth: 1.5 },
      },
    };
    expect(NPCSizesManifestSchema.safeParse(bad).success).toBe(false);
  });
});
