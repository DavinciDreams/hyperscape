/**
 * FriendsSocialProvider
 *
 * Singleton persistence layer for the authored friends/social
 * manifest — single policy blob with 4 rule groups: friends
 * (max 1..1000, perCharacter/perAccount/perRealm scope,
 * cross-faction/cross-realm toggles, request-expire, offline-
 * messages, per-friend notes), ignore (max, expire-days,
 * blocksAllInteractions, transparent vs silent), recent-
 * players (max-entries + retention + record-party/finder/pvp
 * filters), online-status (4 visibility modes, broadcast
 * offline/online edges, zone + last-seen).
 *
 * Refinements enforce friends.scope == ignore.scope and
 * defaultVisibility='invisible' requires allowPlayerOverride.
 *
 * Runtime SocialSystem not yet shipped.
 */

import {
  FriendsSocialManifestSchema,
  type FriendsSocialManifest,
} from "@hyperforge/manifest-schema";

class FriendsSocialProvider {
  private static _instance: FriendsSocialProvider | null = null;
  private _manifest: FriendsSocialManifest | null = null;

  public static getInstance(): FriendsSocialProvider {
    if (!FriendsSocialProvider._instance) {
      FriendsSocialProvider._instance = new FriendsSocialProvider();
    }
    return FriendsSocialProvider._instance;
  }

  public load(manifest: FriendsSocialManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): FriendsSocialManifest {
    const parsed = FriendsSocialManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: FriendsSocialManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): FriendsSocialManifest | null {
    return this._manifest;
  }
}

export { FriendsSocialProvider };
export const friendsSocialProvider = FriendsSocialProvider.getInstance();
