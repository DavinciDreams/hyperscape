# Heavy-Cluster Migration Plan

**Parent**: `PLAN_ENGINE_GAME_SEPARATION.md` criterion #2 — `@hyperforge/shared` should contain zero Hyperia-specific identifiers. After 2026-04-25's session, **17 systems migrated** out of shared (~28k LOC moved). The remainder forms a tightly-coupled "heavy cluster" of gameplay systems that reference each other concretely and can't migrate one-at-a-time.

## Status

Drafted 2026-04-25 at the end of a productive migration session. Branch tip: `97fc2ba8a`. Plugin tests 92/92. Server boots cleanly.

## Cluster membership

13 systems remain in `@hyperforge/shared` that are game-specific (not engine infrastructure):

| System | LOC | Location | Cluster role |
|---|---|---|---|
| `CombatSystem` | ~2,587 | `systems/shared/combat/` | Center — most consumers (49 in-shared) |
| `PlayerSystem` | ? | `systems/shared/character/` | Player ECS + tick + inventory orchestration |
| `SkillsSystem` | ? | `systems/shared/character/` | XP / level state per player |
| `EquipmentSystem` | ? | `systems/shared/character/` | Worn-equipment slot state |
| `InventorySystem` | ? | `systems/shared/character/` | Inventory + ground-item pickup |
| `MobNPCSystem` | 628 | `systems/shared/entities/` | Mob spawning, AI, death |
| `EntityManager` | ? | `systems/shared/entities/` | ECS spawn/despawn + spatial registry |
| `Entities` | ? | `systems/shared/entities/` | Legacy entity collection |
| `PlayerDeathSystem` | ? | `systems/shared/combat/` | Death pipeline orchestrator |
| `ZoneDetectionSystem` | 425 | `systems/shared/death/` | Safe / PvP / wilderness zone test |
| `GroundItemSystem` | ? | `systems/shared/economy/` | Loot drops on the ground |
| `ResourceSystem` | 3,398 | `systems/shared/entities/` | Resource node lifecycle |
| `TownSystem` | 2,907 | `systems/shared/world/` | Town generation + building placement |

Plus 4 supporting modules:
- `BuryDelayManager`, `EatDelayManager` (consumed by `PlayerSystem` only)
- `DeathStateManager`, `SafeAreaDeathHandler`, `WildernessDeathHandler` (consumed by `PlayerDeathSystem`)
- `CombatAnimationManager`, `CombatAntiCheat`, `CombatAnimationSync`, `CombatTickProcessor`, `RangedDamageCalculator`, `PidManager` and the `combat/handlers/` directory (consumed by `CombatSystem`)

## Why one-at-a-time migration fails

Concrete-type cross-references in `import` statements + direct method calls:

```
CombatSystem ──┬─ PlayerSystem (consumed via CombatTickProcessor)
               ├─ SkillsSystem
               ├─ EquipmentSystem
               ├─ InventorySystem
               ├─ MobNPCSystem
               ├─ EntityManager
               ├─ ZoneDetectionSystem
               └─ GroundItemSystem (via CombatTickProcessor)

PlayerDeathSystem ──┬─ ZoneDetectionSystem (instantiated directly: `new ZoneDetectionSystem(world)`)
                    ├─ DeathStateManager (instantiated directly)
                    ├─ SafeAreaDeathHandler (instantiated directly)
                    ├─ WildernessDeathHandler (instantiated directly)
                    ├─ EntityManager
                    ├─ InventorySystem
                    └─ GroundItemSystem

PlayerSystem ──┬─ SkillsSystem
               ├─ EntityManager
               ├─ EatDelayManager (instantiated as private field)
               └─ BuryDelayManager (instantiated as private field)

EquipmentSystem ──┬─ InventorySystem
                  └─ EntityManager

InventorySystem ──┬─ GroundItemSystem (via getSystem)
                  └─ EntityManager

MobNPCSystem ──┬─ EntityManager
               └─ (consumed by CombatSystem)

TownSystem ── consumed by GrassExclusionGrid (shared/world/), TerrainSystem (shared/world/),
             VegetationSystem (migrated), ProceduralTownLandmarks (migrated)
```

Every concrete-type import in shared is a place that needs duck-typing or a co-migration. Migrating any single system means rewriting cross-references in ~5–15 files.

## Migration archetypes (proven this session)

The 17 migrations shipped 2026-04-25 used five archetypes. Heavy-cluster work will recombine them:

