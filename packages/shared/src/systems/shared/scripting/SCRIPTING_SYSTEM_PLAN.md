# Node Graph Scripting System — Implementation Plan

**Goal:** 9.5/10 across all super-audit metrics (Architecture, UE5 Parity, Coverage, Testing, Type Safety, Security, Performance, Pre-built Scripts)

**Current State:** 3.2/10 — Editor UI complete, runtime is dead code, zero integration

---

## Phase 0: Documentation Discovery (COMPLETE)

### Verified Integration Points

| Concept | File | Method | Pattern |
|---------|------|--------|---------|
| System registration | `shared/src/core/World.ts:1044` | `world.register(key, Class)` | Instantiate + addSystem |
| RPG system hub | `shared/src/systems/shared/infrastructure/SystemLoader.ts:197` | `registerSystems(world)` | Central registration |
| Event subscribe | `shared/src/core/SystemBase.ts:197` | `this.subscribe(EventType, handler)` | Typed + auto-cleanup |
| Event emit | `shared/src/core/World.ts:2549` | `world.emit(EventType, data)` | EventEmitter3 |
| Entity spawn data | `MobNPCSpawnerSystem.ts:451` | `getNPCById(id)` → spawn | Manifest → config |
| DB schema | `asset-forge/server/db/schema/game-modules.schema.ts` | `pgTable(...)` | Drizzle ORM |
| API routes | `asset-forge/server/routes/modules.ts` | `new Elysia({ prefix })` | Plugin factory |
| Script save | `WorldStudioLayout.tsx:293` | `handleCloseScriptEditor()` | SET_MANIFEST_OVERRIDE / ENTITY_UPDATE |
| Auto-save | `hooks/useAutoSave.ts` | 30s debounce → PUT | worldData + manifestSnapshot JSONB |
| Test world | `shared/src/core/__tests__/World.tick.test.ts` | `new World()` | Real instance |
| Test setup | `shared/vitest.setup.ts` | `dataManager.initialize()` | Manifests pre-loaded |

### Anti-Patterns to Avoid

- **DO NOT** emit `scripting:subscribe` — use `this.subscribe(EventType, handler)` from SystemBase
- **DO NOT** create separate listener systems for each `scripting:*` event — handle them all in ScriptingSystem or a single ScriptingBridge
- **DO NOT** mock the World in integration tests — use real instances per CLAUDE.md
- **DO NOT** use `any` types — ESLint enforced
- **DO NOT** create new files unless necessary — prefer extending existing files

---

## Phase 1: Runtime Integration — Wire Up the Dead Code

**Target:** Architecture 2→8, Integration from zero to functional
**Estimated scope:** ~400 lines across 3-4 files

### 1A. Register ScriptingSystem in SystemLoader

**File:** `packages/shared/src/systems/shared/infrastructure/SystemLoader.ts`

**Task:** Add ScriptingSystem to `registerSystems()` alongside other shared systems.

```typescript
// In registerSystems(world), after other system registrations:
import { ScriptingSystem } from "../scripting/ScriptingSystem";
world.register("scripting", ScriptingSystem);
```

**Verification:**
- `grep -r "scripting" packages/shared/src/systems/shared/infrastructure/SystemLoader.ts` shows registration
- ScriptingSystem.init() is called automatically by World after registration

### 1B. Rewrite ScriptingSystem.init() to Use SystemBase.subscribe()

**File:** `packages/shared/src/systems/shared/scripting/ScriptingSystem.ts`

**Task:** ScriptingSystem currently extends nothing and emits `scripting:subscribe` (which nobody handles). Refactor to extend `SystemBase` and use the standard `this.subscribe()` pattern.

**Changes:**
1. Make ScriptingSystem extend SystemBase (matching CombatSystem, QuestSystem, etc.)
2. In `init()`, subscribe to real EventType events from TriggerEvaluator mappings
3. Remove the broken `scripting:subscribe` emission
4. Use `this.world` (from SystemBase) instead of constructor-injected world

**Key pattern to follow** (from MobNPCSpawnerSystem.ts:75):
```typescript
async init(): Promise<void> {
  // Subscribe to game events that trigger scripts
  for (const [eventType, triggerType] of this.triggerEvaluator.getMappings()) {
    this.subscribe(eventType, (data) => {
      this.handleTrigger(triggerType, data);
    });
  }
}
```

### 1C. Create ScriptingBridge — Handle `scripting:*` Action Events

**File:** `packages/shared/src/systems/shared/scripting/ScriptingBridge.ts` (NEW)

**Task:** Create a single system that listens for all 33 `scripting:*` events emitted by ActionExecutor and translates them into real game system calls.

This is the missing link — ActionExecutor emits `scripting:spawnMob`, `scripting:giveItem`, etc., but no system listens. ScriptingBridge subscribes to all of them and delegates to real systems.

**Pattern for each action type:**
```typescript
// scripting:spawnMob → emit ITEM_SPAWN_REQUEST or call MobNPCSpawnerSystem
this.subscribe("scripting:spawnMob", (data) => {
  this.world.emit(EventType.MOB_NPC_SPAWN_REQUEST, {
    mobType: data.mobType,
    position: data.position,
    count: data.count,
  });
});

// scripting:giveItem → emit to InventorySystem
this.subscribe("scripting:giveItem", (data) => {
  this.world.emit(EventType.INVENTORY_ADD, {
    playerId: data.playerId,
    itemId: data.itemId,
    quantity: data.quantity,
  });
});
```

