# ServerNetwork → @hyperforge/shared Migration Plan

**Parent plan**: `PLAN_ENGINE_GAME_SEPARATION.md` Phase 3 (real loopback PIE)
requires asset-forge to drive the real `ServerNetwork` via `InMemorySocket`.
Since asset-forge cannot depend on the server package (UI package ⊄ server
runtime), `ServerNetwork` and its transitive deps must relocate to
`@hyperforge/shared`.

## Status

Driven by Task #25. Started 2026-04-17.

## Invariants (do not violate)

1. **Server package tests stay green at every commit**. Every incremental
   file move must leave `packages/server` type-clean and test-passing.
2. **No new code in shared depends on the server package**. Direction is
   strictly `server → shared`, never the reverse.
3. **External integrations (DB, Privy, uWS, Eliza, streaming) stay in
   server**. Shared receives **interfaces**; server provides
   implementations.
4. **No behavior changes**. This is a pure relocation + interface extract.
   Any logic change happens in a follow-up PR.
5. **Re-export shims in server** for every moved symbol until all imports
   are migrated. Shims get deleted in a final sweep.

## External dependency inventory (what ServerNetwork imports from outside its directory)

### Strictly server-only (need interfaces)

| Dep | Real impl location | Interface name |
|-----|-------------------|----------------|
| `database/repositories/BankRepository` | server | `IBankRepository` |
| `database/repositories/CharacterRepository` | server | `ICharacterRepository` |
| `database/repositories/InventoryRepository` | server | `IInventoryRepository` |
| `database/repositories/FriendRepository` | server | `IFriendRepository` |
| `database/schema` (Drizzle) | server | row/column type exports mirrored in shared |
| `eliza` (AgentManager) | server | `IAgentManager` |
| `eliza/ModelAgentSpawner` | server | `IAgentSpawner` |
| `streaming/stream-viewer-access-token` | server | `IStreamingAccessTokens` |
| `streaming/streaming-policy` | server | config constant moved to shared |
| `shared/utils` (JWT) | server | `IAuthService` (verify/sign) |
| `startup/UwsWebSocketAdapter` | server | already `NodeWebSocket` interface in shared |

### Already movable (server-local code not tied to external integrations)

| Dep | Destination |
|-----|-------------|
| `services/AuditLogger` | `shared/systems/server/services/AuditLogger` |
| `services/Logger` | `shared/systems/server/services/Logger` |
| `services/RateLimitService` | `shared/systems/server/services/RateLimitService` |
| `services/InputValidation` | `shared/systems/server/services/InputValidation` |
| `shared/errMsg` | `shared/systems/server/errMsg` (rename to avoid confusion) |
| `shared/types` (ServerSocket, SpawnData, ChatMessage, SystemDatabase) | split: ServerSocket/ChatMessage/SpawnData → shared; SystemDatabase → interface |
| `TickSystem` | `shared/systems/server/TickSystem` |
| `DuelSystem`, `TradingSystem` | `shared/systems/server/{Duel,Trading}System` |
| `PendingDuelChallengeManager`, `PendingTradeManager` | already in `ServerNetwork/` dir, move with it |

## Migration order (bottom-up, always leaving server green)

### Step 1: Zero-dep leaves (pure utility modules)
Move these first — they have no external deps and unlock everything else:
- `SpatialIndex.ts` + test
- `BandwidthBudget.ts`
- `ScriptQueue.ts`
- `services/SlidingWindowRateLimiter.ts`
- `services/IntervalRateLimiter.ts`

**Leave a re-export shim** in the old location for each.

### Step 2: Server-local services (no DB/Privy/Eliza)
- `services/Logger`
- `services/AuditLogger`
- `services/InputValidation`
- `services/ValidationService`
- `services/RateLimitService`
- `services/IdempotencyService`

### Step 3: Extract interfaces for external integrations
Create `shared/systems/server/interfaces.ts` with:
- `IBankRepository`, `ICharacterRepository`, `IInventoryRepository`, `IFriendRepository`
- `IAgentManager`, `IAgentSpawner`
- `IStreamingAccessTokens`
- `IAuthService`

In the server package, assert real repositories/services implement these
interfaces (`const _: IBankRepository = new BankRepository(...)`).

### Step 4: Server-domain systems
Move, in dependency order:
- `TickSystem`
- `TradingSystem`, `DuelSystem`

### Step 5: ServerNetwork handlers (~40 files)
Move handler modules, rewriting their imports to use the interfaces from
Step 3 instead of concrete server classes. Repository access becomes
`this.world.getSystem('bank-repo') as IBankRepository` or similar.

### Step 6: ServerNetwork core
Move `index.ts` (4000 lines), `connection-handler.ts`, `socket-management.ts`,
pending managers, tile-movement, movement/, FollowManager, FaceDirectionManager,
InteractionSessionManager, position-validator, save-manager.

### Step 7: Wire real implementations
In `packages/server/src/systems/registerServerNetwork.ts`:
- Instantiate concrete repos/services
- Register them on the world as systems implementing the interfaces
- Register ServerNetwork itself

