/**
 * Tests for the WeaponStylesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { weaponStylesProvider } from "../WeaponStylesProvider";

beforeEach(() => {
  weaponStylesProvider.unload();
});
afterEach(() => {
  weaponStylesProvider.unload();
});

// Zod v4 `z.record(enum, ...)` requires every enum value be present.
const validManifest = {
  $schema: "hyperforge.weapon-styles.v1" as const,
  styles: {
    sword: ["accurate", "aggressive", "defensive", "controlled"] as const,
    axe: ["accurate", "aggressive", "defensive", "controlled"] as const,
    mace: ["accurate", "aggressive", "defensive", "controlled"] as const,
    dagger: ["accurate", "aggressive", "defensive", "controlled"] as const,
    spear: ["controlled"] as const,
    bow: ["accurate", "rapid", "longrange"] as const,
    crossbow: ["accurate", "rapid", "longrange"] as const,
    staff: ["autocast"] as const,
    wand: ["autocast"] as const,
    shield: ["defensive"] as const,
    scimitar: ["accurate", "aggressive", "defensive", "controlled"] as const,
    longsword: ["accurate", "aggressive", "defensive", "controlled"] as const,
    two_hand_sword: ["accurate", "aggressive", "defensive"] as const,
    halberd: ["controlled", "aggressive"] as const,
    none: ["accurate"] as const,
  },
};

describe("WeaponStylesProvider", () => {
  it("starts unloaded", () => {
    expect(weaponStylesProvider.isLoaded()).toBe(false);
    expect(weaponStylesProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — $schema/styles required", () => {
    expect(() => weaponStylesProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() rejects partial styles (enum record must cover all weapons)", () => {
    const bad = { $schema: "hyperforge.weapon-styles.v1", styles: {} };
    expect(() => weaponStylesProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts a full manifest with all weapon types", () => {
    const parsed = weaponStylesProvider.loadRaw(validManifest);
    expect(parsed.styles.sword[0]).toBe("accurate");
  });

  it("loadRaw() rejects empty styles array for a weapon", () => {
    const bad = {
      ...validManifest,
      styles: { ...validManifest.styles, sword: [] },
    };
    expect(() => weaponStylesProvider.loadRaw(bad)).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = weaponStylesProvider.loadRaw(validManifest);
    weaponStylesProvider.unload();
    weaponStylesProvider.load(parsed);
    expect(weaponStylesProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    weaponStylesProvider.loadRaw(validManifest);
    weaponStylesProvider.hotReload(null);
    expect(weaponStylesProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    weaponStylesProvider.loadRaw(validManifest);
    weaponStylesProvider.unload();
    expect(weaponStylesProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(weaponStylesProvider).toBe(weaponStylesProvider);
  });
});
