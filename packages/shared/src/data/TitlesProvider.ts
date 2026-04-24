/**
 * TitlesProvider
 *
 * Singleton persistence layer for the authored titles manifest
 * — registry of character-title honorifics with 7-kind unlock-
 * condition discriminated union (achievement/leaderboardBracket/
 * bossKillCount/quest/skillLevel/purchase/manual) with unique-
 * kind refinement (OR semantics, no redundant dups), prefix/
 * suffix/replace display mode, 6-rarity, revocation block
 * (cadence/expire/GM), always-localized displayKey.
 *
 * Array-shape manifest — empty `[]` baseline keeps the
 * pipeline inert until titles are authored.
 *
 * Runtime TitleSystem not yet shipped.
 */

import {
  TitlesManifestSchema,
  type TitlesManifest,
} from "@hyperforge/manifest-schema";

class TitlesProvider {
  private static _instance: TitlesProvider | null = null;
  private _manifest: TitlesManifest | null = null;

  public static getInstance(): TitlesProvider {
    if (!TitlesProvider._instance) {
      TitlesProvider._instance = new TitlesProvider();
    }
    return TitlesProvider._instance;
  }

  public load(manifest: TitlesManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): TitlesManifest {
    const parsed = TitlesManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: TitlesManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): TitlesManifest | null {
    return this._manifest;
  }
}

export { TitlesProvider };
export const titlesProvider = TitlesProvider.getInstance();
