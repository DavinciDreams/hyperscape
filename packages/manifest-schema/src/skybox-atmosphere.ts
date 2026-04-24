/**
 * Skybox + atmospheric-scattering manifest schema.
 *
 * Authored description of the *static* sky — sun/moon orientation,
 * star field, horizon/zenith gradient, cloud layers, and atmospheric
 * scattering knobs. Complements `time-weather.ts` which owns the
 * *animated* day/night cycle + weather states.
 *
 * Substrate only — the runtime skybox renderer lands separately.
 *
 * Scope note: this schema does not describe the GPU shader used to
 * render the sky. It describes the *parameters* a sky shader consumes.
 * Different quality presets may pick different shaders — that choice
 * belongs to `render-profile.ts`.
 */

import { z } from "zod";

/** Hex color — 7-char `#rrggbb`. */
const HexColorString = z
  .string()
  .regex(
    /^#[0-9a-fA-F]{6}$/,
    "color must be a 7-char hex string like `#00aaff`",
  );

/** SkyboxId — lowerCamelCase ASCII identifier. */
const SkyboxId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "skybox id must be lowerCamelCase ASCII identifier",
  );

/** 3D unit-ish vector. Runtime normalizes on load. */
const Vec3 = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  })
  .strict()
  .refine((v) => v.x !== 0 || v.y !== 0 || v.z !== 0, {
    message: "direction vector must be non-zero",
  });

/** Sun disc configuration — physical analogue. */
export const SunDiscSchema = z
  .object({
    /** Direction *from ground toward sun* in world space; runtime normalizes. */
    direction: Vec3,
    color: HexColorString.default("#ffffff"),
    /** Angular diameter in degrees (Earth-like ≈ 0.53). */
    angularDiameterDeg: z.number().min(0).max(30).default(0.53),
    /** Multiplier on rendered disc intensity. */
    intensity: z.number().min(0).default(1),
  })
  .strict();
export type SunDisc = z.infer<typeof SunDiscSchema>;

/** Moon disc configuration. */
export const MoonDiscSchema = z
  .object({
    direction: Vec3,
    color: HexColorString.default("#e6ecff"),
    angularDiameterDeg: z.number().min(0).max(30).default(0.5),
    intensity: z.number().min(0).default(0.05),
    /** Optional moon texture id (runtime resolves against assets). */
    textureId: z.string().default(""),
    /** Phase — 0 = new, 0.5 = full, 1 = new again. */
    phase: z.number().min(0).max(1).default(0.5),
  })
  .strict();
export type MoonDisc = z.infer<typeof MoonDiscSchema>;

/** Procedural star field. */
export const StarFieldSchema = z
  .object({
    /** Number of stars to render. */
    count: z.number().int().min(0).max(100_000).default(2000),
    /** Maximum brightness multiplier (0..1). */
    brightness: z.number().min(0).max(1).default(0.7),
    /** Twinkle animation speed (0 = static). */
    twinkleSpeed: z.number().min(0).max(10).default(0.5),
    /** Seed for deterministic placement. */
    seed: z.number().int().nonnegative().default(1),
    /**
     * Time-of-day window [t0, t1] (each in [0,1]) during which stars
     * are visible. t0 > t1 wraps through midnight (e.g. 0.8..0.2).
     */
    visibleWindow: z
      .object({
        t0: z.number().min(0).max(1),
        t1: z.number().min(0).max(1),
      })
      .strict()
      .default({ t0: 0.75, t1: 0.25 }),
  })
  .strict();
export type StarField = z.infer<typeof StarFieldSchema>;

/** A single cloud layer. */
export const CloudLayerSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "cloud layer id must be lowerCamelCase ASCII identifier",
      ),
    /** Layer altitude in world meters. */
    altitudeMeters: z.number().min(0).max(20_000),
    /** Coverage fraction (0 = clear sky, 1 = overcast). */
    coverage: z.number().min(0).max(1).default(0.3),
    /** Density / opacity multiplier. */
    density: z.number().min(0).max(1).default(0.5),
    /** Wind speed in m/s (horizontal). */
    windSpeed: z.number().min(0).max(200).default(5),
    /** Wind direction in degrees (0 = +x, 90 = +z). */
    windDirectionDeg: z.number().min(0).lt(360).default(0),
    /** Hex tint. */
    color: HexColorString.default("#ffffff"),
  })
  .strict();
export type CloudLayer = z.infer<typeof CloudLayerSchema>;

/**
 * Atmospheric-scattering knobs. Names follow Bruneton/Hillaire-style
 * sky model so they map 1:1 to common shader params.
 */
