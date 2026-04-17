# Node Graph Scripting System — Path to 9.5/10

**Target**: Raise every super-audit metric from current scores (2–6/10) to 9.5/10.

**Status at plan creation (2026-04-15)**: The audit's most severe findings were stale. The runtime IS already instantiated, entity spawn paths DO load `behaviorGraph`, validation IS wired into save routes, and 5 test files exist. Real remaining gaps are documented per-phase below.

**Execution model**: Each phase is self-contained and can run in its own Claude Code session. Phases 1–3 are independent and can run in parallel; Phase 4+ depend on earlier phases.

---

## Phase 0 — Documentation Discovery (COMPLETED)

### Ground truth established by discovery agents

**Architecture (runtime is wired):**
- `ScriptingSystem` registered at `packages/shared/src/systems/shared/infrastructure/SystemLoader.ts:445` via `world.register("scripting", ScriptingSystem)`.
- Constructor: `constructor(world: World)` with `dependencies: { required: ["entity-manager"], optional: ["dialogue", "quest"] }`.
- `ScriptingSystem.onEntitySpawned(data)` at `packages/shared/src/systems/shared/scripting/ScriptingSystem.ts:190-218` reads `entityData.behaviorGraph` AND `entityData.behaviorGraphs[]` and calls `this.addGraph(entityId, graph)`.
- Tick loop: `ScriptingSystem.update(_dt)` at `ScriptingSystem.ts:146` processes delayed continuations.
- `ActionExecutor` emits **real game events** (`mob_npc:spawn_request`, `entity:damaged`, `dialogue:start`, etc.) — NOT `scripting:*` events. Game systems already handle these.

**Editor/runtime catalog:**
- Editor node library: **122 node types** across 7 categories (trigger 33, action 33, condition 17, flow 8, math 22, variable 3, data 6) — `packages/asset-forge/src/scripting/nodeLibrary.ts`.
- Runtime handlers: **45 actions + 22 conditions + 34 triggers** registered.
- **Drift: 2 editor-only triggers** (`trigger/onEntityDeath`, `trigger/onInteract`) have no runtime mapping.
- **Drift: 44 runtime-only handlers** (15 actions, 8 conditions, 21 triggers) have no editor node. Example actions: `applyBuff`, `removeBuff`, `despawnAllInRadius`, `dropItem`, `emitCustomEvent`, `lockMovement`, `unlockMovement`, `log`, `playAnimation`, `setAggroRange`, `setDialogueOverride`, `setMovementSpeed`, `setRespawnTime`, `wait`. Example triggers: `onBankDeposit`, `onBankWithdraw`, `onCookingComplete`, `onDialogueResponse`, `onEntityDamaged`, `onMovementCompleted`, `onPlayerHealthChanged`, `onPlayerJoined`, `onPlayerLeft`, `onTeleportCompleted`, and 11 more skill-completion triggers.

**Persistence (partial):**
- Today: `behaviorGraph` is embedded inside `worldProjects.worldData` JSONB column at `packages/asset-forge/server/db/schema/world-projects.schema.ts:47`. Validated at save via `validateEmbeddedGraphs()` at `server/utils/scriptGraphValidator.ts` (called at `server/routes/world-projects.ts:207-214, 433-440`).
- Missing: **no standalone `scripts` table** for reuse across entities/projects, no share/clone API, no version history.

**UE5 parity gaps:**
- CRITICAL: spatial queries (0/5), sub-graphs (0/1), typed ECS accessors (0/5).
- HIGH: vector math ops (only make/break/distance3D — no add/normalize/dot/cross), array ops (only forEach — no length/contains/add/remove/filter/map), custom-event trigger, debug editor nodes.
- MEDIUM: timeline nodes (0), flow loops (no for/while), typed casts (0).

**Security/performance baseline:**
- Rate limiting: `elysia-rate-limit` global 100 req/min per IP (`api-elysia.ts`). No per-entity graph-execution budget.
- Type safety: `ScriptNode.data: Record<string, unknown>` at editor; runtime validates via `NodeDataSchemas.ts` (40+ typed schemas + `validateNodeData()`). Editor-side validation is not forced before save.
- Pooling: reference pattern is `packages/shared/src/utils/pools/TilePool.ts` (used by `CombatSystem`). No pooling exists inside `ScriptingSystem`/`ScriptGraphInterpreter` (ExecutionContext, FlowState allocated per-execute).

### Allowed APIs list (from discovery — never invent)

