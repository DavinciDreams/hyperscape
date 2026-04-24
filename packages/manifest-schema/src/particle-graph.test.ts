/**
 * Faithfulness + defensiveness tests for `ParticleGraphManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  ParticleGraphManifestSchema,
  type ParticleGraphManifest,
} from "./particle-graph.js";

const reference: ParticleGraphManifest = [
  {
    id: "hitSparks",
    name: "Hit Sparks",
    description: "Yellow sparks on melee impact.",
    emitter: {
      rate: 0,
      burstCount: 24,
      particleLifetimeSec: { min: 0.3, max: 0.6 },
      systemLifetimeSec: 1,
      loop: false,
      maxParticles: 128,
      simulationSpace: "world",
      spawnShape: { kind: "sphere", radius: 0.1 },
    },
    initializers: [
      {
        kind: "velocity-cone",
        angleDeg: 60,
        speed: { min: 3, max: 6 },
      },
      {
        kind: "initial-size",
        size: { min: 0.05, max: 0.1 },
      },
      {
        kind: "initial-color",
        color: 0xffcc33,
        alpha: 1,
      },
    ],
    updaters: [
      {
        kind: "gravity",
        acceleration: { x: 0, y: -9.8, z: 0 },
      },
      {
        kind: "drag",
        dampingPerSec: 0.5,
      },
      {
        kind: "alpha-over-life",
        stops: [
          { t: 0, alpha: 1 },
          { t: 0.7, alpha: 1 },
          { t: 1, alpha: 0 },
        ],
      },
    ],
    renderer: {
      kind: "billboard",
      textureId: "tex.spark",
      blendMode: "additive",
      softParticles: true,
    },
  },
  {
    id: "smokeTrail",
    name: "Smoke Trail",
    description: "",
    emitter: {
      rate: 30,
      burstCount: 0,
      particleLifetimeSec: { min: 2, max: 3 },
      systemLifetimeSec: 0,
      loop: true,
      maxParticles: 500,
      simulationSpace: "world",
      spawnShape: { kind: "point" },
    },
    initializers: [
      {
        kind: "velocity-vector",
        direction: { x: 0, y: 1, z: 0 },
        speed: { min: 0.5, max: 1 },
      },
      {
        kind: "initial-size",
        size: { min: 0.3, max: 0.5 },
      },
      {
        kind: "initial-rotation",
        rotationDeg: { min: 0, max: 360 },
        angularVelocityDegPerSec: { min: -45, max: 45 },
      },
    ],
    updaters: [
      {
        kind: "curl-noise",
        frequency: 0.5,
        amplitude: 1.2,
      },
      {
        kind: "color-over-life",
        stops: [
          { t: 0, color: 0xaaaaaa },
          { t: 1, color: 0x444444 },
        ],
      },
      {
        kind: "size-over-life",
        stops: [
          { t: 0, size: 1 },
          { t: 1, size: 2.5 },
        ],
      },
    ],
    renderer: {
      kind: "billboard",
      textureId: "tex.smoke",
      blendMode: "normal",
      softParticles: true,
    },
  },
];

describe("ParticleGraphManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = ParticleGraphManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies emitter defaults on a minimal system", () => {
    const parsed = ParticleGraphManifestSchema.parse([
      {
        id: "s",
        name: "S",
        emitter: {
          burstCount: 10,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ]);
    expect(parsed[0].emitter.rate).toBe(0);
    expect(parsed[0].emitter.loop).toBe(true);
    expect(parsed[0].emitter.maxParticles).toBe(2000);
    expect(parsed[0].emitter.simulationSpace).toBe("world");
    expect(parsed[0].emitter.spawnShape).toEqual({ kind: "point" });
    expect(parsed[0].updaters).toEqual([]);
  });

  it("rejects duplicate system ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        renderer: { kind: "billboard", textureId: "t" },
      },
      {
        id: "dup",
        name: "B",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a system with no velocity initializer", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [
          { kind: "initial-color", color: 0xff0000, alpha: 1 },
          { kind: "initial-size", size: { min: 1, max: 1 } },
        ],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an emitter that produces no particles (rate=0 and burstCount=0)", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          rate: 0,
          burstCount: 0,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects initializers array of length 0", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects range with min > max", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 5, max: 1 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cone spawn shape with angleDeg > 180", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
          spawnShape: { kind: "cone", angleDeg: 200, radius: 0 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid id format", () => {
    const bad = [
      {
        id: "Has Spaces",
        name: "S",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxParticles > 200_000", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
          maxParticles: 500_000,
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects color-over-life with only one stop", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        updaters: [
          {
            kind: "color-over-life",
            stops: [{ t: 0, color: 0xffffff }],
          },
        ],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects alpha-over-life with alpha > 1", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        updaters: [
          {
            kind: "alpha-over-life",
            stops: [
              { t: 0, alpha: 1 },
              { t: 1, alpha: 2 },
            ],
          },
        ],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects drag with damping > 1", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        updaters: [{ kind: "drag", dampingPerSec: 2 }],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown initializer kind", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
          { kind: "initial-everything", anything: true },
        ],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown updater kind", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        updaters: [{ kind: "black-hole", radius: 5 }],
        renderer: { kind: "billboard", textureId: "t" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts mesh renderer", () => {
    const ok = [
      {
        id: "debris",
        name: "Debris",
        emitter: {
          burstCount: 8,
          particleLifetimeSec: { min: 2, max: 4 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 45, speed: { min: 2, max: 5 } },
        ],
        renderer: {
          kind: "mesh",
          meshId: "mesh.chunk",
          materialId: "mat.rock",
        },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts ribbon renderer", () => {
    const ok = [
      {
        id: "slash",
        name: "Slash",
        emitter: {
          rate: 60,
          particleLifetimeSec: { min: 0.2, max: 0.2 },
        },
        initializers: [
          {
            kind: "velocity-vector",
            direction: { x: 1, y: 0, z: 0 },
            speed: { min: 0, max: 0 },
          },
        ],
        renderer: {
          kind: "ribbon",
          textureId: "tex.slash",
          widthMultiplier: 2,
          trailSegments: 32,
        },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects ribbon with trailSegments < 2", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          rate: 60,
          particleLifetimeSec: { min: 0.2, max: 0.2 },
        },
        initializers: [
          {
            kind: "velocity-vector",
            direction: { x: 1, y: 0, z: 0 },
            speed: { min: 0, max: 0 },
          },
        ],
        renderer: {
          kind: "ribbon",
          textureId: "tex.slash",
          trailSegments: 1,
        },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts empty manifest", () => {
    expect(ParticleGraphManifestSchema.safeParse([]).success).toBe(true);
  });

  it("rejects empty billboard textureId", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        emitter: {
          burstCount: 1,
          particleLifetimeSec: { min: 1, max: 1 },
        },
        initializers: [
          { kind: "velocity-cone", angleDeg: 30, speed: { min: 1, max: 1 } },
        ],
        renderer: { kind: "billboard", textureId: "" },
      },
    ];
    expect(ParticleGraphManifestSchema.safeParse(bad).success).toBe(false);
  });
});
