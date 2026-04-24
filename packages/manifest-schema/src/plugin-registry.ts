/**
 * Plugin registry manifest schema.
 *
 * Companion to `plugin.ts` — where `PluginManifestSchema` describes a
 * SINGLE plugin's `plugin.json`, this file describes the PER-INSTALL
 * aggregated registry: the list of plugins the current project has
 * installed, plus their enable/disable state.
 *
 * Shape:
 *   {
 *     "plugins": [PluginManifest, PluginManifest, ...],
 *     "enabledByDefault": { "<pluginId>": boolean, ... }
 *   }
 *
 * The `plugins[]` array is the authored list of installed plugin
 * manifests. The optional `enabledByDefault` map overrides each
 * plugin's individual `enabledByDefault` flag — useful when a
 * project wants to ship with a bundled plugin disabled without
 * editing the vendored `plugin.json`.
 *
 * Refinements:
 *   - plugin ids must be unique across the registry
 *   - every key in `enabledByDefault` must resolve to a plugin id
 */

import { z } from "zod";
import { PluginManifestSchema } from "./plugin.js";

export const PluginRegistryManifestSchema = z
  .object({
    plugins: z.array(PluginManifestSchema).default([]),
    enabledByDefault: z.record(z.string().min(1), z.boolean()).default({}),
  })
  .refine(
    ({ plugins }) => new Set(plugins.map((p) => p.id)).size === plugins.length,
    { message: "plugin registry must have unique plugin ids" },
  )
  .refine(
    ({ plugins, enabledByDefault }) => {
      const ids = new Set(plugins.map((p) => p.id));
      return Object.keys(enabledByDefault).every((k) => ids.has(k));
    },
    {
      message:
        "enabledByDefault keys must reference a plugin id present in `plugins`",
    },
  );
export type PluginRegistryManifest = z.infer<
  typeof PluginRegistryManifestSchema
>;
