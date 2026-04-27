# Hyperscape Progress Audit — 2026-04-27 (REFRESH 6)

**This doc supersedes the 2026-04-24 cut.** That audit accurately
described state at 50–60% AAA, with the engine/game separation
sitting at ~5% as the biggest unknown. Two intense days of work
have closed most of that unknown — the engine substrate is now
zero-Hyperscape-imports for the network layer, ~7,464 more LOC
have moved from `@hyperforge/shared` to
`@hyperforge/hyperscape-plugin`, and 5 new substrate types have
been proven as the unblock pattern.

Produced from: branch diff vs main + direct file inventory + this
session's commit trail (`63ab4b2d6` → `c103e5e7e`, 59 commits).

---

## Headline correction

**~80–82% of the way to "truly AAA, truly done"** — up from 78–80% earlier today. **REFRESH 6 (2026-04-27 mid-morning): partial progress on top-10 #8 (final shared cleanup) over 4 slices — quest-types (383 LOC) + social-types (219 LOC) + trade-types (372 LOC) migrated to plugin; interaction-types (150 LOC) deleted as dead code. `packages/shared/src/types/game/` 11 files → 7. 4 substrate-promotes shipped. 198/198 plugin tests green throughout.** REFRESH 5 closed top-10 #9 (CombatSystem decomposition). REFRESH 4 closed top-10 #10 (long-tail registry consumer-wiring). REFRESH 3 closed the AI test-coverage gap (top-10 leverage item #6).
two days ago. The single biggest blocker on the prior top-10 list
("#2 Hyperscape→plugin extraction, XL effort, biggest unknown") is
mostly resolved.

Branch composition by additions (vs `main`):

| Area | LOC additions | Share |
|---|---:|---:|
| `packages/asset-forge/` (editor) | 241,094 | ~44% |
| `packages/hyperscape-plugin/` (game-as-plugin) | ~80,000+ | ~15% |
| `packages/shared/` (runtime engine) | 202,374 (-30,000+ this week) | ~33% net |
| `packages/manifest-schema/` | 49,614 | ~9% |
| `packages/gameplay-framework/` | 12,169 | 2% |
| `packages/ui-framework/` | 6,969 | 1% |
| `packages/client/` | 6,650 | 1% |
| `packages/server/` | 4,065 (-25,709) | net negative — code moved through shared into plugin |
| `packages/ui-widgets/` | 3,005 | <1% |
| Other (procgen, contracts, oracles, gold-betting-demo, sim-engine, decimation, impostors, web3, website, app, vast-keeper, rtmp-muxer, plugin-*) | ~12,500 | 2% |

The branch is **~44% editor, 33% runtime engine, 15% game-plugin, 8% framework + everything else**.
The shift from "shared has everything" to "plugin owns game logic"
is the single biggest visible change in the past 48 hours.

---

## REFRESH 6 — types/game/ migration partial (2026-04-27 mid-morning)

Top-10 leverage item #8 (final shared cleanup) advanced from "open"
to **partial** over 4 slices. `packages/shared/src/types/game/` shrank
from 11 files to 7; 1,124 LOC migrated to
`@hyperforge/hyperscape-plugin/src/types/` + 150 LOC of dead code
purged.

| Slice | File | LOC | Substrate-promote |
|---|---|---:|---|
| 18 | `quest-types.ts` → plugin | 383 | WorldDialogueConditionEvaluators QuestProgress → inline `QuestProgressLike` duck-type |
| 19 | `interaction-types.ts` deleted | 150 (dead) | none — file was unused, only barrel re-exports |
| 20 | `social-types.ts` → plugin | 219 | SOCIAL_CONSTANTS inlined into `social-live.ts`; ClientNetwork's typed payload imports → opaque pass-through types |
| 21 | `trade-types.ts` → plugin | 372 | TRADE_CONSTANTS inlined into `trading-live.ts`; TradingSystem + TradeOperationResult interfaces moved out of `system-interfaces.ts` to live with the implementation; dead TradeCancelledPayload import dropped |

