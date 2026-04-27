/**
 * Render-profile registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `render-profile.ts`.
 * Pure logic: profile lookup by id.
 */

import {
  type RenderProfile,
  type RenderProfileManifest,
  RenderProfileManifestSchema,
} from "@hyperforge/manifest-schema";

export class RenderProfileNotLoadedError extends Error {
  constructor() {
    super("RenderProfileRegistry used before load()");
    this.name = "RenderProfileNotLoadedError";
  }
}

export class UnknownRenderProfileError extends Error {
  readonly profileId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `render profile "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownRenderProfileError";
    this.profileId = id;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type RenderProfileReloadListener = () => void;

export class RenderProfileRegistry {
  private _manifest: RenderProfileManifest | null = null;
  private _byId = new Map<string, RenderProfile>();
  private _reloadListeners = new Set<RenderProfileReloadListener>();

  constructor(manifest?: RenderProfileManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: RenderProfileManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const p of manifest) this._byId.set(p.id, p);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(RenderProfileManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: RenderProfileReloadListener): () => void {
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
          "[renderProfileRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): RenderProfileManifest {
    if (!this._manifest) throw new RenderProfileNotLoadedError();
    return this._manifest;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): RenderProfile {
    const p = this._byId.get(id);
    if (!p) {
      throw new UnknownRenderProfileError(id, Array.from(this._byId.keys()));
    }
    return p;
  }
}