| API | Source | Exact signature |
|-----|--------|-----------------|
| System registration | `SystemLoader.ts:445` | `world.register(key: string, SystemClass: SystemConstructor): System` |
| Event subscribe | `SystemBase` | `subscribe<T>(eventType: string, handler: (data: T) => void): void` |
| Event emit | `SystemBase` (protected) | `emitTypedEvent(eventType: string, data: Record<string, unknown>): void` |
| Spawn hook | `EntityManager.ts:790` | emits `EventType.ENTITY_SPAWNED` with `{ entity, data }` |
| Graph loader | `ScriptingSystem.ts:190-218` | `onEntitySpawned(data)` reads `entityData.behaviorGraph` / `behaviorGraphs[]` |
| Action handler register | `ActionExecutor.ts:580-664` | `this.register("action/<name>", (ctx, node) => void)` |
| Condition register | `ConditionEvaluator.ts:361-401` | `this.register("condition/<name>", (ctx, node) => boolean)` |
| Trigger mapping | `TriggerEvaluator.ts:34-600` | `DEFAULT_TRIGGER_MAPPINGS: TriggerMapping[]` |
| Editor node def | `nodeLibrary.ts` | `{ type, label, category, color, icon, description, inputs, outputs, fields }` |
| Graph validator | `server/utils/scriptGraphValidator.ts` | `validateScriptGraph(g) / validateEmbeddedGraphs(d)` |
| DB schema | `server/db/schema/world-projects.schema.ts:24-70` | Drizzle `pgTable(name, cols, (t) => indexes)` |
| Route | `server/routes/world-projects.ts` | Elysia `.derive(authDerive).guard({ beforeHandle: [requireAuthGuard] })` |
| Validation | `server/models/world-studio.models.ts:10-172` | TypeBox `t.Object({ ... })` + `Static<typeof X>` |
| Pool | `packages/shared/src/utils/pools/TilePool.ts` | `tilePool.acquire() / release(t) / setFromPosition(t, pos)` |

### Anti-patterns (explicitly forbidden)

- ❌ Do NOT invent `scripting:*` events — runtime uses real game events.
- ❌ Do NOT add a second system registration for `ScriptingSystem` — it's already registered.
- ❌ Do NOT use mocks in tests (project rule: real Hyperscape instances).
- ❌ Do NOT use `any` — ESLint rejects.
- ❌ Do NOT create `_v2.ts` variants — revise existing files.
- ❌ Do NOT use Zod for Elysia route validation — use TypeBox (`t.*`). Zod is reserved for AI output schemas.
- ❌ Do NOT hardcode node types in switch statements — use the registry pattern (`ActionExecutor.register`).
- ❌ Do NOT use `remove_doubles` or similar destructive ops on graph structures.
- ❌ Do NOT skip `validateEmbeddedGraphs` on any new save endpoint.
- ❌ Do NOT modify `CLAUDE.md`-level files without user request.

---

## Phase 1 — Close editor/runtime drift (Type Safety 6→9, Game Coverage 4→8)

**Goal**: Zero drift between editor node library and runtime registered handlers.

### 1.1 Add runtime mappings for 2 editor-only triggers

**What**: Add `TriggerMapping` entries in `DEFAULT_TRIGGER_MAPPINGS` (`packages/shared/src/systems/shared/scripting/TriggerEvaluator.ts`).

**Copy pattern from**: Existing entries at `TriggerEvaluator.ts:34-600` — each has shape `{ eventNames: string[], triggerType: string, extract: (data) => TriggerData }`.

**Nodes to map**:
- `trigger/onEntityDeath` — listen on `EventType.ENTITY_DEATH` and `entity:death`; extract `{ entity, killer, position }`.
- `trigger/onInteract` — listen on `EventType.INTERACTION_TRIGGERED` (check `event-types.ts` for exact name); extract `{ player, entity }`.

**Verification checklist**:
- `grep -n "trigger/onEntityDeath\|trigger/onInteract" packages/shared/src/systems/shared/scripting/TriggerEvaluator.ts` → 2 hits each.
- Unit test in `TriggerEvaluator.test.ts` — emit synthetic event, assert trigger fires.
- No editor warning "unknown trigger type" when opening a default mob graph.

**Anti-pattern guards**:
- Do NOT invent event names. Read `packages/shared/src/types/events/event-types.ts` first, find exact event names.
- Do NOT change existing mappings — only ADD.

### 1.2 Add editor nodes for 44 runtime-only handlers

**What**: Add node definitions in `packages/asset-forge/src/scripting/nodeLibrary.ts`.

**Copy pattern from**: Existing entries in `nodeLibrary.ts` — e.g. `trigger/onEntityDeath` and `action/showDialogue` entries show the exact shape with `inputs: [flowIn(), ...]`, `outputs: [flowOut(), ...]`, `fields: [...]`.

**Editor nodes to add** (names match runtime handler keys exactly):

