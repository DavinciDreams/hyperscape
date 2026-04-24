/**
 * Render-profile registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `render-profile.ts`. Loads the authored manifest, indexes
 * profiles by id, and exposes a `getActive(id)` + `getDefault()`
 * lookup. The renderer composes `RenderProfile ∘ QualityPreset`:
 * the profile sets the artistic intent, `quality-presets.ts`
 * scales cost to the user's hardware.
 *
 * Scope: pure logic. The renderer (WebGPU) binds the resolved
 * profile's values into TSL node inputs.
 */

import {
  type RenderProfile,
  type RenderProfileManifest,
  RenderProfileManifestSchema,
} from "@hyperforge/manifest-schema";

export class UnknownRenderProfileError extends Error {
  readonly profileId: string;
  readonly availableIds: readonly string[];
  constructor(profileId: string, availableIds: readonly string[]) {
    super(
      `render profile "${profileId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownRenderProfileError";
    this.profileId = profileId;
    this.availableIds = availableIds;
  }
}

export class RenderProfileRegistry {
  private _byId = new Map<string, RenderProfile>();
  private _defaultId: string | null = null;

  constructor(manifest?: RenderProfileManifest, defaultId?: string) {
    if (manifest) this.load(manifest, defaultId);
  }

  /**
   * Load a new manifest. `defaultId` picks the preferred profile;
   * when omitted, the first entry in the manifest wins.
   */
  load(manifest: RenderProfileManifest, defaultId?: string): void {
    this._byId.clear();
    for (const p of manifest) this._byId.set(p.id, p);
    if (defaultId !== undefined) {
      if (!this._byId.has(defaultId)) {
        throw new UnknownRenderProfileError(
          defaultId,
          Array.from(this._byId.keys()),
        );
      }
      this._defaultId = defaultId;
    } else {
      this._defaultId = manifest[0]?.id ?? null;
    }
  }

  loadFromJson(raw: unknown, defaultId?: string): void {
    this.load(RenderProfileManifestSchema.parse(raw), defaultId);
  }

  get size(): number {
    return this._byId.size;
  }

  /**
   * Non-throwing check for consumers that want to prefer the registry
   * when a render-profiles manifest has been loaded and fall back to
   * hardcoded renderer defaults otherwise. Symmetric with
   * `WorldAreasRegistry.isLoaded()`.
   */
  isLoaded(): boolean {
    return this._byId.size > 0;
  }

  get ids(): readonly string[] {
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

  /** The manifest-declared default (first entry or explicit `defaultId`). */
  getDefault(): RenderProfile {
    if (this._defaultId === null) {
      throw new UnknownRenderProfileError(
        "(default)",
        Array.from(this._byId.keys()),
      );
    }
    return this.get(this._defaultId);
  }

  get defaultId(): string | null {
    return this._defaultId;
  }

  /** Replace the default without reloading. */
  setDefault(id: string): void {
    if (!this._byId.has(id)) {
      throw new UnknownRenderProfileError(id, Array.from(this._byId.keys()));
    }
    this._defaultId = id;
  }
}
