/**
 * Trees registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `trees.ts`.
 * Indexes the per-subtype tree catalog and exposes level-gate
 * filtering for the woodcutting skill.
 */

import {
  type TreeManifest,
  TreeManifestSchema,
  type TreeType,
} from "@hyperforge/manifest-schema";

export class TreesNotLoadedError extends Error {
  constructor() {
    super("TreeCatalogRegistry used before load()");
    this.name = "TreesNotLoadedError";
  }
}

export class UnknownTreeError extends Error {
  readonly key: string;
  readonly availableKeys: readonly string[];
  constructor(key: string, availableKeys: readonly string[]) {
    super(
      `tree "${key}" not found. Known keys: ${
        availableKeys.length > 0 ? availableKeys.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownTreeError";
    this.key = key;
    this.availableKeys = availableKeys;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type TreeCatalogReloadListener = () => void;

export class TreeCatalogRegistry {
  private _manifest: TreeManifest | null = null;
  private _byResourceId = new Map<string, TreeType>();
  private _reloadListeners = new Set<TreeCatalogReloadListener>();

  constructor(manifest?: TreeManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: TreeManifest): void {
    this._manifest = manifest;
    this._byResourceId.clear();
    for (const tree of Object.values(manifest.trees)) {
      this._byResourceId.set(tree.id, tree);
    }
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(TreeManifestSchema.parse(raw));
  }

  /**
   * Subscribe to "registry reloaded" notifications. Fires after every
   * successful `load()` / `loadFromJson()`. Returns an unsubscribe
   * function. Listener throws are caught + logged.
   */
  onReloaded(cb: TreeCatalogReloadListener): () => void {
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
          "[treeCatalogRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): TreeManifest {
    if (!this._manifest) throw new TreesNotLoadedError();
    return this._manifest;
  }

  /** Subtype keys (e.g., "oak", "maple"). */
  get subtypeKeys(): string[] {
    return Object.keys(this.manifest.trees);
  }

  /** Resource ids (e.g., "tree_oak"). */
  get resourceIds(): string[] {
    return Array.from(this._byResourceId.keys());
  }

  hasSubtype(subtype: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.manifest.trees, subtype);
  }

  hasResourceId(resourceId: string): boolean {
    return this._byResourceId.has(resourceId);
  }

  bySubtype(subtype: string): TreeType {
    const t = this.manifest.trees[subtype];
    if (!t) throw new UnknownTreeError(subtype, this.subtypeKeys);
    return t;
  }

  byResourceId(resourceId: string): TreeType {
    const t = this._byResourceId.get(resourceId);
    if (!t) throw new UnknownTreeError(resourceId, this.resourceIds);
    return t;
  }

  /** Trees a player of `woodcuttingLevel` is able to chop. */
  choppableAt(woodcuttingLevel: number): TreeType[] {
    return Object.values(this.manifest.trees).filter(
      (t) => t.levelRequired <= woodcuttingLevel,
    );
  }
}
