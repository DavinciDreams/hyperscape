# Movement & Game Tick System Audit

**Date:** 2026-03-16
**Scope:** Click-to-move pipeline, BFS pathfinding, tile walkability, collision detection, server movement execution, client interpolation, game tick scheduling, tick processing order, tick reliability.

---

## Table of Contents

1. [Click-to-Move Input Handling](#1-click-to-move-input-handling)
2. [BFS Pathfinding Algorithm](#2-bfs-pathfinding-algorithm)
3. [Tile Walkability System](#3-tile-walkability-system)
4. [Click Destination Accuracy](#4-click-destination-accuracy)
5. [Server Movement Execution](#5-server-movement-execution)
6. [Client Interpolation](#6-client-interpolation)
7. [Tick Scheduling & Drift Correction](#7-tick-scheduling--drift-correction)
8. [Tick Processing Order & Determinism](#8-tick-processing-order--determinism)
9. [Tick Overrun & Skip Handling](#9-tick-overrun--skip-handling)
10. [Tick Reliability & Error Resilience](#10-tick-reliability--error-resilience)
11. [Tick-Aligned Cooldowns & Timers](#11-tick-aligned-cooldowns--timers)
12. [Memory & Allocation Hygiene](#12-memory--allocation-hygiene)
13. [Anti-Cheat & Input Validation](#13-anti-cheat--input-validation)
14. [Overall Assessment](#14-overall-assessment)
15. [Critical Blockers](#15-critical-blockers)
16. [Top 10 Priorities](#16-top-10-priorities)

---

## 1. Click-to-Move Input Handling

**Score: 6/10**

### Findings

**F1.1 — No client-side optimistic movement prediction (Critical)**
`packages/shared/src/systems/client/interaction/InteractionRouter.ts:1105-1122`
`setOptimisticTarget()` only **rotates** the character toward the click destination. The character does not start walking until the server's `tileMovementStart` packet arrives (~50-150ms round-trip). In RS3, the client begins walking immediately using a local pathfind, then reconciles with the server. This is the primary cause of the "delayed response" feel.

**F1.2 — 70ms client-side rate-limit adds perceived lag (Medium)**
`InteractionRouter.ts:125` — `MOVE_SEND_COOLDOWN_MS = 70`. When a player clicks within 70ms of a previous click, the request is queued via `setTimeout` and coalesced. Rapid repositioning clicks feel sluggish — up to 70ms of dead time before the server even sees the request.

**F1.3 — Silent rate-limiter drops on server (Medium)**
`packages/server/src/systems/ServerNetwork/tile-movement.ts:355` and `SlidingWindowRateLimiter.ts:272-279`. Server silently drops move requests exceeding 15/sec. No feedback to client. If a player spam-clicks, some clicks vanish without visual acknowledgement.

**F1.4 — Click distance clamping may surprise users (Low)**
`InteractionRouter.ts:1060` — Clicks beyond `MAX_CLICK_DISTANCE_TILES` are scaled down toward the player. The character walks to a closer tile than where the player clicked, with no visual indicator of the actual destination.

### Recommendations

| # | Action | Priority |
|---|--------|----------|
| R1.1 | **Add client-side optimistic pathfinding.** Run BFS locally on click, start walking immediately, reconcile when server responds. Eliminates 50-150ms perceived lag. | **Critical** |
| R1.2 | Reduce `MOVE_SEND_COOLDOWN_MS` from 70ms to 30-40ms, or remove it entirely and rely on server rate limiter. | High |
| R1.3 | When server drops a rate-limited request, send a lightweight rejection so client can show feedback or re-queue. | Medium |
| R1.4 | Show a visual marker when click distance is clamped, so the player sees where they'll actually walk. | Low |

---

## 2. BFS Pathfinding Algorithm

**Score: 7/10**

### Findings

**F2.1 — BFS produces shortest-tile-count paths, not most natural paths (High)**
`packages/shared/src/systems/shared/movement/BFSPathfinder.ts:325-427`
BFS is unweighted: every step (cardinal or diagonal) costs 1. This is OSRS-accurate but produces zig-zagging diagonals and unintuitive detours around obstacles. RS3 uses A* with heuristic weighting for more natural paths.

**F2.2 — OSRS neighbor order biases path shape (Medium)**
`BFSPathfinder.ts:384` — `TILE_DIRECTIONS` order is W,E,S,N,SW,SE,NW,NE. In BFS the first-discovered path wins. This ordering means paths tend to favor west/east before south/north, creating a visible directional bias when two equidistant routes exist.

**F2.3 — 8000 iteration limit causes partial paths silently (Medium)**
`BFSPathfinder.ts:328,360-371` — When BFS exceeds 8000 iterations (~44-tile radius in open terrain), it returns a partial path. The client walks partway and stops. `wasLastPathPartial()` API exists but the client doesn't check it or show a visual indicator.

**F2.4 — No path smoothing post-BFS (Medium)**
Raw BFS path is sent directly to the client. No string-pulling or funnel algorithm removes unnecessary waypoints. Paths look robotic — stepping one tile at a time through a straight corridor instead of walking diagonally across open space.

**F2.5 — Object allocations in BFS hot path (Low)**
`BFSPathfinder.ts:385-388` — `{ x: nx, z: nz }` allocates a new TileCoord per direction per iteration. At 8000 iterations x 8 directions = 64,000 objects per pathfind. The BFS pool covers visited/parent/queue but not per-neighbor objects.

### Recommendations

| # | Action | Priority |
|---|--------|----------|
| R2.1 | **Replace BFS with A\* using Chebyshev heuristic** for player movement. Paths prefer straight lines, search space shrinks dramatically, iteration limit rarely triggers. Keep BFS for multi-destination combat pathfinding. | **High** |
| R2.2 | Add post-pathfind **string-pulling** (remove redundant waypoints on the same line). Makes straight-line segments look natural. | High |
| R2.3 | When `wasLastPathPartial()` is true, show a visual indicator at the partial destination. | Medium |
| R2.4 | Pre-allocate 8 reusable `TileCoord` objects for neighbor expansion in the BFS loop. | Low |

---

## 3. Tile Walkability System

**Score: 5/10**

### Findings

**F3.1 — Slope calculation is expensive and uncached (Critical)**
`packages/shared/src/systems/shared/world/TerrainSystem.ts:5433-5479`
`calculateSlope()` samples 8 heights per tile (4 cardinal + 4 diagonal) via `getHeightAt()`. BFS calls this for every tile explored: 8000 iterations x 8 height lookups = 64,000 synchronous height lookups per pathfind on the tick thread. No slope cache exists.

**F3.2 — Per-biome maxSlope thresholds may over-block (High)**
`TerrainSystem.ts:5383-5390` — Each biome has a different `maxSlope` (0.5 to 0.9). The "mountains" biome uses 0.5, which is very aggressive — gentle inclines that visually look walkable are rejected by the pathfinder.

**F3.3 — BiomeType enum is stale — "canyon" biome doesn't exist in manifest (High)**
`packages/shared/src/systems/shared/world/TerrainBiomeTypes.ts` — `BiomeType` enum has `Canyon = "canyon"` but `packages/server/world/assets/manifests/biomes.json` has no "canyon" entry (it has: plains, forest, valley, mountains, tundra, desert, lakes, swamp). `BIOME_LIST` produces `["tundra", "forest", "canyon"]` which feeds into `BiomeSystem.computePolygonCenters()`. Tiles assigned biome "canyon" fail the biome lookup, potentially corrupting walkability for those tiles.

**F3.4 — "lakes" biome blanket-blocks all tiles (Medium)**
`TerrainSystem.ts:5370-5377` — Any tile in the "lakes" biome is unconditionally non-walkable, regardless of actual water level. If the biome boundary bleeds into dry land at Voronoi edges, walkable-looking land near lakes becomes impassable.

**F3.5 — CollisionMatrix is 2D only — upper floors invisible to pathfinder (Medium)**
`packages/shared/src/systems/shared/movement/CollisionMatrix.ts:17-40` — Only ground-floor walls exist in the CollisionMatrix. Upper-floor collision is handled separately by `BuildingCollisionService`. If the `floorIndex` is wrong, building tiles can appear walkable when they're not.

**F3.6 — ResourceEntity footprints block tiles permanently (Low)**
Resources (trees, rocks, ores) register `BLOCKED` flags when spawned. If a resource despawns without clearing its flags, the tile stays blocked until chunk reload.

### Recommendations

| # | Action | Priority |
|---|--------|----------|
| R3.1 | **Pre-compute and cache a slope walkability grid** at terrain generation time. Store `slopeWalkable: boolean` per tile. Invalidate only on terrain change. Eliminates 64K height lookups per pathfind. | **Critical** |
| R3.2 | **Fix BiomeType enum** to match `biomes.json`. Remove "canyon", add "plains", "valley", "mountains", "desert", "lakes", "swamp". | **High** |
| R3.3 | Tune maxSlope per biome — raise mountains from 0.5 to 0.65-0.7. Use debug overlay to verify slope-blocked tiles match visual terrain. | High |
| R3.4 | For "lakes" biome, check actual water level per tile instead of blanket-blocking. | Medium |
| R3.5 | Add resource cleanup hook that clears CollisionMatrix flags on despawn. | Low |

---

## 4. Click Destination Accuracy

**Score: 6/10**

### Findings

**F4.1 — worldToTile uses Math.floor, introducing half-tile bias (High)**
`packages/shared/src/systems/shared/movement/TileSystem.ts` — `worldToTile()` uses `Math.floor(worldX / TILE_SIZE)`. A click at world position 5.99 maps to tile 5, while 6.01 maps to tile 6. On tile boundaries, a 2-pixel mouse difference changes the destination tile. `Math.round` would snap to the nearest tile center.

**F4.2 — Raycast hits terrain mesh, not logical tile grid (Medium)**
`packages/shared/src/systems/client/interaction/services/RaycastService.ts` — Raycast hits the 3D terrain mesh geometry with vertex resolution lower than 1 tile. The hit point is an approximation on slopes. The world position is then floored to a tile, compounding the error.

**F4.3 — Building floor Y-filtering may reject valid clicks (Medium)**
`RaycastService.ts` — When inside buildings, raycast filters hits by Y-coordinate (1.5m threshold). On sloped terrain near building edges, valid ground clicks can be rejected.

**F4.4 — findNearestWalkable search radius is only 5 tiles (Low)**
`BFSPathfinder.ts:505` — When the clicked tile is non-walkable, `findNearestWalkable` searches only 5 tiles out. Large blocked areas (buildings, lakes) may return no walkable tile, and the character does nothing.

### Recommendations

| # | Action | Priority |
|---|--------|----------|
| R4.1 | **Use `Math.round` instead of `Math.floor`** in `worldToTile()` for player click conversion (keep `Math.floor` for internal tile math). | **High** |
| R4.2 | Increase `findNearestWalkable` search radius from 5 to 10-15 tiles. | Medium |
| R4.3 | Add a subtle destination marker at the actual destination tile when it differs from click point. | Medium |
| R4.4 | Snap raycast hit to tile grid plane (Y from heightmap at tile center) before converting. | Low |

---

## 5. Server Movement Execution

**Score: 7/10**

### Findings

**F5.1 — Movement only advances on 600ms ticks (Medium)**
`packages/server/src/systems/ServerNetwork/tile-movement.ts:578` — `onTick()` advances entity positions every 600ms. Server-side range checks and interaction triggers all operate at 600ms granularity.

**F5.2 — No path continuation prediction (Medium)**
When a player clicks a new destination mid-walk, the server computes a fresh BFS from the player's **current tick position** (not projected next-tick position). If the server tick hasn't advanced yet, the path starts from an old tile, causing a brief visual "backtrack."

**F5.3 — Anti-cheat validates tile-per-tick speed correctly (Good)**
`MovementInputValidator.ts` and `MovementAntiCheat.ts` properly enforce maximum tiles-per-tick movement without false positives.

### Recommendations

| # | Action | Priority |
|---|--------|----------|
| R5.1 | When computing a new path mid-walk, use the player's projected next-tick position as start tile. | Medium |
| R5.2 | Consider sub-tick interaction resolution (e.g., item pickup triggers immediately on tile arrival, not on next tick). | Low |

---

## 6. Client Interpolation

**Score: 8/10**

### Findings

**F6.1 — Catch-up multiplier smoothing is well-implemented (Good)**
`packages/shared/src/systems/client/TileInterpolator.ts:1162-1182` — Exponential smoothing with rate limiting. Frame-rate independent. No jarring speed changes.

**F6.2 — Path continuation avoids reset stutter (Good)**
`TileInterpolator.ts:354-374` — Continuation paths append tiles without resetting visual state. No visible stutter on re-pathing.

**F6.3 — Snap-to-tile on path complete prevents drift (Good)**
`TileInterpolator.ts:1293-1326` — Final position snaps to exact tile center. No accumulated floating-point drift.

**F6.4 — No idle animation blend on movement start (Low)**
Movement start immediately switches to walk animation with no crossfade, causing a small visual pop.

### Recommendations

| # | Action | Priority |
|---|--------|----------|
| R6.1 | Add animation crossfade (100-150ms blend from idle to walk). | Low |

---

## 7. Tick Scheduling & Drift Correction

**Score: 8/10**

### Findings

**F7.1 — Self-correcting setTimeout is well-designed (Good)**
`packages/server/src/systems/TickSystem.ts:139-152` — Uses `setTimeout` with drift correction instead of `setInterval`. `nextTickTime += TICK_DURATION_MS` always advances on schedule, maintaining long-term accuracy even if individual ticks run late.

**F7.2 — Date.now() used for tick timing (Acceptable)**
`TickSystem.ts:174,230,234,246,277` — `Date.now()` is used throughout instead of `performance.now()` or `process.hrtime()`. This has ~1ms resolution on modern systems, which is adequate for 600ms ticks but not ideal for sub-tick handler profiling.

**F7.3 — Cached timestamp avoids repeated Date.now() calls (Good)**
`TickSystem.ts:172` — `updateCachedTimestamp()` called once per tick. Hot paths read the cached value instead of calling `Date.now()` repeatedly.

**F7.4 — Minimum 1ms delay prevents busy-spin (Good)**
`TickSystem.ts:146` — `Math.max(1, this.nextTickTime - now)` ensures setTimeout never gets a 0ms delay, preventing CPU-hogging busy loops.

### Recommendations

| # | Action | Priority |
|---|--------|----------|
| R7.1 | Use `performance.now()` for handler profiling where sub-millisecond precision matters. Keep `Date.now()` for wall-clock scheduling. | Low |

---

## 8. Tick Processing Order & Determinism

**Score: 9/10**

### Findings

**F8.1 — OSRS-accurate Henke's Model processing order (Excellent)**
`packages/server/src/systems/GameTickProcessor.ts:358-397` — Seven-phase tick:
1. Reset per-tick flags
2. Process player inputs (from previous tick)
3. Process NPCs in spawn order (timers → queues → movement → combat)
4. Process players in PID/connection order (queues → timers → movement → combat)
5. Apply queued damage (OSRS asymmetry)
6. Process death and loot
7. Batch broadcast all changes

**F8.2 — Deterministic entity ordering (Good)**
`GameTickProcessor.ts:407-469` — NPCs sorted by ID, players by connection time then ID. Order is cached and only recomputed when entities spawn/despawn (dirty flag pattern).

**F8.3 — Priority-based listener system with stable sort (Good)**
`TickSystem.ts:224-226` — `sortedListeners.sort((a, b) => a.priority - b.priority)` is stable in modern JS engines. Registration order preserved within same priority.

**F8.4 — OSRS damage asymmetry correctly implemented (Good)**
`GameTickProcessor.ts:650-741` — NPC→Player damage applies same tick, Player→NPC damage queued for next tick. Hit delay formulas match OSRS wiki (melee instant, ranged 1 + floor((3+d)/6), magic 1 + floor((1+d)/3)).

**F8.5 — Dual tick processing systems run simultaneously (Medium Risk)**
`GameTickProcessor.ts` AND `TickSystem.ts` with registered listeners in `ServerNetwork/index.ts` both process entities per tick. The `GameTickProcessor` has its own NPC/player processing with OSRS-accurate ordering, while individual systems also register via `TickSystem.onTick()`. Some systems may be processing entities twice if both paths are active. The `enabled` flag on `GameTickProcessor.ts:176` controls this, but it defaults to `true`, meaning both paths could conflict.

### Recommendations

| # | Action | Priority |
|---|--------|----------|
| R8.1 | Audit the overlap between `GameTickProcessor.processTick()` and the individual `TickSystem.onTick()` listeners for combat, movement, and AI. Ensure no system processes the same entity twice per tick. | **High** |
| R8.2 | Document the canonical tick processing pipeline in a single location so the two systems' interactions are clear. | Medium |

---

## 9. Tick Overrun & Skip Handling

**Score: 7/10**

### Findings

**F9.1 — No tick is ever skipped in processing (Good)**
`TickSystem.ts:232-243` — All registered handlers always run to completion within a tick. No timeout or cancellation. Errors are caught per-handler; the remaining handlers still execute.

**F9.2 — Schedule reset on severe overrun (Acceptable)**
`TickSystem.ts:194-215` — When >2 ticks behind (>1200ms), the schedule resets to current time. Skipped ticks increment `missedTickCount` but **no game logic runs for those skipped ticks**. This means:
- Damage queued for skipped tick numbers never applies (if `applyAtTick` falls on a skipped tick number, it will apply on the next actual tick since the check is `d.applyAtTick <= tickNumber`)
- NPC AI doesn't run for skipped ticks
- Movement doesn't advance for skipped ticks

**F9.3 — Skip is off by default (Good)**
`TickSystem.ts:61-62` — `TICK_ALLOW_SKIP` defaults to `false`. Without explicit opt-in, the server attempts immediate catch-up rather than skipping. This is the safe default for gameplay correctness.

**F9.4 — Budget warning at 80% threshold (Good)**
`TickSystem.ts:280-293` — Warns when tick processing exceeds 480ms (80% of 600ms budget). Warning suppression with 5-second cooldown prevents log spam under sustained load.

**F9.5 — No catch-up storm protection when skipping disabled (Medium)**
When `allowTickSkipping = false` (default), if a tick takes 2000ms, the next tick fires immediately (delay = 1ms). This creates a rapid-fire catch-up burst that could compound load. Under sustained overload, ticks pile up without any backpressure.

### Recommendations

| # | Action | Priority |
|---|--------|----------|
| R9.1 | Even with skip disabled, add a maximum catch-up rate (e.g., no more than 3 ticks within 1200ms) to prevent cascading overload. | Medium |
| R9.2 | Emit a "tick_skipped" event when ticks are skipped (when skip IS enabled) so game systems can compensate (e.g., NPC AI runs a larger deltaTime). | Medium |
| R9.3 | Expose `missedTickCount` and `lateTickCount` to the monitoring/metrics endpoint for ops visibility. | Low |

---

## 10. Tick Reliability & Error Resilience

**Score: 8/10**

### Findings

**F10.1 — Per-handler error isolation (Excellent)**
`TickSystem.ts:236-243` — Each listener is wrapped in try/catch. One handler crashing doesn't stop the tick or prevent other handlers from running. Errors are logged with priority context.

**F10.2 — Event listener cleanup prevents memory leaks (Good)**
`GameTickProcessor.ts:883-906` — `destroy()` removes all event listeners, clears queues and processing order arrays, and destroys script queues. Bound handler references enable proper `off()` cleanup.

**F10.3 — TickSystem.stop() does not clear listeners (Medium)**
`TickSystem.ts:157-164` — `stop()` clears the timeout and sets `isRunning = false`, but does not clear the `listeners` or `sortedListeners` arrays. If `start()` is called again (or a new TickSystem is created during hot-reload), old listeners with stale references persist.

**F10.4 — No synchronization between network messages and tick processing (Medium)**
Network messages (WebSocket handlers) and tick processing both run on the Node.js event loop but on different turns. A WebSocket handler can mutate entity state between ticks. The `ActionQueue` pattern mitigates this for movement, but direct state mutations in other handlers (e.g., trade, chat) could race with tick processing.

**F10.5 — Socket health check runs outside tick system (Low)**
`packages/server/src/systems/ServerNetwork/socket-management.ts:100-103` — Socket disconnect cleanup triggers entity removal on a separate 5-second interval, not synchronized with ticks. Entity could be removed mid-tick. Most handlers null-check entities, making this safe in practice.

### Recommendations

| # | Action | Priority |
|---|--------|----------|
| R10.1 | Add `listeners.length = 0` and `sortedListeners.length = 0` to `TickSystem.stop()` for clean hot-reload. | Medium |
| R10.2 | Document the tick/network message ordering contract: "All network message handlers MUST queue state changes via ActionQueue or ScriptQueue. Direct state mutation is unsafe." | Medium |
| R10.3 | Defer socket disconnect entity cleanup to next tick start rather than processing it asynchronously. | Low |

---

## 11. Tick-Aligned Cooldowns & Timers

**Score: 9/10**

### Findings

**F11.1 — All combat cooldowns are tick-count based (Excellent)**
`packages/shared/src/constants/CombatConstants.ts`:
- `DEFAULT_ATTACK_SPEED_TICKS: 4` (2.4s)
- `COMBAT_TIMEOUT_TICKS: 17` (10.2s)
- `EAT_DELAY_TICKS: 3` (1.8s)
- Stored as absolute tick numbers: `nextAttackTick = currentTick + 4`
- No wall-clock timers for gameplay-critical cooldowns.

**F11.2 — Resource gathering uses tick-based timers (Good)**
Resource system's `processGatheringTick()` is called per tick by `GameTickProcessor`. Gathering progress advances deterministically per tick.

**F11.3 — Movement uses tiles-per-tick model (Good)**
`TileSystem.ts:28-29` — `TILES_PER_TICK_WALK = 2`, `TILES_PER_TICK_RUN = 4`. Movement speed is defined in tiles per tick, not tiles per second. Server-authoritative.

### Recommendations

No critical changes needed. The tick-aligned timer system is solid.

---

## 12. Memory & Allocation Hygiene

**Score: 7/10**

### Findings

**F12.1 — BFS pool reuses visited/parent/queue (Good)**
`packages/shared/src/systems/shared/movement/ObjectPools.ts` + `BFSPathfinder.ts:337` — Major data structures are pooled.

**F12.2 — GameTickProcessor pre-allocates buffers (Good)**
`GameTickProcessor.ts:200-214` — `_mobsBuffer`, `_playersBuffer`, `_damageToApply`, `_damageEventData` are all pre-allocated. Zero-allocation in steady state.

**F12.3 — Per-neighbor TileCoord allocation in BFS hot loop (Medium)**
`BFSPathfinder.ts:385-388` — 64K TileCoord objects per pathfind. Should use pre-allocated neighbors.

**F12.4 — Broadcast queue grows unboundedly within a tick (Low)**
`GameTickProcessor.ts:183,832` — `broadcastQueue` array grows per tick as broadcasts are queued, then cleared at flush. Under normal conditions this is fine, but a pathological tick with many broadcasts could cause a temporary allocation spike.

**F12.5 — Handler timings use shift() which is O(n) (Low)**
`TickSystem.ts:271` — `timings.shift()` is O(n) for array reindexing. For the 100-element cap this is negligible, but a circular buffer would be O(1).

### Recommendations

| # | Action | Priority |
|---|--------|----------|
| R12.1 | Pre-allocate 8 reusable `TileCoord` objects for BFS neighbor expansion. | Medium |
| R12.2 | Replace `timings.shift()` with a circular buffer or just track running sum/max. | Low |

---

## 13. Anti-Cheat & Input Validation

**Score: 8/10**

### Findings

**F13.1 — Server-authoritative pathfinding (Excellent)**
The server computes BFS paths. Client cannot influence path selection. Movement request only specifies destination; server decides the route.

**F13.2 — Tile-per-tick speed enforcement (Good)**
`MovementInputValidator.ts` and `MovementAntiCheat.ts` validate that entities don't exceed maximum tiles per tick.

**F13.3 — Rate limiting on movement and pathfind requests (Good)**
`SlidingWindowRateLimiter.ts` — 15 requests/sec sliding window for both move requests and pathfind requests. Prevents server overload from rapid-fire clicks.

**F13.4 — Input validation on move requests (Good)**
`tile-movement.ts:362-378` — Validates coordinate types, ranges, and NaN checks before processing.

### Recommendations

| # | Action | Priority |
|---|--------|----------|
| R13.1 | Add logging (throttled) when rate limiter drops requests, with player ID, for abuse detection. | Low |

---

## 14. Overall Assessment

| Category | Score |
|----------|-------|
| Click-to-Move Input | 6/10 |
| BFS Pathfinding | 7/10 |
| Tile Walkability | 5/10 |
| Click Destination Accuracy | 6/10 |
| Server Movement Execution | 7/10 |
| Client Interpolation | 8/10 |
| Tick Scheduling & Drift | 8/10 |
| Tick Processing Order | 9/10 |
| Tick Overrun Handling | 7/10 |
| Tick Reliability | 8/10 |
| Tick-Aligned Cooldowns | 9/10 |
| Memory & Allocation | 7/10 |
| Anti-Cheat & Validation | 8/10 |
| **Overall** | **7.3/10** |

### Summary

**Tick system is solid.** Self-correcting setTimeout, OSRS-accurate Henke's Model processing order, proper error isolation per handler, tick-count-based cooldowns, and pre-allocated buffers. The dual GameTickProcessor + TickSystem listener model needs a clear delineation audit, but the architecture is sound.

**Movement system has notable UX gaps.** The lack of client-side optimistic movement is the single biggest issue — every click has 50-150ms of dead time. Uncached slope calculations create server-side performance risk and likely cause false "non-walkable" reports. The stale BiomeType enum is a data bug with real gameplay consequences. BFS produces functional but unnatural-looking paths.

---

## 15. Critical Blockers

These must be addressed for production-quality movement:

1. **No client-side optimistic movement** — Every click waits for full network round-trip before character moves. This is the #1 player-facing quality issue.

2. **Uncached slope calculation** — 64,000 synchronous height lookups per pathfind on the tick thread. Under load with multiple concurrent pathfinds, this will stall ticks.

3. **Stale BiomeType enum** — "canyon" biome doesn't exist in manifest data. Tiles assigned this biome have corrupted walkability. Silent data bug.

---

## 16. Top 10 Priorities

Ranked by impact on player experience and system reliability:

| Rank | Issue | Category | Effort |
|------|-------|----------|--------|
| 1 | **Add client-side optimistic pathfinding** — run BFS locally, start walking on click, reconcile with server | Movement UX | Large |
| 2 | **Pre-cache slope walkability grid** — compute once at terrain gen, store per-tile boolean | Performance | Medium |
| 3 | **Fix BiomeType enum** to match biomes.json manifest | Data Bug | Small |
| 4 | **Replace BFS with A\* + string-pulling** for natural-looking player paths | Pathfinding UX | Medium |
| 5 | **Use Math.round for click→tile** — snap to nearest tile center instead of floor | Click Accuracy | Small |
| 6 | **Audit GameTickProcessor vs TickSystem listener overlap** — ensure no double-processing | Tick Correctness | Medium |
| 7 | **Reduce MOVE_SEND_COOLDOWN_MS** from 70ms to 30-40ms | Input Latency | Small |
| 8 | **Increase findNearestWalkable radius** from 5 to 15 tiles | Click Accuracy | Small |
| 9 | **Tune mountains maxSlope** from 0.5 to 0.65 | Walkability | Small |
| 10 | **Add TickSystem.stop() listener cleanup** for hot-reload safety | Tick Reliability | Small |
