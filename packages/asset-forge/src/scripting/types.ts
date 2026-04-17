/**
 * Visual Scripting — Core type definitions for the event trigger graph system.
 *
 * ScriptGraphs are directed graphs of nodes (triggers, conditions, actions, flow)
 * connected by edges (execution flow or data passing). Users compose game logic
 * by wiring nodes together in the React Flow canvas.
 */

// ============== GRAPH ==============

/** A complete script graph — one logical behavior tree / event chain. */
export interface ScriptGraph {
  id: string;
  name: string;
  graphType: "behavior" | "event" | "dialogue" | "quest";
  nodes: ScriptNode[];
  edges: ScriptEdge[];
  variables: ScriptVariable[];
}

// ============== NODES ==============

/** A single node in the graph. Position is in React Flow canvas space. */
export interface ScriptNode {
  id: string;
  /** Dot-separated type key matching NodeTypeDefinition.type (e.g. "trigger/onPlayerEnterZone") */
  type: string;
  position: { x: number; y: number };
  /** User-configured field values for this node instance */
  data: Record<string, unknown>;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}

// ============== PORTS ==============

/**
 * A single input or output port on a node.
 * - "flow" ports carry execution flow (diamond handles)
 * - "data" ports carry typed values (circle handles)
 */
export interface PortDefinition {
  id: string;
  label: string;
  type: "flow" | "data";
  dataType?:
    | "string"
    | "number"
    | "boolean"
    | "entity"
    | "position"
    | "vector3"
    | "any";
  connected?: boolean;
}

// ============== EDGES ==============

/** A directed connection between two ports on different nodes. */
export interface ScriptEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

// ============== VARIABLES ==============

/** A graph-scoped variable that can be read/written by SetVariable / GetVariable nodes. */
export interface ScriptVariable {
  id: string;
  name: string;
  type: "string" | "number" | "boolean";
  defaultValue: unknown;
}
