import { MountRegistry } from "./MountRegistry.js";

export {
  MountRegistry,
  UnknownMountError,
  type CanSummonReason,
  type CanSummonResult,
  type MountGait,
  type MountSummonContext,
  type StaminaTickInput,
} from "./MountRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `worldAreasRegistry`, and `audioBusMixer` patterns so
 * `PIEEditorSession.updateManifests({ mounts })` can
 * live-dispatch authored edits to a shared, id-indexed view of
 * the mount catalog — even before the mount/travel runtime
 * reads through it directly. Stateless wrt runtime state
 * (stamina lives per-summon); `load()` just re-indexes mounts.
 */
export const mountRegistry = new MountRegistry();
