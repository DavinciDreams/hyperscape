import { ReplicationManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
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
