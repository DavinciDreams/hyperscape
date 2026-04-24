import { LevelStreamingManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  LevelStreamingNotLoadedError,
  LevelStreamingRegistry,
  UnknownSublevelError,
} from "../LevelStreamingRegistry.js";

function manifest() {
  return LevelStreamingManifestSchema.parse([
    {
      id: "overworld",
      name: "Overworld",
      sourcePath: "sublevels/overworld.level",
      policy: "always-loaded",
      tags: ["world"],
    },
    {
      id: "dungeonA",
      name: "Dungeon A",
      sourcePath: "sublevels/dungeonA.level",
      policy: "proximity",
      trigger: {
        kind: "sphere",
        center: { x: 100, y: 0, z: 100 },
        radius: 50,
      },
      dependsOn: ["overworld"],
      tags: ["dungeon", "act1"],
    },
    {
      id: "dungeonA_boss",
      name: "Dungeon A Boss",
      sourcePath: "sublevels/dungeonA_boss.level",
      policy: "on-demand",
      dependsOn: ["dungeonA", "overworld"],
      tags: ["dungeon"],
    },
  ]);
}

describe("LevelStreamingRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new LevelStreamingRegistry().manifest).toThrow(
      LevelStreamingNotLoadedError,
    );
  });

  it("indexes + get/has", () => {
    const r = new LevelStreamingRegistry(manifest());
    expect(r.has("overworld")).toBe(true);
    expect(r.has("ghost")).toBe(false);
    expect(r.get("dungeonA").policy).toBe("proximity");
    expect(() => r.get("ghost")).toThrow(UnknownSublevelError);
  });

  it("byPolicy + byTag", () => {
    const r = new LevelStreamingRegistry(manifest());
    expect(r.byPolicy("always-loaded").map((s) => s.id)).toEqual(["overworld"]);
    expect(
      r
        .byTag("dungeon")
        .map((s) => s.id)
        .sort(),
    ).toEqual(["dungeonA", "dungeonA_boss"]);
  });

  it("loadOrder honors dependsOn via post-order DFS", () => {
    const r = new LevelStreamingRegistry(manifest());
    const order = r.loadOrder().map((s) => s.id);
    expect(order.indexOf("overworld")).toBeLessThan(order.indexOf("dungeonA"));
    expect(order.indexOf("dungeonA")).toBeLessThan(
      order.indexOf("dungeonA_boss"),
    );
  });
});
