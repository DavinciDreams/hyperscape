/**
 * AnalyticsEventsProvider
 *
 * Singleton persistence layer for the authored analytics event
 * catalog — event names, property shapes (snake_case keys with
 * string/number/integer/boolean/timestamp/enum kinds), cardinality
 * hints, PII-safety markers, and per-event sampling rates.
 *
 * The runtime analytics bridge (future consumer) will validate
 * emitted events against the manifest before forwarding to sinks.
 */

import {
  AnalyticsEventManifestSchema,
  type AnalyticsEventManifest,
} from "@hyperforge/manifest-schema";

class AnalyticsEventsProvider {
  private static _instance: AnalyticsEventsProvider | null = null;
  private _manifest: AnalyticsEventManifest | null = null;

  public static getInstance(): AnalyticsEventsProvider {
    if (!AnalyticsEventsProvider._instance) {
      AnalyticsEventsProvider._instance = new AnalyticsEventsProvider();
    }
    return AnalyticsEventsProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: AnalyticsEventManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): AnalyticsEventManifest {
    const parsed = AnalyticsEventManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: AnalyticsEventManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /** Events array, or `[]` when unloaded. */
  public getEvents(): AnalyticsEventManifest {
    return this._manifest ?? [];
  }

  public getManifest(): AnalyticsEventManifest | null {
    return this._manifest;
  }
}

export { AnalyticsEventsProvider };
export const analyticsEventsProvider = AnalyticsEventsProvider.getInstance();
