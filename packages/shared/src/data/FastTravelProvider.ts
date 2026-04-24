/**
 * FastTravelProvider
 *
 * Singleton persistence layer for the authored fast-travel
 * manifest — WoW-flight-master-style travel graph. 7-kind
 * node enum (flightMaster/portalStone/hearthBindPoint/
 * wormhole/teleportAnchor/mountBoard/custom) + 5-kind edge
 * enum (flightAnimated/instantTeleport/fadedCutscene/
 * loadingScreen/vehicleControlled) with bidirectional or
 * oneWayForward direction, 5-gate unlock (visit/quest/
 * achievement/level/reputation), and global rules
 * (blockedInCombat/pvpFlagged/instanced, globalCooldown,
 * channelTime + cancelOnDamage, maxHearthBindings).
 *
 * Schema enforces unique node/edge ids + endpoint resolves
 * + no self-loop + no duplicate (from,to,direction) +
 * flightAnimated|vehicleControlled requires pathAssetRef +
 * custom-kind requires customKey + channelTime>0 ⇔
 * cancelOnDamage. No `enabled` field — empty-graph `{}` is
 * valid safe default. Runtime FastTravelSystem not yet
 * shipped.
 */

import {
  FastTravelManifestSchema,
  type FastTravelManifest,
} from "@hyperforge/manifest-schema";

class FastTravelProvider {
  private static _instance: FastTravelProvider | null = null;
  private _manifest: FastTravelManifest | null = null;

  public static getInstance(): FastTravelProvider {
    if (!FastTravelProvider._instance) {
      FastTravelProvider._instance = new FastTravelProvider();
    }
    return FastTravelProvider._instance;
  }

  public load(manifest: FastTravelManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): FastTravelManifest {
    const parsed = FastTravelManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: FastTravelManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): FastTravelManifest | null {
    return this._manifest;
  }
}

export { FastTravelProvider };
export const fastTravelProvider = FastTravelProvider.getInstance();