Actions (15): `action/applyBuff`, `action/despawnAllInRadius`, `action/dropItem`, `action/emitCustomEvent`, `action/getEntityProperty` (expose as both data and action), `action/lockMovement`, `action/log`, `action/playAnimation`, `action/removeBuff`, `action/setAggroRange`, `action/setDialogueOverride`, `action/setMovementSpeed`, `action/setRespawnTime`, `action/unlockMovement`, `action/wait`.

Conditions (8): `condition/entityCount`, `condition/entityExists`, `condition/hasActiveBuff`, `condition/hasQuestCompleted`, `condition/isMobAlive`, `condition/isPlayerInRange`, `condition/timeOfDay`, `condition/variableExists`.

Triggers (21): `trigger/onBankDeposit`, `trigger/onBankWithdraw`, `trigger/onCookingComplete`, `trigger/onCorpseLoot`, `trigger/onDialogueResponse`, `trigger/onEntityDamaged`, `trigger/onFiremakingSuccess`, `trigger/onFletchingComplete`, `trigger/onItemPickup`, `trigger/onMovementCompleted`, `trigger/onMovementStarted`, `trigger/onPlayerHealthChanged`, `trigger/onPlayerJoined`, `trigger/onPlayerLeft`, `trigger/onRunToggle`, `trigger/onSmeltingComplete`, `trigger/onSmithingComplete`, `trigger/onStaminaDepleted`, `trigger/onTeleportCompleted`, `trigger/onAggroTriggered`, plus any others surfaced by step 1.2.

**Fields for each**: mirror the `NodeData` interface from `packages/shared/src/systems/shared/scripting/NodeDataSchemas.ts` — every field declared there must appear in the editor definition.

**Verification checklist**:
- Add an integration test `packages/asset-forge/src/scripting/__tests__/editorRuntimeDrift.test.ts` that:
  1. Imports editor `nodeLibrary` and runtime `ActionExecutor`/`ConditionEvaluator`/`TriggerEvaluator` registries.
  2. Asserts every editor node type has a registered runtime handler.
  3. Asserts every registered runtime handler has an editor node type.
  4. Test must FAIL if drift exists — this becomes a regression guard.
- Open the editor's NodePalette and confirm all new nodes render with proper category colors.

**Anti-pattern guards**:
- Do NOT change runtime handler keys to match editor — the RUNTIME is canonical.
- Do NOT omit `fields` arrays — users need UI to configure node data.
- Do NOT duplicate `action/getEntityProperty` — if both `action/` and `data/` variants exist, decide on one and alias.

### 1.3 Force per-node data validation at editor save

**What**: Invoke runtime `validateNodeData()` from the editor before graph save to catch invalid configurations client-side.

**Copy pattern from**: `NodeDataSchemas.ts:283-300` (exports `validateNodeData`). Either (a) share via `@hyperforge/shared` import in asset-forge, or (b) copy schema definitions into asset-forge and keep in sync.

**Verification**:
- Save a graph with missing required field → editor shows error, save blocked.
- Existing valid graphs continue to save.

---

## Phase 2 — UE5 Parity Tier 1 (Architecture 2→9, UE5 Parity 3→7)

**Goal**: Close the three most-impactful UE5 gaps: spatial queries, sub-graphs, typed ECS accessors.

### 2.1 Spatial query nodes + runtime handlers

**Nodes to add** (editor + runtime):
- `data/findEntitiesInRadius` — inputs: `origin: Vector3`, `radius: number`, `entityType?: string (filter)` → output: `entities: Entity[]`.
- `data/findClosestEntity` — inputs: `origin: Vector3`, `entityType?: string` → output: `entity: Entity | null`, `distance: number`.
- `data/lineTrace` — inputs: `from: Vector3`, `to: Vector3`, `ignoreEntity?: Entity` → output: `hit: boolean`, `entity: Entity | null`, `hitPoint: Vector3`.
- `data/sphereCast` — inputs: `origin: Vector3`, `direction: Vector3`, `distance: number`, `radius: number` → output: `hit`, `entities: Entity[]`.
- `data/isLineOfSight` — inputs: `from: Vector3`, `to: Vector3` → output: `hasLOS: boolean`.

**Runtime implementation**: Register in `ActionExecutor.ts`. Query `EntityManager` via `ctx.world.getSystem("entity-manager")` — read `EntityManager.ts:631-798` for the entity query APIs it exposes. For LOS, use existing physics system if available (check `packages/shared/src/systems/shared/physics/` — if PhysX raycast exists, use it; otherwise use tile-based occlusion from terrain).

**Doc refs**:
- Entity query APIs: read `packages/shared/src/systems/shared/entities/EntityManager.ts` (lines 600-1100 for public methods).
- Existing similar pattern: `CombatSystem.ts` line ranges 900–1100 show range checks using `tilePool`.

