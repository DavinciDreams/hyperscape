/**
 * Tests for the RenderProfilesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderProfilesProvider } from "../RenderProfilesProvider";

beforeEach(() => {
  renderProfilesProvider.unload();
});
afterEach(() => {
  renderProfilesProvider.unload();
});

const validManifest = [
  {
    id: "default",
    name: "Default",
    toneMapping: "aces-filmic" as const,
    exposure: 1.0,
  },
  {
    id: "dungeon",
    name: "Dungeon",
    toneMapping: "reinhard" as const,
    exposure: 0.6,
    fog: {
      mode: "exp2" as const,
      color: "#101015",
      density: 0.08,
      near: 1,
      far: 100,
    },
  },
];

describe("RenderProfilesProvider", () => {
  it("starts unloaded", () => {
    expect(renderProfilesProvider.isLoaded()).toBe(false);
    expect(renderProfilesProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and defaults missing fields", () => {
    const parsed = renderProfilesProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(2);
    expect(parsed[0].bloom.enabled).toBe(true);
    expect(parsed[0].colorGrading.enabled).toBe(true);
    expect(renderProfilesProvider.isLoaded()).toBe(true);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = renderProfilesProvider.loadRaw(validManifest);
    renderProfilesProvider.unload();
    renderProfilesProvider.load(parsed);
    expect(renderProfilesProvider.isLoaded()).toBe(true);
    expect(renderProfilesProvider.getManifest()?.length).toBe(2);
  });

  it("loadRaw() rejects an empty array (min 1 profile)", () => {
    expect(() => renderProfilesProvider.loadRaw([])).toThrow();
    expect(renderProfilesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate profile ids", () => {
    const dup = [
      { id: "x", name: "X" },
      { id: "x", name: "Y" },
    ];
    expect(() => renderProfilesProvider.loadRaw(dup)).toThrow();
    expect(renderProfilesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects invalid toneMapping operator", () => {
    const bad = [{ id: "x", name: "X", toneMapping: "disco" }];
    expect(() => renderProfilesProvider.loadRaw(bad)).toThrow();
    expect(renderProfilesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects exposure out of [0, 8]", () => {
    const bad = [{ id: "x", name: "X", exposure: 50 }];
    expect(() => renderProfilesProvider.loadRaw(bad)).toThrow();
    expect(renderProfilesProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    renderProfilesProvider.loadRaw(validManifest);
    const replacement = renderProfilesProvider.loadRaw([
      { id: "only", name: "Only" },
    ]);
    renderProfilesProvider.hotReload(replacement);
    expect(renderProfilesProvider.getManifest()?.length).toBe(1);
    expect(renderProfilesProvider.getManifest()?.[0].id).toBe("only");
  });

  it("hotReload(null) clears", () => {
    renderProfilesProvider.loadRaw(validManifest);
    renderProfilesProvider.hotReload(null);
    expect(renderProfilesProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    renderProfilesProvider.loadRaw(validManifest);
    renderProfilesProvider.unload();
    expect(renderProfilesProvider.isLoaded()).toBe(false);
    expect(renderProfilesProvider.getManifest()).toBeNull();
  });
});
