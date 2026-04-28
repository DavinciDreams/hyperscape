/**
 * `WidgetCatalogService` — typed query surface over a
 * `WidgetRegistry`.
 *
 * Foundations slice A1 of `PLAN_AI_AUTHORING_FOUNDATIONS.md`.
 *
 * The service walks a registry once at construction and again on
 * `refresh()` to produce a list of `WidgetCatalogEntry` records.
 * Consumers query through:
 *   - `listWidgets(filter?)` — every registered widget, optionally
 *     filtered by category or substring search.
 *   - `getWidget(id)` — one widget by manifest id, or `null`.
 *   - `searchWidgets(query)` — convenience for `listWidgets({ search })`.
 *   - `listCategories()` — distinct categories that have ≥ 1 widget.
 *   - `getCategory(category)` — every widget in a category.
 *   - `getStats()` — summary counts.
 *
 * The service is **stateless** with respect to the registry — it
 * doesn't subscribe to mutations, so consumers that register more
 * widgets after construction need to call `refresh()`. That's
 * intentional; reactive watching adds complexity that the AI use
 * case doesn't need (agents typically query → reason → act, not
 * "subscribe to live updates").
 */

import type {
  Widget,
  WidgetCategory,
  WidgetRegistry,
} from "@hyperforge/ui-framework";

import { extractPropSummary } from "./extractPropSummary.js";
import type {
  CatalogFilter,
  CatalogStats,
  WidgetCatalogEntry,
} from "./types.js";

/**
 * Minimal interface the catalog needs from the registry. Decouples
 * the service from `WidgetRegistry`'s component-slot generic so the
 * catalog package doesn't have to pick a render target.
 */
export interface CatalogRegistrySource {
  /**
   * Yield every registered Widget schema. Implementations should
   * iterate in registration order (the catalog preserves it).
   */
  listWidgets(): IterableIterator<Widget<Record<string, unknown>>>;
}

/**
 * Adapter that exposes a `WidgetRegistry` (the actual contract used
 * by the live client) as a `CatalogRegistrySource`. Saves callers
 * from writing the wrapper.
 */
export function fromRegistry<C>(
  registry: WidgetRegistry<C>,
): CatalogRegistrySource {
  return {
    *listWidgets() {
      for (const widget of registry.listWidgets()) {
        yield widget;
      }
    },
  };
}

/**
 * Construction options. `now` is injected for deterministic tests
 * around `lastRefreshed`.
 */
export interface WidgetCatalogServiceOptions {
  readonly now?: () => number;
}

export class WidgetCatalogService {
  private entries: ReadonlyArray<WidgetCatalogEntry>;
  private byId: ReadonlyMap<string, WidgetCatalogEntry>;
  private byCategory: ReadonlyMap<
    WidgetCategory,
    ReadonlyArray<WidgetCatalogEntry>
  >;
  private lastRefreshedAt: number;
  private readonly now: () => number;

  constructor(
    private readonly source: CatalogRegistrySource,
    options: WidgetCatalogServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    const built = this.build();
    this.entries = built.entries;
    this.byId = built.byId;
    this.byCategory = built.byCategory;
    this.lastRefreshedAt = built.refreshedAt;
  }

  /**
   * Re-walk the registry. Call after registering new widgets.
   * Returns the new entry count for convenience.
   */
  refresh(): number {
    const built = this.build();
    this.entries = built.entries;
    this.byId = built.byId;
    this.byCategory = built.byCategory;
    this.lastRefreshedAt = built.refreshedAt;
    return this.entries.length;
  }

  /**
   * Timestamp of the most recent refresh (or construction). Useful
   * for cache headers in CLI / MCP wrappers.
   */
  getLastRefreshedAt(): number {
    return this.lastRefreshedAt;
  }

