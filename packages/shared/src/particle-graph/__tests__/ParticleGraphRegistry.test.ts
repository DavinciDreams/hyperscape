import { ParticleGraphManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  ParticleGraphNotLoadedError,
  ParticleGraphRegistry,
  UnknownParticleSystemError,
} from "../ParticleGraphRegistry.js";

function manifest() {
  return ParticleGraphManifestSchema.parse([
    {
      id: "fireBurst",
      name: "Fire Burst",
      emitter: {
        rate: 0,
        burstCount: 50,
        particleLifetimeSec: { min: 0.4, max: 1 },
        systemLifetimeSec: 2,
        loop: false,
        spawnShape: { kind: "sphere", radius: 0.3 },
      },
      initializers: [
        { kind: "velocity-cone", angleDeg: 45, speed: { min: 2, max: 4 } },
        { kind: "initial-color", color: 0xff6600, alpha: 0.9 },
        { kind: "initial-size", size: { min: 0.1, max: 0.2 } },
      ],
      updaters: [
        { kind: "gravity", acceleration: { x: 0, y: -9.8, z: 0 } },
        { kind: "drag", dampingPerSec: 0.2 },
        {
          kind: "color-over-life",
          stops: [
            { t: 0, color: 0xffaa00 },
            { t: 1, color: 0x550000 },
          ],
        },
        {
          kind: "size-over-life",
          stops: [
            { t: 0, size: 0.2 },
            { t: 1, size: 0 },
          ],
        },
      ],
      renderer: {
        kind: "billboard",
        textureId: "fx/spark",
        blendMode: "additive",
      },
    },
    {
      id: "smokeStream",
      name: "Smoke Stream",
      emitter: {
        rate: 10,
        burstCount: 0,
        particleLifetimeSec: { min: 2, max: 3 },
        systemLifetimeSec: 0,
        loop: true,
        spawnShape: { kind: "cone", angleDeg: 10, radius: 0.1 },
      },
      initializers: [
        {
          kind: "velocity-vector",
          direction: { x: 0, y: 1, z: 0 },
          speed: { min: 0.5, max: 0.8 },
        },
      ],
      renderer: { kind: "mesh", meshId: "quad", materialId: "smokeMat" },
    },
  ]);
}

describe("ParticleGraphRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new ParticleGraphRegistry().manifest).toThrow(
      ParticleGraphNotLoadedError,
    );
  });

  it("has + get + all", () => {
    const r = new ParticleGraphRegistry(manifest());
    expect(r.has("fireBurst")).toBe(true);
    expect(r.has("ghost")).toBe(false);
    expect(r.all.map((s) => s.id)).toEqual(["fireBurst", "smokeStream"]);
    expect(r.get("fireBurst").name).toBe("Fire Burst");
    expect(() => r.get("ghost")).toThrow(UnknownParticleSystemError);
  });

  it("rendererKindOf discriminator", () => {
    const r = new ParticleGraphRegistry(manifest());
    expect(r.rendererKindOf("fireBurst")).toBe("billboard");
    expect(r.rendererKindOf("smokeStream")).toBe("mesh");
  });

  it("initializersOfKind + updatersOfKind filter by discriminant", () => {
    const r = new ParticleGraphRegistry(manifest());
    expect(r.initializersOfKind("fireBurst", "velocity-cone")).toHaveLength(1);
    expect(r.initializersOfKind("fireBurst", "initial-color")).toHaveLength(1);
    expect(r.initializersOfKind("fireBurst", "velocity-vector")).toEqual([]);
    const colorUps = r.updatersOfKind("fireBurst", "color-over-life");
    expect(colorUps).toHaveLength(1);
    expect(colorUps[0].stops).toHaveLength(2);
    expect(r.updatersOfKind("smokeStream", "gravity")).toEqual([]);
  });

  it("isContinuous", () => {
    const r = new ParticleGraphRegistry(manifest());
    // smokeStream: systemLifetimeSec=0 (indefinite) → continuous
    expect(r.isContinuous("smokeStream")).toBe(true);
    // fireBurst: systemLifetimeSec=2, loop=false → one-shot
    expect(r.isContinuous("fireBurst")).toBe(false);
  });
});

describe("ParticleGraphRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new ParticleGraphRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new ParticleGraphRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new ParticleGraphRegistry();
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
