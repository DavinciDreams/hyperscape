/**
 * AgentBridgeSystems
 *
 * Thin SystemBase wrappers that expose the Eliza `AgentManager` singleton and
 * the `getAgentRuntimeByCharacterId` module-level function as world systems,
 * so shared-side code (character-selection.ts, future migrated handlers) can
 * access them via `world.getSystem("agent-manager") as IAgentManager` instead
 * of importing server modules directly.
 *
 * Registered from `startup/world.ts`. The underlying singleton
 * (`globalAgentManager`) is initialized by `initializeAgents()` AFTER world
 * start, so these bridges do lazy lookups on every call.
 *
 * Part of PLAN_SERVERNETWORK_MIGRATION.md Step 5e.
 */

import { SystemBase } from "@hyperforge/shared";
import type { World } from "@hyperforge/shared";
import { getAgentManager } from "../../eliza/AgentManager.js";
import { getAgentRuntimeByCharacterId } from "../../eliza/ModelAgentSpawner.js";
import type {
  IAgentManager,
  IAgentRuntimeLookup,
} from "../../../../shared/src/systems/server/network/interfaces";

export class AgentManagerBridgeSystem
  extends SystemBase
  implements IAgentManager
{
  constructor(world: World) {
    super(world, {
      name: "agent-manager",
      dependencies: { required: [], optional: [] },
      autoCleanup: true,
    });
  }

  async init(): Promise<void> {}
  start(): void {}

  hasAgent(characterId: string): boolean {
    const mgr = getAgentManager();
    return mgr ? mgr.hasAgent(characterId) : false;
  }
}

export class AgentRuntimeLookupBridgeSystem
  extends SystemBase
  implements IAgentRuntimeLookup
{
  constructor(world: World) {
    super(world, {
      name: "agent-runtime-lookup",
      dependencies: { required: [], optional: [] },
      autoCleanup: true,
    });
  }

  async init(): Promise<void> {}
  start(): void {}

  getAgentRuntimeByCharacterId(characterId: string): unknown | null {
    return getAgentRuntimeByCharacterId(characterId);
  }
}
