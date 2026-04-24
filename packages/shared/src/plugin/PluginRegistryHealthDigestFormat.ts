/**
 * Text formatter for {@link PluginRegistryHealthDigest}. Mirrors
 * `formatTransitionExecutionReport` — produces a fixed-width line-
 * oriented report suitable for CLI output (e.g. a `plugin health`
 * subcommand) or copy/paste into bug reports.
 *
 * Pure transform. Never throws.
 */

import type { PluginRegistryHealthDigest } from "./PluginRegistryHealthDigest.js";

export interface FormatPluginRegistryHealthDigestOptions {
  /**
   * Optional pre-computed display name resolver, e.g. closed over
   * the registry. When unset, only the pluginId is shown.
   */
  readonly resolveDisplayName?: (pluginId: string) => string | undefined;
}

/**
 * Produce a multi-line text report.
 *
 * Layout:
 *   ```
 *   plugin health: <severity> — <headline>
 *
 *   host issues (N):
 *     - <pluginId> (<displayName>): <kind> — <message>
 *
 *   divergent plugins (N):
 *     - <pluginId> (<displayName>):
 *         <kind>: advertised X, live Y (delta ±Z)
 *
 *   recent failures (N):
 *     - <pluginId> (<displayName>) <phase>: <errorMessage>
 *   ```
 *
 * Empty sections are omitted entirely. When everything is clean,
 * the report is a single line: `plugin health: ok — healthy`.
 */
export function formatPluginRegistryHealthDigest(
  digest: PluginRegistryHealthDigest,
  options: FormatPluginRegistryHealthDigestOptions = {},
): string {
  const lines: string[] = [];
  lines.push(`plugin health: ${digest.severity} — ${digest.headline}`);

  if (digest.hostIssues.length > 0) {
    lines.push("");
    lines.push(`host issues (${digest.hostIssues.length}):`);
    for (const issue of digest.hostIssues) {
      const id = issue.pluginId || "<unknown>";
      const name = displayNameSuffix(id, options.resolveDisplayName);
      const tail = issue.message ? ` — ${issue.message}` : "";
      lines.push(`  - ${id}${name}: ${issue.kind}${tail}`);
    }
  }

  const divergentPluginIds = Array.from(digest.divergences.keys());
  if (divergentPluginIds.length > 0) {
    lines.push("");
    lines.push(`divergent plugins (${divergentPluginIds.length}):`);
    for (const pluginId of divergentPluginIds) {
      const name = displayNameSuffix(pluginId, options.resolveDisplayName);
      lines.push(`  - ${pluginId}${name}:`);
      const entries = digest.divergences.get(pluginId) ?? [];
      for (const entry of entries) {
        const sign = entry.delta > 0 ? "+" : "";
        lines.push(
          `      ${entry.kind}: advertised ${entry.advertised}, live ${entry.live} (delta ${sign}${entry.delta})`,
        );
      }
    }
  }

  if (digest.recentFailures.length > 0) {
    lines.push("");
    lines.push(`recent failures (${digest.recentFailures.length}):`);
    for (const event of digest.recentFailures) {
      const name = displayNameSuffix(
        event.pluginId,
        options.resolveDisplayName,
      );
      const tail = event.errorMessage ? `: ${event.errorMessage}` : "";
      lines.push(`  - ${event.pluginId}${name} ${event.phase}${tail}`);
    }
  }

  return lines.join("\n");
}

function displayNameSuffix(
  pluginId: string,
  resolve: ((id: string) => string | undefined) | undefined,
): string {
  if (!resolve) return "";
  const name = resolve(pluginId);
  if (!name || name === pluginId) return "";
  return ` (${name})`;
}
