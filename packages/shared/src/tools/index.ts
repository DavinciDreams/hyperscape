import { ToolsRegistry } from "./ToolsRegistry.js";

export {
  type ToolSkill,
  ToolsNotLoadedError,
  ToolsRegistry,
  UnknownToolError,
} from "./ToolsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ tools })` can live-dispatch
 * authored gathering tool catalogs (hatchets/pickaxes/fishing gear)
 * to gathering systems on the next authority resolve.
 */
export const toolsRegistry = new ToolsRegistry();
