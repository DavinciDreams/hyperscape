/**
 * EquipmentProvider
 *
 * Singleton persistence layer for the authored equipment manifest —
 * equipment slot ids, bank slot definitions, grid positions. Authored
 * at `equipment-constants.json`; schema is `EquipmentManifestSchema`.
 *
 * No safe baseline — schema requires a full object. Runtime falls back
 * to legacy hardcoded `EquipmentConstants` when provider is unloaded.
 */

import {
  EquipmentManifestSchema,
  type EquipmentManifest,
} from "@hyperforge/manifest-schema";

class EquipmentProvider {
  private static _instance: EquipmentProvider | null = null;
  private _manifest: EquipmentManifest | null = null;

  public static getInstance(): EquipmentProvider {
    if (!EquipmentProvider._instance) {
      EquipmentProvider._instance = new EquipmentProvider();
    }
    return EquipmentProvider._instance;
  }

  public load(manifest: EquipmentManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): EquipmentManifest {
    const parsed = EquipmentManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: EquipmentManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): EquipmentManifest | null {
    return this._manifest;
  }
}

export { EquipmentProvider };
export const equipmentProvider = EquipmentProvider.getInstance();
