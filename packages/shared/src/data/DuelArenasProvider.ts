/**
 * DuelArenasProvider
 *
 * Singleton persistence layer for the authored duel-arenas manifest —
 * physical arena layouts + lobby + hospital transit areas + shared
 * arena constants consumed by the streaming duel scheduler / arena
 * orchestrator.
 *
 * No baseline fixture — arenas must be non-empty and lobby/hospital/constants
 * are required without defaults.
 *
 * Runtime arena orchestrator wiring pending.
 */

import {
  DuelArenasManifestSchema,
  type DuelArenasManifest,
} from "@hyperforge/manifest-schema";

class DuelArenasProvider {
  private static _instance: DuelArenasProvider | null = null;
  private _manifest: DuelArenasManifest | null = null;

  public static getInstance(): DuelArenasProvider {
    if (!DuelArenasProvider._instance) {
      DuelArenasProvider._instance = new DuelArenasProvider();
    }
    return DuelArenasProvider._instance;
  }

  public load(manifest: DuelArenasManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): DuelArenasManifest {
    const parsed = DuelArenasManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: DuelArenasManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): DuelArenasManifest | null {
    return this._manifest;
  }
}

export { DuelArenasProvider };
export const duelArenasProvider = DuelArenasProvider.getInstance();
