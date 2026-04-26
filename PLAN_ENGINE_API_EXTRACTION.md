# Engine-API Extraction Plan

**Parent**: `PLAN_ENGINE_GAME_SEPARATION.md` criterion #2 — `@hyperforge/shared` should contain zero Hyperia-specific identifiers. As of 2026-04-26 (tip `3c7b6336f`), ~17,668 LOC of game-specific code has been migrated. The remaining ~10K LOC of game logic in `packages/shared/src/systems/server/network/` is blocked on a deeper refactor: the Pending\*/Follow managers' constructors take `ITileMovementManager`, and `TileMovementManager` itself takes a broadcast callback that uses `ServerNetwork.spatialIndex` + `ServerNetwork.broadcastManager` + `ServerNetwork.updatePlayerRegionSubscriptions`. Boot-order asymmetry (server: `register → plugin.onEnable → world.init()` vs PIE: `register → world.init() → plugin.onEnable`) means plugin-side construction can't depend on services that ServerNetwork creates during `init()`.

This plan extracts those services into engine-side substrate, pinned to the world before `plugin.onEnable` runs in either host. Once landed, Pending\*/Follow/TileMovement migration becomes a series of standard manual-lifecycle cuts using the pattern proven by TradingSystem (`f164d7e93`) and DuelSystem (`e70327f10`).

## Status

Drafted 2026-04-26.

**Phases A–F substantially complete** as of 2026-04-26 (tip: `b7fd7318a`).

- ✅ **Phase A** (substrate interfaces): `ISpatialIndex`, `IBroadcastService`, `IRegionSubscriptionService`, `ITileMovementService`, `IConnectionRegistry`, `ProcessingHandlerContext` — all in `packages/shared/src/systems/server/network/substrate/`
- ✅ **Phase B** (pin substrate to `world.X` early): SpatialIndex, BroadcastManager, RegionSubscriptionService, TileMovementManager — all 4 pinned in ServerNetwork constructor at register-time
- ✅ **Phase C** (refactor managers to consume `world.tileMovement`): 6 managers refactored
- ✅ **Phase D** (Pending*/Follow managers migrated): D1 PendingTradeManager, D2 PendingDuelChallengeManager, D3 PendingAttackManager, D4 PendingCookManager, D5 PendingGatherManager, D6 FollowManager, D7 FaceDirectionManager
- ✅ **Phase E** (TileMovementManager migrated): E1 TileMovementManager, E2 MobTileMovementManager
- ✅ **Phase F1+F2** (IConnectionRegistry substrate + pinning): shipped 2026-04-26
- 🟢 **Phase F3** (network handlers): **12/12 handler families addressed**. Done: chat, resources, magic, dialogue, entities, player, prayer, quest, processing, duel/* (5 files), trade/* (2 files), combat (style/retaliate split), home-teleport (substrate-promote with `IHomeTeleportManager` + factory). Remaining 2 blocked by engine coupling: combat (handleAttackPlayer/Mob — needs onAttackPlayer/Mob inline blocks moved plugin-side), friends (sendFriendsListSync/notifyFriendsOfStatusChange/getFriendIds called from shared internals — needs substrate-promote of those helpers).
- ⏳ **Phase G** (character-selection / initialization / save-manager / InteractionSessionManager, ~2149 LOC): needs `ISaveService` and `IDatabaseService` substrate first

Plugin tests stable at 187/187 throughout the phases A–F migrations.

## Coupling map (what's blocked, on what)

ServerNetwork.initializeManagers() currently constructs and owns:

```
SpatialIndex (concrete class, no interface)
  └─ updatePlayerPosition / getPlayersNear / region subscription diffing

BroadcastManager (IBroadcastManager interface exists; concrete impl in the
                  manager-factory)
  ├─ sendToAll / sendToNearby / sendToPlayer / sendToSocket
  └─ requires SpatialIndex via setSpatialIndex(...)

TileMovementManager(world, sendFn)
  ├─ sendFn closes over: spatialIndex.updatePlayerPosition,
  │  this.updatePlayerRegionSubscriptions (ServerNetwork instance method),
  │  broadcastManager.sendToNearby, broadcastManager.sendToAll
  └─ ServerNetwork wires anti-cheat kick callback after construction

MobTileMovementManager(world, ...similar shape)

PendingTradeManager(world, tileMovementManager)
PendingDuelChallengeManager(world, tileMovementManager)
PendingAttackManager(world, ..., tileMovementManager)
PendingCookManager(world, ..., tileMovementManager)
PendingGatherManager(world, ..., tileMovementManager, faceDirectionManager, ...)
FollowManager(world, tileMovementManager)
```

The Pending\*/Follow managers' only ServerNetwork-coupling is `tileMovementManager`. If TMM is constructible from world-level services alone, those managers become migratable.

