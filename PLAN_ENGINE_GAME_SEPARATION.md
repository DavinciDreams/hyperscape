# Engine / Game Separation — Comprehensive Plan

**Status**: Draft for sign-off (validated against working tree 2026-04-17)
**Scope**: Extract game-specific Hyperscape code out of `@hyperscape/shared` so World Studio becomes a genuine UE5-style editor with reusable engine primitives, and Hyperscape becomes one game built on top of it.
**Non-goals (now)**: Rewriting any gameplay, adding new game features, changing art pipeline, changing server deploy topology.

## Validation pass — what was checked vs. actual code

| Claim in plan | Verified? | Notes |
|---|---|---|
| `packages/shared` is the engine monolith | ✅ | Subpath exports `.`, `/client`, `/world`, `/runtime` confirmed in `shared/package.json` |
| Entity.ts / PlayerLocal / PlayerRemote / MobEntity monoliths | ✅ (sizes corrected) | 102 KB / 106 KB / 56 KB / 118 KB respectively |
| InteractionRouter has 16 handlers | ✅ | Lives at `shared/src/systems/client/interaction/InteractionRouter.ts` (plan path was wrong — corrected below); 16 concrete handlers in `./handlers/` (Item, NPC, Mob, Resource, Bank, Corpse, Player, CookingSource, SmeltingSource, SmithingSource, Altar, StarterChest, ForfeitPillar, RunecraftingAltar, Signpost, BuildingSign) |
| Procgen ↔ shared circular dep | ⚠ Worse than described | Real imports exist in both directions, but `procgen/package.json` does **not** declare `@hyperscape/shared` as a dep — the cycle is undeclared and relies on monorepo hoisting. Must be declared during the types-package extraction. |
| PIE stub at `usePIESession.ts:297-319` | ✅ | Confirmed — all three branches (`simulate`, `click-to-walk`, else) fall through to `refs.enterPlayerMode()` (WASD fly-cam) |
| Consumer count of `@hyperscape/shared` | ⚠ Updated | Five consumers, not three: `server` (185 imports / 136 files), `client` (119 / 102), `asset-forge` (20 / 17), `plugin-hyperscape` (7 / 4), plus `procgen` (transitive via undeclared dep). Plan text and §3.1/§2.1 updated below. |
| Test counts (302 total, 682 combat) | ⚠ Inflated | Actual: 169 `.test.ts` files in shared, 78 in server, 29 in `systems/shared/combat/`. "682 combat tests" from memory refers to test **cases**, not files. |
| `systems/shared/interaction/` directory | ✴ Missed in plan | Contains game-specific systems the plan didn't enumerate: `CraftingSystem`, `DialogueSystem`, `FletchingSystem`, `InventoryInteractionSystem`, `ItemTargetingSystem`, `Physics`, `ProcessingSystem`, `RunecraftingSystem`, `SmeltingSystem`, `SmithingSystem`, `TanningSystem`, `TargetValidator`. Added to §3.3. (`Physics.ts` here is a game interaction system, NOT the PhysX core.) |
| `systems/client/` contains only engine code | ✴ Wrong | Contains both: **engine** (ClientGraphics, ClientNetwork, ClientInput, ClientAudio, ClientLoader, ClientCameraSystem, ClientInterface, ClientLiveKit, ClientRuntime, NodeClient, TileInterpolator, ControlPriorities, DevStats, ClientTeleportEffectsSystem, ClientActions) and **game** (DamageSplatSystem, DuelArenaVisualsSystem, DuelCountdownSplatSystem, EquipmentVisualSystem, EquipmentVisualHelpers, HealthBars, ProjectileRenderer, SocialSystem, WaterfallVisualsSystem, XPDropSystem, ZoneVisualsSystem, BFSPathDebugSystem, PathfindingDebugSystem, ResourceTileDebugSystem, WalkableTileDebugSystem). Split handled in §3.2/§3.3. |
| Existing `shared/src/gameMode/PLAN.md` | ✴ Not referenced | A prior plan lives at `packages/shared/src/gameMode/PLAN.md` with a "Facade, don't extract" invariant. It forbids **copying** engine code into game-mode adapters. This plan **moves** code (doesn't duplicate it); compatible, but the invariant stays in force for the gameMode framework specifically. Noted in §3.7. |
| CI infra for the acceptance bar | ✅ | `.github/workflows/ci.yml`, `typecheck.yml`, `integration.yml` exist. Add a new `test:hyperscape-acceptance` turbo task + a workflow line; no new infra needed. |
| Monorepo has only 6 packages | ✴ Wrong | 22 packages total. Most are ancillary (contracts, oracles, markets, site). The ones touching engine/game are listed in §2. Others are out of scope. |

**Net effect on plan**: Directions are sound. Paths, counts, and the consumer list have been corrected in the sections below. One new consumer (`plugin-hyperscape`) added to migration scope. Procgen declared-dep fix added as a Phase 0 step.

---

## 0. The single sentence

`packages/shared` is doing two jobs — engine runtime *and* Hyperscape game content — and that's why PIE is a stub, why World Studio can't truly test gameplay without regressing Hyperscape, and why `packages/shared` keeps growing monoliths. We split it cleanly, preserve every current Hyperscape behavior, and make World Studio consume the engine + game packages the same way a UE5 project consumes the editor + game module.

---

## 1. Open decisions (answer these before Phase 1 starts)

| # | Decision | Proposed answer | Why |
|---|----------|-----------------|-----|
| D1 | Package layout | Keep `packages/shared` renamed in-place as `@hyperscape/engine` (new name), create `@hyperscape/hyperscape` for game code, create `@hyperscape/types` for shared pure types. Three packages, no compat shim. | Rename is cheaper than a new directory because all tsconfig paths, turbo filters, CI jobs, deploy scripts, subpath exports already target `shared`. A rename + new two packages preserves git history and minimizes CI/infra churn. |
| D2 | Hyperscape regression bar | The 12 critical acceptance tests (enumerated in §4) must pass on every phase PR, plus full vitest + playwright suites on the final phase. Any test added to that bar needs explicit sign-off before removal. | These 12 tests are the behavioral contract. Everything else is implementation detail that we are free to refactor. |
| D3 | PR cadence | Phase-by-phase PRs, each landable independently, each green on CI. No "big bang" branch. | The codebase is too large and has too many consumers for a long-lived branch. Phase PRs let us pause or roll back without losing work. |
| D4 | Backwards compat window | One release cycle. Deprecation shims in `@hyperscape/engine` re-export Hyperscape-moved symbols and emit a single console warning per symbol per process. Shims removed in the phase after the last consumer migrates. | Avoids forcing every downstream consumer to upgrade in the same PR. Avoids permanent cruft. |
| D5 | Subpath exports contract | Current subpaths (`@hyperscape/shared/runtime`, `/world`, `/client`) keep working throughout. Hyperscape game code is reached via `@hyperscape/hyperscape` (no subpaths for now). | Every breakage of a subpath is a consumer-visible breakage we'd have to land in lockstep. |
| D6 | Who owns the 12-test bar | A new `packages/engine/tests/acceptance/` directory mirrors the 12 tests as a single `bun run test:hyperscape-acceptance` script, run by turbo on every phase PR. | Makes the contract executable, not aspirational. |

**If the user disagrees on any of D1–D6, we stop and re-plan that row before Phase 1 starts.** The rest of this plan assumes the proposed answers.

---

## 2. Target architecture

```
packages/
├── types/                       NEW — pure type definitions, zero runtime
│   └── src/
│       ├── tile.ts              TileCoord, Position3D
│       ├── entity.ts            EntityData, ComponentData base types
│       ├── network.ts           PacketId, PacketSchema types
│       └── gameMode.ts          GameModeManifest (the UE5 GameMode record)
│
├── engine/                      RENAMED from shared — generic 3D multiplayer engine
│   └── src/
│       ├── core/                World, System, SystemBase, SystemLoader (pluggable)
│       ├── nodes/               Scene graph primitives (Node, Mesh, Group, Avatar, …)
│       ├── extras/              Three.js/PhysX helpers (no game content)
│       ├── physics/             PhysXManager, layers
│       ├── platform/            Client/server platform shims, Socket
│       ├── runtime/             createClientWorld / createServerWorld / createEditorWorld
│       ├── gameMode/            GameMode framework: Registry, Manifest, Pawn, Controllers
│       ├── scripting/           Generic VM + node graph runtime (no game actions)
│       ├── interaction/         InteractionRouter core + handler interface
│       ├── procgen-interface/   Plugin interface for procgen providers
│       └── systems/             ONLY engine systems (graphics, network, audio, camera…)
│
├── hyperscape/                  NEW — the Hyperscape game module
│   └── src/
│       ├── data/                items, npcs, runes, spells, world-areas, …
│       ├── constants/           CombatConstants, GatheringConstants, TreeTypes, …
│       ├── entities/            PlayerEntity, MobEntity, NPCEntity, world entities
│       ├── systems/             Combat, skills, inventory, quests, … (the ~180 game systems)
│       ├── interactions/        All 16 current InteractionRouter handlers, registered on load
│       ├── scripting/           ActionExecutor + the 50+ Hyperscape action types
│       ├── packets/             Hyperscape-specific packet schemas (~110 of 142)
│       ├── gameMode/            HyperscapeGameMode registration, default manifest
│       └── module.ts            GameModule descriptor (name, id, registerWithWorld(world))
│
├── procgen/                     UNCHANGED location; dep on @hyperscape/types only (breaks cycle)
│                                 Also: add explicit workspace dep on engine in package.json (today undeclared)
├── asset-forge/                 World Studio — depends on engine + optionally hyperscape
├── server/                      Hyperscape-flagship server — depends on engine + hyperscape
├── client/                      Hyperscape-flagship client — depends on engine + hyperscape
├── plugin-hyperscape/           ElizaOS plugin; depends on engine + hyperscape (5th consumer)
├── physx-js-webidl/             UNCHANGED
└── docs-site/                   UNCHANGED
```

Ancillary packages NOT in scope (confirmed no direct shared imports): `app`, `contracts`, `decimation`, `duel-oracle-evm`, `duel-oracle-solana`, `evm-contracts`, `gold-betting-demo`, `impostors`, `market-maker-bot`, `rtmp-muxer`, `sim-engine`, `solana-prediction-market`, `vast-keeper`, `web3`, `website`. They stay put.

### 2.1 Dependency rules (lint-enforced in Phase 8)

- `@hyperscape/types` → depends on **nothing** (except Three.js/stdlib types)
- `@hyperscape/engine` → depends on `types` only (+ three, physx)
- `@hyperscape/hyperscape` → depends on `engine` + `types`
- `@hyperscape/procgen` → depends on `types` only (breaks the current shared↔procgen cycle)
- `server`, `client` → depend on `engine` + `hyperscape` + `types`
- `asset-forge` → depends on `engine` + `types`; imports `hyperscape` **only** as a GameModule load target, never as a direct module import

### 2.2 How World Studio becomes UE5-like

World Studio ships the **engine**. A "project" in World Studio is a `GameModule` descriptor pointing to a game package (today: `@hyperscape/hyperscape`). When the user presses Play:

1. `usePIESession` reads the project's `GameModeManifest` from the DB record.
2. It boots a real `createClientWorld(engineConfig)` into the viewport container.
3. It calls `gameModule.registerWithWorld(world)` which attaches Hyperscape's systems, entities, packets, interactions, and scripting actions to that world.
4. The manifest's `playerController` / `camera` / `inputContext` / `pawn` are resolved by the engine's `GameModeRegistry` (which the game module populated in step 3).
5. The existing in-process loopback Socket connects the editor's client world to a same-process server world (also bootstrapped from the module).

No WASD fly-cam. No stub. Click-to-walk in PIE is just the real Hyperscape flow running in the editor viewport.

---

## 3. Migration map (file-by-file, verified against the audit)

### 3.1 Move to `@hyperscape/types`

| Source | Dest |
|--------|------|
| `shared/src/types/tile.ts` (TileCoord) | `types/src/tile.ts` |
| Position3D / Vector3-like interfaces scattered in `shared/src/types/` | `types/src/geometry.ts` |
| `shared/src/gameMode/manifest.ts` type-only portions | `types/src/gameMode.ts` |
| PacketId / PacketSchema base types from `shared/src/platform/shared/packets.ts` | `types/src/network.ts` |
| `ComponentData`, `EntityData` base types from `shared/src/entities/` type files | `types/src/entity.ts` |

**No runtime code** — just interfaces, enums, branded types. This is the package that breaks the shared↔procgen cycle.

### 3.2 Stay in `@hyperscape/engine` (renamed from shared)

The ~45 engine systems identified in the audit:

- `core/World.ts`, `core/SystemBase.ts`, `core/SystemLoader.ts`
- All of `nodes/`
- All of `extras/three/`, `extras/ui/`, `extras/animation/`
- `physics/PhysXManager.ts`, `physics/Layers.ts`
- `platform/` (server + client + shared)
- `runtime/createClientWorld.ts`, `createServerWorld.ts`, `createEditorWorld.ts`, `createViewerWorld.ts`, `createNodeClientWorld.ts`, `createPlayTestWorld.ts` *(this one gets rewritten — see Phase 6)*
- `gameMode/` framework files (`GameMode.ts`, `GameModeRegistry.ts`, `pawns/Pawn.ts`, generic controllers)
- `systems/client/ClientGraphics`, `ClientNetwork`, `ClientInput`, `ClientAudio`, `ClientLoader`, `ClientCameraSystem`, `DevStats`, `ClientRuntime`, `ClientInterface` (UI framework, not UI content)
- `systems/server/ServerNetwork`, `ServerRuntime`, `ServerLoader`
- `systems/shared/infrastructure/` (SystemLoader and friends)
- `scripting/` *generic* VM and node graph engine (no action catalog)
- `systems/client/interaction/InteractionRouter.ts` core *(handlers ejected — see §3.3)* + `ContextMenuController.ts` + its router-level types/services/utils
- `systems/client/` engine siblings only: ClientGraphics, ClientNetwork, ClientInput, ClientAudio, ClientLoader, ClientCameraSystem, ClientInterface, ClientLiveKit, ClientRuntime, NodeClient, TileInterpolator, ControlPriorities, DevStats, ClientTeleportEffectsSystem, ClientActions

### 3.3 Move to `@hyperscape/hyperscape`

The ~180 game systems + entities + data identified in the audit:

| Category | Files |
|----------|-------|
| **Data manifests** | All of `shared/src/data/` (items, npcs, runes, spells, world-areas, arena-layout, avatars, banks-stores, duel-manifest, playerEmotes, skill-icons, skill-unlocks, smithing-recipes, spell-visuals, world-structure, combat-spells, npc-sizes) |
| **Constants** | All of `shared/src/constants/` (Combat, Gathering, Smithing, Processing, Banking, BankEquipment, Equipment, Game, TreeTypes, WeaponStyle, interaction) |
| **Entity classes** | `PlayerEntity`, `PlayerLocal`, `PlayerRemote`, `MobEntity`, `NPCEntity`, `ItemEntity`, all `entities/world/*` (BankEntity, FurnaceEntity, AnvilEntity, AltarEntity, RunecraftingAltarEntity, RangeEntity, ResourceEntity, StarterChestEntity, HeadstoneEntity), `CombatantEntity`, `InteractableEntity`, visual strategies, managers (AIStateMachine, AggroManager, CombatStateManager, DeathStateManager, RespawnManager, particleManager/*) |
| **Systems** | All `systems/shared/combat/`, `systems/shared/skills/`, `systems/shared/inventory/`, `systems/shared/quests/`, `systems/shared/economy/`, `systems/shared/banking/`, `systems/shared/gathering/`, `systems/shared/prayer/`, `systems/shared/spells/`, plus the client-side visual siblings (DamageSplatSystem, DuelArenaVisualsSystem, DuelCountdownSplatSystem, etc.) |
| **Interaction handlers** | All 16 concrete handlers in `shared/src/systems/client/interaction/handlers/` (AltarInteractionHandler, BankInteractionHandler, BuildingSignInteractionHandler, CookingSourceInteractionHandler, CorpseInteractionHandler, ForfeitPillarInteractionHandler, ItemInteractionHandler, MobInteractionHandler, NPCInteractionHandler, PlayerInteractionHandler, ResourceInteractionHandler, RunecraftingAltarInteractionHandler, SignpostInteractionHandler, SmeltingSourceInteractionHandler, SmithingSourceInteractionHandler, StarterChestInteractionHandler). `BaseInteractionHandler.ts` stays in engine as the interface/base class. |
| **Interaction systems (gameplay)** | `shared/src/systems/shared/interaction/`: CraftingSystem, DialogueSystem, FletchingSystem, InventoryInteractionSystem, ItemTargetingSystem, Physics *(this is a game interaction Physics system, not the PhysX core — engine PhysXManager stays put)*, ProcessingSystem, RunecraftingSystem, SmeltingSystem, SmithingSystem, TanningSystem, TargetValidator |
| **Client-visual game systems** | From `shared/src/systems/client/`: DamageSplatSystem, DuelArenaVisualsSystem, DuelCountdownSplatSystem, EquipmentVisualSystem, EquipmentVisualHelpers, HealthBars, ProjectileRenderer, SocialSystem, WaterfallVisualsSystem, XPDropSystem, ZoneVisualsSystem, BFSPathDebugSystem, PathfindingDebugSystem, ResourceTileDebugSystem, WalkableTileDebugSystem |
| **Packets** | ~110 of the 142 packets (the ones with gameplay payloads: combat, inventory, skills, trading, quests, duels). Engine retains the ~32 generic ones (transform, connect, disconnect, chat, auth, ping). |
| **Scripting actions** | `ActionExecutor` + the 50+ Hyperscape action types |
| **GameMode** | `HyperscapeGameMode.ts` registration, click-to-walk + orbit + hyperscape-default input + humanoid-rpg pawn implementations *(the abstract factories stay in engine)* |

### 3.4 Entity.ts decomposition (the hardest surgical cut)

`Entity.ts` is 102 KB and contains: base Entity class + ComponentRegistry + transform utilities + networked property helpers + a bunch of Hyperscape-specific glue (combat hooks, inventory hooks, etc.).

Plan (Phase 3):

1. Split `Entity.ts` into `engine/src/entities/Entity.ts` (base class + ComponentRegistry + transform + netprops) and `hyperscape/src/entities/hyperscapeEntityMixins.ts` (the game hooks).
2. Replace the in-class Hyperscape hooks with a `Entity.extend(mixin)` extension point the game module calls on register.
3. `PlayerLocal.ts` (106 KB), `PlayerRemote.ts` (56 KB), `MobEntity.ts` (118 KB) stay monolithic for this refactor — they move wholesale to `hyperscape/`. A follow-up initiative can decompose them; splitting them is independent of engine/game separation and out of scope here.

### 3.5 InteractionRouter plugin extraction (Phase 4)

Correction from earlier draft: the router is **already partially plugin-based** — `registerHandlers()` populates a `Map<InteractableEntityType, BaseInteractionHandler>` at construction time. The 16 handlers are imported directly rather than dispatched via a `switch`. So Phase 4 is less "rewrite the dispatch" and more "move the imports out".

1. Engine keeps `InteractionRouter` + `BaseInteractionHandler` interface/base class + `ContextMenuController` + `types.ts` + `services/` + `utils/` + `constants.ts`.
2. `InteractionRouter` gains a public `register(type: InteractableEntityType, handler: BaseInteractionHandler)` and **stops importing concrete handlers directly**. The existing `registerHandlers()` becomes a no-op for the engine path.
3. Each of the 16 concrete handlers moves to `hyperscape/src/interactions/`. `HyperscapeModule.registerWithWorld` constructs and registers them via `router.register(...)`.
4. Acceptance: `grep` over `engine/src/systems/client/interaction/` finds zero imports of concrete handler classes and zero references to `InteractableEntityType` values like `"bank"`/`"mob"`/etc.

### 3.6 SystemLoader pluggability (Phase 5)

Currently `SystemLoader` imports Hyperscape systems by name. Replace with:

```typescript
interface SystemDescriptor { id: string; factory: (world: World) => System; }
SystemLoader.register(descriptors: SystemDescriptor[])
```

The `createClientWorld` / `createServerWorld` API gains an optional `modules: GameModule[]` param that calls `registerWithWorld(world)` on each, which in turn calls `world.systemLoader.register(...)`, `world.interactionRouter.register(...)`, `world.gameModeRegistry.register(...)`, etc.

### 3.7 GameModule becomes the uproject

**Compatibility with existing `shared/src/gameMode/PLAN.md`**: that plan's "Facade, don't extract" invariant forbids *duplicating* engine code (camera math, routing logic) inside game-mode classes. This plan **moves** code between packages rather than duplicating it — compatible. The gameMode framework (`GameMode`, `GameModeRegistry`, `Pawn`, abstract controllers) stays in engine; the Hyperscape-specific `ClickToWalkPlayerController`, `OrbitCameraController`, `HyperscapeInputContext`, `HumanoidRPGPawn` move to `hyperscape/` and continue to delegate to existing systems (InteractionRouter, ClientCameraSystem, PlayerLocal) via the registry — they do not fork gameplay logic.

Extend `packages/asset-forge/src/gameModules/GameModule.ts` to be the canonical descriptor:

```typescript
interface GameModule {
  id: string;                              // "hyperscape"
  name: string;                            // "Hyperscape"
  version: string;
  defaultManifest: GameModeManifest;
  registerWithWorld(world: World): void;   // attaches systems, entities, packets, interactions, actions
}
```

`@hyperscape/hyperscape` ships a `const HyperscapeModule: GameModule` as its default export. World Studio's game_modules DB records point to loadable module IDs.

### 3.8 PIE wiring (Phase 6 — the payoff)

Delete the stub in `usePIESession.ts:297-319`. Replace with:

```typescript
// asset-forge/src/components/WorldStudio/hooks/usePIESession.ts
const module = await loadGameModule(project.moduleId);  // dynamic import @hyperscape/hyperscape
const server = await bootInProcessServer({ module, manifest: project.gameMode });
const client = await createClientWorld({
  container: viewportEl,
  socket: loopbackSocket(server),
  modules: [module],
  manifest: project.gameMode,
});
```

Click-to-walk "just works" because the Hyperscape GameModule registered the real `click-to-walk` controller + the real `InteractionRouter` handlers + the real combat system into the world.

### 3.9 Delete / rewrite

- `shared/src/runtime/createPlayTestWorld.ts` — delete. Its job (boot a pretend world for testing) is subsumed by the real in-process PIE path.
- Any WASD-fly-cam fallback paths in `usePIESession.ts`, `ViewportContainer.tsx` — delete after Phase 6 lands.
- `asset-forge/src/gameModules/utils/initializeModuleLayers.ts` — reconcile with the new GameModule descriptor (likely folds into it).

---

## 4. The Hyperscape zero-regression contract

These 12 acceptance tests form the hard contract. Every phase PR runs them. Any phase that fails them cannot land.

| # | Test | What it proves |
|---|------|----------------|
| 1 | Player joins a server, spawns in world at valid spawn position | Entity + network + platform wiring |
| 2 | Click-to-walk movement reaches arbitrary nav-mesh point | InteractionRouter + pathfinding + movement |
| 3 | Player attacks goblin → damage applied → goblin dies → loot drops | Full combat loop + mob AI + loot |
| 4 | Player picks up item → inventory updates → stores in bank → retrieves | Inventory + banking + persistence |
| 5 | Player gathers wood from tree → skill XP + resource respawn | Gathering + skills + resource system |
| 6 | Player smelts ore at furnace, smiths bar at anvil | Processing + station entities |
| 7 | Prayer activation reduces prayer points, effect applied | Prayer system |
| 8 | Combat spell: mage casts fire strike → damage + XP | Spells + combat |
| 9 | Quest acceptance + stage completion + reward | Quest system |
| 10 | Two players trade items via trade window | Networked economy |
| 11 | Duel challenge → arena teleport → combat → resolution | Duel orchestrator + arena lifecycle (CLAUDE.md critical path) |
| 12 | Agent (AI NPC) runs 8s behavior ticker, attacks hostile mob, eats food, activates prayer | Agent combat — CLAUDE.md explicitly flags this as critical |

Where these live today (the Explore audit enumerated them): spread across `packages/server/src/__tests__/`, `packages/shared/src/systems/shared/combat/*.test.ts`, `packages/shared/src/systems/shared/quests/*.test.ts`, and a handful of Playwright scenarios in `packages/server/tests/`.

**Phase 0 deliverable**: collect these into `packages/engine/tests/acceptance/` as a single `bun run test:hyperscape-acceptance` entry point. Run on every phase PR via turbo task.

---

## 5. Phased rollout

Each phase ends in a landable PR. Each PR runs the full acceptance suite + existing vitest/playwright. No phase may break a subpath export. **No timeline estimates per CLAUDE.md** — phases land when they're green.

### Phase 0 — Foundation (acceptance harness + types package + declared deps)
1. Create `packages/types/` with tsconfig, package.json, turbo wiring.
2. Move the type-only symbols (§3.1). No runtime moves yet. Make `shared` and `procgen` both depend on `types`.
3. **Declare the procgen → shared dep** explicitly in `procgen/package.json` (currently undeclared — the cycle is only implicit via workspace hoisting). Once declared, swap those shared imports to pull from `@hyperscape/types` instead so the cycle is broken rather than formalized.
4. Create `packages/engine/tests/acceptance/` and wire the 12-test bar. Tests stay in their current homes; the acceptance harness just imports and re-exports them. Add `test:hyperscape-acceptance` as a new turbo task and a line in `.github/workflows/ci.yml`.
5. Green bar on `main`.
**Exit criteria**: `bun run test:hyperscape-acceptance` runs the 12 tests and they all pass. Madge shows no cycle between procgen and shared.

### Phase 1 — Create `@hyperscape/hyperscape` skeleton + move data/constants
1. Create `packages/hyperscape/` with tsconfig, package.json, turbo wiring. Depends on engine (still `shared`) + types.
2. Move `shared/src/data/` and `shared/src/constants/` to `hyperscape/src/`. Update all imports across client/server/shared consumers. Leave one-line re-export shims in `shared/src/data/index.ts` + `shared/src/constants/index.ts` (deprecated).
3. Ensure `@hyperscape/hyperscape` has a minimal `module.ts` exporting a `GameModule` with empty `registerWithWorld`.
**Exit criteria**: 12-test bar green. All downstream packages still build without changes (via shims).

### Phase 2 — Move Hyperscape systems + entities
1. Move game systems (§3.3 "Systems" + "Entity classes" rows) to `packages/hyperscape/src/systems/` and `entities/`.
2. Update `SystemLoader` to accept both legacy hardcoded imports (temporary) and the new `register()` path.
3. Populate `HyperscapeModule.registerWithWorld` to call `SystemLoader.register(...)` with all moved systems.
4. `createClientWorld` / `createServerWorld` accept optional `modules: GameModule[]`; when present, the legacy hardcoded imports are skipped.
5. Update `packages/server/`, `packages/client/`, and `packages/plugin-hyperscape/` call sites to pass `[HyperscapeModule]`. (plugin-hyperscape has 7 imports across 4 files — small but must not be forgotten.)
**Exit criteria**: 12-test bar green. `server`, `client`, and `plugin-hyperscape` no longer import directly from `shared/src/systems/shared/combat` etc. — they import `HyperscapeModule` from `hyperscape`.

### Phase 3 — Entity.ts decomposition + GameMode
1. Split `Entity.ts` per §3.4. Extension points in engine; Hyperscape hooks in hyperscape.
2. Move `HyperscapeGameMode.ts`, click-to-walk controller, orbit camera implementation, hyperscape-default input context, humanoid-rpg pawn to `hyperscape/src/gameMode/`. Engine retains the abstract framework only.
3. `HyperscapeModule.registerWithWorld` now also registers the GameMode.
**Exit criteria**: 12-test bar green. `packages/shared/src/entities/Entity.ts` no longer references Hyperscape-specific symbols; Hyperscape Entity mixin is registered lazily.

### Phase 4 — InteractionRouter plugin extraction
1. Define `InteractionHandler` interface in engine (§3.5).
2. Move each of the 16 handlers to `hyperscape/src/interactions/`, implementing the interface.
3. `HyperscapeModule.registerWithWorld` registers handlers via `world.interactionRouter.register(...)`.
4. Router removes all `if (type === "x")` branches.
**Exit criteria**: 12-test bar green. `grep` over `engine/src/interaction/` finds zero game-type strings.

### Phase 5 — Packets + scripting actions
1. Move the ~110 game-specific packets to `hyperscape/src/packets/`. Engine retains only transport-level packets.
2. Move `ActionExecutor` + 50+ action types to `hyperscape/src/scripting/`. Engine's node-graph VM becomes action-catalog-agnostic.
3. `HyperscapeModule.registerWithWorld` registers packet schemas + action catalog.
**Exit criteria**: 12-test bar green. Engine has no knowledge of combat/inventory/quest packet shapes.

### Phase 6 — Rename shared → engine + wire real PIE
1. Rename `packages/shared` → `packages/engine`. Update every `@hyperscape/shared` import across the monorepo to `@hyperscape/engine`. Keep `@hyperscape/shared` as a thin re-export shim package for one release.
2. Delete `createPlayTestWorld.ts`. Delete the WASD-fallback stub in `usePIESession.ts`.
3. Wire real PIE per §3.8: dynamic load of `HyperscapeModule` in World Studio, real `createClientWorld` + in-process server, loopback socket, manifest-driven controller.
4. Verify: pressing Play in World Studio with the default project yields click-to-walk, mouse camera, real combat, real inventory.
**Exit criteria**: 12-test bar green. Manual smoke test: World Studio → Play → attack a mob → see damage numbers and loot, identical to Hyperscape client.

### Phase 7 — Asset-forge GameModule descriptor + DB
1. Reconcile `asset-forge/src/gameModules/GameModule.ts` with the engine `GameModule` interface.
2. DB record in `games.game_mode` stays as the manifest; DB record in `games.module_id` points to a loadable module. Hyperscape is seeded as the default module.
3. Add UI surface in World Studio to pick manifest + module for a project (read-only for now; editing is a follow-up).
**Exit criteria**: 12-test bar green. World Studio can open two projects with different manifests and Play works for each.

### Phase 8 — Guardrails
1. ESLint rule: `no-restricted-imports` forbids `packages/engine/src/**` importing from `packages/hyperscape/**`, `packages/procgen/**`, or `packages/types` is OK but from `hyperscape` is not.
2. ESLint rule: `packages/hyperscape/src/**` cannot import `packages/client/**`, `packages/server/**`, or `packages/asset-forge/**`.
3. CI job: circular dep checker (madge) runs on every PR. Zero-circular contract enforced between engine ↔ procgen ↔ types ↔ hyperscape.
4. Remove deprecation shims introduced in Phases 1–6 (one release window after each was introduced).
**Exit criteria**: Lint rules green. No shim re-exports left.

---

## 6. Risks and mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| A Hyperscape system has a latent dependency on another Hyperscape system via string lookup (`world.getSystem("combat")`), and moving the target breaks the caller silently | High | The 12-test bar catches the big ones. Phase 2 also runs the full `packages/shared/src/systems/shared/combat/*.test.ts` suite (682 tests per memory) as a belt-and-braces check. |
| Subpath exports (`@hyperscape/shared/runtime`) break downstream when contents migrate | Medium | Shims in §D4. Subpath contract in §D5. Every phase PR runs `asset-forge` + `client` + `server` builds. |
| PIE's in-process loopback socket has bugs that only surface under real game packets | Medium | Phase 5 moves packets before Phase 6 wires PIE, so the socket is exercised by the full packet set before the PIE flip. |
| Circular dep between procgen and moved code | Low | Phase 0 types package breaks the known cycle. Madge guard in Phase 8 catches future ones. |
| Entity.ts split introduces subtle behavior change in netprop ordering / component registration order | High | Phase 3 is guarded by the full combat + inventory + quests test suites. If any test's tolerance for ordering is currently implicit, we make it explicit in Phase 3. |
| Scope creep: someone starts decomposing PlayerLocal (106 KB) mid-refactor | Medium | Explicit non-goal. If it comes up, file a follow-up. |
| Agent combat (CLAUDE.md's flagship concern) breaks | High | Test #12 covers it. Additionally: `DuelOrchestrator.setArenaBounds` + `setAutonomousBehaviorEnabled` are both traced through Phase 2 and Phase 4 PR reviews explicitly. |

---

## 7. What this plan does NOT do

- Does not change gameplay, combat balance, or any player-visible behavior.
- Does not decompose PlayerLocal/PlayerRemote/MobEntity monoliths (follow-up).
- Does not address the WebGPU-required architecture (orthogonal).
- Does not change deploy topology — server and client still ship the same built artifacts.
- Does not add new World Studio editor features beyond real PIE.
- Does not touch the `@hyperscape/procgen` internals beyond re-pointing its one shared type dep.

---

## 8. Definition of done

- `packages/engine/` has zero string literals from the Hyperscape game domain (combat, inventory, skill names, item ids, quest ids). Grep-verifiable.
- `packages/hyperscape/` is a single package that registers with a world and produces the full Hyperscape experience.
- World Studio can press Play on a Hyperscape project and get click-to-walk, real combat, real inventory, identical to the Hyperscape flagship client.
- All 12 acceptance tests green on `main`.
- Full vitest + playwright suites green on `main`.
- ESLint dependency rules green.
- Zero circular deps per madge.
- Zero `@hyperscape/shared` imports anywhere in the monorepo (shim package removed).

---

## 9. Sign-off gate

Before Phase 0 starts, confirm:

- [ ] **D1** package layout (three packages: types, engine, hyperscape)
- [ ] **D2** 12-test regression bar is the right bar
- [ ] **D3** phase PRs, not long-lived branch
- [ ] **D4** one-release-window deprecation shim policy
- [ ] **D5** subpath exports preserved throughout
- [ ] **D6** acceptance harness lives at `packages/engine/tests/acceptance/`
- [ ] Any additions to the 12-test bar

Once signed off, Phase 0 opens with the types package extraction + acceptance harness.
