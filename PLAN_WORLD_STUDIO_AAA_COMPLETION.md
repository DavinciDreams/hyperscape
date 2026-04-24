# World Studio — AAA Completion Plan (v2, comprehensive)

**Status:** Draft v2 — 2026-04-18
**Successor to:** `PLAN_SERVERNETWORK_MIGRATION.md` (Steps 1–9 ✅), `PLAN_ENGINE_GAME_SEPARATION.md`

## The True Goal

> Build backwards from Hyperscape to a **UE5-equivalent AI game studio pipeline**. Hyperscape is the *reference game*, not the engine. Every behavior, list, constant, curve, widget, sound, and pixel of Hyperscape must become a **data-driven building block** that designers (and eventually AI) compose inside World Studio — **without regressing Hyperscape itself**.

This means: if you can tune it, tweak it, or see it in Hyperscape, it must be editable in World Studio, and it must be possible to build a completely different game (Diablo-like, FPS, platformer) from the same blocks.

---

## Invariant — "No Regression"

Every extraction lands in two commits:
1. **Extract** — constant/config moves to JSON manifest; loader wired; Hyperscape still runs identically.
2. **Expose** — editor panel added; round-trip to manifest verified.

Tests must stay green every commit. `CombatConstants.ts` becoming `combat-constants.json` changes zero gameplay.

---

## Guiding Principles

1. **Games are data.** A game = a manifest graph (entities, items, UI layouts, scripts, plugins).
2. **Hyperscape is a plugin bundle**, not engine core.
3. **One editor, many games.** Zero game-specific panels inside `asset-forge`.
4. **UE5 workflow parity.** Content browser, outliner, details, viewport, PIE, blueprint, plugins.
5. **Manifest-first, code-last.** If a non-engineer would tune it, it's data.
6. **AI-ready substrate.** Every editable block has a typed schema so AI can generate/mutate it safely.

---

## The Comprehensive Gap Matrix

Scale: ✅ data+editor · 🟠 data only (no editor) · 🟡 data-adjacent TypeScript (`src/data/*.ts`) · 🔴 hardcoded in system code · ❌ not implemented

### 1. Hardcoded constant files → must become manifests

All of `packages/shared/src/constants/*.ts` — these are hardcoded Hyperscape numbers and enums. Every one needs an extraction commit + editor panel.

| File | Hardcoded content | Target manifest |
|---|---|---|
| `TreeTypes.ts` | normal/oak/willow/maple/yew/magic + XP + level req + log id | `trees.json` + TreeEditor |
| `CombatConstants.ts` | base accuracy, damage curves, XP multipliers | `combat-constants.json` |
| `GatheringConstants.ts` | tick rate, success rates, tool requirements | `gathering-constants.json` |
| `ProcessingConstants.ts` | cooking/firemaking success tables | `processing-constants.json` |
| `SmithingConstants.ts` | bar → ingot ratios, hammer reqs | `smithing-constants.json` |
| `EquipmentConstants.ts` | slot enums, stat caps | `equipment-config.json` |
| `BankEquipmentConstants.ts` | bank slot rules | `banking-config.json` |
| `BankingConstants.ts` | bank tab count, stack rules | `banking-config.json` |
| `WeaponStyleConfig.ts` | style → stat mapping | `weapon-styles.json` |
| `GameConstants.ts` | tick rate, default XP, spawn radii | `game-constants.json` |
| `interaction.ts` | interaction ranges, priorities | `interaction-config.json` |

### 2. Pseudo-data in `src/data/*.ts` → promote to JSON

Files under `packages/shared/src/data/` are TypeScript modules pretending to be data. They need to become real JSON with schemas + editors.

| File | Move to |
|---|---|
| `items.ts` | `items/*.json` (already manifest in server/world/assets — consolidate) |
| `npcs.ts`, `npc-sizes.ts` | `npcs.json` (already manifest — consolidate) |
| `runes.ts` | `runes.json` ✓ |
| `combat-spells.ts` | `combat-spells.json` ✓ |
| `spell-visuals.ts` | `spell-visuals.json` + VFXEditor |
| `skill-icons.ts` | `skill-icons.json` + asset refs |
| `skill-unlocks.ts` | `skill-unlocks.json` + editor |
| `playerEmotes.ts` | `emotes.json` + EmoteEditor |
| `avatars.ts` | `avatars.json` + AvatarBrowser |
| `arena-layout.ts` | `arena-layouts.json` + layout editor |
| `duel-manifest.ts` | `duel-config.json` + editor |
| `world-areas.ts` | `world-areas.json` ✓ (editor partial) |
| `world-structure.ts` | `world-structure.json` + region editor |
| `banks-stores.ts` | `stores.json` ✓ + placement editor |
| `smithing-recipes.ts` | `recipes/smithing/*.json` + RecipeEditor |
| `ammunition.ts` | `ammunition.json` |
| `NoteGenerator.ts` | keep as logic; config via manifest |
| `*DataProvider.ts` | keep as adapters; consume JSON manifests |

