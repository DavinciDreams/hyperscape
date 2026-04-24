/**
 * Diagnostic formatters — pure functions that turn a
 * {@link SessionSnapshot} into human-readable messages with
 * consistent wording + fix hints.
 *
 * Why a dedicated module instead of duplicating strings in every UI:
 * Plugin Browser tooltips, dev-console logs, `hyperforge-plugin lint`
 * output, and test assertions all want the SAME phrasing for "missing
 * dependency X", "cycle with Y and Z", etc. Keeping the wording in
 * one place means a help-text tweak lands everywhere at once.
 *
 * Pure — no I/O, no mutation, no dep outside `snapshot.ts` types.
 */

import type {
  SerializedUnresolvableReason,
  SessionSnapshot,
  SnapshotFailedPackage,
  SnapshotUnresolvablePlugin,
} from "./snapshot.js";

/**
 * Aggregate diagnostic payload: separate arrays for the two failure
 * categories so consumers can render each bucket differently (e.g.
 * Plugin Browser shows "failed" under a red banner and "unresolvable"
 * under a yellow one).
 */
export interface SnapshotDiagnostics {
  readonly failedMessages: ReadonlyArray<string>;
  readonly unresolvableMessages: ReadonlyArray<string>;
  readonly hasErrors: boolean;
}

/**
 * Format a single unresolvable reason into a short, user-facing
 * sentence. Exported for consumers that already have a reason in hand
 * (e.g. inside a session observer callback) and don't want to wrap it
 * in the full snapshot.
 *
 * Wording is declarative, not imperative — callers prepend context
 * like "Plugin X: " themselves.
 */
export function formatUnresolvableReason(
  reason: SerializedUnresolvableReason,
): string {
  switch (reason.kind) {
    case "missing-dependency":
      return `missing dependency: ${reason.dependencyId}`;
    case "dependency-version-mismatch":
      return `dependency version mismatch: ${reason.dependencyId} (requires ${reason.required}, found ${reason.available})`;
    case "cycle":
      return `cycle member: ${reason.cycleMemberIds.join(" → ")}`;
  }
}

/**
 * Per-reason fix hint. Short, actionable — one sentence, no trailing
 * period so callers can compose them into their own sentences. These
 * are hints, not guarantees; a host might legitimately ship with a
 * cycle it knows is safe.
 */
export function fixHintForReason(reason: SerializedUnresolvableReason): string {
  switch (reason.kind) {
    case "missing-dependency":
      return `Install ${reason.dependencyId} or mark the dependency as optional`;
    case "dependency-version-mismatch":
      return `Upgrade ${reason.dependencyId} to a version matching ${reason.required}`;
    case "cycle":
      return `Break the cycle by removing one dependency edge among: ${reason.cycleMemberIds.join(", ")}`;
  }
}

/**
 * Format a single unresolvable entry into `"plugin.id: <reason>. Fix: <hint>"`.
 */
export function formatUnresolvable(entry: SnapshotUnresolvablePlugin): string {
  return `${entry.manifest.id}: ${formatUnresolvableReason(entry.reason)}. Fix: ${fixHintForReason(entry.reason)}`;
}

/**
 * Format a single failed package into `"<baseDir>: <ErrorName>: <message>"`.
 * Keeps the Error distinction visible so a TypeError is obviously
 * different from a PluginManifestValidationError.
 */
export function formatFailedPackage(failure: SnapshotFailedPackage): string {
  return `${failure.baseDir}: ${failure.errorName}: ${failure.errorMessage}`;
}

/**
 * Bundle every diagnostic message a snapshot carries. Safe to call on
 * a clean snapshot — returns empty arrays + `hasErrors: false`.
 */
export function formatSnapshotErrors(
  snapshot: SessionSnapshot,
): SnapshotDiagnostics {
  const failedMessages = snapshot.failedPackages.map(formatFailedPackage);
  const unresolvableMessages = snapshot.unresolvable.map(formatUnresolvable);
  return {
    failedMessages,
    unresolvableMessages,
    hasErrors: failedMessages.length > 0 || unresolvableMessages.length > 0,
  };
}

/**
 * Render a complete human-facing report of the snapshot — multiline
 * text with a header per bucket. Intended for CLI `--human` output,
 * Plugin Browser error panels, and bug-report attachments.
 *
 * Output shape (example, three buckets all populated):
 *
 *     Plugin session:
 *       Running (2):
 *         • com.hyperforge.combat (1.2.3)
 *         • com.hyperforge.foo (0.1.0)
 *       Failed packages (1):
 *         • /path/to/broken: TypeError: plugin.json missing
 *       Unresolvable (1):
 *         • com.hyperforge.bar: missing dependency: com.hyperforge.missing. Fix: Install com.hyperforge.missing or mark the dependency as optional
 *
 * A clean session produces just the "Running" block. An entirely
 * empty snapshot produces a single-line "Plugin session: no plugins."
 */
export function formatSnapshotHuman(snapshot: SessionSnapshot): string {
  const { running, failedPackages, unresolvable } = snapshot;
  if (
    running.length === 0 &&
    failedPackages.length === 0 &&
    unresolvable.length === 0
  ) {
    return "Plugin session: no plugins.";
  }

  const lines: string[] = ["Plugin session:"];
  if (running.length > 0) {
    lines.push(`  Running (${running.length}):`);
    for (const row of running) {
      lines.push(`    • ${row.manifest.id} (${row.manifest.version})`);
    }
  }
  if (failedPackages.length > 0) {
    lines.push(`  Failed packages (${failedPackages.length}):`);
    for (const failure of failedPackages) {
      lines.push(`    • ${formatFailedPackage(failure)}`);
    }
  }
  if (unresolvable.length > 0) {
    lines.push(`  Unresolvable (${unresolvable.length}):`);
    for (const entry of unresolvable) {
      lines.push(`    • ${formatUnresolvable(entry)}`);
    }
  }
  return lines.join("\n");
}
