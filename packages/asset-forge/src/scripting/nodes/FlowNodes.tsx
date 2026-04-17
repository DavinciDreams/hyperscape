/**
 * FlowNodes — Custom React Flow components for flow-control nodes.
 *
 * Flow nodes manage execution order: Branch (if/else), Sequence, Delay.
 * Purple header. Delegates rendering to BaseNode.
 */

import type { NodeProps } from "@xyflow/react";
import React from "react";

import { BaseNode } from "./BaseNode";

/** Flow node — thin wrapper that delegates to BaseNode. */
export function FlowNode(props: NodeProps) {
  return <BaseNode {...props} />;
}

/** React Flow nodeTypes entries for flow-control nodes. */
export const flowNodeTypes = {
  "flow/branch": FlowNode,
  "flow/sequence": FlowNode,
  "flow/delay": FlowNode,
};