**Must map all 33 action events:**
| scripting:* event | → Real EventType | Target System |
|---|---|---|
| scripting:spawnMob | MOB_NPC_SPAWN_REQUEST | MobNPCSpawnerSystem |
| scripting:despawnEntity | MOB_NPC_DESPAWN | MobNPCSystem |
| scripting:teleportPlayer | PLAYER_TELEPORT_REQUEST | TeleportSystem |
| scripting:showDialogue | DIALOGUE_START | DialogueSystem |
| scripting:startQuest | QUEST_START_CONFIRM | QuestSystem |
| scripting:giveItem | INVENTORY_ADD | InventorySystem |
| scripting:removeItem | INVENTORY_REMOVE | InventorySystem |
| scripting:giveXP | SKILLS_XP_GAINED | SkillsSystem |
| scripting:giveCoins | INVENTORY_ADD_COINS | CoinPouchSystem |
| scripting:startCombat | COMBAT_ATTACK | CombatSystem |
| scripting:stopCombat | COMBAT_STOP_ATTACK | CombatSystem |
| scripting:dealDamage | COMBAT_DAMAGE_DEALT | CombatSystem |
| scripting:healEntity | ENTITY_HEALED | PlayerSystem |
| scripting:equipItem | EQUIPMENT_FORCE_EQUIP | EquipmentSystem |
| scripting:spawnItem | ITEM_SPAWN_REQUEST | ItemSpawnerSystem |
| scripting:openShop | STORE_OPEN | StoreSystem |
| scripting:openBank | BANK_OPEN | BankingSystem |
| scripting:showNotification | UI_TOAST | (client-side) |
| scripting:playSound | (audio event) | MusicSystem |
| scripting:playMusic | (audio event) | MusicSystem |
| scripting:stopMusic | (audio event) | MusicSystem |
| scripting:spawnParticle | (particle event) | ParticleSystem |
| scripting:startDialogueTree | DIALOGUE_START | DialogueSystem |
| scripting:progressQuest | QUEST_PROGRESSED | QuestSystem |
| scripting:completeQuest | QUEST_COMPLETED | QuestSystem |
| scripting:activatePrayer | PRAYER_TOGGLE (active:true) | PrayerSystem |
| scripting:deactivatePrayer | PRAYER_TOGGLE (active:false) | PrayerSystem |
| scripting:spawnNPC | NPC_SPAWN_REQUEST | NPCSystem |
| scripting:moveEntity | MOVEMENT_STARTED | MovementSystem |
| scripting:setEntityProperty | (direct entity mutation) | EntityManager |
| scripting:sendChat | (chat event) | ChatSystem |
| scripting:setVariable | (interpreter-local) | — |
| scripting:incrementVariable | (interpreter-local) | — |

### 1D. Auto-Load Behavior Graphs on Entity Spawn

**File:** `packages/shared/src/systems/shared/scripting/ScriptingSystem.ts`

**Task:** Subscribe to entity spawn events and automatically load `behaviorGraph` from entity properties into the interpreter.

```typescript
this.subscribe(EventType.ENTITY_SPAWNED, (data) => {
  const entity = this.world.getEntityById(data.entityId);
  if (entity?.properties?.behaviorGraph) {
    this.addGraph(data.entityId, entity.properties.behaviorGraph);
  }
});

// Clean up on entity destroy
this.subscribe(EventType.ENTITY_DESTROYED, (data) => {
  this.removeAllGraphs(data.entityId);
});
```

### 1E. Add ScriptingSystem tick() to World Update Loop

**Task:** Ensure `ScriptingSystem.tick()` is called each frame to process delayed continuations (flow/delay nodes).

**Verification checklist:**
- [ ] ScriptingSystem appears in SystemLoader registration
- [ ] `init()` subscribes to all 32 trigger event types
- [ ] ScriptingBridge handles all 33 action event types
- [ ] Entity spawn auto-loads behaviorGraph
- [ ] Entity destroy cleans up graphs
- [ ] `tick()` processes delayed continuations
- [ ] No `scripting:subscribe` emission remains

---

## Phase 2: Persistence Pipeline

**Target:** Architecture 8→9.5, ensure scripts survive save/load
**Estimated scope:** ~200 lines across 2-3 files

### 2A. Verify Existing Persistence (No New DB Table Needed)

Script graphs are already persisted via the WorldStudio auto-save pipeline:
1. BehaviorScriptSection → SET_MANIFEST_OVERRIDE / ENTITY_UPDATE dispatch
2. State updates `manifestOverrides[overrideType][entityId].behaviorGraph` or `extendedLayers[stateKey][id].behaviorGraph`
3. Auto-save (30s debounce) serializes to `worldData` / `manifestSnapshot` JSONB
4. PUT `/api/world/projects/:projectId` saves to PostgreSQL

**Task:** Verify this pipeline works end-to-end by:
1. Creating a script graph in the editor
2. Closing the editor
3. Reloading the project
4. Confirming the graph is restored

### 2B. Add Server-Side Graph Validation on Save

**File:** `packages/asset-forge/server/routes/world-projects.ts`

**Task:** Before saving `worldData` or `manifestSnapshot`, validate any embedded `behaviorGraph` objects:
- All node types exist in a server-side allowlist
- All edges reference valid node IDs
- No cycles in flow edges
- Required fields are populated

Port the existing `validation.ts` logic to a server-side validator (or share it via the `shared` package).

### 2C. Runtime Graph Loading from World Data

**File:** `packages/shared/src/systems/shared/scripting/ScriptingSystem.ts`

**Task:** When a world loads from a saved project, entities already have `behaviorGraph` in their properties. The auto-load from Phase 1D handles this — when entities spawn during world load, their graphs are automatically picked up.

Verify that `serializeManifestOverrides()` → `deserializeManifestOverrides()` correctly round-trips `ScriptGraph` objects (deep JSON with nested nodes/edges/variables).

