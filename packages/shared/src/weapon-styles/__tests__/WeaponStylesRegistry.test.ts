import { WeaponStylesManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  UnknownWeaponTypeError,
  WeaponStylesNotLoadedError,
  WeaponStylesRegistry,
} from "../WeaponStylesRegistry.js";

function manifest() {
  return WeaponStylesManifestSchema.parse({
    $schema: "hyperforge.weapon-styles.v1",
    styles: {
      sword: ["accurate", "aggressive", "defensive"],
      axe: ["accurate", "aggressive", "defensive"],
      mace: ["accurate", "aggressive", "defensive"],
      dagger: ["accurate", "aggressive", "defensive"],
      spear: ["controlled", "defensive"],
      bow: ["accurate", "rapid", "longrange"],
      crossbow: ["accurate", "rapid", "longrange"],
      staff: ["accurate", "autocast"],
      wand: ["accurate", "autocast"],
      shield: ["defensive"],
      scimitar: ["accurate", "aggressive", "defensive"],
      longsword: ["accurate", "aggressive", "defensive"],
      two_hand_sword: ["accurate", "aggressive", "defensive"],
      halberd: ["controlled", "defensive"],
      none: ["accurate", "aggressive", "defensive"],
    },
  });
}

describe("WeaponStylesRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new WeaponStylesRegistry().manifest).toThrow(
      WeaponStylesNotLoadedError,
    );
  });
});

describe("WeaponStylesRegistry — lookup", () => {
  it("returns styles in order", () => {
    const r = new WeaponStylesRegistry(manifest());
    expect(r.stylesFor("sword")).toEqual([
      "accurate",
      "aggressive",
      "defensive",
    ]);
  });

  it("default is first entry", () => {
    const r = new WeaponStylesRegistry(manifest());
    expect(r.defaultStyle("sword")).toBe("accurate");
    expect(r.defaultStyle("staff")).toBe("accurate");
  });

  it("allows checks membership", () => {
    const r = new WeaponStylesRegistry(manifest());
    expect(r.allows("bow", "rapid")).toBe(true);
    expect(r.allows("bow", "defensive")).toBe(false);
  });

  it("throws on unknown weapon type", () => {
    // Bypass schema to simulate a partial manifest loaded at runtime.
    const r = new WeaponStylesRegistry();
    r.load({
      $schema: "hyperforge.weapon-styles.v1",
      styles: { sword: ["accurate"] },
    } as Parameters<WeaponStylesRegistry["load"]>[0]);
    expect(() => r.stylesFor("dagger")).toThrow(UnknownWeaponTypeError);
  });

  it("allows returns false for unknown weapon type", () => {
    const r = new WeaponStylesRegistry();
    r.load({
      $schema: "hyperforge.weapon-styles.v1",
      styles: { sword: ["accurate"] },
    } as Parameters<WeaponStylesRegistry["load"]>[0]);
    expect(r.allows("dagger", "accurate")).toBe(false);
  });
});
