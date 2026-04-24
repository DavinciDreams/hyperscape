/**
 * GameProvider
 *
 * Singleton persistence layer for the authored game manifest —
 * inventory constants, player constants, home teleport, misc
 * engine-wide numbers. Authored at `game-constants.json`; schema
 * is `GameManifestSchema`.
 *
 * No safe baseline — schema requires a full object. Runtime falls back
 * to legacy hardcoded `GameConstants` when provider is unloaded.
 */

import {
  GameManifestSchema,
  type GameManifest,
} from "@hyperforge/manifest-schema";

class GameProvider {
  private static _instance: GameProvider | null = null;
  private _manifest: GameManifest | null = null;

  public static getInstance(): GameProvider {
    if (!GameProvider._instance) {
      GameProvider._instance = new GameProvider();
    }
    return GameProvider._instance;
  }

  public load(manifest: GameManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): GameManifest {
    const parsed = GameManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: GameManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): GameManifest | null {
    return this._manifest;
  }
}

export { GameProvider };
export const gameProvider = GameProvider.getInstance();
