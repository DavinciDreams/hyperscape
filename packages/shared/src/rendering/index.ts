import { RenderProfileRegistry } from "./RenderProfileRegistry.js";
import { PostProcessVolumeCompositor } from "./PostProcessVolumeCompositor.js";

export {
  RenderProfileRegistry,
  UnknownRenderProfileError,
} from "./RenderProfileRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `npcScheduleRegistry`, `xpCurveRegistry`, and `worldAreasRegistry`
 * patterns so `PIEEditorSession.updateManifests({ renderProfiles })`
 * can live-dispatch authored edits to a shared, id-indexed view of the
 * render-profiles catalog — even before the Hyperscape renderer reads
 * through it directly. When the renderer lands a read through this
 * registry, it imports `renderProfileRegistry` and resolves the active
 * look through the same instance the editor is writing to.
 */
export const renderProfileRegistry = new RenderProfileRegistry();

export {
  PostProcessVolumeCompositor,
  type Vec3,
  type ActiveVolume,
} from "./PostProcessVolumeCompositor.js";

/**
 * Module-level singleton for post-process volume composition. Mirrors
 * the `renderProfileRegistry` pattern so
 * `PIEEditorSession.updateManifests({ postProcessVolumes })` can
 * live-dispatch authored edits to the active compositor and downstream
 * renderer code resolves current volume state through the same instance.
 */
export const postProcessVolumeCompositor = new PostProcessVolumeCompositor();
