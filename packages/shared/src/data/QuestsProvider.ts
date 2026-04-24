/**
 * QuestsProvider
 *
 * Singleton persistence layer for the authored quests manifest —
 * record keyed by quest id with stages/rewards/prerequisites.
 * Authored at `quests.json`; schema is `QuestsManifestSchema`.
 *
 * Safe baseline: `{}` (empty quest registry).
 */

import {
  QuestsManifestSchema,
  type QuestsManifest,
} from "@hyperforge/manifest-schema";

class QuestsProvider {
  private static _instance: QuestsProvider | null = null;
  private _manifest: QuestsManifest | null = null;

  public static getInstance(): QuestsProvider {
    if (!QuestsProvider._instance) {
      QuestsProvider._instance = new QuestsProvider();
    }
    return QuestsProvider._instance;
  }

  public load(manifest: QuestsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): QuestsManifest {
    const parsed = QuestsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: QuestsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): QuestsManifest | null {
    return this._manifest;
  }
}

export { QuestsProvider };
export const questsProvider = QuestsProvider.getInstance();
