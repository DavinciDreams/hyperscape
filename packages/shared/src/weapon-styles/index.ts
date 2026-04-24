import { WeaponStylesRegistry } from "./WeaponStylesRegistry.js";

export {
  UnknownWeaponTypeError,
  WeaponStylesNotLoadedError,
  WeaponStylesRegistry,
} from "./WeaponStylesRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ weaponStyles })` can live-
 * dispatch authored weapon→style whitelist edits to combat on the
 * next style-pick prompt.
 */
export const weaponStylesRegistry = new WeaponStylesRegistry();
