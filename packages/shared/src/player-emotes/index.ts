import { PlayerEmotesRegistry } from "./PlayerEmotesRegistry.js";

export {
  PlayerEmotesNotLoadedError,
  PlayerEmotesRegistry,
  UnknownEmoteError,
} from "./PlayerEmotesRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ playerEmotes })` can live-
 * dispatch authored edits to the emote catalog consumed by
 * EmoteSystem / player-animation runtime.
 */
export const playerEmotesRegistry = new PlayerEmotesRegistry();
