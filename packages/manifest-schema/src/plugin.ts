/**
 * Plugin manifest schema.
 *
 * Phase I1 / Step 10 of the World Studio AAA plan — declarative plugin
 * metadata that `@hyperforge/gameplay-framework` consumes when loading
 * a `HyperforgePlugin`. The manifest lives alongside the plugin code
 * (`plugin.json`) and describes identity, lifecycle hooks, dependency
 * graph, and the registration surface (systems, entities, widgets,
 * schemas, palette categories, toolbar tools) the plugin contributes.
 *
 * The runtime `PluginLoader` (separate follow-up) validates this
 * manifest, resolves the dependency graph, and calls lifecycle
 * callbacks (onLoad/onEnable/onDisable) against the `PluginContext`
 * object from `@hyperforge/gameplay-framework`.
 *
 * Manifest is explicitly NOT an array — each plugin ships its own
 * `plugin.json`. The registry (per-install list of enabled plugins)
 * is a separate concern, tracked on the project settings side.
 */

import { z } from "zod";

/**
 * Semver-ish version string — conservative regex covering `X.Y.Z`
 * plus optional pre-release and build metadata. Not a full SemVer-2
 * parser because authors rarely need the complex cases and the
 * runtime does a string-compare-to-range using a real library.
 */
const SemVer = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    "Plugin version must look like '1.2.3' (SemVer)",
  );

/**
 * Plugin id — reverse-domain-style slug, enforced lowercase +
 * dot-separated. Mirrors the Unreal plugin naming convention.
 */
const PluginId = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/,
    "Plugin id must look like 'com.studio.my-plugin' (reverse-domain slug)",
  );

export const PluginDependencySchema = z.object({
  id: PluginId,
  /** npm-semver range, e.g. `"^1.2.0"`, `">=2 <3"`, `"latest"`. */
  versionRange: z.string().min(1),
  /**
   * Soft dependencies only log a warning when missing; hard deps
   * prevent the plugin from loading. Default is hard.
   */
  optional: z.boolean().default(false),
});
export type PluginDependency = z.infer<typeof PluginDependencySchema>;

/**
 * What surface the plugin contributes. Counts only — the actual
 * registration happens in code via PluginContext. The manifest
 * exists so the editor's Plugin Browser can surface a summary before
 * the plugin is enabled.
 */
export const PluginContributionsSchema = z.object({
  systems: z.array(z.string().min(1)).default([]),
  entities: z.array(z.string().min(1)).default([]),
  widgets: z.array(z.string().min(1)).default([]),
  manifestSchemas: z.array(z.string().min(1)).default([]),
  paletteCategories: z.array(z.string().min(1)).default([]),
  toolbarTools: z.array(z.string().min(1)).default([]),
  commands: z.array(z.string().min(1)).default([]),
});
export type PluginContributions = z.infer<typeof PluginContributionsSchema>;

export const PluginAuthorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  url: z.string().url().optional(),
});
export type PluginAuthor = z.infer<typeof PluginAuthorSchema>;

/**
 * SPDX license identifier or `"UNLICENSED"`. Free-form to avoid
 * pinning the full SPDX list; editor surfaces this verbatim.
 */
const LicenseId = z.string().min(1);

export const PluginManifestSchema = z
  .object({
    id: PluginId,
    name: z.string().min(1),
    version: SemVer,
    description: z.string().default(""),
    /** Module entry point relative to plugin root (e.g. `"./dist/index.js"`). */
    entry: z.string().min(1),
    author: PluginAuthorSchema,
    license: LicenseId.default("UNLICENSED"),
    homepage: z.string().url().optional(),
    repository: z.string().url().optional(),
    /** Plugin-API semver this plugin targets. */
    hyperforgeApi: SemVer,
    /** Required before this plugin activates. */
    dependencies: z.array(PluginDependencySchema).default([]),
    /** Plugins this plugin must load AFTER if both are present. */
    loadAfter: z.array(PluginId).default([]),
    /**
     * Enabled-by-default flag the editor respects on first install.
     * Users can toggle it; this is only the factory default.
     */
    enabledByDefault: z.boolean().default(true),
    contributions: PluginContributionsSchema.default({
      systems: [],
      entities: [],
      widgets: [],
      manifestSchemas: [],
      paletteCategories: [],
      toolbarTools: [],
      commands: [],
    }),
    /** Free-form tags for Plugin Browser filtering. */
    tags: z.array(z.string().min(1)).default([]),
  })
  .refine(({ id, dependencies }) => dependencies.every((d) => d.id !== id), {
    message: "plugin cannot declare itself as a dependency",
  })
  .refine(({ id, loadAfter }) => loadAfter.every((lid) => lid !== id), {
    message: "plugin cannot declare itself in `loadAfter`",
  })
  .refine(
    ({ dependencies }) =>
      new Set(dependencies.map((d) => d.id)).size === dependencies.length,
    { message: "dependency ids must be unique" },
  );
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
