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

export class NPCSizesRegistry {
  private _manifest: NPCSizesManifest | null = null;

  constructor(manifest?: NPCSizesManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: NPCSizesManifest): void {
    this._manifest = manifest;
  }

  loadFromJson(raw: unknown): void {
    this.load(NPCSizesManifestSchema.parse(raw));
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
