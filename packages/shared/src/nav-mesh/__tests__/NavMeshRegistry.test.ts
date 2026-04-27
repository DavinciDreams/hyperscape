import { NavMeshManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
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

describe("NavMeshRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new NavMeshRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new NavMeshRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new NavMeshRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
