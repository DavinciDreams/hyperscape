import { PushNotificationsRegistry } from "./PushNotificationsRegistry.js";

export {
  PushNotificationsNotLoadedError,
  PushNotificationsRegistry,
  UnknownPushCategoryError,
  UnknownPushChannelError,
} from "./PushNotificationsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ pushNotifications })` can live-
 * dispatch authored edits to channel/category/quiet-hours policy
 * consumed by PushNotificationsSystem.
 */
export const pushNotificationsRegistry = new PushNotificationsRegistry();
