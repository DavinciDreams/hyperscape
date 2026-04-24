/**
 * Faithfulness + defensiveness tests for `SoundEffectManifestSchema`.
 *
 * A representative pack (UI click, combat hit, footstep, voice line)
 * must parse cleanly; obvious typos (unknown category, negative
 * duration, out-of-range volume) must fail.
 */

import { describe, expect, it } from "vitest";

import { SoundEffectManifestSchema, type SoundEffectManifest } from "./sfx.js";

const reference: SoundEffectManifest = [
  {
    id: "ui_click",
    name: "UI Click",
    category: "ui",
    path: "asset://sfx/ui_click.ogg",
    description: "Generic button tick",
    duration: 0.12,
    volume: 0.8,
    pitchVariance: 0,
    cullable: false,
  },
  {
    id: "combat_hit_blunt",
    name: "Blunt Hit",
    category: "combat",
    path: "asset://sfx/combat_hit_blunt.wav",
    description: "Mace / fist impact",
    duration: 0.6,
    volume: 1,
    pitchVariance: 0.3,
    cullable: true,
  },
  {
    id: "footstep_grass",
    name: "Grass Footstep",
    category: "footstep",
    path: "asset://sfx/footstep_grass.ogg",
    description: "Player footstep on grass",
    duration: 0.3,
    volume: 0.5,
    pitchVariance: 0.25,
    cullable: true,
  },
  {
    id: "voice_quest_accept",
    name: "Quest Accept Voice",
    category: "voice",
    path: "asset://sfx/voice_quest_accept.ogg",
    description: "NPC approval vocalization",
    duration: 1.4,
    volume: 1,
    pitchVariance: 0,
    cullable: false,
  },
];

describe("SoundEffectManifestSchema", () => {
  it("parses the reference pack cleanly", () => {
    const result = SoundEffectManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference pack failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("accepts minimal entry with schema defaults", () => {
    const minimal = [
      {
        id: "tick",
        name: "Tick",
        category: "ui",
        path: "asset://sfx/tick.ogg",
      },
    ];
    const parsed = SoundEffectManifestSchema.parse(minimal);
    expect(parsed[0].volume).toBe(1);
    expect(parsed[0].pitchVariance).toBe(0);
    expect(parsed[0].cullable).toBe(false);
    expect(parsed[0].duration).toBe(0);
    expect(parsed[0].description).toBe("");
  });

  it("rejects unknown category", () => {
    const bad = [{ ...reference[0], category: "cinematic" }];
    expect(SoundEffectManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative duration", () => {
    const bad = [{ ...reference[0], duration: -0.1 }];
    expect(SoundEffectManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects volume above 1", () => {
    const bad = [{ ...reference[0], volume: 1.5 }];
    expect(SoundEffectManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative pitchVariance", () => {
    const bad = [{ ...reference[0], pitchVariance: -0.2 }];
    expect(SoundEffectManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty path", () => {
    const bad = [{ ...reference[0], path: "" }];
    expect(SoundEffectManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects missing id", () => {
    const bad = [{ ...reference[0], id: "" }];
    expect(SoundEffectManifestSchema.safeParse(bad).success).toBe(false);
  });
});
