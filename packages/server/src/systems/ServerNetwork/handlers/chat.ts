/**
 * @deprecated Re-export shim.
 *
 * `handleChatAdded` relocated to `@hyperforge/hyperscape`
 * (Phase F3 of PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26).
 *
 * Handler registration is now owned by plugin onEnable via
 * `world.connectionRegistry.register("onChatAdded", ...)`. This shim
 * exists for any direct importers that bypass the registry; both
 * paths reach the same function.
 */

export { handleChatAdded } from "@hyperforge/hyperscape";
