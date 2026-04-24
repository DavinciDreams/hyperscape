/**
 * Time-of-day + weather manifest schema.
 *
 * Phase G1 of the World Studio AAA plan — authors describe
 *   (a) the day/night cycle: cycle length, keyframed sun/moon/ambient
 *       colors and intensities, plus the fog tint that rises at night;
 *   (b) the weather system: a set of named weather states, their
 *       visual parameters, and the transition probabilities that drive
 *       autonomous weather changes.
 *
 * Keeping both on one manifest because gameplay systems consuming them
 * (sky, fog, post-processing, particle spawners for rain/snow) always
 * need them together.
 *
 * Substrate only — a `WorldEnvironmentSystem` that reads this at tick
 * time is a separate follow-up.
 */

import { z } from "zod";

/** 0xRRGGBB integer — matches existing `spell-visuals.ts`/`vfx.ts`. */
const HexColor = z.number().int().min(0).max(0xffffff);

/**
 * A single keyframe on the day/night cycle. `t` is normalized to [0,1]
 * where 0 = cycle start (configurable to "dawn" or "midnight" by the
 * author via `timeOrigin`).
 */
export const TimeOfDayKeyframeSchema = z.object({
  t: z.number().min(0).max(1),
  /** Hex color for the sun directional light. */
  sunColor: HexColor,
  /** Hex color for the moon directional light (mostly dusk/night). */
  moonColor: HexColor,
  /** Hex color for scene ambient / sky uniform tint. */
  ambientColor: HexColor,
  /** Directional-light intensity for the sun (>=0). */
  sunIntensity: z.number().min(0),
  /** Directional-light intensity for the moon (>=0). */
  moonIntensity: z.number().min(0),
  /** Hex color for the distance fog. */
  fogColor: HexColor,
  /** Fog density (>=0; typical values 0.001..0.05). */
  fogDensity: z.number().min(0),
});
export type TimeOfDayKeyframe = z.infer<typeof TimeOfDayKeyframeSchema>;

export const DayNightCycleSchema = z.object({
  /** Full day-night loop length, in real seconds. */
  cycleSeconds: z.number().positive(),
  /**
   * Which phase of the cycle `t = 0` represents. `"dawn"` aligns the
   * natural start-of-day with t=0 (most intuitive for authoring);
   * `"midnight"` is a common alternative.
   */
  timeOrigin: z.enum(["dawn", "midday", "dusk", "midnight"]).default("dawn"),
  /**
   * Ordered keyframes. At least two are required so interpolation has
   * endpoints; the runtime loops (keyframe t=1 blends back to t=0).
   */
  keyframes: z.array(TimeOfDayKeyframeSchema).min(2),
});
export type DayNightCycle = z.infer<typeof DayNightCycleSchema>;

/**
 * A single named weather state. All visual knobs live on this node —
 * the runtime interpolates between the *current* state and the *next*
 * state over `transitionSeconds` when a change fires.
 */
export const WeatherStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  /** Hex overlay color applied to the skybox (fog/tint). */
  skyTint: HexColor.default(0xffffff),
  /** Extra fog density added on top of the day/night base (>=0). */
  fogDensityBoost: z.number().min(0).default(0),
  /**
   * Wind vector in world units per second. Z is vertical.
   */
  wind: z
    .object({
      x: z.number().default(0),
      y: z.number().default(0),
      z: z.number().default(0),
    })
    .default({ x: 0, y: 0, z: 0 }),
  /** Rain particle rate (0 = none). */
  rainIntensity: z.number().min(0).max(1).default(0),
  /** Snow particle rate (0 = none). */
  snowIntensity: z.number().min(0).max(1).default(0),
  /** Thunder/lightning strike probability per second (0 = never). */
  lightningChancePerSecond: z.number().min(0).max(1).default(0),
  /** Optional ambient sfx id (see `sfx.ts`) looped while active. */
  ambientSfxId: z.string().min(1).optional(),
  /** Optional one-shot vfx id (see `vfx.ts`) played on state enter. */
  enterVfxId: z.string().min(1).optional(),
});
export type WeatherState = z.infer<typeof WeatherStateSchema>;

/**
 * Directed transition between two weather states. `chance` is a soft
 * weight — the runtime normalizes chances per "from" state so authors
 * can think in plain numbers (0..1 each) without worrying about
 * summing to 1. `cooldownSeconds` prevents ping-pong between adjacent
 * states.
 */
export const WeatherTransitionSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  chance: z.number().min(0).max(1),
  cooldownSeconds: z.number().min(0).default(0),
});
export type WeatherTransition = z.infer<typeof WeatherTransitionSchema>;

export const WeatherManifestSchema = z.object({
  states: z.array(WeatherStateSchema).min(1),
  transitions: z.array(WeatherTransitionSchema).default([]),
  /** Seconds over which any transition lerps the visual knobs. */
  transitionSeconds: z.number().min(0).default(4),
  /** Which state id the world starts in on server boot. */
  defaultStateId: z.string().min(1),
});
export type WeatherManifest = z.infer<typeof WeatherManifestSchema>;

export const TimeWeatherManifestSchema = z.object({
  dayNight: DayNightCycleSchema,
  weather: WeatherManifestSchema,
});
export type TimeWeatherManifest = z.infer<typeof TimeWeatherManifestSchema>;
