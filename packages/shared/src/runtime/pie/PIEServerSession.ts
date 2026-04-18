/**
 * PIE (Play-In-Editor) server session.
 *
 * Stands up a real `createServerWorld()` + `ServerNetwork` in-process,
 * backed by the in-memory bridge stubs (`InMemoryStubs`) wrapped as
 * `SystemBase` adapters (`PIEBridgeSystems`). Client connections are
 * established via `InMemorySocketPair` — no TCP, no HTTP upgrade, no
 * WebSocket server.
 *
 * This replaces `createPlayTestWorld.ts` + `PIENetworkStub`: instead of a
 * simulated network with hand-rolled broadcast fan-out, PIE now runs the
 * same `ServerNetwork` code path as the real game server.
 *
 * Lifecycle:
 *   1. `start()` — build world, register bridges + ServerNetwork, init.
 *   2. `connect(params)` — create a socket pair; hand the server end to
 *      `ServerNetwork.onConnection`, return the client end for the caller
 *      to plug into `ClientNetwork.init`.
 *   3. `tick(delta)` — drive world simulation (caller owns the loop).
 *   4. `stop()` — destroy world, close all sockets.
 *
 * Part of PLAN_SERVERNETWORK_MIGRATION.md Step 9.
 */

import { createPIEServerWorld } from "./createPIEServerWorld";
import type { World } from "../../core/World";
import type { ServerNetwork } from "../../systems/server/network/index";
import type {
  ConnectionParams,
  NodeWebSocket,
} from "../../systems/server/network/server-types";
import {
  createInMemorySocketPair,
  InMemorySocket,
} from "../../platform/shared/InMemorySocketPair";
import { registerPIEBridges } from "./PIEBridgeSystems";
import { createPIEStubSystemDatabase } from "./InMemoryStubs";
import type { SystemDatabase } from "../../types/network/database";

export interface PIEServerSessionOptions {
  /** Per-packet latency injected into every InMemorySocketPair. */
  latencyMs?: number;
  /** Optional world init overrides forwarded to `world.init`. */
  worldInit?: Parameters<World["init"]>[0];
  /**
   * Skip RPG system registration (combat/inventory/skills/mobs/...). Used by
   * smoke tests that only need the network wiring. Defaults to `false` —
   * real PIE sessions want the full gameplay stack.
   */
  skipRpgSystems?: boolean;
  /** Skip TerrainSystem (requires DataManager BIOMES to be loaded). */
  skipTerrain?: boolean;
  /** Skip Environment (lighting/shadow registration). */
  skipEnvironment?: boolean;
}

export interface PIEConnectResult {
  /**
   * Client-side socket — hand to `ClientNetwork.init({ ws: clientSocket, ... })`
   * or equivalent client bootstrap code.
   */
  client: InMemorySocket;
  /** Server-side endpoint (already wired to `ServerNetwork.onConnection`). */
  server: InMemorySocket;
}

export class PIEServerSession {
  private _world: World | null = null;
  private _network: ServerNetwork | null = null;
  private _started = false;
  private readonly _opts: PIEServerSessionOptions;

  constructor(opts: PIEServerSessionOptions = {}) {
    this._opts = opts;
  }

  /** Underlying world (null until `start()` resolves). */
  get world(): World {
    if (!this._world) {
      throw new Error(
        "PIEServerSession: world not initialized — call start() first",
      );
    }
    return this._world;
  }

  /** Authoritative ServerNetwork system (null until `start()` resolves). */
  get network(): ServerNetwork {
    if (!this._network) {
      throw new Error(
        "PIEServerSession: network not initialized — call start() first",
      );
    }
    return this._network;
  }

  /**
   * Build world, register PIE bridges + ServerNetwork, initialize.
   * Imports ServerNetwork lazily to avoid pulling it into bundles that
   * only want `createServerWorld`.
   */
  async start(): Promise<void> {
    if (this._started) return;
    const world = await createPIEServerWorld({
      includeRpgSystems: !this._opts.skipRpgSystems,
      includeTerrain: !this._opts.skipTerrain,
      includeEnvironment: !this._opts.skipEnvironment,
    });

    // Register PIE bridges BEFORE ServerNetwork so its constructor can
    // reach them via `world.getSystem(...)` during registration.
    registerPIEBridges(world);

    // Lazy import keeps the ServerNetwork graph out of callers that only
    // wanted `createServerWorld`.
    const { ServerNetwork } =
      await import("../../systems/server/network/index");
    world.register("network", ServerNetwork);

    // ServerNetwork.init() asserts `options.db` is a SystemDatabase (knex-
    // like function). The PIE stub below satisfies the type guard and
    // returns empty results for every query; InitializationManager
    // hydrateEntities/loadSettings both tolerate empty data.
    const worldInit = { ...(this._opts.worldInit ?? {}) } as Record<
      string,
      unknown
    >;
    if (!worldInit.db) {
      worldInit.db = createPIEStubSystemDatabase() as unknown as SystemDatabase;
    }
    await world.init(worldInit as Parameters<World["init"]>[0]);

    this._world = world;
    this._network = world.getSystem("network") as ServerNetwork;
    this._started = true;
  }

  /**
   * Create an in-memory socket pair, route the server end through
   * `ServerNetwork.onConnection`, and return the client end to the caller.
   */
  async connect(params: ConnectionParams = {}): Promise<PIEConnectResult> {
    const network = this.network;
    const pair = createInMemorySocketPair({ latencyMs: this._opts.latencyMs });

    // `InMemorySocket` implements the `NodeWebSocket` surface
    // (`on | removeListener | send | ping | close | terminate`) that the
    // real `Socket` class in `platform/shared/Socket.ts` consumes. The
    // cast is safe — it's the contract both endpoints share.
    await network.onConnection(pair.server as unknown as NodeWebSocket, params);

    return { client: pair.client, server: pair.server };
  }

  /**
   * Drive simulation. PIE callers typically drive this from a rAF loop on
   * the editor side. `timeMs` is an absolute timestamp in milliseconds
   * (e.g., `performance.now()`); World.tick converts it to a per-frame
   * delta internally.
   */
  tick(timeMs: number): void {
    if (!this._world) return;
    this._world.tick(timeMs);
  }

  /** Destroy the world and release resources. */
  async stop(): Promise<void> {
    if (!this._started) return;
    const world = this._world;
    this._started = false;
    this._world = null;
    this._network = null;
    if (
      world &&
      typeof (world as unknown as { destroy?: () => void }).destroy ===
        "function"
    ) {
      (world as unknown as { destroy: () => void }).destroy();
    }
  }
}
