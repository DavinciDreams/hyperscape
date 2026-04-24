/**
 * Tests for the SpellVisualsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { spellVisualsProvider } from "../SpellVisualsProvider";

beforeEach(() => {
  spellVisualsProvider.unload();
});
afterEach(() => {
  spellVisualsProvider.unload();
});

const defaultArrow = {
  shaftColor: 0x886633,
  headColor: 0xbbbbbb,
  fletchingColor: 0xff0000,
  length: 1,
  width: 0.05,
  rotateToDirection: true,
  arcHeight: 2,
};

const defaultSpell = {
  color: 0xaa33ff,
  size: 0.4,
  glowIntensity: 0.8,
};

const baseline = {
  $schema: "hyperforge.spell-visuals.v1" as const,
  spells: {},
  arrows: { default: defaultArrow },
  fallbackSpell: defaultSpell,
};

describe("SpellVisualsProvider", () => {
  it("starts unloaded", () => {
    expect(spellVisualsProvider.isLoaded()).toBe(false);
    expect(spellVisualsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — $schema/arrows/fallbackSpell required", () => {
    expect(() => spellVisualsProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() rejects arrows record missing 'default' entry", () => {
    expect(() =>
      spellVisualsProvider.loadRaw({
        ...baseline,
        arrows: { custom: defaultArrow },
      }),
    ).toThrow();
  });

  it("loadRaw() accepts a minimal valid manifest", () => {
    const parsed = spellVisualsProvider.loadRaw(baseline);
    expect(parsed.$schema).toBe("hyperforge.spell-visuals.v1");
    expect(parsed.arrows.default).toBeDefined();
    expect(parsed.fallbackSpell.color).toBe(0xaa33ff);
  });

  it("loadRaw() accepts per-spell visual configs with optional fields", () => {
    const parsed = spellVisualsProvider.loadRaw({
      ...baseline,
      spells: {
        fire_strike: {
          color: 0xff6600,
          coreColor: 0xffffff,
          size: 0.5,
          glowIntensity: 0.9,
          trailLength: 6,
          trailFade: 0.8,
          pulseSpeed: 2,
          pulseAmount: 0.2,
        },
      },
    });
    expect(parsed.spells.fire_strike!.trailLength).toBe(6);
  });

  it("loadRaw() rejects color out of 24-bit range", () => {
    expect(() =>
      spellVisualsProvider.loadRaw({
        ...baseline,
        fallbackSpell: { ...defaultSpell, color: 0x1000000 },
      }),
    ).toThrow();
  });

  it("loadRaw() rejects non-positive arrow length", () => {
    expect(() =>
      spellVisualsProvider.loadRaw({
        ...baseline,
        arrows: { default: { ...defaultArrow, length: 0 } },
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = spellVisualsProvider.loadRaw(baseline);
    spellVisualsProvider.unload();
    spellVisualsProvider.load(parsed);
    expect(spellVisualsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    spellVisualsProvider.loadRaw(baseline);
    spellVisualsProvider.hotReload(null);
    expect(spellVisualsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(spellVisualsProvider).toBe(spellVisualsProvider);
  });
});
