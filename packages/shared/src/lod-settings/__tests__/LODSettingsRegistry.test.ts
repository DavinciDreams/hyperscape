import { LODSettingsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  LODSettingsMissingDefaultError,
  LODSettingsNotLoadedError,
  LODSettingsRegistry,
} from "../LODSettingsRegistry.js";

function manifest(overrides: Record<string, unknown> = {}) {
  return LODSettingsManifestSchema.parse({
    version: 1,
    distanceThresholds: {
      default: { lod1: 40, imposter: 80, fadeOut: 120 },
      large_tree: { lod1: 80, imposter: 160, fadeOut: 240 },
      ...overrides,
    },
    dissolve: {
      closeRangeStart: 0,
      closeRangeEnd: 1.5,
      transitionDuration: 0.3,
    },
  });
}

describe("LODSettingsRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new LODSettingsRegistry().manifest).toThrow(
      LODSettingsNotLoadedError,
    );
  });

  it("thresholdFor returns per-category entry when present", () => {
    const r = new LODSettingsRegistry(manifest());
    expect(r.thresholdFor("large_tree").lod1).toBe(80);
  });

  it("thresholdFor falls back to default for unknown category", () => {
    const r = new LODSettingsRegistry(manifest());
    expect(r.thresholdFor("ghost").lod1).toBe(40);
  });

  it("throws when no default is set and category missing", () => {
    const raw = LODSettingsManifestSchema.parse({
      version: 1,
      distanceThresholds: {
        large_tree: { lod1: 80, imposter: 160, fadeOut: 240 },
      },
      dissolve: {
        closeRangeStart: 0,
        closeRangeEnd: 1,
        transitionDuration: 0.3,
      },
    });
    const r = new LODSettingsRegistry(raw);
    expect(() => r.thresholdFor("ghost")).toThrow(
      LODSettingsMissingDefaultError,
    );
  });

  it("levelForDistance classifies correctly", () => {
    const r = new LODSettingsRegistry(manifest());
    // default: lod1=40, imposter=80, fadeOut=120
    expect(r.levelForDistance("default", 0)).toBe("lod0");
    expect(r.levelForDistance("default", 39.9)).toBe("lod0");
    expect(r.levelForDistance("default", 40)).toBe("lod1");
    expect(r.levelForDistance("default", 79.9)).toBe("lod1");
    expect(r.levelForDistance("default", 80)).toBe("imposter");
    expect(r.levelForDistance("default", 119.9)).toBe("imposter");
    expect(r.levelForDistance("default", 120)).toBe("culled");
    expect(r.levelForDistance("default", 999)).toBe("culled");
  });

  it("dissolve surfaces the transition block", () => {
    const r = new LODSettingsRegistry(manifest());
    expect(r.dissolve.transitionDuration).toBe(0.3);
  });

  it("lists categories", () => {
    const r = new LODSettingsRegistry(manifest());
    expect(r.categories().sort()).toEqual(["default", "large_tree"]);
    expect(r.hasCategory("large_tree")).toBe(true);
    expect(r.hasCategory("ghost")).toBe(false);
  });
});

describe("LODSettingsRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new LODSettingsRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new LODSettingsRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new LODSettingsRegistry();
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
