/**
 * DialogueProvider
 *
 * Single-source-of-truth holder for the authored `DialogueManifest`.
 * Mirrors `LootTablesProvider` / `CombatTuningProvider` /
 * `DialogueConditionBindingsProvider` — an instanced singleton that
 * `DataManager` populates at boot and `PIEEditorSession.updateManifests`
 * tees into on hot-reload.
 *
 * Consumers:
 * - `SystemLoader`: after `systems.dialogue` is resolved, calls
 *   `dialogueSystem.setAuthoredDialogues(provider.getManifest())` once
 *   so authored trees are live before the first interaction.
 * - `PIEEditorSession`: writes through on
 *   `updateManifests({ dialogue })` so subsequent server restarts start
 *   from the same manifest the editor is viewing. Live dispatch to the
 *   running `DialogueSystem` still happens in the same branch.
 *
 * Kept independent of `NpcDialogueBindingsProvider` so the dialogue
 * library and the NPC→tree pointers can be edited, hot-reloaded, and
 * versioned separately — editing one tree shouldn't force a full
 * re-walk of all binding rows.
 */

import {
  DialogueManifestSchema,
  type DialogueManifest,
} from "@hyperforge/manifest-schema";

class DialogueProvider {
  private static _instance: DialogueProvider | null = null;
  private _manifest: DialogueManifest | null = null;

  public static getInstance(): DialogueProvider {
    if (!DialogueProvider._instance) {
      DialogueProvider._instance = new DialogueProvider();
    }
    return DialogueProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: DialogueManifest): void {
    this._manifest = manifest;
  }

  /**
   * Validate and install a raw JSON-parsed payload. Throws on schema
   * violations; prior state untouched.
   */
  public loadRaw(raw: unknown): DialogueManifest {
    const parsed = DialogueManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: DialogueManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Current authored dialogue library. Empty readonly array when not
   * loaded — safe to iterate unconditionally.
   */
  public getTrees(): DialogueManifest {
    return this._manifest ?? [];
  }

  /** Raw manifest reference (null when not loaded). Mainly for tests. */
  public getManifest(): DialogueManifest | null {
    return this._manifest;
  }
}

export { DialogueProvider };
export const dialogueProvider = DialogueProvider.getInstance();
