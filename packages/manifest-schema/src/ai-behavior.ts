/**
 * AI behavior-tree manifest schema.
 *
 * Phase H1 of the World Studio AAA plan — capture AI agent behavior as
 * a tree of typed nodes rather than hardcoded TypeScript in
 * `AgentBehaviorTicker`. A runtime interpreter (separate follow-up)
 * walks the tree per tick to decide what the agent does next.
 *
 * Node model (classical behavior-tree taxonomy):
 *
 * - **Composite** (`sequence` | `selector` | `parallel`): evaluates
 *   children in order with AND/OR/ALL semantics.
 * - **Decorator** (`inverter` | `repeater` | `cooldown` | `succeed` |
 *   `fail`): modifies the result of a single child.
 * - **Action** (`action`): leaf that calls a named service method
 *   (e.g. `"executeAttack"`) with author-authored params. The
 *   interpreter resolves the action name against a runtime registry.
 * - **Condition** (`condition`): leaf that evaluates a named predicate
 *   (`"inCombat"`, `"healthBelow"`, etc.) against the agent's game
 *   state. Expressions stay simple on purpose — complex logic belongs
 *   in the scripting system, not the behavior tree.
 *
 * Trees are stored flat: `nodes: Record<NodeId, Node>` plus a `root`
 * pointer. Children are referenced by id. This avoids JSON recursion
 * depth limits, makes diffs stable, and lets the editor render node
 * graphs without rewalking a nested structure.
 */

import { z } from "zod";

/** Parameter value space — enough to express the AgentBehaviorTicker config today. */
export const BehaviorParamValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export type BehaviorParamValue = z.infer<typeof BehaviorParamValueSchema>;

export const BehaviorParamsSchema = z.record(
  z.string().min(1),
  BehaviorParamValueSchema,
);
export type BehaviorParams = z.infer<typeof BehaviorParamsSchema>;

/**
 * Node id — stable across saves so the editor can diff tree changes.
 * Kept as an opaque string; convention is `node_<slug>` but not enforced.
 */
const NodeId = z.string().min(1);

const BaseNodeFields = {
  id: NodeId,
  /** Optional author label for the editor graph — has no runtime effect. */
  label: z.string().default(""),
};

/** Composite: evaluates `children` (ordered list of node ids). */
export const CompositeNodeSchema = z.object({
  ...BaseNodeFields,
  kind: z.enum(["sequence", "selector", "parallel"]),
  children: z.array(NodeId).min(1),
});
export type CompositeNode = z.infer<typeof CompositeNodeSchema>;

/**
 * Decorator: wraps exactly one child. `repeater` uses `maxIterations`
 * (0 = infinite), `cooldown` uses `seconds`. Other kinds take no params.
 */
export const DecoratorNodeSchema = z.object({
  ...BaseNodeFields,
  kind: z.enum(["inverter", "repeater", "cooldown", "succeed", "fail"]),
  child: NodeId,
  params: BehaviorParamsSchema.default({}),
});
export type DecoratorNode = z.infer<typeof DecoratorNodeSchema>;

/** Action leaf: calls a registered runtime action by name with params. */
export const ActionNodeSchema = z.object({
  ...BaseNodeFields,
  kind: z.literal("action"),
  action: z
    .string()
    .min(1)
    .describe(
      "Runtime-registered action name, e.g. 'executeAttack' or 'executeMove'",
    ),
  params: BehaviorParamsSchema.default({}),
});
export type ActionNode = z.infer<typeof ActionNodeSchema>;

/** Condition leaf: evaluates a registered predicate against agent state. */
export const ConditionNodeSchema = z.object({
  ...BaseNodeFields,
  kind: z.literal("condition"),
  condition: z
    .string()
    .min(1)
    .describe("Runtime-registered predicate, e.g. 'inCombat' or 'healthBelow'"),
  params: BehaviorParamsSchema.default({}),
});
export type ConditionNode = z.infer<typeof ConditionNodeSchema>;

export const BehaviorNodeSchema = z.discriminatedUnion("kind", [
  z.object({
    ...BaseNodeFields,
    kind: z.literal("sequence"),
    children: z.array(NodeId).min(1),
  }),
  z.object({
    ...BaseNodeFields,
    kind: z.literal("selector"),
    children: z.array(NodeId).min(1),
  }),
  z.object({
    ...BaseNodeFields,
    kind: z.literal("parallel"),
    children: z.array(NodeId).min(1),
  }),
  z.object({
    ...BaseNodeFields,
    kind: z.literal("inverter"),
    child: NodeId,
    params: BehaviorParamsSchema.default({}),
  }),
  z.object({
    ...BaseNodeFields,
    kind: z.literal("repeater"),
    child: NodeId,
    params: BehaviorParamsSchema.default({}),
  }),
  z.object({
    ...BaseNodeFields,
    kind: z.literal("cooldown"),
    child: NodeId,
    params: BehaviorParamsSchema.default({}),
  }),
  z.object({
    ...BaseNodeFields,
    kind: z.literal("succeed"),
    child: NodeId,
    params: BehaviorParamsSchema.default({}),
  }),
  z.object({
    ...BaseNodeFields,
    kind: z.literal("fail"),
    child: NodeId,
    params: BehaviorParamsSchema.default({}),
  }),
  ActionNodeSchema,
  ConditionNodeSchema,
]);
export type BehaviorNode = z.infer<typeof BehaviorNodeSchema>;

/**
 * A single tree — flat map of nodes plus a root pointer. Refined to
 * enforce:
 *   - root points at a known node
 *   - every referenced child/child-id resolves
 *   - no node references itself as its own child (would stack-overflow)
 *
 * Cycle detection across longer paths is intentionally NOT enforced
 * here — some valid authoring patterns use `repeater(selector(...))`
 * that points back at its parent. The runtime interpreter caps
 * recursion depth per tick.
 */
export const BehaviorTreeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(""),
    /** Tick rate in seconds at which the interpreter re-walks the tree. */
    tickIntervalSeconds: z.number().positive().default(8),
    root: NodeId,
    nodes: z.record(NodeId, BehaviorNodeSchema),
  })
  .refine(({ root, nodes }) => root in nodes, {
    message: "tree `root` must reference a node in `nodes`",
  })
  .refine(
    ({ nodes }) => {
      for (const [nodeId, node] of Object.entries(nodes)) {
        if (node.id !== nodeId) return false;
      }
      return true;
    },
    { message: "each node's `id` field must equal its key in `nodes`" },
  )
  .refine(
    ({ nodes }) => {
      const ids = new Set(Object.keys(nodes));
      for (const node of Object.values(nodes)) {
        if ("children" in node) {
          if (node.children.some((c) => c === node.id)) return false;
          if (node.children.some((c) => !ids.has(c))) return false;
        } else if ("child" in node) {
          if (node.child === node.id) return false;
          if (!ids.has(node.child)) return false;
        }
      }
      return true;
    },
    {
      message:
        "every child reference must resolve to another node (no self-reference, no dangling ids)",
    },
  );
export type BehaviorTree = z.infer<typeof BehaviorTreeSchema>;

/**
 * Manifest shape — a library of named behavior trees that agents can
 * bind to by id. Refined to enforce unique tree ids.
 */
export const AIBehaviorManifestSchema = z
  .array(BehaviorTreeSchema)
  .refine((list) => new Set(list.map((t) => t.id)).size === list.length, {
    message: "behavior tree ids must be unique",
  });
export type AIBehaviorManifest = z.infer<typeof AIBehaviorManifestSchema>;
