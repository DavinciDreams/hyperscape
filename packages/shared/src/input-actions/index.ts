import { InputActionsRegistry } from "./InputActionsRegistry.js";

export {
  type InputScheme,
  InputActionsNotLoadedError,
  InputActionsRegistry,
  UnknownInputActionError,
} from "./InputActionsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ inputActions })` can live-
 * dispatch authored author-side default-binding edits to the input
 * pipeline on the next rebind-panel open or binding resolve.
 */
export const inputActionsRegistry = new InputActionsRegistry();
