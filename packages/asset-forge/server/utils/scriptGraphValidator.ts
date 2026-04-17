/**
 * Server-side ScriptGraph validator — lightweight validation without editor dependencies.
 *
 * Validates graph structure, node type allowlist, edge integrity, and cycle detection
 * before persisting to the database.
 */

import { isAllowedNodeType } from "./NodeTypeAllowlist.ts";

// ---------------------------------------------------------------------------
// Types (minimal — no editor imports)
// ---------------------------------------------------------------------------

interface ScriptGraphLike {
  id?: string;
  name?: string;
  graphType?: string;
  nodes?: ScriptNodeLike[];
  edges?: ScriptEdgeLike[];
  variables?: unknown[];
}

interface ScriptNodeLike {
  id?: string;
  type?: string;
  data?: Record<string, unknown>;
}

interface ScriptEdgeLike {
  id?: string;
  sourceNodeId?: string;
  sourcePortId?: string;
  targetNodeId?: string;
  targetPortId?: string;
}

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Allowed node type prefixes + known types
// ---------------------------------------------------------------------------

const ALLOWED_PREFIXES = new Set([
  "trigger/",
  "condition/",
  "action/",
  "flow/",
  "math/",
  "variable/",
  "data/",
]);

const MAX_NODES = 500;
const MAX_EDGES = 2000;
const MAX_VARIABLES = 100;

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

export function validateScriptGraph(graph: unknown): GraphValidationResult {
  const errors: string[] = [];

  if (!graph || typeof graph !== "object") {
    return { valid: false, errors: ["Graph must be a non-null object"] };
  }

  const g = graph as ScriptGraphLike;

  // Structure checks
  if (typeof g.id !== "string" || g.id.length === 0) {
    errors.push("Graph must have a non-empty string 'id'");
  }
  if (typeof g.name !== "string") {
    errors.push("Graph must have a string 'name'");
  }
  if (!Array.isArray(g.nodes)) {
    errors.push("Graph must have a 'nodes' array");
    return { valid: false, errors };
  }
  if (!Array.isArray(g.edges)) {
    errors.push("Graph must have an 'edges' array");
    return { valid: false, errors };
  }

  // Size limits
  if (g.nodes.length > MAX_NODES) {
    errors.push(
      `Graph exceeds max node count (${g.nodes.length}/${MAX_NODES})`,
    );
  }
  if (g.edges.length > MAX_EDGES) {
    errors.push(
      `Graph exceeds max edge count (${g.edges.length}/${MAX_EDGES})`,
    );
  }
  if (
    g.variables &&
    Array.isArray(g.variables) &&
    g.variables.length > MAX_VARIABLES
  ) {
    errors.push(
      `Graph exceeds max variable count (${(g.variables as unknown[]).length}/${MAX_VARIABLES})`,
    );
  }

  // Validate nodes
  const nodeIds = new Set<string>();
  for (const node of g.nodes) {
    if (!node || typeof node !== "object") {
      errors.push("Each node must be a non-null object");
      continue;
    }
    if (typeof node.id !== "string" || node.id.length === 0) {
      errors.push("Each node must have a non-empty string 'id'");
      continue;
    }
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);

    // Type allowlist — first enforce prefix (cheap), then exact-match allowlist
    if (typeof node.type !== "string" || node.type.length === 0) {
      errors.push(`Node ${node.id}: must have a non-empty string 'type'`);
    } else {
      const hasValidPrefix = Array.from(ALLOWED_PREFIXES).some((p) =>
        node.type!.startsWith(p),
      );
      if (!hasValidPrefix) {
        errors.push(
          `Node ${node.id}: unknown type prefix '${node.type}' (allowed: ${Array.from(ALLOWED_PREFIXES).join(", ")})`,
        );
      } else if (!isAllowedNodeType(node.type)) {
        errors.push(
          `Node ${node.id}: unknown node type '${node.type}' (not in allowlist)`,
        );
      }
    }
  }

  // Validate edges
  for (const edge of g.edges) {
    if (!edge || typeof edge !== "object") {
      errors.push("Each edge must be a non-null object");
      continue;
    }
    if (
      typeof edge.sourceNodeId !== "string" ||
      !nodeIds.has(edge.sourceNodeId)
    ) {
      errors.push(
        `Edge ${edge.id ?? "?"}: sourceNodeId '${edge.sourceNodeId}' does not reference a valid node`,
      );
    }
    if (
      typeof edge.targetNodeId !== "string" ||
      !nodeIds.has(edge.targetNodeId)
    ) {
      errors.push(
        `Edge ${edge.id ?? "?"}: targetNodeId '${edge.targetNodeId}' does not reference a valid node`,
      );
    }
  }

  // Cycle detection on flow edges
  if (errors.length === 0) {
    const cycleError = detectFlowCycles(g.nodes, g.edges);
    if (cycleError) errors.push(cycleError);
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Cycle detection (DFS on flow edges only)
// ---------------------------------------------------------------------------

function detectFlowCycles(
  nodes: ScriptNodeLike[],
  edges: ScriptEdgeLike[],
): string | null {
  // Build adjacency for flow edges (exclude known data port names)
  const DATA_PORTS = new Set([
    "player",
    "entity",
    "killer",
    "target",
    "item",
    "mob",
    "npc",
    "value",
    "result",
  ]);

  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.id) adj.set(node.id, []);
  }
  for (const edge of edges) {
    if (!edge.sourceNodeId || !edge.targetNodeId) continue;
    if (DATA_PORTS.has(edge.sourcePortId ?? "")) continue;
    const list = adj.get(edge.sourceNodeId);
    if (list) list.push(edge.targetNodeId);
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const id of adj.keys()) color.set(id, WHITE);

  for (const id of adj.keys()) {
    if (color.get(id) === WHITE) {
      if (dfs(id, adj, color)) {
        return "Flow edge cycle detected — scripts must be acyclic";
      }
    }
  }
  return null;
}

function dfs(
  nodeId: string,
  adj: Map<string, string[]>,
  color: Map<string, number>,
): boolean {
  color.set(nodeId, 1); // GRAY
  for (const next of adj.get(nodeId) ?? []) {
    const c = color.get(next) ?? 0;
    if (c === 1) return true; // Back edge → cycle
    if (c === 0 && dfs(next, adj, color)) return true;
  }
  color.set(nodeId, 2); // BLACK
  return false;
}

// ---------------------------------------------------------------------------
// Deep-scan a JSONB object for embedded behaviorGraph fields and validate them
// ---------------------------------------------------------------------------

export function validateEmbeddedGraphs(data: unknown): GraphValidationResult {
  const errors: string[] = [];
  findAndValidateGraphs(data, "", errors);
  return { valid: errors.length === 0, errors };
}

function findAndValidateGraphs(
  obj: unknown,
  path: string,
  errors: string[],
): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      findAndValidateGraphs(obj[i], `${path}[${i}]`, errors);
    }
    return;
  }

  const record = obj as Record<string, unknown>;

  // Check if this key is a behaviorGraph
  if ("behaviorGraph" in record && record.behaviorGraph != null) {
    const result = validateScriptGraph(record.behaviorGraph);
    if (!result.valid) {
      for (const e of result.errors) {
        errors.push(`${path}.behaviorGraph: ${e}`);
      }
    }
  }

  // Recurse into nested objects (but not too deep)
  for (const [key, value] of Object.entries(record)) {
    if (key === "behaviorGraph") continue; // Already validated
    if (value && typeof value === "object") {
      findAndValidateGraphs(value, path ? `${path}.${key}` : key, errors);
    }
  }
}
