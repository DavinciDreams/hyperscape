/**
 * Render-profile manifest schema.
 *
 * Phase F3 of the World Studio AAA plan — the *authored* look of a
 * project as opposed to the *user-selectable* quality tier
 * (`quality-presets.ts`). Render profile captures:
 *
 *   - Tone mapping operator + exposure
 *   - Bloom (threshold, strength, radius)
 *   - Fog (color, density, near/far)
 *   - Ambient light color + intensity
 *   - Environment map + rotation
 *   - Color grading (lift/gamma/gain + saturation)
 *
 * Authors pick ONE active render profile per project (e.g.
 * "hyperscape-default" vs. "dark-dungeon"). The renderer applies
 * `RenderProfile ∘ QualityPreset`: profile sets the artistic intent,
 * preset scales cost to the user's hardware.
 *
 * This is separate from `quality-presets.ts` so art direction and
 * quality scaling can be tuned independently.
 */

import { z } from "zod";

/** Hex color regex — `#RGB` or `#RRGGBB`. Lowercase normalized. */
const HexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "color must be #RGB or #RRGGBB");

/** Tone mapping operator. Matches Three.js's named constants. */
export const ToneMappingOperatorSchema = z.enum([
  "none",
  "linear",
  "reinhard",
  "cineon",
  "aces-filmic",
  "agx",
  "neutral",
]);
export type ToneMappingOperator = z.infer<typeof ToneMappingOperatorSchema>;

export const BloomSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Luminance threshold above which pixels bloom. 0..2 typical. */
  threshold: z.number().min(0).max(4).default(0.9),
  /** Bloom strength multiplier. */
  strength: z.number().min(0).max(4).default(0.6),
  /** Radius of the blur in screen units. */
  radius: z.number().min(0).max(2).default(0.4),
});
export type BloomSettings = z.infer<typeof BloomSettingsSchema>;

export const FogModeSchema = z.enum(["none", "linear", "exp2"]);
export type FogMode = z.infer<typeof FogModeSchema>;

export const FogSettingsSchema = z
  .object({
    mode: FogModeSchema.default("exp2"),
    color: HexColor.default("#c8c8d0"),
    /** Used for `exp2` mode. */
    density: z.number().min(0).max(1).default(0.02),
    /** Linear-mode near distance. */
    near: z.number().nonnegative().default(10),
    /** Linear-mode far distance; must be > near if mode === linear. */
    far: z.number().positive().default(500),
  })
  .refine(({ mode, near, far }) => (mode === "linear" ? far > near : true), {
    message: "linear fog requires `far` > `near`",
  });
export type FogSettings = z.infer<typeof FogSettingsSchema>;

export const AmbientLightSchema = z.object({
  color: HexColor.default("#ffffff"),
  intensity: z.number().min(0).max(8).default(0.4),
});
export type AmbientLight = z.infer<typeof AmbientLightSchema>;

export const EnvironmentMapSchema = z.object({
  /** Asset id or URL to an equirect HDR; empty string disables. */
  assetId: z.string().default(""),
  /** Y-axis rotation in radians. */
  rotation: z.number().default(0),
  /** Intensity multiplier applied to IBL sampling. */
  intensity: z.number().min(0).max(8).default(1),
  /** Whether the env map also shows as the skybox. */
  asBackground: z.boolean().default(true),
});
export type EnvironmentMap = z.infer<typeof EnvironmentMapSchema>;

export const ColorGradingSchema = z.object({
  enabled: z.boolean().default(true),
  /** Per-channel shadow offset. 0 = neutral. */
  lift: z.number().min(-1).max(1).default(0),
  /** Per-channel midtone power. 1 = neutral. */
  gamma: z.number().min(0.1).max(4).default(1),
  /** Per-channel highlight multiplier. 1 = neutral. */
  gain: z.number().min(0).max(4).default(1),
  saturation: z.number().min(0).max(4).default(1),
  contrast: z.number().min(0).max(4).default(1),
});
export type ColorGrading = z.infer<typeof ColorGradingSchema>;

export const RenderProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  toneMapping: ToneMappingOperatorSchema.default("aces-filmic"),
  /** Scene-exposure multiplier applied before tone mapping. */
  exposure: z.number().min(0).max(8).default(1),
  bloom: BloomSettingsSchema.default({
    enabled: true,
    threshold: 0.9,
    strength: 0.6,
    radius: 0.4,
  }),
  fog: FogSettingsSchema.default({
    mode: "exp2",
    color: "#c8c8d0",
    density: 0.02,
    near: 10,
    far: 500,
  }),
  ambient: AmbientLightSchema.default({ color: "#ffffff", intensity: 0.4 }),
  environment: EnvironmentMapSchema.default({
    assetId: "",
    rotation: 0,
    intensity: 1,
    asBackground: true,
  }),
  colorGrading: ColorGradingSchema.default({
    enabled: true,
    lift: 0,
    gamma: 1,
    gain: 1,
    saturation: 1,
    contrast: 1,
  }),
});
export type RenderProfile = z.infer<typeof RenderProfileSchema>;

export const RenderProfileManifestSchema = z
  .array(RenderProfileSchema)
  .min(1, "render-profile manifest must contain at least one profile")
  .refine((list) => new Set(list.map((p) => p.id)).size === list.length, {
    message: "render profile ids must be unique",
  });
export type RenderProfileManifest = z.infer<typeof RenderProfileManifestSchema>;
