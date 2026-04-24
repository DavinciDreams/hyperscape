/**
 * Particle-graph manifest schema.
 *
 * Declarative, Niagara-style particle system description. Complements
 * `vfx.ts` — where VFX entries reference opaque asset handles by id,
 * this schema describes the particle-system *graph* itself so the
 * runtime can compile it into GPU buffers without authoring tools.
 *
 * Scope: authored particle systems keyed by `id`. Each system is a
 * bundle of:
 *   - one emitter config (rate, burst, lifetime, spawn volume)
 *   - an ordered list of initializer modules (shape / velocity / color
 *     / size / rotation at t=0)
 *   - an ordered list of update modules (forces, drag, curl noise,
 *     color-over-life, size-over-life, collision)
 *   - a renderer config (billboard / mesh / ribbon + material)
 *
 * Substrate only — the runtime compiler + GPU backend land separately.
 */

import { z } from "zod";

/** ParticleSystemId — lowerCamelCase ASCII identifier. */
const ParticleId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "particle system id must be lowerCamelCase ASCII identifier",
  );

const HexColor = z.number().int().min(0).max(0xffffff);

/** [min, max] numeric range — min must be <= max. */
const Range = z
  .object({ min: z.number(), max: z.number() })
  .strict()
  .refine((r) => r.min <= r.max, { message: "range min must be <= max" });
export type ParticleRange = z.infer<typeof Range>;

/** Spawn volume shape — discriminated by `kind`. */
export const ParticleSpawnShapeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("point") }).strict(),
  z
    .object({ kind: z.literal("sphere"), radius: z.number().positive() })
    .strict(),
  z
    .object({
      kind: z.literal("box"),
      halfExtents: z.object({
        x: z.number().positive(),
        y: z.number().positive(),
        z: z.number().positive(),
      }),
    })
    .strict(),
  z
    .object({
      kind: z.literal("cone"),
      angleDeg: z.number().min(0).max(180),
      radius: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("disc"),
      radius: z.number().positive(),
    })
    .strict(),
]);
export type ParticleSpawnShape = z.infer<typeof ParticleSpawnShapeSchema>;

/** Emitter config — controls spawn rate + burst + system-level lifetime. */
export const ParticleEmitterSchema = z
  .object({
    /** Continuous spawn rate (particles per second). */
    rate: z.number().nonnegative().default(0),
    /** One-shot burst count fired once at t=0. */
    burstCount: z.number().int().nonnegative().default(0),
    /** Per-particle lifetime seconds [min, max]. */
    particleLifetimeSec: Range.default({ min: 1, max: 1 }),
    /** System lifetime seconds; 0 = indefinite. */
    systemLifetimeSec: z.number().nonnegative().default(0),
    /** If true, emission loops (only meaningful when systemLifetimeSec > 0). */
    loop: z.boolean().default(true),
    /** Hard cap — runtime stops spawning when count hits this. */
    maxParticles: z.number().int().min(1).max(200_000).default(2000),
    /** World-space vs local-space simulation. */
    simulationSpace: z.enum(["world", "local"]).default("world"),
    /** Spawn volume. */
    spawnShape: ParticleSpawnShapeSchema.default({ kind: "point" }),
  })
  .strict();
export type ParticleEmitter = z.infer<typeof ParticleEmitterSchema>;

/**
 * Initializer modules — set particle state at spawn. Discriminated
 * union so authoring never produces invalid mode/param combos.
 */
export const ParticleInitializerSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("velocity-cone"),
      angleDeg: z.number().min(0).max(180),
      speed: Range,
    })
    .strict(),
  z
    .object({
      kind: z.literal("velocity-vector"),
      direction: z.object({
        x: z.number(),
        y: z.number(),
        z: z.number(),
      }),
      speed: Range,
    })
    .strict(),
  z
    .object({
      kind: z.literal("initial-color"),
      color: HexColor,
      alpha: z.number().min(0).max(1).default(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("initial-size"),
      size: Range,
    })
    .strict(),
  z
    .object({
      kind: z.literal("initial-rotation"),
      rotationDeg: Range,
      angularVelocityDegPerSec: Range.default({ min: 0, max: 0 }),
    })
    .strict(),
]);
export type ParticleInitializer = z.infer<typeof ParticleInitializerSchema>;