### 3. UI / HUD — currently hardcoded React + client systems

Hyperscape UI is baked into `packages/shared/src/systems/client/*` and React components. For multi-game studio, these must be **themeable + layout-configurable per game**.

| UI surface | Current | Needs |
|---|---|---|
| Inventory panel | hardcoded React | Data-driven layout (slots, size, themes) |
| Bank UI | hardcoded | Layout manifest + theme |
| Shop UI | hardcoded | Layout manifest + theme |
| Minimap | hardcoded | Layout manifest (size, position, world→map proj) |
| Chat panel | hardcoded | Channel config, layout, theme |
| HUD (HP, prayer, stamina) | `ClientInterface.ts` | Widget manifest (position, binding, style) |
| Damage splats | `DamageSplatSystem.ts` | Style/palette + animation curves in manifest |
| XP drops | `XPDropSystem.ts` | Style + curves in manifest |
| Health bars | `HealthBars.ts` | Style manifest (colors, size, offset) |
| Combat ticks | hardcoded | Tuning in combat manifest |
| Context menu | hardcoded | Action schema + verbs per entity kind (already partial via GameModule) |
| Tooltips | hardcoded | Tooltip template per entity kind |
| Death screen | hardcoded | Layout manifest |
| Teleport VFX | `ClientTeleportEffectsSystem` | Particle manifest + sound cue |
| Duel countdown | `DuelCountdownSplatSystem` | Style manifest |
| Zone name banners | `ZoneVisualsSystem` | Style manifest |
| Main menu / login | hardcoded | Per-game manifest |
| Settings menu | hardcoded | Per-game sections + keys |

**Approach**: `UILayoutManifest` + widget registry. Widgets are plugin-registered React components with typed props. Layouts reference widgets by id. World Studio gets a **UI Editor** (drag widgets onto a canvas, bind to data).

### 4. Audio — currently hardcoded file refs

`ClientAudio.ts` + scattered `.play()` calls. Needs:
- `sounds.json` — all SFX entries (id, url, volume, category, loop)
- `music.json` — background tracks by zone/biome
- Per-event cue mapping in relevant manifests (`teleports.json` has `enterSound`, `exitSound`, etc.)
- World Studio AudioBrowser + PerEntity sound pickers

### 5. VFX — particle / spell visuals

`spell-visuals.ts`, `ClientTeleportEffectsSystem.ts`, particle managers. Needs:
- `vfx.json` — particle presets (emitters, colors, curves, textures)
- VFXEditor in World Studio (live preview in viewport)
- Every ability/spell/teleport/death references a vfx id

### 6. Animations / emotes

`playerEmotes.ts`, `createEmoteFactory.ts`. Needs:
- `animations.json` — animation clips with metadata (loop, speed, root motion)
- Per-action animation binding in combat manifest, gathering manifest, etc.
- Emote palette editor

### 7. Input / controls

`ClientInput.ts`, hardcoded keybindings. Needs:
- `input-bindings.json` per gameMode (already Phase 5 GameMode — extend to cover every action)
- Keybinding settings UI (user-level override)
- Gamepad support + remapping

### 8. Progression / economy

Currently hardcoded curves inside systems. Needs:
- `xp-curves.json` — per-skill XP table (level → required XP)
- `drop-tables.json` — per-mob loot rolls (already partial)
- `economy.json` — gold values, shop markups, respawn timers
- Curve editor widget in World Studio

### 9. Localization / strings

Currently string literals everywhere. Needs:
- `strings.json` per locale
- `useString(key)` hook; codemod to replace literals
- Locale picker + translation status UI

### 10. Rendering / post-processing

`ClientGraphics.ts` — bloom, tone mapping, fog. Needs:
- `render-profile.json` per game (hyperscape-default, dark-dungeon, etc.)
- Settings panel with live preview

### 11. Missing systems (❌ not implemented)

- Day/night cycle
- Weather
- Dynamic music (state machine)
- Achievement system
- Quest journal UI
- Party/friends invite flow (partial)
- Accessibility (colorblind modes, text scale, reduced motion)
- Analytics events

### 12. AI behavior

Agent behavior ticker is code. Needs:
- `ai-behavior/*.json` (behavior tree / utility AI)
- Graph editor (reuse scripting Phase 10) with behavior-tree node library

