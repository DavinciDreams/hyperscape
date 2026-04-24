/**
 * Buildings registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `buildings.ts`.
 * Indexes the procgen building catalog by id. The upstream schema
 * currently accepts arbitrary fields via passthrough, so the registry
 * preserves the raw entry shape.
 */

import {
  type Building,
  type BuildingsManifest,
  BuildingsManifestSchema,
} from "@hyperforge/manifest-schema";

export class BuildingsNotLoadedError extends Error {
  constructor() {
    super("BuildingsRegistry used before load()");
    this.name = "BuildingsNotLoadedError";
  }
}

export class UnknownBuildingError extends Error {
  readonly buildingId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `building "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownBuildingError";
    this.buildingId = id;
    this.availableIds = availableIds;
  }
}

export class BuildingsRegistry {
  private _manifest: BuildingsManifest | null = null;
  private _byId = new Map<string, Building>();

  constructor(manifest?: BuildingsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: BuildingsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const b of manifest) this._byId.set(b.id, b);
  }

  loadFromJson(raw: unknown): void {
    this.load(BuildingsManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): BuildingsManifest {
    if (!this._manifest) throw new BuildingsNotLoadedError();
    return this._manifest;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): Building {
    const b = this._byId.get(id);
    if (!b) throw new UnknownBuildingError(id, this.ids);
    return b;
  }

  all(): readonly Building[] {
    return this.manifest;
  }
}
