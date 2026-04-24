/**
 * Skybox atmosphere registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `skybox-atmosphere.ts`.
 * Indexes authored skybox presets by id and surfaces the active preset
 * declared by `activeSkyboxId`.
 */

import {
  type SkyboxAtmosphereManifest,
  SkyboxAtmosphereManifestSchema,
  type SkyboxConfig,
} from "@hyperforge/manifest-schema";

export class SkyboxAtmosphereNotLoadedError extends Error {
  constructor() {
    super("SkyboxAtmosphereRegistry used before load()");
    this.name = "SkyboxAtmosphereNotLoadedError";
  }
}

export class UnknownSkyboxError extends Error {
  readonly skyboxId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `skybox "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownSkyboxError";
    this.skyboxId = id;
    this.availableIds = availableIds;
  }
}

export class SkyboxAtmosphereRegistry {
  private _manifest: SkyboxAtmosphereManifest | null = null;
  private _byId = new Map<string, SkyboxConfig>();

  constructor(manifest?: SkyboxAtmosphereManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: SkyboxAtmosphereManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const s of manifest.skyboxes) this._byId.set(s.id, s);
  }

  loadFromJson(raw: unknown): void {
    this.load(SkyboxAtmosphereManifestSchema.parse(raw));
  }

  get manifest(): SkyboxAtmosphereManifest {
    if (!this._manifest) throw new SkyboxAtmosphereNotLoadedError();
    return this._manifest;
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): SkyboxConfig {
    const s = this._byId.get(id);
    if (!s) throw new UnknownSkyboxError(id, this.ids);
    return s;
  }

  all(): SkyboxConfig[] {
    return Array.from(this._byId.values());
  }

  get activeId(): string {
    return this.manifest.activeSkyboxId;
  }

  /** The currently-active skybox preset. Schema refinements guarantee existence. */
  get active(): SkyboxConfig {
    return this.get(this.activeId);
  }
}
