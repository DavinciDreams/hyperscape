/**
 * social-live.ts
 *
 * Provider-first live-getters for the authored friends/social manifest
 * fields that may change at runtime through PIE hot-reload. Reads
 * through the module-level `friendsSocialProvider` singleton and falls
 * back to the boot-frozen `SOCIAL_CONSTANTS` values when the provider
 * is unloaded.
 */

import { friendsSocialProvider } from "../FriendsSocialProvider";

// SOCIAL_CONSTANTS inlined here 2026-04-27 (top-10 #8 cleanup) so
// social-types could migrate to @hyperforge/hyperscape-plugin. These
// values are only used as fallbacks when the provider's manifest is
// not yet loaded; the real game-tunable values come from the
// FriendsSocialManifest (authored content).
const SOCIAL_CONSTANTS = {
  MAX_FRIENDS: 99,
  MAX_IGNORE: 99,
  REQUEST_TIMEOUT_MS: 7 * 24 * 60 * 60 * 1000,
  PRIVATE_MESSAGE_MAX_LENGTH: 200,
  MAX_OPERATIONS_PER_MINUTE: 30,
} as const;

/** Maximum number of friends per player (RS-classic default = 99). */
export function getMaxFriends(): number {
  return (
    friendsSocialProvider.getManifest()?.friends.maxFriends ??
    SOCIAL_CONSTANTS.MAX_FRIENDS
  );
}

/** Maximum number of ignored players per player (RS-classic default = 99). */
export function getMaxIgnore(): number {
  return (
    friendsSocialProvider.getManifest()?.ignore.maxIgnored ??
    SOCIAL_CONSTANTS.MAX_IGNORE
  );
}

/** Maximum length of a private message (characters). */
export function getPrivateMessageMaxLength(): number {
  return (
    friendsSocialProvider.getManifest()?.privateMessageMaxLength ??
    SOCIAL_CONSTANTS.PRIVATE_MESSAGE_MAX_LENGTH
  );
}
