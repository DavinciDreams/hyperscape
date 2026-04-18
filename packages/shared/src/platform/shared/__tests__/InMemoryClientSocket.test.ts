/**
 * InMemoryClientSocket — DOM `WebSocket`-compatible adapter over
 * `InMemorySocket`, used by PIE to feed the real `ClientNetwork`
 * (`attachPreconnectedSocket`) without a live TCP WS.
 *
 * These tests cover the contract `ClientNetwork.attachPreconnectedSocket`
 * relies on: `readyState`, `binaryType`, `addEventListener` shape,
 * `MessageEvent`-shaped dispatches, `CloseEvent`-shaped close delivery,
 * and bidirectional `send`/`close` semantics.
 */

import { describe, expect, it } from "vitest";
import {
  asClientWebSocket,
  createInMemorySocketPair,
  InMemoryClientSocket,
} from "../InMemorySocketPair";

function nextMicrotask(): Promise<void> {
  return new Promise((r) => queueMicrotask(() => r()));
}

describe("InMemoryClientSocket", () => {
  it("reports WebSocket.OPEN readyState on construction", () => {
    const pair = createInMemorySocketPair();
    const client = asClientWebSocket(pair.client);
    expect(client.readyState).toBe(1);
    expect(client.binaryType).toBe("arraybuffer");
  });

  it("receives `message` events with `{ data }` shape from the peer", async () => {
    const pair = createInMemorySocketPair();
    const client = asClientWebSocket(pair.client);

    const received: Uint8Array[] = [];
    client.addEventListener("message", (e: { data: unknown }) => {
      received.push(new Uint8Array(e.data as ArrayBuffer));
    });

    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    pair.server.send(payload);
    await nextMicrotask();

    expect(received).toHaveLength(1);
    expect(Array.from(received[0]!)).toEqual([1, 2, 3, 4, 5]);
  });

  it("client.send routes to the server's `message` listener", async () => {
    const pair = createInMemorySocketPair();
    const client = asClientWebSocket(pair.client);

    const received: Uint8Array[] = [];
    pair.server.on("message", (data: unknown) => {
      received.push(new Uint8Array(data as ArrayBuffer));
    });

    client.send(new Uint8Array([7, 7, 7]));
    await nextMicrotask();

    expect(received).toHaveLength(1);
    expect(Array.from(received[0]!)).toEqual([7, 7, 7]);
  });

  it("removeEventListener prevents further delivery", async () => {
    const pair = createInMemorySocketPair();
    const client = asClientWebSocket(pair.client);

    let hits = 0;
    const listener = () => {
      hits++;
    };
    client.addEventListener("message", listener);

    pair.server.send(new Uint8Array([1]));
    await nextMicrotask();
    expect(hits).toBe(1);

    client.removeEventListener("message", listener);
    pair.server.send(new Uint8Array([2]));
    await nextMicrotask();
    expect(hits).toBe(1);
  });

  it("peer close transitions readyState → CLOSED and fires close event", async () => {
    const pair = createInMemorySocketPair();
    const client = asClientWebSocket(pair.client);

    const closeEvents: { code: number }[] = [];
    client.addEventListener("close", (e: { code: number }) => {
      closeEvents.push(e);
    });

    pair.server.close();
    // Close is delivered on the microtask queue.
    for (let i = 0; i < 3; i++) await nextMicrotask();

    expect(closeEvents).toHaveLength(1);
    expect(closeEvents[0]!.code).toBe(1000);
    expect(client.readyState).toBe(3);
  });

  it("client.close() closes both ends", async () => {
    const pair = createInMemorySocketPair();
    const client = asClientWebSocket(pair.client);

    let serverClosed = false;
    pair.server.on("close", () => {
      serverClosed = true;
    });

    client.close();
    expect(client.readyState).toBe(2);
    for (let i = 0; i < 3; i++) await nextMicrotask();
    expect(serverClosed).toBe(true);
    expect(client.readyState).toBe(3);
  });

  it("close is idempotent", () => {
    const pair = createInMemorySocketPair();
    const client = asClientWebSocket(pair.client);
    client.close();
    expect(() => client.close()).not.toThrow();
  });

  it("innerSocket escape hatch exposes the underlying InMemorySocket", () => {
    const pair = createInMemorySocketPair();
    const client = new InMemoryClientSocket(pair.client);
    expect(client.innerSocket).toBe(pair.client);
  });
});