TMM's only ServerNetwork-coupling is the broadcast callback. If broadcast + region-subscription updates are world-level services, TMM becomes constructible from world alone.

## Phase A — Substrate interfaces

Define engine-side interfaces in `packages/shared/src/systems/server/network/substrate/`:

**A1. `ISpatialIndex`** — already exists as a concrete class; just add an interface mirror.

```ts
// substrate/spatial-index.ts
export interface ISpatialIndex {
  updatePlayerPosition(playerId: string, worldX: number, worldZ: number): RegionChange | null;
  removePlayer(playerId: string): void;
  getPlayersNear(worldX: number, worldZ: number): readonly string[];
  getPlayerRegionKey(playerId: string): number | undefined;
  getRegionTopic(regionKey: number): string;
  getAdjacentRegionKeys(worldX: number, worldZ: number): readonly number[];
  getAdjacentRegionKeysFromKey(regionKey: number): readonly number[];
  getRegionSubscriptionDiff(/* ... */): { subscribe: number[]; unsubscribe: number[] };
}
```

**A2. `IBroadcastService`** — already exists as `IBroadcastManager` in `network/interfaces.ts`. Rename to `IBroadcastService` for clarity (it's not a "manager" — it's a substrate service) and re-export under both names for back-compat.

**A3. `IRegionSubscriptionService`** — extracts ServerNetwork's `updatePlayerRegionSubscriptions` private method. The pubsub-topic subscription management lives at the engine substrate level.

```ts
// substrate/region-subscription-service.ts
export interface IRegionSubscriptionService {
  /** Update the pubsub subscriptions for a player whose region changed. */
  updatePlayerRegionSubscriptions(
    playerId: string,
    oldKey: number,
    newKey: number,
  ): void;
}
```

**A4. `ITileMovementService`** — engine-side movement primitives that don't need game-specific state. The current `TileMovementManager` mixes movement primitives + game-specific concerns (XP-on-arrival, combat-follow, pending-attack walks). The substrate version exposes only:

```ts
// substrate/tile-movement-service.ts
export interface ITileMovementService {
  movePlayerToward(
    playerId: string,
    targetX: number,
    targetZ: number,
    options?: { runMode?: boolean; onArrived?: () => void },
  ): void;
  cancelMove(playerId: string): void;
  getPathTo(/* ... */): readonly TileCoord[];
  isAdjacentTo(playerId: string, targetX: number, targetZ: number): boolean;
}
```

The game-specific logic stays with `TileMovementManager` in the plugin (post-migration); `TileMovementManager` consumes `ITileMovementService` via lookup.

**Risk note**: Phase A is pure interface definition — no behavior change. Each interface should ship in its own commit with a unit test that exercises ServerNetwork's concrete instance against the interface contract.

## Phase B — Pin substrate to `world.X` early

Plugin onEnable runs at different phases on server vs PIE. To unblock, the substrate services must exist on `world.X` BEFORE plugin.onEnable in both hosts.

Two options:

**B-Option-1 (Recommended)**: Construct substrate in ServerNetwork's CONSTRUCTOR rather than `init()`. ServerNetwork is `world.register("network", ServerNetwork)` — its constructor runs synchronously when registered. Both server (registers before onEnable) and PIE (registers before world.init()) call the constructor BEFORE plugin onEnable.

```ts
// ServerNetwork.constructor:
constructor(world: World) {
  this.world = world;
  // Substrate construction — must happen before any consumer reads
  // these from world.X. Plugin onEnable runs next (server) or later
  // (PIE), but in either case the world props are populated.
  this.spatialIndex = new SpatialIndex();
  this.broadcastService = new BroadcastService(/*...*/);
  this.regionSubscriptions = new RegionSubscriptionService(/*...*/);
  this.tileMovementService = new TileMovementService(world, this.broadcastService, this.spatialIndex, this.regionSubscriptions);

  (world as { spatialIndex?: ISpatialIndex }).spatialIndex = this.spatialIndex;
  (world as { broadcast?: IBroadcastService }).broadcast = this.broadcastService;
  (world as { regionSubscriptions?: IRegionSubscriptionService }).regionSubscriptions = this.regionSubscriptions;
  (world as { tileMovement?: ITileMovementService }).tileMovement = this.tileMovementService;
}
```

**B-Option-2**: Move substrate creation to a separate `EngineNetworkSubstrate` system that registers BEFORE ServerNetwork. Cleaner separation but adds a new system.

