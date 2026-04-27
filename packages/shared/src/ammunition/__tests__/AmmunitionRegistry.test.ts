import { AmmunitionManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  AmmunitionNotLoadedError,
  AmmunitionRegistry,
  UnknownArrowError,
  UnknownBowError,
} from "../AmmunitionRegistry.js";

function manifest() {
  return AmmunitionManifestSchema.parse({
    $schema: "hyperforge.ammunition.v1",
    bowTiers: {
      shortbow: 1,
      oakBow: 10,
      willowBow: 20,
    },
    arrows: {
      bronzeArrow: {
        id: "bronzeArrow",
        name: "Bronze arrow",
        rangedStrength: 7,
        requiredRangedLevel: 1,
        requiredBowTier: 1,
      },
      mithrilArrow: {
        id: "mithrilArrow",
        name: "Mithril arrow",
        rangedStrength: 22,
        requiredRangedLevel: 20,
        requiredBowTier: 20,
      },
    },
  });
}

describe("AmmunitionRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new AmmunitionRegistry().manifest).toThrow(
      AmmunitionNotLoadedError,
    );
  });
});

describe("AmmunitionRegistry — lookup", () => {
  it("bow tier and arrow lookup", () => {
    const r = new AmmunitionRegistry(manifest());
    expect(r.bowTier("oakBow")).toBe(10);
    expect(r.arrow("mithrilArrow").rangedStrength).toBe(22);
  });

  it("throws on unknown", () => {
    const r = new AmmunitionRegistry(manifest());
    expect(() => r.bowTier("ghost")).toThrow(UnknownBowError);
    expect(() => r.arrow("ghost")).toThrow(UnknownArrowError);
  });
});

describe("AmmunitionRegistry — canShoot gate", () => {
  it("ok when all gates pass", () => {
    const r = new AmmunitionRegistry(manifest());
    expect(r.canShoot("bronzeArrow", "shortbow", 1).ok).toBe(true);
  });

  it("unknown arrow fails", () => {
    const r = new AmmunitionRegistry(manifest());
    expect(r.canShoot("ghostArrow", "shortbow", 99).reason).toBe(
      "unknown-arrow",
    );
  });

  it("unknown bow fails", () => {
    const r = new AmmunitionRegistry(manifest());
    expect(r.canShoot("bronzeArrow", "ghostBow", 99).reason).toBe(
      "unknown-bow",
    );
  });

  it("below ranged level fails", () => {
    const r = new AmmunitionRegistry(manifest());
    expect(r.canShoot("mithrilArrow", "willowBow", 10).reason).toBe(
      "below-ranged-level",
    );
  });

  it("bow tier too low fails", () => {
    const r = new AmmunitionRegistry(manifest());
    expect(r.canShoot("mithrilArrow", "shortbow", 99).reason).toBe(
      "bow-tier-too-low",
    );
  });
});

describe("AmmunitionRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new AmmunitionRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new AmmunitionRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new AmmunitionRegistry();
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
