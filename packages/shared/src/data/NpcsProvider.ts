/**
 * NpcsProvider
 *
 * Singleton persistence layer for the authored npcs manifest —
 * NPC spawn-rule constants (cooldowns, distance thresholds, spawn caps).
 * Authored at `npcs.json`; schema is `NpcsManifestSchema`.
 *
 * No safe baseline — `$schema` literal + `spawnConstants` required.
 */

import {
  NpcsManifestSchema,
  type NpcsManifest,
} from "@hyperforge/manifest-schema";

class NpcsProvider {
  private static _instance: NpcsProvider | null = null;
  private _manifest: NpcsManifest | null = null;

  public static getInstance(): NpcsProvider {
    if (!NpcsProvider._instance) {
      NpcsProvider._instance = new NpcsProvider();
    }
    return NpcsProvider._instance;
  }

  public load(manifest: NpcsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): NpcsManifest {
    const parsed = NpcsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: NpcsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): NpcsManifest | null {
    return this._manifest;
  }
}

export { NpcsProvider };
export const npcsProvider = NpcsProvider.getInstance();
