/**
 * Editor-facing projection of `TransitionExecutionReport` into a
 * table row model. The executor produces structured `TransitionStepResult[]`;
 * this module shapes them into rows the editor can render directly,
 * with display name resolution (manifest `name` if available, else
 * pluginId), human-readable duration string, status badge, and an
 * error-tooltip body for failed rows.
 *
 * Pure transform. No I/O, no allocation beyond the output rows.
 */

import type { PluginRegistryManifest } from "@hyperforge/manifest-schema";
import type {
  TransitionExecutionReport,
  TransitionStepResult,
  TransitionStepStatus,
} from "./PluginRegistryTransitionExecutor.js";

export type TransitionReportRowBadge = "ok" | "failed" | "skipped";

export interface TransitionReportRow {
  readonly pluginId: string;
  readonly displayName: string;
  readonly stepKind: "stop" | "restart" | "start";
  readonly badge: TransitionReportRowBadge;
  /** Pre-formatted duration string, e.g. `"17ms"` or `"1.2s"`. */
  readonly durationText: string;
  /** Body for hover tooltip on failed rows; empty string otherwise. */
  readonly tooltip: string;
}

export interface TransitionReportViewSummary {
  readonly total: number;
  readonly okCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  /** "5 ok, 1 failed" — concise badge for the panel header. */
  readonly headline: string;
}

export interface TransitionReportView {
  readonly rows: readonly TransitionReportRow[];
  readonly summary: TransitionReportViewSummary;
}

/**
 * Build the row + summary view. `registryForNames` is consulted
 * to resolve `manifest.name` for `start`/`restart` rows;
 * `stop` rows use the OLD registry (caller's choice — pass the
 * old registry if you want stop rows to show the dropped name,
 * or the new registry if you only care about post-state). When
 * the registry doesn't contain a plugin, `displayName` falls
 * back to `pluginId`.
 *
 * Pure transform. Never throws.
 */
export function buildTransitionReportView(
  report: TransitionExecutionReport,
  registryForNames?: PluginRegistryManifest,
): TransitionReportView {
  const nameById = new Map<string, string>();
  if (registryForNames) {
    for (const m of registryForNames.plugins) {
      nameById.set(m.id, m.name);
    }
  }

  const rows: TransitionReportRow[] = report.results.map((r) =>
    buildRow(r, nameById),
  );

  const headlineParts: string[] = [];
  if (report.okCount > 0) headlineParts.push(`${report.okCount} ok`);
  if (report.failedCount > 0) {
    headlineParts.push(`${report.failedCount} failed`);
  }
  if (report.skippedCount > 0) {
    headlineParts.push(`${report.skippedCount} skipped`);
  }
  const headline =
    headlineParts.length === 0 ? "no transitions" : headlineParts.join(", ");

  return {
    rows,
    summary: {
      total: report.results.length,
      okCount: report.okCount,
      failedCount: report.failedCount,
      skippedCount: report.skippedCount,
      headline,
    },
  };
}

function buildRow(
  result: TransitionStepResult,
  nameById: ReadonlyMap<string, string>,
): TransitionReportRow {
  const step = result.step;
  // Prefer manifest.name from the relevant step manifest (start
  // carries the new manifest; restart carries nextManifest), else
  // fall back to the registry-name lookup, else pluginId.
  const stepLevelName =
    step.kind === "start"
      ? step.manifest.name
      : step.kind === "restart"
        ? step.nextManifest.name
        : undefined;
  const displayName =
    stepLevelName ?? nameById.get(step.pluginId) ?? step.pluginId;

  return {
    pluginId: step.pluginId,
    displayName,
    stepKind: step.kind,
    badge: badgeForStatus(result.status),
    durationText: formatDuration(result.durationMs),
    tooltip: result.status === "failed" ? (result.error?.message ?? "") : "",
  };
}

function badgeForStatus(
  status: TransitionStepStatus,
): TransitionReportRowBadge {
  if (status === "ok") return "ok";
  if (status === "failed") return "failed";
  return "skipped";
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  // 1.0s, 1.2s, ..., 9.9s, 10s+
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}