Plugin barrel now re-exports all migrated public types so cross-package
consumers (server integration tests, client FriendsPanel, server
swap.ts) keep their imports stable on `@hyperforge/hyperscape`.

**Recipe-exhaustion confirmed** for the 6 remaining files in
`types/game/`. Each has real engine-tied internal consumers:

- `combat-types` (105 LOC): CombatStyle, CombatStateData, CombatTarget
  flow through `entities/`, `components/`, `utils/CombatUtils.ts`,
  `constants/WeaponStyleConfig.ts` — engine substrate.
- `duel-types` (583 LOC): 24 references in `event-payloads.ts` plus
  5 in the `DuelSystem` interface in `system-interfaces.ts`. Migration
  needs DuelSystem interface relocation + event-payload duck-typing.
- `inventory-types` (285 LOC): `Bank` (56 hits), `BankEntityData` (7),
  `StoreData` (10), `LootEntry` (8), `LootTable` (5) deeply integrated
  with shared internals.
- `item-types` (508 LOC, 8 shared consumers): heaviest. Item substrate
  for the engine; probably stays in shared permanently.
- `prayer-types` (343 LOC): blocked by `PrayerDataProvider` (537 LOC,
  engine-side editor + DataManager + PIEEditorSession dep).
- `resource-processing-types` (169 LOC): footprint primitives
  (ResourceFootprint, FootprintSpec, FOOTPRINT_SIZES, resolveFootprint)
  bidirectionally consumed by `entities.ts` AND plugin entities.
  Splitting yields only ~80 LOC of net migration.

**Each remaining file is a focused M-L cut** requiring substrate
refactors, not S-sized cleanup. Today's 4 slices represent the bulk
of low-hanging fruit; remaining work is heavier.

---

## REFRESH 5 — CombatSystem decomposition shipped (2026-04-27 late-morning)

**Top-10 leverage item #9 (CombatSystem decomposition, original target
4,019 → <2,000) hit and exceeded.** Final state: `CombatSystem.ts`
**1,359 LOC**, ~30% below the original target.

17 slices on `feat/world-studio` (commits `780ad016e` → `5f7fda8a9`,
all pushed). 198/198 plugin tests green throughout; shared build
clean at every slice boundary.

**16 cohesive helpers extracted** (in
`packages/hyperscape-plugin/src/systems/combat/`):

| Slice | Helper | Purpose |
|---|---|---|
| 1 | CombatEventEmitter | zero-alloc event-payload helpers |
| 2 | CombatPlayerQueries | skill-level, selected-spell, inventory queries |
| 3 | CombatEventRecorder | event-store record + state-snapshot builders |
| 4 | CombatDamageOrchestrator | melee/ranged/magic damage dispatch + equipment cache |
| 5 | CombatDeathHandler | handleEntityDied + handlePlayerRespawned |
| 6 | CombatLifecycleHandler | endCombat (timeout + manual force-end cleanup) |
| 7 | CombatAttackValidator | 5 pre-attack predicates + range checks |
| 8 | CombatFollowController | per-tick range + follow + getAttackTypeFromWeapon |
| 9 | CombatDamageApplicator | trunk damage path (polymorphic via damageHandlers Map) |
| 10 | CombatTickAttackWorker | per-tick auto-attack worker cluster (4 methods) |
| 11 | CombatProjectileHitProcessor | deferred-damage projectile-hit loop |
| 12 | CombatTickOrchestrator | processCombatTick + NPC/Player phase + autoAttackOnTick |
| 13 | CombatEnterLifecycleHandler | enterCombat (287-LOC method) |
| 14 | CombatMeleeAttackHandler | handleMeleeAttack + executeMeleeAttack |
| 15 | CombatRangedAttackHandler | handleRangedAttack mob + player branches |
| 16 | CombatMagicAttackHandler | handleMagicAttack mob + player branches |

