/**
 * PIE server session integration tests.
 *
 * Drives the full `PIEServerSession` lifecycle against a minimal
 * `createPIEServerWorld` (no procgen, no RPG systems). Asserts that:
 *
 *   - `start()` resolves, registers PIE bridges AND ServerNetwork
 *   - `connect()` returns an in-memory socket pair wired through
 *     `ServerNetwork.onConnection`
 *   - `stop()` tears everything down cleanly
 *
 * RPG system integration (combat/inventory/skills handshake) is covered
 * by higher-tier end-to-end tests that run on the editor's actual PIE
 * entry point.
 *
 * Part of PLAN_SERVERNETWORK_MIGRATION.md Step 9.
 */

import { afterEach, describe, expect, it } from "vitest";

import { PIE_BRIDGE_NAMES } from "../PIEBridgeSystems";
import { PIEServerSession } from "../PIEServerSession";

const LONG_TIMEOUT_MS = 60_000;

describe("PIEServerSession — integration", () => {
  let session: PIEServerSession | null = null;

  afterEach(async () => {
    if (session) {
      await session.stop();
      session = null;
    }
  });

  it(
    "start() boots a minimal PIE world with all bridges and ServerNetwork",
    { timeout: LONG_TIMEOUT_MS },
    async () => {
      session = new PIEServerSession({
        skipRpgSystems: true,
        skipTerrain: true,
        skipEnvironment: true,
      });
      await session.start();

      const world = session.world;
      for (const name of Object.values(PIE_BRIDGE_NAMES)) {
        expect(world.getSystem(name), `missing bridge: ${name}`).toBeTruthy();
      }
      expect(world.getSystem("network")).toBeTruthy();
      expect(session.network).toBe(world.getSystem("network"));
    },
  );

  it(
    "connect() produces a client endpoint wired to ServerNetwork",
    { timeout: LONG_TIMEOUT_MS },
    async () => {
      session = new PIEServerSession({
        skipRpgSystems: true,
        skipTerrain: true,
        skipEnvironment: true,
      });
      await session.start();
      const { client, server } = await session.connect({ name: "pie-smoke" });

      expect(typeof client.send).toBe("function");
      expect(typeof client.on).toBe("function");
      expect(typeof server.send).toBe("function");

      // Client can send without throwing — peer delivery happens on the
      // next microtask regardless of whether ServerNetwork has registered
      // any handlers for this packet type yet.
      expect(() => client.send(new Uint8Array([0, 1, 2]))).not.toThrow();
    },
  );

  it(
    "stop() is idempotent after start()",
    { timeout: LONG_TIMEOUT_MS },
    async () => {
      session = new PIEServerSession({
        skipRpgSystems: true,
        skipTerrain: true,
        skipEnvironment: true,
      });
      await session.start();
      await session.stop();
      // Second stop is a no-op.
      await session.stop();
      session = null;
    },
  );
});
