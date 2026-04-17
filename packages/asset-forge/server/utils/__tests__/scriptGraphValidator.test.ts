import { describe, it, expect } from "vitest";
import {
  validateScriptGraph,
  validateEmbeddedGraphs,
  type GraphValidationResult,
} from "../scriptGraphValidator";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;
function uid(): string {
  return `id_${++_idCounter}`;
}

interface MinimalNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

interface MinimalEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

function makeNode(type: string, id?: string): MinimalNode {
  return { id: id ?? uid(), type, data: {} };
}

function makeEdge(
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
): MinimalEdge {
  return {
    id: uid(),
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
  };
}

function makeValidGraph(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const node1 = makeNode("trigger/onPlayerEnterZone", "n1");
  const node2 = makeNode("action/showDialogue", "n2");
  const edge = makeEdge("n1", "flow_out", "n2", "flow_in");

  return {
    id: "graph-1",
    name: "Test Graph",
    graphType: "behavior",
    nodes: [node1, node2],
    edges: [edge],
    variables: [],
    ...overrides,
  };
}

function expectValid(result: GraphValidationResult): void {
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
}

function expectInvalid(result: GraphValidationResult): void {
  expect(result.valid).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// validateScriptGraph
// ---------------------------------------------------------------------------

describe("validateScriptGraph", () => {
  it("passes validation for a valid graph", () => {
    const graph = makeValidGraph();
    const result = validateScriptGraph(graph);
    expectValid(result);
  });

  it("fails when graph is null", () => {
    const result = validateScriptGraph(null);
    expectInvalid(result);
    expect(result.errors[0]).toContain("non-null object");
  });

  it("fails when graph is not an object", () => {
    const result = validateScriptGraph("not a graph");
    expectInvalid(result);
  });

  // ---- Missing required fields ----

  it("fails when id is missing", () => {
    const graph = makeValidGraph({ id: undefined });
    delete (graph as Record<string, unknown>).id;
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("fails when id is empty string", () => {
    const graph = makeValidGraph({ id: "" });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("fails when name is missing", () => {
    const graph = makeValidGraph();
    delete (graph as Record<string, unknown>).name;
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("fails when nodes is not an array", () => {
    const graph = makeValidGraph({ nodes: "not-array" });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("nodes"))).toBe(true);
  });

  it("fails when edges is not an array", () => {
    const graph = makeValidGraph({ edges: "not-array" });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("edges"))).toBe(true);
  });

  // ---- Size limits ----

  it("fails when node count exceeds 500", () => {
    const nodes = Array.from({ length: 501 }, (_, i) =>
      makeNode("action/showNotification", `node_${i}`),
    );
    const graph = makeValidGraph({ nodes, edges: [] });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("max node count"))).toBe(true);
  });

  it("fails when edge count exceeds 2000", () => {
    const node1 = makeNode("trigger/onPlayerEnterZone", "src");
    const node2 = makeNode("action/showNotification", "tgt");
    const edges = Array.from({ length: 2001 }, () =>
      makeEdge("src", "flow_out", "tgt", "flow_in"),
    );
    const graph = makeValidGraph({ nodes: [node1, node2], edges });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("max edge count"))).toBe(true);
  });

  it("fails when variable count exceeds 100", () => {
    const variables = Array.from({ length: 101 }, (_, i) => ({
      id: `var_${i}`,
      name: `var${i}`,
      type: "string",
    }));
    const graph = makeValidGraph({ variables });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("max variable count"))).toBe(
      true,
    );
  });

  // ---- Node type prefix validation ----

  it("fails for invalid node type prefix", () => {
    const malicious = makeNode("malicious/exec", "bad");
    const graph = makeValidGraph({ nodes: [malicious], edges: [] });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("unknown type prefix"))).toBe(
      true,
    );
  });

  it("passes for trigger/ prefix", () => {
    const node = makeNode("trigger/onReady", "n1");
    const graph = makeValidGraph({ nodes: [node], edges: [] });
    const result = validateScriptGraph(graph);
    expectValid(result);
  });

  it("passes for condition/ prefix", () => {
    const node = makeNode("condition/hasItem", "n1");
    const graph = makeValidGraph({ nodes: [node], edges: [] });
    const result = validateScriptGraph(graph);
    expectValid(result);
  });

  it("passes for action/ prefix", () => {
    const node = makeNode("action/giveItem", "n1");
    const graph = makeValidGraph({ nodes: [node], edges: [] });
    const result = validateScriptGraph(graph);
    expectValid(result);
  });

  it("passes for flow/ prefix", () => {
    const node = makeNode("flow/branch", "n1");
    const graph = makeValidGraph({ nodes: [node], edges: [] });
    const result = validateScriptGraph(graph);
    expectValid(result);
  });

  it("passes for math/ prefix", () => {
    const node = makeNode("math/add", "n1");
    const graph = makeValidGraph({ nodes: [node], edges: [] });
    const result = validateScriptGraph(graph);
    expectValid(result);
  });

  it("passes for variable/ prefix", () => {
    const node = makeNode("variable/get", "n1");
    const graph = makeValidGraph({ nodes: [node], edges: [] });
    const result = validateScriptGraph(graph);
    expectValid(result);
  });

  it("passes for data/ prefix", () => {
    const node = makeNode("data/constant", "n1");
    const graph = makeValidGraph({ nodes: [node], edges: [] });
    const result = validateScriptGraph(graph);
    expectValid(result);
  });

  // ---- Exact-match allowlist (Phase 5.1) ----

  it("rejects unknown action/* node type not in allowlist", () => {
    const node = makeNode("action/doSomethingEvil", "n1");
    const graph = makeValidGraph({ nodes: [node], edges: [] });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("not in allowlist"))).toBe(
      true,
    );
  });

  it("rejects unknown trigger/* node type not in allowlist", () => {
    const node = makeNode("trigger/onFakeEvent", "n1");
    const graph = makeValidGraph({ nodes: [node], edges: [] });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("not in allowlist"))).toBe(
      true,
    );
  });

  it("accepts known canonical node types", () => {
    const node = makeNode("action/showDialogue", "n1");
    const graph = makeValidGraph({ nodes: [node], edges: [] });
    const result = validateScriptGraph(graph);
    expectValid(result);
  });

  // ---- Edge integrity ----

  it("fails when edge references nonexistent source node", () => {
    const node = makeNode("action/showNotification", "n1");
    const edge = makeEdge("nonexistent", "flow_out", "n1", "flow_in");
    const graph = makeValidGraph({ nodes: [node], edges: [edge] });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("sourceNodeId"))).toBe(true);
  });

  it("fails when edge references nonexistent target node", () => {
    const node = makeNode("trigger/onReady", "n1");
    const edge = makeEdge("n1", "flow_out", "nonexistent", "flow_in");
    const graph = makeValidGraph({ nodes: [node], edges: [edge] });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("targetNodeId"))).toBe(true);
  });

  // ---- Self-referencing edge ----

  it("detects self-referencing edge through cycle detection", () => {
    const node = makeNode("action/showNotification", "n1");
    const selfEdge = makeEdge("n1", "flow_out", "n1", "flow_in");
    const graph = makeValidGraph({ nodes: [node], edges: [selfEdge] });
    const result = validateScriptGraph(graph);

    const hasCycleError = result.errors.some((e) =>
      e.toLowerCase().includes("cycle"),
    );
    expect(hasCycleError).toBe(true);
  });

  // ---- Duplicate node IDs ----

  it("reports duplicate node IDs", () => {
    const node1 = makeNode("action/showNotification", "dup");
    const node2 = makeNode("action/giveItem", "dup");
    const graph = makeValidGraph({ nodes: [node1, node2], edges: [] });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("Duplicate node ID"))).toBe(
      true,
    );
  });

  // ---- Empty arrays are valid ----

  it("accepts empty nodes and edges arrays", () => {
    const graph = makeValidGraph({ nodes: [], edges: [] });
    const result = validateScriptGraph(graph);
    expectValid(result);
  });

  // ---- Node with missing type ----

  it("fails for node with empty type string", () => {
    const node = { id: "n1", type: "", data: {} };
    const graph = makeValidGraph({ nodes: [node], edges: [] });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
  });

  it("fails for node with missing id", () => {
    const node = { type: "action/showNotification", data: {} };
    const graph = makeValidGraph({ nodes: [node], edges: [] });
    const result = validateScriptGraph(graph);
    expectInvalid(result);
  });

  // ---- Cycle detection ----

  it("detects flow-edge cycles between two nodes", () => {
    const n1 = makeNode("action/showNotification", "a");
    const n2 = makeNode("action/showNotification", "b");
    const e1 = makeEdge("a", "flow_out", "b", "flow_in");
    const e2 = makeEdge("b", "flow_out", "a", "flow_in");
    const graph = makeValidGraph({ nodes: [n1, n2], edges: [e1, e2] });
    const result = validateScriptGraph(graph);

    const hasCycleError = result.errors.some((e) =>
      e.toLowerCase().includes("cycle"),
    );
    expect(hasCycleError).toBe(true);
  });

  it("does not flag acyclic graphs", () => {
    const graph = makeValidGraph();
    const result = validateScriptGraph(graph);
    const hasCycleError = result.errors.some((e) =>
      e.toLowerCase().includes("cycle"),
    );
    expect(hasCycleError).toBe(false);
  });

  it("ignores data port edges for cycle detection", () => {
    // Data ports like "player", "entity" etc. are excluded from cycle check
    const n1 = makeNode("action/showNotification", "a");
    const n2 = makeNode("action/showNotification", "b");
    // "player" is a known data port — this should not be treated as a flow cycle
    const e1 = makeEdge("a", "flow_out", "b", "flow_in");
    const e2 = makeEdge("b", "player", "a", "entity");
    const graph = makeValidGraph({ nodes: [n1, n2], edges: [e1, e2] });
    const result = validateScriptGraph(graph);

    const hasCycleError = result.errors.some((e) =>
      e.toLowerCase().includes("cycle"),
    );
    expect(hasCycleError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateEmbeddedGraphs
// ---------------------------------------------------------------------------

describe("validateEmbeddedGraphs", () => {
  it("passes when object has no behaviorGraph fields", () => {
    const data = {
      name: "test",
      position: { x: 0, y: 0 },
      health: 100,
    };
    const result = validateEmbeddedGraphs(data);
    expectValid(result);
  });

  it("passes with a valid embedded behaviorGraph", () => {
    const data = {
      name: "NPC",
      behaviorGraph: makeValidGraph(),
    };
    const result = validateEmbeddedGraphs(data);
    expectValid(result);
  });

  it("fails with an invalid embedded behaviorGraph", () => {
    const data = {
      name: "NPC",
      behaviorGraph: {
        // Missing id, name, nodes, edges
        broken: true,
      },
    };
    const result = validateEmbeddedGraphs(data);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("behaviorGraph"))).toBe(true);
  });

  it("finds deeply nested behaviorGraph", () => {
    const data = {
      entities: {
        npcs: {
          guard: {
            behaviorGraph: {
              // Invalid graph — missing required fields
              id: "",
              nodes: [],
              edges: [],
            },
          },
        },
      },
    };
    const result = validateEmbeddedGraphs(data);
    expectInvalid(result);
    expect(result.errors.some((e) => e.includes("behaviorGraph"))).toBe(true);
  });

  it("validates multiple behaviorGraphs at different nesting levels", () => {
    const validGraph = makeValidGraph();
    const invalidGraph = { broken: true };

    const data = {
      npc1: { behaviorGraph: validGraph },
      nested: {
        npc2: { behaviorGraph: invalidGraph },
      },
    };
    const result = validateEmbeddedGraphs(data);
    expectInvalid(result);
    // Should have errors from the invalid graph only
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles null behaviorGraph (skips validation)", () => {
    const data = {
      name: "NPC",
      behaviorGraph: null,
    };
    const result = validateEmbeddedGraphs(data);
    expectValid(result);
  });

  it("handles array elements containing behaviorGraph", () => {
    const data = {
      entities: [
        { behaviorGraph: makeValidGraph() },
        {
          behaviorGraph: {
            // Missing required fields
            id: "",
            nodes: [],
            edges: [],
          },
        },
      ],
    };
    const result = validateEmbeddedGraphs(data);
    expectInvalid(result);
  });

  it("passes with null input", () => {
    const result = validateEmbeddedGraphs(null);
    expectValid(result);
  });

  it("passes with primitive input", () => {
    const result = validateEmbeddedGraphs("hello");
    expectValid(result);
  });

  it("includes path info in error messages for nested graphs", () => {
    const data = {
      level1: {
        level2: {
          behaviorGraph: {
            // Invalid — missing required fields
            broken: true,
          },
        },
      },
    };
    const result = validateEmbeddedGraphs(data);
    expectInvalid(result);
    // Error messages should include the path
    expect(result.errors.some((e) => e.includes("level1"))).toBe(true);
    expect(result.errors.some((e) => e.includes("level2"))).toBe(true);
  });
});
