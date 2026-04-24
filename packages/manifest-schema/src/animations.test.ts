/**
 * Faithfulness + defensiveness tests for `AnimationManifestSchema`.
 *
 * A representative pack (human rig covering idle/walk/run/attack/death
 * plus a dual-wield variant) must parse cleanly; typos should fail.
 */

import { describe, expect, it } from "vitest";

import {
  AnimationManifestSchema,
  type AnimationManifest,
} from "./animations.js";

const reference: AnimationManifest = {
  clips: [
    {
      id: "human_idle",
      name: "Human Idle",
      path: "asset://anim/human_idle.glb",
      description: "Standard breathing idle",
      duration: 2.4,
      speed: 1,
      loop: true,
      blendIn: 0.2,
      blendOut: 0.2,
      tags: [],
    },
    {
      id: "human_walk",
      name: "Human Walk",
      path: "asset://anim/human_walk.glb",
      description: "Forward walk cycle",
      duration: 1,
      speed: 1,
      loop: true,
      blendIn: 0.15,
      blendOut: 0.15,
      tags: [],
    },
    {
      id: "human_attack_slash",
      name: "Human Attack Slash",
      path: "asset://anim/human_attack_slash.glb",
      description: "Right-hand slash",
      duration: 0.8,
      speed: 1.1,
      loop: false,
      blendIn: 0.08,
      blendOut: 0.08,
      tags: ["onehand", "right"],
    },
    {
      id: "human_death",
      name: "Human Death",
      path: "asset://anim/human_death.glb",
      description: "Forward collapse",
      duration: 1.6,
      speed: 1,
      loop: false,
      blendIn: 0.1,
      blendOut: 0,
      tags: [],
    },
  ],
  bindings: [
    { rigId: "human_male", action: "idle", clipId: "human_idle" },
    { rigId: "human_male", action: "walk", clipId: "human_walk" },
    {
      rigId: "human_male",
      action: "attack_melee",
      clipId: "human_attack_slash",
      speed: 1.2,
    },
    { rigId: "human_male", action: "death", clipId: "human_death" },
  ],
};

describe("AnimationManifestSchema", () => {
  it("parses the reference pack cleanly", () => {
    const result = AnimationManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference pack failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on an empty manifest", () => {
    const parsed = AnimationManifestSchema.parse({});
    expect(parsed.clips).toEqual([]);
    expect(parsed.bindings).toEqual([]);
  });

  it("applies defaults on a minimal clip", () => {
    const parsed = AnimationManifestSchema.parse({
      clips: [{ id: "c", name: "C", path: "asset://c.glb" }],
    });
    expect(parsed.clips[0].duration).toBe(0);
    expect(parsed.clips[0].speed).toBe(1);
    expect(parsed.clips[0].loop).toBe(false);
    expect(parsed.clips[0].blendIn).toBeCloseTo(0.15);
    expect(parsed.clips[0].blendOut).toBeCloseTo(0.15);
    expect(parsed.clips[0].tags).toEqual([]);
  });

  it("rejects unknown action", () => {
    const bad = {
      bindings: [{ rigId: "r", action: "taunt", clipId: "c" }],
    };
    expect(AnimationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative duration", () => {
    const bad = {
      clips: [{ id: "c", name: "C", path: "asset://c.glb", duration: -1 }],
    };
    expect(AnimationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-positive speed", () => {
    const bad = {
      clips: [{ id: "c", name: "C", path: "asset://c.glb", speed: 0 }],
    };
    expect(AnimationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative blendIn", () => {
    const bad = {
      clips: [{ id: "c", name: "C", path: "asset://c.glb", blendIn: -0.01 }],
    };
    expect(AnimationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty path", () => {
    const bad = { clips: [{ id: "c", name: "C", path: "" }] };
    expect(AnimationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects binding with empty rigId", () => {
    const bad = {
      bindings: [{ rigId: "", action: "idle", clipId: "c" }],
    };
    expect(AnimationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects binding with empty clipId", () => {
    const bad = {
      bindings: [{ rigId: "r", action: "idle", clipId: "" }],
    };
    expect(AnimationManifestSchema.safeParse(bad).success).toBe(false);
  });
});
