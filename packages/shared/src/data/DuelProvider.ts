/**
 * DuelProvider
 *
 * Singleton persistence layer for the authored duel manifest — challenge
 * timeout, rule definitions, equipment slot definitions, and slot-to-slot
 * mapping consumed by the duel challenge/rules runtime.
 *
 * No baseline fixture — `$schema`, rules, equipmentSlots, duelSlotToEquipmentSlot,
 * and challengeTimeoutMs are all required without defaults.
 *
 * Runtime Duel challenge/rules wiring pending.
 */

import {
  DuelManifestSchema,
  type DuelManifest,
} from "@hyperforge/manifest-schema";

class DuelProvider {
  private static _instance: DuelProvider | null = null;
  private _manifest: DuelManifest | null = null;

  public static getInstance(): DuelProvider {
    if (!DuelProvider._instance) {
      DuelProvider._instance = new DuelProvider();
    }
    return DuelProvider._instance;
  }

  public load(manifest: DuelManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): DuelManifest {
    const parsed = DuelManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: DuelManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): DuelManifest | null {
    return this._manifest;
  }
}

export { DuelProvider };
export const duelProvider = DuelProvider.getInstance();
