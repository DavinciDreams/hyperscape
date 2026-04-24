import { TreeManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  TreeCatalogRegistry,
  TreesNotLoadedError,
  UnknownTreeError,
} from "../TreeCatalogRegistry.js";

function manifest() {
  return TreeManifestSchema.parse({
    $schema: "hyperforge.trees.v1",
    trees: {
      regular: { id: "tree_regular", name: "Regular Tree", levelRequired: 1 },
      oak: { id: "tree_oak", name: "Oak Tree", levelRequired: 15 },
      maple: { id: "tree_maple", name: "Maple Tree", levelRequired: 45 },
    },
  });
}

describe("TreeCatalogRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new TreeCatalogRegistry().manifest).toThrow(
      TreesNotLoadedError,
    );
  });

  it("indexes by subtype and resourceId", () => {
    const r = new TreeCatalogRegistry(manifest());
    expect(r.bySubtype("oak").id).toBe("tree_oak");
    expect(r.byResourceId("tree_maple").levelRequired).toBe(45);
  });

  it("throws UnknownTreeError on miss", () => {
    const r = new TreeCatalogRegistry(manifest());
    expect(() => r.bySubtype("ghost")).toThrow(UnknownTreeError);
    expect(() => r.byResourceId("tree_ghost")).toThrow(UnknownTreeError);
  });

  it("choppableAt filters by woodcutting level", () => {
    const r = new TreeCatalogRegistry(manifest());
    expect(
      r
        .choppableAt(1)
        .map((t) => t.id)
        .sort(),
    ).toEqual(["tree_regular"]);
    expect(
      r
        .choppableAt(20)
        .map((t) => t.id)
        .sort(),
    ).toEqual(["tree_oak", "tree_regular"]);
    expect(
      r
        .choppableAt(60)
        .map((t) => t.id)
        .sort(),
    ).toEqual(["tree_maple", "tree_oak", "tree_regular"]);
  });

  it("exposes subtypeKeys + resourceIds", () => {
    const r = new TreeCatalogRegistry(manifest());
    expect(r.subtypeKeys.sort()).toEqual(["maple", "oak", "regular"]);
    expect(r.resourceIds.sort()).toEqual([
      "tree_maple",
      "tree_oak",
      "tree_regular",
    ]);
  });
});