**Slice 17 — dead-code purge**: 6 orphan files totaling ~3,142 LOC
deleted from the combat directory. Confirmed unused via mono-repo
grep — they were parallel implementations from a prior extraction
attempt that never got wired up:
- `handlers/MeleeAttackHandler.ts` (367)
- `handlers/RangedAttackHandler.ts` (532)
- `handlers/MagicAttackHandler.ts` (614)
- `handlers/AttackContext.ts` (342)
- `CombatTickProcessor.ts` (763)
- `CombatAnimationSync.ts` (511)

**Final CombatSystem.ts at 1,359 LOC** is mostly thin-proxy +
boilerplate (~340 LOC of constructor wiring for 16 helpers, ~211
LOC of small public accessors, ~163 LOC of remaining handler
methods, ~80 LOC of init() world-lookups, plus 6 thin-proxy methods
3-15 LOC each). The pattern is exhausted at this scale; the helpers
ARE the system now.

**Recipe artifacts from the 17-slice arc** (memory:
`session_2026_04_27_combat_complete.md`): closure-injection for
late-bound deps; map-reference sharing for ownership boundaries;
pooled-tile buffer sharing; public-method proxying preserves outside
callers; perl bulk-rewrite for callsite delegation; substrate-promote
for orphan code orphaned by parallel extractions.

---

## What this session shipped (2026-04-25 → 2026-04-26)

### Engine API extraction — Phases F3 + G-1

**5 new substrate interfaces** in
`packages/shared/src/systems/server/network/substrate/` that let
ServerNetwork dispatch into game-specific code without importing it:

- `IConnectionRegistry` (Phase F1, prior session)
- `ProcessingHandlerContext` (F3-3)
- `IHomeTeleportManager` + `HomeTeleportFactory` (F3-7)
- `IFriendsService` (F3-8)
- `ICombatAttackService` (F3-9)
- `IPlayerSpawnService` (G-1)

These join the earlier substrates (`ISpatialIndex`,
`IBroadcastService`, `IRegionSubscriptionService`,
`ITileMovementService`) for a total of **9 substrate types** that
form the engine→game contract surface.

**14/14 handler families migrated to plugin** (all of `network/handlers/`):

