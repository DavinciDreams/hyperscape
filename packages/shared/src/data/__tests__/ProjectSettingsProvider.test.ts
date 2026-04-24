/**
 * Tests for the ProjectSettingsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { projectSettingsProvider } from "../ProjectSettingsProvider";

beforeEach(() => {
  projectSettingsProvider.unload();
});
afterEach(() => {
  projectSettingsProvider.unload();
});

const validManifest = {
  projectName: "Hyperia",
  gameModeId: "rpgDefault",
};

describe("ProjectSettingsProvider", () => {
  it("starts unloaded", () => {
    expect(projectSettingsProvider.isLoaded()).toBe(false);
    expect(projectSettingsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid minimal manifest", () => {
    const parsed = projectSettingsProvider.loadRaw(validManifest);
    expect(parsed.projectName).toBe("Hyperia");
    expect(parsed.gameModeId).toBe("rpgDefault");
    expect(parsed.plugins).toEqual([]);
    expect(projectSettingsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects missing projectName", () => {
    expect(() =>
      projectSettingsProvider.loadRaw({ gameModeId: "rpgDefault" }),
    ).toThrow();
  });

  it("loadRaw() rejects missing gameModeId", () => {
    expect(() =>
      projectSettingsProvider.loadRaw({ projectName: "Hyperia" }),
    ).toThrow();
  });

  it("loadRaw() rejects empty projectName", () => {
    expect(() =>
      projectSettingsProvider.loadRaw({ ...validManifest, projectName: "" }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = projectSettingsProvider.loadRaw(validManifest);
    projectSettingsProvider.unload();
    projectSettingsProvider.load(parsed);
    expect(projectSettingsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    projectSettingsProvider.loadRaw(validManifest);
    projectSettingsProvider.hotReload(null);
    expect(projectSettingsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    projectSettingsProvider.loadRaw(validManifest);
    projectSettingsProvider.unload();
    expect(projectSettingsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(projectSettingsProvider).toBe(projectSettingsProvider);
  });
});