1. **Cross-cutting w/ protocol-type extraction** (LootSystem) — extract small types to a shared `types/` file, migrate the class.
2. **Scaffold pure-move** (TeleportSystem, RangeSystem, ItemTargetingSystem, NPCTickProcessor) — never registered, no SystemMap entry, just barrel cleanup.
3. **Client-only register-relocation** (MusicSystem, InventoryInteractionSystem) — move `world.register("x", X)` from `createClientWorld.ts` to plugin `onEnable` client-only branch.
4. **Cross-cutting w/ duck-typed cross-package consumer** (BridgeSystem, ProceduralDocks, POISystem, RoadNetworkSystem) — in-shared consumers replace `import { X } from "./X"` with an inline duck-type interface; `world.getSystem("x") as unknown as XLike` casts.
5. **System-wrapper-only migration** (ScriptingSystem) — implementation classes stay in shared (consumed by PIE bundle); only the System wrapper moves to plugin.

Plus one new pattern this session:
6. **Extract-shared-state-then-migrate** (ProceduralGrass via GrassSharedRegistry) — when a system owns module-level state mutated by in-shared siblings, move the state to a sibling shared registry file first; siblings push to the registry, the migrated system reads from it via ES live bindings.

## Recommended migration order

Migrate in waves. Each wave is a cohesive unit that moves together; between waves the code is type-clean.

### Wave 1 — Leaves (low-coupling deps)

These have ≤3 in-shared consumers and no inbound dependencies from heavy-cluster systems that haven't already migrated:

- **`ResourceSystem`** (3,398 LOC) — barrel + SystemLoader register only. Quest/loot/skills already migrated, so most of its edges are external. **Risk: low.**
- **`GroundItemSystem`** — consumers: PlayerDeathSystem, InventorySystem, SafeAreaDeathHandler, WildernessDeathHandler, CombatTickProcessor. All heavy-cluster, all in-shared. **Co-migrate with Wave 3 or duck-type at all consumer sites.**

Decision needed: Is ResourceSystem alone tractable? Probably yes — its consumers within shared are limited.

### Wave 2 — Town + zone (geography cluster)

- **`TownSystem`** (2,907 LOC) — consumed by ZoneDetectionSystem (in heavy-cluster) and GrassExclusionGrid + TerrainSystem (in shared, infrastructure). The latter need duck-typing.
- **`ZoneDetectionSystem`** (425 LOC) — instantiated directly by PlayerDeathSystem (heavy-cluster). Co-migrate with PlayerDeathSystem in Wave 4.

### Wave 3 — Entities cluster

- **`EntityManager`** + **`Entities`** + **`MobNPCSystem`** — must move together because EntityManager owns all entity types and MobNPCSystem holds `private entityManager: EntityManager`. Total ~3,000+ LOC.
- Move `BuryDelayManager` + `EatDelayManager` here too — they're standalone helpers consumed only by PlayerSystem (which migrates in Wave 5).

After this wave: EntityManager/Entities references in remaining heavy-cluster systems (CombatSystem, PlayerSystem, PlayerDeathSystem) need duck-typing.

### Wave 4 — Death cluster

- **`PlayerDeathSystem`** + **`DeathStateManager`** + **`SafeAreaDeathHandler`** + **`WildernessDeathHandler`** + **`ZoneDetectionSystem`** all move together. `PlayerDeathSystem` instantiates them directly; they share death state.
- After: CombatSystem has one fewer concrete dep.

### Wave 5 — Character cluster

- **`PlayerSystem`** + **`SkillsSystem`** + **`EquipmentSystem`** + **`InventorySystem`** all move together. `EquipmentSystem` directly imports `InventorySystem`; PlayerSystem uses both.
- The `WorldDropConditionEvaluators` / `WorldDialogueConditionEvaluators` (still in shared) duck-type SkillsSystem + InventorySystem already — no rewrite needed there.

### Wave 6 — Combat (last)

- **`CombatSystem`** + all its handlers (`combat/handlers/`, `CombatAnimationManager`, `CombatAntiCheat`, `CombatAnimationSync`, `CombatTickProcessor`, `RangedDamageCalculator`, `PidManager`).
- After this wave: shared has zero Hyperia-specific identifiers (modulo any infrastructure I missed in this survey).

## Per-wave checklist

For each wave:

1. **Inventory imports**: list every concrete-type `import { X } from "./X"` in shared that crosses out of the wave's scope. These need duck-typing.
2. **Add deps to barrel** (`packages/shared/src/index.ts` + `index.client.ts`) for any types/values the migrated wave needs from shared.
3. **Move files** to `packages/hyperscape-plugin/src/systems/`. Update internal imports to use `@hyperforge/shared` for cross-package types.
4. **Clean IP refs** in the migration commit (no `OSRS`, `RuneScape`, `Old School`, `Jagex` in the moved files).
5. **Update SystemMap** entries to `unknown`.
6. **Update SystemLoader**: remove imports + `world.register` calls; downgrade `SystemsRegistry` field types to `unknown`; keep the field for caller compatibility.
7. **Update register sites** in `createClientWorld.ts` / `createServerWorld.ts` / `createEditorWorld.ts` — comment-tombstone with migration date.
8. **Add to plugin onEnable** in the appropriate branch (cross-cutting / client-only / server-only).
9. **Update contract test** in `packages/hyperscape-plugin/src/__tests__/onEnable.test.ts`.
10. **Verify**: `bun run build` in shared (clean d.ts cache first), then plugin build, then `bun test` in plugin (all green), then full workspace `bun run build` (catches dynamic-import resolution issues that per-package tests miss).

