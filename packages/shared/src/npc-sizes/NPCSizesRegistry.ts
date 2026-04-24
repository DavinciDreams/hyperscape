/**
 * NPC sizes registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `npc-sizes.ts`.
 * Pure lookup: NPC id → collision footprint (tile-grid width/depth).
 * Unknown NPCs default to 1×1 via `getOrDefault`.
 */

import {
  type NPCSizeEntry,
  type NPCSizesManifest,
  NPCSizesManifestSchema,
} from "@hyperforge/manifest-schema";

export class NPCSizesNotLoadedError extends Error {
  constructor() {
    super("NPCSizesRegistry used before load()");
    this.name = "NPCSizesNotLoadedError";
  }
}

const DEFAULT_SIZE: NPCSizeEntry = { width: 1, depth: 1 };

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type NPCSizesReloadListener = () => void;

export class NPCSizesRegistry {
  private _manifest: NPCSizesManifest | null = null;
  private _reloadListeners = new Set<NPCSizesReloadListener>();

  constructor(manifest?: NPCSizesManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: NPCSizesManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(NPCSizesManifestSchema.parse(raw));
  }

  /**
   * Subscribe to "registry reloaded" notifications. Fires after every
   * successful `load()` / `loadFromJson()`. Returns an unsubscribe
   * function. Listener throws are caught + logged.
   */
  onReloaded(cb: NPCSizesReloadListener): () => void {
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
          "[npcSizesRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Test-only reset back to the unloaded state. Mirrors the
   * `WorldAreasRegistry._unloadForTests` pattern — the module-level
   * singleton needs a way to clear state between integration tests
   * that exercise the registry-prefer-fallback branch in consumer
   * systems. Don't call from production code.
   */
  _unloadForTests(): void {
    this._manifest = null;
  }

  get manifest(): NPCSizesManifest {
    if (!this._manifest) throw new NPCSizesNotLoadedError();
    return this._manifest;
  }

  has(npcId: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.manifest.sizes, npcId);
  }

  /** Returns the explicit entry or `{width:1,depth:1}` if unknown. */
  getOrDefault(npcId: string): NPCSizeEntry {
    return this.manifest.sizes[npcId] ?? DEFAULT_SIZE;
  }

  ids(): string[] {
    return Object.keys(this.manifest.sizes);
  }
}
