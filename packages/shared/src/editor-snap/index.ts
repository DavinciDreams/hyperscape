import { EditorSnapRegistry } from "./EditorSnapRegistry.js";

export {
  EditorSnapNotLoadedError,
  EditorSnapRegistry,
  snapToStep,
} from "./EditorSnapRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ editorSnap })` can live-
 * dispatch authored grid/surface/gizmo snap edits to the editor
 * transform pipeline on the next gizmo drag.
 */
export const editorSnapRegistry = new EditorSnapRegistry();