| Batch | Handler family | LOC | Pattern |
|---|---|---:|---|
| F3-1 (prior session) | chat, resources, magic, dialogue, entities | ~571 | direct migration via IConnectionRegistry |
| F3-2 | player, prayer, quest | 822 | direct migration |
| F3-3 | processing | 652 | substrate-promote (ProcessingHandlerContext) |
| F3-4 | duel/* (5 files) | 1,303 | direct migration |
| F3-5 | trade/* (2 files) | 707 | direct migration |
| F3-6 | combat split (style + retaliate) | 84 | direct migration |
| F3-7 | home-teleport | 287 | substrate-promote (IHomeTeleportManager + factory) |
| F3-8 | friends | 946 | substrate-promote (IFriendsService) |
| F3-9 | combat (handleAttackPlayer + Mob) | 280 | substrate-promote (ICombatAttackService) |
| G-1 | character-selection.ts | 1,383 | substrate-promote (IPlayerSpawnService) |

**Result:** `packages/shared/src/systems/server/network/handlers/`
is empty except for the `common/` subdirectory (engine-level
helpers used by plugin-side handlers via the shared barrel).
`character-selection.ts` is gone from shared.
**No Hyperscape-specific handler code remains in shared's network/
subdirectory.**

### Server post-migration cleanup

13 commits repairing stale paths and type alignments downstream of
the migrations:

- duelFood shim, DuelSystem submodule shims (7 files),
  GameTickProcessor type imports, DuelScheduler PlayerEntity import,
  store StoreSystem import, EmbeddedHyperiaService PlayerLocal,
  connection-handler PlayerLocal namespace lookup
- Test mocks: PendingGatherManager constructor signature,
  TileMovementManager EntityID brand cast
- Schema fixes: `streamingDuelEligible` → `streamingDuelEnabled`
  typo, `lore` field added to `AgentCharacterConfig`,
  `EmbeddedTickerGoalSnapshot.type` union widened to match
  `AgentGoal.type`, `resourceId` added to `NearbyEntityData`,
  `recipe`/`slot`/`questId` added to `CommandData`
- Duck-cast cleanup: `dashboardInterop.ts` `WorldEntity` cast
  fixed (was no-op due to redundant getWorld? extension);
  duplicate `getWorld()` in EmbeddedHyperiaService removed

**Server typecheck: 107 → 34 errors (73 cleared, 68% reduction).**
Server build now passes; the duplicate-getWorld warning is gone.

### Stability

Plugin tests: **187/187 throughout all 27 commits**. Server build,
plugin build, shared build all pass. Branch pushed to
`origin/feat/world-studio` at tip `c103e5e7e`.

---

## Phase-by-phase REVISED status

| Phase | Plan name | 2026-04-24 | **2026-04-26** | Why the change |
|---|---|---:|---:|---|
| 0 | Foundation | 100 | **100** | unchanged |
| A | Constants → manifests | 40 | **85** | re-audit revealed all 12 `data/*.ts` + all 11 `constants/*.ts` files are already manifest façades; only editor-side coverage (Phase B) and minor type-relocation work remains |
| B | Manifest editors | 20 | **20** | not touched |
| C | Property panel schema refactor | 65 | **65** | not touched |
| D | UI/HUD framework | 78 | **80** | Sessions 4 + 5A (XP orb + LevelUp toast) shipped; per-widget plugin contribution recipe proven with 2 worked examples + multi-widget contribution test |
| E | Audio/VFX/Anim/Input | 45 | **45** | not touched |
| F | Progression/Economy/Loc/Render | 45 | **45** | not touched |
| G | Missing systems | 35 | **35** | not touched |
| H | AI behavior as data | 35 | **50** | Session 6 shipped 136 unit tests across 9 AI services (was 0 before today). Each service has happy path + error path + parameter-shape assertions under mocked SDKs. Production-shipped AI integrations no longer have zero-coverage risk. |
| I | Plugin architecture | 88 | **98** | Session 3 — Plugin Browser UI install + uninstall shipped; only runtime hot-mount remains |
| J | Editor UX (UE5 parity) | 30 | **30** | not touched |
| K | Hygiene | 15 | **30** | 38 type errors cleared this weekend + 691 OSRS/RuneScape/Jagex naming-rule violations scrubbed (185 files, 0 remaining) |
| **Engine/game separation** (master criterion #2) | — | **5** | **75** | F3 + G1 closed handler/character-selection migration; lexical IP scrubbing complements structural separation |

**Plus: substantial work outside the master plan** (unchanged
this session)

| Area | Status |
|---|---|
| Cross-chain duel oracle (EVM + Solana) | ~80% (deployed mainnet+devnet) |
| Streaming pipeline (vast-keeper + rtmp-muxer) | ~50% |
| Mobile (Tauri + Capacitor) | ~40% |
| Marketing website | 100% |
| ElizaOS agent integration | ~70% |
| Sim-engine | ~80% |
| Gold-betting demo (Solana) | ~80% |

---

## The big honest picture

### What's actually shipped (substrate + tooling + GAME-AS-PLUGIN)

(Items added this session marked **NEW**)

- 129 manifest schemas with full Zod validation
- 128 providers boot-loaded through DataManager
- 104 module-level registries (**100 with `onReloaded` listener — long-tail exhausted, REFRESH 4**); 4 non-manifest registries (factory/runtime/ECS) permanently skipped with documented rationale
- **NEW: 9 engine substrate types** in `network/substrate/` covering
  every cross-package boundary in the runtime
- **NEW: 14/14 network handler families migrated to
  `@hyperforge/hyperscape-plugin`**
- **NEW: character-selection (1,383 LOC) migrated to plugin via
  `IPlayerSpawnService`**
- **NEW: `shared/handlers/` is empty (only `common/` engine helpers
  remain)**
- Full plugin framework: `gameplay-framework` + 4 reference
  plugins + 13-subcommand CLI + content store + community registry
- Full UI framework: `ui-framework` + `ui-widgets` (15 widgets) +
  UILayoutEditor + ManifestHud + theme system + input rebinding +
  per-player overrides + viewport variants
- Full World Studio editor: 21 panels, 18 property editors, 6
  procgen pipeline algorithms, deployment workflow
- Full WorldBuilder editor: terrain painter, foliage, water shader,
  procedural assets
- Asset pipeline: GLB decimation, LOD baking, impostor baking,
  VAT baking, vertex color baking
- AI generation pipeline: 6 Claude/OpenAI services, 3 ElevenLabs
  services, GPT-5 Vision, PlaytesterSwarm
- Runtime: gameMode + ScriptingSystem + ScriptGraphInterpreter
  (with PIE) + BehaviorTreeInterpreter
- PIE editor session with ServerNetwork loopback, hot-reload,
  `updateManifests()` covering 87+ manifest kinds
- Cross-chain on-chain layer: MUD contracts on Base mainnet/BSC/
  Avax + Solana Anchor program (devnet)
- Streaming GPU infra: Vast.ai keeper + RTMP muxer
- Marketing site + mobile app shells + ElizaOS plugin

### What's actually NOT done (real gaps, refreshed)

Two old gaps moved heavily this session, several remain unchanged:

1. ~~**Engine/game separation** — 1,044 Hyperscape identifiers + 343
   game-system files still in `packages/shared/`.~~ **PARTIALLY
   RESOLVED.** All network handlers + character-selection now
   plugin-side. Remaining shared-side game code is in
   `packages/shared/src/data/*.ts` (Phase A territory) and
   `packages/shared/src/types/game/*.ts` (game-specific types
   that engine substrate references via duck-typing).

2. **Plugin system not wired into prod startup** — gameplay-framework
   exists, plugin-hyperscape exists with 14 handler families and 4
   substrate-promoted services, but neither server nor client
   *boots through* the plugin loader. (#1 on prior top-10 — still
   #1.)

3. **Per-widget HUD migration** — only 5 of ~24 HUD elements
   migrated to widgets; ~50 panels have no widget. (No change.)

4. **Plugin Browser UI** — 107 TypeScript types shipped, zero React
   components rendering them. (No change.)

5. ~~**Consumer wiring of registries** — 10 of 104 registries have
   `onReloaded`; ~3 React UI consumers actually subscribe.~~
   **MOSTLY RESOLVED** (REFRESH 4, 2026-04-27 evening):
   **100/104 manifest registries now have `onReloaded`** (cuts #10–#28
   shipped 90 instrumentations across one session). Reusable
   `useRegistryReload` hook published in `@hyperforge/ui-widgets`
   wraps the subscription pattern over `useSyncExternalStore` —
   `const rev = useRegistryReload(registry)` replaces the hand-rolled
   `useState + useEffect` boilerplate. Two existing client consumers
   (XPOrb HUD + SpellsPanel) migrated. The remaining gap is
   **breadth of consumers**, not the wiring contract: PIE editor
   panels still consume manifests through their own context-based
   pipeline rather than shared registries — that's a larger refactor
   for a future session.

6. ~~**Game data extraction (Phase A)** — NPCs, items, world
   structure, duel rules, banks, spells, runes still hardcoded in
   `packages/shared/src/data/*.ts`.~~ **RESOLVED** (re-audit
   2026-04-26 evening): every `shared/data/*.ts` file is already a
   manifest façade — they load JSON, validate against a Zod schema,
   and expose the legacy export shape for backward compat. Same
   for all `shared/constants/*.ts`. Phase A is at ~85%. The
   remaining 15% is editor-side coverage (Phase B territory) and
   minor type relocation (Session 7).

7. **ManifestEditors UI breadth** — only 8 of 129 manifest schemas
   have dedicated editor UIs. (No change.)

8. **Hygiene** — ~~4,019-line CombatSystem (now plugin-side, target
   <2,000)~~ **RESOLVED REFRESH 5 — 1,359 LOC (-66.6%)**;
   3,208-line Entity.ts (target <1,500), ~2,267 console.* calls,
   4,309 skipped tests. (Marginal improvement: 73 typecheck errors
   cleared.)

9. **DataSourceRegistry (D8)** + **ui-pack.json (D9)** + **D10
   exit gate** in Phase D. (No change.)

10. **AI services have zero test coverage** — 10 AI integrations
    operational but untested. (No change.)

### What's NOT in the master plan but exists (unchanged)

- Cross-chain duel oracle (EVM + Solana) — ~80%
- Streaming GPU pipeline (Vast.ai)
- Mobile app (Tauri + Capacitor)
- Marketing website (live)
- Sim-engine
- Gold-betting demo

---

## Top 10 highest-leverage REMAINING work (refreshed)

The prior list's #2 was the XL "biggest unknown" that's mostly
resolved. The new list reorders:

| # | Item | Phase | Effort | Why now |
|---|---|---|---|---|
| ~~1~~ | ~~**Wire plugin system into server/client startup**~~ | ~~post-I~~ | ~~S~~ | **DONE (audit re-verification 2026-04-27 evening)** — server `bootServerPlugins` + client `bootClientPlugins` both invoke `startPluginSessionFromModules` in production boot. Hyperscape meta-plugin's `onEnable` registers entity types + widgets + systems on the host world. 8/8 server plugin-boot tests green. |
| ~~2~~ | ~~**Game-data JSON extraction**~~ | ~~A~~ | ~~M~~ | **RESOLVED 2026-04-26 evening** — re-audit found all data/*.ts and constants/*.ts files already façaded |
| ~~3~~ | ~~**Plugin Browser UI**~~ | ~~I5~~ | ~~M~~ | **DONE** — `PluginBrowserPanel.tsx` (666 lines) ships Browse + Installed tabs with `useSyncExternalStore` over the installed-plugins store, install button, sha-verified content download. |
| ~~4~~ | ~~**D7 plugin widget contribution + D6.c.1 (XP orb)**~~ | ~~D~~ | ~~S~~ | **DONE** — `XPOrbWidget.tsx` + `LevelUpToastWidget.tsx` ship from `@hyperforge/hyperscape-plugin/src/widgets/`, registered via `ctx.widgets?.register(...)` in plugin onEnable. Both widgets unit-tested. Pattern established. |
| 5 | **D6.c per-widget migration (19 HUDs + 50 panels)** | D | L | Closes the HUD framework |
| ~~6~~ | ~~**AI service test coverage**~~ | ~~H~~ | ~~M~~ | **RESOLVED 2026-04-26 evening — Session 6 shipped 136 unit tests across 9 services. All AI integrations now have happy/error/parameter coverage under mocked SDKs.** |
| 7 | **DataSourceRegistry (D8) + ui-pack.json (D9)** | D | M | Closes UI framework story |
| 8 | **Final shared cleanup** (`data/duel-manifest.ts` substrate, `types/game/*` extraction) | A/I | M-L | Path to "shared has zero Hyperscape identifiers". **PARTIAL 2026-04-27 — REFRESH 6**: 4 type files migrated (quest-types/social-types/trade-types to plugin; interaction-types deleted as dead code). `packages/shared/src/types/game/` 11 files → 7. -1,124 LOC migrated + -150 dead-code purge across slices `d879d8450` `877446dde` `e042cb6a8` `dae4ebcba`. Recipe-exhaustion confirmed for the 6 remaining files (combat-types, duel-types, inventory-types, item-types, prayer-types, resource-processing-types) — each has engine-tied internal consumers and needs its own M-L substrate refactor (PrayerDataProvider migration, DuelSystem interface relocation, footprint-types split into shared/types/world/, etc.). |
| ~~9~~ | ~~**CombatSystem decomposition (4,019 → <2,000)**~~ | ~~K4~~ | ~~L~~ | **RESOLVED 2026-04-27 — REFRESH 5: 17-slice decomposition shipped on `feat/world-studio` (commits `780ad016e` → `5f7fda8a9`). `CombatSystem.ts` 4,065 → 1,359 LOC (-66.6%, ~30% below the <2,000 target). 16 cohesive helper files extracted: AttackValidator, FollowController, DamageApplicator, TickAttackWorker, ProjectileHitProcessor, TickOrchestrator, EnterLifecycleHandler, MeleeAttackHandler, RangedAttackHandler, MagicAttackHandler, EventEmitter, PlayerQueries, EventRecorder, DamageOrchestrator, DeathHandler, LifecycleHandler. Plus 3,142 LOC of orphan dead code (handlers/{Melee,Ranged,Magic}AttackHandler + handlers/AttackContext + CombatTickProcessor + CombatAnimationSync) purged in slice 17 — confirmed unused via mono-repo grep. 198/198 plugin tests green throughout; shared build clean.** |
| ~~10~~ | ~~**Long-tail registry consumer-wiring (~90 still unwired)**~~ | ~~F/G~~ | ~~M each~~ | **RESOLVED 2026-04-27 — 100/104 instrumented across cuts #10–#28; `useRegistryReload` hook in ui-widgets makes adding any new consumer a 1-liner. Remaining gap is consumer breadth (PIE editor panels), not contract wiring.** |

---

## Realistic remaining effort (refreshed)

If "done" = master plan's 7 success criteria all green:

**4–6 focused 2-hour sessions** for the remaining open top-10 items
— down from 8–12 before REFRESH 5 because items #1, #2, #3, #4, #6,
#9, #10 are now closed.

- ~~1 session: wire plugin system into prod (item 1)~~ **DONE**
- ~~1–2 sessions: game-data JSON extraction (item 2)~~ **DONE**
- ~~1–2 sessions: Plugin Browser UI (item 3)~~ **DONE**
- ~~1 session: D7 + D6.c.1 (item 4)~~ **DONE**
- 2–3 sessions: D6.c per-widget migrations (item 5)
- ~~1 session: AI test coverage (item 6)~~ **DONE**
- 1–2 sessions: D8/D9/D10 close-out (item 7)
- 1 session: final shared cleanup (item 8)
- ~~ongoing: CombatSystem decomposition (item 9)~~ **DONE — REFRESH 5**
- ~~ongoing: long-tail registry consumer-wiring (item 10)~~ **DONE — REFRESH 4**

If "done" = also includes the non-plan work that's been started:
- Cross-chain mainnet hardening: 1–2 sessions
- Streaming pipeline integration: 2–3 sessions
- Mobile app polish: 2–3 sessions
- AI service hardening: 1–2 sessions

So **realistically 10–14 sessions** total to ship a complete
package — saved sessions across REFRESH 4 (item #10) and REFRESH 5
(item #9) bring the headline estimate down by 2–4 sessions vs the
pre-REFRESH-4 cut.

---

## Confidence in this refreshed audit

| Claim | Confidence | Evidence |
|---|---|---|
| Engine/game separation: 5 → 70% | **high** | Direct file inventory: `shared/handlers/` empty except common/, character-selection.ts gone, 9 substrate types proven, 14/14 handler families plugin-side |
| Phase I now ~92% | high | Plugin barrel re-exports cover the shipped surfaces; Plugin Browser UI is the only remaining I5 piece |
| Server typecheck 107 → 34 | **high** | Direct `tsc --noEmit` count, fully reproducible |
| Plugin tests 187/187 throughout 27 commits | **high** | Logged on every commit |
| Phase A still ~40% | high | `packages/shared/src/data/*.ts` and `types/game/*.ts` unchanged this session |
| Phase D still ~78% | high | UI framework files unchanged this session |
| Phases B, C, E, F, G, H, J unchanged | high | These weren't touched |
| Overall ~75% | medium | Phase weighting is somewhat subjective; criterion #2 weight is significant. Updated post-Session 6.9 (final AI service test). |

---

## Final TL;DR

**Two days of focused work converted the engine/game separation
from a 5%-complete biggest-unknown into a 70%-complete near-done.**
The substrate-promote pattern (interface in shared substrate, plugin
installs concrete implementation, shared internals lazy-resolve)
proved 5× this session and is the unblock-tool for any remaining
engine-coupled game code.

**Status: ~80–82% to AAA done. Plugin tests stable at 198/198. Asset-forge AI service tests: 136/136 across 9 services. **REFRESH 6 (2026-04-27 mid-morning): types/game/ migration partial. 4 slices on `feat/world-studio` (commits `d879d8450` → `dae4ebcba`); 4 type files migrated to plugin (quest-types, social-types, trade-types) or deleted as dead code (interaction-types). `packages/shared/src/types/game/` 11 → 7 files. -1,124 LOC migrated + -150 dead-code purge. 4 substrate-promotes (QuestProgress duck-type, SOCIAL_CONSTANTS + TRADE_CONSTANTS inline, ClientNetwork pass-through types, TradingSystem interface relocation). Recipe-exhaustion confirmed for the 6 remaining files in types/game/.** REFRESH 5 (2026-04-27 late-morning): CombatSystem decomposition shipped on `feat/world-studio` (commits `780ad016e` → `5f7fda8a9`). 4,065 → 1,359 LOC (-66.6%, ~30% below the original <2,000 target) across 17 slices, plus 3,142 LOC of orphan dead code purged. REFRESH 4 (2026-04-27 evening): registry hot-reload long-tail shipped. 100/104 manifest registries instrumented with `onReloaded` across 19 cuts; `useRegistryReload` hook published. Branch pushed and ready for review.

The work pattern has shifted from "find structural blockers" to
"finish enumerable items":

| Old top-10 entry | Status |
|---|---|
| Wire plugin into prod | unchanged (S) |
| **Hyperscape→plugin extraction (XL biggest unknown)** | **mostly done** ✅ |
| D7 plugin widget + XP orb | unchanged (S) |
| Plugin Browser UI | unchanged (M) |
| D6.c per-widget migration | unchanged (L) |
| Game-data JSON extraction | unchanged (M) |
| ~~AI service test coverage~~ | **DONE — Session 6 closed (M)** |
| DataSourceRegistry / ui-pack | unchanged (M) |
| ~~CombatSystem decomposition~~ | **DONE — REFRESH 5 closed (4,065 → 1,359 LOC, -66.6%; 16 helpers + 3,142 LOC dead-code purge)** |
| ~~Long-tail registry wiring~~ | **DONE — REFRESH 4 closed (M each → 100/104 instrumented)** |

With #1, #2, #3, #4, #6, #9, #10 closed and #8 partially advanced
(REFRESH 6 — 4 slices shipped), the remaining top-10 items are:
- **#5** (D6.c per-widget migration, L) — long-tail UI migration that gates Phase D's exit
- **#7** (DataSourceRegistry + ui-pack, M) — closes UI framework story
- **#8 remainder** (M-L per remaining file) — 6 type files left in
  `shared/src/types/game/`, each needing a substrate refactor (e.g.,
  PrayerDataProvider migration, DuelSystem interface relocation,
  footprint-types split). No more "easy cuts" here.

The next session's natural unit is **#7** (DataSourceRegistry/D8 +
ui-pack/D9) — clearest scope with M-effort. #8 remainder is harder
than originally estimated and #5 is the long-tail.
