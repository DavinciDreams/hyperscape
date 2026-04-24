/**
 * InputActionsProvider
 *
 * Singleton persistence layer for the authored input-actions
 * manifest — author-side default bindings (complement to runtime
 * per-player `useUserInputBindings` in UI Pack U10).
 *
 * Refinement: unique input-action ids across the array.
 *
 * Baseline fixture is an empty array `[]`.
 *
 * Consumed at boot to seed the default binding table; runtime
 * overrides come from the UserInputBindings store.
 */

import {
  InputActionsManifestSchema,
  type InputActionsManifest,
} from "@hyperforge/manifest-schema";

class InputActionsProvider {
  private static _instance: InputActionsProvider | null = null;
  private _manifest: InputActionsManifest | null = null;

  public static getInstance(): InputActionsProvider {
    if (!InputActionsProvider._instance) {
      InputActionsProvider._instance = new InputActionsProvider();
    }
    return InputActionsProvider._instance;
  }

  public load(manifest: InputActionsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): InputActionsManifest {
    const parsed = InputActionsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: InputActionsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): InputActionsManifest | null {
    return this._manifest;
  }
}

export { InputActionsProvider };
export const inputActionsProvider = InputActionsProvider.getInstance();
