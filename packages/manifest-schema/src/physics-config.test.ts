import { describe, expect, it } from "vitest";
import {
  CcdRulesSchema,
  CollisionMatrixEntrySchema,
  PhysicsConfigManifestSchema,
  PhysicsMaterialSchema,
  SimulationRulesSchema,
  SleepRulesSchema,
  SolverRulesSchema,
} from "./physics-config.js";

describe("PhysicsMaterialSchema", () => {
  it("accepts a valid material", () => {
    const m = PhysicsMaterialSchema.parse({
      id: "stoneDefault",
      name: "Stone",
      staticFriction: 0.8,
      dynamicFriction: 0.6,
      restitution: 0.1,
      densityKgPerM3: 2400,
      surfaceTag: "stone",
    });
    expect(m.surfaceTag).toBe("stone");
  });

  it("rejects dynamicFriction > staticFriction", () => {
    expect(() =>
      PhysicsMaterialSchema.parse({
        id: "bad",
        name: "bad",
        staticFriction: 0.3,
        dynamicFriction: 0.9,
      }),
    ).toThrow(/dynamicFriction/);
  });

  it("rejects invalid id casing", () => {
    expect(() =>
      PhysicsMaterialSchema.parse({
        id: "Stone",
        name: "x",
      }),
    ).toThrow(/lowerCamelCase/);
  });

  it("clamps density above max", () => {
    expect(() =>
      PhysicsMaterialSchema.parse({
        id: "tooDense",
        name: "x",
        densityKgPerM3: 500000,
      }),
    ).toThrow();
  });
});

describe("CollisionMatrixEntrySchema", () => {
  it("accepts ignore between two layers", () => {
    const e = CollisionMatrixEntrySchema.parse({
      a: "player",
      b: "playerGhost",
      kind: "ignore",
    });
    expect(e.kind).toBe("ignore");
  });

  it("rejects self-pair", () => {
    expect(() =>
      CollisionMatrixEntrySchema.parse({
        a: "player",
        b: "player",
        kind: "collide",
      }),
    ).toThrow(/self-pair/);
  });
});

describe("CcdRulesSchema", () => {
  it("defaults to disabled", () => {
    const c = CcdRulesSchema.parse({});
    expect(c.enabled).toBe(false);
    expect(c.maxPasses).toBe(1);
  });

  it("clamps passes at 4", () => {
    expect(() => CcdRulesSchema.parse({ maxPasses: 10 })).toThrow();
  });
});

describe("SleepRulesSchema", () => {
  it("defaults stabilization to 15 frames", () => {
    expect(SleepRulesSchema.parse({}).stabilizationFrames).toBe(15);
  });
});

describe("SolverRulesSchema", () => {
  it("defaults to PhysX canonical iteration counts", () => {
    const s = SolverRulesSchema.parse({});
    expect(s.positionIterations).toBe(4);
    expect(s.velocityIterations).toBe(1);
  });
});

describe("SimulationRulesSchema", () => {
  it("defaults gravity to earth", () => {
    const s = SimulationRulesSchema.parse({});
    expect(s.gravity).toEqual({ x: 0, y: -9.81, z: 0 });
    expect(s.fixedDeltaSec).toBeCloseTo(1 / 60);
  });

  it("rejects nonfinite gravity", () => {
    expect(() =>
      SimulationRulesSchema.parse({
        gravity: { x: 0, y: Number.NaN, z: 0 },
      }),
    ).toThrow();
  });
});

describe("PhysicsConfigManifestSchema", () => {
  const validLayer = { id: "world", name: "World" };

  it("accepts a minimal enabled manifest", () => {
    const m = PhysicsConfigManifestSchema.parse({
      layers: [validLayer],
    });
    expect(m.enabled).toBe(true);
    expect(m.defaultInteraction).toBe("collide");
  });

  it("rejects enabled manifest with zero layers", () => {
    expect(() => PhysicsConfigManifestSchema.parse({ layers: [] })).toThrow(
      /at least one collision layer/,
    );
  });

  it("allows disabled manifest with zero layers", () => {
    const m = PhysicsConfigManifestSchema.parse({
      enabled: false,
      layers: [],
    });
    expect(m.enabled).toBe(false);
  });

  it("rejects duplicate layer ids", () => {
    expect(() =>
      PhysicsConfigManifestSchema.parse({
        layers: [validLayer, validLayer],
      }),
    ).toThrow(/layer ids must be unique/);
  });

  it("rejects duplicate material ids", () => {
    const mat = { id: "stone", name: "Stone" };
    expect(() =>
      PhysicsConfigManifestSchema.parse({
        layers: [validLayer],
        materials: [mat, mat],
      }),
    ).toThrow(/material ids/);
  });

  it("rejects defaultMaterialId that doesn't resolve", () => {
    expect(() =>
      PhysicsConfigManifestSchema.parse({
        layers: [validLayer],
        defaultMaterialId: "ghost",
      }),
    ).toThrow(/defaultMaterialId/);
  });

  it("rejects matrix entries referencing unknown layers", () => {
    expect(() =>
      PhysicsConfigManifestSchema.parse({
        layers: [validLayer],
        matrix: [{ a: "world", b: "missing", kind: "ignore" }],
      }),
    ).toThrow(/declared layers/);
  });

  it("rejects duplicate unordered pair in matrix", () => {
    const layers = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    expect(() =>
      PhysicsConfigManifestSchema.parse({
        layers,
        matrix: [
          { a: "a", b: "b", kind: "collide" },
          { a: "b", b: "a", kind: "ignore" },
        ],
      }),
    ).toThrow(/at most once/);
  });

  it("accepts matrix with each unordered pair once", () => {
    const layers = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ];
    const m = PhysicsConfigManifestSchema.parse({
      layers,
      matrix: [
        { a: "a", b: "b", kind: "collide" },
        { a: "b", b: "c", kind: "overlap" },
        { a: "a", b: "c", kind: "ignore" },
      ],
    });
    expect(m.matrix).toHaveLength(3);
  });

  it("accepts a defaultMaterialId that resolves", () => {
    const m = PhysicsConfigManifestSchema.parse({
      layers: [validLayer],
      materials: [{ id: "stone", name: "Stone" }],
      defaultMaterialId: "stone",
    });
    expect(m.defaultMaterialId).toBe("stone");
  });
});