### Step 5d: DB abstraction (CURRENT BLOCKER)
Roughly 8000+ lines of DB-coupled handlers and several ServerNetwork core
files (`event-bridge.ts`, `duel-settlement.ts`, most `handlers/bank/*`,
`handlers/store.ts`, `handlers/trade/items.ts`+`swap.ts`,
`handlers/inventory.ts`, `handlers/action-bar.ts`,
`handlers/common/transaction.ts`, `handlers/common/types.ts`
`BaseHandlerContext`) cannot move until we abstract:

1. **Transaction wrapper**: `executeSecureTransaction` currently exposes
   `DrizzleTransaction` + raw `sql\`...\`` tagged templates. Options:
   (a) refactor all handlers to use high-level repo method calls + a
   transaction-token-only abstraction; (b) define an opaque `ITxQuery`
   with `.execute(sqlFragment)` and duplicate SQL fragments at boundary.
   (a) is cleaner but larger-scope.
2. **Write methods on existing repo interfaces**: extend `IBankRepository`,
   `IInventoryRepository`, `ICharacterRepository`, `IFriendRepository` with
   every write method ServerNetwork currently calls. Each is grep-verifiable.
3. **Transaction-scoped repo variants**: repositories need to accept a
   transaction token so they can participate in `executeSecureTransaction`.

This is architectural — do NOT attempt piecemeal. Land it as one PR with
all existing handlers migrated to the new abstractions, then resume
ServerNetwork file moves.

### Step 5d alternative: Keep SQL-heavy handlers server-side (recommended)

After surveying the remaining handlers, the cheapest unblock path is:

- **Do NOT move DB-coupled handlers into shared**. `handlers/bank/*`,
  `handlers/store.ts`, `handlers/trade/{items,swap}.ts`, `handlers/inventory.ts`,
  `handlers/action-bar.ts`, `handlers/commands.ts`, `handlers/common/{transaction,types}.ts`,
  `event-bridge.ts`, and `duel-settlement.ts` stay in server — they import
  `drizzle-orm`, `pg`, and the server-local schema, which shared must
  remain free of.

- **Instead, introduce a `IPacketHandlerRegistry` bridge system** that
  lives on the world. The server package registers concrete packet
  handlers (the functions currently imported into `ServerNetwork/index.ts`);
  shared-side `ServerNetwork` looks them up via
  `world.getSystem("packet-handlers")` and dispatches packets through
  that registry.

- This converts every handler import in `ServerNetwork/index.ts` from a
  static import into a world-system lookup. `index.ts` no longer imports
  server-specific handler modules, so it can move to shared.

- The PIE case benefits automatically: PIE registers a minimal
  `PacketHandlerRegistry` implementation that stubs out or no-ops the
  gameplay-heavy packets (bank, store, trade) and only implements what
  the editor needs (movement, chat, interaction). Real production keeps
  the full server-side registry.

**Remaining work under this alternative**:
1. ✅ Define `IPacketHandlerRegistry` interface in shared with every packet
   name → handler-function signature ServerNetwork currently dispatches.
2. ✅ Implement `PacketHandlerBridgeSystem` in server that exposes the
   existing handler functions through the registry.
3. ✅ Register it in `startup/world.ts`.
4. ✅ **Dispatch path now consults the registry first** in
   `ServerNetwork/index.ts::onMessage`:
   `const handler = this.getPacketRegistryHandler(method) ?? this.handlers[method];`
   This dual-path lets individual handlers be migrated out of the static
   `registerHandlers()` method one at a time without risk. Once every entry
   in `registerHandlers()` has been moved to a registry-based
   `packetRegistry.register(name, fn)` call in server startup code, the
   static dict (and the 25+ handler imports that populate it) can be
   deleted — at which point the file becomes import-free of server-specific
   handler modules.
