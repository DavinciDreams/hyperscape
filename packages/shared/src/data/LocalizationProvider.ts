/**
 * LocalizationProvider
 *
 * Single-source-of-truth holder for the authored `LocalizationBundle`
 * (base locale + per-locale translation manifests). Mirrors
 * `DialogueProvider` / `LootTablesProvider` — an instanced singleton
 * that `DataManager` populates at boot and
 * `PIEEditorSession.updateManifests({ localization })` tees into on
 * hot-reload.
 *
 * Consumers:
 * - `SystemLoader`: after `systems.dialogue` is resolved, constructs
 *   `new LocalizationCatalog(provider.getBundle())` and calls
 *   `dialogueSystem.setLocalizationCatalog(catalog)` when loaded.
 *   Authored dialogue textKeys resolve through the catalog on the
 *   next emit; unloaded → catalog stays null → DialogueSystem echoes
 *   raw textKeys (safe default).
 * - `PIEEditorSession`: writes through on `updateManifests({
 *   localization })` so subsequent server restarts start from the
 *   same bundle the editor is viewing. Live dispatch above still
 *   attaches a fresh catalog.
 *
 * The provider stores the validated `LocalizationBundle` only —
 * constructing the `LocalizationCatalog` is the consumer's job so the
 * provider stays a dependency-free persistence layer.
 */

import {
  LocalizationBundleSchema,
  type LocalizationBundle,
} from "@hyperforge/manifest-schema";

class LocalizationProvider {
  private static _instance: LocalizationProvider | null = null;
  private _bundle: LocalizationBundle | null = null;

  public static getInstance(): LocalizationProvider {
    if (!LocalizationProvider._instance) {
      LocalizationProvider._instance = new LocalizationProvider();
    }
    return LocalizationProvider._instance;
  }

  /** Install an already-validated bundle. */
  public load(bundle: LocalizationBundle): void {
    this._bundle = bundle;
  }

  /**
   * Validate and install a raw JSON-parsed payload. Throws on schema
   * violations; prior state untouched.
   */
  public loadRaw(raw: unknown): LocalizationBundle {
    const parsed = LocalizationBundleSchema.parse(raw);
    this._bundle = parsed;
    return parsed;
  }

  /** Detach the authored bundle. `isLoaded()` becomes false. */
  public unload(): void {
    this._bundle = null;
  }

  /** Hot-reload entry point. `null` clears the authored bundle. */
  public hotReload(bundle: LocalizationBundle | null): void {
    this._bundle = bundle;
  }

  public isLoaded(): boolean {
    return this._bundle !== null;
  }

  /** Authored bundle (null when not loaded). */
  public getBundle(): LocalizationBundle | null {
    return this._bundle;
  }

  /** Alias for symmetry with sibling providers. */
  public getManifest(): LocalizationBundle | null {
    return this._bundle;
  }
}

export { LocalizationProvider };
export const localizationProvider = LocalizationProvider.getInstance();
