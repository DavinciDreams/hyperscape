/**
 * Plugin host health check.
 *
 * Pure-logic pre-flight validator that answers a single question:
 * "if I call `host.loadAll()` right now, what — if anything — will
 * go wrong?" The returned report is structured so the editor's
 * Plugin Browser can render a per-plugin health column without
 * rediscovering the failure conditions from `loadAll()` exceptions.
 *
 * Three issue kinds are detected:
 *   - `missing-factory` — plugin is in the registry but no factory
 *     was registered on the host (pending binding in editor mode)
 *   - `orphan-factory` — factory registered on the host for an id
 *     that doesn't appear in the registry (usually a typo or a
 *     stale registration after registry edit)
 *   - `dependency-cycle` — catalog `loadOrder()` throws
 *     `PluginDependencyCycleError`; rolled up once with the cycle
 *     path attached rather than per-plugin
 *   - `missing-hard-dependency` — plugin declares a hard dep whose
 *     id is absent from the registry
 *   - `version-mismatch` — plugin declares `dependencies[].versionRange`
 *     that the resolved dep's `version` does not satisfy
 *   - `invalid-version-range` — the declared `versionRange` or the
 *     resolved dep's `version` is unparseable under the supported
 *     SemVer grammar
 *
 * No DOM, no React. All data comes from the host's catalog and
 * factory registry, so the check is deterministic + side-effect free.
 */

import { PluginDependencyCycleError } from "./PluginCatalog.js";
import type { PluginContextBase, PluginHost } from "./PluginHost.js";
import {
  InvalidPluginVersionError,
  InvalidPluginVersionRangeError,
  satisfiesPluginVersionRange,
} from "./PluginVersionRange.js";

export type PluginHealthIssueKind =
  | "missing-factory"
  | "orphan-factory"
  | "dependency-cycle"
  | "missing-hard-dependency"
  | "version-mismatch"
  | "invalid-version-range";

export interface PluginHealthIssue {
  readonly kind: PluginHealthIssueKind;
  /**
   * Plugin id this issue is attributed to. For `dependency-cycle`
   * this is the first id in the reported cycle; the full path is in
   * `details.cyclePath`.
   */
  readonly pluginId: string;
  readonly message: string;
  readonly details?: {
    readonly missingDependencyIds?: readonly string[];
    readonly cyclePath?: readonly string[];
    readonly dependencyId?: string;
    readonly requiredRange?: string;
    readonly resolvedVersion?: string;
  };
}

export interface PluginHostHealthReport {
  readonly healthy: boolean;
  readonly issues: readonly PluginHealthIssue[];
}

export function checkPluginHostHealth<TContext extends PluginContextBase>(
  host: PluginHost<TContext>,
): PluginHostHealthReport {
  const issues: PluginHealthIssue[] = [];
  const catalog = host.catalog;
  const registryIds = new Set(catalog.ids);

  // Factory coverage: plugins without a factory, factories without a plugin.
  for (const id of registryIds) {
    if (!host.hasPlugin(id)) {
      issues.push({
        kind: "missing-factory",
        pluginId: id,
        message: `no factory registered for plugin "${id}"`,
      });
    }
  }
  for (const rec of host.records) {
    if (!registryIds.has(rec.manifest.id)) {
      issues.push({
        kind: "orphan-factory",
        pluginId: rec.manifest.id,
        message: `factory registered for "${rec.manifest.id}" but the plugin is not in the registry`,
      });
    }
  }

  // Hard-dependency resolution per plugin.
  for (const id of registryIds) {
    const missing = catalog.missingHardDependencies(id);
    if (missing.length > 0) {
      issues.push({
        kind: "missing-hard-dependency",
        pluginId: id,
        message: `plugin "${id}" declares unresolved hard dependencies: ${missing.join(", ")}`,
        details: { missingDependencyIds: [...missing] },
      });
    }
  }

  // Version-range resolution per declared dependency. Skip
  // dependencies not in the registry — those are already reported
  // as `missing-hard-dependency` (for hard deps) or ignorable (for
  // optional deps). Here we only compare versions when both sides
  // exist so the two issue kinds don't double-fire.
  for (const id of registryIds) {
    const manifest = catalog.get(id);
    for (const dep of manifest.dependencies) {
      if (!registryIds.has(dep.id)) continue;
      const resolved = catalog.get(dep.id);
      try {
        if (!satisfiesPluginVersionRange(resolved.version, dep.versionRange)) {
          issues.push({
            kind: "version-mismatch",
            pluginId: id,
            message: `plugin "${id}" requires "${dep.id}" ${dep.versionRange} but ${resolved.version} is registered`,
            details: {
              dependencyId: dep.id,
              requiredRange: dep.versionRange,
              resolvedVersion: resolved.version,
            },
          });
        }
      } catch (err) {
        if (
          err instanceof InvalidPluginVersionRangeError ||
          err instanceof InvalidPluginVersionError
        ) {
          issues.push({
            kind: "invalid-version-range",
            pluginId: id,
            message: `plugin "${id}" dependency on "${dep.id}" has unparseable version data (${err.message})`,
            details: {
              dependencyId: dep.id,
              requiredRange: dep.versionRange,
              resolvedVersion: resolved.version,
            },
          });
        } else {
          throw err;
        }
      }
    }
  }

  // Catalog cycle probe — surfaces a single entry instead of N.
  try {
    catalog.loadOrder();
  } catch (err) {
    if (err instanceof PluginDependencyCycleError) {
      const cyclePath = [...err.cycle];
      issues.push({
        kind: "dependency-cycle",
        pluginId: cyclePath[0] ?? "<unknown>",
        message: `plugin dependency cycle: ${cyclePath.join(" -> ")}`,
        details: { cyclePath },
      });
    } else {
      throw err;
    }
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}
