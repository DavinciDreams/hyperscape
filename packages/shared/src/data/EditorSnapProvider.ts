/**
 * EditorSnapProvider
 *
 * Singleton persistence layer for the authored editor-snap manifest
 * — grid/surface snap defaults + gizmo space/pivot/size + global
 * `snapByDefault` toggle. Pure object blob (not an array).
 *
 * Baseline fixture is `{}` — every field has a default.
 *
 * Runtime editor consumes this to seed snap settings at boot.
 */

import {
  EditorSnapManifestSchema,
  type EditorSnapManifest,
} from "@hyperforge/manifest-schema";

class EditorSnapProvider {
  private static _instance: EditorSnapProvider | null = null;
  private _manifest: EditorSnapManifest | null = null;

  public static getInstance(): EditorSnapProvider {
    if (!EditorSnapProvider._instance) {
      EditorSnapProvider._instance = new EditorSnapProvider();
    }
    return EditorSnapProvider._instance;
  }

  public load(manifest: EditorSnapManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): EditorSnapManifest {
    const parsed = EditorSnapManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: EditorSnapManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): EditorSnapManifest | null {
    return this._manifest;
  }
}

export { EditorSnapProvider };
export const editorSnapProvider = EditorSnapProvider.getInstance();