export const AtmosphereSchema = z
  .object({
    /** Planet radius in km (Earth ≈ 6371). */
    planetRadiusKm: z.number().positive().max(100_000).default(6371),
    /** Atmosphere thickness in km (Earth ≈ 100). */
    atmosphereHeightKm: z.number().positive().max(1_000).default(100),
    /** Rayleigh scattering coefficient (RGB, 1/km). */
    rayleighCoefficient: z
      .object({
        r: z.number().min(0).max(1),
        g: z.number().min(0).max(1),
        b: z.number().min(0).max(1),
      })
      .strict()
      .default({ r: 0.005, g: 0.013, b: 0.033 }),
    /** Rayleigh scale height (km). */
    rayleighScaleHeightKm: z.number().positive().max(100).default(8),
    /** Mie scattering coefficient (1/km). */
    mieCoefficient: z.number().min(0).max(1).default(0.004),
    /** Mie scale height (km). */
    mieScaleHeightKm: z.number().positive().max(100).default(1.2),
    /** Mie asymmetry factor (Henyey-Greenstein g ∈ [-1, 1], typ. 0.76). */
    mieG: z.number().min(-1).max(1).default(0.76),
    /** Ozone absorption (RGB, 1/km). */
    ozoneCoefficient: z
      .object({
        r: z.number().min(0).max(1),
        g: z.number().min(0).max(1),
        b: z.number().min(0).max(1),
      })
      .strict()
      .default({ r: 0.00065, g: 0.00188, b: 0.000085 }),
  })
  .strict();
export type Atmosphere = z.infer<typeof AtmosphereSchema>;

/** Fallback horizon→zenith gradient for shaders that don't do physical scattering. */
export const SkyGradientSchema = z
  .object({
    horizonColor: HexColorString.default("#b0c4e0"),
    zenithColor: HexColorString.default("#2a4a8a"),
    /** Power curve between horizon and zenith (1 = linear). */
    blendExponent: z.number().min(0.1).max(10).default(2),
  })
  .strict();
export type SkyGradient = z.infer<typeof SkyGradientSchema>;

/**
 * A single skybox config. An author can define multiple (e.g. default
 * world, underwater, dream sequence) and switch between them at
 * runtime. `activeSkyboxId` on the manifest declares which one is
 * live at world boot.
 */
export const SkyboxConfigSchema = z
  .object({
    id: SkyboxId,
    name: z.string().min(1),
    description: z.string().default(""),
    sun: SunDiscSchema,
    moon: MoonDiscSchema,
    stars: StarFieldSchema.default({
      count: 2000,
      brightness: 0.7,
      twinkleSpeed: 0.5,
      seed: 1,
      visibleWindow: { t0: 0.75, t1: 0.25 },
    }),
    cloudLayers: z.array(CloudLayerSchema).max(8).default([]),
    atmosphere: AtmosphereSchema.default({
      planetRadiusKm: 6371,
      atmosphereHeightKm: 100,
      rayleighCoefficient: { r: 0.005, g: 0.013, b: 0.033 },
      rayleighScaleHeightKm: 8,
      mieCoefficient: 0.004,
      mieScaleHeightKm: 1.2,
      mieG: 0.76,
      ozoneCoefficient: { r: 0.00065, g: 0.00188, b: 0.000085 },
    }),
    /** Fallback gradient for non-physical shaders / low-quality presets. */
    gradient: SkyGradientSchema.default({
      horizonColor: "#b0c4e0",
      zenithColor: "#2a4a8a",
      blendExponent: 2,
    }),
  })
  .strict()
  .refine(
    ({ cloudLayers }) =>
      new Set(cloudLayers.map((c) => c.id)).size === cloudLayers.length,
    { message: "cloud layer ids must be unique within a skybox" },
  );
export type SkyboxConfig = z.infer<typeof SkyboxConfigSchema>;

/**
 * Top-level manifest — many authored skyboxes, one active. Refinements:
 *   - unique skybox ids
 *   - `activeSkyboxId` must resolve to one of them
 */
export const SkyboxAtmosphereManifestSchema = z
  .object({
    skyboxes: z.array(SkyboxConfigSchema).min(1),
    activeSkyboxId: SkyboxId,
  })
  .strict()
  .refine(
    ({ skyboxes }) =>
      new Set(skyboxes.map((s) => s.id)).size === skyboxes.length,
    { message: "skybox ids must be unique" },
  )
  .refine(
    ({ skyboxes, activeSkyboxId }) =>
      skyboxes.some((s) => s.id === activeSkyboxId),
    { message: "`activeSkyboxId` must reference a declared skybox" },
  );
export type SkyboxAtmosphereManifest = z.infer<
  typeof SkyboxAtmosphereManifestSchema
>;
