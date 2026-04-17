/**
 * PIEScriptRunner — In-editor scripting runtime for Play-In-Editor.
 *
 * Hosts a `ScriptGraphInterpreter` per loaded entity graph and runs them
 * against a tiny, self-contained event bus. This is intentionally lighter
 * than the full server-side `ScriptingSystem`: no SystemBase, no EntityManager,
 * no World — just the minimum needed for graphs authored in World Studio to
 * actually execute inside the editor.
 *
 * Architecture:
 *   PlayTestWorld owns ↦ PIEScriptRunner
 *     ↳ event bus  (emit / on / off)
 *     ↳ TriggerEvaluator     (default mappings — same as production)
 *     ↳ ActionExecutor       (same handlers as production)
 *     ↳ ConditionRegistry    (same conditions as production)
 *     ↳ Map<entityId, Instance[]>  (one entry per registered graph)
 *     ↳ DelayedContinuation queue  (drained in tick())
 *
 * Debug channel:
 *   Every trigger fire, action invocation, and error is forwarded to a
 *   `debug` callback. The PIE Console (UI) subscribes to this stream.
 */

import {
  ScriptGraphInterpreter,
  type ExecutionContext,
  type RuntimeScriptGraph,
  type ScriptingWorldInterface,
  type DelayedContinuation,
} from "../systems/shared/scripting/ScriptGraphInterpreter";
import {
  TriggerEvaluator,
  DEFAULT_TRIGGER_MAPPINGS,
} from "../systems/shared/scripting/TriggerEvaluator";
import { ActionExecutor } from "../systems/shared/scripting/ActionExecutor";
import { ConditionRegistry } from "../systems/shared/scripting/ConditionEvaluator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PIEDebugLevel = "trigger" | "action" | "error" | "info";

export interface PIEDebugEntry {
  /** Wall-clock timestamp (Date.now()). */
  ts: number;
  /** Tick count when this entry was logged. */
  tick: number;
  level: PIEDebugLevel;
  /** Short label, e.g. "trigger/onReady" or "action/showDialogue". */
  source: string;
  /** Entity that owns the script (for trigger/action entries). */
  entityId?: string;
  /** Human-readable message. */
  message: string;
  /** Optional structured payload. */
  data?: Record<string, unknown>;
}

export type PIEDebugSink = (entry: PIEDebugEntry) => void;

interface ActiveInstance {
  entityId: string;
  graph: RuntimeScriptGraph;
  interpreter: ScriptGraphInterpreter;
  variables: Map<string, unknown>;
}

interface PendingDelay {
  continuation: DelayedContinuation;
  resumeAt: number;
}

/**
 * PIE-only entity lookup callback. The runner uses this to fulfill
 * `world.getEntityById` for action handlers (e.g. so an action can read
 * the current position of the entity it's running on).
 */
export type PIEEntityLookup = (id: string) => Record<string, unknown> | null;

// ---------------------------------------------------------------------------
// Event bus
// ---------------------------------------------------------------------------

type Listener = (data: Record<string, unknown>) => void;

class PIEEventBus {
  private listeners = new Map<string, Set<Listener>>();

  emit(event: string, data: Record<string, unknown>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Snapshot so listeners that mutate the set (off()) can't trip iteration.
    for (const fn of [...set]) {
      try {
        fn(data);
      } catch (err) {
        // Listener errors must not break the bus.
        console.warn(`[PIE] Listener for "${event}" threw:`, err);
      }
    }
  }

  on(event: string, fn: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
    return () => this.off(event, fn);
  }

  off(event: string, fn: Listener): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) this.listeners.delete(event);
  }

  clear(): void {
    this.listeners.clear();
  }
}

// ---------------------------------------------------------------------------
// PIEScriptRunner
// ---------------------------------------------------------------------------

export interface PIEScriptRunnerOptions {
  /** Resolves entity data by id (used by action handlers). */
  entityLookup: PIEEntityLookup;
  /** Optional sink that receives every debug entry. */
  debugSink?: PIEDebugSink;
}

export class PIEScriptRunner {
  private readonly bus = new PIEEventBus();
  private readonly triggerEvaluator = new TriggerEvaluator(
    DEFAULT_TRIGGER_MAPPINGS,
  );
  private readonly actionExecutor = new ActionExecutor();
  private readonly conditionRegistry = new ConditionRegistry();
  private readonly instances = new Map<string, ActiveInstance[]>();
  private readonly pendingDelays: PendingDelay[] = [];
  private readonly subscribedEvents = new Set<string>();
  private readonly scriptingWorld: ScriptingWorldInterface;
  private debugSink?: PIEDebugSink;
  private tickCount = 0;

