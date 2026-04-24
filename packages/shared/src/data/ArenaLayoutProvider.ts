/**
 * ArenaLayoutProvider
 *
 * Singleton persistence layer for the authored arena-layout manifest —
 * shared arena grid + lobby + hospital + lobby spawn point consumed by
 * the duel arena placement runtime.
 *
 * No baseline fixture — `$schema` and all layout fields are required
 * without defaults.
 *
 * Runtime arena layout consumer wiring pending.
 */

import {
  ArenaLayoutManifestSchema,
  type ArenaLayoutManifest,
} from "@hyperforge/manifest-schema";

class ArenaLayoutProvider {
  private static _instance: ArenaLayoutProvider | null = null;
  private _manifest: ArenaLayoutManifest | null = null;

  public static getInstance(): ArenaLayoutProvider {
    if (!ArenaLayoutProvider._instance) {
      ArenaLayoutProvider._instance = new ArenaLayoutProvider();
    }
    return ArenaLayoutProvider._instance;
  }

  public load(manifest: ArenaLayoutManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): ArenaLayoutManifest {
    const parsed = ArenaLayoutManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: ArenaLayoutManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): ArenaLayoutManifest | null {
    return this._manifest;
  }
}

export { ArenaLayoutProvider };
export const arenaLayoutProvider = ArenaLayoutProvider.getInstance();
