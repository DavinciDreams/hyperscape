/**
 * KeyPromptIconsProvider
 *
 * Singleton persistence layer for the authored key-prompt-icons
 * manifest — 7-device input-glyph catalog (keyboard/mouse/
 * xbox/playstation/switch/generic/touch), per-glyph render
 * dimensions, device-family theme metadata.
 *
 * Refinements: at most one family entry per device kind +
 * unique (deviceKind, inputCode) pair across glyphs.
 *
 * Baseline `{"enabled": false}` keeps the pipeline inert until
 * glyphs are authored.
 *
 * Runtime KeyPromptIconsSystem not yet shipped.
 */

import {
  KeyPromptIconsManifestSchema,
  type KeyPromptIconsManifest,
} from "@hyperforge/manifest-schema";

class KeyPromptIconsProvider {
  private static _instance: KeyPromptIconsProvider | null = null;
  private _manifest: KeyPromptIconsManifest | null = null;

  public static getInstance(): KeyPromptIconsProvider {
    if (!KeyPromptIconsProvider._instance) {
      KeyPromptIconsProvider._instance = new KeyPromptIconsProvider();
    }
    return KeyPromptIconsProvider._instance;
  }

  public load(manifest: KeyPromptIconsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): KeyPromptIconsManifest {
    const parsed = KeyPromptIconsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: KeyPromptIconsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): KeyPromptIconsManifest | null {
    return this._manifest;
  }
}

export { KeyPromptIconsProvider };
export const keyPromptIconsProvider = KeyPromptIconsProvider.getInstance();
