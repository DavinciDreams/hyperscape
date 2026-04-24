/**
 * MobLootTableMappingsProvider
 *
 * Companion singleton to `LootTablesProvider`. Holds the authored
 * `mobType → tableId` record that `LootSystem.setMobLootTableMappings`
 * consumes to route mob deaths to the authored roller.
 *
 * Kept separate from `LootTablesProvider` (rather than folded into a
 * single "loot bundle") so the two manifests can be hot-reloaded and
 * versioned independently — editing a single mob→table pointer
 * shouldn't require re-validating the entire loot-table library.
 */

import {
  MobLootTableMappingsManifestSchema,
  type MobLootTableMappingsManifest,
} from "@hyperforge/manifest-schema";

class MobLootTableMappingsProvider {
  private static _instance: MobLootTableMappingsProvider | null = null;
  private _mappings: MobLootTableMappingsManifest | null = null;

  public static getInstance(): MobLootTableMappingsProvider {
    if (!MobLootTableMappingsProvider._instance) {
      MobLootTableMappingsProvider._instance =
        new MobLootTableMappingsProvider();
    }
    return MobLootTableMappingsProvider._instance;
  }

  /** Install an already-validated mapping record. */
  public load(mappings: MobLootTableMappingsManifest): void {
    this._mappings = mappings;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): MobLootTableMappingsManifest {
    const parsed = MobLootTableMappingsManifestSchema.parse(raw);
    this._mappings = parsed;
    return parsed;
  }

  /** Detach the authored mappings. `isLoaded()` becomes false. */
  public unload(): void {
    this._mappings = null;
  }

  /** Hot-reload entry point. `null` clears the authored mappings. */
  public hotReload(mappings: MobLootTableMappingsManifest | null): void {
    this._mappings = mappings;
  }

  public isLoaded(): boolean {
    return this._mappings !== null;
  }

  /**
   * Current authored mappings. Empty object when not loaded — safe to
   * spread or iterate unconditionally.
   */
  public getMappings(): MobLootTableMappingsManifest {
    return this._mappings ?? {};
  }

  /** Raw record reference (null when not loaded). Mainly for tests. */
  public getManifest(): MobLootTableMappingsManifest | null {
    return this._mappings;
  }
}

export { MobLootTableMappingsProvider };
export const mobLootTableMappingsProvider =
  MobLootTableMappingsProvider.getInstance();
