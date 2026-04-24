import { NavMeshManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  NavMeshNotLoadedError,
  NavMeshRegistry,
  UnknownNavAgentError,
} from "../NavMeshRegistry.js";

function manifest() {
  return NavMeshManifestSchema.parse({
    agents: [
      { id: "humanoid", name: "Humanoid" },
      {
        id: "giant",
        name: "Giant",
        radius: 1,
        height: 3,
        areaTags: ["heavy"],
      },
    ],
    modifierVolumes: [
      {
        id: "lava_pit",
        kind: "aabb",
        center: { x: 0, y: 0, z: 0 },
        extent: { x: 10, y: 2, z: 10 },
        effect: "unwalkable",
      },
    ],
    jumpLinks: [
      {
        id: "wall_jump",
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 2, z: 3 },
      },
      {
        id: "heavy_only",
        from: { x: 0, y: 0, z: 0 },
        to: { x: 5, y: 0, z: 0 },
        agentTag: "heavy",
      },
    ],
  });
}

describe("NavMeshRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new NavMeshRegistry().manifest).toThrow(NavMeshNotLoadedError);
  });

  it("voxelizer + agent accessors", () => {
    const r = new NavMeshRegistry(manifest());
    expect(r.cellSize).toBe(0.3);
    expect(r.cellHeight).toBe(0.2);
    expect(r.quality).toBe("medium");
    expect(r.hasAgent("humanoid")).toBe(true);
    expect(r.agent("giant").height).toBe(3);
    expect(() => r.agent("ghost")).toThrow(UnknownNavAgentError);
  });

  it("modifier + jumpLink lookups", () => {
    const r = new NavMeshRegistry(manifest());
    expect(r.modifier("lava_pit")?.effect).toBe("unwalkable");
    expect(r.modifier("ghost")).toBeUndefined();
    expect(r.jumpLink("wall_jump")?.bidirectional).toBe(false);
  });

  it("jumpLinksForAgent filters by agent id + areaTags", () => {
    const r = new NavMeshRegistry(manifest());
    // humanoid has no "heavy" tag — only ungated wall_jump applies
    expect(r.jumpLinksForAgent("humanoid").map((j) => j.id)).toEqual([
      "wall_jump",
    ]);
    // giant has "heavy" tag — both apply
    expect(
      r
        .jumpLinksForAgent("giant")
        .map((j) => j.id)
        .sort(),
    ).toEqual(["heavy_only", "wall_jump"]);
    // unknown agent — empty
    expect(r.jumpLinksForAgent("ghost")).toEqual([]);
  });
});
