/**
 * @deprecated Re-export shim.
 *
 * Handler + manager relocated to `@hyperforge/hyperscape`
 * (Phase F3 batch-7 of PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26).
 * Plugin onEnable installs `world.homeTeleportFactory`;
 * ServerNetwork.start() calls it after the spawn point loads
 * and pins `world.homeTeleportManager`.
 */

export {
  HomeTeleportManager,
  createHomeTeleportFactory,
  formatCooldownRemaining,
  handleHomeTeleport,
  handleHomeTeleportCancel,
} from "@hyperforge/hyperscape";