  /**
   * Every widget in the catalog, optionally filtered. The returned
   * array is a fresh slice; mutations don't affect the catalog.
   */
  listWidgets(filter: CatalogFilter = {}): ReadonlyArray<WidgetCatalogEntry> {
    let out: ReadonlyArray<WidgetCatalogEntry> =
      filter.category === undefined
        ? this.entries
        : (this.byCategory.get(filter.category) ?? []);
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      out = out.filter((e) => entryMatchesQuery(e, needle));
    }
    // Always return a fresh array so callers can sort/dedupe without
    // mutating the catalog's internal state.
    return [...out];
  }

  /**
   * Look up by manifest id. Returns `null` for unknown ids.
   */
  getWidget(id: string): WidgetCatalogEntry | null {
    return this.byId.get(id) ?? null;
  }

  /**
   * Convenience wrapper for `listWidgets({ search })`.
   */
  searchWidgets(query: string): ReadonlyArray<WidgetCatalogEntry> {
    return this.listWidgets({ search: query });
  }

  /**
   * Categories that have at least one widget, in registration
   * order of the first widget per category.
   */
  listCategories(): ReadonlyArray<WidgetCategory> {
    return [...this.byCategory.keys()];
  }

  /**
   * Every widget in a category. Empty array for unknown / empty
   * categories.
   */
  getCategory(category: WidgetCategory): ReadonlyArray<WidgetCatalogEntry> {
    const list = this.byCategory.get(category);
    return list ? [...list] : [];
  }

  /**
   * Aggregate counts. Useful for prompt-context summaries and
   * bootstrap diagnostics.
   */
  getStats(): CatalogStats {
    const byCategory: Partial<Record<WidgetCategory, number>> = {};
    for (const [cat, list] of this.byCategory) {
      byCategory[cat] = list.length;
    }
    return { total: this.entries.length, byCategory };
  }

  // ----------------------------------------------------------------
  // Internal — build the indexes from the registry source.
  // ----------------------------------------------------------------
  private build(): {
    entries: ReadonlyArray<WidgetCatalogEntry>;
    byId: ReadonlyMap<string, WidgetCatalogEntry>;
    byCategory: ReadonlyMap<WidgetCategory, ReadonlyArray<WidgetCatalogEntry>>;
    refreshedAt: number;
  } {
    const entries: WidgetCatalogEntry[] = [];
    const byId = new Map<string, WidgetCatalogEntry>();
    const byCategoryMutable = new Map<WidgetCategory, WidgetCatalogEntry[]>();
    for (const widget of this.source.listWidgets()) {
      const entry = toCatalogEntry(widget);
      entries.push(entry);
      byId.set(entry.id, entry);
      const list = byCategoryMutable.get(entry.category);
      if (list) {
        list.push(entry);
      } else {
        byCategoryMutable.set(entry.category, [entry]);
      }
    }
    const byCategory = new Map<
      WidgetCategory,
      ReadonlyArray<WidgetCatalogEntry>
    >();
    for (const [cat, list] of byCategoryMutable) {
      byCategory.set(cat, list);
    }
    return {
      entries,
      byId,
      byCategory,
      refreshedAt: this.now(),
    };
  }
}

/**
 * Adapt a single widget into a catalog entry. Exported so callers
 * that only have one widget (e.g. unit tests) don't need to spin up
 * a full registry.
 */
export function toCatalogEntry(
  widget: Widget<Record<string, unknown>>,
): WidgetCatalogEntry {
  const m = widget.manifest;
  // Widget defaultProps stays a Record; freeze a shallow copy to
  // surface mutation attempts in dev.
  const defaultProps = Object.freeze({
    ...(widget.defaultProps as Record<string, unknown>),
  });
  return {
    id: m.id,
    name: m.name,
    description: m.description ?? "",
    category: m.category,
    defaultSize: m.defaultSize,
    icon: m.icon ?? "",
    props: extractPropSummary(widget.propsSchema),
    defaultProps,
  };
}

function entryMatchesQuery(entry: WidgetCatalogEntry, needle: string): boolean {
  return (
    entry.id.toLowerCase().includes(needle) ||
    entry.name.toLowerCase().includes(needle) ||
    entry.description.toLowerCase().includes(needle)
  );
}
