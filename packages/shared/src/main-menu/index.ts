import { MainMenuRegistry } from "./MainMenuRegistry.js";

export {
  MainMenuNotLoadedError,
  MainMenuRegistry,
  UnknownMenuScreenError,
  type MenuViewerContext,
} from "./MainMenuRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ mainMenu })` can live-dispatch
 * authored menu-tree edits to the pre-game / pause menu on the next
 * render.
 */
export const mainMenuRegistry = new MainMenuRegistry();
