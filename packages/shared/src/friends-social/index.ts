import { FriendsSocialRegistry } from "./FriendsSocialRegistry.js";

export {
  FriendsSocialNotLoadedError,
  FriendsSocialRegistry,
  type EffectiveVisibility,
  type EffectiveVisibilityReason,
  type FriendRequestInput,
  type FriendRequestLifecycle,
  type FriendRequestReason,
  type FriendRequestResult,
} from "./FriendsSocialRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ friendsSocial })` can live-
 * dispatch authored edits to friends/ignore/recent-players/status
 * policy consumed by SocialSystem.
 */
export const friendsSocialRegistry = new FriendsSocialRegistry();
