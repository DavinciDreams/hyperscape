/**
 * Tests for the ScreenshotProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { screenshotProvider } from "../ScreenshotProvider";

beforeEach(() => {
  screenshotProvider.unload();
});
afterEach(() => {
  screenshotProvider.unload();
});

const validTarget = {
  id: "diskDefault",
  kind: "saveToDisk" as const,
};

describe("ScreenshotProvider", () => {
  it("starts unloaded", () => {
    expect(screenshotProvider.isLoaded()).toBe(false);
    expect(screenshotProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts baseline {enabled:false}", () => {
    const parsed = screenshotProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.shareTargets).toEqual([]);
    expect(screenshotProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts enabled=true with at least one share target", () => {
    const parsed = screenshotProvider.loadRaw({
      enabled: true,
      shareTargets: [validTarget],
    });
    expect(parsed.shareTargets.length).toBe(1);
  });

  it("loadRaw() rejects enabled=true with no share targets", () => {
    expect(() =>
      screenshotProvider.loadRaw({ enabled: true, shareTargets: [] }),
    ).toThrow();
  });

  it("loadRaw() rejects duplicate share target ids", () => {
    expect(() =>
      screenshotProvider.loadRaw({
        enabled: true,
        shareTargets: [validTarget, { ...validTarget }],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects external kind without endpointNameRef", () => {
    expect(() =>
      screenshotProvider.loadRaw({
        enabled: true,
        shareTargets: [{ id: "ext", kind: "external" }],
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = screenshotProvider.loadRaw({ enabled: false });
    screenshotProvider.unload();
    screenshotProvider.load(parsed);
    expect(screenshotProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    screenshotProvider.loadRaw({
      enabled: true,
      shareTargets: [validTarget],
    });
    const parsed = screenshotProvider.loadRaw({ enabled: false });
    screenshotProvider.hotReload(parsed);
    expect(screenshotProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    screenshotProvider.loadRaw({ enabled: false });
    screenshotProvider.hotReload(null);
    expect(screenshotProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    screenshotProvider.loadRaw({ enabled: false });
    screenshotProvider.unload();
    expect(screenshotProvider.isLoaded()).toBe(false);
  });
});
