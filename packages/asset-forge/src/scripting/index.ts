/**
 * Visual Scripting — barrel export.
 *
 * Provides the ScriptEditorPanel for integration into World Studio,
 * along with all supporting types, node library, and validation.
 */

// Types
export type {
  ScriptGraph,
  ScriptNode,
  ScriptEdge,
  ScriptVariable,
  PortDefinition,
} from "./types";

// Node library
export {
  NODE_LIBRARY,
  getNodeType,
  getNodesByCategory,
  getAllCategories,
  getCategoryColor,
} from "./nodeLibrary";
export type { NodeTypeDefinition } from "./nodeLibrary";

// Validation
export { validateGraph, getNodeErrors, getNodeWarnings } from "./validation";
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from "./validation";

// Node components
export { allNodeTypes } from "./nodes";
export type { BaseNodeData } from "./nodes";

// Commands
export {
  AddNodeCommand,
  RemoveNodeCommand,
  MoveNodeCommand,
  AddEdgeCommand,
  RemoveEdgeCommand,
  ModifyNodeDataCommand,
} from "./commands/ScriptGraphCommands";

// Hooks
export { useScriptGraphState } from "./hooks/useScriptGraphState";

// Panels
export { ScriptEditorPanel } from "./panels/ScriptEditorPanel";
export type { ScriptEditorPanelProps } from "./panels/ScriptEditorPanel";
export { NodePalette } from "./panels/NodePalette";
export { NodeInspector } from "./panels/NodeInspector";
