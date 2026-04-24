/**
 * Faithfulness + defensiveness tests for `PluginManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { PluginManifestSchema, type PluginManifest } from "./plugin.js";

const reference: PluginManifest = {
  id: "com.hyperforge.combat",
  name: "Combat",
  version: "1.0.0",
  description: "Reference combat plugin",
  entry: "./dist/index.js",
  author: {
    name: "Hyperforge",
    email: "team@hyperforge.dev",
    url: "https://hyperforge.dev",
  },
  license: "MIT",
  homepage: "https://hyperforge.dev/plugins/combat",
  repository: "https://github.com/hyperforge/combat",
  hyperforgeApi: "0.1.0",
  dependencies: [
    { id: "com.hyperforge.core", versionRange: "^0.1.0", optional: false },
  ],
  loadAfter: ["com.hyperforge.entities"],
  enabledByDefault: true,
  contributions: {
    systems: ["CombatSystem", "PrayerSystem"],
    entities: ["MobEntity"],
    widgets: [],
    manifestSchemas: ["combat", "combat-spells"],
    paletteCategories: ["Combat"],
    toolbarTools: [],
    commands: ["combat.attack", "combat.flee"],
  },
  tags: ["gameplay", "rpg"],
};

describe("PluginManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = PluginManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal manifest", () => {
    const parsed = PluginManifestSchema.parse({
      id: "com.studio.mini",
      name: "Mini",
      version: "0.0.1",
      entry: "./index.js",
      author: { name: "Studio" },
      hyperforgeApi: "0.1.0",
    });
    expect(parsed.license).toBe("UNLICENSED");
    expect(parsed.enabledByDefault).toBe(true);
    expect(parsed.dependencies).toEqual([]);
    expect(parsed.loadAfter).toEqual([]);
    expect(parsed.tags).toEqual([]);
    expect(parsed.contributions.systems).toEqual([]);
  });

  it("rejects non-SemVer version", () => {
    const bad = { ...reference, version: "v1" };
    expect(PluginManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts SemVer with pre-release", () => {
    const ok = { ...reference, version: "1.2.3-beta.4" };
    expect(PluginManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects non-reverse-domain plugin id", () => {
    const bad = { ...reference, id: "combat" };
    expect(PluginManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects uppercase in plugin id", () => {
    const bad = { ...reference, id: "com.Hyperforge.combat" };
    expect(PluginManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects self-dependency", () => {
    const bad = {
      ...reference,
      dependencies: [{ id: reference.id, versionRange: "^1" }],
    };
    expect(PluginManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects self in loadAfter", () => {
    const bad = { ...reference, loadAfter: [reference.id] };
    expect(PluginManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate dependency ids", () => {
    const bad = {
      ...reference,
      dependencies: [
        { id: "com.hyperforge.core", versionRange: "^0.1.0" },
        { id: "com.hyperforge.core", versionRange: "^0.2.0" },
      ],
    };
    expect(PluginManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty entry path", () => {
    const bad = { ...reference, entry: "" };
    expect(PluginManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid author email", () => {
    const bad = {
      ...reference,
      author: { name: "x", email: "not-an-email" },
    };
    expect(PluginManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid homepage url", () => {
    const bad = { ...reference, homepage: "not-a-url" };
    expect(PluginManifestSchema.safeParse(bad).success).toBe(false);
  });
});
