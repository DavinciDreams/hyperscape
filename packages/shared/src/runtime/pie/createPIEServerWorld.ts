/**
 * createPIEServerWorld — lightweight server world for Play-In-Editor.
 *
 * `createServerWorld()` registers heavy procgen systems (TownSystem,
 * POISystem, ProceduralDocks, BridgeSystem, ServerLiveKit, ServerBot)
 * that perform authoritative terrain generation and fail-fast pathfinding
 * validation on `start()`. Those systems are appropriate for the live
 * Hyperscape server but wrong for PIE:
 *
 *   - The editor supplies its own world content (the WorldProject being
 *     edited); it does NOT want procgen towns/POIs/roads.
 *   - TownSystem's `validateBuildingPathfinding` aborts startup on any
 *     unreachable building — the editor's WIP maps will trip this
 *     constantly.
 *   - Voice (LiveKit) and dev bots are irrelevant in the editor.
 *
 * This factory registers only the systems needed for the core
 * client↔server network loop (ServerRuntime, ServerLoader, TerrainSystem)
 * plus the full RPG gameplay stack via `registerSystems`. ServerNetwork
 * itself is still registered by `PIEServerSession.start()` after PIE
 * bridges are installed, matching the server-package layering.
 *
 * Part of PLAN_SERVERNETWORK_MIGRATION.md Step 9.
 */

import { World } from "../../core/World";
import { ServerRuntime } from "../../systems/server/ServerRuntime";
import { ServerMonitor } from "../../systems/server/ServerMonitor";
import { Environment } from "../../systems/shared";
import { ServerLoader } from "../../systems/server/ServerLoader";
import { TerrainSystem } from "../../systems/shared";
import { registerSystems } from "../../systems/shared";

export interface PIEServerWorldOptions {
  /**
   * Opt-in to the full RPG system stack (combat, inventory, skills,
   * mobs, etc.). Defaults to `true` — real PIE sessions want gameplay.
   * Set `false` for bare-bones wiring tests.
   */
  includeRpgSystems?: boolean;
  /**
   * Register `TerrainSystem`. Default `true`. Terrain's `start()` requires
   * `DataManager` to have loaded the BIOMES dataset — callers that don't
   * initialize the data manager should pass `false`.
   */
  includeTerrain?: boolean;
  /**
   * Register `Environment`. Default `true`. Provides lighting context; can
   * be skipped for headless wiring tests.
   */
  includeEnvironment?: boolean;
}

/**
 * Creates a PIE-scoped server World.
 *
 * Registered systems:
 *   - `server` (ServerRuntime) — lifecycle
 *   - `loader` (ServerLoader) — asset loading
 *   - `environment` (Environment) — lighting context used by visual systems
 *   - `monitor` (ServerMonitor) — perf diagnostics
 *   - `terrain` (TerrainSystem) — heightmap (editor may replace)
 *   - RPG systems (if `includeRpgSystems !== false`)
 *
 * Explicitly NOT registered:
 *   - TownSystem, POISystem, RoadNetworkSystem, ProceduralDocks,
 *     BridgeSystem (procgen — editor provides content)
 *   - ServerLiveKit (no voice in PIE)
 *   - ServerBot (no dev bots in PIE)
 *   - ServerNetwork (installed by PIEServerSession after bridges)
 */
export async function createPIEServerWorld(
  options: PIEServerWorldOptions = {},
): Promise<World> {
  const {
    includeRpgSystems = true,
    includeTerrain = true,
    includeEnvironment = true,
  } = options;
  const world = new World();

  world.register("server", ServerRuntime);
  world.register("loader", ServerLoader);
  world.register("monitor", ServerMonitor);

  if (includeEnvironment) {
    world.register("environment", Environment);
  }
  if (includeTerrain) {
    world.register("terrain", TerrainSystem);
  }
  if (includeRpgSystems) {
    await registerSystems(world);
  }

  return world;
}
