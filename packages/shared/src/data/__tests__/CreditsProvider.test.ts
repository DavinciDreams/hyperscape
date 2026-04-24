/**
 * Tests for the CreditsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { creditsProvider } from "../CreditsProvider";

beforeEach(() => {
  creditsProvider.unload();
});
afterEach(() => {
  creditsProvider.unload();
});

describe("CreditsProvider", () => {
  it("starts unloaded", () => {
    expect(creditsProvider.isLoaded()).toBe(false);
    expect(creditsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts disabled baseline", () => {
    const parsed = creditsProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(creditsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects default-enabled empty manifest (requires sections)", () => {
    expect(() => creditsProvider.loadRaw({})).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = creditsProvider.loadRaw({ enabled: false });
    creditsProvider.unload();
    creditsProvider.load(parsed);
    expect(creditsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    creditsProvider.loadRaw({ enabled: false });
    creditsProvider.hotReload(null);
    expect(creditsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    creditsProvider.loadRaw({ enabled: false });
    creditsProvider.unload();
    expect(creditsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(creditsProvider).toBe(creditsProvider);
  });
});