5. 🔄 Incrementally migrate each packet from `this.handlers[name] = ...` in
   `ServerNetwork/index.ts::registerHandlers()` to
   `packetRegistry.register(name, ...)` in a server-side wiring module.
   - ✅ Wiring module created:
     `packages/server/src/startup/packetHandlerRegistration.ts` is invoked
     from `startup/world.ts` immediately after world initialization.
   - ✅ Migrated handlers (175 registry registrations covering ~185 of
     ~200 legacy assignment lines):
     - **Trivial / world-only**: `onPing`, `onEntityEvent`, `onEntityRemoved`,
       `onResourceGather`, `onKeepalive` (+ `keepalive` alias, no-op).
     - **Needs `BroadcastManager`** (via
       `ServerNetwork.getBroadcastManager()`): `onChatAdded`,
       `onEntityModified`, `onSettingsModified`.
     - **Processing/skill batch** (needs `ProcessingHandlerContext` via
       `ServerNetwork.getProcessingHandlerContext()`):
       `onResourceInteract`, `onCookingSourceInteract`,
       `onFiremakingRequest` (+ `firemakingRequest`),
       `onCookingRequest` (+ `cookingRequest`), `onSmeltingSourceInteract`,
       `onSmithingSourceInteract`, `onProcessingSmelting`,
       `onProcessingSmithing`, `onCraftingSourceInteract`,
       `onProcessingCrafting`, `onFletchingSourceInteract`,
       `onProcessingFletching`, `onProcessingTanning`,
       `onRunecraftingAltarInteract` (+ `runecraftingAltarInteract`).
     - **Bank batch** (world-only): every `onBank*` + every `bank*` alias,
       plus `onRequestBankState` (+ `requestBankState`).
     - **Dialogue**: `onDialogueResponse`, `onDialogueContinue`,
       `onDialogueClose`.
     - **Quest list/detail**: `onGetQuestList` (+ `getQuestList`),
       `onGetQuestDetail` (+ `getQuestDetail`).
     - **Combat-style toggles**: `onChangeAttackStyle`,
       `onSetAutoRetaliate`.
     - **Inventory**: `onPickup`, `onDrop`, `onEquip`, `onUse`, `onUnequip`,
       `onMoveInventoryItem`, `onCoinPouchWithdraw`, `onXpLampUse`.
     - **Prayer**: `onPrayerToggle` (+ `prayerToggle`),
       `onPrayerDeactivateAll` (+ `prayerDeactivateAll`),
       `onAltarPray` (+ `altarPray`).
     - **Magic**: `onSetAutocast` (+ `setAutocast`).
     - **Action bar**: `onActionBarSave` (+ `actionBarSave`),
       `onActionBarLoad` (+ `actionBarLoad`).
     - **Corpse loot**: `onCorpseLootAll` (+ `corpseLootAll`).
     - **Death / respawn**: `onRequestRespawn`.
     - **Home teleport**: `onHomeTeleport`, `onHomeTeleportCancel`.
     - **Character selection**: `onCharacterListRequest`,
       `onCharacterCreate`, `onCharacterSelected`.
     - **Player name change**: `onChangePlayerName`.
     - **NPC / entity interact**: `onNpcInteract` (+ `npcInteract`),
       `onEntityInteract` (+ `entityInteract`).
     - **Quest mutations**: `onQuestAccept`, `onQuestAbandon`,
       `onQuestComplete`.
     - **Store**: `onStoreOpen`, `onStoreBuy`, `onStoreSell`, `onStoreClose`.
     - **Trade** (DB-coupled via `getDatabase(world)`): `onTradeRequest`,
       `onTradeRequestRespond`, `onTradeAddItem`, `onTradeRemoveItem`,
       `onTradeSetItemQuantity`, `onTradeAccept`, `onTradeCancelAccept`,
       `onTradeCancel` (+ all legacy aliases).
     - **Duel** (DB-coupled): `onDuelChallenge`, `onDuelChallengeRespond`,
       `onDuelToggleRule`, `onDuelToggleEquipment`, `onDuelAcceptRules`,
       `onDuelCancel`, `onDuelAddStake`, `onDuelRemoveStake`,
       `onDuelAcceptStakes`, `onDuelAcceptFinal`, `onDuelForfeit`
       (+ `duel:*` alias pairs).
     - **Friends / ignore / PM**: `onFriendRequest`, `onFriendAccept`,
       `onFriendDecline`, `onFriendRemove`, `onIgnoreAdd`, `onIgnoreRemove`,
       `onPrivateMessage`.
   - ❌ Remaining handlers (15 lines): `enterWorld` + `onEnterWorld`
     (reconnect-aware handshake), `onCommand`, `onMoveRequest`, `onInput`,
     `onAttackMob`, `onAttackPlayer`, `onFollowPlayer`, `onClientReady`,
     `onSyncGoal`, `onSyncAgentThought`. These all close over
     ServerNetwork-internal managers/state
     (`tileMovementManager`, `pendingAttackManager`, `actionQueue`,
     `followManager`, agent static maps, connection-handler internals).
     None of them pull drizzle/pg/schema imports into ServerNetwork — they
     can move with the class when `ServerNetwork/index.ts` relocates to
     shared (Step 6). No further handler migration is required before Step 6.
6. Move `ServerNetwork/index.ts` to shared (Step 6).

This unblocks Step 6 without the ~8000-line refactor and keeps
drizzle/pg out of shared, preserving the engine-agnostic boundary.

### Step 5e: Eliza/JWT world-system wiring (blocks `character-selection.ts`)
`character-selection.ts` (1368 lines, DB=0) directly imports
`getAgentManager` and `getAgentRuntimeByCharacterId`. Before migrating:
1. Register server-side `AgentManager` as `world.getSystem("agent-manager")`
   satisfying `IAgentManager`.
2. Register `getAgentRuntimeByCharacterId` wrapper as
   `world.getSystem("agent-runtime-lookup")` satisfying
   `IAgentRuntimeLookup`.
3. Replace top-level imports in `character-selection.ts` with
   `world.getSystem(...)` lookups.
4. `DatabaseSystemOperations` (async player/equipment/inventory readers)
   can be added as an extension to `IDatabaseSystem` in shared interfaces.

