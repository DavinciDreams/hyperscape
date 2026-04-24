/**
 * PetCompanionProvider
 *
 * Singleton persistence layer for the authored pet-companion
 * manifest — per-pet definitions with 3 categories (combat/
 * utility/cosmetic), per-pet slot subset (saddle/armor/collar/
 * charm/satchel), 4-follow mode (heel/loose/stay/patrol), summon
 * rules (maxActive 1..20, cooldown, idle-despawn), stats with
 * `ownerStatScaling` 0..1, shape-only ability refs with priority/
 * cooldown, optional progression (maxLevel 1..100, loyalty).
 *
 * Refinements: no-abilities-on-cosmetic + no-progression-on-
 * cosmetic + unique-slots + unique-ability-ids-per-pet.
 *
 * Array-shape manifest — empty `[]` baseline keeps the
 * pipeline inert until pets are authored.
 *
 * Runtime PetSystem not yet shipped.
 */

import {
  PetCompanionManifestSchema,
  type PetCompanionManifest,
} from "@hyperforge/manifest-schema";

class PetCompanionProvider {
  private static _instance: PetCompanionProvider | null = null;
  private _manifest: PetCompanionManifest | null = null;

  public static getInstance(): PetCompanionProvider {
    if (!PetCompanionProvider._instance) {
      PetCompanionProvider._instance = new PetCompanionProvider();
    }
    return PetCompanionProvider._instance;
  }

  public load(manifest: PetCompanionManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): PetCompanionManifest {
    const parsed = PetCompanionManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: PetCompanionManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): PetCompanionManifest | null {
    return this._manifest;
  }
}

export { PetCompanionProvider };
export const petCompanionProvider = PetCompanionProvider.getInstance();
