/**
 * NpcScheduleProvider
 *
 * Singleton persistence layer for the authored NPC schedule
 * manifest — time-of-day activity slots (idle/walk-to/work-at/
 * sleep/patrol/socialize/custom) with day-of-week masks and
 * waypoint/patrol-path anchors. Feeds the Apr-20 runtime
 * `NPCScheduleDriver` + `NpcScheduleRegistry` on world
 * construction.
 *
 * Array-shaped manifest with safe empty semantics: `getSchedules()`
 * returns `[]` when unloaded so the registry has no entries to
 * index and NPCs fall back to their own behavior logic.
 */

import {
  NpcScheduleManifestSchema,
  type NpcScheduleManifest,
} from "@hyperforge/manifest-schema";

class NpcScheduleProvider {
  private static _instance: NpcScheduleProvider | null = null;
  private _manifest: NpcScheduleManifest | null = null;

  public static getInstance(): NpcScheduleProvider {
    if (!NpcScheduleProvider._instance) {
      NpcScheduleProvider._instance = new NpcScheduleProvider();
    }
    return NpcScheduleProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: NpcScheduleManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): NpcScheduleManifest {
    const parsed = NpcScheduleManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: NpcScheduleManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /** Schedule list, or `[]` when unloaded. */
  public getSchedules(): NpcScheduleManifest {
    return this._manifest ?? [];
  }

  public getManifest(): NpcScheduleManifest | null {
    return this._manifest;
  }
}

export { NpcScheduleProvider };
export const npcScheduleProvider = NpcScheduleProvider.getInstance();
