/**
 * Serialize {@link PluginBrowserChangelogState} into human-readable
 * text formats for the "Export changes…" menu in the Plugin Browser
 * and for bug-report attachments.
 *
 * Two formats:
 *  - **NDJSON** (`application/x-ndjson`) — one JSON object per line;
 *    lossless round-trip; easy to pipe into `jq`.
 *  - **CSV** (`text/csv`) — flattened for spreadsheets; lossy on
 *    `previous`/`current` row summaries (stringified to label only).
 *
 * Pure transform. Never throws. Never performs I/O — callers write
 * the returned strings to disk or clipboard themselves.
 */

import type {
  PluginBrowserChangelogEntry,
  PluginBrowserChangelogFilter,
  PluginBrowserChangelogState,
} from "./PluginBrowserChangelog.js";
import { filterPluginBrowserChangelog } from "./PluginBrowserChangelog.js";
import type { PluginBrowserRowSummary } from "./PluginBrowserRowSummary.js";

export interface ExportPluginBrowserChangelogOptions {
  readonly filter?: PluginBrowserChangelogFilter;
}

// ---------- NDJSON ----------

export function exportPluginBrowserChangelogAsNdjson(
  state: PluginBrowserChangelogState,
  options: ExportPluginBrowserChangelogOptions = {},
): string {
  const entries: readonly PluginBrowserChangelogEntry[] = options.filter
    ? filterPluginBrowserChangelog(state, options.filter)
    : state.entries;
  if (entries.length === 0) return "";
  // Trailing newline so appending is cheap and POSIX-clean.
  return entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

// ---------- CSV ----------

const CSV_COLUMNS = [
  "id",
  "timestamp",
  "isoTimestamp",
  "pluginId",
  "kind",
  "severity",
  "previousLabel",
  "currentLabel",
] as const;

function rowSummaryLabel(summary: PluginBrowserRowSummary | null): string {
  return summary ? summary.label : "";
}

function escapeCsvField(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function entryToCsvRow(e: PluginBrowserChangelogEntry): string {
  const iso = new Date(e.timestamp).toISOString();
  return [
    e.id,
    e.timestamp,
    iso,
    e.intent.pluginId,
    e.intent.kind,
    e.intent.severity,
    rowSummaryLabel(e.intent.previous),
    rowSummaryLabel(e.intent.current),
  ]
    .map(escapeCsvField)
    .join(",");
}

export function exportPluginBrowserChangelogAsCsv(
  state: PluginBrowserChangelogState,
  options: ExportPluginBrowserChangelogOptions = {},
): string {
  const entries: readonly PluginBrowserChangelogEntry[] = options.filter
    ? filterPluginBrowserChangelog(state, options.filter)
    : state.entries;
  const header = CSV_COLUMNS.join(",");
  if (entries.length === 0) return header + "\n";
  const rows = entries.map(entryToCsvRow);
  return [header, ...rows].join("\n") + "\n";
}

// ---------- Helpers ----------

export interface PluginBrowserChangelogExportMetadata {
  /** MIME type suited for clipboard / download dispatch. */
  readonly contentType: string;
  /** Filename stem (no extension) suitable for `download` attribute. */
  readonly filenameStem: string;
  /** File extension including leading dot. */
  readonly extension: string;
}

export const NDJSON_EXPORT_METADATA: PluginBrowserChangelogExportMetadata = {
  contentType: "application/x-ndjson",
  filenameStem: "plugin-browser-changelog",
  extension: ".ndjson",
};

export const CSV_EXPORT_METADATA: PluginBrowserChangelogExportMetadata = {
  contentType: "text/csv",
  filenameStem: "plugin-browser-changelog",
  extension: ".csv",
};