**Verification**:
- Unit test: spawn 3 mobs at known positions, call `findEntitiesInRadius(origin, r)`, assert expected count.
- Unit test: `findClosestEntity` returns correct entity with correct distance.
- Integration test: graph with onInteract → findEntitiesInRadius → forEach → dealDamage simulates an AoE spell.

**Anti-pattern guards**:
- Do NOT implement brute-force O(N) scans without consulting if `EntityManager` already has spatial index.
- Do NOT allocate new arrays per call — acquire from pool (see Phase 6) or use a reusable result buffer passed by reference.

### 2.2 Sub-graph / function graph support

**What**: Allow a graph to call another graph. Two new concepts:
1. **Function graphs**: graphs with declared inputs/outputs that can be invoked.
2. **Graph call node**: editor node `flow/callGraph` that invokes a named function graph with bound inputs.

**Schema changes**:
- `ScriptGraph.graphType` adds literal `"function"`.
- `ScriptGraph` gains optional `inputs: PortDefinition[]` and `outputs: PortDefinition[]` (already optional on nodes; mirror at graph level).
- `ScriptGraph` gains optional `parameters: Array<{ name: string; type: string; defaultValue?: unknown }>` for typed entry points.

**Runtime**: In `ScriptGraphInterpreter`, add a call-stack dimension to `ExecutionContext` (bounded depth). On `flow/callGraph` node, look up graph by id from a `GraphRegistry` (new), create child execution context, run it, return outputs.

**Doc refs**: Read `ScriptGraphInterpreter.ts` fully (708 lines) to understand the current `ExecutionContext` and flow execution. Model call stack after how `flow/delay` manages continuations.

**Verification**:
- Unit test: define a function graph `computeDamage(attacker, target) -> number`, call from a behavior graph, assert return value.
- Unit test: recursion depth limit — calling graphs beyond max depth returns error.
- Circular call detection prevents infinite loops.

**Anti-pattern guards**:
- Do NOT allow unbounded recursion — add `MAX_CALL_DEPTH = 32` constant.
- Do NOT share variables between parent and child unless explicitly declared as output.
- Do NOT modify existing `"behavior" | "event"` graph types — ADD `"function"`.

### 2.3 Typed ECS component accessors

**Nodes to add** (replacing generic `data/getEntityProperty` with typed variants):
- `data/getPlayerHealth` — input: `player: Entity` → output: `current: number`, `max: number`, `percent: number`.
- `data/getEntityPosition` — input: `entity: Entity` → output: `position: Vector3`.
- `data/getEntityRotation` — input: `entity: Entity` → output: `rotation: number` (Y-axis yaw in radians).
- `data/getPlayerInventory` — input: `player: Entity` → output: `items: Array<{ itemId, quantity, slot }>`.
- `data/getPlayerEquipment` — input: `player: Entity` → output: `equipment: Record<slot, itemId>`.
- `data/getPlayerStats` — input: `player: Entity` → output: `{ attack, strength, defense, constitution, ranged, magic, prayer }`.

**Runtime**: Register in `ActionExecutor.ts`. Read fields from `entity.data` — the actual shape of which is defined in component types at `packages/shared/src/components/`. DO NOT assume field names; read the component definitions first.

**Keep**: generic `data/getEntityProperty` as escape hatch for properties without typed accessors.

**Verification**:
- Unit test with a Player entity fixture: read each typed accessor, assert correct values.
- TypeScript: add per-node return type annotations to the output ports (e.g. `dataOut("health", "Health", "number")`).

**Anti-pattern guards**:
- Do NOT duplicate logic that ECS components already expose.
- Do NOT hardcode component shapes — read `packages/shared/src/components/` first.

---

## Phase 3 — UE5 Parity Tier 2 (UE5 Parity 7→9.5)

**Goal**: Vector math, array ops, custom events, debug nodes.

### 3.1 Vector math nodes (editor + runtime)

Add: `math/vector.add`, `math/vector.subtract`, `math/vector.scale`, `math/vector.normalize`, `math/vector.dot`, `math/vector.cross`, `math/vector.length`, `math/vector.lerp`.

Copy pattern from existing `math/distance3D` (already vector-aware). Use `data/makeVector3`/`breakVector3` for conversions.

**Verification**: unit test each operation with known vectors.

### 3.2 Array/collection operation nodes

Add: `data/arrayLength`, `data/arrayContains`, `data/arrayAdd`, `data/arrayRemove`, `data/arrayGetAt`, `data/arraySlice`. Defer `filter`/`map` until sub-graph support (Phase 2.2) is stable — then add `data/arrayFilter` and `data/arrayMap` that accept a function graph reference.

**Verification**: unit test each with mixed-type arrays.

### 3.3 Custom event editor completeness

