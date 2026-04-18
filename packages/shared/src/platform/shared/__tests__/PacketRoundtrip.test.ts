/**
 * Every-packet-type roundtrip contract.
 *
 * Phase 3 of the engine/game separation plan requires that the in-memory
 * PIE transport be *indistinguishable* from a real WebSocket connection
 * at the packet level. The way we prove it: walk the single source of
 * truth (`PACKET_NAMES`) and assert each one survives a full round
 * trip through `InMemorySocketPair`.
 *
 * Why this test is load-bearing: msgpackr is strict about what it can
 * encode, and packet payloads evolve. If anyone adds a packet name
 * without a matching `on<PascalCase>` dispatch slot, or swaps the pack
 * format, this test turns red before PIE regressions reach a user.
 *
 * Payload: a single synthetic object `{ marker, n }`. The specific
 * shape doesn't matter — we're testing the transport + name mapping,
 * not each packet's schema (which is owned by the server/client
 * handlers).
 */

import { describe, expect, it } from "vitest";

import { createInMemorySocketPair } from "../InMemorySocketPair";
import { PACKET_NAMES, readPacket, writePacket } from "../packets";

function nextMicrotask(): Promise<void> {
  return new Promise((r) => queueMicrotask(() => r()));
}

function pascalCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

describe("PacketRoundtrip — every registered packet survives the in-memory pair", () => {
  it("PACKET_NAMES is non-empty (sanity)", () => {
    expect(PACKET_NAMES.length).toBeGreaterThan(10);
  });

  it("every packet name roundtrips client → server with its handler method", async () => {
    const pair = createInMemorySocketPair();
    const received: Array<[string, unknown]> = [];
    pair.server.on("message", (data: unknown) => {
      const r = readPacket(data as ArrayBuffer | Uint8Array);
      if (r.length === 2) received.push([r[0]!, r[1]]);
    });

    // Send every packet with a unique synthetic marker so we can match
    // the ordering and payloads on the far side.
    for (let i = 0; i < PACKET_NAMES.length; i++) {
      const name = PACKET_NAMES[i]!;
      const payload = { marker: name, n: i };
      pair.client.send(writePacket(name, payload));
    }
    await nextMicrotask();

    expect(received).toHaveLength(PACKET_NAMES.length);
    for (let i = 0; i < PACKET_NAMES.length; i++) {
      const name = PACKET_NAMES[i]!;
      const [method, data] = received[i]!;
      expect(method).toBe(`on${pascalCase(name)}`);
      expect(data).toEqual({ marker: name, n: i });
    }
  });

  it("every packet name roundtrips server → client as well (symmetric)", async () => {
    const pair = createInMemorySocketPair();
    const received: Array<[string, unknown]> = [];
    pair.client.on("message", (data: unknown) => {
      const r = readPacket(data as ArrayBuffer | Uint8Array);
      if (r.length === 2) received.push([r[0]!, r[1]]);
    });

    for (let i = 0; i < PACKET_NAMES.length; i++) {
      const name = PACKET_NAMES[i]!;
      pair.server.send(writePacket(name, { marker: name, n: i }));
    }
    await nextMicrotask();

    expect(received).toHaveLength(PACKET_NAMES.length);
    for (let i = 0; i < PACKET_NAMES.length; i++) {
      expect(received[i]![0]).toBe(`on${pascalCase(PACKET_NAMES[i]!)}`);
    }
  });

  it("complex payload shapes (nested objects, arrays, numbers) roundtrip via msgpackr", async () => {
    // Spot-check with structures that match real packet shapes
    // (entityAdd/snapshot style payloads).
    const pair = createInMemorySocketPair();
    const got: unknown[] = [];
    pair.server.on("message", (data: unknown) => {
      const r = readPacket(data as ArrayBuffer | Uint8Array);
      if (r.length === 2) got.push(r[1]);
    });

    // Use a name that's guaranteed to be in the registry.
    const name = PACKET_NAMES[0]!;
    const complex = {
      tick: 42,
      entities: [
        { id: "a", pos: [1.5, 2.5, 3.5], hp: 100 },
        { id: "b", pos: [0, 0, 0], hp: null as number | null, tags: ["x"] },
      ],
      meta: { flag: true, text: "ünicode 🎮" },
    };
    pair.client.send(writePacket(name, complex));
    await nextMicrotask();

    expect(got).toHaveLength(1);
    expect(got[0]).toEqual(complex);
  });
});
