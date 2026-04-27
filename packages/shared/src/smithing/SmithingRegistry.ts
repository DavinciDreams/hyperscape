/**
 * Smithing registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `smithing.ts`.
 * Wraps the smithing/smelting constants (item ids, timing defaults,
 * validation limits, user-facing messages) behind typed accessors.
 */

import {
  type SmithingManifest,
  SmithingManifestSchema,
  type SmithingMessages,
} from "@hyperforge/manifest-schema";

export class SmithingNotLoadedError extends Error {
  constructor() {
    super("SmithingRegistry used before load()");
    this.name = "SmithingNotLoadedError";
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type SmithingReloadListener = () => void;

export class SmithingRegistry {
  private _manifest: SmithingManifest | null = null;
  private _reloadListeners = new Set<SmithingReloadListener>();

  constructor(manifest?: SmithingManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: SmithingManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(SmithingManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: SmithingReloadListener): () => void {
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
          "[smithingRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): SmithingManifest {
    if (!this._manifest) throw new SmithingNotLoadedError();
    return this._manifest;
  }

  get hammerItemId(): string {
    return this.manifest.items.hammerItemId;
  }

  get coalItemId(): string {
    return this.manifest.items.coalItemId;
  }

  get defaultSmeltingTicks(): number {
    return this.manifest.timing.defaultSmeltingTicks;
  }

  get defaultSmithingTicks(): number {
    return this.manifest.timing.defaultSmithingTicks;
  }

  get validation(): SmithingManifest["validation"] {
    return this.manifest.validation;
  }

  get messages(): SmithingMessages {
    return this.manifest.messages;
  }

  isQuantityInRange(quantity: number): boolean {
    const v = this.manifest.validation;
    return quantity >= v.minQuantity && quantity <= v.maxQuantity;
  }

  isItemIdLengthValid(itemId: string): boolean {
    return (
      itemId.length > 0 &&
      itemId.length <= this.manifest.validation.maxItemIdLength
    );
  }
}
