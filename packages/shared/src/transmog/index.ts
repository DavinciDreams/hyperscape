import { TransmogRegistry } from "./TransmogRegistry.js";

export {
  TransmogNotLoadedError,
  TransmogRegistry,
  UnknownTransmogSourceError,
  type ApplyCheckReason,
  type ApplyCheckResult,
  type ApplyContext,
} from "./TransmogRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ transmog })` can live-dispatch
 * authored appearance sources + unlock policy to the equipment render
 * layer on the next authority resolve.
 */
export const transmogRegistry = new TransmogRegistry();
