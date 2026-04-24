/**
 * Faithfulness + defensiveness tests for `NavMeshManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { NavMeshManifestSchema, type NavMeshManifest } from "./nav-mesh.js";

const reference: NavMeshManifest = {
  quality: "high",
  cellSize: 0.25,
  cellHeight: 0.2,
  minRegionAreaSqMeters: 1,
  tileSizeVoxels: 64,
  agents: [
    {
      id: "human",
      name: "Human",
      radius: 0.3,
      height: 1.8,
      maxStep: 0.4,
      maxSlopeDeg: 45,
      areaTags: ["ground", "wood"],
    },
    {
      id: "fish",
      name: "Fish",
      radius: 0.2,
      height: 0.3,
      maxStep: 0,
      maxSlopeDeg: 90,
      areaTags: ["water"],
    },
  ],
  modifierVolumes: [
    {
      id: "lavaLake",
      kind: "aabb",
      center: { x: 0, y: 0, z: 0 },
      extent: { x: 5, y: 2, z: 5 },
      effect: "unwalkable",
      costMultiplier: 1,
    },
    {
      id: "mudSwamp",
      kind: "sphere",
      center: { x: 100, y: 0, z: 100 },
      extent: { x: 10, y: 10, z: 10 },
      effect: "cost-multiply",
      costMultiplier: 5,
    },
  ],
  jumpLinks: [
    {
      id: "cliffJump",
      from: { x: 0, y: 5, z: 0 },
      to: { x: 3, y: 0, z: 0 },
      bidirectional: false,
      extraCost: 2,
      agentTag: "human",
    },
  ],
};

describe("NavMeshManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = NavMeshManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults to a minimal manifest", () => {
    const parsed = NavMeshManifestSchema.parse({
      agents: [{ id: "a", name: "A" }],
    });
    expect(parsed.quality).toBe("medium");
    expect(parsed.cellSize).toBe(0.3);
    expect(parsed.cellHeight).toBe(0.2);
    expect(parsed.minRegionAreaSqMeters).toBe(1);
    expect(parsed.tileSizeVoxels).toBe(64);
    expect(parsed.agents[0].radius).toBe(0.3);
    expect(parsed.agents[0].height).toBe(1.8);
    expect(parsed.agents[0].maxStep).toBe(0.4);
    expect(parsed.agents[0].maxSlopeDeg).toBe(45);
    expect(parsed.agents[0].areaTags).toEqual([]);
    expect(parsed.modifierVolumes).toEqual([]);
    expect(parsed.jumpLinks).toEqual([]);
  });

  it("rejects empty agents array", () => {
    expect(NavMeshManifestSchema.safeParse({ agents: [] }).success).toBe(false);
  });

  it("rejects duplicate agent ids", () => {
    const bad = {
      agents: [
        { id: "a", name: "A" },
        { id: "a", name: "A2" },
      ],
    };
    expect(NavMeshManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate modifier-volume ids", () => {
    const bad = {
      agents: [{ id: "a", name: "A" }],
      modifierVolumes: [
        {
          id: "dup",
          kind: "aabb",
          center: { x: 0, y: 0, z: 0 },
          extent: { x: 1, y: 1, z: 1 },
          effect: "block",
        },
        {
          id: "dup",
          kind: "aabb",
          center: { x: 5, y: 0, z: 0 },
          extent: { x: 1, y: 1, z: 1 },
          effect: "block",
        },
      ],
    };
    expect(NavMeshManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate jump-link ids", () => {
    const bad = {
      agents: [{ id: "a", name: "A" }],
      jumpLinks: [
        {
          id: "j",
          from: { x: 0, y: 0, z: 0 },
          to: { x: 1, y: 0, z: 0 },
        },
        {
          id: "j",
          from: { x: 2, y: 0, z: 0 },
          to: { x: 3, y: 0, z: 0 },
        },
      ],
    };
    expect(NavMeshManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cost-multiply effect with default multiplier 1", () => {
    const bad = {
      agents: [{ id: "a", name: "A" }],
      modifierVolumes: [
        {
          id: "m",
          kind: "aabb",
          center: { x: 0, y: 0, z: 0 },
          extent: { x: 1, y: 1, z: 1 },
          effect: "cost-multiply",
          costMultiplier: 1,
        },
      ],
    };
    expect(NavMeshManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects area-override effect without areaTagOverride", () => {
    const bad = {
      agents: [{ id: "a", name: "A" }],
      modifierVolumes: [
        {
          id: "m",
          kind: "aabb",
          center: { x: 0, y: 0, z: 0 },
          extent: { x: 1, y: 1, z: 1 },
          effect: "area-override",
        },
      ],
    };
    expect(NavMeshManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects modifier volume with non-positive extent", () => {
    const bad = {
      agents: [{ id: "a", name: "A" }],
      modifierVolumes: [
        {
          id: "m",
          kind: "aabb",
          center: { x: 0, y: 0, z: 0 },
          extent: { x: 0, y: 1, z: 1 },
          effect: "block",
        },
      ],
    };
    expect(NavMeshManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects jump-link agentTag that references unknown agent or area", () => {
    const bad = {
      agents: [{ id: "a", name: "A" }],
      jumpLinks: [
        {
          id: "j",
          from: { x: 0, y: 0, z: 0 },
          to: { x: 1, y: 0, z: 0 },
          agentTag: "unknownAgent",
        },
      ],
    };
    expect(NavMeshManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts jump-link agentTag that references an agent's area tag", () => {
    const ok = {
      agents: [{ id: "human", name: "Human", areaTags: ["ground"] }],
      jumpLinks: [
        {
          id: "j",
          from: { x: 0, y: 0, z: 0 },
          to: { x: 1, y: 0, z: 0 },
          agentTag: "ground",
        },
      ],
    };
    expect(NavMeshManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects agent maxSlopeDeg > 90", () => {
    const bad = {
      agents: [{ id: "a", name: "A", maxSlopeDeg: 91 }],
    };
    expect(NavMeshManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects agent radius <= 0", () => {
    const bad = {
      agents: [{ id: "a", name: "A", radius: 0 }],
    };
    expect(NavMeshManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid agent id format", () => {
    const bad = {
      agents: [{ id: "Has Spaces", name: "A" }],
    };
    expect(NavMeshManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects tileSizeVoxels outside [16, 1024]", () => {
    const badLow = {
      agents: [{ id: "a", name: "A" }],
      tileSizeVoxels: 8,
    };
    const badHigh = {
      agents: [{ id: "a", name: "A" }],
      tileSizeVoxels: 2048,
    };
    expect(NavMeshManifestSchema.safeParse(badLow).success).toBe(false);
    expect(NavMeshManifestSchema.safeParse(badHigh).success).toBe(false);
  });

  it("rejects unknown quality preset", () => {
    const bad = {
      agents: [{ id: "a", name: "A" }],
      quality: "ultra",
    };
    expect(NavMeshManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts area-override effect with proper override tag", () => {
    const ok = {
      agents: [{ id: "a", name: "A", areaTags: ["shallow"] }],
      modifierVolumes: [
        {
          id: "m",
          kind: "aabb",
          center: { x: 0, y: 0, z: 0 },
          extent: { x: 1, y: 1, z: 1 },
          effect: "area-override",
          areaTagOverride: "shallow",
        },
      ],
    };
    expect(NavMeshManifestSchema.safeParse(ok).success).toBe(true);
  });
});
