/**
 * Graph Validation — structural and semantic validation for ScriptGraphs.
 *
 * Validates:
 *  - Orphan nodes (no connections)
 *  - Port type compatibility (flow-to-flow, data type matching)
 *  - Cycle detection (DFS)
 *  - Required fields filled
 *  - Trigger nodes must have outgoing flow
 *  - Unused outputs and dead branches (warnings)
 */

import type {
  ScriptGraph,
  ScriptNode,
  ScriptEdge,
  PortDefinition,
} from "./types";
import { getNodeType } from "./nodeLibrary";

// ============== RESULT TYPES ==============

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  nodeId?: string;
  edgeId?: string;
  message: string;
  type:
    | "orphan"
    | "type-mismatch"
    | "cycle"
    | "missing-field"
    | "disconnected-flow";
}

export interface ValidationWarning {
  nodeId?: string;
  message: string;
  type: "unused-output" | "dead-branch";
}

// ============== MAIN VALIDATOR ==============

/** Validate a full script graph. Returns errors and warnings. */
export function validateGraph(graph: ScriptGraph): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const nodeMap = new Map<string, ScriptNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  // 1. Check orphan nodes (no edges at all)
  checkOrphanNodes(graph, errors);

  // 2. Check edge port type compatibility
  checkEdgeTypes(graph, nodeMap, errors);

  // 3. Cycle detection
  checkCycles(graph, errors);

  // 4. Required fields filled
  checkRequiredFields(graph, errors);

  // 5. Trigger nodes must have outgoing flow
  checkTriggerOutputs(graph, errors);

  // 6. Unused outputs (warnings)
  checkUnusedOutputs(graph, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============== VALIDATION PASSES ==============

/** Nodes with zero connections are orphans. */
function checkOrphanNodes(graph: ScriptGraph, errors: ValidationError[]): void {
  const connectedNodeIds = new Set<string>();
  for (const edge of graph.edges) {
    connectedNodeIds.add(edge.sourceNodeId);
    connectedNodeIds.add(edge.targetNodeId);
  }

  for (const node of graph.nodes) {
    if (!connectedNodeIds.has(node.id)) {
      errors.push({
        nodeId: node.id,
        message: `Node "${getNodeLabel(node)}" has no connections`,
        type: "orphan",
      });
    }
  }
}

/** Validate that connected ports have compatible types. */
function checkEdgeTypes(
  graph: ScriptGraph,
  nodeMap: Map<string, ScriptNode>,
  errors: ValidationError[],
): void {
  for (const edge of graph.edges) {
    const sourceNode = nodeMap.get(edge.sourceNodeId);
    const targetNode = nodeMap.get(edge.targetNodeId);
    if (!sourceNode || !targetNode) continue;

    const sourcePort = findPort(sourceNode, edge.sourcePortId, "output");
    const targetPort = findPort(targetNode, edge.targetPortId, "input");

    if (!sourcePort || !targetPort) continue;

    // Flow must connect to flow
    if (sourcePort.type === "flow" && targetPort.type !== "flow") {
      errors.push({
        edgeId: edge.id,
        message: `Cannot connect flow output to data input (${getNodeLabel(sourceNode)} -> ${getNodeLabel(targetNode)})`,
        type: "type-mismatch",
      });
    }

    // Data must connect to data
    if (sourcePort.type === "data" && targetPort.type !== "data") {
      errors.push({
        edgeId: edge.id,
        message: `Cannot connect data output to flow input (${getNodeLabel(sourceNode)} -> ${getNodeLabel(targetNode)})`,
        type: "type-mismatch",
      });
    }

    // Data type matching (if both ports have explicit dataType)
    if (
      sourcePort.type === "data" &&
      targetPort.type === "data" &&
      sourcePort.dataType &&
      targetPort.dataType &&
      sourcePort.dataType !== targetPort.dataType
    ) {
      errors.push({
        edgeId: edge.id,
        message: `Type mismatch: ${sourcePort.dataType} -> ${targetPort.dataType} (${getNodeLabel(sourceNode)} -> ${getNodeLabel(targetNode)})`,
        type: "type-mismatch",
      });
    }
  }
}

/** DFS-based cycle detection on flow edges. */
function checkCycles(graph: ScriptGraph, errors: ValidationError[]): void {
  // Build adjacency list from flow edges only
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    const sourceNode = graph.nodes.find((n) => n.id === edge.sourceNodeId);
    if (!sourceNode) continue;
    const sourcePort = findPort(sourceNode, edge.sourcePortId, "output");
    if (sourcePort?.type === "flow") {
      const neighbors = adjacency.get(edge.sourceNodeId);
      if (neighbors) {
        neighbors.push(edge.targetNodeId);
      }
    }
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const node of graph.nodes) {
    color.set(node.id, WHITE);
  }

  const cycleNodes = new Set<string>();

  function dfs(nodeId: string): boolean {
    color.set(nodeId, GRAY);
    const neighbors = adjacency.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      const c = color.get(neighbor) ?? WHITE;
      if (c === GRAY) {
        cycleNodes.add(nodeId);
        cycleNodes.add(neighbor);
        return true;
      }
      if (c === WHITE && dfs(neighbor)) {
        cycleNodes.add(nodeId);
        return true;
      }
    }
    color.set(nodeId, BLACK);
    return false;
  }

  for (const node of graph.nodes) {
    if ((color.get(node.id) ?? WHITE) === WHITE) {
      dfs(node.id);
    }
  }

  if (cycleNodes.size > 0) {
    errors.push({
      message: `Cycle detected involving nodes: ${Array.from(cycleNodes).join(", ")}`,
      type: "cycle",
    });
  }
}