### 13. Networking / replication

Currently all manually coded. Phase-E plugin work should expose a replication schema so plugins declare replicated fields + events.

### 14. Save data

Character schema hardcoded. Needs schema registry so plugins contribute their own save slices.

### 15. Editor UX gaps (UE5 parity)

| Feature | Status |
|---|---|
| Content Browser (unified asset/manifest tree) | 🔴 |
| Outliner with folders/layers/search | 🟡 |
| Details panel (schema-driven) | 🟡 |
| Multi-select + bulk edit | 🔴 |
| Snap-to-grid / vertex / surface | 🔴 |
| Universal undo/redo | 🟡 |
| Prefab/blueprint instancing | 🟡 |
| Script graph (blueprint) | ✅ |
| Play-in-editor | ✅ |
| Simulate mode (no pawn) | 🟡 |
| Keybinding customization | 🔴 |
| Plugin manager UI | ❌ |
| Marketplace / Fab browser | ❌ |
| Project settings panel (per-game config, gameMode, plugins) | 🟡 |
| Level streaming / sublevels | ❌ |
| Lighting baking (if static) | ❌ |
| Cinematic / sequencer | ❌ |
| Stats/profiler overlay in PIE | 🟡 |

---

## Phased Execution

### Phase 0 — Foundation (do first, small, unblocks everything)

- **0.1 [P0]** Delete committed `.js`/`.d.ts` artifacts under `packages/shared/src/` (stale pairs shadow `.ts` edits).
- **0.2 [P0]** Break `shared ↔ procgen` circular dep — extract `@hyperforge/types`.
- **0.3 [P0]** Fix MobEntity server-side validation bypass.
- **0.4** Stand up `/super-audit` runbook — one audit pass per phase exit.
- **0.5** Create `@hyperforge/manifest-schema` package: Zod schemas + type exports for every manifest kind. Single source of truth for runtime validation, TS types, and editor widget generation.

### Phase A — Extract hardcoded constants to manifests (no editor yet)

For each file in §1 and §2: create JSON manifest, rewrite loader to consume it, keep TypeScript exports as a thin façade that reads from DataManager. Tests stay green.

Exit: `packages/shared/src/constants/` is thin re-exports of DataManager lookups. `packages/shared/src/data/*.ts` is adapters, not data.

### Phase B — Manifest editors (visible progress)

- **B1** Content Browser shell (tabbed, search, filter, preview).
- **B2** One editor per manifest kind: Items, NPCs, Trees, Ores, Fish, Recipes (smithing/cooking/fletching/crafting), Prayers, Spells, Runes, Emotes, Avatars, Stores, Quests, Drop tables, XP curves, Skills, Tiers, World areas, Teleports.
- **B3** Every editor hot-reloads into PIE via DataManager.
- **B4** Audit sweep — verify every JSON in `server/world/assets/manifests/` round-trips.

Exit: every entry in gap matrix §1–§2 is ✅.

### Phase C — Property panel schema refactor

- **C1** Replace 32 hardcoded property panels with `SchemaPropertyEditor` driven by `GameModule.entityTypes[kind].fields`.
- **C2** Extend `FieldType` — `asset-ref`, `manifest-ref`, `multi-select`, `curve`, `color-ramp`, `keybinding`, `vector3`, `quaternion`, `script-ref`.
- **C3** Custom-widget escape hatch (`renderWidget`) for one-offs.
- **C4** HyperiaModule declares schemas; delete Hyperscape-specific panel components.

Exit: zero Hyperscape-specific React under `panels/properties/`.

### Phase D — UI / HUD framework (the big new one)

- **D1** `@hyperforge/ui-framework` — widget contract: `Widget<Props>` with typed schema.
- **D2** Registry: built-in widgets (HP bar, minimap, inventory, chat, tooltip, action bar).
- **D3** `UILayoutManifest` — references widgets by id, positions in anchored/grid/flex layout.
- **D4** UI Editor panel — drag widgets onto a canvas, bind props to data, live preview.
- **D5** Theme manifest — colors, fonts, spacing tokens.
- **D6** Migrate Hyperscape UI: convert each hardcoded panel/system in §3 into a registered widget + layout manifest. Verify pixel-parity.

Exit: `ClientInterface.ts` and friends render from a UI manifest; Hyperscape ships with `hyperscape-ui.json`.

### Phase E — Audio / VFX / Animation / Input

- **E1** `sounds.json`, `music.json`, AudioBrowser, cue binding in manifests.
- **E2** `vfx.json`, VFXEditor with viewport preview.
- **E3** `animations.json`, animation browser, per-action binding.
- **E4** Expanded input-bindings per gameMode; user-level keybinding UI.

