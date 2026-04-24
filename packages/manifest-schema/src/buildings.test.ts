/**
 * Faithfulness test: the buildings manifest is currently an empty array and
 * must accept `[]` as well as flexible placeholder entries until procgen
 * defines the canonical building shape.
 */

import { describe, expect, it } from "vitest";

import {
  BuildingsManifestSchema,
  type BuildingsManifest,
} from "./buildings.js";

describe("BuildingsManifestSchema", () => {
  it("accepts an empty manifest", () => {
    const result = BuildingsManifestSchema.safeParse([] as BuildingsManifest);
    if (!result.success) {
      throw new Error(
        `Empty manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("accepts a placeholder entry with extra passthrough fields", () => {
    const ok = [
      {
        id: "tavern_small",
        footprint: { width: 6, depth: 8 },
        category: "social",
      },
    ];
    const result = BuildingsManifestSchema.safeParse(ok);
    if (!result.success) {
      throw new Error(
        `Passthrough entry failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects an entry with empty id", () => {
    const bad = [{ id: "" }];
    const result = BuildingsManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a non-array manifest", () => {
    const bad = { id: "tavern_small" };
    const result = BuildingsManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