### Step 8: Delete re-export shims
Sweep the old `packages/server/src/systems/ServerNetwork/` directory —
it should be empty except for the registration module.

### Step 9: Wire PIE to use real ServerNetwork
In shared, build `PIEServerSession` that:
- Creates a server `World` via `createServerWorld()`
- Registers stub `IBankRepository` etc. (in-memory maps)
- Registers `ServerNetwork`
- Accepts an `InMemorySocket` via `network.onConnection(socket, params)`

Then point `usePIESession.ts` at `PIEServerSession` and delete
`createPlayTestWorld.ts` + `PIENetworkStub`.

**Step 9 — PARTIAL (2026-04-18 19:03 EDT)**:
- ✅ `InMemoryStubs.ts` — 14 narrow-interface stubs + `createPIEStubSystemDatabase()`
- ✅ `PIEBridgeSystems.ts` — 8 `SystemBase` adapters + `registerPIEBridges(world)`
- ✅ `createPIEServerWorld.ts` — minimal server-world factory (skips procgen/towns/POI/docks/livekit/bot)
- ✅ `PIEServerSession.ts` — composes world + bridges + `ServerNetwork` + `InMemorySocketPair`
- ✅ `PIELoopbackConnectionHandler` (replaces `PIENoopConnectionHandler`) — wraps `InMemorySocket` in real `Socket`, registers in `ServerNetwork.sockets` with a synthetic `accountId` (from `ConnectionParams.characterId` or uuid). No Privy auth, no snapshot send, no player-entity creation (editor owns those).
- ✅ 20 unit + integration tests green: bridges, lifecycle guards, `SystemDatabase` stub, real `start()` + `connect()`, socket registration, server→client packet roundtrip via `sendPacket`, clean disconnect teardown (`Socket.onClose` → `SocketManager.handleDisconnect` → `sockets.delete`).
- ✅ Commits `054588a48` (foundation) + `79822c7ef` (loopback handler).

**Step 9 — REMAINING** (next phase, not blocking migration):
- ⏳ Editor repoint (`usePIESession.ts`): depends on `PlayTestWorld`'s lightweight entity map (`entities.values()`), simulate mode, per-entity script-graph injection, `interactWith()`, `gameMode`, `isRunning`, debug sink. `PIEServerSession` wraps a real server world whose entity/gameplay surface is different — repoint requires either a compatibility façade or an editor rework that consumes the real ECS via `ClientNetwork`-over-`InMemorySocket`.
- ⏳ `ClientNetwork` PIE-friendliness: real client currently expects a `wsUrl` and constructs its own WebSocket; PIE needs it to accept a pre-connected `InMemorySocket` so the editor can speak to `PIEServerSession` over the same code path the live client uses.
- ⏳ Delete `createPlayTestWorld.ts` + `PIENetworkStub`: blocked on editor repoint above.

## Per-step checklist

At every step:
1. `cd packages/shared && bun run build` passes
2. `npx tsc --noEmit --project packages/server/tsconfig.json` passes
3. `bunx vitest run packages/server/src/systems/ServerNetwork/__tests__/` passes
4. `bunx vitest run packages/shared/src/platform/shared/__tests__/ packages/shared/src/gameMode/__tests__/` passes
5. Commit with a message like `refactor(engine): move <X> into shared (step N/9)`

## Risks and mitigations

- **Drizzle schema circular coupling**: repositories currently import the
  schema from `server/database/schema`. Interface approach avoids moving
  schema; repositories can keep importing it, only their interfaces move.
- **Eliza agent manager**: depends on heavy LLM machinery. Interface must
  cover only the methods ServerNetwork actually calls — grep first, keep
  minimal.
- **uWS adapter**: `NodeWebSocket` interface in shared already exists and
  the uWS adapter already conforms. No work needed here.
- **Test moves**: each `__tests__/*.test.ts` moves alongside its source —
  colocation stays intact.

## Current status (2026-04-18)

**Baseline**: shared=1 pre-existing type error, server=122 pre-existing. No
regressions introduced by migration work.

**Completed**:
- Step 1 zero-dep leaves ✅
- Step 2 server-local services ✅ (incl. `PublicUrls.ts` in latest pass)
- Step 3 narrow interfaces ✅
- Step 4 server-domain systems ✅
- Step 5 (partial): `handlers/processing.ts`, all 5 DB-free
  `handlers/duel/*` (challenge/combat/confirmation/helpers/rules),
  `handlers/trade/{helpers,request}.ts`, plus ServerNetwork/network leaves
  (save-manager, initialization, tile-movement, mob-tile-movement,
  movement/, etc.) ✅

**Blocked on Step 5d (DB abstraction)**:
- `handlers/common/{transaction,types}.ts` (Drizzle + pg)
- `handlers/{action-bar,commands,inventory,store}.ts`
- `handlers/bank/*` (except types/index barrel)
- `handlers/trade/{acceptance,items,swap,types}.ts`
- `handlers/duel/stakes.ts`
- `event-bridge.ts`, `duel-settlement.ts`, `ServerNetwork/index.ts`

