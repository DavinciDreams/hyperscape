/**
 * InteractionPromptsProvider
 *
 * Singleton persistence layer for the authored interaction-prompts
 * manifest — "Press [E] to open chest", "Hold [F] to loot", etc.
 * Feeds the Apr-20 runtime `InteractionPromptSelector` +
 * `InteractionPromptRegistry` on world construction.
 *
 * Array-shaped manifest with safe empty semantics: `getPrompts()`
 * returns `[]` when unloaded so the registry has nothing to show
 * and the HUD silently skips the prompt layer.
 */

import {
  InteractionPromptsManifestSchema,
  type InteractionPromptsManifest,
} from "@hyperforge/manifest-schema";

class InteractionPromptsProvider {
  private static _instance: InteractionPromptsProvider | null = null;
  private _manifest: InteractionPromptsManifest | null = null;

  public static getInstance(): InteractionPromptsProvider {
    if (!InteractionPromptsProvider._instance) {
      InteractionPromptsProvider._instance = new InteractionPromptsProvider();
    }
    return InteractionPromptsProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: InteractionPromptsManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): InteractionPromptsManifest {
    const parsed = InteractionPromptsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: InteractionPromptsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /** Prompt list, or `[]` when unloaded. */
  public getPrompts(): InteractionPromptsManifest {
    return this._manifest ?? [];
  }

  public getManifest(): InteractionPromptsManifest | null {
    return this._manifest;
  }
}

export { InteractionPromptsProvider };
export const interactionPromptsProvider =
  InteractionPromptsProvider.getInstance();
