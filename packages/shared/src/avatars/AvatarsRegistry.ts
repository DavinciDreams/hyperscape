/**
 * Avatars registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `avatars.ts`.
 * Pure logic: avatar entry lookup, LOD tier selection by camera
 * distance, URL resolution. Runtime owns the actual VRM load.
 */

import {
  type AvatarEntry,
  type AvatarLodDistances,
  type AvatarsManifest,
  AvatarsManifestSchema,
} from "@hyperforge/manifest-schema";

export class AvatarsNotLoadedError extends Error {
  constructor() {
    super("AvatarsRegistry used before load()");
    this.name = "AvatarsNotLoadedError";
  }
}

export class UnknownAvatarError extends Error {
  readonly avatarId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `avatar "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownAvatarError";
    this.avatarId = id;
    this.availableIds = availableIds;
  }
}

export type AvatarLodTier = 0 | 1 | 2;

export class AvatarsRegistry {
  private _manifest: AvatarsManifest | null = null;
  private _byId = new Map<string, AvatarEntry>();

  constructor(manifest?: AvatarsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: AvatarsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const a of manifest.avatars) this._byId.set(a.id, a);
  }

  loadFromJson(raw: unknown): void {
    this.load(AvatarsManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): AvatarsManifest {
    if (!this._manifest) throw new AvatarsNotLoadedError();
    return this._manifest;
  }

  get lodDistances(): AvatarLodDistances {
    return this.manifest.lodDistances;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): AvatarEntry {
    const a = this._byId.get(id);
    if (!a) {
      throw new UnknownAvatarError(id, Array.from(this._byId.keys()));
    }
    return a;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  /**
   * Pick the LOD tier for a camera distance. Returns 0 for close,
   * 1 for medium, 2 for far; clamped down if the avatar doesn't ship
   * the higher-tier URL.
   */
  pickLodTier(avatarId: string, distanceMeters: number): AvatarLodTier {
    const a = this.get(avatarId);
    const { lod0ToLod1, lod1ToLod2 } = this.manifest.lodDistances;
    let tier: AvatarLodTier = 0;
    if (distanceMeters >= lod0ToLod1) tier = 1;
    if (distanceMeters >= lod1ToLod2) tier = 2;
    if (tier === 2 && a.lod2Url === undefined) tier = 1;
    if (tier === 1 && a.lod1Url === undefined) tier = 0;
    return tier;
  }

  /** URL for an explicit tier; falls back to the best available lower tier. */
  urlForTier(avatarId: string, tier: AvatarLodTier): string {
    const a = this.get(avatarId);
    if (tier === 2 && a.lod2Url !== undefined) return a.lod2Url;
    if ((tier === 2 || tier === 1) && a.lod1Url !== undefined) return a.lod1Url;
    return a.url;
  }

  /** Resolves both the picked tier and its URL for a distance. */
  resolveForDistance(
    avatarId: string,
    distanceMeters: number,
  ): { tier: AvatarLodTier; url: string } {
    const tier = this.pickLodTier(avatarId, distanceMeters);
    return { tier, url: this.urlForTier(avatarId, tier) };
  }
}
