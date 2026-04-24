/**
 * Faithfulness + defensiveness tests for `AIBehaviorManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  AIBehaviorManifestSchema,
  BehaviorTreeSchema,
  type AIBehaviorManifest,
} from "./ai-behavior.js";

/**
 * A reference tree that roughly mirrors AgentBehaviorTicker's picker:
 *
 *   selector
 *     ├─ sequence (in combat → attack)
 *     │     ├─ condition: inCombat
 *     │     └─ action: executeAttack
 *     └─ action: idle
 */
const reference: AIBehaviorManifest = [
  {
    id: "ticker_default",
    name: "Default agent ticker",
    description: "Mirrors AgentBehaviorTicker.pickBehaviorAction",
    tickIntervalSeconds: 8,
    root: "root",
    nodes: {
      root: {
        id: "root",
        label: "root selector",
        kind: "selector",
        children: ["combat_seq", "idle_act"],
      },
      combat_seq: {
        id: "combat_seq",
        label: "combat sequence",
        kind: "sequence",
        children: ["in_combat_cond", "attack_act"],
      },
      in_combat_cond: {
        id: "in_combat_cond",
        label: "in combat?",
        kind: "condition",
        condition: "inCombat",
        params: {},
      },
      attack_act: {
        id: "attack_act",
        label: "attack target",
        kind: "action",
        action: "executeAttack",
        params: { targetRef: "currentTargetId" },
      },
      idle_act: {
        id: "idle_act",
        label: "idle",
        kind: "action",
        action: "executeIdle",
        params: {},
      },
    },
  },
];

describe("AIBehaviorManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = AIBehaviorManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies default tickInterval + empty label + empty params", () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "T",
      root: "a",
      nodes: {
        a: {
          id: "a",
          kind: "action",
          action: "executeIdle",
        },
      },
    });
    expect(tree.tickIntervalSeconds).toBe(8);
    expect(tree.description).toBe("");
    const a = tree.nodes.a;
    if (a.kind === "action") {
      expect(a.label).toBe("");
      expect(a.params).toEqual({});
    } else {
      throw new Error("expected action node");
    }
  });

  it("rejects root pointing at unknown node", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        root: "nope",
        nodes: {
          a: { id: "a", kind: "action", action: "executeIdle" },
        },
      },
    ];
    expect(AIBehaviorManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects node id mismatch between key and `id` field", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        root: "a",
        nodes: {
          a: { id: "b", kind: "action", action: "executeIdle" },
        },
      },
    ];
    expect(AIBehaviorManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects composite node referencing a missing child id", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        root: "r",
        nodes: {
          r: { id: "r", kind: "sequence", children: ["missing"] },
        },
      },
    ];
    expect(AIBehaviorManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects decorator with missing child id", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        root: "r",
        nodes: {
          r: { id: "r", kind: "inverter", child: "missing" },
        },
      },
    ];
    expect(AIBehaviorManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects composite self-reference", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        root: "r",
        nodes: {
          r: { id: "r", kind: "sequence", children: ["r"] },
        },
      },
    ];
    expect(AIBehaviorManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects decorator self-reference", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        root: "r",
        nodes: {
          r: { id: "r", kind: "repeater", child: "r" },
        },
      },
    ];
    expect(AIBehaviorManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects composite with empty children list", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        root: "r",
        nodes: {
          r: { id: "r", kind: "selector", children: [] },
        },
      },
    ];
    expect(AIBehaviorManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown node kind", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        root: "r",
        nodes: {
          r: { id: "r", kind: "forkbomb", children: ["a"] },
          a: { id: "a", kind: "action", action: "executeIdle" },
        },
      },
    ];
    expect(AIBehaviorManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects zero tickIntervalSeconds", () => {
    const bad = [{ ...reference[0], tickIntervalSeconds: 0 }];
    expect(AIBehaviorManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate tree ids", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(AIBehaviorManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty action name on leaf", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        root: "r",
        nodes: {
          r: { id: "r", kind: "action", action: "" },
        },
      },
    ];
    expect(AIBehaviorManifestSchema.safeParse(bad).success).toBe(false);
  });
});
