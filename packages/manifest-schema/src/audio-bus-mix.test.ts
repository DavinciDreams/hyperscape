/**
 * Faithfulness + defensiveness tests for `AudioBusMixManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  AudioBusMixManifestSchema,
  type AudioBusMixManifest,
} from "./audio-bus-mix.js";

const reference: AudioBusMixManifest = {
  masterVolumeDb: 0,
  buses: [
    {
      id: "master",
      name: "Master",
      parent: "",
      volumeDb: 0,
      muted: false,
      solo: false,
      lowpassHz: 0,
      highpassHz: 0,
    },
    {
      id: "music",
      name: "Music",
      parent: "master",
      volumeDb: -3,
      muted: false,
      solo: false,
      lowpassHz: 0,
      highpassHz: 0,
    },
    {
      id: "sfx",
      name: "SFX",
      parent: "master",
      volumeDb: 0,
      muted: false,
      solo: false,
      lowpassHz: 0,
      highpassHz: 0,
    },
    {
      id: "ambient",
      name: "Ambient",
      parent: "sfx",
      volumeDb: -6,
      muted: false,
      solo: false,
      lowpassHz: 0,
      highpassHz: 0,
    },
    {
      id: "ui",
      name: "UI",
      parent: "master",
      volumeDb: -3,
      muted: false,
      solo: false,
      lowpassHz: 0,
      highpassHz: 0,
    },
    {
      id: "dialogue",
      name: "Dialogue",
      parent: "master",
      volumeDb: 0,
      muted: false,
      solo: false,
      lowpassHz: 0,
      highpassHz: 0,
    },
  ],
  duckRules: [
    {
      trigger: "dialogue",
      target: "music",
      attenuationToLinear: 0.3,
      attackSec: 0.15,
      releaseSec: 0.5,
      thresholdLinear: 0.05,
    },
    {
      trigger: "sfx",
      target: "ambient",
      attenuationToLinear: 0.5,
      attackSec: 0.05,
      releaseSec: 0.3,
      thresholdLinear: 0.1,
    },
  ],
};

describe("AudioBusMixManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = AudioBusMixManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults to a minimal manifest", () => {
    const parsed = AudioBusMixManifestSchema.parse({
      buses: [{ id: "master", name: "Master" }],
    });
    expect(parsed.masterVolumeDb).toBe(0);
    expect(parsed.buses[0].parent).toBe("");
    expect(parsed.buses[0].volumeDb).toBe(0);
    expect(parsed.buses[0].muted).toBe(false);
    expect(parsed.buses[0].solo).toBe(false);
    expect(parsed.buses[0].lowpassHz).toBe(0);
    expect(parsed.buses[0].highpassHz).toBe(0);
    expect(parsed.duckRules).toEqual([]);
  });

  it("rejects empty buses array", () => {
    expect(AudioBusMixManifestSchema.safeParse({ buses: [] }).success).toBe(
      false,
    );
  });

  it("rejects duplicate bus ids", () => {
    const bad = {
      buses: [
        { id: "x", name: "X" },
        { id: "x", name: "X2" },
      ],
    };
    expect(AudioBusMixManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bus with unknown parent", () => {
    const bad = {
      buses: [{ id: "x", name: "X", parent: "ghost" }],
    };
    expect(AudioBusMixManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bus that is its own parent", () => {
    const bad = {
      buses: [{ id: "x", name: "X", parent: "x" }],
    };
    expect(AudioBusMixManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cyclic parent graph", () => {
    const bad = {
      buses: [
        { id: "a", name: "A", parent: "b" },
        { id: "b", name: "B", parent: "a" },
      ],
    };
    expect(AudioBusMixManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duck rule where trigger === target", () => {
    const bad = {
      buses: [{ id: "music", name: "Music" }],
      duckRules: [{ trigger: "music", target: "music" }],
    };
    expect(AudioBusMixManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duck rule referencing unknown bus", () => {
    const bad = {
      buses: [{ id: "music", name: "Music" }],
      duckRules: [{ trigger: "music", target: "ghost" }],
    };
    expect(AudioBusMixManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate duck rules on same (trigger, target) pair", () => {
    const bad = {
      buses: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      duckRules: [
        { trigger: "a", target: "b", attenuationToLinear: 0.2 },
        { trigger: "a", target: "b", attenuationToLinear: 0.5 },
      ],
    };
    expect(AudioBusMixManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects attenuation > 1", () => {
    const bad = {
      buses: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      duckRules: [{ trigger: "a", target: "b", attenuationToLinear: 1.5 }],
    };
    expect(AudioBusMixManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects volumeDb outside [-96, 12]", () => {
    const badLow = {
      buses: [{ id: "a", name: "A", volumeDb: -100 }],
    };
    const badHigh = {
      buses: [{ id: "a", name: "A", volumeDb: 24 }],
    };
    expect(AudioBusMixManifestSchema.safeParse(badLow).success).toBe(false);
    expect(AudioBusMixManifestSchema.safeParse(badHigh).success).toBe(false);
  });

  it("rejects lowpassHz > 22050", () => {
    const bad = {
      buses: [{ id: "a", name: "A", lowpassHz: 50000 }],
    };
    expect(AudioBusMixManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects attackSec > 10", () => {
    const bad = {
      buses: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      duckRules: [{ trigger: "a", target: "b", attackSec: 20 }],
    };
    expect(AudioBusMixManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid bus id format", () => {
    const bad = {
      buses: [{ id: "Has Spaces", name: "X" }],
    };
    expect(AudioBusMixManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects masterVolumeDb > 12", () => {
    const bad = {
      masterVolumeDb: 20,
      buses: [{ id: "master", name: "Master" }],
    };
    expect(AudioBusMixManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts a single root bus with no duck rules", () => {
    const ok = {
      buses: [{ id: "master", name: "Master" }],
    };
    expect(AudioBusMixManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts muted + solo flags together (engine decides precedence)", () => {
    const ok = {
      buses: [{ id: "a", name: "A", muted: true, solo: true }],
    };
    expect(AudioBusMixManifestSchema.safeParse(ok).success).toBe(true);
  });
});
