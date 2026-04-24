/**
 * Quality-presets registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `quality-presets.ts`. Pure logic: preset lookup + ordered list.
 */

import {
  type QualityPresetEntry,
  type QualityPresetsManifest,
  QualityPresetsManifestSchema,
} from "@hyperforge/manifest-schema";

export class QualityPresetsNotLoadedError extends Error {
  constructor() {
    super("QualityPresetsRegistry used before load()");
    this.name = "QualityPresetsNotLoadedError";
  }
}

export class UnknownQualityPresetError extends Error {
  readonly presetId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `quality preset "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownQualityPresetError";
    this.presetId = id;
    this.availableIds = availableIds;
  }
}

export class QualityPresetsRegistry {
  private _manifest: QualityPresetsManifest | null = null;
  private _byId = new Map<string, QualityPresetEntry>();

  constructor(manifest?: QualityPresetsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: QualityPresetsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const p of manifest) this._byId.set(p.id, p);
  }

  loadFromJson(raw: unknown): void {
    this.load(QualityPresetsManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): QualityPresetsManifest {
    if (!this._manifest) throw new QualityPresetsNotLoadedError();
    return this._manifest;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): QualityPresetEntry {
    const p = this._byId.get(id);
    if (!p) {
      throw new UnknownQualityPresetError(id, Array.from(this._byId.keys()));
    }
    return p;
  }
}
