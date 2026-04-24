/**
 * PlayerEmotesProvider
 *
 * Singleton persistence layer for the authored player-emotes manifest —
 * avatar animation asset URLs keyed by emote name, plus the list of
 * essential emote keys that must pre-load immediately after the
 * avatar finishes loading.
 *
 * No safe baseline — schema requires `essentialEmoteKeys.min(1)`.
 * Runtime falls back to legacy hardcoded emotes when provider is
 * unloaded.
 */

import {
  PlayerEmotesManifestSchema,
  type PlayerEmotesManifest,
} from "@hyperforge/manifest-schema";

class PlayerEmotesProvider {
  private static _instance: PlayerEmotesProvider | null = null;
  private _manifest: PlayerEmotesManifest | null = null;

  public static getInstance(): PlayerEmotesProvider {
    if (!PlayerEmotesProvider._instance) {
      PlayerEmotesProvider._instance = new PlayerEmotesProvider();
    }
    return PlayerEmotesProvider._instance;
  }

  public load(manifest: PlayerEmotesManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): PlayerEmotesManifest {
    const parsed = PlayerEmotesManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: PlayerEmotesManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): PlayerEmotesManifest | null {
    return this._manifest;
  }
}

export { PlayerEmotesProvider };
export const playerEmotesProvider = PlayerEmotesProvider.getInstance();
