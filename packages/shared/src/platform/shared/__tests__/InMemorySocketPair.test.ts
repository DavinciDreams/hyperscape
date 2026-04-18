/**
 * InMemorySocketPair — duplex in-memory WS-compatible transport.
 *
 * Covers the NodeWebSocket surface the Socket class consumes:
 * `on`/`removeListener` for "message"/"pong"/"close", plus `send`,
 * `ping`, `close`, `terminate`. These guarantees let the real `Socket`
 * class drive the in-memory pair with no awareness that ws isn't real.
 */

import { describe, expect, it, vi } from "vitest";
import { writePacket, readPacket } from "../packets";
import {
  InMemorySocket,
  createInMemorySocketPair,
} from "../InMemorySocketPair";

function nextMicrotask(): Promise<void> {
  return new Promise((r) => queueMicrotask(() => r()));
}

describe("InMemorySocketPair", () => {
  it("send(packet) on one side delivers `message` on the peer", async () => {
    const pair = createInMemorySocketPair();
    const received: unknown[] = [];
    pair.server.on("message", (data: unknown) => received.push(data));

    const packet = new Uint8Array([1, 2, 3, 4]);
    pair.client.send(packet);

    await nextMicrotask();
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(packet);
  });

  it("bidirectional — server → client also works", async () => {
    const pair = createInMemorySocketPair();
    const received: unknown[] = [];
    pair.client.on("message", (data: unknown) => received.push(data));

    const packet = new Uint8Array([9, 9, 9]);
    pair.server.send(packet);
    await nextMicrotask();
    expect(received[0]).toBe(packet);
  });

  it("real packet roundtrip — writePacket → send → readPacket", async () => {
    const pair = createInMemorySocketPair();
    const received: [string, unknown] | null = null as unknown as
      | [string, unknown]
      | null;
    const got: Array<[string, unknown]> = [];
    pair.server.on("message", (data: unknown) => {
      const r = readPacket(data as ArrayBuffer | Uint8Array);
      if (r && r.length === 2) got.push([r[0]!, r[1]]);
    });

    const packet = writePacket("ping", { t: 123 });
    pair.client.send(packet);
    await nextMicrotask();
    expect(got).toHaveLength(1);
    // readPacket returns the handler method name ("on"+PascalCase).
    expect(got[0]![0]).toBe("onPing");
    expect(got[0]![1]).toEqual({ t: 123 });
    expect(received).toBeNull();
  });

  it("ping() on one side fires `pong` on the peer", async () => {
    const pair = createInMemorySocketPair();
    const pongs: unknown[] = [];
    pair.client.on("pong", () => pongs.push(true));

    pair.server.ping();
    await nextMicrotask();
    expect(pongs).toHaveLength(1);
  });

  it("close() delivers `close` on both sides with code 1000", async () => {
    const pair = createInMemorySocketPair();
    const events: Array<{ side: string; code: unknown }> = [];
    pair.server.on("close", (e: unknown) =>
      events.push({ side: "server", code: (e as { code?: number }).code }),
    );
    pair.client.on("close", (e: unknown) =>
      events.push({ side: "client", code: (e as { code?: number }).code }),
    );

    pair.client.close();
    // close schedules via queueMicrotask; await multiple microtasks to
    // drain both sides' dispatch.
    await nextMicrotask();
    await nextMicrotask();

    expect(events).toHaveLength(2);
    expect(events.every((e) => e.code === 1000)).toBe(true);
  });

  it("terminate() delivers `close` on both sides with code 1006", async () => {
    const pair = createInMemorySocketPair();
    const codes: unknown[] = [];
    pair.server.on("close", (e: unknown) =>
      codes.push((e as { code?: number }).code),
    );
    pair.client.on("close", (e: unknown) =>
      codes.push((e as { code?: number }).code),
    );
    pair.server.terminate();
    await nextMicrotask();
    await nextMicrotask();
    expect(codes.filter((c) => c === 1006)).toHaveLength(2);
  });

  it("sends after close are silently dropped", async () => {
    const pair = createInMemorySocketPair();
    const received: unknown[] = [];
    pair.server.on("message", (d: unknown) => received.push(d));
    pair.client.close();
    await nextMicrotask();
    pair.client.send(new Uint8Array([1]));
    await nextMicrotask();
    expect(received).toHaveLength(0);
  });

  it("removeListener detaches exactly the passed function", async () => {
    const pair = createInMemorySocketPair();
    const a = vi.fn();
    const b = vi.fn();
    pair.server.on("message", a);
    pair.server.on("message", b);
    pair.server.removeListener("message", a);
    pair.client.send(new Uint8Array([42]));
    await nextMicrotask();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("latencyMs delays delivery by at least that duration", async () => {
    const pair = createInMemorySocketPair({ latencyMs: 25 });
    const received: number[] = [];
    pair.server.on("message", () => received.push(performance.now()));

    const sentAt = performance.now();
    pair.client.send(new Uint8Array([1]));
    // Not yet delivered
    await nextMicrotask();
    expect(received).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 40));
    expect(received).toHaveLength(1);
    expect(received[0]! - sentAt).toBeGreaterThanOrEqual(20);
  });

  it("handler added during dispatch still gets the next packet, not the current one", async () => {
    const pair = createInMemorySocketPair();
    const calls: string[] = [];
    const late = () => calls.push("late");
    pair.server.on("message", () => {
      calls.push("first");
      pair.server.on("message", late);
    });
    pair.client.send(new Uint8Array([1]));
    await nextMicrotask();
    expect(calls).toEqual(["first"]);
    pair.client.send(new Uint8Array([2]));
    await nextMicrotask();
    expect(calls).toEqual(["first", "first", "late"]);
  });

  it("exposes InMemorySocket type for external callers", () => {
    const pair = createInMemorySocketPair();
    expect(pair.server).toBeInstanceOf(InMemorySocket);
    expect(pair.client).toBeInstanceOf(InMemorySocket);
  });
});
