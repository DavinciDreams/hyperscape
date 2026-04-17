/**
 * ScriptGraphCommands — Undoable commands for visual scripting graph operations.
 *
 * All graph mutations flow through CommandHistory so every edit can be
 * undone/redone. Uses the existing Command interface and commandHistory
 * singleton from the editor.
 */

import type { Command, UndoChannel } from "../../editor/commands/Command";
import type { ScriptNode, ScriptEdge } from "../types";

/** All scripting commands use the "global" undo channel. */
const CHANNEL: UndoChannel = "global";

// ============== ADD NODE ==============

export interface AddNodeTarget {
  onAdd: (node: ScriptNode) => void;
  onRemove: (nodeId: string) => void;
}

/** Adds a node to the graph. Undo removes it. */
export class AddNodeCommand implements Command {
  readonly type = "ScriptAddNode";
  readonly channel = CHANNEL;
  private node: ScriptNode;
  private target: AddNodeTarget;

  constructor(node: ScriptNode, target: AddNodeTarget) {
    this.node = node;
    this.target = target;
  }

  execute(): void {
    this.target.onAdd(this.node);
  }

  undo(): void {
    this.target.onRemove(this.node.id);
  }
}

// ============== REMOVE NODE ==============

export interface RemoveNodeTarget {
  onRemove: (nodeId: string) => void;
  onAdd: (node: ScriptNode) => void;
  /** Edges that were connected to this node (saved for undo). */
  connectedEdges: ScriptEdge[];
  onAddEdge: (edge: ScriptEdge) => void;
  onRemoveEdge: (edgeId: string) => void;
}

/** Removes a node and its connected edges. Undo restores both. */
export class RemoveNodeCommand implements Command {
  readonly type = "ScriptRemoveNode";
  readonly channel = CHANNEL;
  private node: ScriptNode;
  private target: RemoveNodeTarget;

  constructor(node: ScriptNode, target: RemoveNodeTarget) {
    this.node = node;
    this.target = target;
  }

  execute(): void {
    // Remove connected edges first
    for (const edge of this.target.connectedEdges) {
      this.target.onRemoveEdge(edge.id);
    }
    this.target.onRemove(this.node.id);
  }

  undo(): void {
    this.target.onAdd(this.node);
    // Restore connected edges
    for (const edge of this.target.connectedEdges) {
      this.target.onAddEdge(edge);
    }
  }
}

// ============== MOVE NODE ==============

export interface MoveNodeTarget {
  onMove: (nodeId: string, position: { x: number; y: number }) => void;
}

/** Moves a node to a new position. Used for undo of drag operations. */
export class MoveNodeCommand implements Command {
  readonly type = "ScriptMoveNode";
  readonly channel = CHANNEL;
  private nodeId: string;
  private oldPosition: { x: number; y: number };
  private newPosition: { x: number; y: number };
  private target: MoveNodeTarget;

  constructor(
    nodeId: string,
    oldPosition: { x: number; y: number },
    newPosition: { x: number; y: number },
    target: MoveNodeTarget,
  ) {
    this.nodeId = nodeId;
    this.oldPosition = { ...oldPosition };
    this.newPosition = { ...newPosition };
    this.target = target;
  }

  execute(): void {
    this.target.onMove(this.nodeId, this.newPosition);
  }

  undo(): void {
    this.target.onMove(this.nodeId, this.oldPosition);
  }

  canMerge(other: Command): boolean {
    return other instanceof MoveNodeCommand && other.nodeId === this.nodeId;
  }

  merge(other: Command): void {
    if (other instanceof MoveNodeCommand) {
      this.newPosition = { ...other.newPosition };
    }
  }
}

// ============== ADD EDGE ==============

export interface AddEdgeTarget {
  onAdd: (edge: ScriptEdge) => void;
  onRemove: (edgeId: string) => void;
}

/** Adds an edge between two ports. */
export class AddEdgeCommand implements Command {
  readonly type = "ScriptAddEdge";
  readonly channel = CHANNEL;
  private edge: ScriptEdge;
  private target: AddEdgeTarget;

  constructor(edge: ScriptEdge, target: AddEdgeTarget) {
    this.edge = edge;
    this.target = target;
  }

  execute(): void {
    this.target.onAdd(this.edge);
  }

  undo(): void {
    this.target.onRemove(this.edge.id);
  }
}

// ============== REMOVE EDGE ==============

export interface RemoveEdgeTarget {
  onRemove: (edgeId: string) => void;
  onAdd: (edge: ScriptEdge) => void;
}

/** Removes an edge. */
export class RemoveEdgeCommand implements Command {
  readonly type = "ScriptRemoveEdge";
  readonly channel = CHANNEL;
  private edge: ScriptEdge;
  private target: RemoveEdgeTarget;

  constructor(edge: ScriptEdge, target: RemoveEdgeTarget) {
    this.edge = edge;
    this.target = target;
  }

  execute(): void {
    this.target.onRemove(this.edge.id);
  }

  undo(): void {
    this.target.onAdd(this.edge);
  }
}

// ============== MODIFY NODE DATA ==============

export interface ModifyNodeDataTarget {
  onUpdate: (nodeId: string, key: string, value: unknown) => void;
}

/** Changes a field value on a node. */
export class ModifyNodeDataCommand implements Command {
  readonly type = "ScriptModifyNodeData";
  readonly channel = CHANNEL;
  private nodeId: string;
  private key: string;
  private oldValue: unknown;
  private newValue: unknown;
  private target: ModifyNodeDataTarget;

  constructor(
    nodeId: string,
    key: string,
    oldValue: unknown,
    newValue: unknown,
    target: ModifyNodeDataTarget,
  ) {
    this.nodeId = nodeId;
    this.key = key;
    this.oldValue = oldValue;
    this.newValue = newValue;
    this.target = target;
  }

  execute(): void {
    this.target.onUpdate(this.nodeId, this.key, this.newValue);
  }

  undo(): void {
    this.target.onUpdate(this.nodeId, this.key, this.oldValue);
  }

  canMerge(other: Command): boolean {
    return (
      other instanceof ModifyNodeDataCommand &&
      other.nodeId === this.nodeId &&
      other.key === this.key
    );
  }

  merge(other: Command): void {
    if (other instanceof ModifyNodeDataCommand) {
      this.newValue = other.newValue;
    }
  }
}
