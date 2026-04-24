/**
 * Behavior-tree interpreter.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `ai-behavior.ts`.
 * Takes a validated `BehaviorTree` and walks it per tick, calling
 * registered actions / conditions against a runtime context.
 *
 * Design invariants:
 *   - Pure logic: zero dependencies on ECS / Three.js / networking.
 *   - Single-node recursion cap per tick (prevents runaway loops from
 *     `repeater(selector(...))` patterns that loop back on themselves).
 *   - Decorator state (cooldown last-fire time, repeater iterations)
 *     lives on the interpreter instance, keyed by node id — so the
 *     same tree can be re-ticked across many frames without leaking
 *     state between interpreters.
 */

import type {
  BehaviorNode,
  BehaviorParams,
  BehaviorTree,
} from "@hyperforge/manifest-schema";

/** Tick outcome — classical BT semantics. */
export type NodeStatus = "success" | "failure" | "running";

/**
 * Runtime context passed to every action + condition.
 *
 * - `services`: registry of named action functions. Keyed by the
 *   `action` field on an `ActionNode`. Return status sync or async.
 * - `conditions`: registry of named predicates. Keyed by the
 *   `condition` field on a `ConditionNode`. Return boolean.
 * - `blackboard`: shared scratchpad tree-walker can read/write to
 *   communicate between nodes in one tick (or across ticks).
 * - `nowSec`: clock accessor (injected so tests can use a fake clock).
 */
export interface BehaviorContext {
  services: Record<
    string,
    (
      params: BehaviorParams,
      ctx: BehaviorContext,
    ) => NodeStatus | Promise<NodeStatus>
  >;
  conditions: Record<
    string,
    (params: BehaviorParams, ctx: BehaviorContext) => boolean
  >;
  blackboard: Record<string, unknown>;
  nowSec: () => number;
}

/** Max node-visits per tick — safety bound against pathological loops. */
const DEFAULT_MAX_VISITS_PER_TICK = 10_000;

export interface InterpreterOptions {
  maxVisitsPerTick?: number;
}

/**
 * Read `params[key]` as a number, falling back to `fallback` if absent
 * or wrong type. Authored param values may be strings that look like
 * numbers — we coerce once here so node implementations don't have to.
 */