## Watch-out: tsconfig strictness divergence (added 2026-04-25 evening)

Attempted Wave 1 (ResourceSystem) at end of 2026-04-25 session. Migration reached the build step cleanly (shared built, all barrel deps wired up, gathering/ subdirectory co-migrated, IP refs cleaned), then hit **~80 type errors** in the plugin's tsc pass that the shared tsc pass was not surfacing. Errors cluster around:

- `ResourceSubType` (a numeric enum) being passed where `string | undefined` is expected
- `Implicit conversion of a 'symbol' to a 'string' will fail at runtime`
- Drop-table tagged-union narrowing (`levelRequired`, `catchLow`, `catchHigh` access on the `always-rolled` arm)
- `gathering-live` getters needed by the gathering/ subdirectory not yet barrel-exported (`getDefaultSuccessRate`, `getFishingSuccessRates`, `getMinimumCycleTicks`, `getMiningSuccessRates`, `getWoodcuttingSuccessRates`)

**Root cause**: `@hyperforge/hyperscape/tsconfig.json` has stricter checks than `@hyperforge/shared/tsconfig.json`. Files that pass shared's tsc fail plugin's tsc when migrated. Per-package builds in shared masked these issues until the file moved.

**Implication for Wave 1 (ResourceSystem)**: needs ~half-session of dedicated type-error fixing before the migration can land. The errors are real (not refactoring artifacts) — the file has been silently failing strict checks. Recommend either:
  1. Tighten shared's tsconfig first to surface + fix these issues in-place, then migrate cleanly
  2. Migrate with `// @ts-expect-error` tags + a follow-up cleanup commit
  3. Loosen plugin's tsconfig for migrated files (worst option — defeats the strictness)

Reverted at `fb8a01b62`. Wave 1 is unblocked but requires more focused attention than session-end velocity allows.

## Watch-outs (things that bit us this session)

- **Editor-world if-chain bug**: Replacing `world.register(...)` calls under nested `if (cfg.enableX)` branches in `createEditorWorld.ts` with bare comments leaves the outer if dangling onto the next if (silent breakage). Always collapse the outer if and move the next register out as a top-level statement. Hit twice (commits `dbe8b9030`, `ae25e5112`).
- **Dynamic imports surface in workspace builds**: Per-package builds don't catch unresolved `await import(...)` calls in plugin code that reach for now-missing shared sibling files. Run the workspace build (`bun run build` from repo root) after every migration. Discovered by ProceduralGrass dynamic imports (commit `97fc2ba8a`).
- **Duplicate barrel exports**: When the migrated system shares dep names with existing barrel exports, esbuild fails with "Multiple exports with the same name". Check before adding (e.g., `getGlobalCullingManager`, `applySkyFog`, `BridgeStyle`, `getNoiseTexture` all collided with prior exports).
- **D.ts overwrite errors** (`TS5055`): Stale build artifacts cause `tsc` to refuse overwriting input files. Always `rm -rf build` in shared before workspace builds.
- **Module-level state in migrated systems**: If the system owns module-level state mutated by in-shared siblings, you must extract the state first (see ProceduralGrass → GrassSharedRegistry pattern). Symptoms during attempted migration: `Cannot find module './X'` errors in shared sibling files after the migrated file is deleted.

## Estimation

Roughly: each wave is one focused session. Wave 1 might be a half-session; Wave 6 (Combat) might span multiple. The recommended order keeps the working tree compilable between waves so each can ship independently to `feat/world-studio`.

## Out-of-scope

- Engine-infrastructure systems that look game-specific but aren't: `Wind`, `Stage`, `Particles`, `ParticleSystem`, `LODs`, `Anchors`, `Chat`, `ActionRegistry`, `Physics`, `Settings`, `Events`, `Environment`, `SkySystem`, `WaterSystem`, `TerrainSystem`, `TreeLODSystem`, `BiomeResourceGenerator`. These should stay in shared as engine substrate.
- Any of the systems migrated 2026-04-25 (see `MEMORY.md` for the list).
- The asset-forge yoga-layout build issue — pre-existing infrastructure problem, unrelated to migrations.
