/**
 * CrashReporterProvider
 *
 * Singleton persistence layer for the authored crash-reporter
 * manifest — sink registry (http/localFile/syslog/custom) with
 * endpoint-name refs (never real URLs — resolved via
 * deploy-targets), per-sink severity filter + rate limits +
 * sampling + retry, symbolication rules, breadcrumb ring buffer,
 * PII redaction categories, and consent gating. Wraps the
 * `@hyperforge/manifest-schema` `CrashReporterManifestSchema`
 * with null-when-unloaded semantics.
 *
 * Schema enforces `enabled=true requires ≥1 sink`, so a
 * `{enabled: false}` baseline keeps the pipeline inert until
 * live-ops authors a sink. Runtime CrashReporterSystem not yet
 * shipped.
 */

import {
  CrashReporterManifestSchema,
  type CrashReporterManifest,
} from "@hyperforge/manifest-schema";

class CrashReporterProvider {
  private static _instance: CrashReporterProvider | null = null;
  private _manifest: CrashReporterManifest | null = null;

  public static getInstance(): CrashReporterProvider {
    if (!CrashReporterProvider._instance) {
      CrashReporterProvider._instance = new CrashReporterProvider();
    }
    return CrashReporterProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: CrashReporterManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): CrashReporterManifest {
    const parsed = CrashReporterManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: CrashReporterManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): CrashReporterManifest | null {
    return this._manifest;
  }
}

export { CrashReporterProvider };
export const crashReporterProvider = CrashReporterProvider.getInstance();
