/**
 * Tests for the EditorSnapProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editorSnapProvider } from "../EditorSnapProvider";

beforeEach(() => {
  editorSnapProvider.unload();
});
afterEach(() => {
  editorSnapProvider.unload();
});

describe("EditorSnapProvider", () => {
  it("starts unloaded", () => {
    expect(editorSnapProvider.isLoaded()).toBe(false);
    expect(editorSnapProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts {} baseline — every field has a default", () => {
    const parsed = editorSnapProvider.loadRaw({});
    expect(parsed.grid.enabled).toBe(true);
    expect(parsed.snapByDefault).toBe(true);
    expect(editorSnapProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts explicit overrides", () => {
    const parsed = editorSnapProvider.loadRaw({
      grid: { enabled: false, translate: 0.5, rotate: 5, scale: 0.01 },
      snapByDefault: false,
    });
    expect(parsed.grid.enabled).toBe(false);
    expect(parsed.snapByDefault).toBe(false);
  });

  it("loadRaw() rejects invalid grid step (negative)", () => {
    expect(() =>
      editorSnapProvider.loadRaw({ grid: { enabled: true, translate: -1 } }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = editorSnapProvider.loadRaw({});
    editorSnapProvider.unload();
    editorSnapProvider.load(parsed);
    expect(editorSnapProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    editorSnapProvider.loadRaw({});
    editorSnapProvider.hotReload(null);
    expect(editorSnapProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    editorSnapProvider.loadRaw({});
    editorSnapProvider.unload();
    expect(editorSnapProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(editorSnapProvider).toBe(editorSnapProvider);
  });
});
