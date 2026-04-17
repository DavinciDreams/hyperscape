/**
 * initializeModuleLayers — Creates empty state arrays for a GameModule's entity types.
 *
 * For Hyperia, produces identical shape to EMPTY_EXTENDED_LAYERS / EMPTY_AUDIO_LAYERS.
 * For custom modules, creates additional arrays for any state keys not already present.
 */

import type { GameModule } from "../GameModule";
import type {
  ExtendedWorldLayers,
  AudioLayers,
} from "../../components/WorldStudio/types";
import {
  EMPTY_EXTENDED_LAYERS,
  EMPTY_AUDIO_LAYERS,
} from "../../components/WorldStudio/types";

interface InitializedLayers {
  extendedLayers: ExtendedWorldLayers;
  audioLayers: AudioLayers;
}

/**
 * Create initial empty layer state for a game module.
 * Starts from EMPTY_EXTENDED_LAYERS/EMPTY_AUDIO_LAYERS and adds
 * empty arrays for any storage keys defined in the module's entity types.
 */
export function initializeModuleLayers(module: GameModule): InitializedLayers {
  const extendedLayers = { ...EMPTY_EXTENDED_LAYERS };
  const audioLayers = { ...EMPTY_AUDIO_LAYERS };

  for (const entityType of module.entityTypes) {
    const { stateKey, stateRoot, type } = entityType.storage;
    const target = stateRoot === "audioLayers" ? audioLayers : extendedLayers;

    // Only initialize if the key doesn't already exist
    if (!(stateKey in target)) {
      (target as Record<string, unknown>)[stateKey] =
        type === "array" ? [] : null;
    }
  }

  return { extendedLayers, audioLayers };
}