- Add `trigger/onCustomEvent` with fields `{ eventName: string }` — runtime listens on `custom:<eventName>` emitted by `action/emitCustomEvent`.
- Editor node for `action/emitCustomEvent` (already in runtime, missing from palette — covered by Phase 1.2 but explicitly verify).

**Verification**: E2E — graph A emits `custom:bossDefeated`, graph B's `trigger/onCustomEvent` with matching name fires.

### 3.4 Debug nodes

- `action/log` editor node (runtime exists) with fields `{ message: string, level: "debug" | "info" | "warn" | "error" }`.
- `action/debugDraw` — draw sphere/line/box in world for N seconds (uses Three.js debug overlay).
- `action/breakpoint` — pauses graph execution, surfaces to editor UI (deferred if no live-debug channel exists).

**Verification**: open devtools, run a graph with `action/log` — see console output with correct node/graph IDs.

### 3.5 Flow loops + typed casts

- `flow/forLoop` (numeric 0..N), `flow/whileLoop` (condition-bounded, with max-iteration guard = 10,000).
- `data/castToPlayer`, `data/castToNPC`, `data/castToMob` — input: `Entity`, output: typed entity or null.
- `data/toBoolean` — coerce number/string to boolean.

**Verification**: whileLoop with non-terminating condition hits max-iteration guard and errors cleanly.

---

## Phase 4 — Standalone scripts persistence (Architecture 9→9.5, Pre-built Scripts 2→6)

**Goal**: Scripts can exist independently of a world project; be shared, cloned, versioned, and referenced by id.

### 4.1 Database schema

**Copy pattern from**: `packages/asset-forge/server/db/schema/world-projects.schema.ts:24-70`.

Create `packages/asset-forge/server/db/schema/scripts.schema.ts`:

```typescript
export const scripts = pgTable("scripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: uuid("team_id").references(() => teams.id).notNull(),
  gameId: uuid("game_id").references(() => games.id), // nullable — game-scoped or team-scoped
  name: text("name").notNull(),
  description: text("description"),
  graphType: text("graph_type").notNull(), // "behavior" | "event" | "function"
  graphData: jsonb("graph_data").notNull(), // ScriptGraph JSON
  version: integer("version").notNull().default(1),
  isTemplate: boolean("is_template").notNull().default(false),
  isPublic: boolean("is_public").notNull().default(false),
  createdBy: uuid("created_by").references(() => forgeUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  teamIdx: index("idx_scripts_team").on(t.teamId),
  gameIdx: index("idx_scripts_game").on(t.gameId),
  templateIdx: index("idx_scripts_template").on(t.isTemplate, t.isPublic),
}));
```

Also: add to `packages/asset-forge/server/db/schema/index.ts` exports.

Run `bun x drizzle-kit generate` to produce migration file.

### 4.2 API routes

**Copy pattern from**: `packages/asset-forge/server/routes/world-projects.ts` (full file).

Create `packages/asset-forge/server/routes/scripts.ts` with:
- `GET  /api/teams/:teamId/scripts` — list (requires team membership).
- `GET  /api/teams/:teamId/scripts/:id` — detail.
- `POST /api/teams/:teamId/scripts` — create (requires `script:create` permission). Validate with `validateScriptGraph()`.
- `PUT  /api/teams/:teamId/scripts/:id` — update (requires `script:edit`). Validate.
- `DELETE /api/teams/:teamId/scripts/:id` — delete (requires `script:delete`).
- `POST /api/teams/:teamId/scripts/:id/clone` — clone to new script (copy graphData, reset version).
- `GET  /api/scripts/templates` — public templates (no auth).

**TypeBox models**: Add to `packages/asset-forge/server/models/world-studio.models.ts` or create `scripts.models.ts`. Mirror `CreateWorldProjectBody` pattern.

**Mount** in `server/api-elysia.ts` alongside existing `.use(createWorldProjectRoutes(...))`.

### 4.3 Editor integration

- Editor's "Create Script" button offers "Save to library" option → POSTs to scripts table.
- Entity property panels can reference a saved script by id OR embed inline.
- Both paths go through `validateEmbeddedGraphs` before save.

**Anti-pattern guards**:
- Do NOT bypass `hasPermission()` checks — every CRUD op requires it.
- Do NOT skip `validateScriptGraph()` on create/update.
- Do NOT allow cross-team script reads without explicit `isPublic = true`.
- Do NOT return `createdBy` or `teamId` in public template endpoint.

**Verification**:
- Integration test with Supertest-like Elysia test util: create → list → get → clone → delete.
- Permission test: user without `script:edit` gets 403 on PUT.
- Validation test: POST with invalid graph returns 400 with error message.

---

## Phase 5 — Security hardening (Security 4→9.5)

### 5.1 Server-side node-type allowlist

