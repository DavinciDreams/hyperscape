/**
 * Faithfulness + defensiveness tests for `ReplicationManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  ReplicationManifestSchema,
  type ReplicationManifest,
} from "./replication.js";

const reference: ReplicationManifest = {
  components: [
    {
      component: "Transform",
      description: "Entity position + rotation",
      fields: [
        {
          name: "position",
          kind: "vec3",
          authority: "server",
          cadence: "interval",
          intervalMs: 50,
          bits: 0,
          relevancyFiltered: true,
          description: "world position in meters",
        },
        {
          name: "rotation",
          kind: "quaternion",
          authority: "server",
          cadence: "on-change",
          intervalMs: 100,
          bits: 16,
          relevancyFiltered: true,
          description: "orientation quaternion",
        },
      ],
    },
    {
      component: "Health",
      description: "HP + max HP",
      fields: [
        {
          name: "current",
          kind: "int",
          authority: "server",
          cadence: "on-change",
          intervalMs: 100,
          bits: 0,
          relevancyFiltered: false,
          description: "current HP",
        },
        {
          name: "max",
          kind: "int",
          authority: "server",
          cadence: "reliable-once",
          intervalMs: 100,
          bits: 0,
          relevancyFiltered: false,
          description: "max HP",
        },
      ],
    },
  ],
  events: [
    {
      id: "combat.damage_dealt",
      direction: "server-to-relevant",
      reliability: "reliable-ordered",
      params: [
        { name: "attackerId", kind: "entity-ref", required: true },
        { name: "targetId", kind: "entity-ref", required: true },
        { name: "amount", kind: "int", required: true },
      ],
      rateLimitPerSec: 0,
      description: "fires on every successful hit",
    },
    {
      id: "input.use_item",
      direction: "client-to-server",
      reliability: "reliable-ordered",
      params: [{ name: "itemId", kind: "string", required: true }],
      rateLimitPerSec: 20,
      description: "player clicked use on an inventory item",
    },
  ],
};

describe("ReplicationManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = ReplicationManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on empty manifest", () => {
    const parsed = ReplicationManifestSchema.parse({});
    expect(parsed.components).toEqual([]);
    expect(parsed.events).toEqual([]);
  });

  it("applies field defaults on a minimal field", () => {
    const parsed = ReplicationManifestSchema.parse({
      components: [
        {
          component: "Health",
          fields: [{ name: "current", kind: "int" }],
        },
      ],
    });
    const f = parsed.components[0].fields[0];
    expect(f.authority).toBe("server");
    expect(f.cadence).toBe("on-change");
    expect(f.intervalMs).toBe(100);
    expect(f.bits).toBe(0);
    expect(f.relevancyFiltered).toBe(true);
  });

  it("rejects non-PascalCase component name", () => {
    const bad = {
      components: [
        { component: "health", fields: [{ name: "current", kind: "int" }] },
      ],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-camelCase field name", () => {
    const bad = {
      components: [
        { component: "Health", fields: [{ name: "Current", kind: "int" }] },
      ],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate component names", () => {
    const bad = {
      components: [
        { component: "Health", fields: [{ name: "a", kind: "int" }] },
        { component: "Health", fields: [{ name: "b", kind: "int" }] },
      ],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate field names within a component", () => {
    const bad = {
      components: [
        {
          component: "Health",
          fields: [
            { name: "current", kind: "int" },
            { name: "current", kind: "int" },
          ],
        },
      ],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown field kind", () => {
    const bad = {
      components: [
        { component: "H", fields: [{ name: "x", kind: "complex-number" }] },
      ],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("requires enumValues when kind === 'enum'", () => {
    const bad = {
      components: [
        { component: "C", fields: [{ name: "state", kind: "enum" }] },
      ],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects enumValues on non-enum field", () => {
    const bad = {
      components: [
        {
          component: "C",
          fields: [{ name: "x", kind: "int", enumValues: ["a", "b"] }],
        },
      ],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects intervalMs below 16", () => {
    const bad = {
      components: [
        {
          component: "C",
          fields: [{ name: "x", kind: "int", intervalMs: 0 }],
        },
      ],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bits above 64", () => {
    const bad = {
      components: [
        {
          component: "C",
          fields: [{ name: "x", kind: "float", bits: 128 }],
        },
      ],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid event id (UPPER_SNAKE)", () => {
    const bad = {
      events: [{ id: "COMBAT_HIT", direction: "server-to-all" }],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown event direction", () => {
    const bad = {
      events: [{ id: "combat.hit", direction: "peer-to-nobody" }],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate event ids", () => {
    const bad = {
      events: [
        { id: "combat.hit", direction: "server-to-all" },
        { id: "combat.hit", direction: "server-to-owner" },
      ],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate event param names", () => {
    const bad = {
      events: [
        {
          id: "combat.hit",
          direction: "server-to-all",
          params: [
            { name: "target", kind: "entity-ref" },
            { name: "target", kind: "int" },
          ],
        },
      ],
    };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty fields array in a component", () => {
    const bad = { components: [{ component: "C", fields: [] }] };
    expect(ReplicationManifestSchema.safeParse(bad).success).toBe(false);
  });
});
