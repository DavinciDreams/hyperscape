import { XPCurveRegistry } from "./XPCurveRegistry.js";

export {
  XPCurveRegistry,
  UnknownXpCurveError,
  InvalidXpLevelError,
  type XpToNextResult,
} from "./XPCurveRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `npcScheduleRegistry`, and `worldAreasRegistry` patterns so
 * `PIEEditorSession.updateManifests({ xpCurves })` can live-dispatch
 * authored edits to a shared, id-indexed view of the xp-curves
 * catalog — even before the progression system reads through it
 * directly. When `StatsSystem` / level-up handlers land a read
 * through this registry, they import `xpCurveRegistry` and resolve
 * xp-to-level through the same instance the editor is writing to.
 */
export const xpCurveRegistry = new XPCurveRegistry();
