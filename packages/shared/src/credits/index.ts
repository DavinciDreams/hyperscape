import { CreditsRegistry } from "./CreditsRegistry.js";

export {
  CreditsNotLoadedError,
  CreditsRegistry,
  UnknownCreditSectionError,
} from "./CreditsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ credits })` can live-dispatch
 * authored credit-roll edits to the end-game / main-menu credits
 * screen on the next render.
 */
export const creditsRegistry = new CreditsRegistry();