**Step 5e COMPLETE for character-selection.ts** (2026-04-18 12:45 EDT):
- `IDatabaseSystem` extended with full async reader + passthrough surface:
  `getPlayerAsync`, `getPlayerInventoryAsync`, `getPlayerEquipmentAsync`,
  `getCharactersAsync`, `createCharacter`, `getDb` (returns `unknown` as
  Drizzle escape hatch). New `EquipmentSlotRow` + widened `PlayerDataRow`.
- `AgentBridgeSystems` registered in `startup/world.ts`:
  `AgentManagerBridgeSystem` (satisfies `IAgentManager` via
  `getAgentManager().hasAgent(...)`) and
  `AgentRuntimeLookupBridgeSystem` (satisfies `IAgentRuntimeLookup`).
- `character-selection.ts` (1372 lines) moved to
  `packages/shared/src/systems/server/network/character-selection.ts`.
  Server file is now a re-export shim from `@hyperforge/shared`.
- Shared barrel exports added: `loadCharacterList`,
  `handleCharacterListRequest`, `handleCharacterCreate`,
  `handleCharacterSelected`, `collectInitialSyncEntities`,
  `handleEnterWorld`.
- Type check: shared=1 pre-existing, server=122 unchanged. No regressions.

**Step 5e JWT wiring infrastructure** (2026-04-18 12:50 EDT):
- `AuthBridgeSystem` (`packages/server/src/systems/AuthBridgeSystem/`)
  created — wraps `createJWT` / `verifyJWT` as a `SystemBase` satisfying
  `IAuthService`. Registered as `world.getSystem("auth")` in
  `startup/world.ts`. Compile-time assertion added to
  `__interface_assertions__.ts` (`_AuthBridge`).

**Still blocked on Step 5e (authentication.ts migration)**:
- `authentication.ts` (430 lines) still couples on Privy provider +
  knex-style SystemDatabase for ban queries. JWT piece is now abstracted
  via world system, but Privy and ban-checking DB access need separate
  abstractions (likely `IPrivyProvider` interface + `IBanRepository`).
  Only consumer is `connection-handler.ts` which is permanently
  server-only, so this migration yields limited value until the broader
  Step 5d DB abstraction lands.

**Permanently server-only** (uWS transport, cannot relocate):
- `broadcast.ts`, `connection-handler.ts`, `__interface_assertions__.ts`

**Step 6 prep — narrow-interface decoupling** (2026-04-18 4:25 EDT):
- `IBroadcastManager` (shared) expanded from 4 methods to 8, covering
  `sendToSocket`, `sendToSpectators`, `sendToNearby`, `drainSendTimeMs`,
  `drainPubsubStats` — the full surface ServerNetwork consumes.
- Compile-time assertion `_Broadcast = Assert<BroadcastManager,
  IBroadcastManager>` added to `__interface_assertions__.ts`.
- `ServerNetwork.getBroadcastManager()` return type widened from concrete
  `BroadcastManager` to `IBroadcastManager`. `ServerNetwork` still
  imports and instantiates the concrete class internally, but external
  consumers (`packetHandlerRegistration.ts`, future shared-side code)
  see only the interface. When ServerNetwork moves to shared in Step 6,
  the concrete construction can be relocated to a server-side
  `BroadcastBridgeSystem` (same pattern as `AuthBridgeSystem`,
  `PacketHandlerBridgeSystem`).
- Server TS errors: 122 (unchanged). Shared TS errors: 1 (unchanged).

**Step 6 prep — IEventBridge decoupling** (2026-04-18 4:38 EDT):
- `IEventBridge` interface added to
  `packages/shared/src/systems/server/network/interfaces.ts` —
  exposes only the two lifecycle methods ServerNetwork calls on the
  concrete class: `setupEventListeners()` and `destroy()`.
- Compile-time assertion `_EventBridgeAsserts = Assert<EventBridge,
  IEventBridge>` added to `__interface_assertions__.ts` so any
  signature drift in the concrete `EventBridge` surfaces at the
  boundary rather than at the ServerNetwork call sites.
- `ServerNetwork.eventBridge` field typed as `IEventBridge` instead of
  `EventBridge`. The concrete `new EventBridge(...)` construction
  remains inside `ServerNetwork` (still imports `BankRepository`, pg,
  drizzle transitively); when ServerNetwork moves to shared in Step 6,
  this construction relocates to a server-side
  `EventBridgeBridgeSystem` (same pattern as `AuthBridgeSystem`).
- Server TS errors: 122 (unchanged). Zero regressions.

**Step 6 prep — IConnectionHandler decoupling** (2026-04-18 4:49 EDT):
- `IConnectionHandler` interface added to shared `interfaces.ts` —
  exposes `setSpatialIndex(index: SpatialIndex): void` and
  `handleConnection(ws: NodeWebSocket, params: ConnectionParams):
  Promise<void>`. These are the only two methods ServerNetwork calls
  on the concrete `ConnectionHandler`.
- Parameter types (`SpatialIndex`, `NodeWebSocket`, `ConnectionParams`)
  are already in shared — `SpatialIndex` was relocated in Step 1 and
  `NodeWebSocket`/`ConnectionParams` are re-exported from
  `server-types.ts`. No new shared migrations needed.
