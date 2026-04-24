# Hyperscape Progress Audit — 2026-04-24

**Brutally honest, evidence-based assessment of where we actually are
toward the goal stated in `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.**

Produced by 4 parallel deep-dive audits + cross-cutting synthesis.
All numbers are grep counts, file counts, or direct file inspection.

## Overall verdict

**~35–45% of the way to "truly AAA, truly done."**

The substrate is largely built. The consumers and the
engine/game separation are not. The plugin system is built but
not yet running in production.

| Layer | Completeness | Confidence |
|---|---|---|
| Schemas + Providers + Registries (substrate) | **~85%** | high |
| UI framework + widget catalog (substrate) | **~80%** | high |
| Plugin framework + CLI + content store (substrate) | **~88%** | high |
| Editor (PIE + Layout Editor + Property panels) | **~70%** | medium |
| Consumer wiring (substrate → real game code) | **~10–15%** | high |
| Hyperscape RPG → plugin extraction | **~5%** | high |
| Engine/game separation in `packages/shared/` | **~5%** | high |
| Hygiene (logger, decomposition, skipped tests) | **~10%** | high |

---

## Phase-by-phase honest status

| Phase | Plan name | Audited % | Headline |
|---|---|---|---|
| 0 | Foundation | 100% | Done. |
| A | Constants → manifests | **30%** | A1+A2 done. ~6 data tiers + 10 live-files NOT extracted. |
| B | Manifest editors | ~35% | Many "Editor UI still pending" notes. |
| C | Property panel schema refactor | ~50% | `SchemaPropertyEditor` exists; widget property inspector uses `UI_PROP_FIELD_TYPES`. Not blocker for D. |
| D | UI/HUD framework | **78%** | D1–D5 + U0–U11 done. D6.c (per-widget migration), D7 (plugin contrib), D8 (DataSourceRegistry), D9 (ui-pack), D10 (exit gate) NOT done. |
| E | Audio/VFX/Anim/Input | ~30% | Substrate registries shipped (SFX/VFX/Animations/CameraProfiles/etc.). Almost no runtime consumers. |
| F | Progression/Economy/Loc/Render | ~40% | xp-curves + skill-icons + combat-spells now have React consumers (this session). The other ~30 still unwired. |
| G | Missing systems | **5%** | Substrate registries shipped (auction-house, housing, group-finder, respawn, crash-reporter, talent-trees, transmog…). Zero runtime systems exist. |
| H | AI behavior as data | **0%** | Not started. Schemas unblock it. |
| I | Plugin architecture | **88%** | I1–I4 done. I5 ~95% (only Plugin Browser UI + prod wiring left). **Plugin system not yet wired into server/client startup.** |
| J | Editor UX (UE5 parity) | ~10% | Undo/redo, multi-select bulk edit, snap systems, keybind UI mostly NOT started. |
| K | Hygiene | **~10%** | 2,267 console.*, 4,019-line CombatSystem, 3,208-line Entity.ts, 4,309 skipped tests, 90 `as unknown as`. |

---

## Substrate audit (manifest schemas + providers + registries)

**Shipped:**
- **128 manifest schemas** in `packages/manifest-schema/src/` (Zod, fully validated)
- **128 providers** in `packages/shared/src/data/*Provider.ts`
- **104 module-level registries** with `isLoaded(): boolean` markers
- **91 of 128 providers boot-load** through `DataManager.ts` (37 dead weight)
- **PIE `updateManifests()` covers ~87 manifest kinds** with hot-reload

**Hollow:**
- **Only 10 registries have `onReloaded()` listener API** (all 10 added this session: xpCurve, worldAreas, damageType, runes, combatSpells, npcDefinitions, skillIcons, npcSizes, treeCatalog, mount).
- **94 registries are receive-only** — `DataManager` populates them at boot, PIE may dispatch updates, but the registries themselves have no notification mechanism for consumers to subscribe to.
- **Only 5 registries are exported from `packages/shared/src/index.ts`** (the top-level barrel). The other 99 require relative-path imports — fragmented public API.
- **Estimated 5–10 registries have any runtime consumer** at all. Of the 104 registries, the majority is dead substrate.
- **3 React HUD consumers exist** (all wired this session): xp-orb, level-up popup, spellbook.

**Honest aggregate**: 128 schemas + 128 providers shipped (~85% substrate complete), but only ~10–15% of those are actually consumed by runtime code or UI. The Apr 23 audit's "5% consumer ratio" claim is corroborated.

---

## Plugin architecture audit (Phase I)

**I1 — `@hyperforge/gameplay-framework`** ✅ **100% DONE**
- 13 CLI subcommands (init/validate/lint/list/show/graph/snapshot/diff/contributions/pack/publish/install)
- 6,537 LOC of tests across 16 test files
- All lifecycle types, context scope, dependency resolver, contribution aggregator shipped

**I2 — Reference plugins** ✅ **100% DONE**
- `@hyperforge/combat`, `@hyperforge/skills`, `@hyperforge/plugin-hello-reference`, `@hyperforge/plugin-hyperia`
- All have manifests, lifecycle, contributions, and tests

**I3 — Editor plugin API** ✅ **100% DONE**
- 7 asset-forge server routes (`packages/asset-forge/server/routes/plugins.ts`, 518 LOC)
- 17 integration tests (`packages/asset-forge/server/routes/__tests__/plugins.integration.test.ts`)
- Routes: contributions, snapshot, content POST/GET, registry POST/GET/GET-by-id

**I4 — `@hyperforge/hyperscape` meta-plugin** ✅ **100% DONE**
- 103 LOC composing combat + skills via dependency graph
- 159 LOC of tests

**I5 — CLI + content store + community registry + Plugin Browser** ⚠️ **~80% DONE**
- ✅ CLI: all 13 subcommands work
- ✅ Server routes: full lifecycle (publish→registry→install with sha-verified content) — proven in 17 integration tests
- ❌ **Plugin Browser UI: NOT STARTED.** The `packages/shared/src/plugin/` directory has 107 `PluginBrowser*` TypeScript types (snapshot/view/sort/search/filter/grouping/scroll-memory/deep-link/undo-stack/bulk-selection) but **no React component** in `packages/asset-forge/src/components/` actually renders them.

**Critical gap not in original phase definition:**
- ❌ **Production wiring: NEITHER server NOR client boots a plugin via the gameplay-framework today.** The plugin system is fully built and tested but exists in isolation. No `loadPlugin`, `startPluginsInOrder`, or `HyperforgePlugin` call exists in `packages/server/` or `packages/client/`. Once production wiring lands, every Hyperscape registry/system can be wrapped as a plugin and the engine/game separation begins.

---

## UI framework audit (Phase D)

**Confirmed "~80% complete" claim from PLAN_PHASE_D.md.**

**Shipped (D1–D5 + U0–U11):**
- `@hyperforge/ui-framework` (15 source files, 3,727 LOC, 3,183 LOC of tests)
- `@hyperforge/ui-widgets` — 15 widget schemas + React components (HpBar, ActionBar, Chat, Inventory, Bank, Equipment, Friends, Minimap, Prayer, Quests, Settings, Skills, Spells, Stats, Tooltip — 2,731 LOC)
- `ManifestHud` mounted in `packages/client/src/game/interface/InterfaceManager.tsx:477` (default-on, opt-out via `VITE_DISABLE_MANIFEST_HUD`)
- `UILayoutEditorPage` in asset-forge with 11 component files (palette, outliner, canvas with snap+guides, anchor picker, viewport switcher, property inspector, validation, library)
- Theme system, input rebinding, per-player overrides, viewport variants, visibility rules
- All U0–U11 substrate from `PLAN_UI_PACK_AAA.md` shipped

**Migration status:**
- **24 HUD files** in `packages/client/src/game/hud/`: only **5 widgets exist** for them (Minimap, ActionBar, HpBar, Chat, Tooltip). **19 still hand-coded** with no widget.
- **102 panel files** in `packages/client/src/game/panels/`: **~15 widget schemas exist** but every panel still mounts via the legacy `windowStore`. **~50+ panels have no widget at all**.
- **Plugin contribution surface (D7)**: NOT shipped. `PluginContextBase` has no `widgets` field — plugins cannot ship UI yet.
- **DataSourceRegistry (D8)**: NOT shipped. `dataContext.ts` is hand-rolled per-binding projection.
- **`ui-pack.json` (D9)**: NOT shipped. No schema, no consumer.
- **Exit gate (D10)**: blocked on every per-widget migration (D6.c) being complete.

**Concrete first PR identified** (per `PLAN_PHASE_D.md`): D7 (plugin contrib surface) + D6.c.1 (XP orb migration) together, ~28 files across 4 packages, 1–2 sessions.

---

## Engine/game separation audit (Phase A + master criterion #2)

**This is the single biggest gap.** Master plan success criterion #2:
*"`packages/shared/` contains zero Hyperscape-specific identifiers."*

**Reality:**
- **1,044 Hyperscape-specific identifiers** in `packages/shared/src/` (lumbridge, goblin, varrock, falador, edgeville, scimitar, OSRS, rs-classic, bandit, etc.)
- **343 game-specific system files** in `packages/shared/src/systems/`. Combat (64), character (5), economy (5), interaction (7), and 200+ more — none extracted to plugins.
- **20 game-specific entity classes** in `packages/shared/src/entities/` (PlayerEntity, MobEntity, ItemEntity, ResourceEntity…) — none migrated to plugins.
- **Hardcoded game data files** still in `packages/shared/src/data/` (NOT manifests, NOT providers, just raw exports):
  - `world-structure.ts` (419 LOC) — world zones, buildings
  - `duel-manifest.ts` (427 LOC) — duel rules
  - `world-areas.ts` (203 LOC) — area definitions
  - `npcs.ts` (279 LOC) — NPC definitions (façade over registry, but still hardcodes the fallback)
  - `items.ts` (196 LOC) — item definitions
  - `banks-stores.ts` (167 LOC) — bank/store layouts
  - `combat-spells.ts`, `runes.ts`, `smithing-recipes.ts`, `avatars.ts` (~600 LOC combined)
  - **10 `*-live.ts` files** in `data/live/` (~6,000 LOC) using in-place Map hot-reload, not manifest-backed
- **CombatSystem.ts**: **4,019 lines** (target <2,000). Handlers extracted but the core is still oversized.
- **Entity.ts**: **3,208 lines** (target <1,500). Some manager-delegation but still monolithic.
- **2,267 `console.*` calls** in `packages/shared/src/` (target <500). No unified logger module shipped.
- **90 files with `as unknown as`** (no `@ts-ignore` though — that part is clean).
- **4,309 skipped/.todo tests** across the monorepo. Critical testing debt.
- **Only 2 real end-to-end integration tests** in the entire repo (xp-curves + loot-tables substrate-integration). The Apr 23 audit's "0 end-to-end integration tests" claim is essentially still true.

**ServerNetwork migration**: ✅ **DONE.** Steps 1–9 complete. `PIEEditorSession` runs the real `ServerNetwork`+`ClientNetwork` loopback in-process. Re-export shims removed.

---

## Top 10 highest-leverage remaining work (ranked)

| # | Item | Phase | Effort | Impact | Why |
|---|---|---|---|---|---|
| 1 | **Wire plugin system into server/client startup** | I (post-I5) | M | **CRITICAL** | Unlocks every Hyperscape system being a plugin. Today the framework is unused in prod. |
| 2 | **Move Hyperscape RPG content to `@hyperforge/hyperscape-plugin`** | I + A | XL | **CRITICAL** | Closes engine/game separation. ~343 system files + 1,044 identifiers + game data. |
| 3 | **D6.c per-widget migration (19 HUDs + 50 panels)** | D | L | HIGH | Closes HUD framework. Per-PR deletes one hand-coded mount. |
| 4 | **D7 plugin widget contribution surface + D6.c.1 XP orb** (one PR) | D | S | HIGH | Establishes the pattern. 1–2 sessions. |
| 5 | **Plugin Browser UI** (consumes existing routes + 107 types) | I5 | M | HIGH | Closes Phase I. UI work, needs browser session. |
| 6 | **Game data JSON extraction** (NPCs/items/world/duel/banks/spells/runes ~2k LOC) | A | M-L | HIGH | Real prerequisite for separation. |
| 7 | **D8 DataSourceRegistry** | D | M | MEDIUM | Lets plugins contribute data sources to widgets. Decouples client from hand-rolled context. |
| 8 | **Live-file → manifest migration** (10 `*-live.ts` files, ~6k LOC) | A | M | MEDIUM | Unifies hot-reload story across boot-load and PIE paths. |
| 9 | **CombatSystem decomposition (4,019 → <2,000)** | K4 | L | MEDIUM | Maintenance + plugin-extractability. |
| 10 | **Consumer-wire the long tail of registries** (~90 unwired) | F/G | M (per slice) | LOW-MEDIUM each | Each closes one substrate→consumer loop. Big footprint cumulatively. |

---

## Realistic remaining effort

If the goal is **all 7 success criteria from the master plan**, including:
- ✅ Every Gap Matrix row green
- ✅ Zero Hyperscape identifiers in `packages/shared/`
- ✅ Hyperscape runs entirely from manifests + plugins
- ✅ A new game ("Top-Down Shooter") buildable in World Studio
- ✅ Plugin Browser ships
- ✅ `/super-audit` clean
- ✅ AI layer can target every manifest kind

**Honest estimate: 8–14 focused 2-hour sessions of work**, distributed roughly:
- 3–4 sessions: Plugin system wired into prod + Hyperscape→plugin migration (steps 1–2 above)
- 2–3 sessions: D6.c HUD/panel migrations to widgets
- 1 session: D7 + D6.c.1 (the catalytic pattern)
- 1 session: Plugin Browser UI
- 1–2 sessions: Game data JSON extraction
- 1–2 sessions: Hygiene (Logger migration, CombatSystem split, skipped tests pass)
- 1 session: D8 + D9 + D10 close-out

The **biggest unknown** is item #2 (Hyperscape→plugin extraction). Could be 1 session or 8 depending on how deeply game logic is interleaved with engine logic. Given 343 system files and 1,044 identifiers, the realistic floor is 3–4 sessions of careful migration with continuous test verification.

---

## Recommended path forward (ranked)

The 5-step sequence that closes the most criteria fastest:

1. **Wire plugin system into the server boot path.** Smallest possible PR: `packages/server/src/server.ts` (or wherever world boots) calls `loadPluginsFromBundle(...)` after the world is created but before `world.init()`. Use `@hyperforge/hyperscape` meta-plugin as the bootstrap. **No-op behavior change** if the plugin's onLoad is no-op. This unlocks every subsequent step.
2. **Ship D7 + D6.c.1 as one PR.** Plugin contribution surface for widgets + migrate the XP orb. Establishes the pattern. 28 files, 1–2 sessions.
3. **Plugin Browser UI.** Consume the 7 server routes + the 107 PluginBrowser* types. UI session, browser-testable.
4. **Migrate Hyperscape content to the meta-plugin in waves.** One system at a time. Each PR moves a system from `packages/shared/src/systems/` to `packages/hyperscape-plugin/src/systems/`, deletes the shared copy, and confirms the plugin's `onLoad` registers it. Continuous test runs verify no regression.
5. **D6.c HUD/panel migration loop.** Per HUD/panel, define widget schema + adapter + layout entry, delete hand-coded mount. Run the existing widget tests + visual smoke after each.

Steps 1, 2, 3 are independent; do them in parallel sessions if possible.

---

## What this audit corrects in earlier estimates

| Earlier claim | Corrected |
|---|---|
| Phase D ~15% | **~78%** (substrate massive, only D6.c migration + D7-D10 left) |
| Phase I ~90% | **88% confirmed** but production wiring (not in original I1-I5 spec) is missing |
| Substrate ~25% | **~85% complete** for schemas/providers/registries; **~10–15% complete** for consumers |
| Engine/game separation in progress | **~5%** — 1,044 identifiers + 343 systems still in shared |
| "5% have runtime consumers" (Apr 23) | **Still essentially true.** This session added 3 React consumers and 10 onReloaded hooks; the long tail remains. |

---

## Confidence in this audit

| Area | Confidence | Notes |
|---|---|---|
| Schema/provider/registry counts | high | direct file counts |
| Plugin architecture status | high | direct read of all 4 plugin packages + tests + routes |
| UI framework status | high | direct file inventory of 3 packages + asset-forge editor |
| Engine separation contamination | high | grep counts of identifiers; line counts of files |
| Hygiene metrics | high | grep counts of console.*, .skip, as unknown as |
| Phase % estimates | medium | depends on how phases are weighted; substrate vs. consumer split is the swing factor |
| Effort estimates (sessions remaining) | low-medium | item #2 (Hyperscape→plugin) is the biggest unknown |

---

## TL;DR

We have built **most of the substrate** (schemas, providers, registries,
plugin framework, UI framework, editor). We have wired **almost
none of the consumers**. The plugin system that's supposed to make
Hyperscape "a plugin" is fully built but **not yet running anywhere** —
that's the single biggest leverage point. Once it's wired into prod
and Hyperscape content is migrated to the meta-plugin, every other
phase becomes easier and the engine/game separation criterion starts
making real progress.

**~35–45% to AAA-done. ~8–14 focused sessions remaining if executed
in the recommended order.**
