/**
 * ActionNodes — Custom React Flow components for action-category nodes.
 *
 * Action nodes perform side effects (spawn, teleport, give item, etc.).
 * Blue header. Delegates rendering to BaseNode.
 */

import type { NodeProps } from "@xyflow/react";
import React from "react";

import { BaseNode } from "./BaseNode";

/** Action node — thin wrapper that delegates to BaseNode. */
export function ActionNode(props: NodeProps) {
  return <BaseNode {...props} />;
}

/** React Flow nodeTypes entries for action nodes. */
export const actionNodeTypes = {
  "action/spawnMob": ActionNode,
  "action/despawnEntity": ActionNode,
  "action/teleportPlayer": ActionNode,
  "action/showDialogue": ActionNode,
  "action/startQuest": ActionNode,
  "action/playSound": ActionNode,
  "action/setVariable": ActionNode,
  "action/giveItem": ActionNode,
};
