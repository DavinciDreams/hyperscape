/**
 * Static catalog — JSON-serializable catalog records that combine
 * the runtime `WidgetCatalogEntry` with build-time-only data
 * (JSDoc summary, source file path).
 *
 * Phase A1.3 of `PLAN_AI_AUTHORING_FOUNDATIONS.md`.
 *
 * Why a separate type: the runtime `WidgetCatalogEntry` is what
 * an in-process consumer (the live editor preview, an Eliza
 * action) sees. The static catalog adds two fields that only
 * make sense at build time:
 *
 *   - `jsdocSummary` — first paragraph of the source file's
 *     leading JSDoc block. Pulled from the file system; not
 *     reachable at runtime.
 *   - `sourcePath` — repo-relative path to the widget's source
 *     file. Useful for AI agents that want to navigate to the
 *     file as a follow-up after discovering the widget.
 *
 * The static artifact lives on disk as `dist/catalog.json` and is
 * consumed by external tools (CLI, MCP server, AI agents) that
 * don't want to boot the framework just to query the catalog.
 */

import type { Widget } from "@hyperforge/ui-framework";

import { extractJsdocSummary } from "./extractJsdocSummary";
import { toCatalogEntry } from "./service";
import type { WidgetCatalogEntry } from "./types";

/**
 * Static catalog entry. Extends `WidgetCatalogEntry` with two
 * build-time fields. JSON-serializable.
 */
export interface StaticCatalogEntry extends WidgetCatalogEntry {
  /** First-paragraph summary from the source file's leading JSDoc. */
  readonly jsdocSummary: string;
  /**
   * Repo-relative path to the widget source file (forward slashes).
   * Empty when the build couldn't determine the path.
   */
  readonly sourcePath: string;
}

/**
 * The shape of `dist/catalog.json`. A single document so external
 * tools can `fetch` / `import` it without enumerating files.
 */
export interface StaticCatalogDocument {
  /** Format version. Bumps on breaking shape changes. */
  readonly version: 1;
  /** ISO-8601 build timestamp. */
  readonly builtAt: string;
  /** Stable list ordered by widget id (alphabetical). */
  readonly widgets: ReadonlyArray<StaticCatalogEntry>;
  /**
   * Aggregate stats — same shape as `WidgetCatalogService.getStats()`.
   * Duplicated here so external tools don't have to recompute.
   */
  readonly stats: {
    readonly total: number;
    readonly byCategory: Readonly<Record<string, number>>;
  };
}

/**
 * Build a single static entry from a widget + companion source.
 * Pure: no filesystem I/O, no network. The caller is responsible
 * for reading the source file and supplying the path.
 *
 * Exported so callers (the build script, tests) can compose entries
 * without the catalog package owning the fs walk.
 */
export function buildStaticEntry(input: {
  readonly widget: Widget<Record<string, unknown>>;
  readonly source: string;
  readonly sourcePath: string;
}): StaticCatalogEntry {
  const base = toCatalogEntry(input.widget);
  return {
    ...base,
    jsdocSummary: extractJsdocSummary(input.source),
    sourcePath: input.sourcePath,
  };
}

/**
 * Compose a `StaticCatalogDocument` from a set of entries. Sorts
 * by widget id alphabetically for stable diffs across builds and
 * computes the stats block.
 */
export function buildStaticCatalogDocument(
  entries: ReadonlyArray<StaticCatalogEntry>,
  options: { readonly now?: () => Date } = {},
): StaticCatalogDocument {
  const now = options.now ?? (() => new Date());
  const sorted = [...entries].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const byCategoryMutable: Record<string, number> = {};
  for (const e of sorted) {
    byCategoryMutable[e.category] = (byCategoryMutable[e.category] ?? 0) + 1;
  }
  return {
    version: 1,
    builtAt: now().toISOString(),
    widgets: sorted,
    stats: {
      total: sorted.length,
      byCategory: byCategoryMutable,
    },
  };
}
