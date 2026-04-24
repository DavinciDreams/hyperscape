/**
 * Typed manifest export for the hello reference plugin.
 *
 * Plain JSON sits at the package root as `plugin.json`. This file
 * imports that JSON, parses it through `PluginManifestSchema` at module
 * load, and re-exports the frozen typed value. Consumers (tests,
 * external registries, the editor's Plugin Browser) can import
 * `manifest` directly without re-parsing.
 *
 * Parsing happens at module load so any manifest regression fails
 * early — ideally during `bun run build` / `bun run test` rather than
 * at host registration time.
 */

import {
  PluginManifestSchema,
  type PluginManifest,
} from "@hyperforge/gameplay-framework";

import pluginJson from "../plugin.json" with { type: "json" };

export const manifest: PluginManifest = PluginManifestSchema.parse(pluginJson);