### Phase F — Progression / Economy / Localization / Render

- **F1** XP curve editor, drop-table editor.
- **F2** Localization runtime + string key migration (codemod).
- **F3** Render profile manifest + settings panel.

### Phase G — Missing systems

- **G1** Day/night cycle + weather (manifest-configured).
- **G2** Quest journal UI widget.
- **G3** Achievements system.
- **G4** Accessibility settings + runtime.
- **G5** Analytics event schema.

### Phase H — AI behavior as data

- **H1** Behavior tree / utility AI node library inside scripting system.
- **H2** Migrate AgentBehaviorTicker logic → composable behavior graphs.
- **H3** DuelCombatAI tuning to manifest; strategy hooks exposed.

### Phase I — Plugin architecture (Steps 10–14)

- **I1 / Step 10** Extract `@hyperforge/gameplay-framework` — `HyperforgePlugin` contract, PluginContext, lifecycle.
- **I2 / Step 11** `@hyperforge/combat` as first reference plugin.
- **I3 / Step 12** Editor plugin API — plugins register entity schemas, property panels, palette categories, toolbar tools, manifest editors, widgets, systems.
- **I4 / Step 13** `@hyperforge/hyperscape` meta-plugin composes combat, skills, gathering, prayer, banking, etc. Engine core has **zero** Hyperscape imports.
- **I5 / Step 14** Plugin CLI (`hyperforge create-plugin`, `publish`) + community registry + in-editor Plugin Browser (Fab-inspired).

### Phase J — Editor UX to UE5 parity

- **J1** Universal undo/redo (all mutations through Command stack).
- **J2** Multi-select + bulk property edit.
- **J3** Snap systems (grid/vertex/surface).
- **J4** Keybinding customization UI.
- **J5** Deploy/Publish UI wired to `world_deployments`.
- **J6** Stats/profiler overlay in PIE.
- **J7** Project Settings panel (gameMode, plugins, render profile, default input).

### Phase K — Hygiene (continuous)

- **K1** Logger migration (2,500+ `console.*` calls → `logger`).
- **K2** `@ts-ignore` + `as unknown as` audit.
- **K3** Entity.ts (3,200L) decomposition.
- **K4** CombatSystem.ts (4,013L) — extract strategies.
- **K5** Dead code removal.
- **K6** Re-enable skipped tests.
- **K7** Run `/super-audit` at each phase exit; log findings as ADRs.

---

## Execution Order (recommended)

```
0 (foundation, ~1 day)
 → A (extract constants, ~1 week, no UI change)
 → C + B in parallel (schema refactor prereq for plugins; editors for user-visible progress)
 → D (UI framework — largest single phase)
 → E + F + G (content systems)
 → H (AI as data)
 → I (plugin architecture, the capstone)
 → J (UX polish, can slot throughout)
 → K (hygiene, continuous)
```

**Why this order:**
- Phase 0 unblocks everything.
- Phase A is pure extraction — fastest possible "Hyperscape is data" milestone with zero behavior change.
- Phase C must precede I (plugins can't ship hardcoded panels).
- Phase D is huge but orthogonal — can run in parallel with I once contracts land.
- Phase I is the architectural payoff; needs B/C/D contracts stable.

---

## Success Criteria ("truly AAA, truly done")

1. ✅ Every row in the Gap Matrix is ✅.
2. ✅ `packages/shared/` contains zero Hyperscape-specific identifiers.
3. ✅ Hyperscape runs *exactly* as it does today, loaded entirely from manifests + plugins.
4. ✅ A new game (e.g., "Top-Down Shooter") can be built in World Studio with:
   - Pick gameMode (WASD + fixed camera).
   - Load plugins (`@hyperforge/combat`, `@hyperforge/inventory`, custom weapons plugin).
   - Edit items/weapons/enemies as manifests.
   - Build UI via widget layout.
   - Hit Play → it works.
5. ✅ `/super-audit` at final phase exit reports zero P0/P1.
6. ✅ World Studio has a Plugin Browser (Fab analogue) with install/update/version.
7. ✅ AI layer (deferred) can target every manifest kind via typed Zod schemas.

---

## Tracking

- Each phase gets a sub-plan doc when it starts (`PLAN_PHASE_A.md`, etc.).
- This doc's phase table is the dashboard.
- Gap Matrix is the acceptance test — it must reach all ✅.

---

## Non-Goals (this plan)

- AI integration (hooked in after the substrate lands).
- Mobile editor (desktop web only).
- Real-time multi-user collab editing.
- Server-hosted marketplace billing (infra only in I5).