**Verification checklist:**
- [ ] Create graph in editor → close → reopen → graph is there
- [ ] Save project → reload page → load project → graphs restored
- [ ] Server rejects invalid graph structures on save
- [ ] Manifest overrides correctly include behaviorGraph in round-trip

---

## Phase 3: Type Safety & Security Hardening

**Target:** Type Safety 6→9.5, Security 4→9.5
**Estimated scope:** ~500 lines

### 3A. Typed Node Data Schemas

**File:** `packages/shared/src/systems/shared/scripting/NodeDataSchemas.ts` (NEW)

**Task:** Define per-node-type data interfaces instead of `Record<string, unknown>`:

```typescript
export interface SpawnMobData {
  mobType: string;
  count: number;
  level?: number;
  position?: { x: number; y: number; z: number };
}

export interface GiveItemData {
  playerId?: string;
  itemId: string;
  quantity: number;
}

export interface HealthCheckData {
  threshold: number;
  comparison: "above" | "below" | "equal";
  entityId?: string;
}

// Union type for all action data
export type ActionNodeData =
  | { type: "action/spawnMob"; data: SpawnMobData }
  | { type: "action/giveItem"; data: GiveItemData }
  | // ... all 33 action types

// Runtime validation
export function validateNodeData(nodeType: string, data: Record<string, unknown>): ValidationResult
```

### 3B. Runtime Schema Validation on Graph Load

**File:** `packages/shared/src/systems/shared/scripting/ScriptingSystem.ts`

**Task:** When `addGraph()` is called, validate every node's data against its schema before registering:

```typescript
addGraph(entityId: string, graph: RuntimeScriptGraph): void {
  // Validate all nodes before accepting
  for (const node of graph.nodes) {
    const result = validateNodeData(node.type, node.data);
    if (!result.valid) {
      console.warn(`[Scripting] Invalid node ${node.id} (${node.type}): ${result.errors.join(", ")}`);
      return; // Reject entire graph
    }
  }
  // ... existing addGraph logic
}
```

### 3C. Node Type Allowlist

**File:** `packages/shared/src/systems/shared/scripting/ScriptingSystem.ts`

**Task:** Maintain an explicit allowlist of valid node types. Reject graphs containing unknown types.

```typescript
private static readonly ALLOWED_NODE_TYPES = new Set([
  // Triggers
  "trigger/onPlayerEnterZone", "trigger/onPlayerLeaveZone", /* ... all 32 */
  // Conditions
  "condition/hasItem", "condition/questState", /* ... all 17 */
  // Actions
  "action/spawnMob", "action/giveItem", /* ... all 33 */
  // Flow
  "flow/branch", "flow/sequence", "flow/delay", "flow/gate",
  "flow/doN", "flow/flipFlop", "flow/multiGate", "flow/forEach",
]);
```

### 3D. Rate Limiting & Abuse Prevention

**File:** `packages/shared/src/systems/shared/scripting/ScriptingSystem.ts`

**Task:**
1. **Per-entity execution budget:** Max N node executions per second per entity (e.g., 200/sec)
2. **onTimer minimum interval:** Enforce minimum 1 second for timer triggers
3. **SpawnMob count cap:** Max 10 mobs per action, max 50 per entity per minute
4. **Recursive trigger prevention:** If an action's resulting event would re-trigger the same graph, skip
5. **Delay chain limit:** Max 20 pending delays per graph instance

### 3E. Entity Ownership Validation

**File:** `packages/shared/src/systems/shared/scripting/ScriptingBridge.ts`

**Task:** For actions that target a specific player (giveItem, teleportPlayer, dealDamage), validate that the target entity actually exists and the source entity has authority to act on it.

```typescript
// In scripting:giveItem handler:
const targetId = data.playerId ?? data.entityId;
const target = this.world.getEntityById(targetId);
if (!target) {
  console.warn(`[ScriptingBridge] Target entity ${targetId} not found`);
  return;
}
```

**Verification checklist:**
- [ ] All 33 action data types have typed interfaces
- [ ] validateNodeData() catches invalid/missing fields
- [ ] Unknown node types rejected at graph load
- [ ] Rate limiting prevents script spam
- [ ] Entity ownership checked before state mutations
- [ ] No `as string` / `as number` casts remain in ActionExecutor (use validated schemas)

---

## Phase 4: Game Coverage Expansion

**Target:** Coverage 4→9.5
**Estimated scope:** ~800 lines across 3 files

### 4A. Add Missing High-Value Triggers (20 new)

**File:** `packages/shared/src/systems/shared/scripting/TriggerEvaluator.ts`

New trigger mappings:
| Trigger | EventType | Use Case |
|---------|-----------|----------|
| trigger/onMovementCompleted | MOVEMENT_COMPLETED | Patrol scripts, escort quests |
| trigger/onMovementStarted | MOVEMENT_STARTED | Intercept movement |
| trigger/onPlayerHealthChanged | PLAYER_HEALTH_UPDATED | Health-reactive scripts |
| trigger/onEntityDamaged | ENTITY_DAMAGED | Damage reaction scripts |
| trigger/onTeleportCompleted | PLAYER_TELEPORTED | Post-teleport triggers |
| trigger/onDialogueResponse | DIALOGUE_RESPONSE | React to player choices |
| trigger/onCookingComplete | COOKING_COMPLETE | Skill event scripts |
| trigger/onSmithingComplete | SMITHING_COMPLETE | Skill event scripts |
| trigger/onSmeltingComplete | SMELTING_COMPLETE | Skill event scripts |
| trigger/onFletchingComplete | FLETCHING_COMPLETE | Skill event scripts |
| trigger/onFiremakingSuccess | FIREMAKING_SUCCESS | Skill event scripts |
| trigger/onPlayerJoined | PLAYER_JOINED | Welcome scripts |
| trigger/onPlayerLeft | PLAYER_LEFT | Cleanup scripts |
| trigger/onAggroTriggered | AGGRO_MOB_NPC_AGGROED | Aggro reaction scripts |
| trigger/onItemPickup | ITEM_PICKUP_REQUEST | Pickup reaction scripts |
| trigger/onCorpseLoot | CORPSE_LOOT_REQUEST | Loot reaction scripts |
| trigger/onBankDeposit | BANK_DEPOSIT_SUCCESS | Banking scripts |
| trigger/onBankWithdraw | BANK_WITHDRAW_SUCCESS | Banking scripts |
| trigger/onRunToggle | MOVEMENT_TOGGLE_RUN | Movement state scripts |
| trigger/onStaminaDepleted | MOVEMENT_STAMINA_DEPLETED | Exhaustion scripts |

