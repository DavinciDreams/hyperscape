/**
 * Server-browser registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `server-browser.ts`. Pure logic: filter facet resolution, column
 * ordering, sort defaults, ping-bucket classification, favorite +
 * history cap checks, refresh cadence. Runtime `ServerBrowserSystem`
 * owns actual list fetching + UI rendering.
 */

import {
  type ColumnDefinition,
  type FilterFacet,
  type ListRules,
  type ServerBrowserManifest,
  type SortColumn,
  type SortDirection,
  ServerBrowserManifestSchema,
} from "@hyperforge/manifest-schema";

export class ServerBrowserNotLoadedError extends Error {
  constructor() {
    super("ServerBrowserRegistry used before load()");
    this.name = "ServerBrowserNotLoadedError";
  }
}

export class UnknownFilterFacetError extends Error {
  readonly facetId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `filter facet "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownFilterFacetError";
    this.facetId = id;
    this.availableIds = availableIds;
  }
}

/** Ping quality bucket. */
export type PingBucket = "good" | "ok" | "poor";

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type ServerBrowserReloadListener = () => void;

export class ServerBrowserRegistry {
  private _manifest: ServerBrowserManifest | null = null;
  private _filtersById = new Map<string, FilterFacet>();
  private _columnsByKind = new Map<SortColumn, ColumnDefinition>();
  private _reloadListeners = new Set<ServerBrowserReloadListener>();

  constructor(manifest?: ServerBrowserManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ServerBrowserManifest): void {
    this._manifest = manifest;
    this._filtersById.clear();
    this._columnsByKind.clear();
    for (const f of manifest.filters) this._filtersById.set(f.id, f);
    for (const c of manifest.columns) this._columnsByKind.set(c.column, c);
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: ServerBrowserReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[serverBrowserRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(ServerBrowserManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): ServerBrowserManifest {
    if (!this._manifest) throw new ServerBrowserNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  get list(): ListRules {
    return this.manifest.list;
  }

  get defaultSort(): { column: SortColumn; direction: SortDirection } {
    return {
      column: this.manifest.defaultSortColumn,
      direction: this.manifest.defaultSortDirection,
    };
  }

  /* --- filters --- */

  hasFilter(id: string): boolean {
    return this._filtersById.has(id);
  }

  filter(id: string): FilterFacet {
    const f = this._filtersById.get(id);
    if (!f) {
      throw new UnknownFilterFacetError(
        id,
        Array.from(this._filtersById.keys()),
      );
    }
    return f;
  }

  filterIds(): string[] {
    return Array.from(this._filtersById.keys());
  }

  /** Filters sorted by displayOrder ascending. */
  filtersByDisplayOrder(): FilterFacet[] {
    return Array.from(this._filtersById.values()).sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );
  }

  /** Filters enabled by default. */
  defaultOnFilters(): FilterFacet[] {
    return this.filtersByDisplayOrder().filter((f) => f.enabledByDefault);
  }

  /* --- columns --- */

  hasColumn(kind: SortColumn): boolean {
    return this._columnsByKind.has(kind);
  }

  column(kind: SortColumn): ColumnDefinition | null {
    return this._columnsByKind.get(kind) ?? null;
  }

  /** Columns in display order. */
  columnsByDisplayOrder(): ColumnDefinition[] {
    return Array.from(this._columnsByKind.values()).sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );
  }

  visibleColumns(): ColumnDefinition[] {
    return this.columnsByDisplayOrder().filter((c) => c.visibleByDefault);
  }

  /* --- list / rules --- */

  /**
   * Classify a ping value into a bucket using the configured thresholds.
   * good: ping <= pingGoodMs
   * ok:   pingGoodMs < ping <= pingOkMs
   * poor: ping > pingOkMs
   */
  classifyPing(pingMs: number): PingBucket {
    const l = this.list;
    if (pingMs <= l.pingGoodMs) return "good";
    if (pingMs <= l.pingOkMs) return "ok";
    return "poor";
  }

  /** Is the player under their favorites cap? */
  canAddFavorite(currentFavoriteCount: number): boolean {
    return currentFavoriteCount < this.list.maxFavorites;
  }

  /** Is the player under their history cap? */
  canAddHistoryEntry(currentHistoryCount: number): boolean {
    return currentHistoryCount < this.list.maxHistoryEntries;
  }

  /** Is auto-refresh enabled? */
  get autoRefreshEnabled(): boolean {
    return this.list.autoRefreshIntervalSec > 0;
  }

  /**
   * Should the browser fetch again given `secondsSinceLastRefresh`?
   * Returns false when auto-refresh is disabled.
   */
  shouldAutoRefresh(secondsSinceLastRefresh: number): boolean {
    if (!this.autoRefreshEnabled) return false;
    return secondsSinceLastRefresh >= this.list.autoRefreshIntervalSec;
  }

  /* --- policy --- */

  get allowsPasswordProtected(): boolean {
    return this.manifest.allowPasswordProtected;
  }

  get allowsDirectConnect(): boolean {
    return this.manifest.allowDirectConnect;
  }
}
