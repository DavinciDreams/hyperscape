/**
 * Tests for MobLootTableMappings manifest schema.
 */
import { describe, expect, it } from "vitest";

import { MobLootTableMappingsManifestSchema } from "./mob-loot-table-mappings.js";

describe("MobLootTableMappingsManifestSchema", () => {
  it("accepts an empty mapping", () => {
    const parsed = MobLootTableMappingsManifestSchema.parse({});
    expect(parsed).toEqual({});
  });

  it("accepts a standard mobType → tableId map", () => {
    const input = {
      goblin: "goblin-drops",
      giant_rat: "rat-drops",
      dark_knight: "boss-tier-3",
    };
    const parsed = MobLootTableMappingsManifestSchema.parse(input);
    expect(parsed).toEqual(input);
  });

  it("rejects empty mobType keys", () => {
    expect(() =>
      MobLootTableMappingsManifestSchema.parse({ "": "some-table" }),
    ).toThrow();
  });

  it("rejects empty tableId values", () => {
    expect(() =>
      MobLootTableMappingsManifestSchema.parse({ goblin: "" }),
    ).toThrow();
  });

  it("rejects non-string tableId values", () => {
    expect(() =>
      MobLootTableMappingsManifestSchema.parse({ goblin: 42 }),
    ).toThrow();
  });

  it("rejects arrays (not a record)", () => {
    expect(() =>
      MobLootTableMappingsManifestSchema.parse(["goblin", "drop"]),
    ).toThrow();
  });
});