**Decision**: B-Option-1 first (smaller diff). Refactor to B-Option-2 in a follow-up if the constructor grows unwieldy.

**Migration step within Phase B**:

1. Move `SpatialIndex` instance from `init()` to constructor.
2. Pin to `world.spatialIndex`.
3. Same for BroadcastService.
4. Extract `updatePlayerRegionSubscriptions` from ServerNetwork into a new `RegionSubscriptionService` class that holds the same per-socket subscription state. ServerNetwork delegates to it.
5. Extract movement primitives from `TileMovementManager` into a new `TileMovementService` (engine-side). TMM keeps the game-specific layer on top.
6. Pin all four to `world.X`.

**Verification**: All existing tests (server integration, PIE) must pass without changes. ServerNetwork's public API stays identical.

## Phase C — Refactor TileMovementManager and game managers to consume substrate

After Phase B, ServerNetwork's `initializeManagers()` constructs:
- `TileMovementManager(world, world.broadcast.sendToAll, world.tileMovement)` — TMM still owns game-specific logic but consumes substrate via world.X
- `PendingTradeManager(world, world.tileMovement)` — depends on substrate, not TMM
- `PendingDuelChallengeManager(world, world.tileMovement)` — same
- etc.

This step rewrites the constructor signatures of Pending\*/Follow managers from `(world, tileMovementManager: ITileMovementManager)` to `(world, tileMovement: ITileMovementService)` (or just `(world)` and lookup via `world.tileMovement` at use-site).

**Verification**: All existing tests pass. ServerNetwork still owns Pending\*Manager construction.

## Phase D — Migrate Pending\*/Follow managers to plugin

With Phase C complete, the managers depend only on world-level substrate services. Each can migrate independently using the manual-lifecycle pattern:

1. Move file to `packages/hyperscape-plugin/src/systems/Pending*Manager.ts`.
2. Plugin onEnable's server-only branch:
   ```ts
   const pendingTradeManager = new PendingTradeManager(ctx.world);
   (ctx.world as { pendingTradeManager?: PendingTradeManager }).pendingTradeManager = pendingTradeManager;
   ctx.scope.register(() => {
     pendingTradeManager.destroy?.();
     delete (ctx.world as { pendingTradeManager?: PendingTradeManager }).pendingTradeManager;
   });
   ```
3. ServerNetwork.initializeManagers() removes the construction; tick callbacks resolve via `world.pendingTradeManager` lookup.
4. Boot order: PIE creates substrate (in ServerNetwork constructor) BEFORE plugin.onEnable runs (after world.init()). Server creates substrate (constructor) BEFORE plugin.onEnable. Both work.
5. Server boot has plugin.onEnable BEFORE world.init() — so plugin can construct PendingTradeManager during onEnable, world.tileMovement is already populated (via ServerNetwork constructor at register time).

**Per-cut LOC** (using the manual-lifecycle pattern):
- PendingTradeManager (~225)
- PendingDuelChallengeManager (~225)
- PendingAttackManager (~398)
- PendingCookManager (~394)
- PendingGatherManager (~632)
- FollowManager (~263)
- FaceDirectionManager (~482) — used by PendingGatherManager + tile-movement; co-migrate

**Total: ~2619 LOC** drained in Phase D.

## Phase E — Migrate TileMovementManager to plugin

With game-specific managers out of the way, TMM is the next cut. Its constructor now takes `world` + reads substrate via `world.broadcast` / `world.tileMovement` / `world.spatialIndex`. It's a straight manual-lifecycle migration.

**Per-cut LOC**: TileMovementManager (~2129) + MobTileMovementManager (~1466) = **~3595 LOC**.

## Phase F — Migrate network handlers via IConnectionRegistry

Network handlers (`network/handlers/{trade,duel,quest,prayer,combat,...}/`) are functions registered via `socketManager.on("event-name", handler)`. To migrate them, ServerNetwork needs to expose an `IConnectionRegistry`:

```ts
// substrate/connection-registry.ts
export interface IConnectionRegistry {
  registerHandler<T>(eventName: string, handler: (socket: ServerSocket, data: T) => void): () => void; // returns unregister fn
}
```

Plugin onEnable then:

```ts
const registry = ctx.world.connectionRegistry as IConnectionRegistry;
ctx.scope.register(registry.registerHandler("trade-request", handleTradeRequest));
ctx.scope.register(registry.registerHandler("trade-respond", handleTradeRespond));
// ... etc
```

**Per-cut LOC**: handlers/{trade, duel, quest, prayer, magic, combat, processing, resources, friends, home-teleport, dialogue, entities, player, chat} = **~3657 LOC**.

## Phase G — Migrate character-selection / initialization / save-manager

