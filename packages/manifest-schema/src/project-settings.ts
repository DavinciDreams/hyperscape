/**
 * Project settings manifest schema.
 *
 * Phase J7 of the World Studio AAA plan — single source of truth for
 * per-project top-level settings: game mode id, enabled plugins,
 * render quality profile, default input scheme, default locale,
 * world seed. Owned by the editor's Project Settings panel; the
 * runtime reads this at boot to initialize managers.
 *
 * Intentionally coarse — anything that changes per gameplay session
 * (player prefs, accessibility) lives elsewhere. Project Settings is
 * "what this world ships as" config.
 */

import { z } from "zod";

const PluginId = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/,
    "Plugin id must look like 'com.studio.my-plugin' (reverse-domain slug)",
  );

export const EnabledPluginSchema = z.object({
  id: PluginId,
  /**
   * Pinned version; editor resolves against `versionRange` in the
   * dependency graph at deploy time. `"*"` means "use whatever's
   * installed" — dangerous for production, fine for local iteration.
   */
  version: z.string().min(1),
  enabled: z.boolean().default(true),
});
export type EnabledPlugin = z.infer<typeof EnabledPluginSchema>;

/**
 * Quality preset — maps to a bundle of renderer toggles (shadow
 * resolution, reflection quality, post-processing stack depth).
 * The actual preset definitions live in a separate `quality.json`;
 * this just pins which one the project ships with.
 */
export const QualityPresetSchema = z.enum([
  "low",
  "medium",
  "high",
  "ultra",
  "custom",
]);
export type QualityPreset = z.infer<typeof QualityPresetSchema>;

export const InputSchemeSchema = z.enum([
  "keyboard-mouse",
  "gamepad",
  "touch",
  "auto",
]);
export type InputScheme = z.infer<typeof InputSchemeSchema>;

const LocaleTag = z
  .string()
  .regex(
    /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,4})*$/,
    "Default locale must be a BCP-47 tag (e.g. 'en' or 'en-US')",
  );

/**
 * Project-level runtime render config.
 *
 * Renamed from `RenderProfileSchema` to avoid colliding with
 * `render-profile.ts` (which is the full *authored* render look —
 * tone map + bloom + fog + grading). This schema is the runtime
 * quality/perf knobs the project ships with.
 */
export const ProjectRenderConfigSchema = z.object({
  preset: QualityPresetSchema.default("medium"),
  /** Hard cap on frame rate — 0 = uncapped. */
  targetFps: z.number().int().min(0).max(480).default(60),
  /** Scale applied to internal render resolution — 1.0 = native. */
  resolutionScale: z.number().min(0.25).max(2.0).default(1.0),
  /** Anti-aliasing method. */
  antialiasing: z
    .enum(["none", "fxaa", "taa", "msaa2x", "msaa4x"])
    .default("taa"),
});
export type ProjectRenderConfig = z.infer<typeof ProjectRenderConfigSchema>;

export const ProjectSettingsManifestSchema = z
  .object({
    /** Project identity — used in the editor titlebar and build artifact. */
    projectName: z.string().min(1),
    /** Required — which GameMode controller to boot. */
    gameModeId: z.string().min(1),
    plugins: z.array(EnabledPluginSchema).default([]),
    renderProfile: ProjectRenderConfigSchema.default({
      preset: "medium",
      targetFps: 60,
      resolutionScale: 1.0,
      antialiasing: "taa",
    }),
    defaultInputScheme: InputSchemeSchema.default("auto"),
    defaultLocale: LocaleTag.default("en"),
    /** World seed for deterministic procgen; empty = runtime-assigned. */
    worldSeed: z.string().default(""),
    /**
     * Toggle PIE features on/off — e.g. skip intro, enable dev
     * console, auto-teleport to spawn. Free-form key/bool map.
     */
    pieFlags: z.record(z.string().min(1), z.boolean()).default({}),
  })
  .refine(
    ({ plugins }) => new Set(plugins.map((p) => p.id)).size === plugins.length,
    { message: "plugin ids in project settings must be unique" },
  );
export type ProjectSettingsManifest = z.infer<
  typeof ProjectSettingsManifestSchema
>;
