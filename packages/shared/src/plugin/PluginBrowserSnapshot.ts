/**
 * Plugin Browser snapshot builder.
 *
 * Editor UI helper: takes a running `PluginHost` + the registry it was
 * built from and returns one flat array of `PluginBrowserRow` records
 * that the editor's Plugin Browser panel can render directly. Each
 * row bundles the manifest's author-facing metadata, the resolved
 * enabled-by-default flag (registry override-aware), the lifecycle
 * state, contribution surface counts, any recorded lifecycle error,
 * and (optionally) the structural `PluginHealthIssue`s attributed
 * to the plugin by `checkPluginHostHealth`.
 *
 * Pure logic — no DOM, no React, no `World` handle. The editor
 * consumes the array and decides presentation.
 */

import type { PluginRegistryManifest } from "@hyperforge/manifest-schema";
import type { PluginContextBase, PluginHost } from "./PluginHost.js";
import type {
  PluginHealthIssue,
  PluginHostHealthReport,
} from "./PluginHostHealthCheck.js";
import type { PluginLifecycleState } from "./PluginLoader.js";
import { resolvePluginEnabledByDefault } from "./PluginRegistryBridge.js";

/**
 * Single editor row. Intentionally serializable — strings, numbers,
 * booleans only, with one nested record for contribution counts.
 */
export interface PluginBrowserRow {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly author: string;
  readonly license: string;
  readonly state: PluginLifecycleState;
  readonly enabledByDefault: boolean;
  readonly hasFactory: boolean;
  readonly dependencyIds: readonly string[];
  readonly tags: readonly string[];
  readonly contributions: {
    readonly systems: number;
    readonly entities: number;
    readonly widgets: number;
    readonly manifestSchemas: number;
    readonly paletteCategories: number;
    readonly toolbarTools: number;
    readonly commands: number;
  };
  /** Serialized `Error.message` if the plugin entered `failed` state. */
  readonly errorMessage: string | null;
  /**
   * Structural authoring issues keyed to this plugin. Empty when no
   * `healthReport` is passed, or when the plugin has no issues in the
   * report. `dependency-cycle` issues are attributed to the first id
   * in the reported cycle (see `PluginHostHealthCheck.ts`); the full
   * path is in `details.cyclePath`.
   */
  readonly healthIssues: readonly PluginHealthIssue[];
}

/**
 * Build editor rows from the registry + live host. Rows are emitted
 * in the same order as `manifest.plugins[]` so the editor's default
 * sort matches the authored file order. Callers that want a
 * different sort can re-sort the returned array.
 *
 * Plugins in the registry that have never been registered with the
 * host still appear — the row just carries `hasFactory: false` and
 * `state: "registered"` so the Plugin Browser can surface them as
 * "pending binding" in editor-mode projects.
 */
export function buildPluginBrowserSnapshot<TContext extends PluginContextBase>(
  registry: PluginRegistryManifest,
  host: PluginHost<TContext>,
  healthReport?: PluginHostHealthReport,
): PluginBrowserRow[] {
  const recordsById = new Map(
    host.records.map((r) => [r.manifest.id, r] as const),
  );
  const issuesById = new Map<string, PluginHealthIssue[]>();
  if (healthReport) {
    for (const issue of healthReport.issues) {
      const bucket = issuesById.get(issue.pluginId);
      if (bucket) bucket.push(issue);
      else issuesById.set(issue.pluginId, [issue]);
    }
  }
  return registry.plugins.map((manifest) => {
    const record = recordsById.get(manifest.id);
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author.name,
      license: manifest.license,
      state: record?.state ?? "registered",
      enabledByDefault: resolvePluginEnabledByDefault(registry, manifest.id),
      hasFactory: host.hasPlugin(manifest.id),
      dependencyIds: manifest.dependencies.map((d) => d.id),
      tags: manifest.tags,
      contributions: {
        systems: manifest.contributions.systems.length,
        entities: manifest.contributions.entities.length,
        widgets: manifest.contributions.widgets.length,
        manifestSchemas: manifest.contributions.manifestSchemas.length,
        paletteCategories: manifest.contributions.paletteCategories.length,
        toolbarTools: manifest.contributions.toolbarTools.length,
        commands: manifest.contributions.commands.length,
      },
      errorMessage: record?.error ? record.error.message : null,
      healthIssues: issuesById.get(manifest.id) ?? [],
    };
  });
}
