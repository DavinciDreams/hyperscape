/**
 * DeployTargetsProvider
 *
 * Singleton persistence layer for the authored deploy-targets
 * manifest — registry of named endpoints referenced by other
 * manifests (crash-reporter, push-notifications, screenshot).
 * Carries only secret *names* + *sources*, never real values —
 * safe to commit.
 *
 * Refinement: unique target ids across the array.
 *
 * Baseline fixture is an empty array `[]`.
 *
 * Runtime secret resolution reads from deployment env / secret
 * manager, never from this manifest.
 */

import {
  DeployTargetsManifestSchema,
  type DeployTargetsManifest,
} from "@hyperforge/manifest-schema";

class DeployTargetsProvider {
  private static _instance: DeployTargetsProvider | null = null;
  private _manifest: DeployTargetsManifest | null = null;

  public static getInstance(): DeployTargetsProvider {
    if (!DeployTargetsProvider._instance) {
      DeployTargetsProvider._instance = new DeployTargetsProvider();
    }
    return DeployTargetsProvider._instance;
  }

  public load(manifest: DeployTargetsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): DeployTargetsManifest {
    const parsed = DeployTargetsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: DeployTargetsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): DeployTargetsManifest | null {
    return this._manifest;
  }
}

export { DeployTargetsProvider };
export const deployTargetsProvider = DeployTargetsProvider.getInstance();
