import { NPCSizesManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  NPCSizesNotLoadedError,
  NPCSizesRegistry,
} from "../NPCSizesRegistry.js";

function manifest() {
  return NPCSizesManifestSchema.parse({
    $schema: "hyperforge.npc-sizes.v1",
    sizes: {
      goblin: { width: 1, depth: 1 },
      troll: { width: 2, depth: 2 },
      dragon: { width: 3, depth: 3 },
    },
  });
}

describe("NPCSizesRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new NPCSizesRegistry().manifest).toThrow(
      NPCSizesNotLoadedError,
    );
  });
});

describe("NPCSizesRegistry — lookup", () => {
  it("returns explicit size", () => {
    const r = new NPCSizesRegistry(manifest());
    expect(r.getOrDefault("troll")).toEqual({ width: 2, depth: 2 });
    expect(r.has("troll")).toBe(true);
  });

  it("defaults to 1x1 when unknown", () => {
    const r = new NPCSizesRegistry(manifest());
    expect(r.getOrDefault("ghost")).toEqual({ width: 1, depth: 1 });
    expect(r.has("ghost")).toBe(false);
  });

  it("lists all ids", () => {
    const r = new NPCSizesRegistry(manifest());
    expect(r.ids().sort()).toEqual(["dragon", "goblin", "troll"]);
  });
});