Also add to nodeLibrary.ts with proper port definitions.

### 4B. Add Missing High-Value Actions (15 new)

**File:** `packages/shared/src/systems/shared/scripting/ActionExecutor.ts`

New action handlers:
| Action | What It Does | EventType |
|--------|-------------|-----------|
| action/getEntityProperty | Read entity property into variable | (interpreter-local) |
| action/getEntitiesInRadius | Find entities within radius | (interpreter-local query) |
| action/playAnimation | Play entity animation | COMBAT_PLAY_ANIMATION |
| action/setMovementSpeed | Change entity speed | MOVEMENT_SPEED_CHANGED |
| action/applyBuff | Add timed stat modifier | (new: scripting:applyBuff) |
| action/removeBuff | Remove timed stat modifier | (new: scripting:removeBuff) |
| action/setAggroRange | Configure mob aggro distance | (entity property set) |
| action/setRespawnTime | Configure respawn timer | (entity property set) |
| action/dropItem | Drop item to ground | ITEM_DROPPED |
| action/despawnAllInRadius | Clear entities in area | (batch despawn) |
| action/lockMovement | Prevent entity movement | (movement lock) |
| action/unlockMovement | Allow entity movement | (movement unlock) |
| action/setDialogueOverride | Change NPC dialogue | (entity property set) |
| action/log | Debug console.log | (dev-only, no event) |
| action/emitCustomEvent | Fire user-defined event | (custom event name) |

Also add to nodeLibrary.ts with proper port definitions.

### 4C. Add Missing Conditions (8 new)

**File:** `packages/shared/src/systems/shared/scripting/ConditionEvaluator.ts`

| Condition | What It Checks |
|-----------|---------------|
| condition/entityExists | Entity ID exists in world |
| condition/isPlayerInRange | Distance between two entities |
| condition/hasQuestCompleted | Quest completion state |
| condition/timeOfDay | Game time within range |
| condition/entityCount | Count entities of type in radius |
| condition/isMobAlive | Specific mob instance alive |
| condition/hasActiveBuff | Entity has buff applied |
| condition/variableExists | Graph variable is defined |

### 4D. Add Math & Utility Nodes (12 new)

**File:** `packages/shared/src/systems/shared/scripting/ScriptGraphInterpreter.ts`

Add a new node category `"math"` (pure functions, no events):
| Node | Inputs | Output |
|------|--------|--------|
| math/add | a, b | result |
| math/subtract | a, b | result |
| math/multiply | a, b | result |
| math/divide | a, b (safe: returns 0 if b=0) | result |
| math/clamp | value, min, max | result |
| math/lerp | a, b, t | result |
| math/randomRange | min, max | result |
| math/abs | value | result |
| math/floor | value | result |
| math/ceil | value | result |
| math/distance3D | x1,y1,z1, x2,y2,z2 | result |
| math/toString | value | string |

These are pure functions — no EventBus interaction, no side effects.

**Verification checklist:**
- [ ] 52 total triggers (32 existing + 20 new)
- [ ] 48 total actions (33 existing + 15 new)
- [ ] 25 total conditions (17 existing + 8 new)
- [ ] 12 math nodes operational
- [ ] All new nodes have nodeLibrary.ts entries with ports, fields, icons
- [ ] All new triggers map to real EventType values
- [ ] All new actions have ScriptingBridge handlers

---

## Phase 5: UE5 Blueprint Parity

**Target:** UE5 Parity 3→9.5
**Estimated scope:** ~1200 lines

### 5A. ECS Component Read/Write Nodes

**File:** New category in ActionExecutor + ConditionEvaluator

This is the backbone of UE5 Blueprints — `Get` and `Set` nodes for every component type.

**Getter nodes** (condition category — return values into graph variables):
| Node | Reads | Output Variable |
|------|-------|----------------|
| condition/getHealth | entity.health.current, entity.health.max | healthCurrent, healthMax |
| condition/getPosition | entity.position | x, y, z |
| condition/getLevel | entity.skills[skillId].level | level |
| condition/getInventoryCount | entity.inventory.items.filter(itemId).length | count |
| condition/getEquipment | entity.equipment[slot] | itemId |
| condition/getCombatStyle | entity.attackStyle | style |
| condition/getPrayerPoints | entity.prayerPoints | points |
| condition/getCoins | entity.coins | amount |
| condition/getEntityName | entity.name | name |
| condition/getEntityType | entity.type | type |

**Setter nodes** (action category — modify entity state):
| Node | Modifies | Via |
|------|----------|-----|
| action/setHealth | entity.health.current | ENTITY_HEALED / COMBAT_DAMAGE_DEALT |
| action/setPosition | entity.position | PLAYER_TELEPORT_REQUEST |
| action/setLevel | entity.skills[skillId].level | SKILLS_XP_GAINED |
| action/setName | entity.name | ENTITY_PROPERTY_SET |
| action/setVisible | entity.visible | ENTITY_PROPERTY_SET |

