import { EquipmentManifestRegistry } from "./EquipmentManifestRegistry.js";

export {
  EquipmentManifestNotLoadedError,
  EquipmentManifestRegistry,
  UnknownBankEquipmentErrorKey,
  UnknownEquipmentSlotError,
} from "./EquipmentManifestRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ equipment })` can live-dispatch
 * authored edits to the equipment slot + bank equipment UI + error-
 * message catalog consumed by inventory/equip/bank UIs on the next
 * render.
 */
export const equipmentManifestRegistry = new EquipmentManifestRegistry();
