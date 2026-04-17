/**
 * Node Components — barrel export for all custom React Flow node types.
 *
 * The merged `allNodeTypes` object is passed to React Flow's `nodeTypes` prop.
 * All categories use BaseNode for rendering; the category-specific files exist
 * so custom rendering per category can be added later without restructuring.
 */

export { BaseNode, baseNodeTypes, type BaseNodeData } from "./BaseNode";
export { TriggerNode, triggerNodeTypes } from "./TriggerNodes";
export { ConditionNode, conditionNodeTypes } from "./ConditionNodes";
export { ActionNode, actionNodeTypes } from "./ActionNodes";
export { FlowNode, flowNodeTypes } from "./FlowNodes";

import { baseNodeTypes } from "./BaseNode";

/**
 * Merged nodeTypes for React Flow.
 *
 * All scripting nodes use the "scriptNode" type from BaseNode.
 * Category-specific components can override individual types as needed.
 */
export const allNodeTypes = {
  ...baseNodeTypes,
};
