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

describe("NPCSizesRegistry — onReloaded() reload listeners", () => {
  it("fires after every load() and honors unsubscribe", () => {
    const r = new NPCSizesRegistry();
    let count = 0;
    const unsubscribe = r.onReloaded(() => {
      count += 1;
    });
    r.load(manifest());
    r.load(manifest());
    expect(count).toBe(2);
    unsubscribe();
    r.load(manifest());
    expect(count).toBe(2);
  });

  it("loadFromJson() also triggers the listener", () => {
    const r = new NPCSizesRegistry();
    let fired = false;
    r.onReloaded(() => {
      fired = true;
    });
    r.loadFromJson(manifest());
    expect(fired).toBe(true);
  });

  it("a throwing listener does not break sibling listeners", () => {
    const r = new NPCSizesRegistry();
    const seen: string[] = [];
    r.onReloaded(() => {
      throw new Error("boom");
    });
    r.onReloaded(() => seen.push("ok"));
    r.load(manifest());
    expect(seen).toEqual(["ok"]);
  });
});
