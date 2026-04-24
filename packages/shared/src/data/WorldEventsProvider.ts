/**
 * WorldEventsProvider
 *
 * Singleton persistence layer for the authored world-events
 * manifest — FATE/public-event/world-boss registry with
 * 7-category (invasion/boss/gather/escort/defense/puzzle/
 * holiday), 5-kind trigger discriminated union (schedule/
 * random/chain/proximity/manual), linear phase chain with
 * nextOnSuccess/nextOnFailure (empty = end), participation-tier
 * bracket with strictly-unique minContribution refinement.
 *
 * Manifest-level refinements: unique event ids + chain
 * sourceEventId resolves + startPhaseId resolves + all-phase-
 * refs-resolve.
 *
 * Array-shape manifest — empty `[]` baseline keeps the
 * pipeline inert until events are authored.
 *
 * Runtime WorldEventSystem not yet shipped.
 */

import {
  WorldEventsManifestSchema,
  type WorldEventsManifest,
} from "@hyperforge/manifest-schema";

class WorldEventsProvider {
  private static _instance: WorldEventsProvider | null = null;
  private _manifest: WorldEventsManifest | null = null;

  public static getInstance(): WorldEventsProvider {
    if (!WorldEventsProvider._instance) {
      WorldEventsProvider._instance = new WorldEventsProvider();
    }
    return WorldEventsProvider._instance;
  }

  public load(manifest: WorldEventsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): WorldEventsManifest {
    const parsed = WorldEventsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: WorldEventsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): WorldEventsManifest | null {
    return this._manifest;
  }
}

export { WorldEventsProvider };
export const worldEventsProvider = WorldEventsProvider.getInstance();