- Compile-time assertion `_ConnectionHandlerAsserts =
  Assert<ConnectionHandler, IConnectionHandler>` added to
  `__interface_assertions__.ts`.
- `ServerNetwork.connectionHandler` field typed as
  `IConnectionHandler` instead of `ConnectionHandler`. The concrete
  `new ConnectionHandler(...)` construction remains inside
  ServerNetwork; when ServerNetwork moves to shared in Step 6, this
  construction relocates to a `ConnectionBridgeSystem` (same pattern).
- Server TS errors: 122 (unchanged). Zero regressions in touched files.

**Step 6 prep — IDuelStakeTransfer bridge system** (2026-04-18 5:12 EDT):
- `IDuelStakeTransfer` interface + `DuelStakeItem` row type added to
  shared `interfaces.ts`. Wraps the closure-form signature
  ServerNetwork passes to `registerDuelEventListeners`.
- New `DuelStakeTransferBridgeSystem` (server) implements the
  interface by delegating to `executeDuelStakeTransferWithRetry` from
  `ServerNetwork/duel-settlement.ts`. Registered in `startup/world.ts`
  as `world.register("duel-stake-transfer", ...)` alongside the other
  bridges.
- ServerNetwork dropped its direct import of
  `executeDuelStakeTransferWithRetry` and now resolves the bridge via
  `world.getSystem("duel-stake-transfer")`. Socket lookup wired into
  the bridge via `setSocketLookup(...)` at `ServerNetwork.init()`.
- Compile-time assertion `_DuelStakeTransferAsserts =
  Assert<DuelStakeTransferBridgeSystem, IDuelStakeTransfer>` added to
  `__interface_assertions__.ts`.
- ServerNetwork's remaining server-only imports are now limited to
  concrete construction sites (`new EventBridge(...)`,
  `new ConnectionHandler(...)`, `new BroadcastManager(...)`), all of
  which move to server-side bridge systems during Step 6.
- Server TS errors: 122 (unchanged). Zero regressions in touched files.

**Step 5d follow-up — handleCommand, UwsWebSocketAdapter, lazy-lookup** (2026-04-18 5:30 EDT):
- `onCommand` handler migrated from inline registration in ServerNetwork
  to `packetHandlerRegistration.ts` via the IPacketHandlerRegistry
  bridge, using public ServerNetwork accessors (`db`, `sockets`,
  `isBuilder`). ServerNetwork no longer imports `handleCommand` directly.
- `ISocketPubSubAdapter` interface added; `IBroadcastManager.getAdapter()`
  method added. `UwsWebSocketAdapter` type import removed from
  `ServerNetwork/index.ts`; `getUwsAdapterForPlayer` now returns
  `ISocketPubSubAdapter | undefined`.
- `DuelStakeTransferBridgeSystem` refactored to lazy-lookup pattern:
  resolves `world.getSystem("network")` at call time instead of relying
  on init-time `setSocketLookup()` wiring. ServerNetwork no longer
  imports the bridge's concrete type.

**Step 6 prep — IServerNetworkManagerFactory bridge** (2026-04-18 5:45 EDT):
- `IServerNetworkManagerFactory` interface + `ConnectionHandlerFactoryArgs`
  type added to shared `interfaces.ts`. Bundles the three remaining
  server-only concrete constructions (BroadcastManager, EventBridge,
  ConnectionHandler) into a single injection point.
- New `ServerNetworkManagerFactoryBridgeSystem` (server) implements the
  interface by delegating to the concrete constructors. Registered in
  `startup/world.ts` as
  `world.register("server-network-factory", ...)` before ServerNetwork.
- ServerNetwork dropped its direct imports of `BroadcastManager`,
  `EventBridge`, and `ConnectionHandler`. The three `new X(...)` call
  sites now route through `getManagerFactory().createX(...)`.
  `broadcastManager` field re-typed from concrete class to
  `IBroadcastManager`.
- `IBroadcastManager` extended with `setSpatialIndex()`, `setUwsApp()`,
  and a 4-arg `sendToAll()` signature matching the concrete class.
- Compile-time assertion `_ServerNetworkManagerFactoryAsserts =
  Assert<ServerNetworkManagerFactoryBridgeSystem,
  IServerNetworkManagerFactory>` added.
- Server TS errors: 122 (unchanged). Zero regressions.
- **Step 6 unblocked**: `ServerNetwork/index.ts` no longer has any
  server-only concrete class imports. The remaining local `./` imports
  are all re-export shims from shared. The file is ready to relocate to
  `packages/shared/src/systems/server/network/` in the next step.

**Step 6 prep — DuelScheduler/DuelBettingBridge lift-out** (2026-04-18 6:45 EDT):
- `DuelScheduler` and `DuelBettingBridge` constructions moved from
  `ServerNetwork.init()` into `startup/world.ts` (post-`world.init()`).
  ServerNetwork never referenced the stored fields post-init; both are
  fire-and-forget, so the lift-out is a pure relocation.
