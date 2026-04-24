/**
 * Physics config manifest schema.
 *
 * Authored PhysX tuning: gravity, fixed-step/substep cadence, sleep
 * thresholds, CCD policy, a physics-material registry (friction /
 * restitution / density presets referenced by colliders), and the
 * collision-layer matrix (which layer collides/overlaps/ignores which).
 *
 * This is the **authored** physics config. Runtime `PhysicsSystem`
 * owns the PhysX scene, the actor pool, the query cache, and the
 * character controller — none of that lives in this schema.
 *
 * Scope-isolated from:
 *   - `project-settings.ts` (runtime quality: target fps, vsync, etc.)
 *   - `render-profile.ts` (authored look — tone/bloom/IBL)
 *   - `nav-mesh.ts` (walkable-surface bake — separate from sim physics)
 *
 * Collision layers are authored as a named registry with a sparse
 * interaction matrix keyed by unordered (layerA, layerB) pair; the
 * runtime flattens this into a PhysX filter shader.
 */

import { z } from "zod";

/** MaterialId — lowerCamelCase. */
const MaterialId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "material id must be lowerCamelCase ASCII identifier",
  );

/** LayerId — lowerCamelCase. */
const LayerId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "layer id must be lowerCamelCase ASCII identifier",
  );

/** Vector3 — authored world-space vector (meters, world up = +y). */
export const Vec3Schema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
  })
  .strict();
export type Vec3 = z.infer<typeof Vec3Schema>;

/**
 * Physics material — friction / restitution / density preset that
 * colliders reference by id. Mirrors PxMaterial.
 */
export const PhysicsMaterialSchema = z
  .object({
    id: MaterialId,
    name: z.string().min(1),
    /** Static friction 0..2 (PhysX clamp). */
    staticFriction: z.number().min(0).max(2).default(0.5),
    /** Dynamic friction 0..2 (PhysX clamp). */
    dynamicFriction: z.number().min(0).max(2).default(0.5),
    /** Restitution (bounciness) 0..1. */
    restitution: z.number().min(0).max(1).default(0),
    /** Density in kg/m^3 (water = 1000). Only used for dynamic actors. */
    densityKgPerM3: z.number().positive().max(100000).default(1000),
    /** Surface tag forwarded to SFX/VFX hits (e.g. "stone", "wood"). */
    surfaceTag: z.string().default(""),
  })
  .strict()
  .refine((m) => m.dynamicFriction <= m.staticFriction, {
    message: "dynamicFriction must be <= staticFriction (PhysX convention)",
    path: ["dynamicFriction"],
  });
export type PhysicsMaterial = z.infer<typeof PhysicsMaterialSchema>;

/** How two layers interact. */
export const LayerInteractionKindSchema = z.enum([
  "collide",
  "overlap",
  "ignore",
]);
export type LayerInteractionKind = z.infer<typeof LayerInteractionKindSchema>;

/** Named collision layer entry. */
export const CollisionLayerSchema = z
  .object({
    id: LayerId,
    name: z.string().min(1),
    description: z.string().default(""),
  })
  .strict();
export type CollisionLayer = z.infer<typeof CollisionLayerSchema>;

/**
 * Sparse entry in the collision matrix. Unordered pair (a,b).
 * Any pair not listed falls through to `defaultInteraction`.
 */
export const CollisionMatrixEntrySchema = z
  .object({
    a: LayerId,
    b: LayerId,
    kind: LayerInteractionKindSchema,
  })
  .strict()
  .refine((e) => e.a !== e.b, {
    message: "matrix entry may not self-pair (use layer defaults instead)",
    path: ["b"],
  });
export type CollisionMatrixEntry = z.infer<typeof CollisionMatrixEntrySchema>;

/**
 * CCD rules — continuous collision detection. Expensive, so authored
 * as an opt-in toggle plus a per-velocity threshold that gates CCD
 * to fast-moving actors only.
 */
export const CcdRulesSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Only enable CCD on actors moving above this m/s. 0 = always. */
    minLinearVelocityMPerS: z.number().min(0).max(1000).default(10),
    /** Max CCD sub-passes per frame (PhysX caps at 4). */
    maxPasses: z.number().int().min(1).max(4).default(1),
  })
  .strict();
export type CcdRules = z.infer<typeof CcdRulesSchema>;

/**
 * Sleep rules — actors below threshold idle and skip simulation.
 */
