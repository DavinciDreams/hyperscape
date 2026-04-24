/**
 * Flatten a `PluginRegistryDiff` into a row list the editor's
 * confirm dialog can render directly. Each row carries:
 *   - the bucket kind it came from
 *   - the plugin id (toggle target)
 *   - a human-readable display name (falls back to id)
 *   - a one-line before/after summary string
 *   - a severity tag the dialog uses to color/sort rows
 *
 * Severity rules:
 *   - `breaking` → `versionChanged`, `removed`
 *     (anything that drops a plugin or shifts its surface)
 *   - `safe` → `added`, `metadataChanged`,
 *     `enabledByDefaultChanged`
 *     (purely additive or override-only)
 *
 * Default ordering: breaking first, then safe, then id-asc within
 * each. The dialog can override via its own sort.
 *
 * Pure transform. No I/O, no async. The dialog re-runs this every
 * time the user re-checks a row to recompute the preview.
 */

import type { PluginRegistryManifest } from "@hyperforge/manifest-schema";
import type { PluginRegistryDiff } from "./PluginManifestDiff.js";

export type PluginRegistryDiffRowKind =
  | "added"
  | "removed"
  | "versionChanged"
  | "metadataChanged"
  | "enabledByDefaultChanged";

export type PluginRegistryDiffSeverity = "breaking" | "safe";

export interface PluginRegistryDiffRow {
  readonly kind: PluginRegistryDiffRowKind;
  readonly pluginId: string;
  readonly displayName: string;
  readonly summary: string;
  readonly severity: PluginRegistryDiffSeverity;
}

const SEVERITY_BY_KIND: Readonly<
  Record<PluginRegistryDiffRowKind, PluginRegistryDiffSeverity>
> = {
  added: "safe",
  removed: "breaking",
  versionChanged: "breaking",
  metadataChanged: "safe",
  enabledByDefaultChanged: "safe",
};

const SEVERITY_RANK: Readonly<Record<PluginRegistryDiffSeverity, number>> = {
  breaking: 0,
  safe: 1,
};

function describeOverride(value: boolean | null): string {
  if (value === null) return "no override";
  return value ? "enabled" : "disabled";
}

/**
 * Build the flat row list. `current` provides display names for
 * `removed` rows (where the manifest is no longer in `next`); for
 * every other bucket, the display name is sourced from the carried
 * manifest or pluginId.
 */
export function summarizePluginRegistryDiff(
  current: PluginRegistryManifest,
  next: PluginRegistryManifest,
  diff: PluginRegistryDiff,
): PluginRegistryDiffRow[] {
  const currentNameById = new Map(
    current.plugins.map((p) => [p.id, p.name] as const),
  );
  const nextNameById = new Map(
    next.plugins.map((p) => [p.id, p.name] as const),
  );

  const rows: PluginRegistryDiffRow[] = [];

  for (const manifest of diff.added) {
    rows.push({
      kind: "added",
      pluginId: manifest.id,
      displayName: manifest.name ?? manifest.id,
      summary: `install at v${manifest.version}`,
      severity: SEVERITY_BY_KIND.added,
    });
  }

  for (const manifest of diff.removed) {
    rows.push({
      kind: "removed",
      pluginId: manifest.id,
      displayName: manifest.name ?? manifest.id,
      summary: `uninstall (was v${manifest.version})`,
      severity: SEVERITY_BY_KIND.removed,
    });
  }

  for (const change of diff.versionChanged) {
    rows.push({
      kind: "versionChanged",
      pluginId: change.pluginId,
      displayName:
        nextNameById.get(change.pluginId) ??
        currentNameById.get(change.pluginId) ??
        change.pluginId,
      summary: `v${change.previousVersion} → v${change.nextVersion}`,
      severity: SEVERITY_BY_KIND.versionChanged,
    });
  }

  for (const change of diff.metadataChanged) {
    rows.push({
      kind: "metadataChanged",
      pluginId: change.pluginId,
      displayName:
        nextNameById.get(change.pluginId) ??
        currentNameById.get(change.pluginId) ??
        change.pluginId,
      summary: `metadata drift: ${change.changedFields.join(", ")}`,
      severity: SEVERITY_BY_KIND.metadataChanged,
    });
  }

  for (const change of diff.enabledByDefaultChanged) {
    rows.push({
      kind: "enabledByDefaultChanged",
      pluginId: change.pluginId,
      displayName:
        nextNameById.get(change.pluginId) ??
        currentNameById.get(change.pluginId) ??
        change.pluginId,
      summary: `override: ${describeOverride(change.previous)} → ${describeOverride(change.next)}`,
      severity: SEVERITY_BY_KIND.enabledByDefaultChanged,
    });
  }

  rows.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    return a.pluginId.localeCompare(b.pluginId);
  });

  return rows;
}

/**
 * Group counts the dialog can show in its header
 * ("3 breaking · 4 safe · 7 total").
 */
export interface PluginRegistryDiffCounts {
  readonly total: number;
  readonly breaking: number;
  readonly safe: number;
  readonly byKind: Readonly<Record<PluginRegistryDiffRowKind, number>>;
}

export function countPluginRegistryDiffRows(
  rows: readonly PluginRegistryDiffRow[],
): PluginRegistryDiffCounts {
  const byKind: Record<PluginRegistryDiffRowKind, number> = {
    added: 0,
    removed: 0,
    versionChanged: 0,
    metadataChanged: 0,
    enabledByDefaultChanged: 0,
  };
  let breaking = 0;
  let safe = 0;
  for (const row of rows) {
    byKind[row.kind] += 1;
    if (row.severity === "breaking") breaking += 1;
    else safe += 1;
  }
  return { total: rows.length, breaking, safe, byKind };
}
