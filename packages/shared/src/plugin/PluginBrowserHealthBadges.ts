/**
 * Per-plugin row badges derived from a {@link PluginRegistryHealthDigest}.
 *
 * The digest itself answers "what is the global health of the
 * registry?" — this projection answers "what badge should I render
 * on each plugin row in the Plugin Browser?". Rows whose plugin has
 * no health signal at all map to `severity: "ok"` with an empty
 * `reasons` list; callers can choose to suppress the badge in that
 * case.
 *
 * Severity per plugin:
 *   - `error`   if the plugin has any host issue OR any recent failure
 *   - `warning` if the plugin has any divergent contribution (and no
 *               errors)
 *   - `ok`      otherwise
 *
 * Pure transform. Never throws.
 */

import type { PluginRegistryHealthDigest } from "./PluginRegistryHealthDigest.js";

export type PluginRowHealthSeverity = "ok" | "warning" | "error";

export interface PluginRowHealthBadge {
  readonly pluginId: string;
  readonly severity: PluginRowHealthSeverity;
  /**
   * Short human-readable reason fragments, in display order. Empty
   * when `severity === "ok"`. Example contents:
   *   - `"missing factory"`
   *   - `"widgets: -1"`
   *   - `"recent failure"`
   */
  readonly reasons: readonly string[];
  readonly counts: {
    readonly hostIssueCount: number;
    readonly divergentContributionCount: number;
    readonly recentFailureCount: number;
  };
}

/**
 * Build per-plugin row badges from a digest plus the full plugin id
 * list to render. Plugins not present in the digest receive an `ok`
 * badge with empty reasons.
 */
export function buildPluginBrowserHealthBadges(
  digest: PluginRegistryHealthDigest,
  pluginIds: readonly string[],
): ReadonlyMap<string, PluginRowHealthBadge> {
  const hostIssuesByPlugin = indexHostIssues(digest);
  const recentFailuresByPlugin = indexRecentFailures(digest);

  const out = new Map<string, PluginRowHealthBadge>();
  for (const pluginId of pluginIds) {
    const hostIssues = hostIssuesByPlugin.get(pluginId) ?? [];
    const divergences = digest.divergences.get(pluginId) ?? [];
    const recentFailures = recentFailuresByPlugin.get(pluginId) ?? [];

    const counts = {
      hostIssueCount: hostIssues.length,
      divergentContributionCount: divergences.length,
      recentFailureCount: recentFailures.length,
    } as const;

    const severity = classifyRowSeverity(counts);
    const reasons = buildReasonStrings(hostIssues, divergences, recentFailures);

    out.set(pluginId, { pluginId, severity, reasons, counts });
  }
  return out;
}

function classifyRowSeverity(counts: {
  readonly hostIssueCount: number;
  readonly divergentContributionCount: number;
  readonly recentFailureCount: number;
}): PluginRowHealthSeverity {
  if (counts.hostIssueCount > 0 || counts.recentFailureCount > 0)
    return "error";
  if (counts.divergentContributionCount > 0) return "warning";
  return "ok";
}

function indexHostIssues(
  digest: PluginRegistryHealthDigest,
): Map<string, readonly { kind: string; message: string }[]> {
  const out = new Map<string, { kind: string; message: string }[]>();
  for (const issue of digest.hostIssues) {
    if (!issue.pluginId) continue;
    let bucket = out.get(issue.pluginId);
    if (!bucket) {
      bucket = [];
      out.set(issue.pluginId, bucket);
    }
    bucket.push({ kind: issue.kind, message: issue.message });
  }
  return out;
}

function indexRecentFailures(
  digest: PluginRegistryHealthDigest,
): Map<string, readonly { phase: string; errorMessage?: string }[]> {
  const out = new Map<string, { phase: string; errorMessage?: string }[]>();
  for (const event of digest.recentFailures) {
    let bucket = out.get(event.pluginId);
    if (!bucket) {
      bucket = [];
      out.set(event.pluginId, bucket);
    }
    bucket.push({ phase: event.phase, errorMessage: event.errorMessage });
  }
  return out;
}

function buildReasonStrings(
  hostIssues: readonly { kind: string; message: string }[],
  divergences: readonly { kind: string; delta: number }[],
  recentFailures: readonly { phase: string }[],
): readonly string[] {
  const reasons: string[] = [];
  for (const issue of hostIssues) {
    reasons.push(formatHostIssueKind(issue.kind));
  }
  for (const d of divergences) {
    reasons.push(`${d.kind}: ${d.delta > 0 ? "+" : ""}${d.delta}`);
  }
  if (recentFailures.length === 1) {
    reasons.push(`recent failure (${recentFailures[0].phase})`);
  } else if (recentFailures.length > 1) {
    reasons.push(`${recentFailures.length} recent failures`);
  }
  return reasons;
}

function formatHostIssueKind(kind: string): string {
  // Map machine kind tokens to short row labels. Unknown kinds fall
  // through unchanged so new kinds remain visible without code edits.
  switch (kind) {
    case "missing-factory":
      return "missing factory";
    case "orphan-factory":
      return "orphan factory";
    case "dependency-cycle":
      return "dependency cycle";
    case "missing-hard-dependency":
      return "missing dependency";
    case "version-mismatch":
      return "version mismatch";
    case "invalid-version-range":
      return "invalid version range";
    default:
      return kind;
  }
}
