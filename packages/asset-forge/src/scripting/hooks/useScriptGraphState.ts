/**
 * useScriptGraphState — React hook managing ScriptGraph state with React Flow sync.
 *
 * Bridges between our ScriptGraph model (types.ts) and React Flow's internal
 * node/edge format. All mutations are wrapped in undoable commands.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  Node as RFNode,
  Edge as RFEdge,
  OnNodesChange,
  OnEdgesChange,
  Connection,
  NodeChange,
  EdgeChange,
} from "@xyflow/react";

import { commandHistory } from "../../editor/commands/Command";
import type {
  ScriptGraph,
  ScriptNode,
  ScriptEdge,
  PortDefinition,
} from "../types";
import { getNodeType } from "../nodeLibrary";
import { validateGraph, type ValidationResult } from "../validation";
import type { BaseNodeData } from "../nodes/BaseNode";
import {
  AddNodeCommand,
  RemoveNodeCommand,
  AddEdgeCommand,
  RemoveEdgeCommand,
  MoveNodeCommand,
  ModifyNodeDataCommand,
} from "../commands/ScriptGraphCommands";

// ============== HELPERS ==============

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Convert a ScriptNode to a React Flow node. */
function toRFNode(
  node: ScriptNode,
  onFieldChange: (nodeId: string, key: string, value: unknown) => void,
): RFNode {
  const data: BaseNodeData = {
    scriptType: node.type,
    fieldValues: { ...node.data },
    inputs: node.inputs,
    outputs: node.outputs,
    onFieldChange,
  };

  return {
    id: node.id,
    type: "scriptNode", // maps to BaseNode in allNodeTypes
    position: { ...node.position },
    data,
  };
}

/** Convert a ScriptEdge to a React Flow edge. */
function toRFEdge(edge: ScriptEdge): RFEdge {
  return {
    id: edge.id,
    source: edge.sourceNodeId,
    sourceHandle: edge.sourcePortId,
    target: edge.targetNodeId,
    targetHandle: edge.targetPortId,
    type: "smoothstep",
    animated: true,
    style: { stroke: "#94a3b8", strokeWidth: 2 },
  };
}

/** Convert a React Flow node back to a ScriptNode. */
function fromRFNode(rfNode: RFNode): ScriptNode {
  const data = rfNode.data as BaseNodeData;
  const typeDef = getNodeType(data.scriptType);
  return {
    id: rfNode.id,
    type: data.scriptType,
    position: { x: rfNode.position.x, y: rfNode.position.y },
    data: { ...(data.fieldValues ?? {}) },
    inputs: data.inputs ?? typeDef?.inputs ?? [],
    outputs: data.outputs ?? typeDef?.outputs ?? [],
  };
}

/** Convert a React Flow edge back to a ScriptEdge. */
function fromRFEdge(rfEdge: RFEdge): ScriptEdge {
  return {
    id: rfEdge.id,
    sourceNodeId: rfEdge.source,
    sourcePortId: rfEdge.sourceHandle ?? "",
    targetNodeId: rfEdge.target,
    targetPortId: rfEdge.targetHandle ?? "",
  };
}

// ============== HOOK ==============

export interface UseScriptGraphStateReturn {
  /** React Flow nodes (reactive). */
  rfNodes: RFNode[];
  /** React Flow edges (reactive). */
  rfEdges: RFEdge[];
  /** React Flow onNodesChange callback. */
  onNodesChange: OnNodesChange;
  /** React Flow onEdgesChange callback. */
  onEdgesChange: OnEdgesChange;
  /** React Flow onConnect callback. */
  onConnect: (connection: Connection) => void;
  /** Add a new node from a type definition. */
  addNode: (type: string, position: { x: number; y: number }) => void;
  /** Remove a node and its edges. */
  removeNode: (nodeId: string) => void;
  /** Remove an edge. */
  removeEdge: (edgeId: string) => void;
  /** Get the selected node ID. */
  selectedNodeId: string | null;
  /** Select a node by ID (null to deselect). */
  selectNode: (nodeId: string | null) => void;
  /** Run validation and return the result. */
  validate: () => ValidationResult;
  /** Latest validation result. */
  validationResult: ValidationResult;
  /** Get the current ScriptGraph representation. */
  getGraph: () => ScriptGraph;
  /** Save handler — returns the serializable graph. */
  save: () => ScriptGraph;
  /** Graph metadata. */
  graphName: string;
  setGraphName: (name: string) => void;
  /** Load an entirely new graph (replaces all state). */
  loadGraph: (graph: ScriptGraph) => void;
}

