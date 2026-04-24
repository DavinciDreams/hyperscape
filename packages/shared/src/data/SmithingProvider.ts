/**
 * SmithingProvider
 *
 * Singleton persistence layer for the authored smithing manifest —
 * bar-forging recipes, anvil messages, skill-mechanics. Authored at
 * `smithing-constants.json`; schema is `SmithingManifestSchema`.
 *
 * No safe baseline — schema requires a full object. Runtime falls back
 * to legacy hardcoded `SmithingConstants` when provider is unloaded.
 */

import {
  SmithingManifestSchema,
  type SmithingManifest,
} from "@hyperforge/manifest-schema";

class SmithingProvider {
  private static _instance: SmithingProvider | null = null;
  private _manifest: SmithingManifest | null = null;

  public static getInstance(): SmithingProvider {
    if (!SmithingProvider._instance) {
      SmithingProvider._instance = new SmithingProvider();
    }
    return SmithingProvider._instance;
  }

  public load(manifest: SmithingManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): SmithingManifest {
    const parsed = SmithingManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: SmithingManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): SmithingManifest | null {
    return this._manifest;
  }
}

export { SmithingProvider };
export const smithingProvider = SmithingProvider.getInstance();
