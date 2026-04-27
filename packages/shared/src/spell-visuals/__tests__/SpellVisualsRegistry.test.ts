import { SpellVisualsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  SpellVisualsNotLoadedError,
  SpellVisualsRegistry,
} from "../SpellVisualsRegistry.js";

function manifest() {
  return SpellVisualsManifestSchema.parse({
    $schema: "hyperforge.spell-visuals.v1",
    spells: {
      wind_strike: {
        color: 0xccccff,
        size: 0.5,
        glowIntensity: 0.5,
      },
      fire_blast: {
        color: 0xff4400,
        size: 0.8,
        glowIntensity: 0.9,
      },
    },
    arrows: {
      default: {
        shaftColor: 0x8b4513,
        headColor: 0xc0c0c0,
        fletchingColor: 0xffffff,
        length: 1.2,
        width: 0.05,
        rotateToDirection: true,
        arcHeight: 0.3,
      },
      dragon: {
        shaftColor: 0x000000,
        headColor: 0x00ff00,
        fletchingColor: 0xff0000,
        length: 1.5,
        width: 0.08,
        rotateToDirection: true,
        arcHeight: 0.2,
      },
    },
    fallbackSpell: {
      color: 0x800080,
      size: 0.4,
      glowIntensity: 0.4,
    },
  });
}

describe("SpellVisualsRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new SpellVisualsRegistry().manifest).toThrow(
      SpellVisualsNotLoadedError,
    );
  });

  it("spellVisual resolves known ids", () => {
    const r = new SpellVisualsRegistry(manifest());
    expect(r.spellVisual("fire_blast").color).toBe(0xff4400);
    expect(r.hasSpell("fire_blast")).toBe(true);
  });

  it("spellVisual falls back to fallbackSpell for unknown id", () => {
    const r = new SpellVisualsRegistry(manifest());
    expect(r.spellVisual("ghost").color).toBe(0x800080);
    expect(r.hasSpell("ghost")).toBe(false);
  });

  it("arrowVisual resolves known ids", () => {
    const r = new SpellVisualsRegistry(manifest());
    expect(r.arrowVisual("dragon").headColor).toBe(0x00ff00);
  });

  it("arrowVisual falls back to 'default' for unknown id", () => {
    const r = new SpellVisualsRegistry(manifest());
    expect(r.arrowVisual("ghost").shaftColor).toBe(0x8b4513);
    expect(r.arrowVisual("ghost").length).toBe(1.2);
  });

  it("lists spell + arrow ids", () => {
    const r = new SpellVisualsRegistry(manifest());
    expect(r.spellIds.sort()).toEqual(["fire_blast", "wind_strike"]);
    expect(r.arrowIds.sort()).toEqual(["default", "dragon"]);
  });
});

describe("SpellVisualsRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new SpellVisualsRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new SpellVisualsRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new SpellVisualsRegistry();
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
