/**
 * LootTablesProvider
 *
 * Single-source-of-truth holder for the authored `LootTablesManifest`.
 * Mirrors `CombatTuningProvider` / `DialogueConditionBindingsProvider` —
 * an instanced singleton that `DataManager` populates at boot and
 * `PIEEditorSession.updateManifests` tees into on hot-reload.
 *
 * Consumers of the authored manifest:
 * - `SystemLoader`: at server boot, after `systems.loot` is resolved,
 *   calls `lootSystem.setAuthoredLootTables(provider.getManifest())` so
 *   the `LootTableRoller` is primed before the first mob dies.
 * - `PIEEditorSession`: writes through on `updateManifests({lootTables})`
 *   so subsequent server restarts start from the same manifest the
 *   editor is viewing. Live dispatch to the running `LootSystem` still
 *   happens in the same branch.
 *
 * This provider deliberately does not reach into `LootSystem` — the
 * explicit init-time seed + PIE write-through are the only two paths
 * from authored JSON into the runtime.
 */

import {
  LootTablesManifestSchema,
  type LootTablesManifest,
} from "@hyperforge/manifest-schema";

class LootTablesProvider {
  private static _instance: LootTablesProvider | null = null;
  private _manifest: LootTablesManifest | null = null;

  public static getInstance(): LootTablesProvider {
    if (!LootTablesProvider._instance) {
      LootTablesProvider._instance = new LootTablesProvider();
    }
    return LootTablesProvider._instance;
  }

  /**
   * Install an already-validated manifest. Callers that start from raw
   * JSON (e.g. DataManager reading a file from disk) should use
   * `loadRaw` so validation happens at the edge.
   */
  public load(manifest: LootTablesManifest): void {
    this._manifest = manifest;
  }

  /**
   * Validate and install a raw JSON-parsed payload. Throws on schema
   * violations; on throw the provider stays in its previous state
   * (not half-loaded).
   */
  public loadRaw(raw: unknown): LootTablesManifest {
    const parsed = LootTablesManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /**
   * Hot-reload entry point (PIE + editor). `null` payload clears the
   * authored manifest; equivalent to `unload` but kept as a matched
   * verb for callers mirroring sibling providers.
   */
  public hotReload(manifest: LootTablesManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Current authored loot-table library. Empty readonly array when not
   * loaded — safe to iterate unconditionally.
   */
  public getTables(): LootTablesManifest {
    return this._manifest ?? [];
  }

  /** Raw manifest reference (null when not loaded). Mainly for tests. */
  public getManifest(): LootTablesManifest | null {
    return this._manifest;
  }
}

export { LootTablesProvider };
export const lootTablesProvider = LootTablesProvider.getInstance();
