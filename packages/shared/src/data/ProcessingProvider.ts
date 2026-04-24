/**
 * ProcessingProvider
 *
 * Singleton persistence layer for the authored processing manifest —
 * firemaking/cooking skill mechanics, success rates, fire duration,
 * fire-walk priority, timing. Authored at `processing-constants.json`;
 * schema is `ProcessingManifestSchema`.
 *
 * No safe baseline — schema requires a full object. Runtime falls back
 * to legacy hardcoded `ProcessingConstants` when provider is unloaded.
 *
 * Not to be confused with `ProcessingDataProvider` which wraps the
 * per-recipe registries (cooking/crafting/fletching/etc).
 */

import {
  ProcessingManifestSchema,
  type ProcessingManifest,
} from "@hyperforge/manifest-schema";

class ProcessingProvider {
  private static _instance: ProcessingProvider | null = null;
  private _manifest: ProcessingManifest | null = null;

  public static getInstance(): ProcessingProvider {
    if (!ProcessingProvider._instance) {
      ProcessingProvider._instance = new ProcessingProvider();
    }
    return ProcessingProvider._instance;
  }

  public load(manifest: ProcessingManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): ProcessingManifest {
    const parsed = ProcessingManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: ProcessingManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): ProcessingManifest | null {
    return this._manifest;
  }
}

export { ProcessingProvider };
export const processingProvider = ProcessingProvider.getInstance();
