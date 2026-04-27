/**
 * News-feed registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `news-feed.ts`.
 * Pure logic: entry/category lookup, publish-window gating, targeting
 * predicate evaluation (platform/region/build/level/accountAge/flag),
 * priority-ordered visible-feed resolution, pinned-first sort.
 * Runtime `NewsFeedSystem` owns fetch, caching, read-receipts, UI.
 */

import {
  type FeedRules,
  type NewsCategory,
  type NewsEntry,
  type NewsFeedManifest,
  type NewsPlatform,
  type NewsPriority,
  NewsFeedManifestSchema,
} from "@hyperforge/manifest-schema";

export class NewsFeedNotLoadedError extends Error {
  constructor() {
    super("NewsFeedRegistry used before load()");
    this.name = "NewsFeedNotLoadedError";
  }
}

export class UnknownNewsEntryError extends Error {
  readonly entryId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `news-entry "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownNewsEntryError";
    this.entryId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownNewsCategoryError extends Error {
  readonly categoryId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `news-category "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownNewsCategoryError";
    this.categoryId = id;
    this.availableIds = availableIds;
  }
}

export interface NewsViewerContext {
  platform: NewsPlatform;
  region: string;
  clientBuild: string;
  characterLevel: number;
  accountAgeDays: number;
  /** Set of feature-flag ids currently enabled for this viewer. */
  enabledFlagIds: ReadonlySet<string>;
  /** Entry ids the viewer has dismissed (suppressed locally). */
  dismissedEntryIds?: ReadonlySet<string>;
}

const PRIORITY_ORDER: Record<NewsPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type NewsFeedReloadListener = () => void;

export class NewsFeedRegistry {
  private _manifest: NewsFeedManifest | null = null;
  private _entriesById = new Map<string, NewsEntry>();
  private _categoriesById = new Map<string, NewsCategory>();
  private _reloadListeners = new Set<NewsFeedReloadListener>();

  constructor(manifest?: NewsFeedManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: NewsFeedManifest): void {
    this._manifest = manifest;
    this._entriesById.clear();
    this._categoriesById.clear();
    for (const e of manifest.entries) this._entriesById.set(e.id, e);
    for (const c of manifest.categories) this._categoriesById.set(c.id, c);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(NewsFeedManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: NewsFeedReloadListener): () => void {
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
          "[newsFeedRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): NewsFeedManifest {
    if (!this._manifest) throw new NewsFeedNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }
  get feedRules(): FeedRules {
    return this.manifest.feed;
  }

  /* --- lookup --- */

  hasEntry(id: string): boolean {
    return this._entriesById.has(id);
  }
  entry(id: string): NewsEntry {
    const e = this._entriesById.get(id);
    if (!e) {
      throw new UnknownNewsEntryError(id, Array.from(this._entriesById.keys()));
    }
    return e;
  }
  entryIds(): string[] {
    return Array.from(this._entriesById.keys());
  }

  hasCategory(id: string): boolean {
    return this._categoriesById.has(id);
  }
  category(id: string): NewsCategory {
    const c = this._categoriesById.get(id);
    if (!c) {
      throw new UnknownNewsCategoryError(
        id,
        Array.from(this._categoriesById.keys()),
      );
    }
    return c;
  }
  filterChipCategories(): NewsCategory[] {
    return Array.from(this._categoriesById.values()).filter(
      (c) => c.visibleInFilters,
    );
  }

  /* --- publish window --- */

  isPublished(entryId: string, nowIso: string): boolean {
    const e = this.entry(entryId);
    if (nowIso < e.publishAtIso) return false;
    if (e.expireAtIso !== "" && nowIso >= e.expireAtIso) return false;
    return true;
  }

  /* --- targeting --- */

  /**
   * Evaluate whether a given entry matches a viewer's context. Empty
   * targeting fields are wildcards (match all).
   */
  matchesViewer(entryId: string, viewer: NewsViewerContext): boolean {
    const e = this.entry(entryId);
    const t = e.targeting;
    if (t.platforms.length > 0 && !t.platforms.includes(viewer.platform)) {
      return false;
    }
    if (t.regionPrefixes.length > 0) {
      const hit = t.regionPrefixes.some((p) => viewer.region.startsWith(p));
      if (!hit) return false;
    }
    if (t.minClientBuild !== "" && viewer.clientBuild < t.minClientBuild) {
      return false;
    }
    if (viewer.characterLevel < t.minCharacterLevel) return false;
    if (viewer.accountAgeDays < t.minAccountAgeDays) return false;
    if (
      t.requiresFlagId !== "" &&
      !viewer.enabledFlagIds.has(t.requiresFlagId)
    ) {
      return false;
    }
    return true;
  }

  /* --- visible feed --- */

  /**
   * Sort:
   *   1. pinned first
   *   2. priority ascending by PRIORITY_ORDER (critical < high < ...)
   *   3. publishAtIso descending (newest first)
   *   4. id for deterministic tie-break
   */
  private sortEntries(arr: NewsEntry[]): NewsEntry[] {
    return [...arr].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const pa = PRIORITY_ORDER[a.priority];
      const pb = PRIORITY_ORDER[b.priority];
      if (pa !== pb) return pa - pb;
      if (a.publishAtIso !== b.publishAtIso) {
        return a.publishAtIso < b.publishAtIso ? 1 : -1;
      }
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Return the entries visible to `viewer` at `nowIso`, sorted for UI
   * display.
   */
  visibleFeed(nowIso: string, viewer: NewsViewerContext): NewsEntry[] {
    const dismissed = viewer.dismissedEntryIds ?? new Set<string>();
    const all = Array.from(this._entriesById.values()).filter((e) => {
      if (dismissed.has(e.id)) return false;
      if (!this.isPublished(e.id, nowIso)) return false;
      if (!this.matchesViewer(e.id, viewer)) return false;
      return true;
    });
    return this.sortEntries(all);
  }

  /** Count of unread entries for a viewer, after applying targeting. */
  unreadCount(
    nowIso: string,
    viewer: NewsViewerContext,
    readEntryIds: ReadonlySet<string>,
  ): number {
    return this.visibleFeed(nowIso, viewer).filter(
      (e) => !readEntryIds.has(e.id),
    ).length;
  }
}