Create `packages/shared/src/systems/shared/scripting/NodeTypeAllowlist.ts` listing every known node type. `validateScriptGraph` already exists — extend it to reject unknown node types.

### 5.2 Execution limits in interpreter

Add to `ScriptGraphInterpreter.ts`:
- `MAX_EXECUTION_DEPTH = 128` (flow node chain depth).
- `MAX_NODES_PER_TICK = 1000` (per-graph budget per world tick).
- `MAX_GRAPH_CALL_DEPTH = 32` (sub-graph recursion — see Phase 2.2).
- `MAX_DELAYED_CONTINUATIONS = 256` (per-graph pending timer budget).

When exceeded: error logged, graph suspended (not world-crashed), surfaces via event to editor.

### 5.3 Entity ownership validation

In `ScriptingSystem.addGraph(entityId, graph)`: verify the graph's `ownerId` (new field) matches entity owner OR is null (server-authored). Reject player-authored graphs attached to entities they don't own.

### 5.4 Script execution rate limiting

Beyond the global IP rate limit:
- Per-entity: max 1 graph execution per 16ms (one frame).
- Per-player: max 10 custom event emissions per second.

Implement inside `ScriptingSystem.update()` using a token-bucket keyed by `ownerId`.

### 5.5 Action data sanitization

For string actions (`sendChat`, `showDialogue`, `showNotification`): apply server-side max length (512 chars for chat, 2048 for dialogue) and strip control characters. Log abuse attempts.

**Verification**:
- Unit test each limit triggers correctly.
- Attempt to load a graph with unknown node type → validateScriptGraph rejects.
- Attempt to attach a graph with mismatched ownerId → ScriptingSystem rejects.

---

## Phase 6 — Performance (Performance 5→9.5)

**Copy pattern from**: `packages/shared/src/utils/pools/TilePool.ts` and its use in `CombatSystem.ts:184-186, 932-934`.

### 6.1 ExecutionContext pool

Create `packages/shared/src/utils/pools/ExecutionContextPool.ts`. Pre-allocate 16, grow by 8. Acquire at graph-execute start, release at end. Reset all fields on release.

### 6.2 FlowState pool + cleanup

Currently `ScriptGraphInterpreter` allocates flow state per execute. Convert to pooled. On graph removal (`removeGraph`), release all flow states back to the pool.

### 6.3 Graph compilation

Add `compileGraph(graph: ScriptGraph): CompiledGraph` that:
- Pre-indexes edges by sourceNodeId for O(1) `getFlowSuccessors`.
- Pre-indexes nodes by id for O(1) lookup.
- Validates once, caches result.

Call at `addGraph()` — run the compiled form at execute time. Keep source `ScriptGraph` for debugging.

### 6.4 Pre-allocated scratch arrays in hot paths

`getFlowSuccessors(node)` currently builds a new array per call. Use a reusable scratch buffer (class field `private readonly _scratchSuccessors: string[] = []`) with manual `.length = 0` reset.

### 6.5 Batch event processing

`ScriptingSystem.handleEvent` processes events as they arrive. Batch incoming events per tick: accumulate in a queue, process in `update()` with one pass per event-type (cache locality).

**Verification**:
- Add benchmarks in `packages/shared/src/systems/shared/scripting/__tests__/ScriptGraphInterpreter.benchmark.ts`. Target: 10,000 simple graph executions per second with zero GC pressure.
- Profile memory: heap stable under 100-tick simulation with 50 active graphs.

**Anti-pattern guards**:
- Do NOT introduce manual memory management outside pool utilities.
- Do NOT cache references that could leak between graphs — always reset on release.

---

## Phase 7 — Pre-built game scripts from real Hyperscape behavior (Pre-built 6→9.5)

**Goal**: Convert real Hyperscape patterns into editable template graphs that users can fork.

Per-pattern task: read the real system, then build a graph in `packages/asset-forge/src/scripting/templates.ts` that reproduces its behavior using only allowlisted nodes. Each template must round-trip through the validator cleanly.

### 7.1 Goblin respawn template
Source truth: `packages/server/world/assets/manifests/npcs.json` (goblin entry) + `MobNPCSpawnerSystem.spawnMobFromData`. Template: `trigger/onEntityDeath` (mobType=goblin) → `flow/delay` (duration = respawnTicks * 0.6) → `action/spawnMob`.

### 7.2 Shopkeeper template
Source: NPC with `store` field. Template: `trigger/onNPCInteraction` → `action/showDialogue` ("Welcome") → `action/openShop` (storeId).

### 7.3 Quest giver template
Source: NPCs with `category: "quest"`. Template: `onNPCInteraction` → `condition/questState` → branches to `action/startQuest` / "active" / "completed" dialogue.

