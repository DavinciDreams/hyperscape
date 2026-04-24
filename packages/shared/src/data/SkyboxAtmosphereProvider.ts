/**
 * SkyboxAtmosphereProvider
 *
 * Singleton persistence layer for the authored skybox-
 * atmosphere manifest — sun/moon discs, parametric star field
 * with time-of-day window, up-to-8 cloud layers, Bruneton/
 * Hillaire-style atmospheric scattering (rayleigh/mie/ozone +
 * mieG), horizon/zenith gradient fallback; `activeSkyboxId`
 * selector at manifest root.
 *
 * Refinements: unique skybox ids + activeSkyboxId resolves.
 *
 * No baseline fixture — `skyboxes.min(1)` + required
 * activeSkyboxId make the empty object schema-invalid. Safe
 * default is unloaded.
 *
 * Runtime SkyboxSystem not yet shipped.
 */

import {
  SkyboxAtmosphereManifestSchema,
  type SkyboxAtmosphereManifest,
} from "@hyperforge/manifest-schema";

class SkyboxAtmosphereProvider {
  private static _instance: SkyboxAtmosphereProvider | null = null;
  private _manifest: SkyboxAtmosphereManifest | null = null;

  public static getInstance(): SkyboxAtmosphereProvider {
    if (!SkyboxAtmosphereProvider._instance) {
      SkyboxAtmosphereProvider._instance = new SkyboxAtmosphereProvider();
    }
    return SkyboxAtmosphereProvider._instance;
  }

  public load(manifest: SkyboxAtmosphereManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): SkyboxAtmosphereManifest {
    const parsed = SkyboxAtmosphereManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: SkyboxAtmosphereManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): SkyboxAtmosphereManifest | null {
    return this._manifest;
  }
}

export { SkyboxAtmosphereProvider };
export const skyboxAtmosphereProvider = SkyboxAtmosphereProvider.getInstance();
