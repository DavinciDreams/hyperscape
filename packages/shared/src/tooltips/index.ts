import { TooltipRegistry } from "./TooltipRegistry.js";

export {
  TooltipRegistry,
  UnknownTooltipError,
  type ResolveTooltipContext,
  type ResolvedTooltip,
} from "./TooltipRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ tooltips })` can live-dispatch
 * authored tooltip-template edits to the HUD on the next hover.
 */
export const tooltipRegistry = new TooltipRegistry();
