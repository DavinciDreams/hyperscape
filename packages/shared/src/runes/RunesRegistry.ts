/**
 * Runes registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `runes.ts`.
 * Rune metadata lookup + elemental staff substitution logic: for a
 * given spell's rune cost, an equipped elemental staff may provide
 * an infinite supply of specific runes.
 */

import {
  type ElementalStaffEntry,
  type RuneEntry,
  type RunesManifest,
  RunesManifestSchema,
} from "@hyperforge/manifest-schema";

export class RunesNotLoadedError extends Error {
  constructor() {
    super("RunesRegistry used before load()");
    this.name = "RunesNotLoadedError";
  }
}

export class UnknownRuneError extends Error {
  readonly runeId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `rune "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownRuneError";
    this.runeId = id;
    this.availableIds = availableIds;
  }
}

export interface RuneRequirement {
  runeId: string;
  quantity: number;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type RunesReloadListener = () => void;

export class RunesRegistry {
  private _manifest: RunesManifest | null = null;
  private _byId = new Map<string, RuneEntry>();
  private _staffById = new Map<string, ElementalStaffEntry>();
  private _reloadListeners = new Set<RunesReloadListener>();

  constructor(manifest?: RunesManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: RunesManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    this._staffById.clear();
    for (const r of manifest.runes) this._byId.set(r.id, r);
    for (const s of manifest.elementalStaves) {
      this._staffById.set(s.staffId, s);
    }
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(RunesManifestSchema.parse(raw));
  }

  /**
   * Subscribe to "registry reloaded" notifications. Fires after every
   * successful `load()` / `loadFromJson()` — both at server boot
   * (DataManager) and on PIE hot-reload (`PIEEditorSession.updateManifests`).
   * Returns an unsubscribe function. Listener throws are caught + logged.
   */
  onReloaded(cb: RunesReloadListener): () => void {
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
          "[runesRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): RunesManifest {
    if (!this._manifest) throw new RunesNotLoadedError();
    return this._manifest;
  }

  /**
   * Non-throwing check for consumers that prefer the registry when a
   * manifest has been loaded and fall back to a legacy in-tree
   * constant otherwise. Mirrors `WorldAreasRegistry.isLoaded()` /
   * `NPCSizesRegistry.isLoaded()` / `StoresRegistry.isLoaded()`.
   */
  isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Test-only reset back to the unloaded state. Module-level
   * singleton needs this to clear state between integration tests
   * that exercise the registry-prefer-fallback branch in consumer
   * services. Don't call from production code.
   */
  _unloadForTests(): void {
    this._manifest = null;
    this._byId.clear();
    this._staffById.clear();
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): RuneEntry {
    const r = this._byId.get(id);
    if (!r) {
      throw new UnknownRuneError(id, Array.from(this._byId.keys()));
    }
    return r;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  names(): string[] {
    return Array.from(this._byId.values()).map((r) => r.name);
  }

  staff(staffId: string): ElementalStaffEntry | null {
    return this._staffById.get(staffId) ?? null;
  }

  /**
   * Returns rune ids an elemental staff provides infinitely, or an
   * empty array when the staff is unknown.
   */
  providedBy(staffId: string): string[] {
    return this._staffById.get(staffId)?.providesInfinite ?? [];
  }

  /**
   * Given a spell's rune requirements and an equipped staff id, return
   * the effective runes the player still needs to pay from inventory.
   */
  effectiveCost(
    required: readonly RuneRequirement[],
    staffId: string | null,
  ): RuneRequirement[] {
    if (staffId === null) return required.map((r) => ({ ...r }));
    const provided = new Set(this.providedBy(staffId));
    return required
      .filter((r) => !provided.has(r.runeId))
      .map((r) => ({ ...r }));
  }
}
