/**
 * Mounts manifest schema.
 *
 * Authored registry of player-rideable mounts — horses, wyverns,
 * flying carpets, amphibious beasts. Each entry captures the mount's
 * locomotion (ground / water / flight), its stamina curve, its
 * passenger/cargo capacity, its summon rules, and the cosmetic rig.
 *
 * Scope: authored registry. Runtime `MountSystem` handles
 * summon/dismiss, stamina ticking, mounted movement kinematics, and
 * transfer of player input to mount controller — all separate
 * follow-ups.
 *
 * Scope-isolated from `pet-companion.ts` (non-rideable summons),
 * `avatars.ts` (rig references are shape-only), and `vehicles` (future
 * multi-passenger controllable entities).
 */

import { z } from "zod";

/** MountId — lowerCamelCase ASCII identifier. */
const MountId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "mount id must be lowerCamelCase ASCII identifier",
  );

/**
 * Locomotion mode — drives physics profile, collision shape, and the
 * controller selected by the runtime. Mount may support multiple modes
 * (e.g. amphibious = ground + water), but must declare at least one.
 */
export const MountLocomotionSchema = z.enum(["ground", "water", "flight"]);
export type MountLocomotion = z.infer<typeof MountLocomotionSchema>;

/**
 * Mount category — drives UI grouping + progression gating. Tuned to
 * be orthogonal to locomotion (a "legendary flying" mount is category
 * `legendary` with locomotion `["flight"]`).
 */
export const MountCategorySchema = z.enum([
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
]);
export type MountCategory = z.infer<typeof MountCategorySchema>;

/** Input hotkey slot — matches typical MMO mount bars. */
export const MountHotkeySchema = z.enum([
  "none",
  "mountBar1",
  "mountBar2",
  "mountBar3",
  "mountBar4",
]);
export type MountHotkey = z.infer<typeof MountHotkeySchema>;

/**
 * Stamina model. Mount can sprint while `currentStamina > 0`; drains
 * at `drainPerSecondSprint`, regens at `regenPerSecond`. 0 = unlimited
 * sprint (uses `maxStamina = 0` as the sentinel).
 */
export const MountStaminaSchema = z
  .object({
    maxStamina: z.number().min(0).max(10_000).default(100),
    regenPerSecond: z.number().min(0).max(1000).default(10),
    drainPerSecondSprint: z.number().min(0).max(1000).default(20),
    /** If true, stamina pauses draining when stationary even while sprinting. */
    pauseWhenStationary: z.boolean().default(true),
  })
  .strict();
export type MountStamina = z.infer<typeof MountStaminaSchema>;

/**
 * Speeds per locomotion mode, in world units per second. A mount only
 * needs speeds for modes it declares; loader fills 0 for undeclared.
 */
export const MountSpeedsSchema = z
  .object({
    walkSpeed: z.number().min(0).max(200).default(6),
    runSpeed: z.number().min(0).max(200).default(12),
    sprintSpeed: z.number().min(0).max(200).default(18),
    /** Only meaningful if `flight` in locomotion[]. */
    flySpeed: z.number().min(0).max(500).default(0),
    /** Only meaningful if `water` in locomotion[]. */
    swimSpeed: z.number().min(0).max(100).default(0),
    /** Only meaningful if `flight` in locomotion[]. */
    maxAltitudeMeters: z.number().min(0).max(10_000).default(0),
  })
  .strict();
export type MountSpeeds = z.infer<typeof MountSpeedsSchema>;

/**
 * Passenger + cargo capacity. Most mounts are single-seat (`1`);
 * wagons/ships increase this. `cargoSlots` is independent — a horse
 * with saddlebags can have 0 passengers + N slots.
 */
export const MountCapacitySchema = z
  .object({
    passengers: z.number().int().min(1).max(20).default(1),
    cargoSlots: z.number().int().min(0).max(500).default(0),
    /** Whether passengers can interact (attack/cast) while riding. */
    passengersCanAct: z.boolean().default(false),
  })
  .strict();
