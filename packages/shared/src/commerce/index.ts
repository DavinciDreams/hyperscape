import { CommerceRegistry } from "./CommerceRegistry.js";

export {
  CommerceNotLoadedError,
  CommerceRegistry,
} from "./CommerceRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ commerce })` can live-dispatch
 * authored commerce policy (general-store config, currency balance
 * rules) to vendor UI / shop resolvers on the next lookup.
 */
export const commerceRegistry = new CommerceRegistry();
