import { InteractionPromptRegistry } from "./InteractionPromptSelector.js";

export {
  InteractionPromptRegistry,
  InteractionPromptController,
  UnknownInteractionPromptError,
  type InteractionContext,
  type PromptChangeEvent,
} from "./InteractionPromptSelector.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `npcScheduleRegistry`, and `worldAreasRegistry` patterns so
 * `PIEEditorSession.updateManifests({ interactionPrompts })` can
 * live-dispatch authored edits to a shared, id-indexed view of the
 * interaction-prompt catalog — even before HUD controllers read
 * through it directly.
 */
export const interactionPromptRegistry = new InteractionPromptRegistry();
