import { describe, it, expect } from "vitest";
import {
  validateGraph,
  getNodeErrors,
  getNodeWarnings,
  type ValidationResult,
} from "../validation";
import type {
  ScriptGraph,
  ScriptNode,
  ScriptEdge,
  PortDefinition,
} from "../types";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;
function uid(): string {
  return `id_${++_idCounter}`;
}

function makePort(
  id: string,
  label: string,
  type: "flow" | "data",
  dataType?: PortDefinition["dataType"],
): PortDefinition {
  return { id, label, type, dataType };
}

function makeNode(
  overrides: Partial<ScriptNode> & { id: string; type: string },
): ScriptNode {
  return {
    position: { x: 0, y: 0 },
    data: {},
    inputs: [],
    outputs: [],
    ...overrides,
  };
}

function makeEdge(
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
): ScriptEdge {
  return {
    id: uid(),
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
  };
}

function makeGraph(nodes: ScriptNode[], edges: ScriptEdge[]): ScriptGraph {
  return {
    id: uid(),
    name: "Test Graph",
    graphType: "behavior",
    nodes,
    edges,
    variables: [],
  };
}

/**
 * Build a minimal valid 2-node graph (trigger -> action) with flow ports
 * that passes all validation checks.
 */
function makeValidTwoNodeGraph(): ScriptGraph {
  const triggerNode = makeNode({
    id: "trigger1",
    type: "trigger/onPlayerEnterZone",
    outputs: [makePort("flow_out", "Out", "flow")],
    inputs: [],
    data: { zoneId: "test-zone" },
  });

  const actionNode = makeNode({
    id: "action1",
    type: "action/showNotification",
    inputs: [makePort("flow_in", "In", "flow")],
    outputs: [],
    data: { message: "Hello" },
  });

  const edge = makeEdge("trigger1", "flow_out", "action1", "flow_in");

  return makeGraph([triggerNode, actionNode], [edge]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateGraph", () => {
  // ---- Graph structure ----

  it("validates a well-formed graph without errors", () => {
    const graph = makeValidTwoNodeGraph();
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts an empty graph (no nodes, no edges)", () => {
    const graph = makeGraph([], []);
    const result = validateGraph(graph);
    // Empty graph has no nodes to validate — should pass
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  // ---- Orphan node detection ----

  it("reports orphan nodes with no connections", () => {
    const orphan = makeNode({
      id: "orphan1",
      type: "action/showNotification",
      data: { message: "Lonely" },
    });

    const graph = makeGraph([orphan], []);
    const result = validateGraph(graph);

    const orphanErrors = result.errors.filter((e) => e.type === "orphan");
    expect(orphanErrors.length).toBeGreaterThanOrEqual(1);
    expect(orphanErrors[0].nodeId).toBe("orphan1");
  });

  it("does not report connected nodes as orphans", () => {
    const graph = makeValidTwoNodeGraph();
    const result = validateGraph(graph);
    const orphanErrors = result.errors.filter((e) => e.type === "orphan");
    expect(orphanErrors).toHaveLength(0);
  });

  // ---- Edge references ----

  it("handles edges referencing nonexistent source nodes gracefully", () => {
    const node = makeNode({
      id: "n1",
      type: "action/showNotification",
      inputs: [makePort("flow_in", "In", "flow")],
      data: { message: "test" },
    });

    const badEdge = makeEdge("nonexistent", "flow_out", "n1", "flow_in");
    const graph = makeGraph([node], [badEdge]);

    // The validation should still run without throwing
    const result = validateGraph(graph);
    expect(result).toBeDefined();
  });

  it("handles edges referencing nonexistent target nodes gracefully", () => {
    const node = makeNode({
      id: "n1",
      type: "trigger/onPlayerEnterZone",
      outputs: [makePort("flow_out", "Out", "flow")],
    });

    const badEdge = makeEdge("n1", "flow_out", "nonexistent", "flow_in");
    const graph = makeGraph([node], [badEdge]);

    const result = validateGraph(graph);
    expect(result).toBeDefined();
  });

  // ---- Port type compatibility ----

  it("reports type-mismatch when flow output connects to data input", () => {
    const source = makeNode({
      id: "src",
      type: "trigger/onPlayerEnterZone",
      outputs: [makePort("flow_out", "Out", "flow")],
    });

    const target = makeNode({
      id: "tgt",
      type: "action/showNotification",
      inputs: [makePort("value_in", "Value", "data", "string")],
      data: { message: "test" },
    });

    const edge = makeEdge("src", "flow_out", "tgt", "value_in");
    const graph = makeGraph([source, target], [edge]);
    const result = validateGraph(graph);

    const typeMismatchErrors = result.errors.filter(
      (e) => e.type === "type-mismatch",
    );
    expect(typeMismatchErrors.length).toBeGreaterThanOrEqual(1);
  });

  it("reports type-mismatch when data output connects to flow input", () => {
    const source = makeNode({
      id: "src",
      type: "data/constant",
      outputs: [makePort("value_out", "Value", "data", "number")],
    });

    const target = makeNode({
      id: "tgt",
      type: "action/showNotification",
      inputs: [makePort("flow_in", "In", "flow")],
      data: { message: "test" },
    });

    const edge = makeEdge("src", "value_out", "tgt", "flow_in");
    const graph = makeGraph([source, target], [edge]);
    const result = validateGraph(graph);

    const typeMismatchErrors = result.errors.filter(
      (e) => e.type === "type-mismatch",
    );
    expect(typeMismatchErrors.length).toBeGreaterThanOrEqual(1);
  });

  it("reports data type mismatch between incompatible data ports", () => {
    const source = makeNode({
      id: "src",
      type: "data/constant",
      outputs: [makePort("out", "Out", "data", "number")],
    });

    const target = makeNode({
      id: "tgt",
      type: "action/showDialogue",
      inputs: [makePort("in", "In", "data", "string")],
      data: { title: "T", text: "X" },
    });

    const edge = makeEdge("src", "out", "tgt", "in");
    const graph = makeGraph([source, target], [edge]);
    const result = validateGraph(graph);

    const typeMismatchErrors = result.errors.filter(
      (e) => e.type === "type-mismatch",
    );
    expect(typeMismatchErrors.length).toBeGreaterThanOrEqual(1);
  });

  it("allows matching data types between data ports", () => {
    const source = makeNode({
      id: "src",
      type: "data/constant",
      outputs: [makePort("out", "Out", "data", "string")],
    });

    const target = makeNode({
      id: "tgt",
      type: "action/showDialogue",
      inputs: [
        makePort("flow_in", "In", "flow"),
        makePort("in", "In", "data", "string"),
      ],
      data: { title: "T", text: "X" },
    });

    // Need a flow connection from a trigger to prevent orphan/trigger errors
    const trigger = makeNode({
      id: "trig",
      type: "trigger/onPlayerEnterZone",
      outputs: [makePort("flow_out", "Out", "flow")],
    });

    const flowEdge = makeEdge("trig", "flow_out", "tgt", "flow_in");
    const dataEdge = makeEdge("src", "out", "tgt", "in");

    const graph = makeGraph([trigger, source, target], [flowEdge, dataEdge]);
    const result = validateGraph(graph);

    const typeMismatchErrors = result.errors.filter(
      (e) => e.type === "type-mismatch",
    );
    expect(typeMismatchErrors).toHaveLength(0);
  });

  // ---- Cycle detection ----

  it("detects cycles in flow edges", () => {
    const nodeA = makeNode({
      id: "a",
      type: "action/showNotification",
      inputs: [makePort("flow_in", "In", "flow")],
      outputs: [makePort("flow_out", "Out", "flow")],
      data: { message: "A" },
    });

    const nodeB = makeNode({
      id: "b",
      type: "action/showNotification",
      inputs: [makePort("flow_in", "In", "flow")],
      outputs: [makePort("flow_out", "Out", "flow")],
      data: { message: "B" },
    });

    const edgeAB = makeEdge("a", "flow_out", "b", "flow_in");
    const edgeBA = makeEdge("b", "flow_out", "a", "flow_in");

    const graph = makeGraph([nodeA, nodeB], [edgeAB, edgeBA]);
    const result = validateGraph(graph);

    const cycleErrors = result.errors.filter((e) => e.type === "cycle");
    expect(cycleErrors.length).toBeGreaterThanOrEqual(1);
  });

  it("does not flag acyclic flow edges as cycles", () => {
    const graph = makeValidTwoNodeGraph();
    const result = validateGraph(graph);
    const cycleErrors = result.errors.filter((e) => e.type === "cycle");
    expect(cycleErrors).toHaveLength(0);
  });

  // ---- Trigger node checks ----

  it("reports disconnected trigger nodes with no outgoing flow", () => {
    const trigger = makeNode({
      id: "trig",
      type: "trigger/onPlayerEnterZone",
      outputs: [makePort("flow_out", "Out", "flow")],
    });

    const unrelated = makeNode({
      id: "other",
      type: "action/showNotification",
      inputs: [makePort("flow_in", "In", "flow")],
      data: { message: "test" },
    });

    // Connect them via a data edge (not flow), so the trigger has connections
    // but no outgoing flow. We need some connection so it's not an orphan.
    // Actually, let's give the trigger a data port and connect through that.
    trigger.outputs.push(makePort("player", "Player", "data", "entity"));
    unrelated.inputs.push(makePort("player_in", "Player", "data", "entity"));

    const dataEdge = makeEdge("trig", "player", "other", "player_in");
    const graph = makeGraph([trigger, unrelated], [dataEdge]);
    const result = validateGraph(graph);

    const flowErrors = result.errors.filter(
      (e) => e.type === "disconnected-flow",
    );
    expect(flowErrors.length).toBeGreaterThanOrEqual(1);
    expect(flowErrors[0].nodeId).toBe("trig");
  });

  // ---- Unused output warnings ----

  it("warns about unused flow output ports on connected nodes", () => {
    const trigger = makeNode({
      id: "trig",
      type: "trigger/onPlayerEnterZone",
      outputs: [
        makePort("flow_out", "Out", "flow"),
        makePort("flow_alt", "Alt", "flow"),
      ],
    });

    const action = makeNode({
      id: "act",
      type: "action/showNotification",
      inputs: [makePort("flow_in", "In", "flow")],
      outputs: [],
      data: { message: "test" },
    });

    // Only connect one of the two flow outputs
    const edge = makeEdge("trig", "flow_out", "act", "flow_in");
    const graph = makeGraph([trigger, action], [edge]);
    const result = validateGraph(graph);

    const unusedWarnings = result.warnings.filter(
      (w) => w.type === "unused-output",
    );
    expect(unusedWarnings.length).toBeGreaterThanOrEqual(1);
    expect(unusedWarnings.some((w) => w.message.includes("Alt"))).toBe(true);
  });

  it("does not warn about unused outputs on orphan nodes", () => {
    const orphan = makeNode({
      id: "orphan",
      type: "action/showNotification",
      outputs: [makePort("flow_out", "Out", "flow")],
      data: { message: "test" },
    });

    const graph = makeGraph([orphan], []);
    const result = validateGraph(graph);

    // Orphan check fires, but unused-output should not (since it skips orphans)
    const unusedWarnings = result.warnings.filter(
      (w) => w.type === "unused-output",
    );
    expect(unusedWarnings).toHaveLength(0);
  });

  // ---- Duplicate node IDs ----

  it("handles duplicate node IDs in the graph", () => {
    const node1 = makeNode({
      id: "dup",
      type: "action/showNotification",
      data: { message: "A" },
    });
    const node2 = makeNode({
      id: "dup",
      type: "action/showNotification",
      data: { message: "B" },
    });

    const graph = makeGraph([node1, node2], []);
    // Should not throw
    const result = validateGraph(graph);
    expect(result).toBeDefined();
  });

  // ---- getNodeErrors / getNodeWarnings helpers ----

  it("getNodeErrors filters errors by nodeId", () => {
    const orphan1 = makeNode({
      id: "n1",
      type: "action/showNotification",
      data: { message: "test" },
    });
    const orphan2 = makeNode({
      id: "n2",
      type: "action/showNotification",
      data: { message: "test" },
    });

    const graph = makeGraph([orphan1, orphan2], []);
    const result = validateGraph(graph);

    const errorsForN1 = getNodeErrors(result, "n1");
    const errorsForN2 = getNodeErrors(result, "n2");

    expect(errorsForN1.every((e) => e.nodeId === "n1")).toBe(true);
    expect(errorsForN2.every((e) => e.nodeId === "n2")).toBe(true);
  });

  it("getNodeWarnings filters warnings by nodeId", () => {
    const trigger = makeNode({
      id: "trig",
      type: "trigger/onPlayerEnterZone",
      outputs: [
        makePort("flow_out", "Out", "flow"),
        makePort("flow_alt", "Alt", "flow"),
      ],
    });

    const action = makeNode({
      id: "act",
      type: "action/showNotification",
      inputs: [makePort("flow_in", "In", "flow")],
      outputs: [makePort("flow_unused", "Unused", "flow")],
      data: { message: "test" },
    });

    const edge = makeEdge("trig", "flow_out", "act", "flow_in");
    const graph = makeGraph([trigger, action], [edge]);
    const result = validateGraph(graph);

    const trigWarnings = getNodeWarnings(result, "trig");
    expect(trigWarnings.every((w) => w.nodeId === "trig")).toBe(true);

    const actWarnings = getNodeWarnings(result, "act");
    expect(actWarnings.every((w) => w.nodeId === "act")).toBe(true);
  });

  it("getNodeErrors returns empty array for nodes with no errors", () => {
    const graph = makeValidTwoNodeGraph();
    const result = validateGraph(graph);
    const errors = getNodeErrors(result, "trigger1");
    expect(errors).toHaveLength(0);
  });

  // ---- Self-referencing edge ----

  it("detects a self-referencing flow edge as a cycle", () => {
    const node = makeNode({
      id: "self",
      type: "action/showNotification",
      inputs: [makePort("flow_in", "In", "flow")],
      outputs: [makePort("flow_out", "Out", "flow")],
      data: { message: "loop" },
    });

    const selfEdge = makeEdge("self", "flow_out", "self", "flow_in");
    const graph = makeGraph([node], [selfEdge]);
    const result = validateGraph(graph);

    const cycleErrors = result.errors.filter((e) => e.type === "cycle");
    expect(cycleErrors.length).toBeGreaterThanOrEqual(1);
  });

  // ---- Three-node chain: no false positives ----

  it("validates a three-node linear chain without errors", () => {
    const trigger = makeNode({
      id: "t",
      type: "trigger/onPlayerEnterZone",
      outputs: [makePort("flow_out", "Out", "flow")],
      data: { zoneId: "test-zone" },
    });

    const middle = makeNode({
      id: "m",
      type: "action/showNotification",
      inputs: [makePort("flow_in", "In", "flow")],
      outputs: [makePort("flow_out", "Out", "flow")],
      data: { message: "mid" },
    });

    const end = makeNode({
      id: "e",
      type: "action/showNotification",
      inputs: [makePort("flow_in", "In", "flow")],
      outputs: [],
      data: { message: "end" },
    });

    const e1 = makeEdge("t", "flow_out", "m", "flow_in");
    const e2 = makeEdge("m", "flow_out", "e", "flow_in");

    const graph = makeGraph([trigger, middle, end], [e1, e2]);
    const result = validateGraph(graph);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
