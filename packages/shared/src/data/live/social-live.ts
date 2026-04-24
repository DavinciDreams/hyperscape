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
import { SOCIAL_CONSTANTS } from "../../types/game/social-types";

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