### 5B. Data Flow Between Nodes (Output→Input Connections)

**File:** `packages/shared/src/systems/shared/scripting/ScriptGraphInterpreter.ts`

**Current limitation:** Nodes can only pass data via graph variables (setVariable/getVariable). UE5 Blueprints pass data directly through data connections (output port → input port).

**Task:** Implement data flow edges:
1. When executing an action/condition node, resolve all data input ports by reading connected output values
2. Use `readDataInput()` method (already exists but unused) in node execution
3. Condition getter nodes store their output values for downstream nodes to read

```typescript
// Before executing a node, resolve its data inputs
private resolveDataInputs(node: RuntimeScriptNode, ctx: ExecutionContext): Record<string, unknown> {
  const resolved = { ...node.data };
  for (const input of node.inputs) {
    if (input.type === "data") {
      const value = this.readDataInput(node.id, input.id, ctx);
      if (value !== null) resolved[input.id] = value;
    }
  }
  return resolved;
}
```

### 5C. Sub-Graph / Function Graph Support

**File:** `packages/shared/src/systems/shared/scripting/ScriptGraphInterpreter.ts`

**Task:** Allow a node type `flow/subGraph` that references another ScriptGraph by ID and executes it inline.

```typescript
case "subGraph": {
  const subGraphId = node.data.graphId as string;
  const subGraph = this.subGraphRegistry.get(subGraphId);
  if (subGraph) {
    const subInterpreter = new ScriptGraphInterpreter(subGraph);
    // Copy action/condition registrations
    // Execute sub-graph with current context
    await subInterpreter.execute(subGraph.nodes[0].id, ctx);
  }
  return { next: this.getFlowSuccessors(node.id) };
}
```

Also add editor support: a "Function" graph type that appears in the node palette and can be dragged in like any other node.

### 5D. Custom Events (Cross-Graph Communication)

**Task:** Allow scripts to define and fire custom event names:

1. `action/emitCustomEvent` — emits a user-defined event name with data
2. `trigger/onCustomEvent` — triggers when a specific custom event fires
3. Custom events are namespaced per entity to prevent cross-entity interference

### 5E. Debug Tools (Editor-Side)

**File:** `packages/asset-forge/src/scripting/` (editor components)

1. **Execution visualization:** When a graph is running, highlight active nodes with a glow effect and animate flow edges
2. **Variable watch panel:** Show current values of all graph variables in real-time
3. **Breakpoints:** Click a node to add a breakpoint marker; when hit during execution, pause and show state
4. **Execution log:** Scrollable log showing "Node X fired → Condition Y = true → Action Z executed"

Implementation: ScriptingSystem emits debug events (`scripting:debug:nodeExecuted`, `scripting:debug:variableChanged`) that the editor listens to via WebSocket.

### 5F. Timeline Nodes

**Task:** Add `flow/timeline` node that interpolates a value over time:

```typescript
// Node data:
{
  duration: 2000,  // ms
  curve: "linear" | "easeIn" | "easeOut" | "easeInOut",
  startValue: 0,
  endValue: 100,
  outputVariable: "progress"
}
```

On each tick during the timeline's duration, update the variable and execute the "update" output port. When complete, execute the "finished" output port.

**Verification checklist:**
- [ ] Component getter nodes read real entity state
- [ ] Component setter nodes modify entity state via proper events
- [ ] Data flows directly through connections (not just variables)
- [ ] Sub-graphs execute inline with shared context
- [ ] Custom events enable cross-graph communication
- [ ] Debug visualization shows execution flow in editor
- [ ] Variable watch panel shows live values
- [ ] Timeline nodes interpolate values over time

---

## Phase 6: Pre-Built Game Scripts

**Target:** Pre-built Scripts 2→9.5
**Estimated scope:** ~600 lines in templates.ts

### 6A. Convert Existing Game Behaviors to Editable Graphs

Create 12-15 new templates representing real Hyperscape gameplay patterns:

| Template | Game Behavior | Nodes Used |
|----------|--------------|------------|
| **NPC Dialogue Tree** | Banker interaction (open bank) | onNPCInteraction → showDialogue → openBank |
| **Quest Kill Tracker** | Track goblin kills for quest | onMobKilled → condition(mobType) → incrementVar → condition(count>=target) → progressQuest |
| **Quest Gather Tracker** | Track ore gathered | onResourceGathered → condition(resourceType) → incrementVar → condition(count>=target) → progressQuest |
| **Mob Respawn Cycle** | Mob dies, respawns after timer | onMobKilled → delay(30s) → spawnMob(same type, same position) |
| **Aggro Leash** | Mob returns to spawn if too far | onTimer(5s) → getPosition → distance3D(spawn, current) → condition(dist>leashRange) → stopCombat → moveEntity(spawn) |
| **Level Gate** | Block area until skill level | onPlayerEnterZone → condition(skillLevel < 30) → teleportPlayer(outside) → showNotification("Need level 30") |
| **Loot Chest (one per player)** | Per-player loot (variable scoped per player trigger) | onNPCInteraction → condition(var:opened==0) → setVar(opened,1) → giveItem → spawnParticle |
| **Dynamic Shop Keeper** | NPC opens store with dialogue | onNPCInteraction → showDialogue → openShop |
| **Fishing Spot** | Resource → gather → xp → respawn cycle | onResourceDepleted → delay(60s) → spawnResource |
| **Prayer Altar** | Restore prayer points on interaction | onNPCInteraction → condition(prayerPoints < max) → healPrayer → showDialogue("Restored") |
| **PvP Warning Zone** | Wilderness boundary crossing | onPlayerEnterZone → showNotification("Warning: PvP!") → playSound(warning) |
| **Boss Spawn Schedule** | Timer-based boss with announcement | onTimer(300s) → showNotification("The boss awakens!") → delay(5s) → spawnMob(boss) |
| **Escort NPC** | NPC follows player along path | onNPCInteraction → moveEntity(waypoint1) → delay → moveEntity(waypoint2) → ... → completeQuest |
| **Crafting Tutorial** | Guide player through first craft | onCraftingComplete → condition(var:tutorialStep==1) → showDialogue("Well done!") → giveXP → setVar(tutorialStep, 2) |