- ServerNetwork dropped `import { DuelScheduler, DuelBettingBridge }
  from "../DuelScheduler"` and removed the two `private` fields. All
  `../` imports remaining in ServerNetwork now have shared equivalents
  (`../TickSystem`, `../TradingSystem`, `../DuelSystem` all live in
  `packages/shared/src/systems/server/`).
- Server TS errors: 122 (unchanged). Zero regressions.
- **ServerNetwork/index.ts is now import-clean for relocation**: every
  local `./` import resolves to a file that already exists in
  `packages/shared/src/systems/server/network/`, and every `../`
  import resolves to a file that already exists in
  `packages/shared/src/systems/server/`. The physical move to
  `packages/shared/src/systems/server/network/index.ts` is the next
  mechanical step, followed by updating the server-side file to a
  re-export shim.

**Handler migration phase is COMPLETE** (2026-04-18):
- 175 registry registrations in `packetHandlerRegistration.ts` covering
  ~185 of ~200 original handler assignment lines (themed batches: trivial,
  broadcast, processing, bank, dialogue, quest-list, quest-mutation,
  combat-style, inventory, prayer, magic, action-bar, corpse-loot,
  home-teleport, character selection, respawn, name-change, NPC/entity
  interact, store, trade, duel, friends/ignore/PM).
- 15 handlers remain inline in `ServerNetwork/index.ts::registerHandlers()`:
  `enterWorld`, `onEnterWorld`, `onCommand`, `onMoveRequest`, `onInput`,
  `onAttackMob`, `onAttackPlayer`, `onFollowPlayer`, `onClientReady`,
  `onSyncGoal`, `onSyncAgentThought`. These close over ServerNetwork-
  internal managers and private methods — they carry **no
  drizzle/pg/schema dependencies** and will move with the class to
  shared in Step 6 without further extraction.
- Server TS errors: 71 in-package (total 122 with shared), unchanged
  baseline. No regressions from handler migration.

**Step 6 — COMPLETE** (2026-04-18 5:59 EDT, commit `635a7fa72`):
- `ServerNetwork/index.ts` (3202 lines) physically relocated to
  `packages/shared/src/systems/server/network/index.ts`.
- Import path fixes: `../../shared/types` split into `./server-types` +
  `../../../index`; `@hyperforge/shared` self-import → `../../../index`;
  interfaces import simplified to `./interfaces`; PlayerLocal cast
  switched to `../../../index` to dodge shared/build vs shared/src type
  identity mismatch.
- Server-side file replaced with a thin re-export shim (subsequently
  deleted in Step 8).

**Step 8 — PARTIAL** (2026-04-18 6:19 EDT, commits `3fb51de33`,
`a7954c411`):
- Primary static consumers of `ServerNetwork` (world.ts,
  packetHandlerRegistration.ts, AgentManager.ts, dashboardInterop.ts,
  llmBehaviorDecision.ts) and `GameTickProcessor.ts` manager imports
  now resolve directly to the shared sources.
- All 11 lazy `await import(...)` sites in streaming.ts, admin-routes.ts,
  agent-routes.ts redirected to shared.
- Server-side `packages/server/src/systems/ServerNetwork/index.ts` shim
  deleted — no remaining consumers.
- Sibling shims for managers (`action-queue.ts`, `tile-movement.ts`,
  `PendingAttackManager.ts`, etc.) remain — they are still imported by
  server-side DB-coupled handlers and internal `ServerNetwork/*` files
  that legitimately stay in the server package per the Step 5d
  alternative. Future sweep is possible but low-priority.

**Next recommended action**: Step 9 PIE wiring. Build `PIEServerSession`
in shared that:
1. Calls `createServerWorld()`
2. Registers minimal in-memory stub implementations of every `I*` bridge
   interface ServerNetwork expects (IBankRepository, IInventoryRepository,
   ICharacterRepository, IFriendRepository, IDatabaseSystem,
   IAgentManager, IAgentRuntimeLookup, IAuthService,
   IPacketHandlerRegistry, IBroadcastManager, IEventBridge,
   IConnectionHandler, IDuelStakeTransfer, IServerNetworkManagerFactory).
3. Registers `ServerNetwork`.
4. Uses `createInMemorySocketPair()` (already exists in
   `packages/shared/src/platform/shared/InMemorySocketPair.ts`) to connect
   a client socket to `network.onConnection(...)`.
5. Exposes the client-side socket to `ClientNetwork.init(...)` so the
   editor viewport receives real server packets.

Then repoint `packages/asset-forge/src/components/WorldStudio/hooks/usePIESession.ts`
at `PIEServerSession` and delete `createPlayTestWorld.ts` + `PIENetworkStub`.

---

## Post-migration vision: Plugin architecture (Steps 10+)

Once Steps 1-9 land, `ServerNetwork` lives in a package that is neither
server-specific nor game-specific. That unlocks the real architectural
prize: **Hyperscape becomes a plugin-composable engine**, following the
UE5 model of Engine → GameplayFramework → Plugins → Game Project.

