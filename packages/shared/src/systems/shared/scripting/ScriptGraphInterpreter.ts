/**
 * ScriptGraphInterpreter — Walks a script graph from a trigger node,
 * following flow edges through conditions and executing actions.
 *
 * Execution model:
 * 1. Trigger fires → interpreter starts at trigger node
 * 2. Follows outgoing flow edges to next node
 * 3. Condition nodes evaluate → choose true/false output
 * 4. Action nodes call ActionExecutor
 * 5. Delay nodes pause execution, resume after timer
 * 6. Max 50 nodes per tick to prevent blocking
 */

// ---------------------------------------------------------------------------
// Types (duplicated from editor — runtime doesn't import editor code)
// ---------------------------------------------------------------------------

export interface RuntimeScriptGraph {
  id: string;
  name: string;
  graphType: string;
  nodes: RuntimeScriptNode[];
  edges: RuntimeScriptEdge[];
  variables: RuntimeScriptVariable[];
}

export interface RuntimeScriptNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  inputs: RuntimePortDef[];
  outputs: RuntimePortDef[];
}

export interface RuntimePortDef {
  id: string;
  type: "flow" | "data";
  dataType?: string;
}

export interface RuntimeScriptEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface RuntimeScriptVariable {
  id: string;
  name: string;
  type: string;
  defaultValue: unknown;
}

// ---------------------------------------------------------------------------
// Execution context
// ---------------------------------------------------------------------------

export interface ExecutionContext {
  /** Trigger event data */
  triggerData: Record<string, unknown>;
  /** Per-graph variable store */
  variables: Map<string, unknown>;
  /** Entity ID that owns this graph */
  entityId: string;
  /** World reference for action execution */
  world: ScriptingWorldInterface;
  /**
   * Phase 2.2 — Function-graph registry. When present, `flow/callGraph`
   * nodes can look up and execute other graphs by id. Absent for regular
   * entity/world graphs (calling `flow/callGraph` is a no-op).
   */
  graphRegistry?: GraphRegistry;
  /**
   * Phase 2.2 — Current sub-graph call depth. Used to bound recursion
   * at `MAX_CALL_DEPTH`. Starts at 0 for top-level execution and
   * increments by one per `flow/callGraph` hop.
   */
  callDepth?: number;
}

/**
 * Phase 2.2 — Lookup surface for function graphs referenced by
 * `flow/callGraph` nodes. Implementations must only return graphs whose
 * `graphType === "function"`; returning `null` for unknown or
 * non-function ids makes a `callGraph` node a no-op.
 */
export interface GraphRegistry {
  getFunctionInterpreter(id: string): ScriptGraphInterpreter | null;
}