### 7.4 Bank clerk template
Source: NPCs with `npcTypeId: "bank_clerk"`. Template: `onNPCInteraction` → `action/showDialogue` → `action/openBank`.

### 7.5 Crafting station template
Source: `StationSystem`. Template: `onInteract` → `condition/skillLevel` → skill-specific action (smithing, cooking, crafting) → `action/giveXP`.

### 7.6 Resource gather + respawn template
Source: `ResourceSystem`. Template: `onInteract` → `condition/skillLevel` → `action/giveXP` → `trigger/onResourceDepleted` → `flow/delay` → `action/spawnParticle` (respawn fx).

### 7.7 Aggressive mob template
Source: `MobAISystem`. Template: `trigger/onPlayerEnterZone` → `action/startCombat` → `trigger/onEntityDeath` → `action/giveXP` → `action/dropItem`.

### 7.8 Boss phase template
Source: pick an existing boss manifest. Template: `trigger/onEntityDamaged` → `condition/healthCheck` (< 50%) → `variable/set` (phase=2) → `action/emitCustomEvent` (boss:phase2) → `action/setMovementSpeed`.

**Verification per template**:
- Template round-trips through `validateScriptGraph` with zero errors.
- In a live integration test, load the template onto a placed entity and observe expected behavior (e.g. goblin actually respawns after 21s).
- User can fork template, modify fields, save as new script — no regression.

**Anti-pattern guards**:
- Do NOT reproduce game logic in the graph that should live in the game system — graphs OVERLAY existing systems, they don't replace them.
- Do NOT hardcode manifest-specific values in templates — use the entity-data pass-through pattern from `defaultGraphs.ts`.

---

## Phase 8 — Testing to 9.5/10 (Testing 1→9.5)

**Note**: Baseline already has 5 scripting test files (~90KB). This phase completes coverage.

### 8.1 Unit tests for all new nodes
Every Phase 1–3 node needs a unit test. Follow pattern at `packages/shared/src/systems/shared/scripting/__tests__/ScriptGraphInterpreter.test.ts` lines 17-75 (helpers: `uid`, `makeNode`, `makeEdge`, `makeGraph`, `makeCtx`).

### 8.2 Drift regression test
From Phase 1.2 — test enforces editor ↔ runtime parity. Fails if anyone adds a handler without a node or vice versa.

### 8.3 Integration: template → editor → save → load → execute

New test file: `packages/asset-forge/tests/integration/scripting.spec.ts`.

Flow:
1. Pick each template from Phase 7.
2. Load in editor via `useScriptGraphState`.
3. Save via POST `/api/teams/:teamId/scripts`.
4. Fetch via GET.
5. Assert identical graph after round-trip.
6. Attach to a test entity, simulate triggering event, assert runtime executes expected actions.

### 8.4 E2E with Playwright
Copy pattern from `packages/asset-forge/tests/e2e/world-builder.spec.ts`.

New file: `packages/asset-forge/tests/e2e/script-editor.spec.ts`:
1. Open World Studio.
2. Select a mob spawn entity.
3. Click "Edit Default Script".
4. Verify default graph loads with correct nodes and edges.
5. Add an action node via NodePalette.
6. Connect edges.
7. Save.
8. Reopen and verify persistence.

### 8.5 Security tests
- Attempt to save graph with unknown node type → 400.
- Attempt to save 100 graphs in 1 minute as same user → rate-limited.
- Attempt to load graph exceeding MAX_EXECUTION_DEPTH → runtime rejects.
- Submit graph with control characters in dialogue text → sanitized.

### 8.6 Performance tests
`packages/shared/src/systems/shared/scripting/__tests__/ScriptGraphInterpreter.benchmark.ts`:
- 10k executions/sec of the goblin respawn template.
- 50 concurrent active graphs with stable memory over 100 ticks.
- Zero allocations during hot-path after warmup (verify with heap snapshots).

**Anti-pattern guards**:
- Do NOT mock the World, EntityManager, or any ECS system. Use real instances per `CLAUDE.md`.
- Do NOT hardcode test fixtures — reuse real manifests where possible.
- Do NOT skip Playwright visual assertions on e2e tests.

---

## Phase 9 — Verification & handoff

### 9.1 Re-run super-audit
Re-execute the super-audit command with the same arguments. Target scores:
- Code Quality 5→9.5
- Architecture 2→9.5
- UE5 Parity 3→9.5
- Game Coverage 4→9.5
- Testing 1→9.5
- Type Safety 6→9.5
- Security 4→9.5
- Performance 5→9.5
- Pre-built Scripts 2→9.5

### 9.2 Anti-pattern grep sweep

