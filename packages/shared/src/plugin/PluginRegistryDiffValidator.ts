/**
 * Pre-flight validation for a `PluginRegistryDiff` before the
 * editor calls `applyPluginRegistryDiff`. Catches issues that would
 * leave the registry internally inconsistent without throwing —
 * the editor surfaces issues as warnings/blockers in the confirm
 * dialog so the user can adjust their selection.
 *
 * Validation runs against the *projected* registry (`current` with
 * `selection`-filtered diff applied) — this lets the editor reflect
 * exactly what the user will get, including partial selections.
 *
 * Issue kinds:
 *   - `broken-dependency` — a plugin in the projected registry
 *     declares a hard dependency on a plugin id that isn't present
 *   - `version-mismatch` — a hard dependency's `versionRange` isn't
 *     satisfied by the dependency's actual version in the projected
 *     registry
 *   - `optional-dependency-missing` — same as broken-dependency but
 *     the dependency is `optional: true` (warn-level)
 *   - `optional-version-mismatch` — same as version-mismatch but
 *     optional (warn-level)
 *   - `dropped-dependent` — removing this plugin orphans dependents
 *     in the projected registry (separate from broken-dependency
 *     because the editor wants to phrase the toast as "if you remove
 *     X, Y will break")
 *
 * Pure transform. No I/O. The validator never throws — it returns a
 * report. The editor decides whether to allow apply or block on
 * `severity === "error"`.
 */

import type { PluginRegistryManifest } from "@hyperforge/manifest-schema";
import type { PluginRegistryDiff } from "./PluginManifestDiff.js";
import {
  type PluginRegistryDiffSelection,
  applyPluginRegistryDiff,
} from "./PluginRegistryDiffApply.js";
import {
  InvalidPluginVersionError,
  InvalidPluginVersionRangeError,
  satisfiesPluginVersionRange,
} from "./PluginVersionRange.js";

export type PluginRegistryDiffIssueKind =
  | "broken-dependency"
  | "version-mismatch"
  | "optional-dependency-missing"
  | "optional-version-mismatch"
  | "dropped-dependent";

export type PluginRegistryDiffIssueSeverity = "error" | "warning";

export interface PluginRegistryDiffIssue {
  readonly kind: PluginRegistryDiffIssueKind;
  readonly severity: PluginRegistryDiffIssueSeverity;
  /** Plugin the issue is about (the dependent or the removed plugin). */
  readonly pluginId: string;
  /** Other plugin id involved (the missing dep or the orphaned dependent). */
  readonly relatedPluginId: string;
  /** For version-mismatch issues, the requested range. */
  readonly requiredRange?: string;
  /** For version-mismatch issues, the actual installed version. */
  readonly actualVersion?: string;
  /** Human-readable summary the editor surfaces directly. */
  readonly message: string;
}

export interface PluginRegistryDiffValidationReport {
  readonly issues: readonly PluginRegistryDiffIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly canApply: boolean;
}

const SEVERITY_BY_KIND: Readonly<
  Record<PluginRegistryDiffIssueKind, PluginRegistryDiffIssueSeverity>
> = {
  "broken-dependency": "error",
  "version-mismatch": "error",
  "optional-dependency-missing": "warning",
  "optional-version-mismatch": "warning",
  "dropped-dependent": "error",
};

