/**
 * ScriptingSystem — Integrates the visual scripting runtime with the ECS world.
 *
 * Extends SystemBase for proper lifecycle management, event subscriptions,
 * and automatic cleanup. Subscribes to all trigger events declared in
 * TriggerEvaluator and routes them to matching graph trigger nodes.
 *
 * Execution model:
 * 1. Entity spawn → load behaviorGraph from entity properties → addGraph()
 * 2. EventBus fires a subscribed event (e.g. "zone:player-enter")
 * 3. TriggerEvaluator matches event → trigger node type
 * 4. ScriptGraphInterpreter walks the graph from that trigger
 * 5. ActionExecutor emits canonical EventType events
 * 6. Delayed continuations resume on subsequent ticks
 */

import {
  ScriptGraphInterpreter,
  type RuntimeScriptGraph,
  type RuntimeScriptNode,
  type ExecutionContext,
  type ScriptingWorldInterface,
  type DelayedContinuation,
} from "./ScriptGraphInterpreter";
import { TriggerEvaluator, DEFAULT_TRIGGER_MAPPINGS } from "./TriggerEvaluator";
import { ActionExecutor } from "./ActionExecutor";
import { ConditionRegistry } from "./ConditionEvaluator";
import { SystemBase } from "../infrastructure/SystemBase";
import type { World } from "../../../types/index";
import { EventType } from "../../../types/events";
import { validateNodeData } from "./NodeDataSchemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveGraphInstance {
  entityId: string;
  interpreter: ScriptGraphInterpreter;
  graph: RuntimeScriptGraph;
  variables: Map<string, unknown>;
}

interface PendingDelay {
  continuation: DelayedContinuation;
  resumeAt: number;
}

/**
 * Phase 6.5 — Pre-resolved (entity, instance, trigger) tuple that can fire
 * on a given event. Stored in `eventIndex` keyed by event name so
 * `handleEvent` is an O(matching_triggers) operation rather than
 * O(all_entities × all_graphs × all_triggers).
 */
interface EventIndexEntry {
  entityId: string;
  instance: ActiveGraphInstance;
  trigger: RuntimeScriptNode;
}

// ---------------------------------------------------------------------------
// Security constants
// ---------------------------------------------------------------------------

/** Token-bucket capacity per entity (max burst of trigger executions). */
const ENTITY_BUCKET_CAPACITY = 200;
/** Refill rate per entity (tokens per second). */
const ENTITY_BUCKET_REFILL_PER_SEC = 200;
/** Token-bucket capacity per owning player (aggregate across their entities). */
const PLAYER_BUCKET_CAPACITY = 500;
/** Refill rate per owning player (tokens per second). */
const PLAYER_BUCKET_REFILL_PER_SEC = 500;
/** Max pending delays per graph instance */
const MAX_PENDING_DELAYS_PER_GRAPH = 20;
/** Max graphs per entity */
const MAX_GRAPHS_PER_ENTITY = 10;
/** Allowed node type prefixes */
const ALLOWED_PREFIXES = [
  "trigger/",
  "condition/",
  "action/",
  "flow/",
  "math/",
  "variable/",
  "data/",
];

// ---------------------------------------------------------------------------
// Auth / ownership
// ---------------------------------------------------------------------------

/**
 * Context passed to `addGraph` identifying the caller.
 *
 * - `trusted: true`  → bypass ownership check (server boot, entity auto-load).
 * - `playerId: string` → attach as that player; must match the entity's
 *   `data.owner` if the entity is player-owned.
 *
 * Omitting the context is equivalent to `{ trusted: true }` for backwards
 * compatibility with internal auto-load paths.
 */
export interface AddGraphAuthContext {
  trusted?: boolean;
  playerId?: string;
}

/** Result of an `addGraph` call. */
export interface AddGraphResult {
  added: boolean;
  reason?: string;
}

