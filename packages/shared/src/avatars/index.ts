import { AvatarsRegistry } from "./AvatarsRegistry.js";

export {
  type AvatarLodTier,
  AvatarsNotLoadedError,
  AvatarsRegistry,
  UnknownAvatarError,
} from "./AvatarsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ avatars })` can live-dispatch
 * authored edits to the avatar catalog consumed by avatar-loading
 * code on the next `.get(id)` / `.resolveForDistance(id, d)` lookup.
 */
export const avatarsRegistry = new AvatarsRegistry();
