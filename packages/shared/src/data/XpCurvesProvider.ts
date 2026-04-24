/**
 * XpCurvesProvider
 *
 * Singleton persistence layer for the authored XP-curves manifest.
 * Mirrors the `CombatTuningProvider` / `LootTablesProvider` pattern:
 * the provider owns a validated `XpCurvesManifest` and the consumer
 * (`xpCurveRegistry` in `../progression/`) rebuilds its in-memory
 * indices from `getManifest()` whenever the authored data changes.
 *
 * Kept separate from the registry so (a) Zod schema validation runs
 * at the edge (JSON-in) rather than inside the registry, (b) the
 * provider stays dependency-free, and (c) the registry can be
 * instantiated per-scope (e.g., per-world) without fighting the
 * singleton.
 */

import {
  XpCurvesManifestSchema,
  type XpCurvesManifest,
} from "@hyperforge/manifest-schema";

class XpCurvesProvider {
  private static _instance: XpCurvesProvider | null = null;
  private _manifest: XpCurvesManifest | null = null;

  public static getInstance(): XpCurvesProvider {
    if (!XpCurvesProvider._instance) {
      XpCurvesProvider._instance = new XpCurvesProvider();
    }
    return XpCurvesProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: XpCurvesManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): XpCurvesManifest {
    const parsed = XpCurvesManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: XpCurvesManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Current authored manifest. Empty array when not loaded — safe to
   * iterate unconditionally.
   */
  public getCurves(): XpCurvesManifest {
    return this._manifest ?? [];
  }

  /** Raw manifest reference (null when not loaded). Mainly for tests. */
  public getManifest(): XpCurvesManifest | null {
    return this._manifest;
  }
}

export { XpCurvesProvider };
export const xpCurvesProvider = XpCurvesProvider.getInstance();
