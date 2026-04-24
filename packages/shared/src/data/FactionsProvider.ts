/**
 * FactionsProvider
 *
 * Singleton persistence layer for the authored factions manifest —
 * 6-disposition reputation graph (allied/friendly/neutral/
 * unfriendly/hostile/at-war) with reputation tier bands + sparse
 * pairwise relationship graph. Wraps the `@hyperforge/manifest-
 * schema` `FactionsManifestSchema` with null-when-unloaded semantics
 * (schema requires `factions.min(1)`, no safe-empty fallback).
 *
 * Runtime FactionSystem is not yet shipped — this provider only
 * persists authored data for future consumption.
 */

import {
  FactionsManifestSchema,
  type FactionsManifest,
} from "@hyperforge/manifest-schema";

class FactionsProvider {
  private static _instance: FactionsProvider | null = null;
  private _manifest: FactionsManifest | null = null;

  public static getInstance(): FactionsProvider {
    if (!FactionsProvider._instance) {
      FactionsProvider._instance = new FactionsProvider();
    }
    return FactionsProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: FactionsManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): FactionsManifest {
    const parsed = FactionsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: FactionsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): FactionsManifest | null {
    return this._manifest;
  }
}

export { FactionsProvider };
export const factionsProvider = FactionsProvider.getInstance();
