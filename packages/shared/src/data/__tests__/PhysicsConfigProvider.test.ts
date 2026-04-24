/**
 * Tests for the PhysicsConfigProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { physicsConfigProvider } from "../PhysicsConfigProvider";

beforeEach(() => {
  physicsConfigProvider.unload();
});
afterEach(() => {
  physicsConfigProvider.unload();
});

const validManifest = {
  enabled: true,
  materials: [
    {
      id: "stone",
      name: "Stone",
      staticFriction: 0.6,
      dynamicFriction: 0.4,
      restitution: 0.1,
      densityKgPerM3: 2500,
      surfaceTag: "stone",
    },
    {
      id: "wood",
      name: "Wood",
      staticFriction: 0.5,
      dynamicFriction: 0.3,
      restitution: 0.2,
      densityKgPerM3: 700,
      surfaceTag: "wood",
    },
  ],
  defaultMaterialId: "stone",
  layers: [
    { id: "world", name: "World" },
    { id: "player", name: "Player" },
    { id: "projectile", name: "Projectile" },
  ],
  defaultInteraction: "collide" as const,
  matrix: [
    { a: "player", b: "projectile", kind: "overlap" as const },
    { a: "projectile", b: "world", kind: "collide" as const },
  ],
};

describe("PhysicsConfigProvider", () => {
  it("starts unloaded", () => {
    expect(physicsConfigProvider.isLoaded()).toBe(false);
    expect(physicsConfigProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = physicsConfigProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.simulation.gravity).toEqual({ x: 0, y: -9.81, z: 0 });
    expect(parsed.simulation.fixedDeltaSec).toBeCloseTo(1 / 60);
    expect(parsed.solver.positionIterations).toBe(4);
    expect(parsed.sleep.allowSleep).toBe(true);
    expect(parsed.ccd.enabled).toBe(false);
    expect(parsed.materials.length).toBe(2);
    expect(parsed.layers.length).toBe(3);
    expect(physicsConfigProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob with no layers", () => {
    const parsed = physicsConfigProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.layers.length).toBe(0);
    expect(physicsConfigProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects enabled=true with no layers", () => {
    expect(() => physicsConfigProvider.loadRaw({ enabled: true })).toThrow();
    expect(physicsConfigProvider.isLoaded()).toBe(false);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = physicsConfigProvider.loadRaw(validManifest);
    physicsConfigProvider.unload();
    physicsConfigProvider.load(parsed);
    expect(physicsConfigProvider.isLoaded()).toBe(true);
    expect(physicsConfigProvider.getManifest()?.materials.length).toBe(2);
  });

  it("loadRaw() rejects duplicate material ids", () => {
    const bad = {
      ...validManifest,
      materials: [validManifest.materials[0], validManifest.materials[0]],
    };
    expect(() => physicsConfigProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate layer ids", () => {
    const bad = {
      ...validManifest,
      layers: [
        { id: "world", name: "World" },
        { id: "world", name: "World Again" },
      ],
      matrix: [],
    };
    expect(() => physicsConfigProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects defaultMaterialId that doesn't resolve", () => {
    const bad = { ...validManifest, defaultMaterialId: "missing" };
    expect(() => physicsConfigProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects matrix entry referencing undeclared layer", () => {
    const bad = {
      ...validManifest,
      matrix: [{ a: "player", b: "ghost", kind: "collide" as const }],
    };
    expect(() => physicsConfigProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects matrix self-pair", () => {
    const bad = {
      ...validManifest,
      matrix: [{ a: "player", b: "player", kind: "ignore" as const }],
    };
    expect(() => physicsConfigProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate unordered pair in matrix", () => {
    const bad = {
      ...validManifest,
      matrix: [
        { a: "player", b: "projectile", kind: "overlap" as const },
        { a: "projectile", b: "player", kind: "collide" as const },
      ],
    };
    expect(() => physicsConfigProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects dynamicFriction > staticFriction", () => {
    const bad = {
      ...validManifest,
      materials: [
        {
          id: "slick",
          name: "Slick",
          staticFriction: 0.2,
          dynamicFriction: 0.8,
        },
      ],
      defaultMaterialId: "slick",
    };
    expect(() => physicsConfigProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects gravity with non-finite component", () => {
    const bad = {
      ...validManifest,
      simulation: {
        gravity: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 },
      },
    };
    expect(() => physicsConfigProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects fixedDeltaSec <= 0", () => {
    const bad = {
      ...validManifest,
      simulation: { fixedDeltaSec: 0 },
    };
    expect(() => physicsConfigProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects CCD maxPasses > 4", () => {
    const bad = {
      ...validManifest,
      ccd: { enabled: true, minLinearVelocityMPerS: 5, maxPasses: 5 },
    };
    expect(() => physicsConfigProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects malformed material id", () => {
    const bad = {
      ...validManifest,
      materials: [{ id: "Not-Lower", name: "x" }],
      defaultMaterialId: undefined,
      layers: [{ id: "world", name: "World" }],
      matrix: [],
    };
    expect(() => physicsConfigProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects unknown layer interaction kind", () => {
    const bad = {
      ...validManifest,
      matrix: [
        {
          a: "player",
          b: "projectile",
          kind: "bounce" as unknown as "collide",
        },
      ],
    };
    expect(() => physicsConfigProvider.loadRaw(bad)).toThrow();
  });

  it("hotReload() replaces the manifest with a new one", () => {
    physicsConfigProvider.loadRaw(validManifest);
    const next = {
      ...validManifest,
      defaultInteraction: "ignore" as const,
    };
    const parsed = physicsConfigProvider.loadRaw(next);
    physicsConfigProvider.hotReload(parsed);
    expect(physicsConfigProvider.getManifest()?.defaultInteraction).toBe(
      "ignore",
    );
  });

  it("hotReload(null) clears the manifest", () => {
    physicsConfigProvider.loadRaw(validManifest);
    physicsConfigProvider.hotReload(null);
    expect(physicsConfigProvider.isLoaded()).toBe(false);
    expect(physicsConfigProvider.getManifest()).toBeNull();
  });

  it("unload() clears a loaded manifest", () => {
    physicsConfigProvider.loadRaw(validManifest);
    physicsConfigProvider.unload();
    expect(physicsConfigProvider.isLoaded()).toBe(false);
    expect(physicsConfigProvider.getManifest()).toBeNull();
  });
});
