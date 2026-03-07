# Agent System Audit — Hyperscape MMORPG

**Date:** 2026-02-28
**Scope:** Complete agent gameplay flow — startup, decision-making, questing, skilling, combat, exploration, dueling, banking, ElizaOS integration
**Branch:** `fix/model-agent-stability-audit`

---

## Table of Contents

1. [Complete Flow Map](#1-complete-flow-map)
2. [Decision Architecture](#2-decision-architecture)
3. [Goal Planning & Natural Behavior](#3-goal-planning--natural-behavior)
4. [Action Reliability & Completeness](#4-action-reliability--completeness)
5. [Game State Data Quality](#5-game-state-data-quality)
6. [LLM Integration & Context Quality](#6-llm-integration--context-quality)
7. [Server-Side Data Completeness](#7-server-side-data-completeness)
8. [Connection & Network Resilience](#8-connection--network-resilience)
9. [Performance & Resource Efficiency](#9-performance--resource-efficiency)
10. [Quest System Reliability](#10-quest-system-reliability)
11. [Duel System](#11-duel-system)
12. [ElizaOS Integration](#12-elizaos-integration)
13. [Overall Scores](#13-overall-scores)
14. [Critical Blockers](#14-critical-blockers)
15. [Top Priorities](#15-top-priorities)

---

## 1. Complete Flow Map

```
STARTUP
  Plugin loads → Config validated → HyperscapeService.start()
  → Credential resolution (env → settings → wallet-auth)
  → WebSocket connect (async, non-blocking, 3 retries × 4s)
  → Server sends snapshot (world map, entities, chat history)
  → handleSnapshot() → auto-select character → enterWorld
  → Player entity spawns (entityAdded packet)
  → Bank state received (PLAYER_SPAWNED event)
  → Quest list requested
  → AutonomousBehaviorManager.start() → 3s stability delay → first tick

TICK LOOP (every 5s, or 2s fast-tick)
  ┌─ Duel timeout safety (5min hard limit)
  ├─ Periodic state refresh (30s: quests + bank)
  ├─ canAct() guard (connected? alive? not in duel?)
  ├─ Populate KNOWN_LOCATIONS (once from worldMap)
  ├─ Action lock check (skip if previous action still running, max 20s)
  ├─ Pre-save goal if inventory >= 25
  ├─ Process pending combat chat reaction
  ├─ Check spontaneous social behavior
  ├─ Handle locked user command goals
  ├─ Create tick message (ElizaOS Memory)
  ├─ Compose state (15 dynamic providers run, 1 static)
  ├─ Run evaluators (goal, survival, exploration, social, combat)
  ├─ SELECT ACTION:
  │   ├─ tryShortCircuit() [DETERMINISTIC — 20+ priority checks]
  │   │   0a. Gravestone recovery
  │   │   0b. Valuable ground item pickup
  │   │   1.  No goal → tryPlannerGoal() or SET_GOAL
  │   │   2.  Skill goal completion check
  │   │   2.1 Quest status change detection
  │   │   2.5 Stale exploration invalidation
  │   │   2.5a Tool requirement check (axe/pick/net)
  │   │   2.5b Combat food healing reflex (<50% HP)
  │   │   3.  Combat handling (3 modes: goal/disengage/reactive)
  │   │   4.  Inventory full → auto-bank
  │   │   5.  Banking goal + bank nearby → deposit/withdraw
  │   │   5.5 Quest material bank check
  │   │   5.6 Goal requires travel → NAVIGATE_TO
  │   │   6.  Post-navigate arrival actions
  │   │   7.  Repeat successful resource actions
  │   │   8.  Goal-action enforcement by type
  │   │   └── null → fall through to LLM
  │   └─ LLM fallback [~10% of decisions]
  │       ├─ Build 4KB+ prompt (personality, game state, actions, guidance)
  │       ├─ Parse THINKING + ACTION response
  │       └─ Sync thinking to dashboard
  ├─ Validate selected action (action.validate())
  ├─ Execute action (action.handler())
  ├─ Set action lock if needed
  └─ Track result for next tick

GOAL LIFECYCLE
  tryPlannerGoal() [DETERMINISTIC PLANNER]
  ├─ Stage A: Hard constraints (quest acceptance, turn-ins, tools, active quests)
  ├─ Stage B: Soft desires (scored: baseWeight × personality × satiation × opportunity)
  └─ Winner → setGoal() → short-circuit maps goal to actions

  savedGoal CHAINING
  ├─ Banking interruption: original → banking → restore
  ├─ Quest material redirect: quest → banking → gather → restore
  ├─ Duel interruption: goal → duel → strategic restore
  └─ Reactive combat: gather → fight 15s max → restore
```

---

## 2. Decision Architecture

**Score: 7/10**

### Findings

- The two-tier system (deterministic short-circuit + LLM fallback) is architecturally strong — ~90% of decisions never hit the LLM
- `tryShortCircuit()` at 660 lines has 20+ priority branches that handle the common cases well
- Goal planner uses a scored desire system (baseWeight × personality × satiation × opportunity) that produces reasonable goal selection
- Action lock system prevents spam re-evaluation during long-running operations

### Issues

- **Satiation formula works correctly** — `patienceReduction = 1 - (patience - 0.5) * 0.8` REDUCES satiation for patient agents (patience=0.9 → satiation × 0.68), which increases `(1 - satiation)` in the score formula, correctly making patient agents MORE tolerant of repetition. However, satiation only operates within a 15-minute window and caps at 0.8 — there is no long-term boredom escalation mechanism
- **No explicit state machine** — Agent state is implicit across flags (`duelPhase`, `reactiveCombatStartTime`, `goalPaused`, `savedGoal`, `actionLock`). Debugging requires tracing multiple fields
- **LLM prompt is 4KB+** — When the LLM IS called, it receives a massive context dump. No prioritization of what matters most for the current decision
- **savedGoal can be overwritten** — Nested interruptions (banking during quest material check during duel) can lose the original goal. Guards (`if (!this.savedGoal)`) exist but aren't consistent across all paths
- **MAX_CONSECUTIVE_FAILURES = 5** clears goal, but planner can immediately re-create the same failed goal — no cooldown on failed goal types
- **Dead code: `recentGoalCounts`** — Computed from goal history and passed to planner via `PlannerContext`, but never referenced inside `planNextGoal()`. Satiation uses `goalHistory` directly instead

### Timing Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| DEFAULT_TICK_INTERVAL | 5000ms | Normal decision interval |
| MIN_TICK_INTERVAL | 2000ms | Fast-tick mode |
| MAX_TICK_INTERVAL | 15000ms | Slow mode |
| ACTION_LOCK_MAX_MS | 20000ms | Safety timeout for movement locks |
| STATE_REFRESH_INTERVAL_MS | 30000ms | Periodic quest/bank refresh |
| REACTIVE_COMBAT_MAX_MS | 15000ms | Max reactive fight duration |
| TARGET_LOCK_TIMEOUT | 30000ms | Max target chase time |
| DUEL_TIMEOUT | 300000ms | 5min duel phase hard limit |
| COMBAT_CHAT_COOLDOWN | 15000ms | Between combat messages |
| GOAL_HISTORY_RETENTION | 900000ms | 15min goal diversity window |
| MAX_GOAL_HISTORY | 30 | Goals tracked for diversity |
| MAX_CONSECUTIVE_FAILURES | 5 | Validation failures before replanning |

### Recommendations

1. Implement a `savedGoalStack: CurrentGoal[]` instead of single `savedGoal` — supports nested interruptions cleanly
2. Add failed goal cooldown: track `failedGoalTypes: Map<string, number>` with 60s cooldown per type
3. Add explicit state enum: `AgentState = IDLE | PURSUING_GOAL | IN_COMBAT | BANKING | IN_DUEL | FLEEING`

**Priority:** High

---

## 3. Goal Planning & Natural Behavior

**Score: 5/10**

### Findings

- Goal planner makes deterministic, predictable decisions — good for reliability, bad for human-like behavior
- Tool quest ordering is hardcoded (axe → pickaxe → net → weapon) regardless of personality
- Opportunity bonuses are binary cliff-edges (e.g., smithing: have bars = 1.6x, no bars = 0.3x)
- Satiation system exists but is limited to a 15-minute sliding window (caps at 0.8) — no long-term boredom escalation across windows

### What a Human Player Does (that agents don't)

- Gets bored and switches tasks mid-stream
- Notices something interesting nearby and investigates
- Checks equipment/stats periodically and adjusts strategy
- Makes suboptimal-but-fun decisions (exploring instead of grinding)
- Has a sense of "session goals" (today I'll focus on fishing)
- Runs out of attention and goes AFK/idle periodically
- Reacts to chat with personality, not just scripted phrases

### Issues

- **No curiosity system** — Agent never pauses to look around, examine entities, or explore side paths
- **Limited boredom escalation** — Satiation penalizes repetition within a 15-minute window (up to 80% penalty), but resets completely after 15 minutes. Agent can grind indefinitely by alternating 15-minute cycles
- **Personality is decorative** — Traits exist but don't meaningfully drive decisions. An "adventurous" agent follows the same optimal tool-quest path as a "patient" one
- **No session memory** — Agent doesn't remember what it did last session or learn from past mistakes
- **Combat chat is 4 canned phrases** — Not personality-driven, not contextual
- **Social interactions are triggered by random chance** — Not by observing other players or responding to game events
- **Quest data race on startup** — Planner falls back to exploration when quests are empty, then re-plans when questList arrives. Not permanently blocking, but agent wastes early ticks exploring instead of acting on tool quests
- **Lost tool recovery broken** — Planner Phase 2.6 creates goal `{type: "questing", description: "Buy replacement tool..."}` with no `questStageType`. ABM processes questing goals by `questStageType`, so this falls through to `EXPLORE`. Additionally, BUY_ITEM action only opens shop UI — no purchase packet is sent
- **Satiation window is arbitrary** — 15 minutes, not configurable, not based on playstyle
- **Duel prep bonus is all-or-nothing** — Gear upgrade: either +20 (huge) or 0 (nothing)

### Recommendations

1. **Boredom escalation curve**: Track `consecutiveSameGoalTicks`. At 10 ticks, add +0.2 satiation. At 20, +0.5. At 30, force goal switch regardless of patience
2. **Curiosity interrupts**: 5% chance per tick to notice something interesting nearby (new NPC, rare resource, player doing something). Agent pauses goal for 1-2 ticks to investigate
3. **Personality-driven quest ordering**: Aggressive agents prioritize combat tool quests. Patient agents do gathering first. Adventurous agents accept quests in random order
4. **LLM-generated combat chat**: Instead of 4 canned phrases, send 1-line context to small/fast LLM for personalized banter
5. **Activity variety scoring**: Bonus points for goals the agent hasn't done in the last 30 minutes. Penalty for doing the same thing 3+ times in a row
6. **Quest data timeout**: If quest list not received within 10s of spawn, use cached tool quest data or fall through to LLM instead of blocking

**Priority:** Critical — This is the biggest gap between "bot-like" and "human-like"

---

## 4. Action Reliability & Completeness

**Score: 5/10**

### Complete Action Inventory (45 actions)

| Category | Actions | Count |
|----------|---------|-------|
| Movement | EXPLORE, FLEE, IDLE, APPROACH_ENTITY, MOVE_TO, FOLLOW_ENTITY, STOP_MOVEMENT, HOME_TELEPORT | 8 |
| Combat | ATTACK_ENTITY, ATTACK_TARGET, CHANGE_COMBAT_STYLE, TOGGLE_PRAYER | 4 |
| Gathering | CHOP_TREE, MINE_ROCK, CATCH_FISH, LIGHT_FIRE, COOK_FOOD | 5 |
| Crafting | SMELT_ORE, SMITH_ITEM, FLETCH_ITEM, TAN_HIDE, RUNE_CRAFT | 5 |
| Inventory | EQUIP_ITEM, USE_ITEM, DROP_ITEM, PICKUP_ITEM, LOOT_GRAVESTONE | 5 |
| Banking | BANK_DEPOSIT, BANK_WITHDRAW, BANK_DEPOSIT_ALL | 3 |
| Shopping | BUY_ITEM, SELL_ITEM | 2 |
| Trading | REQUEST_TRADE | 1 |
| Quests | TALK_TO_NPC, ACCEPT_QUEST, COMPLETE_QUEST, CHECK_QUEST | 4 |
| Social | CHAT_MESSAGE, GREET_PLAYER, SHARE_OPINION, OFFER_HELP | 4 |
| Duels | CHALLENGE_DUEL, ACCEPT_DUEL | 2 |
| Goals | SET_GOAL, NAVIGATE_TO | 2 |

### Critical Issues

- **BANK_DEPOSIT_ALL deposits everything then re-withdraws tools** — If re-withdrawal fails, agent loses all items. Should keep tools in inventory and only deposit non-essentials
- **34 hardcoded tool IDs** in bank deposit that must match server manifests exactly — no manifest-driven approach
- **Actions don't verify completion** — SMELT_ORE sends interaction, doesn't confirm bars were created. COOK_FOOD sends request, doesn't confirm food was cooked. If server rejects silently, agent thinks it succeeded
- **NAVIGATE_TO target resolution has 6 fallback layers** (~250 lines) — quest NPC → quest stage area → direct position → resource-specific (KNOWN_LOCATIONS/worldMap/nearby entity) → entity+worldMap search → quest NPC fallback. Each layer can fail silently with no error logging when all layers miss
- **Distance calculations are 2D only** (X/Z, ignoring Y) across most actions — agents could try to interact with entities on cliffs above them
- **No action confirmation/acknowledgment pattern** — Most actions are fire-and-forget. Banking actions have timing delays (100-300ms between operations) and gathering uses `executeResourceInteract()`, but none verify the server actually confirmed the outcome

### Silent Failure Points

| Action | Failure Mode |
|--------|-------------|
| SMELT_ORE, SMITH_ITEM, FLETCH_ITEM, TAN_HIDE, RUNE_CRAFT | Send interaction, don't verify completion |
| TALK_TO_NPC | Don't verify dialogue opened |
| BUY_ITEM, SELL_ITEM | Only open shop UI via `interactWithEntity("talk")`, no actual purchase/sell packet sent |
| PICKUP_ITEM | Don't verify item still exists after walking |
| LOOT_GRAVESTONE | Don't verify loot succeeds |
| BANK_DEPOSIT, BANK_WITHDRAW | Don't verify transaction succeeded |

### Hardcoded Data That Must Match Server

| Action | Hardcoded Data | Count |
|--------|---------------|-------|
| BANK_DEPOSIT_ALL | Tool IDs to re-withdraw | 34 |
| TOGGLE_PRAYER | Prayer names and IDs | 14 |
| CATCH_FISH | Fishing spot resource IDs | 7 |
| EQUIP_ITEM | Equipment slot names | 6 |
| CHANGE_COMBAT_STYLE | Combat styles | 4 |
| RUNE_CRAFT | Rune types | 13 |
| NAVIGATE_TO | Location names | 10+ |

### Missing Actions (humans can do, agents can't)

- Unequip items / swap equipment loadouts
- Sort inventory / search items
- Special attacks / ability activation
- Emotes / animations
- Multi-item trading (only REQUEST_TRADE, no actual trade flow)
- Advanced cooking (specific recipe selection)
- Prayer training
- Herblore / potions / alchemy

### Recommendations

1. **Fix BANK_DEPOSIT_ALL**: Filter inventory BEFORE depositing — keep tools in place, deposit the rest. Never deposit-then-rewithdraw
2. **Manifest-driven tool list**: Load essential tool IDs from server manifest instead of hardcoding 34 strings
3. **Action completion events**: For critical actions (banking, crafting, quest accept/complete), wait for server confirmation event before marking success
4. **Log NAVIGATE_TO resolution failures**: When all 6 fallback layers fail, log which layers were tried and why
5. **Add Y-axis distance check**: Use 3D distance for interaction range validation

**Priority:** High

---

## 5. Game State Data Quality

**Score: 6.5/10**

### What's Cached (GameStateCache)

```typescript
{
  playerEntity: PlayerEntity | null
  nearbyEntities: Map<string, Entity>
  currentRoomId: string | null
  worldId: string | null
  lastUpdate: number
  quests: QuestData[]
  bankItems: BankItem[]
  worldMap?: WorldMapData
  inventoryUpdatedAt?: number
  questsUpdatedAt?: number
  bankItemsUpdatedAt?: number
}
```

### Stale Data Risks

| Data | Update Mechanism | Risk |
|------|-----------------|------|
| Nearby entities | Push via entityAdded/Modified/Removed | Properly cleaned up via `entityRemoved` (line 2260) and `ENTITY_LEFT` (line 2981) handlers. Low risk — only stale if packet dropped |
| inCombat flag | Set on combatDamageDealt | **Server emits `COMBAT_ENDED` internally but event-bridge does NOT forward it over WebSocket.** Only cleared on duel completion (line 2937). PvE combat flag stays true indefinitely |
| Inventory | Push via inventoryUpdated | Stale if packet dropped, no periodic refresh |
| Skills/Equipment | Push via skillsUpdated/equipmentUpdated | Stale if packet dropped |
| Position | Multiple sources (6+ handlers) | Race conditions on concurrent updates from different packet types |
| Quest list | Re-requested on every quest event | Wasteful — 3 redundant `requestQuestList()` calls per quest change |

### Recommendations

1. **Bridge `COMBAT_ENDED` event**: Server already emits `EventType.COMBAT_ENDED` (CombatSystem.ts line 2493) but event-bridge.ts doesn't forward it. Add WebSocket forwarding and a handler that clears `player.inCombat` and `player.combatTarget`
2. **Combat state from server**: Track `inCombat` from `playerUpdated` packets (which include combat status) as backup, not just from damage events
3. **Trust incremental quest updates**: Remove `requestQuestList()` from quest event handlers. Only refresh on periodic 30s cycle
4. **Periodic inventory refresh**: Request inventory state every 60s as safety net

**Priority:** Medium

---

## 6. LLM Integration & Context Quality

**Score: 5/10**

### What the LLM Sees (~4KB per call)

| Provider | Size | Data |
|----------|------|------|
| goalProvider | ~0.5KB | Current goal, top 5 available goals, duel history |
| gameStateProvider | ~0.3KB | Health, stamina, position, combat status |
| inventoryProvider | ~0.2KB | Items, coins, free slots |
| nearbyEntitiesProvider | ~0.3KB | Players, NPCs, resources with distances |
| skillsProvider | ~0.3KB | Skill levels, combat level |
| questProvider | ~0.4KB | Active quests, nearby NPCs, missing tools |
| personalityProvider | ~0.3KB | Personality traits |
| possibilitiesProvider | ~0.5KB | Crafting recipes, gathering options |
| + 8 more providers | ~1KB | Various context |

### Issues

- **Context is massive and unfocused** — Every provider dumps full state. Most is irrelevant to the current decision
- **Redundant data across providers** — possibilitiesProvider repeats crafting recipes, skill info, combat targets already in other providers
- **No failure context** — LLM doesn't see "I tried train_fishing 3 ticks ago but it failed because no fishing spots nearby"
- **Priority scores unexplained** — Goals shown with priority 100, 85, 65 but LLM doesn't know the scoring algorithm
- **No decision urgency** — LLM treats "health at 10%" the same as "health at 90%" unless HP alert explicitly says to flee
- **Planner reasoning hidden from LLM** — When planner returns null, LLM doesn't know which desires were close

### Recommendations

1. **Context scoping by situation**: When in combat, only send combat-relevant context. When exploring, only send navigation context. Cut context by 60-70%
2. **Include last 3 actions + results**: Prevents retry loops
3. **Show planner reasoning**: When LLM is called because planner returned null, include desire scores and why tiebreaker was unclear
4. **Eliminate possibilitiesProvider** — Redundant with other providers
5. **Weighted urgency tokens**: `[URGENT]` prefix for health alerts, `[LOW]` for social opportunities

**Priority:** High

---

## 7. Server-Side Data Completeness

**Score: 7/10**

### What Agents Know ON CONNECT

- World map: All towns, POIs, resources, stations, NPCs with exact coordinates
- Own inventory, stats, health, skills, equipment
- Bank contents (sent on PLAYER_SPAWNED)
- Own position in entity snapshot

### Data Gaps

| Missing Data | Impact | Recommendation |
|-------------|--------|----------------|
| Resource depletion state | Agents don't know which resources are depleted until they observe events | Send `depleted: boolean` in world map data |
| Mob/NPC runtime positions | Only manifest data, not current positions | Include positions in snapshot |
| Combat target health | Can't make tactical retreat decisions | Include `targetHealth` in combatDamageDealt packets |
| Skill requirement pre-check | Agent walks to rock, server silently cancels if wrong level | Send explicit rejection packet |
| Crafting recipe manifest | Must open interface to see options | Send recipes on connect |

**Priority:** Medium

---

## 8. Connection & Network Resilience

**Score: 6/10**

### Issues

- **No WebSocket heartbeat/ping** — If server goes silent but connection stays open, agent doesn't detect it
- **No reconnect jitter** — All agents reconnect with same exponential backoff. Server crash = thundering herd
- **Movement promise never resolves if packet dropped** — 15s timeout, but if `tileMovementEnd` is lost, agent waits full duration
- **Game event handlers persist after disconnect** — WebSocket listeners ARE removed via `removeAllListeners()`, but game event handlers in `eventHandlers` Map are never cleared. Protected from duplication by `pluginEventHandlersRegistered` flag, but `disconnect()` method doesn't call `removeAllListeners()` (only error/stale paths do)

### Recommendations

1. WebSocket ping every 30s, expect pong within 5s
2. Add jitter: `delay = baseDelay * (1 + Math.random() * 0.3)`
3. Clean up event handlers on disconnect, re-register on reconnect
4. Movement timeout: explicitly cancel via `executeMove({cancel: true})`

**Priority:** Medium

---

## 9. Performance & Resource Efficiency

**Score: 7/10**

### Strengths

- Pre-allocated `_tempPosition` array avoids GC pressure
- Binary msgpackr protocol
- Map<string, Entity> for O(1) lookups
- Chat processing serialized via Promise chain
- Short-circuit handles 90% of decisions without LLM

### Issues

- **5s default tick is slow** — Humans react in <1s. Agent takes 5s minimum
- **LLM call blocks the entire tick with no timeout** — Synchronous `await this.runtime.useModel()` with no `Promise.race()` or timeout wrapper. If LLM service hangs, entire agent freezes indefinitely
- **Every tick runs 15 of 16 providers** — personalityProvider is static, rest are `dynamic: true` and run every tick even when only 1-2 have new data
- **Quest list re-requested on every quest event** — 3 redundant calls per change

### Recommendations

1. Provider caching with dirty flags: only re-run changed providers. Save ~40% per tick
2. Async LLM with 2s timeout: don't block tick, use deterministic fallback
3. Combat fast-tick at 1s (currently 2-5s)
4. Remove redundant quest refresh

**Priority:** Medium

---

## 10. Quest System Reliability

**Score: 6/10**

### Issues

- **Quest data race on startup** — Planner falls back to exploration when quests empty, recovers when data arrives, but wastes early ticks
- **Stage progress shows wrong data during transitions** — Old stage progress bleeds into new stage
- **`questStartConfirm` auto-accepts** — Hidden state transition, hard to debug
- **No quest priority system** — If 3 active quests, picks first non-combat one arbitrarily

### Recommendations

1. Quest data timeout: fall through to LLM if no quest list within 10s
2. Stage transition debounce: wait 2s for updated progress after stage advance
3. Quest priority scoring: proximity (40%), reward (30%), completion% (20%), personality (10%)

**Priority:** High

---

## 11. Duel System

**Score: 8/10**

### Strengths

- Full state machine: IDLE → PENDING → SESSION → FIGHTING → COMPLETED
- Goal save/restore across duel lifecycle
- Strategic outcome assessment (loss → adjust gear/food/training)
- 5-minute hard timeout
- Auto-accept mode for duel bots
- History tracking (last 10, streak analysis)

### Issues

- 30s challenge expiry checked on read, not enforced (should use setTimeout)
- No opponent health tracking during duels
- Post-duel strategy is simplistic

**Priority:** Low

---

## 12. ElizaOS Integration

### Current Usage

| API | Used | Frequency | Quality |
|-----|------|-----------|---------|
| `composeState()` | Yes | Every 5s | Correct but wasteful — 15 of 16 providers run every tick (personalityProvider is `dynamic: false`) |
| `useModel()` | Yes | ~10% of ticks | Correct |
| `evaluate()` | Yes | Every 5s | Return values only debug-logged, but evaluators mutate `state` (survivalFacts, combatFacts) which flow into LLM prompt |
| `createMemory()` | Yes | Per event | Stores but **never retrieves** |
| `processActions()` | **Partial** | Chat only | Used for chat-triggered actions (HyperscapeService.ts line 1047), bypassed in autonomous tick loop |
| Action interface | Yes | 45 actions | Full implementation |
| Provider interface | Yes | 16 providers | Full implementation |
| Service class | Yes | 1 service | Correct |

### Unused ElizaOS Features

| Feature | What It Does | Impact of Not Using |
|---------|-------------|-------------------|
| **Memory retrieval** (`getMemories`, `searchMemories`) | Recall past events by embedding similarity | Agents have no memory — start fresh every session |
| **Knowledge system** (`character.knowledge`) | RAG-based game data injection | All game data hardcoded in 100+ places |
| **Embedding search** | Semantic similarity across stored memories | Can't find "what worked last time" |
| **BM25 full-text search** | Keyword retrieval with relevance scoring | Can't search memories contextually |
| **Relationship system** | First-class entity relationships with tags | Custom socialMemory instead |
| **Action planning** (`ActionPlan`) | Multi-step action sequences with result chaining | Not used in autonomous loop; single-action-per-tick |
| **`dynamicPromptExecFromState()`** | Structured output with validation, retries, truncation detection | Raw useModel() with regex parsing |
| **Pre-evaluators** (phase: "pre") | Message filtering/rewriting | No filtering |
| **Handlebars templates** | Template-based prompt construction | 500+ lines of manual string concat |
| **Provider `dynamic` + `relevanceKeywords`** | Auto-activate providers only when relevant | 15 of 16 are `dynamic: true`, none use `relevanceKeywords` filtering |
| **Response caching** (`getCache`/`setCache`) | Cache LLM responses | No caching |
| **`character.knowledge`** | File-based RAG at startup | Not configured |
| **`character.style`** | Communication style guidance | Custom personalityProvider instead |

### ElizaOS Integration Score: 3.5/10

We use ElizaOS as a thin runtime wrapper. The majority of the framework's value is ignored.

### Memory System — Score: 2/10

**Current state:** We store memories but never read them back.

```
STORE: Game events → createMemory() → database   ← WORKS
READ:  Decision making ← getMemories() ← database ← NEVER CALLED
```

Memory is stored via `createMemory()` (4 call sites in events/handlers.ts) but never retrieved — no calls to `getMemories()`, `searchMemories()`, or `searchMemoriesByEmbedding()` anywhere in the plugin.

**What we COULD do:**
- Before choosing a combat target: "What mobs have I fought before? Which ones were too hard?"
- Before choosing a gathering spot: "Where did I successfully fish last time?"
- Before quest decisions: "Which quests gave good rewards?"
- Cross-session learning: "Last time I played, I ran out of food during combat"

### Knowledge System — Score: 1/10

**Current state:** `character.knowledge` is defined in character config with topic strings ("Hyperscape game mechanics", "Combat strategies", etc.) but never accessed by the plugin. ElizaOS has built-in RAG where knowledge files get chunked, embedded, and semantically searched. We hardcode everything instead.

**What we hardcode:**
- 34 tool IDs in BANK_DEPOSIT_ALL
- 14 prayer names in TOGGLE_PRAYER
- 7 fishing spot resource IDs in CATCH_FISH
- 13 rune types in RUNE_CRAFT
- Equipment slot detection patterns
- Combat style mappings
- Recipe data in possibilitiesProvider

**What we SHOULD load as knowledge:**
```typescript
character.knowledge = [
  { item: { case: "path", value: "./world/assets/items.json" } },
  { item: { case: "path", value: "./world/assets/quests.json" } },
  { item: { case: "path", value: "./world/assets/recipes.json" } },
]
```

### Evaluator System — Score: 4/10

5 evaluators registered and called every tick. Return values are only debug-logged, but evaluators DO mutate the `state` object — adding `survivalFacts` and `combatFacts` arrays that flow into the LLM prompt via `buildActionSelectionPrompt()`. So evaluators feed the LLM path, but NOT the deterministic `tryShortCircuit()` path (~90% of decisions).

**Recommendation:** Wire evaluator facts into short-circuit decision-making (e.g., survival urgency → forced flee), or at minimum, ensure evaluator state mutations are the canonical source of these facts rather than duplicating logic.

### Action Selection Pipeline — Score: 5/10

The autonomous tick loop bypasses `processActions()` with a custom action selection pipeline. `processActions()` IS used for chat-triggered actions (HyperscapeService.ts line 1047). The bypass was intentional (chat-based pipeline doesn't fit game loops), but we miss out on:

- **Structured output** — We parse `THINKING: ...\nACTION: ...` with regex. If LLM deviates, parsing fails
- **Parameter extraction** — Actions re-fetch everything from service instead of receiving parameters
- **Retry with backoff** — If LLM fails, we just default to EXPLORE
- **Metrics tracking** — No visibility into LLM success/failure rates

**Better approach:** Keep `tryShortCircuit()`, replace raw `useModel()` with `dynamicPromptExecFromState()` for the LLM path. Get validation, retries, truncation detection for free.

### Provider Efficiency — Score: 4/10

15 of 16 providers run every tick (`dynamic: true`). personalityProvider is `dynamic: false`. Many rarely change:

| Provider | Change Frequency | Should Run Every Tick? |
|----------|-----------------|----------------------|
| gameStateProvider | Frequently | Yes |
| nearbyEntitiesProvider | Frequently | Yes |
| inventoryProvider | On pickup/drop | Only when dirty |
| skillsProvider | Rarely | Every 10th tick |
| equipmentProvider | Rarely | Every 10th tick |
| personalityProvider | Never | Once per session (`dynamic: false` — already correct) |
| mapProvider | Never after connect | Once per session |
| questProvider | On quest events | Only when dirty |
| goalProvider | On goal change | Only when dirty |

**Recommendation:** Split into hot (every tick) and cold (on change). Use `composeState(message, includeList)` to scope. Could cut overhead by 50-60%.

### Prompt Construction — Score: 4/10

500+ lines of manual string concatenation in `buildActionSelectionPrompt()`. ElizaOS has Handlebars templates that we don't use. Not a reliability issue, but a maintenance burden.

---

## 13. Overall Scores

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Decision Architecture | 15% | 7 | 1.05 |
| Natural Behavior | 15% | 5 | 0.75 |
| Action Reliability | 12% | 5 | 0.60 |
| Data Quality | 8% | 6.5 | 0.52 |
| LLM Integration | 8% | 5 | 0.40 |
| Server Data | 5% | 7 | 0.35 |
| Network Resilience | 5% | 6 | 0.30 |
| Performance | 5% | 7 | 0.35 |
| Quest System | 5% | 6 | 0.30 |
| Duel System | 2% | 8 | 0.16 |
| ElizaOS Integration | 20% | 3.5 | 0.70 |
| **Total** | **100%** | | **5.48** |

---

## 14. Critical Blockers

1. **`inCombat` flag never cleared for PvE combat** — Server emits `COMBAT_ENDED` event internally (CombatSystem.ts line 2493) but event-bridge.ts does NOT forward it over WebSocket. Plugin has a handler registered (handlers.ts line 28) that never fires. Flag only cleared on duel completion (line 2937)
2. **BANK_DEPOSIT_ALL can lose items** — Deposits everything then re-withdraws tools. If withdrawal fails, tools gone
3. **Lost tool recovery flow is broken** — Planner creates `type: "questing"` goal with description "Buy replacement tool" but sets no `questStageType`. ABM processes questing goals by `questStageType`, so this falls through to `EXPLORE` — agent never actually buys a tool
4. **BUY_ITEM/SELL_ITEM don't transact** — Both actions only call `interactWithEntity("talk")` to open the shop UI. No purchase/sell packet is ever sent. Agents cannot actually buy or sell items
5. **No action completion verification** — Most actions are fire-and-forget. Agent can't tell if server accepted commands
6. **Memory system is write-only** — 4 `createMemory()` call sites, zero `getMemories()`/`searchMemories()` calls. Agents have zero learning capability
7. **savedGoal overwritten without guard** — Lines 1812 (tool in bank) and 5228 (duel entry) overwrite savedGoal without checking if one already exists, risking nested goal context loss

---

## 15. Top Priorities

### Priority 1: Human-Like Behavior System
**Impact:** Transforms agents from bots to believable players

- Boredom escalation curve (force variety after N consecutive same-goal ticks)
- Curiosity interrupts (5% chance to investigate nearby novelty)
- Personality-driven quest ordering (not hardcoded tool quest sequence)
- Activity variety scoring (bonus for things not done recently)
- Session-level memory ("I was fishing earlier, let me try something else")

### Priority 2: ElizaOS Memory Retrieval for Decision Making
**Impact:** Agents that learn from experience instead of starting fresh

- Query relevant memories before major decisions (combat, gathering, quests)
- Use `searchMemories()` with embeddings for "similar situation" recall
- Cross-session learning from stored combat/quest/gathering events
- Don't enable full long-term memory (too noisy) — use targeted queries

### Priority 3: ElizaOS Knowledge System for Game Data
**Impact:** Eliminates all hardcoded game data, agents adapt to content changes

- Load item manifests, quest data, recipes, equipment stats as `character.knowledge`
- Replace 34 hardcoded tool IDs, 14 prayer names, 13 rune types with knowledge queries
- Game data updates automatically when manifests change

### Priority 4: Context Scoping for LLM Calls
**Impact:** 60-70% less LLM context, faster responses, better decisions

- Scope providers by situation (combat vs exploration vs banking)
- Include last 3 actions + results (prevent retry loops)
- Show planner reasoning when LLM is called
- Replace raw `useModel()` with `dynamicPromptExecFromState()` for structured output

### Priority 5: Action Confirmation + Goal Stack
**Impact:** Eliminates silent failures and goal loss

- Fix BANK_DEPOSIT_ALL to filter before depositing
- Wait for server confirmation on critical actions
- Replace `savedGoal` with `goalStack: CurrentGoal[]` for nested interruptions
- Add failed goal cooldown (planner can immediately re-create same failed goal after 5 failures)
- Bridge `COMBAT_ENDED` event from server to plugin (event-bridge.ts → WebSocket → clear inCombat)
- Fix lost tool recovery: either implement actual BUY_ITEM packet or use a dedicated `type: "shopping"` goal
- Implement real BUY_ITEM/SELL_ITEM actions that send purchase/sell packets instead of just opening shop UI

### Priority 6: Provider Optimization
**Impact:** 50-60% reduction in per-tick overhead

- Split providers into hot (every tick) and cold (on change)
- Use `composeState(message, includeList)` to scope execution
- Mark providers dirty on relevant game events
- Wire evaluator state facts into short-circuit path (currently only feed LLM prompt, not the 90% deterministic path)

### Priority 7: Reactive Tick Speed
**Impact:** Agent reacts 2-5x faster to game events

- Combat: 1s ticks (currently 2-5s)
- Provider caching with dirty flags
- Async LLM with 2s timeout
- Movement promise cancellation on timeout