interface TokenBucket {
  tokens: number;
  lastRefillAt: number;
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export class ScriptingSystem extends SystemBase {
  /** Active graph instances indexed by entity ID */
  private instances: Map<string, ActiveGraphInstance[]> = new Map();
  /** Pending delayed continuations */
  private pendingDelays: PendingDelay[] = [];
  /** Trigger evaluator for mapping events → triggers */
  private triggerEvaluator: TriggerEvaluator;
  /** Action executor */
  private actionExecutor: ActionExecutor;
  /** Condition evaluator registry */
  private conditionRegistry: ConditionRegistry;
  /** Adapter bridging World → ScriptingWorldInterface for ExecutionContext */
  private scriptingWorld: ScriptingWorldInterface;
  /** Per-entity token bucket for rate limiting. */
  private entityBuckets: Map<string, TokenBucket> = new Map();
  /** Per-owning-player token bucket for aggregate rate limiting. */
  private playerBuckets: Map<string, TokenBucket> = new Map();
  /** entityId → owning playerId at the time of addGraph (cached). */
  private graphOwners: Map<string, string> = new Map();
  /**
   * Phase 6.5 — Reverse index from event name to every (instance, trigger)
   * pair that could fire on it. Built incrementally in `addGraph` and
   * pruned in `removeGraph`/`removeAllGraphs`. `handleEvent` reads from
   * this map instead of iterating all entities × all graphs × all
   * triggers on every event.
   */
  private eventIndex: Map<string, EventIndexEntry[]> = new Map();

  constructor(world: World) {
    super(world, {
      name: "scripting",
      dependencies: {
        required: ["entity-manager"],
        optional: ["dialogue", "quest"],
      },
      autoCleanup: true,
    });
    this.triggerEvaluator = new TriggerEvaluator(DEFAULT_TRIGGER_MAPPINGS);
    this.actionExecutor = new ActionExecutor();
    this.conditionRegistry = new ConditionRegistry();

    // Create a thin adapter so action handlers can emit events via the world
    this.scriptingWorld = {
      emit: (event: string, data: Record<string, unknown>) => {
        this.emitTypedEvent(event, data);
      },
      getEntityById: (id: string) => {
        // EntityManager is available as a registered system
        const em = world.getSystem?.("entity-manager") as
          | {
              getEntity(
                id: string,
              ): { data?: Record<string, unknown> } | undefined;
            }
          | undefined;
        if (!em) return null;
        const entity = em.getEntity(id);
        return entity?.data ?? null;
      },
      getTime: () => Date.now(),
      getEntitiesInRadius: (
        x: number,
        z: number,
        radius: number,
        type?: string,
      ) => {
        const em = world.getSystem?.("entity-manager") as
          | {
              getEntitiesNearPosition?: (
                x: number,
                z: number,
                radius: number,
              ) => Array<{
                id: string;
                type?: string;
                data?: Record<string, unknown> & {
                  position?: { x?: number; y?: number; z?: number } | number[];
                };
                position?: { x?: number; y?: number; z?: number };
              }>;
            }
          | undefined;
        if (!em?.getEntitiesNearPosition) return [];
        const results = em.getEntitiesNearPosition(x, z, radius);
        const out: Array<{
          id: string;
          type: string;
          position: { x: number; y: number; z: number };
        }> = [];
        for (const e of results) {
          if (!e) continue;
          if (type && e.type !== type) continue;
          // Prefer live node position; fall back to data.position.
          let px = 0;
          let py = 0;
          let pz = 0;
          if (
            e.position &&
            typeof e.position.x === "number" &&
            typeof e.position.z === "number"
          ) {
            px = e.position.x;
            py = e.position.y ?? 0;
            pz = e.position.z;
          } else if (e.data?.position) {
            const p = e.data.position;
            if (Array.isArray(p) && p.length >= 3) {
              const [ax, ay, az] = p as [number, number, number];
              px = ax;
              py = ay;
              pz = az;
            } else if (typeof p === "object") {
              const obj = p as { x?: number; y?: number; z?: number };
              px = obj.x ?? 0;
              py = obj.y ?? 0;
              pz = obj.z ?? 0;
            }
          }
          out.push({
            id: e.id,
            type: e.type ?? "unknown",
            position: { x: px, y: py, z: pz },
          });
        }
        return out;
      },
      raycast: (origin, direction, maxDistance) => {
        // Physics is only available in runtimes with a PhysX stage.
        // If world.physics.raycast exists, delegate; otherwise return null.
        const physics = (
          world as unknown as {
            physics?: {
              raycast?: (
                o: unknown,
                d: unknown,
                max?: number,
              ) => {
                point?: { x: number; y: number; z: number };
                distance?: number;
                handle?: { entityId?: string; entity?: { id?: string } };
              } | null;
            };
          }
        ).physics;
        if (!physics?.raycast) return null;
        const hit = physics.raycast(origin, direction, maxDistance);
        if (!hit) return null;
        const entityId =
          hit.handle?.entityId ?? hit.handle?.entity?.id ?? undefined;
        return {
          entityId,
          point: hit.point ?? { x: 0, y: 0, z: 0 },
          distance: hit.distance ?? 0,
        };
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    const events = this.triggerEvaluator.getSubscribedEvents();

    for (const eventName of events) {
      this.subscribe(eventName, (eventData: Record<string, unknown>) => {
        this.handleEvent(eventName, eventData);
      });
    }

    // Subscribe to entity spawn to auto-load behavior graphs
    this.subscribe(
      EventType.ENTITY_SPAWNED,
      (data: Record<string, unknown>) => {
        this.onEntitySpawned(data);
      },
    );

    // Subscribe to entity removal to clean up graphs
    this.subscribe(EventType.ENTITY_DEATH, (data: Record<string, unknown>) => {
      const entityId = (data.entityId ?? data.entity) as string | undefined;
      if (entityId) this.removeAllGraphs(entityId);
    });

    this.logger.info(
      `Initialized with ${events.length} trigger event subscriptions`,
    );
  }

  override destroy(): void {
    this.instances.clear();
    this.pendingDelays = [];
    this.entityBuckets.clear();
    this.playerBuckets.clear();
    this.graphOwners.clear();
    super.destroy();
  }

  /** Process delayed continuations each tick. */
  override update(_dt: number): void {
    const now = Date.now();
    const ready: PendingDelay[] = [];
    const remaining: PendingDelay[] = [];

    for (const pd of this.pendingDelays) {
      if (now >= pd.resumeAt) {
        ready.push(pd);
      } else {
        remaining.push(pd);
      }
    }

    this.pendingDelays = remaining;

    for (const pd of ready) {
      const { continuation } = pd;
      const instances = this.instances.get(continuation.context.entityId);
      if (!instances) continue;

      const instance = instances.find(
        (inst) => inst.graph.id === continuation.graphId,
      );
      if (!instance) continue;

      for (const nodeId of continuation.resumeNodeIds) {
        instance.interpreter
          .execute(nodeId, continuation.context)
          .then((newDelays) => {
            this.scheduleDelays(newDelays);
          })
          .catch((err) => {
            this.logger.error(
              `Error resuming graph ${continuation.graphId}: ${err}`,
            );
          });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Entity spawn auto-load
  // ---------------------------------------------------------------------------

  private onEntitySpawned(data: Record<string, unknown>): void {
    const entityId = (data.entityId ?? data.entity) as string | undefined;
    if (!entityId) return;

    // Try to get behaviorGraph from entity properties via EntityManager
    const em = this.world.getSystem?.("entity-manager") as
      | {
          getEntity(id: string): { data?: Record<string, unknown> } | undefined;
        }
      | undefined;
    if (!em) return;

    const entity = em.getEntity(entityId);
    if (!entity) return;

    const entityData = entity.data;
    if (!entityData) return;

    const behaviorGraph = entityData.behaviorGraph as
      | RuntimeScriptGraph
      | undefined;
    if (behaviorGraph) {
      this.addGraph(entityId, behaviorGraph);
    }

    // Also check for behaviorGraphs array (multiple scripts per entity)
    const graphs = entityData.behaviorGraphs as
      | RuntimeScriptGraph[]
      | undefined;
    if (graphs && Array.isArray(graphs)) {
      for (const g of graphs) {
        this.addGraph(entityId, g);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Graph management
  // ---------------------------------------------------------------------------

  /**
   * Attach a script graph to an entity.
   *
   * @param entityId Target entity.
   * @param graph Graph to attach.
   * @param auth Optional caller identity. Omit or pass `{ trusted: true }`
   *             for system paths (entity auto-load, boot). Pass
   *             `{ playerId: <id> }` for player-initiated attachments, which
   *             must match the entity's `data.owner`.
   * @returns `{ added, reason? }` — reason is set when rejected.
   */
  addGraph(
    entityId: string,
    graph: RuntimeScriptGraph,
    auth?: AddGraphAuthContext,
  ): AddGraphResult {
    // Ownership enforcement: only applies to untrusted, player-scoped calls.
    if (auth && !auth.trusted) {
      if (!auth.playerId) {
        const reason = `addGraph rejected: caller provided no playerId and is not trusted`;
        this.logger.warn(reason);
        return { added: false, reason };
      }
      const entityOwner = this.readEntityOwner(entityId);
      if (entityOwner && entityOwner !== auth.playerId) {
        const reason = `addGraph rejected: caller ${auth.playerId} is not owner of entity ${entityId} (owner=${entityOwner})`;
        this.logger.warn(reason);
        return { added: false, reason };
      }
    }

    // Enforce max graphs per entity
    const existing = this.instances.get(entityId) ?? [];
    if (existing.length >= MAX_GRAPHS_PER_ENTITY) {
      const reason = `Entity ${entityId} already has ${existing.length} graphs (max ${MAX_GRAPHS_PER_ENTITY}), rejecting "${graph.name}"`;
      this.logger.warn(reason);
      return { added: false, reason };
    }

    // Validate node types against allowlist
    for (const node of graph.nodes) {
      const hasValidPrefix = ALLOWED_PREFIXES.some((p) =>
        node.type.startsWith(p),
      );
      if (!hasValidPrefix) {
        const reason = `Graph "${graph.name}" rejected: unknown node type "${node.type}"`;
        this.logger.warn(reason);
        return { added: false, reason };
      }
    }

    // Validate required node data fields
    for (const node of graph.nodes) {
      const result = validateNodeData(node.type, node.data);
      if (!result.valid) {
        this.logger.warn(
          `Graph "${graph.name}" node ${node.id} (${node.type}): ${result.errors.join(", ")}`,
        );
        // Warn but don't reject — some fields may be filled at runtime via trigger data
      }
    }

    const interpreter = new ScriptGraphInterpreter(graph);

    // Register all action handlers
    for (const type of this.actionExecutor.getRegisteredTypes()) {
      const handler = this.actionExecutor.getHandler(type);
      if (handler) interpreter.registerAction(type, handler);
    }

    // Register all condition evaluators
    for (const type of this.conditionRegistry.getRegisteredTypes()) {
      const evaluator = this.conditionRegistry.getEvaluator(type);
      if (evaluator) interpreter.registerCondition(type, evaluator);
    }

    // Initialize variables from graph defaults
    const variables = new Map<string, unknown>();
    for (const v of graph.variables) {
      variables.set(v.name, v.defaultValue);
    }

    const instance: ActiveGraphInstance = {
      entityId,
      interpreter,
      graph,
      variables,
    };

    existing.push(instance);
    this.instances.set(entityId, existing);

    // Phase 6.5 — Pre-index every trigger on this new instance by the
    // event name(s) it subscribes to.
    this.indexInstanceTriggers(entityId, instance);

    // Cache the owning playerId (if any) for per-player rate limiting.
    const owner = this.readEntityOwner(entityId);
    if (owner) {
      this.graphOwners.set(entityId, owner);
    }

    this.logger.info(`Added graph "${graph.name}" to entity ${entityId}`);

    // Fire synthetic "onReady" trigger (UE5 BeginPlay equivalent) so graphs can
    // initialize once when attached, without relying on entity:spawned timing.
    const em = this.world.getSystem?.("entity-manager") as
      | {
          getEntity(
            id: string,
          ): { data?: Record<string, unknown>; position?: unknown } | undefined;
        }
      | undefined;
    const entity = em?.getEntity(entityId);
    const position = (entity?.data?.position as unknown) ??
      (entity?.position as unknown) ?? { x: 0, y: 0, z: 0 };

    this.emitTypedEvent("scripting:graph_ready", {
      entityId,
      entity: entityId,
      graphId: graph.id,
      position,
    });

    return { added: true };
  }

  /** Remove a script graph from an entity. */
  removeGraph(entityId: string, graphId: string): void {
    const instances = this.instances.get(entityId);
    if (!instances) return;

    // Phase 6.2 — Release per-node flow state (doN counters, flipFlop,
    // gate, multiGate) on the removed graph's interpreter so long-lived
    // entities that swap graphs don't leak state maps.
    // Phase 6.5 — Drop this instance's entries from the event index.
    for (const inst of instances) {
      if (inst.graph.id === graphId) {
        inst.interpreter.clearFlowState();
        this.unindexInstanceTriggers(inst);
      }
    }

    const filtered = instances.filter((inst) => inst.graph.id !== graphId);
    if (filtered.length === 0) {
      this.instances.delete(entityId);
    } else {
      this.instances.set(entityId, filtered);
    }

    this.pendingDelays = this.pendingDelays.filter(
      (pd) => pd.continuation.graphId !== graphId,
    );
  }

  /** Remove all graphs from an entity. */
  removeAllGraphs(entityId: string): void {
    // Phase 6.2 — Clear flow state on every interpreter before dropping.
    // Phase 6.5 — Drop every instance's entries from the event index.
    const instances = this.instances.get(entityId);
    if (instances) {
      for (const inst of instances) {
        inst.interpreter.clearFlowState();
        this.unindexInstanceTriggers(inst);
      }
    }
    this.instances.delete(entityId);
    this.entityBuckets.delete(entityId);
    this.graphOwners.delete(entityId);
    this.pendingDelays = this.pendingDelays.filter(
      (pd) => pd.continuation.context.entityId !== entityId,
    );
  }

  /** Register a custom action handler. */
  registerAction(
    nodeType: string,
    handler: (
      data: Record<string, unknown>,
      ctx: ExecutionContext,
    ) => void | Promise<void>,
  ): void {
    this.actionExecutor.register(nodeType, handler);

    // Also register on all existing interpreters
    for (const instances of this.instances.values()) {
      for (const inst of instances) {
        inst.interpreter.registerAction(nodeType, handler);
      }
    }
  }

  /** Register a custom condition evaluator. */
  registerCondition(
    nodeType: string,
    evaluator: (
      data: Record<string, unknown>,
      ctx: ExecutionContext,
    ) => boolean,
  ): void {
    this.conditionRegistry.register(nodeType, evaluator);

    for (const instances of this.instances.values()) {
      for (const inst of instances) {
        inst.interpreter.registerCondition(nodeType, evaluator);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------------

  /**
   * Phase 6.5 — Build event-name → (instance, trigger) mappings for a
   * newly-added graph instance. Called from `addGraph` exactly once per
   * instance. Subscription events come from `TriggerEvaluator.mappings`
   * so only actually-wired trigger types land in the index.
   */
  private indexInstanceTriggers(
    entityId: string,
    instance: ActiveGraphInstance,
  ): void {
    for (const trigger of instance.interpreter.getTriggerNodes()) {
      const mapping = this.triggerEvaluator.getMappingForType(trigger.type);
      if (!mapping) continue;
      const entry: EventIndexEntry = { entityId, instance, trigger };
      for (const eventName of mapping.eventNames) {
        const list = this.eventIndex.get(eventName);
        if (list) list.push(entry);
        else this.eventIndex.set(eventName, [entry]);
      }
    }
  }

  /**
   * Phase 6.5 — Drop all event-index entries belonging to `instance`.
   * Uses an in-place filter pass per affected event list to preserve
   * ordering for any other entries.
   */
  private unindexInstanceTriggers(instance: ActiveGraphInstance): void {
    for (const [eventName, list] of this.eventIndex) {
      const filtered = list.filter((e) => e.instance !== instance);
      if (filtered.length === 0) {
        this.eventIndex.delete(eventName);
      } else if (filtered.length !== list.length) {
        this.eventIndex.set(eventName, filtered);
      }
    }
  }

  /** Handle an EventBus event and route to matching trigger nodes. */
  private handleEvent(
    eventName: string,
    eventData: Record<string, unknown>,
  ): void {
    // Phase 6.5 — Direct event-index lookup. Previously iterated every
    // entity × every graph × every trigger per event.
    const candidates = this.eventIndex.get(eventName);
    if (!candidates || candidates.length === 0) return;

    const now = Date.now();

    for (const { entityId, instance, trigger } of candidates) {
      const matches = this.triggerEvaluator.matchesTrigger(
        trigger,
        eventName,
        eventData,
        entityId,
      );
      if (!matches) continue;

      // Token-bucket rate limit: check entity budget, then player
      // aggregate budget (if the entity has an owner).
      if (!this.tryConsumeBudget(entityId, now)) continue;

      const triggerData = this.triggerEvaluator.extractTriggerData(
        trigger.type,
        eventData,
      );

      const ctx: ExecutionContext = {
        triggerData,
        variables: instance.variables,
        entityId,
        world: this.scriptingWorld,
      };

      instance.interpreter
        .execute(trigger.id, ctx)
        .then((delays) => {
          this.scheduleDelays(delays);
        })
        .catch((err) => {
          this.logger.error(
            `Error executing graph "${instance.graph.name}" for entity ${entityId}: ${err}`,
          );
        });
    }
  }

  /** Schedule delayed continuations with per-graph limits. */
  private scheduleDelays(delays: DelayedContinuation[]): void {
    const now = Date.now();
    for (const d of delays) {
      // Enforce per-graph delay limit
      const graphDelayCount = this.pendingDelays.filter(
        (pd) => pd.continuation.graphId === d.graphId,
      ).length;
      if (graphDelayCount >= MAX_PENDING_DELAYS_PER_GRAPH) {
        this.logger.warn(
          `Graph ${d.graphId} hit max pending delays (${MAX_PENDING_DELAYS_PER_GRAPH}), dropping`,
        );
        continue;
      }

      this.pendingDelays.push({
        continuation: d,
        resumeAt: now + d.delayMs,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  /** Get all active graph instances for an entity. */
  getGraphsForEntity(entityId: string): RuntimeScriptGraph[] {
    const instances = this.instances.get(entityId);
    if (!instances) return [];
    return instances.map((inst) => inst.graph);
  }

  /** Get the total number of active graph instances. */
  getActiveGraphCount(): number {
    let count = 0;
    for (const instances of this.instances.values()) {
      count += instances.length;
    }
    return count;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers — ownership & rate limiting
  // ---------------------------------------------------------------------------

  /** Read the owning playerId from an entity's `data.owner`, if present. */
  private readEntityOwner(entityId: string): string | null {
    const em = this.world.getSystem?.("entity-manager") as
      | {
          getEntity(id: string): { data?: Record<string, unknown> } | undefined;
        }
      | undefined;
    if (!em) return null;
    const entity = em.getEntity(entityId);
    const owner = entity?.data?.owner;
    return typeof owner === "string" && owner.length > 0 ? owner : null;
  }

  /** Refill a token bucket lazily, up to `capacity`. */
  private refillBucket(
    bucket: TokenBucket,
    capacity: number,
    refillPerSec: number,
    now: number,
  ): void {
    const elapsedMs = now - bucket.lastRefillAt;
    if (elapsedMs <= 0) return;
    const tokensToAdd = (elapsedMs / 1000) * refillPerSec;
    bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefillAt = now;
  }

  /**
   * Attempt to consume one token from both the entity bucket and (if the
   * entity is player-owned) the owning-player bucket.
   *
   * Returns `true` if a token was consumed from all applicable buckets.
   * Returns `false` (and emits `scripting:rate_limited`) if any bucket is
   * empty. When `false`, no tokens are consumed from any bucket.
   */
  private tryConsumeBudget(entityId: string, now: number): boolean {
    // Entity bucket
    let entityBucket = this.entityBuckets.get(entityId);
    if (!entityBucket) {
      entityBucket = { tokens: ENTITY_BUCKET_CAPACITY, lastRefillAt: now };
      this.entityBuckets.set(entityId, entityBucket);
    } else {
      this.refillBucket(
        entityBucket,
        ENTITY_BUCKET_CAPACITY,
        ENTITY_BUCKET_REFILL_PER_SEC,
        now,
      );
    }

    const ownerId = this.graphOwners.get(entityId) ?? null;
    let playerBucket: TokenBucket | null = null;
    if (ownerId) {
      const existing = this.playerBuckets.get(ownerId);
      if (!existing) {
        playerBucket = { tokens: PLAYER_BUCKET_CAPACITY, lastRefillAt: now };
        this.playerBuckets.set(ownerId, playerBucket);
      } else {
        playerBucket = existing;
        this.refillBucket(
          playerBucket,
          PLAYER_BUCKET_CAPACITY,
          PLAYER_BUCKET_REFILL_PER_SEC,
          now,
        );
      }
    }

    if (entityBucket.tokens < 1) {
      this.emitTypedEvent("scripting:rate_limited", {
        entityId,
        scope: "entity",
        capacity: ENTITY_BUCKET_CAPACITY,
      });
      return false;
    }
    if (playerBucket && playerBucket.tokens < 1) {
      this.emitTypedEvent("scripting:rate_limited", {
        entityId,
        playerId: ownerId,
        scope: "player",
        capacity: PLAYER_BUCKET_CAPACITY,
      });
      return false;
    }

    entityBucket.tokens -= 1;
    if (playerBucket) playerBucket.tokens -= 1;
    return true;
  }
}
