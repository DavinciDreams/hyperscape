/**
 * Prayers registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `prayers.ts`.
 * Pure lookup: prayer definitions by id with level-gate predicate,
 * category filters, and conflict resolution (activating one prayer
 * implicitly deactivates its declared conflicts).
 */

import {
  type PrayerCategory,
  type PrayerDefinition,
  type PrayersManifest,
  PrayersManifestSchema,
} from "@hyperforge/manifest-schema";

export class PrayersNotLoadedError extends Error {
  constructor() {
    super("PrayersRegistry used before load()");
    this.name = "PrayersNotLoadedError";
  }
}

export class UnknownPrayerError extends Error {
  readonly prayerId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `prayer "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownPrayerError";
    this.prayerId = id;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type PrayersReloadListener = () => void;

export class PrayersRegistry {
  private _manifest: PrayersManifest | null = null;
  private _byId = new Map<string, PrayerDefinition>();
  private _reloadListeners = new Set<PrayersReloadListener>();

  constructor(manifest?: PrayersManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: PrayersManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const p of manifest.prayers) this._byId.set(p.id, p);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(PrayersManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: PrayersReloadListener): () => void {
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
          "[prayersRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): PrayersManifest {
    if (!this._manifest) throw new PrayersNotLoadedError();
    return this._manifest;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): PrayerDefinition {
    const p = this._byId.get(id);
    if (!p) {
      throw new UnknownPrayerError(id, Array.from(this._byId.keys()));
    }
    return p;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  byCategory(category: PrayerCategory): PrayerDefinition[] {
    return Array.from(this._byId.values()).filter(
      (p) => p.category === category,
    );
  }

  canActivate(id: string, prayerLevel: number): boolean {
    return prayerLevel >= this.get(id).level;
  }

  /** Prayer ids that will be deactivated if `id` is activated. */
  conflictsFor(id: string): string[] {
    return [...this.get(id).conflicts];
  }

  /**
   * Given a set of currently-active prayer ids, return the set after
   * activating `id` — conflicts are removed, `id` is added.
   */
  applyActivation(id: string, active: ReadonlySet<string>): Set<string> {
    const conflicts = new Set(this.conflictsFor(id));
    const next = new Set<string>();
    for (const pid of active) {
      if (!conflicts.has(pid)) next.add(pid);
    }
    next.add(id);
    return next;
  }
}