### Target layering

```
┌────────────────────────────────────────────────────────┐
│  Game Project (Hyperscape RS-like, or any other game)  │ ← GameMode + manifests + world
├────────────────────────────────────────────────────────┤
│  Gameplay Plugins (opt-in packages):                   │
│    @hyperforge/combat       @hyperforge/skills         │
│    @hyperforge/inventory    @hyperforge/banking        │
│    @hyperforge/dialogue     @hyperforge/quests         │
│    @hyperforge/tile-movement  @hyperforge/wasd-movement│
│    @hyperforge-community/*  (3rd party, npm)           │
├────────────────────────────────────────────────────────┤
│  @hyperforge/gameplay-framework                        │
│    GameMode, PlayerController, Pawn, InputContext,     │
│    ServerNetwork, World, Entity, Component             │
├────────────────────────────────────────────────────────┤
│  @hyperforge/shared (engine core)                      │
│    ECS, Three.js WebGPU, PhysX, Socket, Packets        │
└────────────────────────────────────────────────────────┘
```

### Plugin contract (sketch)

Each plugin is a package exporting a single register function:

```typescript
export const CombatPlugin: HyperforgePlugin = {
  id: "@hyperforge/combat",
  version: "1.2.0",
  dependsOn: ["@hyperforge/shared", "@hyperforge/inventory"],
  loadPhase: "postWorld",  // "preWorld" | "postWorld" | "postSystems"

  register(world, config) {
    world.addSystem(new CombatSystem(config));
    world.registerComponent(HealthComponent);
    world.registerPackets(["player:attack", "player:damage"]);
    editor.addPropertyEditor("HealthComponent", HealthPropertiesPanel);
    editor.addPalette("Weapons", weaponPaletteItems);
  },
  schema: CombatConfigSchema,  // drives World Studio config UI
};
```

A GameMode composes plugins:

```typescript
export const HyperscapeGameMode: GameMode = {
  plugins: [CombatPlugin, SkillsPlugin, InventoryPlugin, TileMovementPlugin, ...],
  playerController: OSRSClickToWalkController,
  pawn: HumanoidPawn,
  camera: OrbitCamera,
};
```

### Distribution tiers (UE5 parallels)

1. **First-party official** — `@hyperforge/*` on npm, maintained in this
   monorepo. Guaranteed compat with engine semver.
2. **Community free** — `@hyperforge-community/*` or `@anyuser/*` on npm.
   A lightweight registry (JSON manifest index, Homebrew-tap style) lists
   known plugins; optional curation.
3. **Commercial marketplace** — Fab/Marketplace equivalent: Stripe + a
   plugin registry with revenue share. **Do NOT build this until tier 2
   has real usage.**

### UE5 lessons to inherit up-front

| UE5 lesson | Hyperscape implication |
|---|---|
| Stable plugin API — breaking it breaks everyone | `GameplayFrameworkVersion` exported + semver; plugins declare supported range |
| Load phases — order-of-init is the #1 plugin crash | `loadPhase: preWorld \| postWorld \| postSystems` enum baked into contract |
| Data tables & gameplay tags — shared vocab | Shared event-type registry + shared component registry; plugins register into these |
| Editor extensibility is a plugin contract too | World Studio needs a real plugin API for panels/palettes/property editors — not ad-hoc hooks |
| Sample project (Lyra) is itself a plugin set | Hyperscape RS-like becomes the reference GameMode that others fork/learn from |
| Source access for debugging | All first-party plugins open-source by default |

### Step 10-14 outline (post-migration work)

- **Step 10**: Extract `@hyperforge/gameplay-framework` from shared —
  GameMode, PlayerController, Pawn, InputContext, ServerNetwork,
  `HyperforgePlugin` type, plugin loader.
- **Step 11**: Carve `@hyperforge/combat` out of
  `packages/shared/src/systems/shared/combat/` as the first reference
  plugin. Validates the plugin contract on real code.
- **Step 12**: Define `HyperforgePlugin` editor API — property-panel
  registration, palette contributions, scripting-node contributions,
  GameMode config schema. Retrofit World Studio to consume it.
- **Step 13**: Convert Hyperscape RS-like into a GameMode composed of
  plugins (combat, skills, inventory, banking, quests, etc.). Delete any
  remaining game-specific code from `shared`.
- **Step 14**: Community plugin registry — JSON index on a public repo,
  `hyperforge plugin install <name>` CLI, World Studio "install plugin"
  button. No marketplace yet — just discovery.

### Why this is the real end goal

ServerNetwork migration isn't refactoring for its own sake. It's the
**architectural substrate for Hyperforge-as-an-engine-product**. Once
plugins work:
- Third parties build new games without forking the monorepo
- Hyperscape RS-like is a showcase, not a prison
- World Studio becomes a genuine multi-game AI studio
- Combat/skills/inventory/etc. become individually versionable products
- Community ecosystem becomes possible (npm is already the distribution)

The migration work being done right now (Steps 1-9) is the prerequisite
that makes all of this a package-publish away instead of a monorepo-fork
away.

