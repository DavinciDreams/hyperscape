import { AnimationRegistry } from "./AnimationRegistry.js";

export {
  AnimationRegistry,
  MissingBindingError,
  UnknownAnimationClipError,
  type AnimationIntegrityIssue,
  type ResolvedAnimation,
} from "./AnimationRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `npcScheduleRegistry`, and `worldAreasRegistry` patterns so
 * `PIEEditorSession.updateManifests({ animations })` can
 * live-dispatch authored edits to a shared, id-indexed view of the
 * animation-clip catalog — even before AnimationSystem reads
 * through it directly.
 */
export const animationRegistry = new AnimationRegistry();
