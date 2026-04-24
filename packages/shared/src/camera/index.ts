import { CameraProfileRegistry } from "./CameraProfileRegistry.js";

export {
  CameraProfileRegistry,
  UnknownCameraProfileError,
} from "./CameraProfileRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `npcScheduleRegistry`, and `worldAreasRegistry` patterns so
 * `PIEEditorSession.updateManifests({ cameraProfiles })` can
 * live-dispatch authored edits to a shared, id-indexed view of the
 * camera profile catalog — even before the camera component reads
 * through it directly.
 */
export const cameraProfileRegistry = new CameraProfileRegistry();
