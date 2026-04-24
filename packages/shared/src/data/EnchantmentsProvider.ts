/**
 * EnchantmentsProvider
 *
 * Singleton persistence layer for the authored enchantments
 * manifest — 4-kind enum (permanent/socket-gem/rune-word/
 * temporary), 11-slot enum (10 specific + `any` wildcard), 20-
 * stat enum, per-modifier tier ladder 1..10 with author-listed
 * non-linear scaling, `multiply`-positive refinement, `any`-
 * cannot-combine-with-specific refinement, `temporary ⟺
 * durationHits>0` iff refinement, modifier-tier-≤-maxTier
 * refinement.
 *
 * Array-shape manifest — empty `[]` baseline keeps the
 * pipeline inert until enchantments are authored.
 *
 * Runtime EnchantmentSystem not yet shipped.
 */

import {
  EnchantmentsManifestSchema,
  type EnchantmentsManifest,
} from "@hyperforge/manifest-schema";

class EnchantmentsProvider {
  private static _instance: EnchantmentsProvider | null = null;
  private _manifest: EnchantmentsManifest | null = null;

  public static getInstance(): EnchantmentsProvider {
    if (!EnchantmentsProvider._instance) {
      EnchantmentsProvider._instance = new EnchantmentsProvider();
    }
    return EnchantmentsProvider._instance;
  }

  public load(manifest: EnchantmentsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): EnchantmentsManifest {
    const parsed = EnchantmentsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: EnchantmentsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): EnchantmentsManifest | null {
    return this._manifest;
  }
}

export { EnchantmentsProvider };
export const enchantmentsProvider = EnchantmentsProvider.getInstance();
