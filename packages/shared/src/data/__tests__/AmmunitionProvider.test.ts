/**
 * Tests for the AmmunitionProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ammunitionProvider } from "../AmmunitionProvider";

beforeEach(() => {
  ammunitionProvider.unload();
});
afterEach(() => {
  ammunitionProvider.unload();
});

const validManifest = {
  $schema: "hyperforge.ammunition.v1" as const,
  bowTiers: { shortbow: 1 },
  arrows: {
    bronzeArrow: {
      id: "bronzeArrow",
      name: "Bronze Arrow",
      rangedStrength: 7,
      requiredRangedLevel: 1,
      requiredBowTier: 1,
    },
  },
};

describe("AmmunitionProvider", () => {
  it("starts unloaded", () => {
    expect(ammunitionProvider.isLoaded()).toBe(false);
    expect(ammunitionProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — $schema/bowTiers/arrows required", () => {
    expect(() => ammunitionProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts a valid minimal manifest", () => {
    const parsed = ammunitionProvider.loadRaw(validManifest);
    expect(parsed.$schema).toBe("hyperforge.ammunition.v1");
    expect(parsed.arrows.bronzeArrow!.name).toBe("Bronze Arrow");
  });

  it("loadRaw() rejects negative rangedStrength", () => {
    const bad = {
      ...validManifest,
      arrows: {
        bronzeArrow: {
          ...validManifest.arrows.bronzeArrow,
          rangedStrength: -1,
        },
      },
    };
    expect(() => ammunitionProvider.loadRaw(bad)).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = ammunitionProvider.loadRaw(validManifest);
    ammunitionProvider.unload();
    ammunitionProvider.load(parsed);
    expect(ammunitionProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    ammunitionProvider.loadRaw(validManifest);
    ammunitionProvider.hotReload(null);
    expect(ammunitionProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    ammunitionProvider.loadRaw(validManifest);
    ammunitionProvider.unload();
    expect(ammunitionProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(ammunitionProvider).toBe(ammunitionProvider);
  });
});
