/**
 * Streaming spectator readiness helpers.
 *
 * Shared across StreamingMode (the full-screen capture page) and
 * EmbeddedGameClient (the embedded spectator viewport). Extracted to collapse
 * two near-duplicate copies of the same lookup and readiness logic into a
 * single source of truth.
 *
 * These helpers intentionally type the entity shape loosely (`EntityCandidate`)
 * because the readiness-relevant fields (`avatar`, `_avatar`,
 * `_fallbackAvatarRoot`, `mesh`) are not part of the public Entity interface.
 */

import type { Entity, World } from "@hyperscape/shared";

type EntityCandidate = {
  id?: string;
  characterId?: string;
  data?: { id?: string; characterId?: string };
  avatar?: unknown;
  _avatar?: unknown;
  _fallbackAvatarRoot?: unknown;
  mesh?: unknown;
};

/**
 * Resolve the entity backing a spectator camera target. Walks the world's
 * direct id index first, then the players collection (matching by id,
 * characterId, data.id, or data.characterId), then the items collection
 * (matching by direct id).
 *
 * NOTE: preserves the exact behavior of StreamingMode.tsx's previous local
 * implementation so the extraction is a pure refactor for that call site.
 * EmbeddedGameClient.tsx previously had a wider items-side match; consolidating
 * on this version temporarily narrows that helper. A follow-up commit widens
 * the items branch and readiness check to the union of both prior behaviors.
 */
export function findStreamingTargetEntity(
  world: World,
  targetEntityId: string,
): Entity | null {
  let entity = (world.entities?.get?.(targetEntityId) ?? null) as Entity | null;

  if (!entity && world.entities?.players) {
    for (const [, player] of world.entities.players) {
      const candidate = player as EntityCandidate;
      if (
        candidate.id === targetEntityId ||
        candidate.characterId === targetEntityId ||
        candidate.data?.id === targetEntityId ||
        candidate.data?.characterId === targetEntityId
      ) {
        entity = player as Entity;
        break;
      }
    }
  }

  if (!entity && world.entities?.items) {
    for (const [, item] of world.entities.items) {
      if ((item as EntityCandidate).id === targetEntityId) {
        entity = item as Entity;
        break;
      }
    }
  }

  return entity;
}

/**
 * Returns true when the spectator camera target has any avatar-backing field
 * populated — a loaded VRM avatar, a second-phase avatar handle, a fallback
 * avatar root, or a mesh.
 *
 * NOTE: this preserves the exact behavior of StreamingMode.tsx's previous
 * local implementation, which inspects only `world.entities.players`. A
 * follow-up commit widens the check to also traverse `world.entities.items`
 * via `findStreamingTargetEntity`.
 */
export function isTargetAvatarReady(
  world: World,
  targetEntityId: string,
): boolean {
  const playerDirect = world.entities?.players?.get?.(targetEntityId) as
    | EntityCandidate
    | undefined;
  if (
    playerDirect?.avatar ||
    playerDirect?._avatar ||
    playerDirect?._fallbackAvatarRoot ||
    playerDirect?.mesh
  ) {
    return true;
  }

  if (world.entities?.players) {
    for (const [, player] of world.entities.players) {
      const candidate = player as EntityCandidate;
      if (
        (candidate.id === targetEntityId ||
          candidate.characterId === targetEntityId) &&
        (candidate.avatar ||
          candidate._avatar ||
          candidate._fallbackAvatarRoot ||
          candidate.mesh)
      ) {
        return true;
      }
    }
  }

  return false;
}
