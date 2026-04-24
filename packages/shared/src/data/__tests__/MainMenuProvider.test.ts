/**
 * Tests for the MainMenuProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mainMenuProvider } from "../MainMenuProvider";

beforeEach(() => {
  mainMenuProvider.unload();
});
afterEach(() => {
  mainMenuProvider.unload();
});

describe("MainMenuProvider", () => {
  it("starts unloaded", () => {
    expect(mainMenuProvider.isLoaded()).toBe(false);
    expect(mainMenuProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts disabled baseline", () => {
    const parsed = mainMenuProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(mainMenuProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects default-enabled empty manifest (requires menus + rootMenuId)", () => {
    expect(() => mainMenuProvider.loadRaw({})).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = mainMenuProvider.loadRaw({ enabled: false });
    mainMenuProvider.unload();
    mainMenuProvider.load(parsed);
    expect(mainMenuProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    mainMenuProvider.loadRaw({ enabled: false });
    mainMenuProvider.hotReload(null);
    expect(mainMenuProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    mainMenuProvider.loadRaw({ enabled: false });
    mainMenuProvider.unload();
    expect(mainMenuProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(mainMenuProvider).toBe(mainMenuProvider);
  });
});
