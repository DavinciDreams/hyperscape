/**
 * End-to-end PIE loopback integration test.
 *
 * Wires a real `ClientNetwork` (from `createNodeClientWorld`) to a real
 * `PIEServerSession` (which hosts a real `ServerNetwork`) over the
 * in-memory socket pair. No simulated packet layer, no compat façade —
 * the same protocol the live client speaks.
 *
 * What this proves:
 *   - `ClientNetwork.attachPreconnectedSocket()` brings the client online
 *     without the `wsUrl` auth dance, wiring `onPacket` correctly.
 *   - A real packet sent through `ServerSocket.sendPacket` on the server
 *     side arrives at the client, is decoded by `readPacket`, and lands
 *     on the client's dispatch queue via `enqueue`.
 *   - The reverse direction — `clientNetwork.ws.send(writePacket(...))`
 *     — is received by `ServerNetwork`'s onMessage pipeline (observable
 *     through the server socket's `message` listener).
 *
 * Part of PLAN_SERVERNETWORK_MIGRATION.md Step 9 — last piece before
 * the editor can repoint from `createPlayTestWorld` to the real stack.
 */

import { afterEach, describe, expect, it } from "vitest";

import { createNodeClientWorld } from "../../createNodeClientWorld";
import type { ClientNetwork } from "../../../systems/client/ClientNetwork";
import {
  asClientWebSocket,
  type InMemoryClientSocket,
} from "../../../platform/shared/InMemorySocketPair";
import { writePacket } from "../../../platform/shared/packets";
import { PIEServerSession } from "../PIEServerSession";

const LONG_TIMEOUT_MS = 60_000;

type ServerSocketLite = {
  accountId: string;
  sendPacket: (packet: Uint8Array | ArrayBuffer) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

function getServerSocket(session: PIEServerSession): ServerSocketLite {
  const sockets = (
    session.network as unknown as { sockets: Map<string, ServerSocketLite> }
  ).sockets;
  const [first] = Array.from(sockets.values());
  if (!first) throw new Error("no server socket registered");
  return first;
}

describe("PIE loopback — real ClientNetwork ↔ real ServerNetwork", () => {
  let session: PIEServerSession | null = null;
  let clientWorld: ReturnType<typeof createNodeClientWorld> | null = null;
  let clientAdapter: InMemoryClientSocket | null = null;

  afterEach(async () => {
    // Teardown client first so its close propagates to the server socket
    // before the session stops. Destroy clears the keepalive interval that
    // would otherwise keep vitest's event loop alive.
    if (clientWorld) {
      const network = (clientWorld as unknown as { network: ClientNetwork })
        .network;
      network.destroy();
      clientWorld = null;
    }
    clientAdapter = null;

    if (session) {
      await session.stop();
      session = null;
    }
  });

  it(
    "server → client packet arrives on client queue via real onPacket path",
    { timeout: LONG_TIMEOUT_MS },
    async () => {
      session = new PIEServerSession({
        skipRpgSystems: true,
        skipTerrain: true,
        skipEnvironment: true,
      });
      await session.start();
      const { client } = await session.connect({ characterId: "editor-host" });

      clientWorld = createNodeClientWorld();
      const network = (clientWorld as unknown as { network: ClientNetwork })
        .network;

      clientAdapter = asClientWebSocket(client);
      network.attachPreconnectedSocket(clientAdapter as unknown as WebSocket, {
        lastWsUrl: "pie-loopback://test",
      });

      // The server emits the 'rtt' packet server → client. Send it through
      // the real server-side socket; the InMemory transport will deliver
      // it to the client adapter, which dispatches it to ClientNetwork.onPacket.
      const serverSocket = getServerSocket(session);
      const payload = { ts: 1234, rtt: 42 };
      serverSocket.sendPacket(new Uint8Array(writePacket("rtt", payload)));

      // Peer delivery is microtask-scheduled by InMemorySocketPair.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const queue = (network as unknown as { queue: Array<[string, unknown]> })
        .queue;
      expect(queue.length).toBeGreaterThanOrEqual(1);
      const [method, data] = queue[queue.length - 1]!;
      expect(method).toBe("onRtt");
      expect(data).toEqual(payload);
    },
  );

  it(
    "client → server packet arrives on server socket's message listener",
    { timeout: LONG_TIMEOUT_MS },
    async () => {
      session = new PIEServerSession({
        skipRpgSystems: true,
        skipTerrain: true,
        skipEnvironment: true,
      });
      await session.start();
      const { client } = await session.connect({ characterId: "editor-host" });

      clientWorld = createNodeClientWorld();
      const network = (clientWorld as unknown as { network: ClientNetwork })
        .network;

      clientAdapter = asClientWebSocket(client);
      network.attachPreconnectedSocket(clientAdapter as unknown as WebSocket, {
        lastWsUrl: "pie-loopback://test",
      });

      // Register a raw listener on the server's in-memory socket to observe
      // incoming packets before they hit ServerNetwork's dispatcher.
      const received: Uint8Array[] = [];
      const serverInMemorySocket = (client as { _peer?: unknown })._peer as {
        on: (ev: string, fn: (d: unknown) => void) => void;
      };
      serverInMemorySocket.on("message", (data: unknown) => {
        received.push(new Uint8Array(data as ArrayBuffer));
      });

      // Send keepalive (client → server packet) through the real
      // `ClientNetwork.ws.send` path.
      const ws = (network as unknown as { ws: WebSocket }).ws;
      ws.send(writePacket("keepalive", Date.now()));

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(received.length).toBeGreaterThanOrEqual(1);
      // Bytes are a packed [packetId, data] tuple — non-empty is the contract.
      expect(received[received.length - 1]!.byteLength).toBeGreaterThan(0);
    },
  );
});
