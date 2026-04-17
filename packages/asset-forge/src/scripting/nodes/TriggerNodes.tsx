/**
 * TriggerNodes — Custom React Flow components for trigger-category nodes.
 *
 * Trigger nodes have no flow input (they are event sources) and always have
 * a green header. All rendering is delegated to BaseNode.
 */

import type { NodeProps } from "@xyflow/react";
import React from "react";

import { BaseNode } from "./BaseNode";

/** Trigger node — thin wrapper that delegates to BaseNode. */
export function TriggerNode(props: NodeProps) {
  return <BaseNode {...props} />;
}

/** React Flow nodeTypes entries for trigger nodes. */
export const triggerNodeTypes = {
  "trigger/onPlayerEnterZone": TriggerNode,
  "trigger/onPlayerLeaveZone": TriggerNode,
  "trigger/onMobKilled": TriggerNode,
  "trigger/onItemCollected": TriggerNode,
  "trigger/onQuestComplete": TriggerNode,
  "trigger/onTimer": TriggerNode,
};