### 6B. Template Documentation

Each template should include:
- A description of what game behavior it models
- Which nodes are user-customizable (highlighted in editor)
- Expected entity type (NPC, MobSpawn, Region, etc.)

**Verification checklist:**
- [ ] 24+ total templates (12 existing + 12-15 new)
- [ ] All new templates use only implemented node types
- [ ] Templates cover: combat, quests, NPCs, resources, economy, zones, progression
- [ ] Each template works end-to-end when attached to appropriate entity type
- [ ] Templates use correct port names and field names

---

## Phase 7: Comprehensive Testing

**Target:** Testing 1→9.5
**Estimated scope:** ~2000 lines of tests

### 7A. Unit Tests — Interpreter Logic

**File:** `packages/shared/src/systems/shared/scripting/__tests__/ScriptGraphInterpreter.test.ts` (NEW)

Test cases:
- Linear graph execution (trigger → action → action)
- Condition branching (true path, false path)
- Flow/branch with variable lookup
- Flow/sequence fires all outputs
- Flow/delay returns continuation
- Flow/doN limits execution count
- Flow/flipFlop alternates outputs
- Flow/gate open/close behavior
- Flow/multiGate round-robin
- MAX_NODES_PER_TICK limit respected
- Invalid node type logged and skipped
- Empty graph returns no continuations
- Data flow through connections (readDataInput)
- Graph variable initialization from defaults

### 7B. Unit Tests — Action Handlers

**File:** `packages/shared/src/systems/shared/scripting/__tests__/ActionExecutor.test.ts` (NEW)

For each of the 33+ action handlers, verify:
- Correct event type emitted
- Correct data payload shape
- Fallback defaults applied when fields missing
- ctx.entityId used as sourceEntityId
- ctx.triggerData used for positional inheritance

### 7C. Unit Tests — Condition Evaluators

**File:** `packages/shared/src/systems/shared/scripting/__tests__/ConditionEvaluator.test.ts` (NEW)

For each of the 25+ condition evaluators, verify:
- Returns true when condition met
- Returns false when condition not met
- Edge cases (missing entity, missing inventory, null values)
- Comparison operators (>, <, ==, >=, <=, !=)

### 7D. Unit Tests — Trigger Evaluator

**File:** `packages/shared/src/systems/shared/scripting/__tests__/TriggerEvaluator.test.ts` (NEW)

Verify:
- All 52+ trigger mappings have valid EventType references
- Trigger data extraction matches event payload shape
- Filter conditions work (mobType filter, zoneId filter)

### 7E. Integration Tests — Template End-to-End

**File:** `packages/shared/src/systems/shared/scripting/__tests__/templates.integration.test.ts` (NEW)

For each template:
1. Create graph from factory
2. Validate graph structure
3. Add to ScriptingSystem
4. Emit trigger event
5. Verify action events were emitted

### 7F. Integration Tests — ScriptingBridge

**File:** `packages/shared/src/systems/shared/scripting/__tests__/ScriptingBridge.test.ts` (NEW)

Verify each `scripting:*` → EventType mapping:
1. Emit `scripting:spawnMob` → verify MOB_NPC_SPAWN_REQUEST emitted
2. Emit `scripting:giveItem` → verify INVENTORY_ADD emitted
3. etc. for all 33 mappings

### 7G. Unit Tests — Validation

**File:** `packages/asset-forge/src/scripting/__tests__/validation.test.ts` (NEW)

Test cases:
- Orphan node detection
- Type mismatch detection (flow→data, data→flow)
- Cycle detection
- Missing required field detection
- Trigger without outgoing flow
- Valid graph passes validation

### 7H. Unit Tests — Node Data Schema Validation

**File:** `packages/shared/src/systems/shared/scripting/__tests__/NodeDataSchemas.test.ts` (NEW)

Test each node type's schema:
- Valid data passes
- Missing required fields fail
- Wrong types fail
- Unknown fields ignored

**Verification checklist:**
- [ ] 100+ unit tests for interpreter logic
- [ ] 33+ tests for action handlers
- [ ] 25+ tests for condition evaluators
- [ ] 52+ tests for trigger mappings
- [ ] 24+ template integration tests
- [ ] 33+ ScriptingBridge mapping tests
- [ ] 20+ validation tests
- [ ] All tests use real instances (no mocks for integration tests)
- [ ] `npx vitest run packages/shared/src/systems/shared/scripting/ --reporter=verbose` passes

---

## Phase 8: Performance Optimization

**Target:** Performance 5→9.5
**Estimated scope:** ~300 lines

### 8A. Pre-Allocate Hot Path Arrays

**File:** `packages/shared/src/systems/shared/scripting/ScriptGraphInterpreter.ts`

Replace `new Set()` and array allocations in `getFlowSuccessors` / `getMatchingPortSuccessors` with pre-allocated reusable objects:

```typescript
// Pre-allocated
private readonly _successorBuffer: string[] = [];
private readonly _portMatchSet: Set<string> = new Set();

private getMatchingPortSuccessors(nodeId: string, portIds: string[]): string[] {
  this._portMatchSet.clear();
  for (const id of portIds) this._portMatchSet.add(id);

  this._successorBuffer.length = 0;
  const edges = this.outgoingEdges.get(nodeId);
  if (edges) {
    for (const e of edges) {
      if (this._portMatchSet.has(e.sourcePortId)) {
        this._successorBuffer.push(e.targetNodeId);
      }
    }
  }
  return this._successorBuffer;
}
```

### 8B. Graph Compilation (Optional, High Impact)

**File:** `packages/shared/src/systems/shared/scripting/CompiledGraph.ts` (NEW)

Compile the node graph into a flat instruction list at load time:

```typescript
interface Instruction {
  type: "action" | "condition" | "flow";
  nodeId: string;
  handler: ActionHandler | ConditionEvaluator;
  trueJump: number;   // instruction index
  falseJump: number;  // instruction index
  nextJump: number;   // instruction index
  delayMs?: number;
}
```

Benefits:
- No string splitting (`node.type.split("/")`) per execution
- No Map lookups for handlers per execution
- Linear instruction scanning instead of graph traversal
- Better CPU cache locality

### 8C. Execution Context Pooling

**File:** `packages/shared/src/systems/shared/scripting/ScriptingSystem.ts`

Pool `ExecutionContext` objects instead of creating new ones per trigger:

```typescript
private readonly contextPool: ExecutionContext[] = [];

private acquireContext(entityId: string, triggerData: Record<string, unknown>): ExecutionContext {
  const ctx = this.contextPool.pop() ?? {
    triggerData: {},
    variables: new Map(),
    entityId: "",
    world: this.world,
  };
  ctx.entityId = entityId;
  ctx.triggerData = triggerData;
  ctx.variables.clear();
  return ctx;
}

private releaseContext(ctx: ExecutionContext): void {
  this.contextPool.push(ctx);
}
```

### 8D. FlowState Cleanup

**File:** `packages/shared/src/systems/shared/scripting/ScriptGraphInterpreter.ts`

Clear `flowState` when a graph is removed from an entity. Add a `reset()` method:

```typescript
reset(): void {
  this.flowState.clear();
}
```

Call this in `ScriptingSystem.removeGraph()`.

### 8E. Batch Event Processing

**File:** `packages/shared/src/systems/shared/scripting/ScriptingSystem.ts`

When a single game event triggers scripts on multiple entities, batch process them:

```typescript
private handleTrigger(triggerType: string, eventData: Record<string, unknown>): void {
  // Collect all matching graphs
  const batch: Array<{ instance: ActiveGraphInstance; triggerNodeId: string }> = [];

  for (const [entityId, instances] of this.instances) {
    for (const instance of instances) {
      const triggerNodes = instance.interpreter.getTriggerNodes()
        .filter(n => n.type === triggerType);
      for (const trigger of triggerNodes) {
        batch.push({ instance, triggerNodeId: trigger.id });
      }
    }
  }

  // Execute batch (sorted by priority if needed)
  for (const { instance, triggerNodeId } of batch) {
    const ctx = this.acquireContext(instance.entityId, eventData);
    // Copy graph variables into context
    for (const [key, val] of instance.variables) ctx.variables.set(key, val);
    instance.interpreter.execute(triggerNodeId, ctx);
    this.releaseContext(ctx);
  }
}
```

**Verification checklist:**
- [ ] Zero allocations in getFlowSuccessors / getMatchingPortSuccessors hot paths
- [ ] ExecutionContext objects pooled and reused
- [ ] FlowState cleaned up on graph removal
- [ ] Batch processing for multi-entity triggers
- [ ] Optional: compiled graph execution for high-frequency scripts

---

## Phase 9: Final Verification & Polish

### 9A. Full Audit Re-Run

Run the super-audit again against the completed system. Verify all categories hit 9.5+:

| Category | Before | Target | Verification |
|----------|--------|--------|-------------|
| Code Quality | 5 | 9.5 | Clean, documented, typed |
| Architecture & Integration | 2 | 9.5 | ScriptingSystem live, ScriptingBridge wired, entity auto-load |
| UE5 Blueprint Parity | 3 | 9.5 | Component R/W, data flow, sub-graphs, debug, timeline |
| Game Coverage | 4 | 9.5 | 52 triggers, 48 actions, 25 conditions, 12 math |
| Testing | 1 | 9.5 | 300+ tests, all passing |
| Type Safety | 6 | 9.5 | Per-node schemas, validated at load, no `as` casts |
| Security | 4 | 9.5 | Allowlist, rate limit, ownership, server validation |
| Performance | 5 | 9.5 | Pooling, pre-alloc, optional compilation |
| Pre-built Scripts | 2 | 9.5 | 24+ templates covering all gameplay patterns |

### 9B. Editor-Runtime Consistency Check

Verify that every node type in `nodeLibrary.ts` has:
1. A corresponding handler in ActionExecutor / ConditionEvaluator / TriggerEvaluator / interpreter
2. Correct port names that match runtime expectations
3. Field names that match runtime data access patterns
4. A ScriptingBridge handler for its `scripting:*` event

### 9C. Documentation

Add JSDoc comments to all public APIs:
- ScriptingSystem: addGraph, removeGraph, registerAction, registerCondition
- ScriptingBridge: all event handlers
- ScriptGraphInterpreter: execute, registerAction, registerCondition
- NodeDataSchemas: all type interfaces

---

## Phase 10: Play-In-Editor Script Execution

