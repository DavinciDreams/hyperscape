import { ReplicationManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  ReplicationNotLoadedError,
  ReplicationRegistry,
  UnknownReplicatedComponentError,
  UnknownReplicatedEventError,
} from "../ReplicationRegistry.js";

function manifest() {
  return ReplicationManifestSchema.parse({
    components: [
      {
        component: "Health",
        fields: [
          { name: "current", kind: "int" },
          { name: "max", kind: "int", cadence: "on-change" },
        ],
      },
      {
        component: "Transform",
        fields: [
          { name: "x", kind: "float", bits: 16 },
          { name: "y", kind: "float", bits: 16 },
          { name: "z", kind: "float", bits: 16 },
        ],
      },
    ],
    events: [
      {
        id: "player.attack",
        direction: "client-to-server",
        params: [{ name: "targetId", kind: "string" }],
        rateLimitPerSec: 20,
      },
      {
        id: "world.announce",
        direction: "server-to-all",
        reliability: "reliable-ordered",
      },
    ],
  });
}

describe("ReplicationRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new ReplicationRegistry().manifest).toThrow(
      ReplicationNotLoadedError,
    );
  });

  it("component + field lookups", () => {
    const r = new ReplicationRegistry(manifest());
    expect(r.hasComponent("Health")).toBe(true);
    expect(r.component("Health").fields.length).toBe(2);
    expect(r.field("Health", "max")?.kind).toBe("int");
    expect(r.field("Health", "ghost")).toBeUndefined();
    expect(() => r.component("Ghost")).toThrow(UnknownReplicatedComponentError);
  });

  it("event lookups + direction filter", () => {
    const r = new ReplicationRegistry(manifest());
    expect(r.hasEvent("player.attack")).toBe(true);
    expect(r.event("world.announce").reliability).toBe("reliable-ordered");
    expect(() => r.event("ghost.event")).toThrow(UnknownReplicatedEventError);
    expect(r.eventsByDirection("server-to-all").map((e) => e.id)).toEqual([
      "world.announce",
    ]);
    expect(r.eventsByDirection("client-to-server").map((e) => e.id)).toEqual([
      "player.attack",
    ]);
  });
});

describe("ReplicationRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new ReplicationRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new ReplicationRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new ReplicationRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