Run each and expect empty results:
- `grep -rn ": any" packages/shared/src/systems/shared/scripting/` — zero.
- `grep -rn "scripting:" packages/shared/src/systems/shared/scripting/ | grep -v scripting:subscribe` — zero (no fabricated events).
- `grep -rn "as any" packages/asset-forge/src/scripting/` — zero.
- `grep -rn "\.only(" packages/shared/src/systems/shared/scripting/__tests__/` — zero (no focused tests left in).

### 9.3 Manual validation
- Open World Studio, select each entity type (mob spawn, NPC, station, resource, store), click "Edit Default Script" — each shows a meaningful graph with no red nodes, no validation errors, no orphan warnings.
- Save, reload, verify persistence.
- Deploy to a test Hyperscape instance, observe goblins respawning on 21s cadence driven by a graph (match against hand-rolled baseline).

### 9.4 Memory update
After completion, save a project memory entry noting:
- Phase completion dates.
- Final audit scores.
- Location of the new `scripts` table.
- Any deferred items (e.g. timeline nodes if skipped).

---

## Appendix A — File inventory for future sessions

**Read-only reference files** (copy patterns from, don't modify):
- `packages/shared/src/systems/shared/infrastructure/SystemLoader.ts:441-452` (system registration)
- `packages/shared/src/systems/shared/scripting/ScriptingSystem.ts:113-136, 190-218, 356-414` (event subscription, graph loading, event handling)
- `packages/shared/src/systems/shared/scripting/ActionExecutor.ts:18-64, 580-664` (action handler pattern, registration)
- `packages/shared/src/systems/shared/scripting/ConditionEvaluator.ts:361-401` (condition registration)
- `packages/shared/src/systems/shared/scripting/TriggerEvaluator.ts:34-600` (trigger mappings)
- `packages/shared/src/systems/shared/scripting/NodeDataSchemas.ts:12-300` (per-node data schemas)
- `packages/shared/src/systems/shared/entities/EntityManager.ts:631-798` (spawn + ENTITY_SPAWNED)
- `packages/shared/src/utils/pools/TilePool.ts` (pool pattern)
- `packages/asset-forge/server/db/schema/world-projects.schema.ts:24-70` (Drizzle schema)
- `packages/asset-forge/server/routes/world-projects.ts` (CRUD + validation integration)
- `packages/asset-forge/server/models/world-studio.models.ts:10-172` (TypeBox models)
- `packages/asset-forge/server/utils/scriptGraphValidator.ts` (validation)
- `packages/asset-forge/src/scripting/nodeLibrary.ts` (node definitions)
- `packages/asset-forge/src/scripting/types.ts` (ScriptGraph types)
- `packages/asset-forge/src/scripting/__tests__/` (test helpers)
- `packages/asset-forge/tests/e2e/world-builder.spec.ts` (Playwright patterns)

**Files that will be created**:
- `packages/asset-forge/server/db/schema/scripts.schema.ts` (Phase 4)
- `packages/asset-forge/server/routes/scripts.ts` (Phase 4)
- `packages/asset-forge/server/models/scripts.models.ts` (Phase 4)
- `packages/shared/src/systems/shared/scripting/NodeTypeAllowlist.ts` (Phase 5)
- `packages/shared/src/utils/pools/ExecutionContextPool.ts` (Phase 6)
- `packages/shared/src/systems/shared/scripting/CompiledGraph.ts` (Phase 6)
- `packages/asset-forge/tests/integration/scripting.spec.ts` (Phase 8)
- `packages/asset-forge/tests/e2e/script-editor.spec.ts` (Phase 8)
- `packages/shared/src/systems/shared/scripting/__tests__/ScriptGraphInterpreter.benchmark.ts` (Phase 8)
- `packages/asset-forge/src/scripting/__tests__/editorRuntimeDrift.test.ts` (Phase 1)

**Files that will be modified**:
- `packages/shared/src/systems/shared/scripting/TriggerEvaluator.ts` (Phase 1 — add 2 mappings)
- `packages/asset-forge/src/scripting/nodeLibrary.ts` (Phase 1 — add 44 nodes; Phase 2+3 — more)
- `packages/shared/src/systems/shared/scripting/ActionExecutor.ts` (Phase 2 — spatial + ECS accessors)
- `packages/shared/src/systems/shared/scripting/ScriptGraphInterpreter.ts` (Phase 2 — sub-graphs; Phase 5 — limits; Phase 6 — pooling + compilation)
- `packages/asset-forge/src/scripting/templates.ts` (Phase 7 — 8 new templates)
- `packages/asset-forge/server/routes/world-projects.ts` (Phase 4 — optional graph-by-id resolution)
- `packages/asset-forge/server/api-elysia.ts` (Phase 4 — mount scripts routes)
- `packages/asset-forge/server/db/schema/index.ts` (Phase 4 — export scripts schema)
