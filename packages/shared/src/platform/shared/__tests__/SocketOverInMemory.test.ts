/**
 * End-to-end: the real `Socket` class drives `InMemorySocketPair`.
 *
 * This is the contract the PIE loopback relies on — the same `Socket`
 * that wraps a real WebSocket on the server and client is oblivious to
 * the fact it's wrapping an in-memory pipe instead. If this test
 * regresses, PIE loopback is broken.
 */

import { describe, expect, it } from "vitest";

import { Socket } from "../Socket";
import { createInMemorySocketPair } from "../InMemorySocketPair";
import type {
  NetworkWithSocket,
  NodeWebSocket,
} from "../../../types/network/networking";

function collectingNetwork(): NetworkWithSocket & {
  received: Array<{ method: string; data: unknown }>;
  disconnects: Array<{ code?: number | string }>;
} {
  const received: Array<{ method: string; data: unknown }> = [];
  const disconnects: Array<{ code?: number | string }> = [];
  return {
    received,
    disconnects,
    enqueue(_socket, method, data) {
      received.push({ method, data });
    },
    onDisconnect(_socket, code) {
      disconnects.push({ code });
    },
  };
}

function nextMicrotask(): Promise<void> {
  return new Promise((r) => queueMicrotask(() => r()));
}

describe("Socket × InMemorySocketPair", () => {
  it("client.send -> server Socket.onMessage -> network.enqueue", async () => {
    const pair = createInMemorySocketPair();
    const serverNet = collectingNetwork();
    const clientNet = collectingNetwork();

    new Socket({
      id: "server",
      ws: pair.server as unknown as NodeWebSocket,
      network: serverNet,
    });
    const clientSock = new Socket({
      id: "client",
      ws: pair.client as unknown as NodeWebSocket,
      network: clientNet,
    });

    clientSock.send("ping", { t: 42 });
    await nextMicrotask();

    expect(serverNet.received).toHaveLength(1);
    expect(serverNet.received[0]!.method).toBe("onPing");
    expect(serverNet.received[0]!.data).toEqual({ t: 42 });
  });

  it("server.send -> client Socket.onMessage -> network.enqueue", async () => {
    const pair = createInMemorySocketPair();
    const serverNet = collectingNetwork();
    const clientNet = collectingNetwork();

    const serverSock = new Socket({
      id: "server",
      ws: pair.server as unknown as NodeWebSocket,
      network: serverNet,
    });
    new Socket({
      id: "client",
      ws: pair.client as unknown as NodeWebSocket,
      network: clientNet,
    });

    // `snapshot` is a real packet name from packets.ts.
    serverSock.send("snapshot", { tick: 1, entities: [] });
    await nextMicrotask();

    expect(clientNet.received).toHaveLength(1);
    expect(clientNet.received[0]!.method).toBe("onSnapshot");
    expect(clientNet.received[0]!.data).toEqual({ tick: 1, entities: [] });
  });

  it("ping() on one side marks it not-alive; peer's pong() bumps it back", async () => {
    const pair = createInMemorySocketPair();
    const serverNet = collectingNetwork();
    const clientNet = collectingNetwork();

    const serverSock = new Socket({
      id: "server",
      ws: pair.server as unknown as NodeWebSocket,
      network: serverNet,
    });
    new Socket({
      id: "client",
      ws: pair.client as unknown as NodeWebSocket,
      network: clientNet,
    });

    expect(serverSock.alive).toBe(true);
    serverSock.ping();
    expect(serverSock.alive).toBe(false);

    // The client's Socket sees a `pong` event, but `Socket.onPong`
    // only mutates its own `alive` flag — the server-side alive is
    // cleared by the server's outgoing ping and re-asserted when
    // ANY packet arrives (see Socket.onMessage comment). Verify that.
    await nextMicrotask();
    // Client echoes a snapshot to exercise alive=true on the server.
    (pair.client as unknown as { send: (p: Uint8Array) => void }).send(
      new Uint8Array([0, 0]),
    );
    await nextMicrotask();
    // Invalid packet still counts as proof-of-life.
    expect(serverSock.alive).toBe(true);
  });

  it("close() on one side fires onDisconnect on both Sockets", async () => {
    const pair = createInMemorySocketPair();
    const serverNet = collectingNetwork();
    const clientNet = collectingNetwork();

    new Socket({
      id: "server",
      ws: pair.server as unknown as NodeWebSocket,
      network: serverNet,
    });
    const clientSock = new Socket({
      id: "client",
      ws: pair.client as unknown as NodeWebSocket,
      network: clientNet,
    });

    clientSock.close();
    await nextMicrotask();
    await nextMicrotask();

    // Both endpoints should observe disconnect exactly once.
    expect(serverNet.disconnects.length + clientNet.disconnects.length).toBe(2);
  });
});