function appendDependencyIssues(
  issues: PluginRegistryDiffIssue[],
  projected: PluginRegistryManifest,
): void {
  const byId = new Map(projected.plugins.map((p) => [p.id, p] as const));
  for (const plugin of projected.plugins) {
    const deps = plugin.dependencies ?? [];
    for (const dep of deps) {
      const target = byId.get(dep.id);
      if (!target) {
        if (dep.optional) {
          issues.push({
            kind: "optional-dependency-missing",
            severity: SEVERITY_BY_KIND["optional-dependency-missing"],
            pluginId: plugin.id,
            relatedPluginId: dep.id,
            requiredRange: dep.versionRange,
            message:
              `"${plugin.id}" optionally depends on "${dep.id}" ` +
              `(${dep.versionRange}), which is not installed`,
          });
        } else {
          issues.push({
            kind: "broken-dependency",
            severity: SEVERITY_BY_KIND["broken-dependency"],
            pluginId: plugin.id,
            relatedPluginId: dep.id,
            requiredRange: dep.versionRange,
            message:
              `"${plugin.id}" requires "${dep.id}" ` +
              `(${dep.versionRange}), which is not installed`,
          });
        }
        continue;
      }
      const satisfied = isVersionSatisfied(target.version, dep.versionRange);
      if (satisfied === true) continue;
      // satisfied === false OR malformed range/version
      const kind = dep.optional
        ? "optional-version-mismatch"
        : "version-mismatch";
      issues.push({
        kind,
        severity: SEVERITY_BY_KIND[kind],
        pluginId: plugin.id,
        relatedPluginId: dep.id,
        requiredRange: dep.versionRange,
        actualVersion: target.version,
        message:
          `"${plugin.id}" requires "${dep.id}" ${dep.versionRange}, ` +
          `but the installed version is ${target.version}`,
      });
    }
  }
}

function isVersionSatisfied(version: string, range: string): boolean {
  try {
    return satisfiesPluginVersionRange(version, range);
  } catch (err) {
    if (
      err instanceof InvalidPluginVersionError ||
      err instanceof InvalidPluginVersionRangeError
    ) {
      // Treat malformed input as "not satisfied" so the editor surfaces
      // it via the version-mismatch path. The schema should catch this
      // before we get here, but defense in depth.
      return false;
    }
    throw err;
  }
}

function appendDroppedDependentIssues(
  issues: PluginRegistryDiffIssue[],
  current: PluginRegistryManifest,
  projected: PluginRegistryManifest,
  diff: PluginRegistryDiff,
  selection: PluginRegistryDiffSelection,
): void {
  // Which `removed` ids are *actually* being applied (selection-aware)?
  const appliedRemovals = new Set<string>();
  for (const removed of diff.removed) {
    if (selection.removed === undefined || selection.removed.has(removed.id)) {
      appliedRemovals.add(removed.id);
    }
  }
  if (appliedRemovals.size === 0) return;

  // Find dependents (in `current`, since they may also be removed)
  // that survive into `projected` and still hard-depend on the
  // removed id.
  const projectedIds = new Set(projected.plugins.map((p) => p.id));
  for (const removedId of appliedRemovals) {
    for (const candidate of current.plugins) {
      if (candidate.id === removedId) continue;
      if (!projectedIds.has(candidate.id)) continue;
      const deps = candidate.dependencies ?? [];
      for (const dep of deps) {
        if (dep.id !== removedId) continue;
        if (dep.optional) continue;
        issues.push({
          kind: "dropped-dependent",
          severity: SEVERITY_BY_KIND["dropped-dependent"],
          pluginId: removedId,
          relatedPluginId: candidate.id,
          message:
            `Removing "${removedId}" will leave "${candidate.id}" ` +
            `with an unresolved required dependency`,
        });
      }
    }
  }
}

/**
 * Run pre-flight validation. The editor calls this after the user
 * adjusts their selection in the confirm dialog and before they
 * click "Apply". The returned report drives row-level warning
 * decorations and the apply-button enablement.
 */
export function validatePluginRegistryDiff(
  current: PluginRegistryManifest,
  next: PluginRegistryManifest,
  diff: PluginRegistryDiff,
  selection: PluginRegistryDiffSelection = {},
): PluginRegistryDiffValidationReport {
  const projected = applyPluginRegistryDiff(current, next, diff, selection);
  const issues: PluginRegistryDiffIssue[] = [];
  appendDroppedDependentIssues(issues, current, projected, diff, selection);
  appendDependencyIssues(issues, projected);

  // Stable ordering: errors first, then warnings; within each by
  // pluginId asc, then relatedPluginId asc.
  issues.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "error" ? -1 : 1;
    }
    const p = a.pluginId.localeCompare(b.pluginId);
    if (p !== 0) return p;
    return a.relatedPluginId.localeCompare(b.relatedPluginId);
  });

  let errorCount = 0;
  let warningCount = 0;
  for (const i of issues) {
    if (i.severity === "error") errorCount += 1;
    else warningCount += 1;
  }
  return {
    issues,
    errorCount,
    warningCount,
    canApply: errorCount === 0,
  };
}