These are tightly bound to ServerNetwork's DB layer (`saveManager`, `dbContext`). They're game-specific logic but consume engine substrate (DB, sockets). Migration path:

1. Define `ISaveService` engine substrate interface.
2. Pin save service to `world.save` early.
3. Migrate save logic to plugin via the substrate.

**Per-cut LOC**: character-selection (~1383) + initialization (~163) + save-manager + InteractionSessionManager (~437) = **~2000 LOC**.

## Aggregate impact

| Phase | LOC unblocked | Sessions |
|---|---:|---|
| A — Define interfaces | 0 (substrate prep) | 0.5 |
| B — Pin to world.X early | 0 (substrate prep) | 1 |
| C — Refactor consumers | 0 (preserves behavior) | 0.5 |
| D — Pending\*/Follow migration | ~2619 | 2 |
| E — TileMovement migration | ~3595 | 1 |
| F — Network handlers migration | ~3657 | 2–3 |
| G — character-selection / save | ~2000 | 1 |

**Total unlocked**: ~11,871 LOC, across ~8 sessions.

After this plan completes, `@hyperforge/shared` retains only:
- Engine substrate (World, Stage, Physics, EventBus, etc.)
- Substrate services (SpatialIndex, BroadcastService, TileMovementService, RegionSubscriptionService, ConnectionRegistry, SaveService)
- Manifest registries (already substrate)
- Type-only re-exports

Plus criterion #2 of `PLAN_ENGINE_GAME_SEPARATION.md` is satisfied: zero Hyperia-specific identifiers in shared.

## Implementation order

Each phase ships one or more commits. Suggested sequencing:

1. **Phase A1 (ISpatialIndex)** — small, focused. Unit-test the contract.
2. **Phase A2 (IBroadcastService)** — interface already exists; rename + alias.
3. **Phase A3 (IRegionSubscriptionService)** — extract `updatePlayerRegionSubscriptions` from ServerNetwork.
4. **Phase A4 (ITileMovementService)** — design carefully; the largest interface.
5. **Phase B (constructor pinning)** — single commit, migrates 4 services to constructor.
6. **Phase C (consumer refactor)** — should be mostly mechanical given Phase B.
7. **Phase D, one cut per Pending\*/Follow manager** — 6–7 commits.
8. **Phase E (TMM + MobTMM)** — 1–2 commits.
9. **Phase F handlers** — one cut per handler family (3–5 commits).
10. **Phase G** — character-selection + save + initialization (2–3 commits).

## Risks and watch-outs

1. **Boot-order regressions** — every commit MUST run both server boot AND PIE boot (PIEEditorSession) before merging. Plugin tests alone don't catch the asymmetry.
2. **uWebSockets pubsub** — ServerNetwork's region subscription updates use uWS-specific topic subscribe/unsubscribe. The IRegionSubscriptionService must hide that from substrate-level callers; only ServerNetwork's concrete impl knows about uWS.
3. **TileMovementManager state** — TMM holds per-player movement state (current path, target, runMode). ITileMovementService is stateless from the substrate's POV; TMM's stateful layer stays in plugin post-migration.
4. **Anti-cheat callback** — TMM's `setAntiCheatKickCallback` requires socket access. Plugin's TMM consumes `world.broadcast.getPlayerSocket(playerId)` (already on IBroadcastManager).
5. **Handler-registration timing** — Phase F's IConnectionRegistry must accept handlers registered AFTER `ServerNetwork.start()` completes (because plugin.onEnable might run after start in PIE). The current `socketManager.on()` registration happens during `initializeManagers()` — confirm it works post-init.
6. **Type-only `extends System`** — substrate interfaces like ITileMovementService should NOT extend `System` (the System base class is engine implementation detail). Keep them as plain duck-types — same lesson as the DuelSystem migration.

## Out of scope

- Refactoring `TileSystem` (collision matrix) — it's already engine-side and stays.
- Refactoring `World.ts` constructor — substrate services attach to world but World itself stays minimal.
- Renaming `BroadcastManager` → `BroadcastService` in places outside the interface — back-compat aliases keep that contained.
- Changing the wire protocol — pure relocation, no semantic changes.

## Success criteria

- All 8 phases ship with green plugin tests + green server integration tests + green PIE roundtrip tests.
- After Phase G, a fresh search for `Goblin|Bandit|hyperia|Hyperia|prayer|woodcutting|fishing` in `packages/shared/src/` returns zero hits in non-substrate, non-test files (only substrate registries and type files keep these as authored-data references).
- `@hyperforge/shared` package size decreases by ~11–12K LOC.
- No new circular dependencies between shared and hyperscape-plugin.