export function useScriptGraphState(
  initialGraph?: ScriptGraph,
): UseScriptGraphStateReturn {
  // Core state
  const [nodes, setNodes] = useState<ScriptNode[]>(initialGraph?.nodes ?? []);
  const [edges, setEdges] = useState<ScriptEdge[]>(initialGraph?.edges ?? []);
  const [graphName, setGraphName] = useState(
    initialGraph?.name ?? "New Script",
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult>({
    valid: true,
    errors: [],
    warnings: [],
  });

  // Ref for drag-start positions (for MoveNodeCommand)
  const dragStartPositions = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );

  // ---- Field change handler (passed into RF nodes) ----

  const handleFieldChange = useCallback(
    (nodeId: string, key: string, value: unknown) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const oldValue = node.data[key];
      const cmd = new ModifyNodeDataCommand(nodeId, key, oldValue, value, {
        onUpdate: (nid, k, v) => {
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nid ? { ...n, data: { ...n.data, [k]: v } } : n,
            ),
          );
        },
      });

      commandHistory.execute(cmd);
    },
    [nodes],
  );

  // ---- Convert state to React Flow format ----

  const rfNodes: RFNode[] = useMemo(
    () => nodes.map((n) => toRFNode(n, handleFieldChange)),
    [nodes, handleFieldChange],
  );

  const rfEdges: RFEdge[] = useMemo(() => edges.map(toRFEdge), [edges]);

  // ---- Mutation helpers (no command, used as command targets) ----

  const rawAddNode = useCallback((node: ScriptNode) => {
    setNodes((prev) => [...prev, node]);
  }, []);

  const rawRemoveNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
  }, []);

  const rawAddEdge = useCallback((edge: ScriptEdge) => {
    setEdges((prev) => [...prev, edge]);
  }, []);

  const rawRemoveEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, []);

  const rawMoveNode = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId ? { ...n, position: { ...position } } : n,
        ),
      );
    },
    [],
  );

  // ---- Public API ----

  const addNode = useCallback(
    (type: string, position: { x: number; y: number }) => {
      const typeDef = getNodeType(type);
      if (!typeDef) return;

      const node: ScriptNode = {
        id: generateId(),
        type,
        position: { ...position },
        data: {},
        inputs: typeDef.inputs.map((p) => ({ ...p })),
        outputs: typeDef.outputs.map((p) => ({ ...p })),
      };

      // Apply field defaults
      for (const field of typeDef.fields) {
        if (field.default !== undefined) {
          node.data[field.key] = field.default;
        }
      }

      const cmd = new AddNodeCommand(node, {
        onAdd: rawAddNode,
        onRemove: rawRemoveNode,
      });

      commandHistory.execute(cmd);
    },
    [rawAddNode, rawRemoveNode],
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const connectedEdges = edges.filter(
        (e) => e.sourceNodeId === nodeId || e.targetNodeId === nodeId,
      );

      const cmd = new RemoveNodeCommand(node, {
        onRemove: rawRemoveNode,
        onAdd: rawAddNode,
        connectedEdges,
        onAddEdge: rawAddEdge,
        onRemoveEdge: rawRemoveEdge,
      });

      commandHistory.execute(cmd);

      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    },
    [
      nodes,
      edges,
      rawRemoveNode,
      rawAddNode,
      rawAddEdge,
      rawRemoveEdge,
      selectedNodeId,
    ],
  );

  const removeEdge = useCallback(
    (edgeId: string) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;

      const cmd = new RemoveEdgeCommand(edge, {
        onRemove: rawRemoveEdge,
        onAdd: rawAddEdge,
      });

      commandHistory.execute(cmd);
    },
    [edges, rawRemoveEdge, rawAddEdge],
  );

  // ---- React Flow callbacks ----

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "position") {
          if (change.dragging && change.position) {
            // Drag start — record initial position
            if (!dragStartPositions.current.has(change.id)) {
              const node = nodes.find((n) => n.id === change.id);
              if (node) {
                dragStartPositions.current.set(change.id, { ...node.position });
              }
            }
            // Live update (no command — just move the node)
            rawMoveNode(change.id, change.position);
          } else if (!change.dragging && change.position) {
            // Drag end — create a command for undo
            const startPos = dragStartPositions.current.get(change.id);
            dragStartPositions.current.delete(change.id);

            if (startPos) {
              const cmd = new MoveNodeCommand(
                change.id,
                startPos,
                change.position,
                { onMove: rawMoveNode },
              );
              commandHistory.execute(cmd);
            }
          }
        } else if (change.type === "select") {
          if (change.selected) {
            setSelectedNodeId(change.id);
          } else if (selectedNodeId === change.id) {
            setSelectedNodeId(null);
          }
        } else if (change.type === "remove") {
          removeNode(change.id);
        }
      }
    },
    [nodes, rawMoveNode, removeNode, selectedNodeId],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === "remove") {
          removeEdge(change.id);
        }
      }
    },
    [removeEdge],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (!connection.sourceHandle || !connection.targetHandle) return;

      // Prevent duplicate connections
      const alreadyExists = edges.some(
        (e) =>
          e.sourceNodeId === connection.source &&
          e.sourcePortId === connection.sourceHandle &&
          e.targetNodeId === connection.target &&
          e.targetPortId === connection.targetHandle,
      );
      if (alreadyExists) return;

      const edge: ScriptEdge = {
        id: generateId(),
        sourceNodeId: connection.source,
        sourcePortId: connection.sourceHandle,
        targetNodeId: connection.target,
        targetPortId: connection.targetHandle,
      };

      const cmd = new AddEdgeCommand(edge, {
        onAdd: rawAddEdge,
        onRemove: rawRemoveEdge,
      });

      commandHistory.execute(cmd);
    },
    [edges, rawAddEdge, rawRemoveEdge],
  );

  // ---- Validation ----

  const getGraph = useCallback((): ScriptGraph => {
    return {
      id: initialGraph?.id ?? generateId(),
      name: graphName,
      graphType: initialGraph?.graphType ?? "event",
      nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: edges.map((e) => ({ ...e })),
      variables: initialGraph?.variables ?? [],
    };
  }, [nodes, edges, graphName, initialGraph]);

  const validate = useCallback((): ValidationResult => {
    const graph = getGraph();
    const result = validateGraph(graph);
    setValidationResult(result);
    return result;
  }, [getGraph]);

  const save = useCallback((): ScriptGraph => {
    validate();
    return getGraph();
  }, [validate, getGraph]);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const loadGraph = useCallback((graph: ScriptGraph) => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setGraphName(graph.name);
    setSelectedNodeId(null);
    setValidationResult({ valid: true, errors: [], warnings: [] });
  }, []);

  return {
    rfNodes,
    rfEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    removeNode,
    removeEdge,
    selectedNodeId,
    selectNode,
    validate,
    validationResult,
    getGraph,
    save,
    graphName,
    setGraphName,
    loadGraph,
  };
}
