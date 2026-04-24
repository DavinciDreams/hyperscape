/**
 * Camera-profiles manifest schema.
 *
 * Section 15 (UE5 parity — camera system) of the World Studio
 * AAA plan. Describes named camera rigs that the player controller
 * or cinematic system can activate — first-person, third-person
 * over-shoulder, top-down, orbit, free-fly.
 *
 * Scope: authored camera tuning. Runtime camera component picks a
 * profile, interpolates transforms, and applies collision. This
 * schema does not describe the follow-target logic.
 */

import { z } from "zod";

const Vec3 = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  })
  .strict();

/** Which projection the camera uses. */
export const CameraProjectionSchema = z.enum(["perspective", "orthographic"]);
export type CameraProjection = z.infer<typeof CameraProjectionSchema>;

/** Collision probe settings — pull camera forward when obstructed. */
export const CameraCollisionSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Sphere-sweep radius in meters. */
    probeRadius: z.number().min(0).max(2).default(0.2),
    /** Max forward pull when blocked (meters). */
    maxPullForwardMeters: z.number().min(0).max(20).default(10),
    /** Smoothing time-constant for the pull. */
    smoothingSec: z.number().min(0).max(2).default(0.15),
  })
  .strict();
export type CameraCollision = z.infer<typeof CameraCollisionSchema>;

/** Spring-based translational/rotational lag. */
export const CameraLagSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Position spring stiffness (higher = snappier). */
    positionStiffness: z.number().min(0).max(100).default(8),
    /** Rotation spring stiffness. */
    rotationStiffness: z.number().min(0).max(100).default(10),
    /** Spring damping ratio (1 = critical). */
    damping: z.number().min(0).max(4).default(1),
  })
  .strict();
export type CameraLag = z.infer<typeof CameraLagSchema>;

/** FOV tuning — base FOV + optional speed-based widening. */
export const CameraFovSchema = z
  .object({
    baseDegrees: z.number().min(20).max(170).default(75),
    /** Extra degrees added when moving at `speedRefForWidening`. */
    speedWideningDegrees: z.number().min(0).max(60).default(0),
    speedRefForWidening: z.number().min(0).max(100).default(10),
  })
  .strict();
export type CameraFov = z.infer<typeof CameraFovSchema>;

/** Rig kind — discriminated union over common camera archetypes. */
export const CameraRigSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("first-person"),
      /** Eye offset from the follow-target origin. */
      eyeOffset: Vec3,
      /** Headbob amplitude at running speed (meters). */
      headbobAmplitude: z.number().min(0).max(0.5).default(0.05),
    })
    .strict(),
  z
    .object({
      kind: z.literal("third-person"),
      /** Arm length in meters. */
      armLength: z.number().positive().max(50),
      /** Socket offset — where the arm attaches on the pawn. */
      socketOffset: Vec3,
      /** Target offset — where the arm looks at (relative to the pawn). */
      targetOffset: Vec3,
      /** Min/max pitch in degrees. */
      pitchRangeDegrees: z
        .object({ min: z.number(), max: z.number() })
        .strict()
        .refine(({ min, max }) => min <= max, {
          message: "`pitchRangeDegrees.min` must be <= `max`",
        }),
    })
    .strict(),
  z
    .object({
      kind: z.literal("top-down"),
      /** World-space height above the pawn. */
      heightMeters: z.number().positive().max(200),
      /** Pitch angle downward in degrees. */
      pitchDegrees: z.number().min(-90).max(0).default(-60),
    })
    .strict(),
  z
    .object({
      kind: z.literal("orbit"),
      /** Orbit radius in meters. */
      radiusMeters: z.number().positive().max(200),
      /** Starting yaw in degrees. */
      yawDegrees: z.number().min(-360).max(360).default(0),
      /** Starting pitch in degrees. */
      pitchDegrees: z.number().min(-89).max(89).default(20),
      /** Yaw auto-rotation rate in degrees/sec (0 = static). */
      autoRotateDegPerSec: z.number().min(-360).max(360).default(0),
    })
    .strict(),
  z
    .object({
      kind: z.literal("free-fly"),
      /** Translational speed at 1.0 input (m/s). */
      speedMetersPerSec: z.number().positive().max(200),
      /** Speed multiplier while boost held. */
      boostMultiplier: z.number().min(1).max(50).default(4),
    })
    .strict(),
]);
export type CameraRig = z.infer<typeof CameraRigSchema>;

export const CameraProfileSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*(?:\.[a-z][a-zA-Z0-9_-]*)*$/,
        "camera profile id must be dot-separated lowerCamelCase segments",
      ),
    name: z.string().min(1),
    description: z.string().default(""),
    projection: CameraProjectionSchema.default("perspective"),
    /** Near/far clipping distances. */
    nearMeters: z.number().positive().max(100).default(0.1),
    farMeters: z.number().positive().max(100000).default(2000),
    fov: CameraFovSchema.default({
      baseDegrees: 75,
      speedWideningDegrees: 0,
      speedRefForWidening: 10,
    }),
    lag: CameraLagSchema.default({
      enabled: true,
      positionStiffness: 8,
      rotationStiffness: 10,
      damping: 1,
    }),
    collision: CameraCollisionSchema.default({
      enabled: true,
      probeRadius: 0.2,
      maxPullForwardMeters: 10,
      smoothingSec: 0.15,
    }),
    rig: CameraRigSchema,
  })
  .strict()
  .refine(({ nearMeters, farMeters }) => nearMeters < farMeters, {
    message: "`nearMeters` must be less than `farMeters`",
  });
export type CameraProfile = z.infer<typeof CameraProfileSchema>;

export const CameraProfilesManifestSchema = z
  .array(CameraProfileSchema)
  .refine((list) => new Set(list.map((p) => p.id)).size === list.length, {
    message: "camera profile ids must be unique",
  });
export type CameraProfilesManifest = z.infer<
  typeof CameraProfilesManifestSchema
>;
