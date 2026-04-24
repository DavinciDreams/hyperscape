/**
 * Tests for the LoadingScreensProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadingScreensProvider } from "../LoadingScreensProvider";

beforeEach(() => {
  loadingScreensProvider.unload();
});
afterEach(() => {
  loadingScreensProvider.unload();
});

const validSlate = {
  id: "defaultSlate",
  backgroundAssetRef: "loadingBgDefault",
};

describe("LoadingScreensProvider", () => {
  it("starts unloaded", () => {
    expect(loadingScreensProvider.isLoaded()).toBe(false);
    expect(loadingScreensProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts baseline {enabled:false}", () => {
    const parsed = loadingScreensProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.slates).toEqual([]);
    expect(loadingScreensProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects enabled=true with no slates", () => {
    expect(() =>
      loadingScreensProvider.loadRaw({ enabled: true, slates: [] }),
    ).toThrow();
  });

  it("loadRaw() accepts enabled=true with at least one slate", () => {
    const parsed = loadingScreensProvider.loadRaw({
      enabled: true,
      slates: [validSlate],
    });
    expect(parsed.slates.length).toBe(1);
  });

  it("loadRaw() rejects duplicate slate ids", () => {
    expect(() =>
      loadingScreensProvider.loadRaw({
        enabled: true,
        slates: [validSlate, { ...validSlate }],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects defaultSlateId that doesn't resolve", () => {
    expect(() =>
      loadingScreensProvider.loadRaw({
        enabled: true,
        slates: [validSlate],
        defaultSlateId: "missing",
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = loadingScreensProvider.loadRaw({ enabled: false });
    loadingScreensProvider.unload();
    loadingScreensProvider.load(parsed);
    expect(loadingScreensProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    loadingScreensProvider.loadRaw({ enabled: false });
    loadingScreensProvider.hotReload(null);
    expect(loadingScreensProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    loadingScreensProvider.loadRaw({ enabled: false });
    loadingScreensProvider.unload();
    expect(loadingScreensProvider.isLoaded()).toBe(false);
  });
});
