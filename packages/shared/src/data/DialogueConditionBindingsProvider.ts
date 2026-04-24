/**
 * DialogueConditionBindingsProvider
 *
 * Single-source-of-truth holder for the authored
 * `DialogueConditionBindingsManifest`. Mirrors the
 * `prayerDataProvider` / `processingDataProvider` / `TierDataProvider`
 * pattern:
 *
 *   - `load(manifest)` sets the authored list (validated at the edge
 *     by `DialogueConditionBindingsManifestSchema.parse` — pass the
 *     already-parsed value here).
 *   - `isLoaded()` is the boot-time guard for SystemLoader: the
 *     dialogue-condition install only runs when a manifest has been
 *     supplied.
 *   - `getBindings()` returns the authored binding list (empty array
 *     when not loaded — safe to iterate unconditionally).
 *   - `hotReload(manifest | null)` is the PIE-side entry point; a
 *     `null` payload clears the authored list without unloading the
 *     provider itself.
 *
 * This provider deliberately does not touch DialogueSystem directly.
 * SystemLoader + `PIEEditorSession.updateManifests` own the bridge to
 * the live registry — this module just holds the authored data.
 */

import {
  DialogueConditionBindingsManifestSchema,
  type DialogueConditionBindingsManifest,
  type DialogueConditionBinding,
} from "@hyperforge/manifest-schema";

class DialogueConditionBindingsProvider {
  private static _instance: DialogueConditionBindingsProvider | null = null;
  private _manifest: DialogueConditionBindingsManifest | null = null;

  public static getInstance(): DialogueConditionBindingsProvider {
    if (!DialogueConditionBindingsProvider._instance) {
      DialogueConditionBindingsProvider._instance =
        new DialogueConditionBindingsProvider();
    }
    return DialogueConditionBindingsProvider._instance;
  }

  /**
   * Install a new authored bindings manifest. Expects an
   * already-validated payload (i.e. the output of
   * `DialogueConditionBindingsManifestSchema.parse`). Callers that
   * start from raw JSON should use `loadRaw` instead.
   */
  public load(manifest: DialogueConditionBindingsManifest): void {
    this._manifest = manifest;
  }

  /**
   * Validate and install a raw JSON-parsed payload. Throws on schema
   * violations with the standard Zod error surface.
   */
  public loadRaw(raw: unknown): DialogueConditionBindingsManifest {
    const parsed = DialogueConditionBindingsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /**
   * Hot-reload entry point (called by PIE + editor-driven flows).
   * `null` payload clears the authored list but keeps the provider
   * initialized (distinct from `unload` only by name — both are
   * equivalent internally, preserved as a matched verb for readers).
   */
  public hotReload(manifest: DialogueConditionBindingsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Current authored binding list. Empty when not loaded — safe to
   * iterate unconditionally (SystemLoader does so).
   */
  public getBindings(): readonly DialogueConditionBinding[] {
    return this._manifest?.bindings ?? [];
  }

  /** Raw manifest reference (null when not loaded). Mainly for tests. */
  public getManifest(): DialogueConditionBindingsManifest | null {
    return this._manifest;
  }
}

export { DialogueConditionBindingsProvider };
export const dialogueConditionBindingsProvider =
  DialogueConditionBindingsProvider.getInstance();
