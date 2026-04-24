/**
 * TutorialFlowsProvider
 *
 * Singleton persistence layer for the authored tutorial-flows
 * manifest — declarative onboarding graphs (flow → steps → triggers +
 * anchors + next/skip pointers) with prerequisite DAG. Wraps the
 * `@hyperforge/manifest-schema` `TutorialFlowsManifestSchema` with
 * array-shape + safe-empty-default semantics. `getFlows()` always
 * returns an array (possibly empty) so consumers can iterate without
 * branching on isLoaded().
 *
 * Runtime TutorialSystem is not yet shipped — this provider only
 * persists authored data for future consumption.
 */

import {
  TutorialFlowsManifestSchema,
  type TutorialFlowsManifest,
} from "@hyperforge/manifest-schema";

class TutorialFlowsProvider {
  private static _instance: TutorialFlowsProvider | null = null;
  private _manifest: TutorialFlowsManifest | null = null;

  public static getInstance(): TutorialFlowsProvider {
    if (!TutorialFlowsProvider._instance) {
      TutorialFlowsProvider._instance = new TutorialFlowsProvider();
    }
    return TutorialFlowsProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: TutorialFlowsManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): TutorialFlowsManifest {
    const parsed = TutorialFlowsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: TutorialFlowsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /** Safe-empty default: returns `[]` when no authored flows are loaded. */
  public getFlows(): TutorialFlowsManifest {
    return this._manifest ?? [];
  }

  public getManifest(): TutorialFlowsManifest | null {
    return this._manifest;
  }
}

export { TutorialFlowsProvider };
export const tutorialFlowsProvider = TutorialFlowsProvider.getInstance();