The current PIE (Play-In-Editor) mode in World Studio is a viewport-only walk-through:
the `PlayTestWorld` stub spawns entities as colored markers, runs a trivial mob patrol AI,
and lets the user fly around. **No scripts execute, no triggers fire, no actions run.**

This phase makes PIE behave like UE5's "Play in Editor": authored behavior graphs run
against the same entity instances the user just placed, fully inside the editor — no
deploy-to-staging round trip required.

### 10A. Minimal Event Bus + ScriptGraphInterpreter in PlayTestWorld

Files:
- `packages/shared/src/runtime/createPlayTestWorld.ts` — extend `PlayTestWorld`

Add to `PlayTestWorld`:
1. A typed event bus (`emit`, `on`, `off`) that satisfies the `ScriptingWorldInterface`
   contract used by `ScriptGraphInterpreter` and `ActionExecutor`.
2. A `ScriptGraphInterpreter` instance constructed at `start()` time.
3. A `loadGraph(entityId, graph)` helper that registers graphs and binds them to entity
   instances inside the PIE world.
4. A `tick()` extension that drives the interpreter's delayed-continuation queue.

This intentionally **does not** pull in the full `World` class (which would drag in
PhysX, network, DB, every system). PIE remains a focused sandbox where script logic
runs against PIE entities and a tiny event bus.

### 10B. Forward behaviorGraphs from World Studio Manifests

Files:
- `packages/asset-forge/src/components/WorldStudio/hooks/usePIESession.ts`

When building `PlayTestWorldOptions`, look up each entity's `behaviorGraph` from:
- `state.manifestOverrides.npcOverrides.get(entity.npcTypeId)?.behaviorGraph`
- `state.extendedLayers.npcs[entityId].behaviorGraph` (game NPCs)
- Future: mob/resource/station overrides as they gain script support

Pass the graphs through to `PlayTestWorld.start()` so the interpreter can register
them at spawn time.

### 10C. Trigger Pumps in PIE

Inside the PIE world, fire the canonical triggers:
- `trigger/onReady` on each entity right after its graph is loaded (UE5 BeginPlay).
- `trigger/onPlayerNearby` per-tick when the player enters the entity's proximity radius
  (configurable; default 5m). Debounced so it only fires on enter, not every tick.
- `trigger/onInteract` when the user clicks an entity marker in the viewport. Wired
  through the existing selection handler in `ViewportContainer`.
- `trigger/onMobDeath` for any mob whose HP reaches zero (PIE mobs start with a
  `health` field; an action `damageEntity` is added to the executor's PIE-aware path).

This gives a useful initial coverage; more triggers come for free as we add the
underlying state to PIE entities.

### 10D. PIE Console (Debug Log Panel)

Files:
- `packages/asset-forge/src/components/WorldStudio/panels/PIEConsole.tsx` (new)
- `WorldStudioLayout.tsx` — render the console only while PIE is active

Subscribe to the PIE world's `debug` channel and stream timestamped entries:
- `[trigger]` which trigger fired, on which entity, with what data
- `[action]` which action executed, with input data
- `[error]` interpreter or action errors with the failing node id
- `[flow]` per-edge traversals (toggleable; verbose)

Filter chips (errors / actions / triggers / flow) and a clear button. This closes the
single biggest UE5 parity gap for debugging — without needing breakpoints.

### 10E. PIE Tests

Files:
- `packages/asset-forge/src/scripting/__tests__/pie.test.ts` (new)

Cover at minimum:
- Build a graph with `trigger/onReady` → `flow/setVariable` → `action/log`. Start PIE
  with one NPC carrying the graph. Assert the variable was set and the log entry
  appeared on the debug channel.
- Build a graph with `trigger/onPlayerNearby` → `action/showDialogue`. Move the player
  toward the NPC and assert the dialogue event fired exactly once.
- Build a graph with `trigger/onInteract` → flow chain → `action/grantItem`. Simulate
  an interact event and assert the chain ran.

### 10F. Verification Checklist

- [ ] `PlayTestWorld` exposes `emit/on/off` and a `ScriptGraphInterpreter`
- [ ] Graphs from manifests are loaded into PIE on start
- [ ] `onReady` fires for every entity with a graph
- [ ] `onPlayerNearby` fires once per enter (no per-tick spam)
- [ ] Click an NPC in viewport → `onInteract` fires for that entity
- [ ] PIE Console shows triggers and actions in real time
- [ ] PIE Console persists across PIE start/stop within a single editor session
- [ ] All Phase 10 tests pass

### Out of Scope (deferred to later phases)
- Full ECS systems in PIE (combat damage rolls, real inventory) — Phase 11+
- Breakpoints / step-through debugging — Phase 11+
- PhysX collision in PIE — Phase 11+
- "Test in Live Game" button (deploy + open client) — Phase 11+

---

## Execution Order

| Phase | Depends On | Scope | Impact |
|-------|-----------|-------|--------|
| **Phase 1** | — | ~400 lines | Unlocks everything (dead code → live) |
| **Phase 2** | Phase 1 | ~200 lines | Persistence verified |
| **Phase 3** | Phase 1 | ~500 lines | Safety & correctness |
| **Phase 4** | Phase 1 | ~800 lines | Coverage breadth |
| **Phase 5** | Phase 1, 4 | ~1200 lines | UE5 parity (biggest phase) |
| **Phase 6** | Phase 4, 5 | ~600 lines | Usability & learning |
| **Phase 7** | Phase 1-6 | ~2000 lines | Confidence |
| **Phase 8** | Phase 1 | ~300 lines | Production readiness |
| **Phase 9** | All | Audit | Verification |
| **Phase 10** | Phase 1 | ~600 lines | UE5-style PIE — scripts run inside the editor |

**Phase 1 is the critical path.** Everything else builds on it. Start there.