/**
 * Update modules — mutate particle state each frame. Order in the
 * manifest is the order the runtime applies them.
 */
export const ParticleUpdaterSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("gravity"),
      acceleration: z.object({
        x: z.number(),
        y: z.number(),
        z: z.number(),
      }),
    })
    .strict(),
  z
    .object({
      kind: z.literal("drag"),
      /** Per-second velocity damping factor (0 = none, 1 = instant stop). */
      dampingPerSec: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("curl-noise"),
      frequency: z.number().positive(),
      amplitude: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("color-over-life"),
      /**
       * Ordered stops — `t` in [0,1], value = hex color. At least two
       * stops (endpoints); runtime sorts before compile.
       */
      stops: z
        .array(
          z.object({ t: z.number().min(0).max(1), color: HexColor }).strict(),
        )
        .min(2),
    })
    .strict(),
  z
    .object({
      kind: z.literal("alpha-over-life"),
      stops: z
        .array(
          z
            .object({
              t: z.number().min(0).max(1),
              alpha: z.number().min(0).max(1),
            })
            .strict(),
        )
        .min(2),
    })
    .strict(),
  z
    .object({
      kind: z.literal("size-over-life"),
      stops: z
        .array(
          z
            .object({
              t: z.number().min(0).max(1),
              size: z.number().nonnegative(),
            })
            .strict(),
        )
        .min(2),
    })
    .strict(),
  z
    .object({
      kind: z.literal("collide"),
      /** Elasticity — 0 = absorb, 1 = perfect bounce. */
      restitution: z.number().min(0).max(1).default(0.3),
      /** Optional world-layer tag the particle collides against. */
      layerTag: z.string().min(1).default("default"),
    })
    .strict(),
]);
export type ParticleUpdater = z.infer<typeof ParticleUpdaterSchema>;

/** Renderer — how each particle is drawn. */
export const ParticleRendererSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("billboard"),
      textureId: z.string().min(1),
      blendMode: z.enum(["normal", "additive", "multiply"]).default("additive"),
      softParticles: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal("mesh"),
      meshId: z.string().min(1),
      materialId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ribbon"),
      textureId: z.string().min(1),
      widthMultiplier: z.number().positive().default(1),
      /** Number of trail segments retained per particle. */
      trailSegments: z.number().int().min(2).max(128).default(16),
    })
    .strict(),
]);
export type ParticleRenderer = z.infer<typeof ParticleRendererSchema>;

/**
 * A single particle system. Refinement: at least one initializer
 * setting velocity (velocity-cone OR velocity-vector) so runtime
 * always has defined initial motion.
 */
export const ParticleSystemSchema = z
  .object({
    id: ParticleId,
    name: z.string().min(1),
    description: z.string().default(""),
    emitter: ParticleEmitterSchema,
    initializers: z.array(ParticleInitializerSchema).min(1),
    updaters: z.array(ParticleUpdaterSchema).default([]),
    renderer: ParticleRendererSchema,
  })
  .strict()
  .refine(
    ({ initializers }) =>
      initializers.some(
        (i) => i.kind === "velocity-cone" || i.kind === "velocity-vector",
      ),
    {
      message:
        "particle system must include at least one velocity initializer (velocity-cone or velocity-vector)",
    },
  )
  .refine(({ emitter }) => emitter.rate > 0 || emitter.burstCount > 0, {
    message:
      "emitter must produce particles — set `rate` > 0, `burstCount` > 0, or both",
  });
export type ParticleSystem = z.infer<typeof ParticleSystemSchema>;

/** Manifest is a bare array of systems; refinement enforces unique ids. */
export const ParticleGraphManifestSchema = z
  .array(ParticleSystemSchema)
  .refine((arr) => new Set(arr.map((s) => s.id)).size === arr.length, {
    message: "particle system ids must be unique",
  });
export type ParticleGraphManifest = z.infer<typeof ParticleGraphManifestSchema>;