export type MountCapacity = z.infer<typeof MountCapacitySchema>;

/**
 * Summon rules. Most fields mirror `pet-companion.ts` but with
 * mount-specific defaults (longer cooldown, combat suppression).
 */
export const MountSummonRulesSchema = z
  .object({
    allowInCombat: z.boolean().default(false),
    allowInSafeZones: z.boolean().default(true),
    allowIndoors: z.boolean().default(false),
    allowUnderwater: z.boolean().default(false),
    summonCooldownSec: z.number().min(0).max(3600).default(3),
    /** If true, dismounting in combat is forbidden (kick-prevention). */
    forceDismountOnDamage: z.boolean().default(true),
  })
  .strict();
export type MountSummonRules = z.infer<typeof MountSummonRulesSchema>;

export const MountSchema = z
  .object({
    id: MountId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    category: MountCategorySchema,
    /** Rig id resolved against `avatars.ts`. */
    modelId: z.string().default(""),
    /** Optional idle animation id (resolved against `animations.ts`). */
    idleAnimationId: z.string().default(""),
    /** Optional mount-up animation id. */
    mountAnimationId: z.string().default(""),
    /** Optional mount-up SFX id (resolved against `sfx.ts`). */
    mountSfxId: z.string().default(""),
    /** Optional mount-up VFX id (resolved against `vfx.ts`). */
    mountVfxId: z.string().default(""),
    /** One or more locomotion modes. Duplicates rejected. */
    locomotion: z.array(MountLocomotionSchema).min(1),
    speeds: MountSpeedsSchema.default(() => MountSpeedsSchema.parse({})),
    stamina: MountStaminaSchema.default(() => MountStaminaSchema.parse({})),
    capacity: MountCapacitySchema.default(() => MountCapacitySchema.parse({})),
    summonRules: MountSummonRulesSchema.default(() =>
      MountSummonRulesSchema.parse({}),
    ),
    hotkey: MountHotkeySchema.default("none"),
    /** Minimum riding skill level to use (0 = no gate). */
    requiredRidingLevel: z.number().int().min(0).max(100).default(0),
    /** If true, mount persists across logout (saved to character slot). */
    persistent: z.boolean().default(true),
    /** If true, the mount can be traded between players. */
    tradeable: z.boolean().default(false),
  })
  .strict()
  .refine(({ locomotion }) => new Set(locomotion).size === locomotion.length, {
    message: "mount locomotion list must not repeat a locomotion mode",
  })
  .refine(
    ({ locomotion, speeds }) =>
      !locomotion.includes("flight") || speeds.flySpeed > 0,
    {
      message:
        "mount with `flight` locomotion must declare `speeds.flySpeed > 0`",
    },
  )
  .refine(
    ({ locomotion, speeds }) =>
      !locomotion.includes("water") || speeds.swimSpeed > 0,
    {
      message:
        "mount with `water` locomotion must declare `speeds.swimSpeed > 0`",
    },
  )
  .refine(
    ({ locomotion, speeds }) => {
      const hasGround = locomotion.includes("ground");
      return !hasGround || speeds.runSpeed > 0;
    },
    {
      message:
        "mount with `ground` locomotion must declare `speeds.runSpeed > 0`",
    },
  )
  .refine(
    ({ stamina }) =>
      stamina.maxStamina === 0 ||
      stamina.regenPerSecond > 0 ||
      stamina.drainPerSecondSprint === 0,
    {
      message:
        "mount with maxStamina > 0 and drainPerSecondSprint > 0 must have regenPerSecond > 0 (otherwise sprint is one-shot)",
    },
  );
export type Mount = z.infer<typeof MountSchema>;

/**
 * Manifest is a bare array of mount entries with a unique-id refinement.
 */
export const MountsManifestSchema = z
  .array(MountSchema)
  .refine((arr) => new Set(arr.map((m) => m.id)).size === arr.length, {
    message: "mount ids must be unique",
  });
export type MountsManifest = z.infer<typeof MountsManifestSchema>;
