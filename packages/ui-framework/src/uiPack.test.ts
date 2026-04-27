/**
 * Tests for UIPackManifestSchema — the D9 ui-pack.json shape.
 */

import { describe, expect, it } from "vitest";

import { UILayoutManifestSchema } from "./layout";
import {
  UIPackManifestSchema,
  validateUIPackManifest,
  type UIPackManifest,
} from "./uiPack";

const minimalLayout = UILayoutManifestSchema.parse({
  id: "test-layout",
  name: "Test Layout",
  instances: [],
});

const minimalPack: UIPackManifest = {
  version: 1,
  id: "test-pack",
  name: "Test Pack",
  widgets: [],
  layouts: { default: minimalLayout },
};

describe("UIPackManifestSchema", () => {
  it("accepts a minimal valid pack", () => {
    const parsed = UIPackManifestSchema.parse(minimalPack);
    expect(parsed.id).toBe("test-pack");
    expect(parsed.layouts.default).toBeDefined();
  });

  it("requires a 'default' layout", () => {
    const result = UIPackManifestSchema.safeParse({
      ...minimalPack,
      layouts: { minimal: minimalLayout },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("default")),
      ).toBe(true);
    }
  });

  it("rejects a pack with empty layouts map", () => {
    const result = UIPackManifestSchema.safeParse({
      ...minimalPack,
      layouts: {},
    });
    expect(result.success).toBe(false);
  });

  it("accepts multiple layout variants when 'default' is present", () => {
    const parsed = UIPackManifestSchema.parse({
      ...minimalPack,
      layouts: {
        default: minimalLayout,
        minimal: minimalLayout,
        mobile: minimalLayout,
      },
    });
    expect(Object.keys(parsed.layouts).sort()).toEqual([
      "default",
      "minimal",
      "mobile",
    ]);
  });

  it("rejects empty id / name", () => {
    expect(
      UIPackManifestSchema.safeParse({ ...minimalPack, id: "" }).success,
    ).toBe(false);
    expect(
      UIPackManifestSchema.safeParse({ ...minimalPack, name: "" }).success,
    ).toBe(false);
  });

  it("widgets default to an empty array when omitted", () => {
    const { widgets, ...rest } = minimalPack;
    void widgets;
    const parsed = UIPackManifestSchema.parse(rest);
    expect(parsed.widgets).toEqual([]);
  });

  it("accepts a widget catalog entry with optional defaults", () => {
    const parsed = UIPackManifestSchema.parse({
      ...minimalPack,
      widgets: [
        { id: "hyperforge.hud.hp-bar" },
        { id: "hyperforge.hud.minimap", defaults: { size: 200 } },
      ],
    });
    expect(parsed.widgets).toHaveLength(2);
    expect(parsed.widgets[1]?.defaults).toEqual({ size: 200 });
  });

  it("rejects a widget catalog entry with empty id", () => {
    const result = UIPackManifestSchema.safeParse({
      ...minimalPack,
      widgets: [{ id: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional theme block", () => {
    const parsed = UIPackManifestSchema.parse({
      ...minimalPack,
      theme: {
        id: "test-theme",
        name: "Test",
      },
    });
    expect(parsed.theme?.id).toBe("test-theme");
  });

  it("accepts metadata as free-form JSON-safe record", () => {
    const parsed = UIPackManifestSchema.parse({
      ...minimalPack,
      metadata: { author: "test", priority: 1, tags: ["hud", "core"] },
    });
    expect(parsed.metadata).toEqual({
      author: "test",
      priority: 1,
      tags: ["hud", "core"],
    });
  });

  it("rejects unknown version", () => {
    const result = UIPackManifestSchema.safeParse({
      ...minimalPack,
      version: 2,
    });
    expect(result.success).toBe(false);
  });

  it("validateUIPackManifest returns ok for a valid pack", () => {
    const result = validateUIPackManifest(minimalPack);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe("test-pack");
  });

  it("validateUIPackManifest returns error for an invalid pack", () => {
    const result = validateUIPackManifest({ version: 1, id: "x" });
    expect(result.ok).toBe(false);
  });
});
