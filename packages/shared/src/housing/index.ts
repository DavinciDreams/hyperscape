import { HousingRegistry } from "./HousingRegistry.js";

export {
  HousingNotLoadedError,
  HousingRegistry,
  UnknownPlotTypeError,
  type PurchaseInput,
  type PurchaseReason,
  type PurchaseResult,
  type UpkeepPhase,
  type UpkeepPhaseResult,
} from "./HousingRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ housing })` can live-dispatch
 * authored edits to plot-type/customization/permission/upkeep policy
 * consumed by HousingSystem.
 */
export const housingRegistry = new HousingRegistry();