/** Check that all required fields on each node are filled. */
function checkRequiredFields(
  graph: ScriptGraph,
  errors: ValidationError[],
): void {
  for (const node of graph.nodes) {
    const typeDef = getNodeType(node.type);
    if (!typeDef) continue;

    for (const field of typeDef.fields) {
      if (!field.required) continue;

      const value = node.data[field.key];
      const isEmpty =
        value === undefined ||
        value === null ||
        value === "" ||
        (typeof value === "number" && isNaN(value));

      if (isEmpty) {
        errors.push({
          nodeId: node.id,
          message: `Required field "${field.label}" is empty on "${getNodeLabel(node)}"`,
          type: "missing-field",
        });
      }
    }
  }
}

/** Trigger nodes must have at least one outgoing flow connection. */
function checkTriggerOutputs(
  graph: ScriptGraph,
  errors: ValidationError[],
): void {
  for (const node of graph.nodes) {
    const typeDef = getNodeType(node.type);
    if (!typeDef || typeDef.category !== "trigger") continue;

    const hasOutgoingFlow = graph.edges.some((edge) => {
      if (edge.sourceNodeId !== node.id) return false;
      const port = findPort(node, edge.sourcePortId, "output");
      return port?.type === "flow";
    });

    if (!hasOutgoingFlow) {
      errors.push({
        nodeId: node.id,
        message: `Trigger "${getNodeLabel(node)}" has no outgoing flow connections`,
        type: "disconnected-flow",
      });
    }
  }
}

/** Warn about output ports that are never connected. */
function checkUnusedOutputs(
  graph: ScriptGraph,
  warnings: ValidationWarning[],
): void {
  const usedSourcePorts = new Set<string>();
  for (const edge of graph.edges) {
    usedSourcePorts.add(`${edge.sourceNodeId}:${edge.sourcePortId}`);
  }

  for (const node of graph.nodes) {
    // Skip nodes that have no connections at all (already caught by orphan check)
    const hasConnections = graph.edges.some(
      (e) => e.sourceNodeId === node.id || e.targetNodeId === node.id,
    );
    if (!hasConnections) continue;

    const flowOutputs = node.outputs.filter((o) => o.type === "flow");

    // Only warn on branching nodes (2+ flow outputs). A single flow_out is
    // allowed to be unconnected — the node is legitimately terminal in its chain.
    if (flowOutputs.length < 2) continue;

    for (const output of flowOutputs) {
      const key = `${node.id}:${output.id}`;
      if (!usedSourcePorts.has(key)) {
        warnings.push({
          nodeId: node.id,
          message: `Output "${output.label}" on "${getNodeLabel(node)}" is not connected`,
          type: "unused-output",
        });
      }
    }
  }
}

// ============== HELPERS ==============

function getNodeLabel(node: ScriptNode): string {
  const typeDef = getNodeType(node.type);
  return typeDef?.label ?? node.type;
}

function findPort(
  node: ScriptNode,
  portId: string,
  direction: "input" | "output",
): PortDefinition | undefined {
  const ports = direction === "input" ? node.inputs : node.outputs;
  return ports.find((p) => p.id === portId);
}

/** Get validation errors for a specific node. */
export function getNodeErrors(
  result: ValidationResult,
  nodeId: string,
): ValidationError[] {
  return result.errors.filter((e) => e.nodeId === nodeId);
}

/** Get validation warnings for a specific node. */
export function getNodeWarnings(
  result: ValidationResult,
  nodeId: string,
): ValidationWarning[] {
  return result.warnings.filter((w) => w.nodeId === nodeId);
}
