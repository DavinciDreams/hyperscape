/**
 * ConditionNodes — Custom React Flow components for condition-category nodes.
 *
 * Condition nodes branch execution with True/False outputs.
 * Yellow/amber header. Delegates rendering to BaseNode.
 */

import type { NodeProps } from "@xyflow/react";
import React from "react";

import { BaseNode } from "./BaseNode";

/** Condition node — thin wrapper that delegates to BaseNode. */
export function ConditionNode(props: NodeProps) {
  return <BaseNode {...props} />;
}

/** React Flow nodeTypes entries for condition nodes. */
export const conditionNodeTypes = {
  "condition/hasItem": ConditionNode,
  "condition/questState": ConditionNode,
  "condition/skillLevel": ConditionNode,
  "condition/compareNumber": ConditionNode,
  "condition/and": ConditionNode,
  "condition/or": ConditionNode,
};
