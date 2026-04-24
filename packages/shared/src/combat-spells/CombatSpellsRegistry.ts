/**
 * Combat spells registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `combat-spells.ts`. Flattens the spellbook structure into an id →
 * entry map, exposes ordered iteration, level-gate predicates, and
 * filter helpers by tier (strike|bolt) and element.
 */

import {
  type CombatSpellEntry,
  type CombatSpellsManifest,
  CombatSpellsManifestSchema,
} from "@hyperforge/manifest-schema";

export class CombatSpellsNotLoadedError extends Error {
  constructor() {
    super("CombatSpellsRegistry used before load()");
    this.name = "CombatSpellsNotLoadedError";
  }
}

export class UnknownCombatSpellError extends Error {
  readonly spellId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `combat spell "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownCombatSpellError";
    this.spellId = id;
    this.availableIds = availableIds;
  }
}

export type CombatSpellTier = "strike" | "bolt";

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type CombatSpellsReloadListener = () => void;

export class CombatSpellsRegistry {
  private _manifest: CombatSpellsManifest | null = null;
  private _byId = new Map<string, CombatSpellEntry>();
  private _order: string[] = [];
  private _tierByGroupId = new Map<string, CombatSpellTier>();
  private _reloadListeners = new Set<CombatSpellsReloadListener>();

  constructor(manifest?: CombatSpellsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: CombatSpellsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    this._order = [];
    this._tierByGroupId.clear();
    for (const s of manifest.standard.strike) {
      this._byId.set(s.id, s);
      this._order.push(s.id);
      this._tierByGroupId.set(s.id, "strike");
    }
    for (const s of manifest.standard.bolt) {
      this._byId.set(s.id, s);
      this._order.push(s.id);
      this._tierByGroupId.set(s.id, "bolt");
    }
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(CombatSpellsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to "registry reloaded" notifications. Fires after every
   * successful `load()` / `loadFromJson()` — both at server boot
   * (DataManager) and on PIE hot-reload (`PIEEditorSession.updateManifests`).
   * Returns an unsubscribe function. Listener throws are caught + logged.
   */
  onReloaded(cb: CombatSpellsReloadListener): () => void {
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
          "[combatSpellsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): CombatSpellsManifest {
    if (!this._manifest) throw new CombatSpellsNotLoadedError();
    return this._manifest;
  }

  /**
   * Non-throwing check for consumers that prefer the registry when a
   * manifest has been loaded and fall back to a legacy in-tree
   * constant otherwise. Mirrors `WorldAreasRegistry.isLoaded()` /
   * `RunesRegistry.isLoaded()` / `NPCSizesRegistry.isLoaded()`.
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
    this._order.length = 0;
    this._tierByGroupId.clear();
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): CombatSpellEntry {
    const s = this._byId.get(id);
    if (!s) {
      throw new UnknownCombatSpellError(id, Array.from(this._byId.keys()));
    }
    return s;
  }

  /** Ordered spell ids (strike tier first, then bolt tier). */
  order(): string[] {
    return [...this._order];
  }

  tierOf(id: string): CombatSpellTier {
    const t = this._tierByGroupId.get(id);
    if (!t) {
      throw new UnknownCombatSpellError(id, Array.from(this._byId.keys()));
    }
    return t;
  }

  byTier(tier: CombatSpellTier): CombatSpellEntry[] {
    return tier === "strike"
      ? [...this.manifest.standard.strike]
      : [...this.manifest.standard.bolt];
  }

  byElement(element: string): CombatSpellEntry[] {
    return Array.from(this._byId.values()).filter((s) => s.element === element);
  }

  canCast(id: string, magicLevel: number): boolean {
    const s = this.get(id);
    return magicLevel >= s.level;
  }
}
