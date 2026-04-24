export {
  GatheringResourcesRegistry,
  type HarvestSkill,
  UnknownResourceError,
} from "./GatheringResourcesRegistry.js";

import { GatheringResourcesRegistry } from "./GatheringResourcesRegistry.js";

/**
 * Process-wide singleton. `DataManager` writes to it at load time;
 * other systems read from it. Exists alongside the legacy
 * `globalThis.EXTERNAL_RESOURCES` map during the wiring migration.
 */
export const gatheringResources = new GatheringResourcesRegistry();
