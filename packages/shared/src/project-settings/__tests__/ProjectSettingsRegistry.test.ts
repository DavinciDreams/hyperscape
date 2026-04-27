import { ProjectSettingsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  ProjectSettingsNotLoadedError,
  ProjectSettingsRegistry,
  UnknownPluginIdError,
} from "../ProjectSettingsRegistry.js";

function manifest() {
  return ProjectSettingsManifestSchema.parse({
    projectName: "Hyperscape",
    gameModeId: "hyperia",
    plugins: [
      { id: "com.studio.core", version: "1.0.0", enabled: true },
      { id: "com.studio.extras", version: "2.1.0", enabled: false },
    ],
    defaultInputScheme: "keyboard-mouse",
    defaultLocale: "en-US",
    worldSeed: "seed-42",
    pieFlags: { skipIntro: true, devConsole: false },
  });
}

describe("ProjectSettingsRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new ProjectSettingsRegistry().manifest).toThrow(
      ProjectSettingsNotLoadedError,
    );
  });

  it("exposes top-level getters", () => {
    const r = new ProjectSettingsRegistry(manifest());
    expect(r.projectName).toBe("Hyperscape");
    expect(r.gameModeId).toBe("hyperia");
    expect(r.defaultLocale).toBe("en-US");
    expect(r.defaultInputScheme).toBe("keyboard-mouse");
    expect(r.worldSeed).toBe("seed-42");
    expect(r.renderConfig.preset).toBe("medium");
  });

  it("plugin lookup + unknown error", () => {
    const r = new ProjectSettingsRegistry(manifest());
    expect(r.plugin("com.studio.core").version).toBe("1.0.0");
    expect(() => r.plugin("com.studio.ghost")).toThrow(UnknownPluginIdError);
  });

  it("enabledPlugins filters by enabled flag", () => {
    const r = new ProjectSettingsRegistry(manifest());
    expect(r.enabledPlugins().map((p) => p.id)).toEqual(["com.studio.core"]);
  });

  it("isPluginEnabled reflects flag", () => {
    const r = new ProjectSettingsRegistry(manifest());
    expect(r.isPluginEnabled("com.studio.core")).toBe(true);
    expect(r.isPluginEnabled("com.studio.extras")).toBe(false);
    expect(r.isPluginEnabled("com.studio.ghost")).toBe(false);
  });

  it("pieFlag returns set value, falls back otherwise", () => {
    const r = new ProjectSettingsRegistry(manifest());
    expect(r.pieFlag("skipIntro")).toBe(true);
    expect(r.pieFlag("devConsole")).toBe(false);
    expect(r.pieFlag("unknown")).toBe(false);
    expect(r.pieFlag("unknown", true)).toBe(true);
  });

  it("pieFlagKeys lists all set keys", () => {
    const r = new ProjectSettingsRegistry(manifest());
    expect(r.pieFlagKeys().sort()).toEqual(["devConsole", "skipIntro"]);
  });
});

describe("ProjectSettingsRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new ProjectSettingsRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new ProjectSettingsRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new ProjectSettingsRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
