import { describe, expect, it } from "vitest";

import {
  WorldStructureManifestSchema,
  type WorldStructureManifest,
} from "./world-structure.js";

const hyperscapeWorldStructure: WorldStructureManifest = {
  $schema: "hyperforge.world-structure.v1",
  constants: {
    gridSize: 4,
    defaultSpawnHeight: 2,
    waterLevel: 16,
    maxBuildHeight: 100,
    safeZoneRadius: 15,
  },
};

describe("WorldStructureManifestSchema", () => {
  it("parses a realistic manifest cleanly", () => {
    const result = WorldStructureManifestSchema.safeParse(
      hyperscapeWorldStructure,
    );
    if (!result.success) {
      throw new Error(
        `World structure manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects non-positive grid size", () => {
    const bad = {
      ...hyperscapeWorldStructure,
      constants: { ...hyperscapeWorldStructure.constants, gridSize: 0 },
    };
    expect(WorldStructureManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-positive safeZoneRadius", () => {
    const bad = {
      ...hyperscapeWorldStructure,
      constants: { ...hyperscapeWorldStructure.constants, safeZoneRadius: 0 },
    };
    expect(WorldStructureManifestSchema.safeParse(bad).success).toBe(false);
  });
});
