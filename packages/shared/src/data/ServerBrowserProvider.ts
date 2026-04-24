/**
 * ServerBrowserProvider
 *
 * Singleton persistence layer for the authored server-browser
 * manifest — manual server list filters, columns, sort policy, and
 * direct-connect / password-protected-server toggles.
 *
 * Baseline `{}` acceptable — all fields have defaults and the empty
 * `filters`/`columns` arrays satisfy unique-id refinements trivially.
 * Runtime falls back to the built-in server-browser defaults when
 * provider is unloaded.
 */

import {
  ServerBrowserManifestSchema,
  type ServerBrowserManifest,
} from "@hyperforge/manifest-schema";

class ServerBrowserProvider {
  private static _instance: ServerBrowserProvider | null = null;
  private _manifest: ServerBrowserManifest | null = null;

  public static getInstance(): ServerBrowserProvider {
    if (!ServerBrowserProvider._instance) {
      ServerBrowserProvider._instance = new ServerBrowserProvider();
    }
    return ServerBrowserProvider._instance;
  }

  public load(manifest: ServerBrowserManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): ServerBrowserManifest {
    const parsed = ServerBrowserManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: ServerBrowserManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): ServerBrowserManifest | null {
    return this._manifest;
  }
}

export { ServerBrowserProvider };
export const serverBrowserProvider = ServerBrowserProvider.getInstance();
