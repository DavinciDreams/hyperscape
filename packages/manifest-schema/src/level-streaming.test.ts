/**
 * Faithfulness + defensiveness tests for `LevelStreamingManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  LevelStreamingManifestSchema,
  type LevelStreamingManifest,
} from "./level-streaming.js";

const reference: LevelStreamingManifest = [
  {
    id: "persistent",
    name: "Persistent Root",
    description: "Always-loaded world root.",
    sourcePath: "world/persistent.manifest.json",
    policy: "always-loaded",
    priority: "critical",
    unloadPaddingMeters: 0,
    playerCap: 0,
    dependsOn: [],
    tags: ["root"],
  },
  {
    id: "region.lumbridge",
    name: "Lumbridge",
    description: "Starter region.",
    sourcePath: "world/lumbridge.manifest.json",
    policy: "proximity",
    priority: "high",
    trigger: {
      kind: "sphere",
      center: { x: 0, y: 0, z: 0 },
      radius: 200,
    },
    unloadPaddingMeters: 25,
    playerCap: 0,
    dependsOn: ["persistent"],
    tags: ["town"],
  },
  {
    id: "dungeon.sewers",
    name: "Lumbridge Sewers",
    description: "Optional dungeon — loaded on quest trigger.",
    sourcePath: "world/sewers.manifest.json",
    policy: "on-demand",
    priority: "normal",
    unloadPaddingMeters: 25,
    playerCap: 8,
    dependsOn: ["region.lumbridge"],
    tags: ["dungeon"],
  },
];

describe("LevelStreamingManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = LevelStreamingManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal sublevel", () => {
    const parsed = LevelStreamingManifestSchema.parse([
      {
        id: "a",
        name: "A",
        sourcePath: "a.json",
        policy: "on-demand",
      },
    ]);
    expect(parsed[0].priority).toBe("normal");
    expect(parsed[0].unloadPaddingMeters).toBe(25);
    expect(parsed[0].playerCap).toBe(0);
    expect(parsed[0].dependsOn).toEqual([]);
    expect(parsed[0].tags).toEqual([]);
  });

  it("rejects sublevel id with uppercase", () => {
    const bad = [
      { id: "Lumbridge", name: "L", sourcePath: "x", policy: "on-demand" },
    ];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty sourcePath", () => {
    const bad = [{ id: "a", name: "A", sourcePath: "", policy: "on-demand" }];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects proximity policy without trigger", () => {
    const bad = [{ id: "a", name: "A", sourcePath: "x", policy: "proximity" }];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects always-loaded with a trigger", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        sourcePath: "x",
        policy: "always-loaded",
        trigger: {
          kind: "sphere",
          center: { x: 0, y: 0, z: 0 },
          radius: 1,
        },
      },
    ];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects aabb trigger with min > max", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        sourcePath: "x",
        policy: "proximity",
        trigger: {
          kind: "aabb",
          min: { x: 10, y: 0, z: 0 },
          max: { x: 0, y: 0, z: 0 },
        },
      },
    ];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects sphere trigger with non-positive radius", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        sourcePath: "x",
        policy: "proximity",
        trigger: {
          kind: "sphere",
          center: { x: 0, y: 0, z: 0 },
          radius: 0,
        },
      },
    ];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects self-dependency", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        sourcePath: "x",
        policy: "on-demand",
        dependsOn: ["a"],
      },
    ];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate entries in dependsOn", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        sourcePath: "x",
        policy: "on-demand",
        dependsOn: ["b", "b"],
      },
      { id: "b", name: "B", sourcePath: "y", policy: "on-demand" },
    ];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate sublevel ids", () => {
    const bad = [
      { id: "a", name: "A", sourcePath: "x", policy: "on-demand" },
      { id: "a", name: "A2", sourcePath: "y", policy: "on-demand" },
    ];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects dependsOn referencing unknown sublevel", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        sourcePath: "x",
        policy: "on-demand",
        dependsOn: ["ghost"],
      },
    ];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cyclic dependsOn graph", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        sourcePath: "x",
        policy: "on-demand",
        dependsOn: ["b"],
      },
      {
        id: "b",
        name: "B",
        sourcePath: "y",
        policy: "on-demand",
        dependsOn: ["a"],
      },
    ];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown policy", () => {
    const bad = [{ id: "a", name: "A", sourcePath: "x", policy: "teleport" }];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown priority", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        sourcePath: "x",
        policy: "on-demand",
        priority: "urgent",
      },
    ];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown trigger kind", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        sourcePath: "x",
        policy: "proximity",
        trigger: { kind: "tetrahedron", points: [] },
      },
    ];
    expect(LevelStreamingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts tag-based trigger", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        sourcePath: "x",
        policy: "proximity",
        trigger: { kind: "tag", tag: "forest" },
      },
    ];
    expect(LevelStreamingManifestSchema.safeParse(ok).success).toBe(true);
  });
});