/** Minimal world interface the interpreter needs. */
export interface ScriptingWorldInterface {
  emit(event: string, data: Record<string, unknown>): void;
  getEntityById(id: string): Record<string, unknown> | null;
  getTime(): number;
  /**
   * Phase 2.1 — Spatial query. Return all entities within `radius` of
   * `(x, z)` on the XZ-plane. Optional `type` filters by entity type
   * (e.g. "mob", "player"). Implementations may return an empty array
   * if spatial indexing is unavailable.
   */
  getEntitiesInRadius?(
    x: number,
    z: number,
    radius: number,
    type?: string,
  ): Array<{
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
  }>;
  /**
   * Phase 2.1 — Raycast. Origin + direction + max distance. Returns the
   * first hit (with optional `entityId` if the hit belongs to a
   * registered entity) or null. Implementations may return null when
   * physics is unavailable (e.g. headless server).
   */
  raycast?(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance: number,
  ): {
    entityId?: string;
    point: { x: number; y: number; z: number };
    distance: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Action handler type
// ---------------------------------------------------------------------------

export type ActionHandler = (
  nodeData: Record<string, unknown>,
  ctx: ExecutionContext,
) => void | Promise<void>;

export type ConditionEvaluator = (
  nodeData: Record<string, unknown>,
  ctx: ExecutionContext,
) => boolean;

// ---------------------------------------------------------------------------
// Interpreter
// ---------------------------------------------------------------------------

/** Result of a single node execution step. */
interface StepResult {
  /** Next node IDs to execute (empty = end of branch) */
  next: string[];
  /** Whether to delay before continuing */
  delayMs?: number;
}

export class ScriptGraphInterpreter {
  private graph: RuntimeScriptGraph;
  private nodeMap: Map<string, RuntimeScriptNode>;
  private outgoingEdges: Map<string, RuntimeScriptEdge[]>;
  /** Incoming edges indexed by "targetNodeId:targetPortId" for O(1) readDataInput lookups */
  private incomingByPort: Map<string, RuntimeScriptEdge>;
  /** Pre-computed node category cache: nodeId → category string */
  private nodeCategory: Map<string, string>;
  /** Cached trigger nodes (computed once in constructor) */
  private triggerNodeCache: RuntimeScriptNode[];
  /**
   * Phase 6.3/6.4 — Pre-computed flow successor list per source node.
   * Populated at construction; `getFlowSuccessors` becomes an O(1) Map
   * lookup instead of filtering edges + allocating a Set each call.
   */
  private flowSuccessorsCache: Map<string, string[]>;
  /**
   * Phase 6.3/6.4 — Outgoing successors indexed by "nodeId:portId".
   * `getPortSuccessors` / `getMatchingPortSuccessors` use this to avoid
   * allocating filter closures on hot paths.
   */
  private successorsByPort: Map<string, string[]>;
  /** Shared empty-array sentinel — avoids allocating `[]` on every miss. */
  private static readonly EMPTY_STRINGS: readonly string[] = Object.freeze([]);

  /** Registered action handlers */
  private actions: Map<string, ActionHandler> = new Map();
  /** Registered condition evaluators */
  private conditions: Map<string, ConditionEvaluator> = new Map();
  /** Per-node runtime state for stateful flow nodes (doN counters, flipFlop, gate, multiGate) */
  private flowState: Map<string, Record<string, unknown>> = new Map();

  /**
   * Execution safety limits (Phase 5.2 of PLAN.md).
   *
   * These bound the work a single `execute()` call can perform. Hitting any
   * of them aborts execution and emits an `ERR` debug entry.
   */
  /** Max nodes to execute per invocation of `execute()`. */
  private static readonly MAX_NODES_PER_TICK = 1000;
  /** Max iterations for a single flow/forLoop or flow/whileLoop execution. */
  private static readonly MAX_LOOP_ITERATIONS = 10000;
  /** Max nested flow/callGraph depth. Guards against infinite recursion. */
  private static readonly MAX_CALL_DEPTH = 32;
  /** Max delayed continuations a single invocation may queue. */
  private static readonly MAX_DELAYED_CONTINUATIONS = 256;

  constructor(graph: RuntimeScriptGraph) {
    this.graph = graph;
    this.nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

    // Build outgoing edge index: sourceNodeId → edges
    this.outgoingEdges = new Map();
    // Build incoming edge index: "targetNodeId:targetPortId" → edge (first match wins)
    this.incomingByPort = new Map();

    for (const edge of graph.edges) {
      const existing = this.outgoingEdges.get(edge.sourceNodeId) ?? [];
      existing.push(edge);
      this.outgoingEdges.set(edge.sourceNodeId, existing);

      const portKey = `${edge.targetNodeId}:${edge.targetPortId}`;
      if (!this.incomingByPort.has(portKey)) {
        this.incomingByPort.set(portKey, edge);
      }
    }

    // Pre-compute node categories to avoid repeated string splits
    this.nodeCategory = new Map();
    for (const node of graph.nodes) {
      this.nodeCategory.set(node.id, node.type.split("/")[0]);
    }

    // Cache trigger nodes for frequent access
    this.triggerNodeCache = graph.nodes.filter((n) =>
      n.type.startsWith("trigger/"),
    );

    // Phase 6.3 — Build `nodeId:portId → successor ids` index.
    this.successorsByPort = new Map();
    for (const edge of graph.edges) {
      const key = `${edge.sourceNodeId}:${edge.sourcePortId}`;
      const arr = this.successorsByPort.get(key);
      if (arr) {
        arr.push(edge.targetNodeId);
      } else {
        this.successorsByPort.set(key, [edge.targetNodeId]);
      }
    }

    // Phase 6.4 — Pre-compute flow successors per node so the hot-path
    // `getFlowSuccessors` is a single Map lookup. Port definitions
    // (flow vs data) are resolved once; nodes without port defs fall
    // back to the edge-name convention used previously.
    this.flowSuccessorsCache = new Map();
    const DATA_PORT_NAMES = new Set([
      "player",
      "entity",
      "killer",
      "target",
      "item",
      "mob",
      "npc",
      "value",
      "result",
    ]);
    for (const node of graph.nodes) {
      const edges = this.outgoingEdges.get(node.id);
      if (!edges || edges.length === 0) continue;

      let flowTargets: string[];
      if (node.outputs.length > 0) {
        const flowPortIds = new Set(
          node.outputs.filter((p) => p.type === "flow").map((p) => p.id),
        );
        flowTargets = [];
        for (const e of edges) {
          if (flowPortIds.has(e.sourcePortId)) flowTargets.push(e.targetNodeId);
        }
      } else {
        flowTargets = [];
        for (const e of edges) {
          if (!DATA_PORT_NAMES.has(e.sourcePortId))
            flowTargets.push(e.targetNodeId);
        }
      }
      if (flowTargets.length > 0) {
        this.flowSuccessorsCache.set(node.id, flowTargets);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  registerAction(nodeType: string, handler: ActionHandler): void {
    this.actions.set(nodeType, handler);
  }

  registerCondition(nodeType: string, evaluator: ConditionEvaluator): void {
    this.conditions.set(nodeType, evaluator);
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  /**
   * Execute the graph starting from a trigger node.
   * Returns a list of delayed continuations if any Delay nodes are encountered.
   */
  async execute(
    triggerNodeId: string,
    ctx: ExecutionContext,
  ): Promise<DelayedContinuation[]> {
    const trigger = this.nodeMap.get(triggerNodeId);
    if (!trigger) return [];

    const continuations: DelayedContinuation[] = [];
    // Copy — getFlowSuccessors returns a cached array that must not be
    // mutated by the caller's `queue.shift()` drain below.
    const queue: string[] = this.getFlowSuccessors(triggerNodeId).slice();
    let executed = 0;
    let tickLimitHit = false;
    let continuationLimitHit = false;

    while (queue.length > 0) {
      if (executed >= ScriptGraphInterpreter.MAX_NODES_PER_TICK) {
        tickLimitHit = true;
        break;
      }
      const nodeId = queue.shift()!;
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;

      executed++;
      const result = await this.executeNode(node, ctx);

      if (result.delayMs !== undefined && result.delayMs > 0) {
        if (
          continuations.length >=
          ScriptGraphInterpreter.MAX_DELAYED_CONTINUATIONS
        ) {
          continuationLimitHit = true;
          break;
        }
        // Schedule delayed continuation — defensively copy since
        // `result.next` may alias a cached flow-successor array.
        continuations.push({
          graphId: this.graph.id,
          resumeNodeIds: result.next.slice(),
          delayMs: result.delayMs,
          context: ctx,
        });
      } else {
        // Add successors to the execution queue
        queue.push(...result.next);
      }
    }

    if (tickLimitHit) {
      ctx.world.emit("scripting:limit_hit", {
        graphId: this.graph.id,
        entityId: ctx.entityId,
        limit: "MAX_NODES_PER_TICK",
        value: ScriptGraphInterpreter.MAX_NODES_PER_TICK,
      });
    }
    if (continuationLimitHit) {
      ctx.world.emit("scripting:limit_hit", {
        graphId: this.graph.id,
        entityId: ctx.entityId,
        limit: "MAX_DELAYED_CONTINUATIONS",
        value: ScriptGraphInterpreter.MAX_DELAYED_CONTINUATIONS,
      });
    }

    return continuations;
  }

  /**
   * Execute a single node and determine the next nodes to execute.
   */
  private async executeNode(
    node: RuntimeScriptNode,
    ctx: ExecutionContext,
  ): Promise<StepResult> {
    const category = this.nodeCategory.get(node.id) ?? node.type.split("/")[0];

    switch (category) {
      case "trigger":
        // Triggers just pass through
        return { next: this.getFlowSuccessors(node.id) };

      case "condition":
        return this.executeCondition(node, ctx);

      case "action":
        return this.executeAction(node, ctx);

      case "flow":
        return this.executeFlowControl(node, ctx);

      case "math":
        // Math nodes are data-only; they compute on pull via evaluateDataNode().
        // If they appear in the flow graph, just pass through.
        return { next: this.getFlowSuccessors(node.id) };

      case "variable":
        return this.executeVariable(node, ctx);

      case "data":
        // Data nodes are pull-based; pass through if in flow graph.
        return { next: this.getFlowSuccessors(node.id) };

      default:
        console.warn(`[ScriptInterpreter] Unknown node category: ${category}`);
        return { next: [] };
    }
  }

  private executeCondition(
    node: RuntimeScriptNode,
    ctx: ExecutionContext,
  ): StepResult {
    const evaluator = this.conditions.get(node.type);
    if (!evaluator) {
      console.warn(
        `[ScriptInterpreter] No evaluator for condition: ${node.type}`,
      );
      return { next: [] };
    }

    const result = evaluator(node.data, ctx);

    // Find successors for true/false branches via edges directly
    const portIds = result
      ? ["true", "out_true", "true_out"]
      : ["false", "out_false", "false_out"];

    return { next: this.getMatchingPortSuccessors(node.id, portIds) };
  }

  private async executeAction(
    node: RuntimeScriptNode,
    ctx: ExecutionContext,
  ): Promise<StepResult> {
    const handler = this.actions.get(node.type);
    if (!handler) {
      console.warn(`[ScriptInterpreter] No handler for action: ${node.type}`);
      return { next: this.getFlowSuccessors(node.id) };
    }

    await handler(node.data, ctx);
    return { next: this.getFlowSuccessors(node.id) };
  }

  private async executeFlowControl(
    node: RuntimeScriptNode,
    ctx: ExecutionContext,
  ): Promise<StepResult> {
    const flowType = node.type.split("/")[1];

    switch (flowType) {
      case "branch": {
        // Branch evaluates an inline condition
        const conditionField = node.data.condition as string | undefined;
        const conditionValue = conditionField
          ? ctx.variables.get(conditionField)
          : node.data.value;
        const result = !!conditionValue;

        const portIds = result
          ? ["true", "out_true", "true_out"]
          : ["false", "out_false", "false_out"];
        return { next: this.getMatchingPortSuccessors(node.id, portIds) };
      }

      case "sequence": {
        // Sequence executes all outputs in order
        return { next: this.getFlowSuccessors(node.id) };
      }

      case "delay": {
        // Support both "delayMs" (runtime canonical) and "duration" in seconds (editor field)
        const delayMs =
          (node.data.delayMs as number) ??
          ((node.data.duration as number | undefined) !== undefined
            ? (node.data.duration as number) * 1000
            : 1000);
        return {
          next: this.getFlowSuccessors(node.id),
          delayMs,
        };
      }

      case "gate": {
        const state = this.getFlowState(node.id);
        if (state.isOpen === undefined) {
          state.isOpen = (node.data.startOpen as boolean) ?? true;
        }
        // Check for open/close trigger edges (handled by edge convention)
        return state.isOpen
          ? { next: this.getFlowSuccessors(node.id) }
          : { next: [] };
      }

      case "doN": {
        const state = this.getFlowState(node.id);
        const maxCount = (node.data.count as number) ?? 1;
        state.execCount = ((state.execCount as number) ?? 0) + 1;
        if ((state.execCount as number) <= maxCount) {
          return { next: this.getFlowSuccessors(node.id) };
        }
        return { next: [] };
      }

      case "flipFlop": {
        const state = this.getFlowState(node.id);
        const isA = !(state.isA as boolean | undefined);
        state.isA = isA;
        const portIds = isA ? ["a_out"] : ["b_out"];
        return { next: this.getMatchingPortSuccessors(node.id, portIds) };
      }

      case "multiGate": {
        const state = this.getFlowState(node.id);
        const idx = ((state.index as number) ?? -1) + 1;
        // Find how many out_N ports have edges
        const edges = this.outgoingEdges.get(node.id) ?? [];
        const outPorts = edges
          .map((ed) => ed.sourcePortId)
          .filter((p) => p.startsWith("out_"));
        const maxIdx = outPorts.length;
        state.index = maxIdx > 0 ? idx % maxIdx : 0;
        return { next: this.getPortSuccessors(node.id, `out_${state.index}`) };
      }

      case "forEach":
        // forEach requires a collection from data input — pass through for now
        return { next: this.getFlowSuccessors(node.id) };

      case "callGraph": {
        // Phase 2.2 — Sub-graph / function graph dispatch.
        // Fields: graphId (string), arguments (Record<string, unknown>),
        //         returnVariables (string[]).
        const graphId = node.data.graphId as string | undefined;
        const completedNext = this.getFlowSuccessors(node.id);
        if (!graphId || !ctx.graphRegistry) {
          return { next: completedNext };
        }

        const depth = (ctx.callDepth ?? 0) + 1;
        if (depth > ScriptGraphInterpreter.MAX_CALL_DEPTH) {
          ctx.world.emit("scripting:limit_hit", {
            graphId: this.graph.id,
            entityId: ctx.entityId,
            nodeId: node.id,
            limit: "MAX_CALL_DEPTH",
            value: ScriptGraphInterpreter.MAX_CALL_DEPTH,
          });
          return { next: completedNext };
        }

        const subInterp = ctx.graphRegistry.getFunctionInterpreter(graphId);
        if (!subInterp) {
          return { next: completedNext };
        }

        // Build sub-context. Variables are a fresh map seeded from the
        // node's `arguments` field and any connected data inputs named
        // after the argument keys.
        const argsField =
          (node.data.arguments as Record<string, unknown> | undefined) ?? {};
        const subVariables = new Map<string, unknown>();
        for (const [k, v] of Object.entries(argsField)) {
          // Connected data input wins over the static default.
          const connected = this.readDataInput(node.id, k, ctx);
          subVariables.set(k, connected !== null ? connected : v);
        }

        const subCtx: ExecutionContext = {
          triggerData: { ...argsField },
          variables: subVariables,
          entityId: ctx.entityId,
          world: ctx.world,
          graphRegistry: ctx.graphRegistry,
          callDepth: depth,
        };

        // Find the function's entry trigger (trigger/onFunctionCall).
        const entry = subInterp
          .getTriggerNodes()
          .find((n) => n.type === "trigger/onFunctionCall");
        if (!entry) {
          return { next: completedNext };
        }

        // Execute the sub-graph. Delayed continuations from inside a
        // function call are dropped (they can't be scheduled
        // independently of the caller's tick).
        await subInterp.execute(entry.id, subCtx);

        // Copy requested return variables back into the caller's scope.
        const returns = node.data.returnVariables;
        if (Array.isArray(returns)) {
          for (const name of returns) {
            if (typeof name === "string" && subVariables.has(name)) {
              ctx.variables.set(name, subVariables.get(name));
            }
          }
        }

        return { next: completedNext };
      }

      case "forLoop": {
        // Fields: start, end, step, indexVariable. Inputs: start/end/step.
        // Outputs: body (per iteration), completed (once).
        const start = this.resolveNumber(node, "start", ctx);
        const endRaw = this.resolveNumber(node, "end", ctx);
        const stepRaw = this.resolveNumber(node, "step", ctx);
        const step = stepRaw === 0 ? 1 : stepRaw; // guard: step of 0 defaults to 1
        const indexVar =
          (node.data.indexVariable as string | undefined) ?? "loopIndex";
        const bodyPortIds = ["body", "body_out", "out_body"];
        const completedPortIds = [
          "completed",
          "completed_out",
          "out_completed",
        ];
        const bodyStarts = this.getMatchingPortSuccessors(node.id, bodyPortIds);
        const completedNext = this.getMatchingPortSuccessors(
          node.id,
          completedPortIds,
        );

        if (stepRaw === 0) {
          ctx.world.emit("scripting:limit_hit", {
            graphId: this.graph.id,
            entityId: ctx.entityId,
            nodeId: node.id,
            limit: "FOR_LOOP_ZERO_STEP",
            value: 0,
          });
          return { next: completedNext };
        }

        let i = start;
        let iterations = 0;
        let limitHit = false;
        const shouldContinue = (): boolean =>
          step > 0 ? i < endRaw : i > endRaw;
        while (shouldContinue()) {
          if (iterations >= ScriptGraphInterpreter.MAX_LOOP_ITERATIONS) {
            limitHit = true;
            break;
          }
          iterations++;
          ctx.variables.set(indexVar, i);
          await this.runBodySync(bodyStarts, ctx);
          i += step;
        }

        if (limitHit) {
          ctx.world.emit("scripting:limit_hit", {
            graphId: this.graph.id,
            entityId: ctx.entityId,
            nodeId: node.id,
            limit: "MAX_LOOP_ITERATIONS",
            value: ScriptGraphInterpreter.MAX_LOOP_ITERATIONS,
          });
        }
        return { next: completedNext };
      }

      case "whileLoop": {
        // Inputs: condition (boolean). Outputs: body, completed.
        // Condition is re-evaluated each iteration via readDataInput.
        const bodyPortIds = ["body", "body_out", "out_body"];
        const completedPortIds = [
          "completed",
          "completed_out",
          "out_completed",
        ];
        const bodyStarts = this.getMatchingPortSuccessors(node.id, bodyPortIds);
        const completedNext = this.getMatchingPortSuccessors(
          node.id,
          completedPortIds,
        );

        let iterations = 0;
        let limitHit = false;
        while (true) {
          const cond =
            this.readDataInput(node.id, "condition", ctx) ??
            node.data.condition;
          if (!cond) break;
          if (iterations >= ScriptGraphInterpreter.MAX_LOOP_ITERATIONS) {
            limitHit = true;
            break;
          }
          iterations++;
          await this.runBodySync(bodyStarts, ctx);
        }

        if (limitHit) {
          ctx.world.emit("scripting:limit_hit", {
            graphId: this.graph.id,
            entityId: ctx.entityId,
            nodeId: node.id,
            limit: "MAX_LOOP_ITERATIONS",
            value: ScriptGraphInterpreter.MAX_LOOP_ITERATIONS,
          });
        }
        return { next: completedNext };
      }

      default:
        return { next: this.getFlowSuccessors(node.id) };
    }
  }

  /**
   * Execute a loop body inline (synchronously w.r.t. the outer loop). Processes
   * a mini-queue of successors via executeNode. Delays inside loop bodies are
   * ignored (they would escape the loop semantics). Used by flow/forLoop and
   * flow/whileLoop.
   */
  private async runBodySync(
    bodyStarts: string[],
    ctx: ExecutionContext,
  ): Promise<void> {
    if (bodyStarts.length === 0) return;
    const queue: string[] = [...bodyStarts];
    let bodyExecuted = 0;
    while (queue.length > 0) {
      if (bodyExecuted >= ScriptGraphInterpreter.MAX_NODES_PER_TICK) {
        // Defensive: stop runaway body fanouts; outer tick limit guard.
        break;
      }
      const nextId = queue.shift()!;
      const bodyNode = this.nodeMap.get(nextId);
      if (!bodyNode) continue;
      bodyExecuted++;
      const res = await this.executeNode(bodyNode, ctx);
      // Delays are dropped inside loop bodies by design.
      queue.push(...res.next);
    }
  }

  /** Get or initialize runtime state for a stateful flow node. */
  private getFlowState(nodeId: string): Record<string, unknown> {
    let state = this.flowState.get(nodeId);
    if (!state) {
      state = {};
      this.flowState.set(nodeId, state);
    }
    return state;
  }

  // ---------------------------------------------------------------------------
  // Edge traversal helpers
  // ---------------------------------------------------------------------------

  /** Get all flow-connected successor node IDs from any output port. */
  private getFlowSuccessors(nodeId: string): string[] {
    // Phase 6.4 — O(1) lookup against the pre-computed flow successor
    // cache. Returns a shared frozen empty array on miss to avoid
    // per-call allocations.
    return (
      this.flowSuccessorsCache.get(nodeId) ??
      (ScriptGraphInterpreter.EMPTY_STRINGS as string[])
    );
  }

  /** Get successor node IDs from a specific output port. */
  private getPortSuccessors(nodeId: string, portId: string): string[] {
    // Phase 6.4 — direct Map lookup on pre-built `nodeId:portId` index.
    return (
      this.successorsByPort.get(`${nodeId}:${portId}`) ??
      (ScriptGraphInterpreter.EMPTY_STRINGS as string[])
    );
  }

  /** Get successors matching any of the given port IDs (edge-based, no port defs needed). */
  private getMatchingPortSuccessors(
    nodeId: string,
    portIds: string[],
  ): string[] {
    // Phase 6.4 — Resolve each port via the pre-built index and merge.
    // For the common single-port case we return the pre-built array
    // directly without copying.
    if (portIds.length === 1) {
      return (
        this.successorsByPort.get(`${nodeId}:${portIds[0]}`) ??
        (ScriptGraphInterpreter.EMPTY_STRINGS as string[])
      );
    }
    let merged: string[] | null = null;
    for (const portId of portIds) {
      const hit = this.successorsByPort.get(`${nodeId}:${portId}`);
      if (!hit) continue;
      if (merged === null) {
        merged = hit.slice();
      } else {
        for (const id of hit) merged.push(id);
      }
    }
    return merged ?? (ScriptGraphInterpreter.EMPTY_STRINGS as string[]);
  }

  /** Get all trigger nodes in the graph (cached). */
  getTriggerNodes(): RuntimeScriptNode[] {
    return this.triggerNodeCache;
  }

  /** Clear runtime state for stateful flow nodes. */
  clearFlowState(): void {
    this.flowState.clear();
  }

  // ---------------------------------------------------------------------------
  // Variable nodes
  // ---------------------------------------------------------------------------

  private executeVariable(
    node: RuntimeScriptNode,
    ctx: ExecutionContext,
  ): StepResult {
    const varType = node.type.split("/")[1];

    switch (varType) {
      case "get": {
        // variable/get — reads a variable; result available via evaluateDataNode
        return { next: this.getFlowSuccessors(node.id) };
      }
      case "set": {
        const name = node.data.variableName as string | undefined;
        const value =
          this.readDataInput(node.id, "value", ctx) ?? node.data.value;
        if (name) ctx.variables.set(name, value);
        return { next: this.getFlowSuccessors(node.id) };
      }
      case "increment": {
        const name = node.data.variableName as string | undefined;
        if (name) {
          const current = (ctx.variables.get(name) as number) ?? 0;
          const amount = (node.data.amount as number) ?? 1;
          ctx.variables.set(name, current + amount);
        }
        return { next: this.getFlowSuccessors(node.id) };
      }
      default:
        return { next: this.getFlowSuccessors(node.id) };
    }
  }

  // ---------------------------------------------------------------------------
  // Data-flow evaluation (pull-based, like UE5 Blueprint pure nodes)
  // ---------------------------------------------------------------------------

  /**
   * Evaluate a data node and return its computed output.
   * Math, variable/get, and data nodes are "pure" — they compute on demand
   * when a downstream node reads their output port.
   */
  evaluateDataNode(
    node: RuntimeScriptNode,
    outputPortId: string,
    ctx: ExecutionContext,
  ): unknown {
    const category = this.nodeCategory.get(node.id) ?? node.type.split("/")[0];

    if (category === "math") {
      return this.evaluateMathNode(node, ctx);
    }

    if (category === "variable" && node.type === "variable/get") {
      const name = node.data.variableName as string | undefined;
      return name ? (ctx.variables.get(name) ?? null) : null;
    }

    if (category === "data") {
      return this.evaluateDataUtilNode(node, outputPortId, ctx);
    }

    // Fallback: return static data from the port
    return node.data[outputPortId] ?? null;
  }

  // ---------------------------------------------------------------------------
  // Math node evaluation
  // ---------------------------------------------------------------------------

  private evaluateMathNode(
    node: RuntimeScriptNode,
    ctx: ExecutionContext,
  ): unknown {
    const op = node.type.split("/")[1];
    const a = this.resolveNumber(node, "a", ctx);
    const b = this.resolveNumber(node, "b", ctx);

    switch (op) {
      case "add":
        return a + b;
      case "subtract":
        return a - b;
      case "multiply":
        return a * b;
      case "divide":
        return b !== 0 ? a / b : 0;
      case "clamp": {
        const min = this.resolveNumber(node, "min", ctx);
        const max = this.resolveNumber(node, "max", ctx);
        const value = this.resolveNumber(node, "value", ctx);
        return Math.min(Math.max(value, min), max);
      }
      case "lerp": {
        const alpha = this.resolveNumber(node, "alpha", ctx);
        return a + (b - a) * Math.min(Math.max(alpha, 0), 1);
      }
      case "randomRange":
        return a + Math.random() * (b - a);
      case "abs":
        return Math.abs(a);
      case "floor":
        return Math.floor(a);
      case "ceil":
        return Math.ceil(a);
      case "round":
        return Math.round(a);
      case "min":
        return Math.min(a, b);
      case "max":
        return Math.max(a, b);
      case "power":
        return Math.pow(a, b);
      case "sqrt":
        return Math.sqrt(Math.max(a, 0));
      case "modulo":
        return b !== 0 ? a % b : 0;
      case "negate":
        return -a;
      case "sign":
        return Math.sign(a);
      case "distance3D": {
        const x1 = this.resolveNumber(node, "x1", ctx);
        const y1 = this.resolveNumber(node, "y1", ctx);
        const z1 = this.resolveNumber(node, "z1", ctx);
        const x2 = this.resolveNumber(node, "x2", ctx);
        const y2 = this.resolveNumber(node, "y2", ctx);
        const z2 = this.resolveNumber(node, "z2", ctx);
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
      }
      case "toString":
        return String(a);
      case "toNumber": {
        const input =
          this.readDataInput(node.id, "input", ctx) ?? node.data.input;
        return Number(input) || 0;
      }
      case "compare": {
        const operator = (node.data.operator as string) ?? "==";
        switch (operator) {
          case "==":
            return a === b;
          case "!=":
            return a !== b;
          case "<":
            return a < b;
          case ">":
            return a > b;
          case "<=":
            return a <= b;
          case ">=":
            return a >= b;
          default:
            return false;
        }
      }
      case "booleanLogic": {
        const logicOp = (node.data.operator as string) ?? "and";
        const boolA = !!this.readDataInput(node.id, "a", ctx);
        const boolB = !!this.readDataInput(node.id, "b", ctx);
        switch (logicOp) {
          case "and":
            return boolA && boolB;
          case "or":
            return boolA || boolB;
          case "not":
            return !boolA;
          case "xor":
            return boolA !== boolB;
          default:
            return false;
        }
      }

      // ---------------- Phase 3.1 — Vector math ----------------

      case "vectorAdd": {
        const va = this.resolveVector3(node, "a", ctx);
        const vb = this.resolveVector3(node, "b", ctx);
        return { x: va.x + vb.x, y: va.y + vb.y, z: va.z + vb.z };
      }
      case "vectorSubtract": {
        const va = this.resolveVector3(node, "a", ctx);
        const vb = this.resolveVector3(node, "b", ctx);
        return { x: va.x - vb.x, y: va.y - vb.y, z: va.z - vb.z };
      }
      case "vectorScale": {
        const va = this.resolveVector3(node, "a", ctx);
        const s = this.resolveNumber(node, "scalar", ctx);
        return { x: va.x * s, y: va.y * s, z: va.z * s };
      }
      case "vectorNormalize": {
        const v = this.resolveVector3(node, "a", ctx);
        const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        if (len <= 1e-9) return { x: 0, y: 0, z: 0 };
        return { x: v.x / len, y: v.y / len, z: v.z / len };
      }
      case "vectorDot": {
        const va = this.resolveVector3(node, "a", ctx);
        const vb = this.resolveVector3(node, "b", ctx);
        return va.x * vb.x + va.y * vb.y + va.z * vb.z;
      }
      case "vectorCross": {
        const va = this.resolveVector3(node, "a", ctx);
        const vb = this.resolveVector3(node, "b", ctx);
        return {
          x: va.y * vb.z - va.z * vb.y,
          y: va.z * vb.x - va.x * vb.z,
          z: va.x * vb.y - va.y * vb.x,
        };
      }
      case "vectorLength": {
        const v = this.resolveVector3(node, "a", ctx);
        return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      }
      case "vectorLerp": {
        const va = this.resolveVector3(node, "a", ctx);
        const vb = this.resolveVector3(node, "b", ctx);
        const t = Math.min(
          Math.max(this.resolveNumber(node, "alpha", ctx), 0),
          1,
        );
        return {
          x: va.x + (vb.x - va.x) * t,
          y: va.y + (vb.y - va.y) * t,
          z: va.z + (vb.z - va.z) * t,
        };
      }

      default:
        return 0;
    }
  }

  /**
   * Resolve a vec3 input. Accepts a connected vec3, an `{x,y,z}` node data
   * field, or per-axis `${port}X/${port}Y/${port}Z` data fields.
   */
  private resolveVector3(
    node: RuntimeScriptNode,
    portId: string,
    ctx: ExecutionContext,
  ): { x: number; y: number; z: number } {
    const connected = this.readDataInput(node.id, portId, ctx);
    if (
      connected &&
      typeof connected === "object" &&
      !Array.isArray(connected)
    ) {
      const c = connected as { x?: unknown; y?: unknown; z?: unknown };
      if (typeof c.x === "number") {
        return {
          x: c.x,
          y: typeof c.y === "number" ? c.y : 0,
          z: typeof c.z === "number" ? c.z : 0,
        };
      }
    }
    if (Array.isArray(connected) && connected.length >= 3) {
      const [cx, cy, cz] = connected as [unknown, unknown, unknown];
      return {
        x: typeof cx === "number" ? cx : 0,
        y: typeof cy === "number" ? cy : 0,
        z: typeof cz === "number" ? cz : 0,
      };
    }
    const dataValue = node.data[portId];
    if (
      dataValue &&
      typeof dataValue === "object" &&
      !Array.isArray(dataValue)
    ) {
      const d = dataValue as { x?: unknown; y?: unknown; z?: unknown };
      return {
        x: typeof d.x === "number" ? d.x : 0,
        y: typeof d.y === "number" ? d.y : 0,
        z: typeof d.z === "number" ? d.z : 0,
      };
    }
    if (Array.isArray(dataValue) && dataValue.length >= 3) {
      const [dx, dy, dz] = dataValue as [unknown, unknown, unknown];
      return {
        x: typeof dx === "number" ? dx : 0,
        y: typeof dy === "number" ? dy : 0,
        z: typeof dz === "number" ? dz : 0,
      };
    }
    const Up = portId.charAt(0).toUpperCase() + portId.slice(1);
    const px = node.data[`${portId}X`] ?? node.data[`${Up}X`];
    const py = node.data[`${portId}Y`] ?? node.data[`${Up}Y`];
    const pz = node.data[`${portId}Z`] ?? node.data[`${Up}Z`];
    return {
      x: typeof px === "number" ? px : 0,
      y: typeof py === "number" ? py : 0,
      z: typeof pz === "number" ? pz : 0,
    };
  }

  /** Resolve a numeric input — reads from connected data port, falls back to node.data. */
  private resolveNumber(
    node: RuntimeScriptNode,
    portId: string,
    ctx: ExecutionContext,
  ): number {
    const connected = this.readDataInput(node.id, portId, ctx);
    if (connected !== null && connected !== undefined)
      return Number(connected) || 0;
    return (node.data[portId] as number) ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Data utility node evaluation
  // ---------------------------------------------------------------------------

  private evaluateDataUtilNode(
    node: RuntimeScriptNode,
    outputPortId: string,
    ctx: ExecutionContext,
  ): unknown {
    const dataType = node.type.split("/")[1];

    switch (dataType) {
      case "getEntityProperty": {
        const entityId =
          (this.readDataInput(node.id, "entityId", ctx) as string) ??
          (node.data.entityId as string) ??
          ctx.entityId;
        const property = (node.data.property as string) ?? "";
        const entity = ctx.world.getEntityById(entityId);
        if (!entity || !property) return null;
        // Support dot-notation: "health.current"
        return (
          property
            .split(".")
            .reduce<unknown>(
              (obj, key) =>
                obj && typeof obj === "object"
                  ? (obj as Record<string, unknown>)[key]
                  : undefined,
              entity,
            ) ?? null
        );
      }
      case "getTime":
        return ctx.world.getTime();
      case "getTriggerData": {
        const field = (node.data.field as string) ?? outputPortId;
        return ctx.triggerData[field] ?? null;
      }
      case "makeVector3": {
        const x = this.resolveNumber(node, "x", ctx);
        const y = this.resolveNumber(node, "y", ctx);
        const z = this.resolveNumber(node, "z", ctx);
        return { x, y, z };
      }
      case "breakVector3": {
        const vec = (this.readDataInput(node.id, "vector", ctx) ??
          node.data.vector) as
          | { x?: number; y?: number; z?: number }
          | undefined;
        if (!vec) return 0;
        if (outputPortId === "x") return vec.x ?? 0;
        if (outputPortId === "y") return vec.y ?? 0;
        if (outputPortId === "z") return vec.z ?? 0;
        return 0;
      }
      case "constant":
        return node.data.value ?? null;

      // ---------------- Phase 2.1 — Spatial queries ----------------

      case "findEntitiesInRadius": {
        const origin = this.resolveOrigin(node, ctx);
        if (!origin) return [];
        const radius = this.resolveNumber(node, "radius", ctx);
        const type =
          (this.readDataInput(node.id, "type", ctx) as string | undefined) ??
          (node.data.type as string | undefined);
        if (!ctx.world.getEntitiesInRadius) return [];
        const results = ctx.world.getEntitiesInRadius(
          origin.x,
          origin.z,
          radius > 0 ? radius : 0,
          type && type.length > 0 ? type : undefined,
        );
        if (outputPortId === "count") return results.length;
        // Default "entities" port returns the ID array.
        return results.map((e) => e.id);
      }

      case "findClosestEntity": {
        const origin = this.resolveOrigin(node, ctx);
        if (!origin) return null;
        const radius = this.resolveNumber(node, "radius", ctx);
        const type =
          (this.readDataInput(node.id, "type", ctx) as string | undefined) ??
          (node.data.type as string | undefined);
        if (!ctx.world.getEntitiesInRadius) return null;
        const candidates = ctx.world.getEntitiesInRadius(
          origin.x,
          origin.z,
          radius > 0 ? radius : 0,
          type && type.length > 0 ? type : undefined,
        );
        if (candidates.length === 0) return null;
        // Exclude self if origin came from `ctx.entityId`.
        const selfId = ctx.entityId;
        let bestId: string | null = null;
        let bestDistSq = Infinity;
        for (const c of candidates) {
          if (c.id === selfId) continue;
          const dx = c.position.x - origin.x;
          const dz = c.position.z - origin.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestDistSq) {
            bestDistSq = d2;
            bestId = c.id;
          }
        }
        if (outputPortId === "distance" && bestId) {
          return Math.sqrt(bestDistSq);
        }
        return bestId;
      }

      case "isLineOfSight": {
        const fromId =
          (this.readDataInput(node.id, "from", ctx) as string | undefined) ??
          (node.data.from as string | undefined) ??
          ctx.entityId;
        const toId =
          (this.readDataInput(node.id, "to", ctx) as string | undefined) ??
          (node.data.to as string | undefined);
        if (!fromId || !toId) return false;
        const fromEnt = ctx.world.getEntityById(fromId);
        const toEnt = ctx.world.getEntityById(toId);
        const fromPos = this.extractPosition(fromEnt);
        const toPos = this.extractPosition(toEnt);
        if (!fromPos || !toPos) return false;
        // If physics raycast available, test the segment for occluders.
        if (ctx.world.raycast) {
          const dx = toPos.x - fromPos.x;
          const dy = toPos.y - fromPos.y;
          const dz = toPos.z - fromPos.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist <= 0) return true;
          const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
          const hit = ctx.world.raycast(fromPos, dir, dist);
          if (!hit) return true;
          // Hit further than target → clear path; hit on the target entity → clear.
          if (hit.entityId && hit.entityId === toId) return true;
          return hit.distance >= dist - 0.01;
        }
        // Fallback: assume clear line of sight.
        return true;
      }

      case "lineTrace": {
        const origin = this.resolveOrigin(node, ctx);
        if (!origin) return null;
        const dirIn = this.readDataInput(node.id, "direction", ctx) as
          | { x?: number; y?: number; z?: number }
          | undefined;
        const direction = dirIn ?? {
          x: (node.data.dirX as number) ?? 0,
          y: (node.data.dirY as number) ?? 0,
          z: (node.data.dirZ as number) ?? 1,
        };
        const maxDistance = this.resolveNumber(node, "maxDistance", ctx) || 100;
        if (!ctx.world.raycast) return null;
        const hit = ctx.world.raycast(
          origin,
          direction as {
            x: number;
            y: number;
            z: number;
          },
          maxDistance,
        );
        if (!hit) return null;
        if (outputPortId === "entityId") return hit.entityId ?? null;
        if (outputPortId === "distance") return hit.distance;
        if (outputPortId === "point") return hit.point;
        return hit.entityId ?? null;
      }

      case "sphereCast": {
        // Sphere cast = radius-based 3D spatial query, using entity
        // distances computed in 3D rather than 2D. Uses the same
        // getEntitiesInRadius backing but re-filters by 3D distance.
        const origin = this.resolveOrigin(node, ctx);
        if (!origin) return [];
        const radius = this.resolveNumber(node, "radius", ctx);
        const type =
          (this.readDataInput(node.id, "type", ctx) as string | undefined) ??
          (node.data.type as string | undefined);
        if (!ctx.world.getEntitiesInRadius) return [];
        const wide = ctx.world.getEntitiesInRadius(
          origin.x,
          origin.z,
          radius > 0 ? radius : 0,
          type && type.length > 0 ? type : undefined,
        );
        const r2 = radius * radius;
        const hits: string[] = [];
        for (const e of wide) {
          const dx = e.position.x - origin.x;
          const dy = e.position.y - origin.y;
          const dz = e.position.z - origin.z;
          if (dx * dx + dy * dy + dz * dz <= r2) hits.push(e.id);
        }
        if (outputPortId === "count") return hits.length;
        return hits;
      }

      // ---------------- Phase 3.2 — Array / collection ops ----------------

      case "arrayLength": {
        const arr = this.readDataInput(node.id, "array", ctx);
        if (Array.isArray(arr)) return arr.length;
        return 0;
      }

      case "arrayContains": {
        const arr = this.readDataInput(node.id, "array", ctx);
        if (!Array.isArray(arr)) return false;
        const needle =
          this.readDataInput(node.id, "value", ctx) ?? node.data.value;
        return arr.some((v) => v === needle);
      }

      case "arrayAdd": {
        const arr = this.readDataInput(node.id, "array", ctx);
        const value =
          this.readDataInput(node.id, "value", ctx) ?? node.data.value;
        if (!Array.isArray(arr)) return [value];
        return [...arr, value];
      }

      case "arrayRemove": {
        const arr = this.readDataInput(node.id, "array", ctx);
        const value =
          this.readDataInput(node.id, "value", ctx) ?? node.data.value;
        if (!Array.isArray(arr)) return [];
        const idx = arr.indexOf(value);
        if (idx === -1) return arr.slice();
        return arr.slice(0, idx).concat(arr.slice(idx + 1));
      }

      case "arrayGetAt": {
        const arr = this.readDataInput(node.id, "array", ctx);
        const index = Math.floor(this.resolveNumber(node, "index", ctx));
        if (!Array.isArray(arr)) return null;
        if (index < 0 || index >= arr.length) return null;
        return arr[index];
      }

      case "arraySlice": {
        const arr = this.readDataInput(node.id, "array", ctx);
        const start = Math.floor(this.resolveNumber(node, "start", ctx));
        const connectedEnd = this.readDataInput(node.id, "end", ctx);
        const staticEnd = node.data["end"];
        const endValue =
          connectedEnd !== null && connectedEnd !== undefined
            ? connectedEnd
            : staticEnd;
        const end =
          endValue !== null && endValue !== undefined
            ? Math.floor(Number(endValue))
            : Array.isArray(arr)
              ? arr.length
              : 0;
        if (!Array.isArray(arr)) return [];
        return arr.slice(start, end);
      }

      // ---------------- Phase 3.5 — Typed casts ----------------

      case "castToPlayer":
      case "castToNPC":
      case "castToMob": {
        const entityIdIn =
          (this.readDataInput(node.id, "entityId", ctx) as
            | string
            | undefined) ??
          (node.data.entityId as string | undefined) ??
          ctx.entityId;
        if (!entityIdIn) return null;
        const entity = ctx.world.getEntityById(entityIdIn);
        if (!entity) return null;
        const expected = node.type.split("/")[1].replace("castTo", "");
        const entType = String(entity.type ?? "").toLowerCase();
        const ok =
          entType === expected.toLowerCase() ||
          entType.startsWith(expected.toLowerCase());
        if (outputPortId === "isValid") return ok;
        return ok ? entityIdIn : null;
      }

      case "toBoolean": {
        const v = this.readDataInput(node.id, "input", ctx) ?? node.data.input;
        if (typeof v === "boolean") return v;
        if (typeof v === "number") return v !== 0;
        if (typeof v === "string") {
          if (v === "true") return true;
          if (v === "false") return false;
          return v.length > 0;
        }
        return !!v;
      }

      // ---------------- Phase 2.3 — Typed ECS component accessors ----------------

      case "getEntityPosition": {
        const entity = this.resolveEntity(node, ctx);
        const pos = this.extractPosition(entity);
        if (!pos) return null;
        if (outputPortId === "x") return pos.x;
        if (outputPortId === "y") return pos.y;
        if (outputPortId === "z") return pos.z;
        return pos;
      }

      case "getEntityRotation": {
        const entity = this.resolveEntity(node, ctx);
        if (!entity) return null;
        const rot = this.extractRotation(entity);
        if (!rot) return null;
        if (outputPortId === "x") return rot.x;
        if (outputPortId === "y") return rot.y;
        if (outputPortId === "z") return rot.z;
        if (outputPortId === "w") return rot.w ?? 0;
        return rot;
      }

      case "getPlayerHealth": {
        const entity = this.resolveEntity(node, ctx);
        if (!entity) return 0;
        const data = this.getEntityData(entity);
        const current = this.asNumber(data?.health, 0);
        const max = this.asNumber(data?.maxHealth, 0);
        if (outputPortId === "max") return max;
        if (outputPortId === "percent") {
          return max > 0 ? current / max : 0;
        }
        return current;
      }

      case "getPlayerStats": {
        const entity = this.resolveEntity(node, ctx);
        if (!entity) return 0;
        const data = this.getEntityData(entity);
        const requested =
          (this.readDataInput(node.id, "skill", ctx) as string | undefined) ??
          (node.data.skill as string | undefined) ??
          outputPortId;
        if (outputPortId === "level") {
          return this.asNumber(data?.level, 0);
        }
        const skills = data?.skills as
          | Record<string, { level?: number; xp?: number }>
          | undefined;
        if (!skills || typeof skills !== "object") return 0;
        const entry = skills[requested];
        if (!entry || typeof entry !== "object") return 0;
        if (outputPortId === "xp") return this.asNumber(entry.xp, 0);
        return this.asNumber(entry.level, 0);
      }

      case "getPlayerInventory": {
        const entity = this.resolveEntity(node, ctx);
        if (!entity) return [];
        const data = this.getEntityData(entity);
        const inventory = data?.inventory;
        if (!Array.isArray(inventory)) {
          if (outputPortId === "count") return 0;
          if (outputPortId === "hasSpace") return true;
          return [];
        }
        if (outputPortId === "count") return inventory.length;
        if (outputPortId === "hasSpace") {
          const capacity = this.asNumber(data?.inventoryCapacity, 28);
          return inventory.length < capacity;
        }
        return inventory.map((item: unknown) => {
          if (item && typeof item === "object") {
            const it = item as { id?: string | number };
            return it.id !== undefined ? String(it.id) : "";
          }
          return String(item);
        });
      }

      case "getPlayerEquipment": {
        const entity = this.resolveEntity(node, ctx);
        if (!entity) return null;
        const data = this.getEntityData(entity);
        const equipment = data?.equipment as
          | Record<string, { id?: string | number } | null>
          | undefined;
        if (!equipment || typeof equipment !== "object") return null;
        const item = equipment[outputPortId];
        if (!item || typeof item !== "object") return null;
        return item.id !== undefined ? String(item.id) : null;
      }

      default:
        return node.data[outputPortId] ?? null;
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 2.1 helpers — position resolution for spatial queries
  // ---------------------------------------------------------------------------

  private resolveOrigin(
    node: RuntimeScriptNode,
    ctx: ExecutionContext,
  ): { x: number; y: number; z: number } | null {
    // 1. Connected origin input — accepts vector3 OR entity id string.
    const originIn = this.readDataInput(node.id, "origin", ctx);
    if (originIn && typeof originIn === "object") {
      const v = originIn as { x?: number; y?: number; z?: number };
      if (typeof v.x === "number" && typeof v.z === "number") {
        return { x: v.x, y: v.y ?? 0, z: v.z };
      }
    }
    if (typeof originIn === "string" && originIn.length > 0) {
      const ent = ctx.world.getEntityById(originIn);
      const pos = this.extractPosition(ent);
      if (pos) return pos;
    }
    // 2. Entity id field on the node.
    const entityIdField =
      (this.readDataInput(node.id, "entityId", ctx) as string | undefined) ??
      (node.data.entityId as string | undefined);
    if (entityIdField && entityIdField.length > 0) {
      const ent = ctx.world.getEntityById(entityIdField);
      const pos = this.extractPosition(ent);
      if (pos) return pos;
    }
    // 3. Default to self (entity that owns this graph).
    const self = ctx.world.getEntityById(ctx.entityId);
    const selfPos = this.extractPosition(self);
    if (selfPos) return selfPos;
    return null;
  }

  private extractPosition(
    entity: Record<string, unknown> | null,
  ): { x: number; y: number; z: number } | null {
    if (!entity) return null;
    const candidates: unknown[] = [entity.position];
    const data = entity.data as Record<string, unknown> | undefined;
    if (data && typeof data === "object") candidates.push(data.position);
    for (const pos of candidates) {
      if (pos && typeof pos === "object" && !Array.isArray(pos)) {
        const p = pos as { x?: number; y?: number; z?: number };
        if (typeof p.x === "number" && typeof p.z === "number") {
          return { x: p.x, y: p.y ?? 0, z: p.z };
        }
      }
      if (Array.isArray(pos) && pos.length >= 3) {
        const [x, y, z] = pos as [unknown, unknown, unknown];
        if (typeof x === "number" && typeof z === "number") {
          return { x, y: typeof y === "number" ? y : 0, z };
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Phase 2.3 helpers — typed entity accessors
  // ---------------------------------------------------------------------------

  private resolveEntity(
    node: RuntimeScriptNode,
    ctx: ExecutionContext,
  ): Record<string, unknown> | null {
    const entityIdIn =
      (this.readDataInput(node.id, "entityId", ctx) as string | undefined) ??
      (this.readDataInput(node.id, "playerId", ctx) as string | undefined) ??
      (node.data.entityId as string | undefined) ??
      (node.data.playerId as string | undefined) ??
      ctx.entityId;
    if (!entityIdIn) return null;
    return ctx.world.getEntityById(entityIdIn);
  }

  private getEntityData(
    entity: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!entity) return null;
    const data = entity.data;
    if (data && typeof data === "object") {
      return data as Record<string, unknown>;
    }
    // Some adapters put the fields directly on the entity.
    return entity;
  }

  private extractRotation(
    entity: Record<string, unknown> | null,
  ): { x: number; y: number; z: number; w?: number } | null {
    if (!entity) return null;
    const candidates: unknown[] = [entity.rotation, entity.quaternion];
    const data = entity.data as Record<string, unknown> | undefined;
    if (data && typeof data === "object") {
      candidates.push(data.rotation, data.quaternion);
    }
    for (const rot of candidates) {
      if (rot && typeof rot === "object" && !Array.isArray(rot)) {
        const r = rot as { x?: number; y?: number; z?: number; w?: number };
        if (
          typeof r.x === "number" &&
          typeof r.y === "number" &&
          typeof r.z === "number"
        ) {
          return {
            x: r.x,
            y: r.y,
            z: r.z,
            w: typeof r.w === "number" ? r.w : undefined,
          };
        }
      }
      if (Array.isArray(rot) && rot.length >= 3) {
        const [x, y, z, w] = rot as [unknown, unknown, unknown, unknown?];
        if (
          typeof x === "number" &&
          typeof y === "number" &&
          typeof z === "number"
        ) {
          return { x, y, z, w: typeof w === "number" ? w : undefined };
        }
      }
    }
    return null;
  }

  private asNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  }

  // ---------------------------------------------------------------------------
  // Data input resolution (pull-based)
  // ---------------------------------------------------------------------------

  /**
   * Read a data input value from a connected node's output.
   * If the source node is a pure data/math/variable node, it is evaluated on demand.
   */
  readDataInput(
    nodeId: string,
    inputPortId: string,
    ctx: ExecutionContext,
  ): unknown {
    // O(1) lookup via pre-built incoming edge index
    const edge = this.incomingByPort.get(`${nodeId}:${inputPortId}`);
    if (!edge) return null;

    const sourceNode = this.nodeMap.get(edge.sourceNodeId);
    if (!sourceNode) return null;

    // If the source is a pure data node, evaluate it on demand
    const category =
      this.nodeCategory.get(sourceNode.id) ?? sourceNode.type.split("/")[0];
    if (
      category === "math" ||
      category === "data" ||
      sourceNode.type === "variable/get"
    ) {
      return this.evaluateDataNode(sourceNode, edge.sourcePortId, ctx);
    }

    // Otherwise return static data from the source node
    return sourceNode.data[edge.sourcePortId] ?? null;
  }
}

// ---------------------------------------------------------------------------
// Delayed continuation (for Delay nodes)
// ---------------------------------------------------------------------------

export interface DelayedContinuation {
  graphId: string;
  resumeNodeIds: string[];
  delayMs: number;
  context: ExecutionContext;
}
