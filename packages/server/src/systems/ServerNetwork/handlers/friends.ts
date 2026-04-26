/**
 * @deprecated Re-export shim.
 *
 * Handler relocated to `@hyperforge/hyperscape`
 * (Phase F3 batch-8 of PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26).
 * Plugin onEnable installs `world.friendsService` so engine-side
 * shared code (`character-selection.ts`, `socket-management.ts`)
 * can call `sendFriendsListSync` and `notifyFriendsOfStatusChange`
 * via the `IFriendsService` substrate interface.
 */

export {
  handleFriendRequest,
  handleFriendAccept,
  handleFriendDecline,
  handleFriendRemove,
  handleIgnoreAdd,
  handleIgnoreRemove,
  handlePrivateMessage,
  sendFriendsListSync,
  notifyFriendsOfStatusChange,
} from "@hyperforge/hyperscape";
