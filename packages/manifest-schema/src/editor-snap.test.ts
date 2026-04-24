/**
 * Faithfulness + defensiveness tests for `EditorSnapManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  EditorSnapManifestSchema,
  type EditorSnapManifest,
} from "./editor-snap.js";

const reference: EditorSnapManifest = {
  grid: { enabled: true, translate: 0.5, rotate: 45, scale: 0.25 },
  surface: {
    enabled: true,
    tolerance: 0.25,
    alignToNormal: true,
    mode: "both",
  },
  gizmo: { space: "world", pivot: "individual", size: 1.25 },
  snapByDefault: true,
};

describe("EditorSnapManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = EditorSnapManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies full defaults when given an empty object", () => {
    const parsed = EditorSnapManifestSchema.parse({});
    expect(parsed.grid.enabled).toBe(true);
    expect(parsed.grid.translate).toBe(1.0);
    expect(parsed.grid.rotate).toBe(15);
    expect(parsed.grid.scale).toBe(0.1);
    expect(parsed.surface.enabled).toBe(false);
    expect(parsed.surface.tolerance).toBe(0.5);
    expect(parsed.surface.alignToNormal).toBe(true);
    expect(parsed.surface.mode).toBe("surface");
    expect(parsed.gizmo.space).toBe("local");
    expect(parsed.gizmo.pivot).toBe("center");
    expect(parsed.gizmo.size).toBe(1.0);
    expect(parsed.snapByDefault).toBe(true);
  });

  it("rejects zero translate step", () => {
    const bad = {
      ...reference,
      grid: { ...reference.grid, translate: 0 },
    };
    expect(EditorSnapManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative rotate step", () => {
    const bad = {
      ...reference,
      grid: { ...reference.grid, rotate: -15 },
    };
    expect(EditorSnapManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects zero scale step", () => {
    const bad = {
      ...reference,
      grid: { ...reference.grid, scale: 0 },
    };
    expect(EditorSnapManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects zero surface tolerance", () => {
    const bad = {
      ...reference,
      surface: { ...reference.surface, tolerance: 0 },
    };
    expect(EditorSnapManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown surface mode", () => {
    const bad = {
      ...reference,
      surface: { ...reference.surface, mode: "edge" },
    };
    expect(EditorSnapManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown gizmo space", () => {
    const bad = {
      ...reference,
      gizmo: { ...reference.gizmo, space: "screen" },
    };
    expect(EditorSnapManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown gizmo pivot", () => {
    const bad = {
      ...reference,
      gizmo: { ...reference.gizmo, pivot: "origin" },
    };
    expect(EditorSnapManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative gizmo size", () => {
    const bad = {
      ...reference,
      gizmo: { ...reference.gizmo, size: -1 },
    };
    expect(EditorSnapManifestSchema.safeParse(bad).success).toBe(false);
  });
});
