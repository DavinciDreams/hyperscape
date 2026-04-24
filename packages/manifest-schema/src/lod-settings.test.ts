/**
 * Faithfulness test: a representative LOD settings manifest (matching the
 * shape consumed by the client renderer) MUST parse cleanly.
 */

import { describe, expect, it } from "vitest";

import {
  LODSettingsManifestSchema,
  type LODSettingsManifest,
} from "./lod-settings.js";

const reference: LODSettingsManifest = {
  version: 1,
  distanceThresholds: {
    default: { lod1: 30, imposter: 80, fadeOut: 160 },
    large_tree: { lod1: 60, imposter: 140, fadeOut: 280 },
    grass: { lod1: 15, imposter: 30, fadeOut: 50 },
  },
  dissolve: {
    closeRangeStart: 0,
    closeRangeEnd: 3,
    transitionDuration: 0.25,
  },
};

describe("LODSettingsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = LODSettingsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects non-positive lod1 thresholds", () => {
    const bad: LODSettingsManifest = {
      ...reference,
      distanceThresholds: {
        ...reference.distanceThresholds,
        default: { lod1: 0, imposter: 80, fadeOut: 160 },
      },
    };
    const result = LODSettingsManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects non-positive transitionDuration", () => {
    const bad = {
      ...reference,
      dissolve: { ...reference.dissolve, transitionDuration: 0 },
    };
    const result = LODSettingsManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects non-integer version", () => {
    const bad = { ...reference, version: 1.5 };
    const result = LODSettingsManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
