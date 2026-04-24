/**
 * PhysicsConfigProvider
 *
 * Singleton persistence layer for the authored physics-config
 * manifest — PhysX simulation tuning (gravity, fixed-step, solver
 * iterations, CCD policy, sleep thresholds), physics-material
 * registry (friction/restitution/density presets), and the collision-
 * layer matrix (sparse unordered-pair interaction graph). Wraps the
 * `@hyperforge/manifest-schema` `PhysicsConfigManifestSchema` with
 * null-when-unloaded semantics. Enabled=true requires ≥1 collision
 * layer, so a `{enabled: false}` baseline fixture keeps the pipeline
 * inert until author opts in.
 *
 * Runtime PhysicsSystem already exists (PhysX wrapper) — this
 * provider only persists authored *tuning* data for future
 * consumption; wiring the runtime consumer is a separate slice.
 */

import {
  PhysicsConfigManifestSchema,
  type PhysicsConfigManifest,
} from "@hyperforge/manifest-schema";

class PhysicsConfigProvider {
  private static _instance: PhysicsConfigProvider | null = null;
  private _manifest: PhysicsConfigManifest | null = null;

  public static getInstance(): PhysicsConfigProvider {
    if (!PhysicsConfigProvider._instance) {
      PhysicsConfigProvider._instance = new PhysicsConfigProvider();
    }
    return PhysicsConfigProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: PhysicsConfigManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): PhysicsConfigManifest {
    const parsed = PhysicsConfigManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: PhysicsConfigManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): PhysicsConfigManifest | null {
    return this._manifest;
  }
}

export { PhysicsConfigProvider };
export const physicsConfigProvider = PhysicsConfigProvider.getInstance();
