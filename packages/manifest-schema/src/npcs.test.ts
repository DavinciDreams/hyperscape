import { describe, expect, it } from "vitest";

import { NpcsManifestSchema, type NpcsManifest } from "./npcs.js";

const hyperscapeNpcs: NpcsManifest = {
  $schema: "hyperforge.npcs.v1",
  spawnConstants: {
    globalRespawnTime: 900000,
    maxNpcsPerZone: 10,
    spawnRadiusCheck: 5,
    aggroLevelThreshold: 5,
  },
};

describe("NpcsManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = NpcsManifestSchema.safeParse(hyperscapeNpcs);
    if (!result.success) {
      throw new Error(
        `Hyperscape npcs manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects non-integer respawn time", () => {
    const bad = {
      ...hyperscapeNpcs,
      spawnConstants: {
        ...hyperscapeNpcs.spawnConstants,
        globalRespawnTime: 1.5,
      },
    };
    expect(NpcsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects zero max npcs per zone", () => {
    const bad = {
      ...hyperscapeNpcs,
      spawnConstants: { ...hyperscapeNpcs.spawnConstants, maxNpcsPerZone: 0 },
    };
    expect(NpcsManifestSchema.safeParse(bad).success).toBe(false);
  });
});