function readNumberParam(
  params: BehaviorParams,
  key: string,
  fallback: number,
): number {
  const raw = params[key];
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Interpreter. One instance per agent/tree binding. Stateful for
 * decorators that need to remember prior-tick info.
 */
export class BehaviorTreeInterpreter {
  private readonly tree: BehaviorTree;
  private readonly maxVisitsPerTick: number;

  // Per-node decorator state.
  private readonly cooldownLastFireSec = new Map<string, number>();
  private readonly repeaterIterationCount = new Map<string, number>();

  constructor(tree: BehaviorTree, options: InterpreterOptions = {}) {
    this.tree = tree;
    this.maxVisitsPerTick =
      options.maxVisitsPerTick ?? DEFAULT_MAX_VISITS_PER_TICK;
  }

  /** Return the tree id for registry lookups / debug tooling. */
  get treeId(): string {
    return this.tree.id;
  }

  /** Return the tick interval the tree was authored at, in seconds. */
  get tickIntervalSeconds(): number {
    return this.tree.tickIntervalSeconds;
  }

  /**
   * Walk the tree from root. Returns the root node's status for the
   * caller (useful for scheduling / logging). Safe to re-call every
   * tick with the same context object.
   */
  async tick(ctx: BehaviorContext): Promise<NodeStatus> {
    const visitBudget = { remaining: this.maxVisitsPerTick };
    return this.tickNode(this.tree.root, ctx, visitBudget);
  }

  /**
   * Recursively evaluate one node. `visitBudget` is passed by reference
   * so every descendant counts toward the same cap.
   */
  private async tickNode(
    nodeId: string,
    ctx: BehaviorContext,
    visitBudget: { remaining: number },
  ): Promise<NodeStatus> {
    if (visitBudget.remaining <= 0) {
      // Budget exhausted — fail safely; interpreter should not hang.
      return "failure";
    }
    visitBudget.remaining -= 1;

    const node = this.tree.nodes[nodeId];
    if (node === undefined) {
      // Schema validation should prevent this; treat as failure at runtime.
      return "failure";
    }

    switch (node.kind) {
      case "sequence":
        return this.tickSequence(node, ctx, visitBudget);
      case "selector":
        return this.tickSelector(node, ctx, visitBudget);
      case "parallel":
        return this.tickParallel(node, ctx, visitBudget);
      case "inverter":
        return this.tickInverter(node, ctx, visitBudget);
      case "repeater":
        return this.tickRepeater(node, ctx, visitBudget);
      case "cooldown":
        return this.tickCooldown(node, ctx, visitBudget);
      case "succeed":
        // Always returns success regardless of child result.
        await this.tickNode(node.child, ctx, visitBudget);
        return "success";
      case "fail":
        // Always returns failure regardless of child result.
        await this.tickNode(node.child, ctx, visitBudget);
        return "failure";
      case "action":
        return this.tickAction(node, ctx);
      case "condition":
        return this.tickCondition(node, ctx);
      default: {
        const exhaustive: never = node;
        void exhaustive;
        return "failure";
      }
    }
  }

  // ─── Composites ──────────────────────────────────────────────────

  /** Sequence: AND. Tick children in order; first non-success short-circuits. */
  private async tickSequence(
    node: Extract<BehaviorNode, { kind: "sequence" }>,
    ctx: BehaviorContext,
    visitBudget: { remaining: number },
  ): Promise<NodeStatus> {
    for (const childId of node.children) {
      const status = await this.tickNode(childId, ctx, visitBudget);
      if (status !== "success") return status;
    }
    return "success";
  }

  /** Selector: OR. Tick children in order; first non-failure short-circuits. */
  private async tickSelector(
    node: Extract<BehaviorNode, { kind: "selector" }>,
    ctx: BehaviorContext,
    visitBudget: { remaining: number },
  ): Promise<NodeStatus> {
    for (const childId of node.children) {
      const status = await this.tickNode(childId, ctx, visitBudget);
      if (status !== "failure") return status;
    }
    return "failure";
  }

  /**
   * Parallel: ALL children ticked. Aggregate status:
   *   - any failure → failure
   *   - any running → running
   *   - otherwise → success
   *
   * Ticks sequentially (not concurrently) so action ordering is
   * deterministic per authored child order.
   */
  private async tickParallel(
    node: Extract<BehaviorNode, { kind: "parallel" }>,
    ctx: BehaviorContext,
    visitBudget: { remaining: number },
  ): Promise<NodeStatus> {
    let sawRunning = false;
    for (const childId of node.children) {
      const status = await this.tickNode(childId, ctx, visitBudget);
      if (status === "failure") return "failure";
      if (status === "running") sawRunning = true;
    }
    return sawRunning ? "running" : "success";
  }

  // ─── Decorators ──────────────────────────────────────────────────

  private async tickInverter(
    node: Extract<BehaviorNode, { kind: "inverter" }>,
    ctx: BehaviorContext,
    visitBudget: { remaining: number },
  ): Promise<NodeStatus> {
    const status = await this.tickNode(node.child, ctx, visitBudget);
    if (status === "success") return "failure";
    if (status === "failure") return "success";
    return "running";
  }

  /**
   * Repeater: reruns child up to `maxIterations` times. `maxIterations=0`
   * is infinite — capped by `visitBudget` for safety. Each re-entry
   * ticks the child; child status is ignored until the iteration cap
   * is hit (then returns success) or until the child returns running
   * (then returns running to let the next tick resume).
   */
  private async tickRepeater(
    node: Extract<BehaviorNode, { kind: "repeater" }>,
    ctx: BehaviorContext,
    visitBudget: { remaining: number },
  ): Promise<NodeStatus> {
    const maxIter = Math.max(
      0,
      Math.floor(readNumberParam(node.params, "maxIterations", 0)),
    );

    let iter = 0;
    while (true) {
      if (visitBudget.remaining <= 0) return "failure";
      const status = await this.tickNode(node.child, ctx, visitBudget);
      iter += 1;
      if (status === "running") {
        this.repeaterIterationCount.set(node.id, iter);
        return "running";
      }
      if (maxIter > 0 && iter >= maxIter) {
        this.repeaterIterationCount.set(node.id, 0);
        return "success";
      }
    }
  }

  /**
   * Cooldown: only tick child if `seconds` have elapsed since the last
   * successful/running fire. Otherwise returns failure. Records
   * last-fire time on success AND running (so the cooldown clock
   * starts when the action actually started).
   */
  private async tickCooldown(
    node: Extract<BehaviorNode, { kind: "cooldown" }>,
    ctx: BehaviorContext,
    visitBudget: { remaining: number },
  ): Promise<NodeStatus> {
    const seconds = Math.max(0, readNumberParam(node.params, "seconds", 0));
    const now = ctx.nowSec();
    const last = this.cooldownLastFireSec.get(node.id);
    if (last !== undefined && now - last < seconds) {
      return "failure";
    }
    const status = await this.tickNode(node.child, ctx, visitBudget);
    if (status !== "failure") {
      this.cooldownLastFireSec.set(node.id, now);
    }
    return status;
  }

  // ─── Leaves ──────────────────────────────────────────────────────

  private async tickAction(
    node: Extract<BehaviorNode, { kind: "action" }>,
    ctx: BehaviorContext,
  ): Promise<NodeStatus> {
    const fn = ctx.services[node.action];
    if (fn === undefined) {
      // Unknown action — treat as failure at runtime (author bug).
      return "failure";
    }
    const result = fn(node.params, ctx);
    return result instanceof Promise ? await result : result;
  }

  private tickCondition(
    node: Extract<BehaviorNode, { kind: "condition" }>,
    ctx: BehaviorContext,
  ): NodeStatus {
    const fn = ctx.conditions[node.condition];
    if (fn === undefined) return "failure";
    return fn(node.params, ctx) ? "success" : "failure";
  }
}
