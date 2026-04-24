/**
 * Faithfulness test: a trees manifest built from the values currently
 * hardcoded in `packages/shared/src/constants/TreeTypes.ts` MUST parse cleanly.
 */

import { describe, expect, it } from "vitest";

import { TreeManifestSchema, type TreeManifest } from "./trees.js";

const hyperscapeTreeManifest: TreeManifest = {
  $schema: "hyperforge.trees.v1",
  trees: {
    pine: { id: "tree_pine", name: "Pine Tree", levelRequired: 1 },
    oak: { id: "tree_oak", name: "Oak Tree", levelRequired: 15 },
    maple: { id: "tree_maple", name: "Maple Tree", levelRequired: 45 },
    palm: { id: "tree_palm", name: "Desert Palm", levelRequired: 1 },
    banana: { id: "tree_banana", name: "Banana Tree", levelRequired: 1 },
    dead: { id: "tree_dead", name: "Dead Tree", levelRequired: 1 },
    pineDead: { id: "tree_pineDead", name: "Dead Pine", levelRequired: 1 },
    bamboo: { id: "tree_bamboo", name: "Bamboo", levelRequired: 1 },
    eucalyptus: {
      id: "tree_eucalyptus",
      name: "Eucalyptus Tree",
      levelRequired: 30,
    },
    general: { id: "tree_general", name: "Tree", levelRequired: 1 },
    magic: { id: "tree_magic", name: "Magic Tree", levelRequired: 60 },
    mahogany: {
      id: "tree_mahogany",
      name: "Mahogany Tree",
      levelRequired: 50,
    },
  },
};

describe("TreeManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = TreeManifestSchema.safeParse(hyperscapeTreeManifest);
    if (!result.success) {
      throw new Error(
        `Hyperscape reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects wrong schema version", () => {
    const wrong = { ...hyperscapeTreeManifest, $schema: "hyperforge.trees.v0" };
    const result = TreeManifestSchema.safeParse(wrong);
    expect(result.success).toBe(false);
  });

  it("rejects non-positive level requirements", () => {
    const bad = {
      ...hyperscapeTreeManifest,
      trees: {
        ...hyperscapeTreeManifest.trees,
        oak: { id: "tree_oak", name: "Oak Tree", levelRequired: 0 },
      },
    };
    const result = TreeManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects empty tree id", () => {
    const bad = {
      ...hyperscapeTreeManifest,
      trees: {
        ...hyperscapeTreeManifest.trees,
        oak: { id: "", name: "Oak Tree", levelRequired: 15 },
      },
    };
    const result = TreeManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