  constructor(opts: PIEScriptRunnerOptions) {
    this.debugSink = opts.debugSink;

    // Bridge the interpreter's world interface to our event bus + lookup.
    // `emit` is where action handlers fan out their game-system events;
    // PIE captures every emit and forwards it to listeners + the debug sink.
    this.scriptingWorld = {
      emit: (event, data) => {
        this.log({
          level: "action",
          source: event,
          message: `emit ${event}`,
          data,
        });
        this.bus.emit(event, data);
      },
      getEntityById: (id) => opts.entityLookup(id),
      getTime: () => Date.now(),
    };

    // Subscribe to every event that any registered trigger cares about.
    // We do this lazily per-graph so PIE only listens for what it needs.
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Replace the debug sink. Pass undefined to silence. */
  setDebugSink(sink: PIEDebugSink | undefined): void {
    this.debugSink = sink;
  }

  /** Direct event bus access for outside code (UI viewport, tests). */
  emit(event: string, data: Record<string, unknown>): void {
    this.scriptingWorld.emit(event, data);
  }

  /** Subscribe to bus events (e.g. dialogue:start) for UI hooks. */
  on(event: string, fn: Listener): () => void {
    return this.bus.on(event, fn);
  }

  /**
   * Register a graph against an entity. Subscribes to the graph's required
   * trigger events and (synchronously) fires `trigger/onReady` if present.
   */
  loadGraph(entityId: string, graph: RuntimeScriptGraph): void {
    const interpreter = new ScriptGraphInterpreter(graph);

    for (const type of this.actionExecutor.getRegisteredTypes()) {
      const handler = this.actionExecutor.getHandler(type);
      if (handler) interpreter.registerAction(type, handler);
    }
    for (const type of this.conditionRegistry.getRegisteredTypes()) {
      const evaluator = this.conditionRegistry.getEvaluator(type);
      if (evaluator) interpreter.registerCondition(type, evaluator);
    }

    const variables = new Map<string, unknown>();
    for (const v of graph.variables) variables.set(v.name, v.defaultValue);

    const list = this.instances.get(entityId) ?? [];
    list.push({ entityId, graph, interpreter, variables });
    this.instances.set(entityId, list);

    // Subscribe to all events any trigger node in this graph needs.
    const triggerTypes = new Set(
      graph.nodes
        .filter((n) => n.type.startsWith("trigger/"))
        .map((n) => n.type),
    );
    for (const triggerType of triggerTypes) {
      const mapping = this.triggerEvaluator
        .getMappingsForEvent("")
        // ^^ getMappingsForEvent("") returns []; we use the registered mappings
        // map indirectly via getSubscribedEvents below.
        .find((m) => m.triggerType === triggerType);
      void mapping; // silence unused
    }

    // Re-sync the underlying bus subscriptions for this runner.
    this.syncSubscriptions();

    this.log({
      level: "info",
      source: "loadGraph",
      entityId,
      message: `loaded graph "${graph.name}" (${graph.nodes.length} nodes)`,
    });

    // Fire onReady for each trigger/onReady node in the graph.
    for (const node of graph.nodes) {
      if (node.type === "trigger/onReady") {
        this.runTrigger(entityId, graph, node.id, {});
      }
    }
  }

  /** Remove all graphs for an entity (called when entity despawns / PIE stops). */
  removeAllGraphs(entityId: string): void {
    const removed = this.instances.delete(entityId);
    if (removed) this.syncSubscriptions();
  }

  /** Stop the runner — clears all graphs, listeners, and pending work. */
  stop(): void {
    this.instances.clear();
    this.pendingDelays.length = 0;
    this.bus.clear();
    this.subscribedEvents.clear();
    this.tickCount = 0;
  }

  /**
   * Drive the runner forward by one tick. Resumes any delayed continuations
   * that have come due. PlayTestWorld calls this every animation frame.
   */
  tick(_deltaTime: number): void {
    this.tickCount++;
    if (this.pendingDelays.length === 0) return;

    const now = Date.now();
    const ready: PendingDelay[] = [];
    let writeIdx = 0;
    for (let i = 0; i < this.pendingDelays.length; i++) {
      const pd = this.pendingDelays[i]!;
      if (now >= pd.resumeAt) {
        ready.push(pd);
      } else {
        this.pendingDelays[writeIdx++] = pd;
      }
    }
    this.pendingDelays.length = writeIdx;

    for (const pd of ready) {
      const { continuation } = pd;
      const list = this.instances.get(continuation.context.entityId);
      const inst = list?.find((i) => i.graph.id === continuation.graphId);
      if (!inst) continue;

      for (const nodeId of continuation.resumeNodeIds) {
        inst.interpreter
          .execute(nodeId, continuation.context)
          .then((more) => this.scheduleDelays(more))
          .catch((err) =>
            this.log({
              level: "error",
              source: continuation.graphId,
              entityId: continuation.context.entityId,
              message: `resume failed: ${(err as Error).message}`,
            }),
          );
      }
    }
  }

  /** Number of currently loaded graph instances. */
  get instanceCount(): number {
    let n = 0;
    for (const list of this.instances.values()) n += list.length;
    return n;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Make sure the bus is subscribed to every event that any loaded graph's
   * trigger nodes care about. Idempotent — safe to call repeatedly.
   */
  private syncSubscriptions(): void {
    const wanted = new Set<string>();
    for (const list of this.instances.values()) {
      for (const inst of list) {
        for (const node of inst.graph.nodes) {
          if (!node.type.startsWith("trigger/")) continue;
          for (const ev of this.triggerEvaluator.getSubscribedEvents()) {
            const mappings = this.triggerEvaluator.getMappingsForEvent(ev);
            if (mappings.some((m) => m.triggerType === node.type)) {
              wanted.add(ev);
            }
          }
        }
      }
    }

    // Add new subscriptions
    for (const ev of wanted) {
      if (this.subscribedEvents.has(ev)) continue;
      this.subscribedEvents.add(ev);
      this.bus.on(ev, (data) => this.handleEvent(ev, data));
    }
    // We never remove bus subscriptions for simplicity — the bus listener
    // is idempotent (handleEvent dispatches to live instances only).
  }

  /** Dispatch an incoming bus event to any matching trigger node. */
  private handleEvent(
    eventName: string,
    eventData: Record<string, unknown>,
  ): void {
    const mappings = this.triggerEvaluator.getMappingsForEvent(eventName);
    if (mappings.length === 0) return;

    for (const [entityId, list] of this.instances.entries()) {
      for (const inst of list) {
        for (const node of inst.graph.nodes) {
          if (!node.type.startsWith("trigger/")) continue;
          if (
            !this.triggerEvaluator.matchesTrigger(
              node,
              eventName,
              eventData,
              entityId,
            )
          ) {
            continue;
          }
          const triggerData = this.triggerEvaluator.extractTriggerData(
            node.type,
            eventData,
          );
          this.runTrigger(entityId, inst.graph, node.id, triggerData);
        }
      }
    }
  }

  /** Execute a single trigger node and schedule any delayed continuations. */
  private runTrigger(
    entityId: string,
    graph: RuntimeScriptGraph,
    triggerNodeId: string,
    triggerData: Record<string, unknown>,
  ): void {
    const inst = this.instances
      .get(entityId)
      ?.find((i) => i.graph.id === graph.id);
    if (!inst) return;

    const ctx: ExecutionContext = {
      triggerData,
      variables: inst.variables,
      entityId,
      world: this.scriptingWorld,
    };

    const triggerNode = graph.nodes.find((n) => n.id === triggerNodeId);
    this.log({
      level: "trigger",
      source: triggerNode?.type ?? "trigger/?",
      entityId,
      message: `fired ${triggerNode?.type ?? "?"}`,
      data: triggerData,
    });

    inst.interpreter
      .execute(triggerNodeId, ctx)
      .then((delays) => this.scheduleDelays(delays))
      .catch((err) =>
        this.log({
          level: "error",
          source: graph.id,
          entityId,
          message: `execute failed: ${(err as Error).message}`,
        }),
      );
  }

  private scheduleDelays(delays: DelayedContinuation[]): void {
    if (delays.length === 0) return;
    const now = Date.now();
    for (const d of delays) {
      this.pendingDelays.push({ continuation: d, resumeAt: now + d.delayMs });
    }
  }

  private log(entry: Omit<PIEDebugEntry, "ts" | "tick">): void {
    if (!this.debugSink) return;
    this.debugSink({
      ts: Date.now(),
      tick: this.tickCount,
      ...entry,
    });
  }
}
