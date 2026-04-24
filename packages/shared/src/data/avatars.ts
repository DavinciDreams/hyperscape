/**
 * Avatar Definitions — manifest façade.
 *
 * Runtime data (avatars and LOD distances) is loaded from
 * `avatars.json`, validated by `AvatarsManifestSchema` from
 * `@hyperforge/manifest-schema` at module load time. The exported
 * shape (AvatarOption interface, AvatarLOD enum, AVATAR_LOD_DISTANCES,
 * AVATAR_OPTIONS, helpers) is preserved unchanged for consumers.
 *
 * Extracted as part of Phase A11 of
 * `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 *
 * ## LOD System
 * - LOD0 (url): 30K triangles - close range gameplay
 * - LOD1 (lod1Url): 10K triangles - medium distance
 * - LOD2 (lod2Url): 2K triangles - far distance / impostor base
 */

import { AvatarsManifestSchema } from "@hyperforge/manifest-schema";

import avatarsManifestJson from "./avatars.json" with { type: "json" };

export interface AvatarOption {
  id: string;
  name: string;
  /** LOD0 URL - Full detail (30K triangles) */
  url: string;
  /** LOD1 URL - Medium detail (10K triangles) */
  lod1Url?: string;
  /** LOD2 URL - Low detail (2K triangles) */
  lod2Url?: string;
  /** Path portion for character preview (prepend CDN URL) */
  previewPath: string;
  description?: string;
}

/** LOD level enum for avatar selection */
export enum AvatarLOD {
  /** Full detail - 30K triangles (close range) */
  LOD0 = 0,
  /** Medium detail - 10K triangles (medium distance) */
  LOD1 = 1,
  /** Low detail - 2K triangles (far distance) */
  LOD2 = 2,
}

const manifest = AvatarsManifestSchema.parse(avatarsManifestJson);

/** Distance thresholds for LOD switching (in meters) */
export const AVATAR_LOD_DISTANCES = Object.freeze({
  /** Distance at which to switch from LOD0 to LOD1 */
  LOD0_TO_LOD1: manifest.lodDistances.lod0ToLod1,
  /** Distance at which to switch from LOD1 to LOD2 */
  LOD1_TO_LOD2: manifest.lodDistances.lod1ToLod2,
} as const);

/**
 * Available avatar models — derived from manifest.
 *
 * - `url`: LOD0 (30K triangles) - Uses asset:// protocol resolved by ClientLoader
 * - `lod1Url`: LOD1 (10K triangles) - Medium distance
 * - `lod2Url`: LOD2 (2K triangles) - Far distance
 * - `previewPath`: Path portion for CharacterPreview component (CDN URL prepended at runtime)
 */
export const AVATAR_OPTIONS: AvatarOption[] = manifest.avatars.map((entry) => {
  const option: AvatarOption = {
    id: entry.id,
    name: entry.name,
    url: entry.url,
    previewPath: entry.previewPath,
  };
  if (entry.lod1Url !== undefined) option.lod1Url = entry.lod1Url;
  if (entry.lod2Url !== undefined) option.lod2Url = entry.lod2Url;
  if (entry.description !== undefined) option.description = entry.description;
  return Object.freeze(option);
});

/**
 * Get avatar by ID
 */
export function getAvatarById(id: string): AvatarOption | undefined {
  return AVATAR_OPTIONS.find((avatar) => avatar.id === id);
}

/**
 * Get avatar by URL (checks url, lod1Url, lod2Url, and previewPath)
 */
export function getAvatarByUrl(url: string): AvatarOption | undefined {
  return AVATAR_OPTIONS.find(
    (avatar) =>
      avatar.url === url ||
      avatar.lod1Url === url ||
      avatar.lod2Url === url ||
      url.endsWith(avatar.previewPath),
  );
}

/**
 * Get the appropriate LOD level based on distance
 * @param distance Distance from camera in meters
 * @returns LOD level (0, 1, or 2)
 */
export function getAvatarLODForDistance(distance: number): AvatarLOD {
  if (distance >= AVATAR_LOD_DISTANCES.LOD1_TO_LOD2) {
    return AvatarLOD.LOD2;
  }
  if (distance >= AVATAR_LOD_DISTANCES.LOD0_TO_LOD1) {
    return AvatarLOD.LOD1;
  }
  return AvatarLOD.LOD0;
}

/**
 * Get the URL for a specific LOD level of an avatar
 * Falls back to higher detail LOD if requested LOD is not available
 *
 * @param avatar The avatar option
 * @param lod The desired LOD level
 * @returns The URL for the requested LOD (or fallback)
 */
export function getAvatarUrlForLOD(
  avatar: AvatarOption,
  lod: AvatarLOD,
): string {
  switch (lod) {
    case AvatarLOD.LOD2:
      return avatar.lod2Url ?? avatar.lod1Url ?? avatar.url;
    case AvatarLOD.LOD1:
      return avatar.lod1Url ?? avatar.url;
    case AvatarLOD.LOD0:
    default:
      return avatar.url;
  }
}

/**
 * Get all LOD URLs for an avatar (for preloading)
 * @param avatar The avatar option
 * @returns Array of all available LOD URLs
 */
export function getAllAvatarLODUrls(avatar: AvatarOption): string[] {
  const urls = [avatar.url];
  if (avatar.lod1Url) urls.push(avatar.lod1Url);
  if (avatar.lod2Url) urls.push(avatar.lod2Url);
  return urls;
}
