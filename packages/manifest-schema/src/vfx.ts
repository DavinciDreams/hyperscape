/**
 * VFX (visual effect) manifest schema.
 *
 * Phase E2 of the World Studio AAA plan — authors bind general-purpose
 * one-shot / transient visual effects (hit burst, pickup sparkle, level-up
 * column, heal aura, explosion, weather-gust) to stable string ids that
 * systems trigger via events:
 *
 *   world.emit("vfx:play", { id: "hit_slash", position, rotation })
 *
 * Scope is deliberately narrower than `spell-visuals.ts`, which owns
 * projectile/arrow tuning (color/size/trail for in-flight orbs). VFX
 * entries are ephemeral effects *spawned* at a point / on an entity and
 * decay over `duration`.
 *
 * Today this is substrate only — the runtime binding (`VfxSystem.play`)
 * is a separate follow-up and will read this manifest by id. Keeping
 * the schema deliberately small so new fields can land without
 * destabilising existing author content.
 */

import { z } from "zod";

export const VfxKindSchema = z.enum([
  "impact",
  "burst",
  "aura",
  "trail",
  "beam",
  "column",
  "ground-ring",
  "ambient",
]);
export type VfxKind = z.infer<typeof VfxKindSchema>;

export const VfxBlendModeSchema = z.enum(["normal", "additive", "multiply"]);
export type VfxBlendMode = z.infer<typeof VfxBlendModeSchema>;

/**
 * Curve anchor for simple parameter-over-lifetime tweening. Value at
 * `t=0` is the initial value; value at `t=1` is the terminal value;
 * optional intermediate `[t, v]` pairs interpolate linearly. Runtime
 * readers that only care about endpoints can ignore mid-anchors.
 */
export const VfxCurveSchema = z.object({
  anchors: z
    .array(
      z.object({
        t: z.number().min(0).max(1),
        value: z.number(),
      }),
    )
    .min(2)
    .describe(
      "At least [{t:0}, {t:1}]. Anchors need not be sorted — runtime sorts on load.",
    ),
});
export type VfxCurve = z.infer<typeof VfxCurveSchema>;

export const VfxEffectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: VfxKindSchema,
  description: z.string().default(""),
  /**
   * Asset reference — path to a particle spec, gltf, tsl preset, or
   * whatever the renderer consumes. Kept as an opaque string here so
   * the schema doesn't couple to a particular pipeline.
   */
  asset: z.string().min(1),
  /** Total effect lifetime in seconds. 0 = indefinite (author must stop explicitly). */
  duration: z.number().nonnegative().default(1),
  /** Base tint color as 0xRRGGBB integer. */
  color: z.number().int().min(0).max(0xffffff).default(0xffffff),
  /** Additional multiplier on base emissive intensity (>=0). */
  glowIntensity: z.number().min(0).default(1),
  /** Base scale multiplier applied to the referenced asset. */
  scale: z.number().positive().default(1),
  /** Optional audio cue id fired alongside this effect (see `sfx.ts`). */
  sfxId: z.string().min(1).optional(),
  /** Blend mode hint — runtime may override per-material. */
  blendMode: VfxBlendModeSchema.default("normal"),
  /**
   * When true the effect follows its source entity (e.g. aura while
   * channelling); false = spawn world-space then decay.
   */
  attachToSource: z.boolean().default(false),
  /** Optional lifetime curves — alpha/scale fades over duration. */
  alphaOverLife: VfxCurveSchema.optional(),
  scaleOverLife: VfxCurveSchema.optional(),
  /**
   * Runtime may cull the effect under load (typical for hit bursts).
   * Ambient / channelled / UX-critical effects should leave this false.
   */
  cullable: z.boolean().default(false),
});
export type VfxEffect = z.infer<typeof VfxEffectSchema>;

/** The manifest JSON is a bare array. */
export const VfxManifestSchema = z.array(VfxEffectSchema);
export type VfxManifest = z.infer<typeof VfxManifestSchema>;