export const SleepRulesSchema = z
  .object({
    /** Energy threshold below which actors sleep (PhysX units). */
    linearThreshold: z.number().min(0).max(100).default(0.05),
    /** Frames below threshold required before sleeping. */
    stabilizationFrames: z.number().int().min(0).max(600).default(15),
    /** Whether dynamic actors may sleep. */
    allowSleep: z.boolean().default(true),
  })
  .strict();
export type SleepRules = z.infer<typeof SleepRulesSchema>;

/**
 * Solver rules — iteration counts and determinism.
 */
export const SolverRulesSchema = z
  .object({
    /** Position iterations per substep (PhysX default 4). */
    positionIterations: z.number().int().min(1).max(32).default(4),
    /** Velocity iterations per substep (PhysX default 1). */
    velocityIterations: z.number().int().min(1).max(32).default(1),
    /** Force deterministic ordering across runs (slower). */
    deterministic: z.boolean().default(false),
  })
  .strict();
export type SolverRules = z.infer<typeof SolverRulesSchema>;

/**
 * Global simulation rules — gravity, substep cadence.
 */
export const SimulationRulesSchema = z
  .object({
    /** World gravity in m/s^2. Default earth-ish (-9.81 on y). */
    gravity: Vec3Schema.default({ x: 0, y: -9.81, z: 0 }),
    /** Fixed simulation step in seconds (60hz default). */
    fixedDeltaSec: z
      .number()
      .positive()
      .max(0.5)
      .default(1 / 60),
    /** Max substeps per render frame. */
    maxSubsteps: z.number().int().min(1).max(16).default(4),
    /** Fixed-step accumulator clamp to prevent spiral of death (sec). */
    maxAccumulatedSec: z.number().positive().max(1).default(0.25),
  })
  .strict();
export type SimulationRules = z.infer<typeof SimulationRulesSchema>;

/**
 * Physics config manifest — the top-level authored document.
 */
export const PhysicsConfigManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    simulation: SimulationRulesSchema.default(() =>
      SimulationRulesSchema.parse({}),
    ),
    solver: SolverRulesSchema.default(() => SolverRulesSchema.parse({})),
    sleep: SleepRulesSchema.default(() => SleepRulesSchema.parse({})),
    ccd: CcdRulesSchema.default(() => CcdRulesSchema.parse({})),
    /** Physics-material registry referenced by colliders. */
    materials: z.array(PhysicsMaterialSchema).default([]),
    /** Fallback material id if a collider doesn't specify one. */
    defaultMaterialId: MaterialId.optional(),
    /** Collision-layer registry. */
    layers: z.array(CollisionLayerSchema).default([]),
    /** Default interaction for any (a,b) pair not in the matrix. */
    defaultInteraction: LayerInteractionKindSchema.default("collide"),
    /** Sparse overrides to the default interaction. */
    matrix: z.array(CollisionMatrixEntrySchema).default([]),
  })
  .strict()
  .refine(
    (m) => new Set(m.materials.map((x) => x.id)).size === m.materials.length,
    { message: "material ids must be unique", path: ["materials"] },
  )
  .refine((m) => new Set(m.layers.map((x) => x.id)).size === m.layers.length, {
    message: "layer ids must be unique",
    path: ["layers"],
  })
  .refine(
    (m) =>
      m.defaultMaterialId === undefined ||
      m.materials.some((x) => x.id === m.defaultMaterialId),
    {
      message: "defaultMaterialId must resolve to a declared material",
      path: ["defaultMaterialId"],
    },
  )
  .refine(
    (m) => {
      const ids = new Set(m.layers.map((x) => x.id));
      return m.matrix.every((e) => ids.has(e.a) && ids.has(e.b));
    },
    {
      message: "matrix entries must reference declared layers",
      path: ["matrix"],
    },
  )
  .refine(
    (m) => {
      const seen = new Set<string>();
      for (const e of m.matrix) {
        const key = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    },
    {
      message:
        "each unordered layer pair may appear at most once in the matrix",
      path: ["matrix"],
    },
  )
  .refine((m) => !m.enabled || m.layers.length >= 1, {
    message:
      "physics-config enabled=true requires at least one collision layer",
    path: ["layers"],
  });
export type PhysicsConfigManifest = z.infer<typeof PhysicsConfigManifestSchema>;
