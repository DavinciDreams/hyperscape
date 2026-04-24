import { AccessibilitySettings } from "./AccessibilitySettings.js";

export {
  AccessibilitySettings,
  type AccessibilityOverrides,
  type ResolvedAccessibility,
} from "./AccessibilitySettings.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ accessibility })` can live-dispatch
 * authored edits to the accessibility policy consumed by the HUD / input
 * assistance / motion-sensitivity systems.
 */
export const accessibilitySettings = new AccessibilitySettings();
