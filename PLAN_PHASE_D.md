# Phase D — UI / HUD Framework

**Parent plan**: `PLAN_WORLD_STUDIO_AAA_COMPLETION.md` Phase D (D1–D6).
**Companion plan**: `PLAN_UI_PACK_AAA.md` (U0–U11 shipped the runtime
substrate; this plan drives Phase D to "a new game can ship a HUD
from manifests alone").

## Status

Started earlier than its slot in the master phase order. The contract
package (`@hyperforge/ui-framework`) and shared React renderer
package (`@hyperforge/ui-widgets`) already exist. `ManifestHud` mounts
in `packages/client/src/game/CoreUI.tsx` behind a default-ON flag
(`VITE_DISABLE_MANIFEST_HUD` opts out). `UILayoutEditorPage` in
asset-forge drives drag/snap/variants/preview against real widgets.

What is **done** (cross-checked against the tree on 2026-04-24):

- D1 (contract). `defineWidget`, `WidgetRegistry`, `WidgetManifest`,
  Zod `propsSchema`. Tests pass.
  → `packages/ui-framework/src/{widget,registry,builtins,inspect}.ts`
- D2 (builtins). 15 widget **schemas** + React adapters: HpBar,
  Action Bar, Chat, Inventory, Bank, Equipment, Friends, Minimap,
  Prayer, Quests, Settings, Skills, Spells, Stats, Tooltip.
  → `packages/ui-widgets/src/widgets/*.tsx`
- D3 (layout manifest). Anchored + grid + flex positions, override
  resolution, viewport variants, visibility rules, bindings.
  → `packages/ui-framework/src/{layout,resolve,variant,bindings,visibility}.ts`
- D4 (editor). Palette, outliner, canvas with alignment guides +
  grid snap, anchor picker, viewport switcher, property inspector,
  validation panel, library panel.
  → `packages/asset-forge/src/components/UILayoutEditor/`
- D5 (theme). `ThemeManifestSchema`, CSS-var projection,
  `HYPERSCAPE_DARK_THEME` baseline, live editor preview.
  → `packages/ui-framework/src/theme.ts`,
    `packages/client/src/ui-framework/{theme,themeRegistry}.ts`
- D6 pixel-parity adapters for HP bar, minimap, action bar, chat,
  tooltip, inventory, stats, skills, spells, prayer, equipment, bank,
  friends, quests, settings.
- U0–U11 substrate: safe-load + migrations, user-override persistence,
  drag/resize in HUD, preset store, per-player overrides, variant
  selection, input rebinding. See `PLAN_UI_PACK_AAA.md`.

What is **not** done and is the entire scope of this plan:

- D6.b plugin-widget **contribution surface** — there is no path for
  `@hyperforge/combat` to ship a widget schema + React renderer that
  end up in the `WidgetRegistry` at boot. `PluginContributions.widgets`
  in `packages/manifest-schema/src/plugin.ts` is a *string array* used
  only for diagnostics, never for registration.
- D6.c still-hardcoded HUD surfaces that have **no** widget yet:
  XP orb, floating XP drops, level-up notification, damage splats,
  health bars (NPC/mob overhead), escape menu, death screen, kicked /
  disconnected overlays, context menus, entity context menu, home
  teleport orb, action progress bar, skilling/crafting/smithing/
  dialogue panels (20+ from `game/panels/`), zone-name banners, duel
  countdown, teleport-VFX overlay, boss timer, achievement popup,
  buff bar, notifications.
- D6.d panel vs. HUD unification — `windowStore`-driven panels still
  mount outside `ManifestRenderer`. Each one must either become a
  widget instance with `category:"panel"` or stay an out-of-manifest
  panel indefinitely. Needs a decision.
- D6.e `bindings.tsx` in the client still hand-rolls the data-context
  projection. For arbitrary games this must become a manifest
  (`widget-bindings.json` + a tiny data-source registry).
- D6.f accessibility, performance budget, e2e, telemetry, docs (U11
  remaining checklist).
- Co-existence story with the existing `editStore`-driven window
  panels (`ui/core/window`) under a single edit-mode substrate.
- Exit of feature flag — legacy hand-coded HUD deletion.

---

## Invariants (do not violate)

1. **No pixel regression in Hyperscape**. Every migration lands as
   two commits: (a) introduce widget + adapter + layout entry,
   guarded by the opt-out flag; (b) delete the hand-coded tree.
   Between (a) and (b) the page must render identically with the
   flag on *and* with the flag off.
2. **Client tests + `ui-framework` tests stay green every commit.**
   239 framework + 79 client tests today — that count must not
   decrease.
3. **Schemas in `@hyperforge/ui-framework` are the single source of
   truth.** Widgets, layouts, themes, bindings, input bindings,
   customization — every authored shape is a Zod schema, and the
   editor property panel is generated from it (see `inspect.ts`
   `UI_PROP_FIELD_TYPES`). No hand-rolled property panel forms.
4. **Rendering stays framework-agnostic in `ui-framework`.** React is
   allowed only in `ui-widgets` and `client/src/ui-framework/`. This
   keeps server-side layout validation and codemods usable.
5. **Plugin-contributed widgets go through the same registry + the
   same layout manifest.** No side-channel for plugin UI. If a plugin
   needs custom chrome, it ships a `Widget` whose renderer is a plain
   React component, same as a builtin.
6. **Hyperscape is a plugin.** Once D6 is complete, every Hyperscape
   widget is contributed by `@hyperforge/hyperscape-plugin`, not
   hardcoded in `@hyperforge/client`.
7. **Never reach into `@hyperforge/shared` from `ui-framework` or
   `ui-widgets`.** Both are UI packages; shared is the game-runtime
   package. Direction is strictly `client → shared`, never the
   reverse, and the ui packages sit next to client.

---

## Scope and outputs

### Manifest kinds this phase creates (or finishes)

| Kind | Schema location | Status |
|---|---|---|
| `WidgetManifest` (one per widget type) | `ui-framework/src/widget.ts` | shipped (D1) |
| `UILayoutManifestSchema` | `ui-framework/src/layout.ts` | shipped (D3) |
| `UIUserLayoutSchema` (per-player overrides) | `ui-framework/src/layout.ts` | shipped (U0) |
| `ThemeManifestSchema` | `ui-framework/src/theme.ts` | shipped (D5) |
| `InputBindingManifestSchema` | `ui-framework/src/input.ts` | shipped (U10) |
| `UserInputBindingsSchema` | `ui-framework/src/input.ts` | shipped (U10) |
| `widgets.json` (per-game subset of registered widget ids, for the Plugin Browser / UI Pack summary) | new; `ui-framework` | **NEW in D7** |
| `widget-bindings.json` (per-layout, expression → data-source) | `ui-framework` + `data-source.ts` in client | **NEW in D8** |
| `ui-pack.json` (wraps widgets + layouts + theme + customization for a game module) | per `PLAN_UI_PACK_AAA.md` Final Shape | **NEW in D9** |

### Runtime systems this phase adds

- `WidgetRegistry` — shipped.
- `ManifestRenderer` — shipped.
- **`DataSourceRegistry`** — **NEW** (D8). Replaces the hand-rolled
  `buildPlayerDataContext` in `client/src/ui-framework/dataContext.ts`
  with a pluggable registry keyed by binding-expression namespace
  (`$player.*`, `$inventory.*`, `$quest.*`, `$team.*`, …). Each
  namespace is contributed by a plugin or the game-mode package and
  returns a stable, React-subscribable snapshot.
- **`PluginWidgetContribution`** — **NEW** (D7). A plugin returns
  `{ widgets: Widget[], bindings: ComponentType-by-id }` from its
  `onLoad` hook, and the host calls `registry.defineWidget` +
  `registry.bindComponent` for each. Wires into
  `PluginContext.widgets` — a thin contribution surface.

### Editor surfaces

- `UILayoutEditorPage` — shipped. Remaining: expose binding editor
  per-prop (currently the inspector lets you set static values; the
  `bindings` map is written by hand).
- **Widget Palette filter-by-plugin** — currently every widget shows in
  one flat list; plugin-contributed widgets should be grouped by
  source plugin id.
- **Theme editor** — shipped; missing: token-inheritance UI and
  "save theme as preset".
- **UI Pack browser** — new. Lists the `ui-pack.json` files a game
  module ships and lets you pick the active layout (Desktop / Tablet
  / Mobile / custom). Depends on master plan Phase I5 Plugin Browser
  for surface area — not a blocker.

### Plugin ↔ HUD contract

A plugin contributes a widget by:

1. Declaring it in `plugin.json` under `contributions.widgets: string[]`
   (diagnostics; already in `PluginManifestSchema`).
2. Returning, from the plugin entry module's `PluginFactory`, a
   lifecycle whose `onLoad(ctx)` calls
   `ctx.widgets.register({ widget, Component })` once per contributed
   widget. `ctx.widgets` is the new field on `PluginContextBase` and
   the host wires it to the process-wide `WidgetRegistry` at boot.
3. Optionally contributing a **data source** the widget can bind to:
   `ctx.dataSources.register("$combat.target", snapshotFactory)`.

For Hyperscape, `@hyperforge/hyperscape-plugin` is the sole plugin
that ships every widget currently living in `@hyperforge/ui-widgets`
plus the Hyperscape-specific data sources. After migration, the
client package has zero Hyperscape-specific React imports — it only
knows how to drive `ManifestRenderer` + the registry.

---

## Inventory of existing HUD/panel code

Generated by walking `packages/client/src/game/hud/**`,
`packages/client/src/game/panels/**`, and `packages/client/src/ui/**`.

### HUD (24 files under `game/hud/`)

**Trivially data-driven (pure presentation; already have or need
tiny adapters)**:

- `ActionProgressBar.tsx` — reads `player.actionProgress`.
- `ConnectionIndicator.tsx` — reads network-status store.
- `HomeTeleportButton.tsx`, `homeTeleportUi.ts` — one action + cooldown.
- `StatusBars.tsx` — HP/prayer/stamina bars. Adapter exists
  (`HpBarWidget`); prayer + stamina still hand-coded.
- `MinimapCompass.tsx`, `MinimapHomeTeleportOrb.tsx`,
  `MinimapOverlayControls.tsx`, `MinimapStaminaBar.tsx`,
  `RadialMinimapMenu.tsx` — child pieces of the minimap widget; can
  be absorbed as sub-components of `MinimapWidget` once that widget's
  prop surface grows.
- `XPProgressOrb.tsx`, `xp-orb/XPProgressOrbs.tsx`,
  `xp-orb/FloatingXPDrops.tsx` — **no widget yet**. Highest-value
  D1-slice target per the prompt.
- `level-up/LevelUpNotification.tsx`, `LevelUpPopup.tsx` — no widget
  yet; includes audio side-effect — needs a "one-shot overlay"
  variant of the widget contract (triggered by event, not persistent).
- `overlays/{DeathScreen,DisconnectedOverlay,KickedOverlay}.tsx` —
  full-screen state overlays; good fit for `category:"overlay"`.

**Hybrid (presentation + meaningful client state)**:

- `Minimap.tsx` + `useMinimapEntityPips`, `useMinimapTerrainCache`,
  `useMinimapWorldCaches` — ~1k lines of world-projection math.
  Adapter shipped, but hooks still reach into client-only stores.
  Need to expose the entity/terrain caches as a data source.
- `ContextMenu.tsx`, `EntityContextMenu.tsx` — action verb dispatch,
  keyboard nav, outside-click. Action schema already per-entity-kind
  via `GameModule`; widget would be a shell that consumes the
  existing registry.
- `EscapeMenu.tsx` — modal stack, settings entry; similar to context
  menu in structure.

### Panels (53 files under `game/panels/`)

**Window-store-managed panels** (drag, resize, tab-host,
open/close by key). Each currently mounts via the `windowStore` and
`CoreUI`. These are the *category:"panel"* target for Phase D6:

- Inventory, Bank, Equipment, Shop, Trade, Duel, Betting, ActionBar,
  Crafting, Smithing, Smelting, Tanning, Fletching, Spells, Prayer,
  Skills, SkillGuide, SkillSelectModal, Stats, Combat, Friends, Chat,
  Quests, QuestJournal, QuestDetail, QuestStart, QuestComplete,
  Settings, Dashboard, Account, XpLamp, LootWindow, Map, Action,
  Dialogue.
- Sub-modules under `panels/BankPanel/`, `panels/inventory/`,
  `panels/equipment/`, `panels/dialogue/`, `panels/skilling/`,
  `panels/DuelPanel/`, `panels/BettingPanel/`, `panels/TradePanel/`,
  `panels/SettingsPanel/`, `panels/ActionBarPanel/` —
  composition under the parent panels.

**Pure presentational components** under `ui/components/` (48):

- `ItemSlot`, `ItemIcon`, `VirtualGrid`, `VirtualList`, `Slider`,
  `ToggleSwitch`, `Tab`, `TabBar`, `MenuButton`, `Portal`,
  `ScrollableArea`, `Ribbon`, `NotificationContainer`,
  `AchievementPopup`, `BossTimer`, `BuffBar`, `PopoutPanel`,
  `TieredTooltip`, `Icons`, `StatusBar`, `ModalWindow`,
  `Window`, `WindowErrorBoundary`, edit-mode helpers.

These are "primitives" — they are already data-driven and can back
multiple widget implementations. Not migrated per se; kept as-is.

**Stores** (`ui/stores/`, 11):

- `accessibilityStore`, `anchorUtils`, `complexityStore`, `dragStore`,
  `editStore`, `keybindStore`, `notificationStore`, `presetStore`,
  `questStore`, `themeStore`, `windowStore`.

D4/U1 unified `editStore` across HUD + window panels. `windowStore`
still gates every `game/panels` mount — its role is a design question
for D7 (below).

---

## Phasing

Each sub-phase gates on an acceptance criterion that is witnessable
in the live client or in the editor. Sub-phases run in order;
D6.c panel-migration strands are parallelizable under one owner.

### D7 — Plugin widget contribution surface *(first slice, shippable in 1 session)*

**Goal.** Make `@hyperforge/ui-framework`'s registry plugin-reachable
at boot.

**Work.**

- Add `ctx.widgets: { register(reg): void }` to `PluginContextBase`
  in `packages/gameplay-framework/src/index.ts`.
- In the client plugin-host wiring (`packages/client/src/plugins/*`
  — the `startPluginsInOrder` call), pass a scoped adapter that
  forwards into the process-wide `uiRegistry`.
- Write one test under `packages/gameplay-framework/src/__tests__/`
  that boots a fake plugin, has it register one widget, and asserts
  the registry now contains the id.

**Exit.** A plugin in a test can call
`ctx.widgets.register(myWidget)` and the widget is bound + resolvable
by `WidgetRegistry.get(id)`. No game client change yet.

### D6.c.1 — XP progress orb widget *(smallest demo slice, shippable in 1-2 sessions)*

This is the concrete "first slice" the prompt asks for.

**Goal.** An authored `UILayoutManifest` instance describes the XP
orb, the runtime renders it, and moving it in a PIE hot-reload moves
it on screen with no Stop/Play.

**Work.**

1. Define `hyperforge.hud.xp-progress-orb` widget schema in
   `packages/ui-widgets` / `ui-framework/src/builtins.ts`.
   Props: `skillFilter`, `size`, `showDrops`, `ringThickness`.
2. Adapter `XpProgressOrbWidget.tsx` that wraps today's
   `game/hud/XPProgressOrb.tsx` *unchanged* but reads from props
   instead of hooks — the hooks move up into a `useXpOrbDataSource`
   that returns a serializable snapshot.
3. Add the widget to `bindAllWidgets()` in
   `client/src/ui-framework/bindings.tsx`.
4. Add the entry to `DEFAULT_UI_LAYOUT` in
   `client/src/ui-framework/defaultLayout.ts`, anchored to
   `top-right` offset matching the hand-coded position.
5. Remove the hand-coded mount from `game/CoreUI.tsx` (or gate it
   behind `!isManifestHudEnabled()`).
6. Editor test: load the default layout in `UILayoutEditorPage`,
   drag the XP orb instance to a new anchor, hit Save, confirm the
   live PIE client re-renders at the new anchor within the next
   tick (hot-reload path through `useActiveUILayout` should already
   handle this; this test verifies).

**Acceptance.**

- Unit: XP orb widget schema + adapter under `ui-widgets` tests.
- Integration: `client/tests/unit/ui-framework-bindings.test.ts`
  asserts the new id is bound.
- Manual (documented): PIE + editor co-running, drag-to-save moves
  the orb in the live client.

### D6.c.2 — Level-up notification + death screen + full-screen overlays

Introduces the **one-shot overlay** variant. Widget instance lives in
manifest permanently but its `visible` toggles from event bindings.
Needs a small extension to `WidgetVisibilityRuleSchema` for
event-triggered visibility with a TTL.

### D6.c.3 — Damage splats, health bars overhead, XP drops

World-space UI pinned to entity transforms. Introduces
`kind: "world-space"` position variant — 3D projection into screen
space. This is a bigger schema change; gate on owner decision.

### D6.c.4 — Panels as widgets (windowStore migration)

All 53 `game/panels/*` become `category: "panel"` widgets. Layout
manifest gains a `dockZones` map (left/right/bottom floating). Per-
panel drag + resize already works via `MovableWidgetShell` + U4.
`windowStore` becomes a façade that *reads* the resolved layout +
user-layout and returns the same API the rest of the client uses.

Largest strand. Split per-panel so every commit deletes one hand-
coded panel mount. Target order: Inventory → Bank → Equipment →
Skills → Stats → Chat → Friends → Quests → SkillGuide → Settings →
Dashboard → (the rest).

### D8 — Data-source registry + widget-bindings manifest

**Goal.** The current `dataContext.ts` hand-rolls the data-context.
Replace with a pluggable registry. A plugin contributes a data source
(`$combat.target`, `$quest.active`, `$team.members`, …) and the
layout manifest's `bindings` map resolves against the union of
registered namespaces.

**Open design question.** The master plan asks whether widget
bindings should be authored as script graphs (Phase 10
`ScriptGraphInterpreter`). Recommendation: **no for D8** — the
binding expression grammar in `ui-framework/src/bindings.ts` is
already shipped and is enough for the 95% case. Reserve script-graph
bindings for a later "derived binding" escape hatch, targeting only
computed props that span multiple namespaces (e.g. `$player.hp /
$player.maxHp * 100`). Mark as **needs owner input** before
implementing.

### D9 — UI Pack manifest (`ui-pack.json`)

Per `PLAN_UI_PACK_AAA.md` Final Shape. Wraps:

```
game-module/ui/
  widgets.json
  layouts/{default,minimal,mobile}.json
  theme.json
  customization.json
  bindings.json     # D8
```

`@hyperforge/hyperscape-plugin` is the reference producer; the
asset-forge Plugin Browser is the consumer (Phase I5 dependency —
non-blocking).

### D10 — Exit gate (flag flip + legacy delete)

- Accessibility, performance-budget test, telemetry, e2e — clear the
  U11 remaining checklist.
- Delete every file in `game/hud/` and `game/panels/` that is now
  widget-backed. Flag becomes no-op; remove it.
- CLAUDE.md + docs-site: "Authoring a UI Pack" guide.
- `/super-audit` pass.

---

## Trade-offs and design decisions

### Schema-driven vs. component-class-registry approach

Shipped: **schema-driven with a side-table binding for React
components**. Widget declares a Zod `propsSchema`; `WidgetRegistry`
stores the schema and a renderer separately (`defineWidget` then
`bindComponent`). This matches UMG-blueprint spirit (every widget is
a typed class) while keeping the contract React-free.

Decision: **keep this**. Alternative (React reconciler as engine,
layouts as JSX) was considered but rejected — server-side validation
and codemods need the schema reachable without a React runtime, and
plugin-contributed widgets that ship their own React would break
that.

### React 19 vs. React reconciler-as-engine

React 19.2.4 is fine. The `ManifestRenderer` is a thin React
component that iterates `ResolvedLayout.instances` and mounts
`<Component {...props} />`. No custom reconciler. If a future
performance budget test shows per-frame cost exceeding 2 ms on mid-
tier hardware, revisit with a virtualization pass first, not a
reconciler rewrite.

### Interaction with ScriptingSystem / ScriptGraphInterpreter

See D8 open question above. Summary: **don't couple for now**.
`ui-framework/src/bindings.ts` defines its own `BindingExpression`
grammar — simple property access with optional transforms — and has
shipped tests. Script-graph integration is an escape hatch for the
1% case and a risky coupling for D-phase scope.

### Mobile vs. desktop responsive contract

Shipped: **variants inside the same manifest**.
`UILayoutManifestSchema` supports `variants` keyed by viewport key
(`desktop`, `tablet`, `mobile`). Per-viewport `LayoutVariantOverride`
patches the base `instances`. `applyLayoutVariant` resolves the
correct variant at render time based on `DEFAULT_VIEWPORT_BREAKPOINTS`
(or a theme override). `client/src/ui-framework/useViewportVariant.ts`
picks the live viewport.

Decision: **keep the single-manifest-with-variants model**. Two
separate manifests would make override reconciliation and preset
authoring ambiguous.

### Co-existence with React 19 styled-components

Grep on 2026-04-24 shows **zero** `styled-components` usage in
`packages/client/src`. The styling stack is Tailwind 4 + inline
styles (see `HpBarWidget.tsx`). No migration cost.

The prompt's premise of "React + styled-components HUDs to migrate"
is outdated — that was the pre-U1 state. **Flag for owner**: does
the master-plan wording in §3 ("currently hardcoded React +
styled-components") reflect a separate legacy surface I haven't
found, or is it stale?

### `windowStore` fate

Largest open decision. Three options:

- **A. Delete it.** Every panel becomes a widget; `ManifestRenderer`
  plus `MovableWidgetShell` + U4 resize cover drag/resize/close.
  Clean outcome; large migration.
- **B. Keep it as a façade.** `windowStore` reads from the resolved
  layout so existing code keeps working during migration.
- **C. Merge its concerns into `ManifestRenderer`.** `windowStore`
  becomes part of the `ResolvedLayout` pipeline — its panel
  open/close state moves into `UIUserLayout` overrides (`visible`
  field).

Recommendation: **B for the migration window, A at the exit gate**.
Needs owner sign-off before D6.c.4 starts.

---

## Risks and dependencies

### What in the existing codebase changes

- `game/hud/*` and `game/panels/*` — progressively deleted (D6.c).
- `game/CoreUI.tsx` — every hand-coded mount removed in turn.
- `client/src/ui-framework/bindings.tsx` — grows one `registry.bind`
  call per new widget.
- `client/src/ui-framework/defaultLayout.ts` — grows one entry per
  new widget.
- `client/src/ui-framework/dataContext.ts` — replaced by
  `DataSourceRegistry` in D8.
- `packages/ui-widgets/src/widgets/` — one file per new widget.
- `packages/ui-framework/src/builtins.ts` — one schema export per
  new widget (until plugin-contributed).
- `packages/gameplay-framework/src/index.ts` — add
  `PluginContextBase.widgets` + `dataSources`.
- `packages/hyperscape-plugin/src/*` — eventually becomes the sole
  author of every Hyperscape widget (D10).

### Blockers and prereqs

- **Phase C (property panel schema refactor)** — listed as a prereq
  in the master plan. Status on 2026-04-24: partially done.
  `GameModule.ts` already references `SchemaPropertyEditor`;
  `asset-forge/src/components/WorldStudio/panels/properties/`
  exists and is used. UI-editor widget inspector
  (`WidgetPropertyInspector.tsx`) already uses `UI_PROP_FIELD_TYPES`
  from `ui-framework/src/inspect.ts` to generate per-prop inputs.
  **Not a blocker for D7 / D6.c / D8.** Confirm with owner.
- **Phase I3 (editor plugin API)** — required before D9 can surface
  plugin-contributed widgets in a Plugin Browser. D7's contribution
  surface is a subset of I3 and can land standalone. Non-blocking
  for phases up to D8.
- **ServerNetwork migration** — complete. No dependency.

### Known risks

- **Drag + resize bugs in edge cases** (multi-monitor DPI, zoom-in
  pointer events, touch) are latent and will surface during panel
  migration. Budget: first 3 panels migrated under D6.c.4 are
  treated as discovery PRs, not feature PRs.
- **Pixel-parity drift.** Every migrated widget must render
  identical output to the hand-coded version it replaces. Snapshot
  tests are not currently enforced. Add a Playwright visual-diff
  suite as part of D10.
- **Plugin widget id collisions.** Today `WidgetRegistry.defineWidget`
  throws on duplicate id. Needs a strategy for hot-reload without
  the editor session teardown — probably a `registry.clear(pluginId)`
  that drops all ids with a given namespace prefix.
- **Binding expression perf.** `bindings.ts` evaluates per widget per
  render. Micro-optimization deferred; measurement before optimization.

---

## Concrete first-PR scope (D7 + D6.c.1)

One PR lands the plugin contribution surface (D7) **and** the XP orb
migration (D6.c.1) — together they demonstrate the full loop
end-to-end (plugin registers widget → layout references it →
client renders it) without migrating the Hyperscape client to be a
plugin yet.

### Files touched

- `packages/gameplay-framework/src/index.ts`
  – extend `PluginContextBase` with
    `readonly widgets: { register(reg: WidgetRegistration): void }`.
- `packages/gameplay-framework/src/__tests__/plugin-widgets.test.ts`
  (new) — boot a fake plugin, register a widget, assert registry.
- `packages/client/src/plugins/<host-wiring>.ts`
  – thread a per-plugin widget-register adapter into the context
    factory passed to `startPluginsInOrder`.
- `packages/ui-framework/src/builtins.ts`
  – add `xpProgressOrbWidget` schema export.
- `packages/ui-widgets/src/widgets/XpProgressOrbWidget.tsx` (new)
  – adapter wrapping the existing `game/hud/XPProgressOrb.tsx`
    rendering, but props-driven.
- `packages/ui-widgets/src/bindings.ts` + `index.ts`
  – register + export the new widget.
- `packages/client/src/ui-framework/bindings.tsx`
  – adapter instance registration (unchanged if `bindAllWidgets`
    walks every exported widget).
- `packages/client/src/ui-framework/defaultLayout.ts`
  – new `xp-orb-main` instance at the top-right anchor matching the
    current hand-coded position.
- `packages/client/src/ui-framework/dataContext.ts`
  – extend the data context to project XP state (per-skill xp +
    levels) under `$player.xp.*`.
- `packages/client/src/game/CoreUI.tsx`
  – delete the `<XPProgressOrb />` mount (it's now manifest-driven).
- `packages/client/tests/unit/ui-framework-bindings.test.ts`
  – assert `uiRegistry.hasComponent("hyperforge.hud.xp-progress-orb")`.
- `packages/ui-widgets/src/widgets/__tests__/XpProgressOrbWidget.test.tsx`
  (new) — renders, shows correct percentage, responds to prop change.

### New manifest kind introduced

None new in this PR — reuses `UILayoutManifest` and adds one entry
to the existing `DEFAULT_UI_LAYOUT`.

### Runtime systems added

- `PluginContextBase.widgets` — the plugin contribution surface.
  Implementation lives in the client's plugin-host wiring; the
  gameplay-framework package only declares the interface.

### Acceptance test ("proves it works")

A single vitest suite in
`packages/gameplay-framework/src/__tests__/plugin-widgets.test.ts`:

- Creates an ephemeral `WidgetRegistry`.
- Creates a fake plugin whose `onLoad(ctx)` calls
  `ctx.widgets.register(someWidget)`.
- Runs `startPluginsInOrder` with a context factory that adapts to
  the registry.
- Asserts `registry.get(someWidget.manifest.id)` exists and its
  Component is bound.

Plus the client-side unit test asserting the XP orb widget is
resolvable and renders when the default layout mounts under
`ManifestHud`.

### Manual smoke

1. `bun dev` running client + asset-forge.
2. Open PIE in asset-forge → UI Layout Editor.
3. Select the `xp-orb-main` instance; drag it to a new anchor.
4. Save → observe the live client XP orb move within one frame.
5. Flip `VITE_DISABLE_MANIFEST_HUD=true` → verify there is **no** XP
   orb on screen (confirms the hand-coded path is deleted, not
   "both mounted").

### Out of scope for this PR

- Migrating any other HUD/panel component.
- Data-source registry (D8).
- `ui-pack.json` (D9).
- Accessibility / perf budget / e2e / docs (D10).
- Making `@hyperforge/hyperscape-plugin` own the widget (reserved
  for the per-widget migration PRs).

---

## Tracking

Each sub-phase gets one section in this doc's status table as it
starts and a line in `PLAN_WORLD_STUDIO_AAA_COMPLETION.md` phase
table at completion.

| Sub-phase | Owner | Status | Exit test |
|---|---|---|---|
| D7 plugin widget contribution | — | not started | widget-registration test |
| D6.c.1 XP orb | — | not started | PIE drag-to-save parity |
| D6.c.2 overlays (levelup/death/kicked) | — | not started | visibility-rule test |
| D6.c.3 world-space UI | — | **needs schema decision** | — |
| D6.c.4 panels migration | — | **needs windowStore decision** | per-panel delete PRs |
| D8 data-source registry | — | **needs script-graph decision** | bindings integration test |
| D9 ui-pack manifest | — | not started | hyperscape-plugin ships one |
| D10 flag flip + legacy delete | — | not started | `/super-audit` clean |

## Non-goals for Phase D

- AI integration / prompt-driven layout generation.
- Mobile **editor** UI (editor stays desktop web).
- Real-time multi-user collab editing.
- Marketplace billing for UI Packs.
- Rewriting `ui-framework` to own a custom React reconciler.

## Open questions requiring owner input

1. **windowStore fate** (A/B/C above). Blocks D6.c.4.
2. **Script-graph bindings** (D8). Default: no. Confirm.
3. **World-space UI schema** (D6.c.3). New
   `kind: "world-space"` position variant — needs API review.
4. Master plan §3 wording "hardcoded React + styled-components" —
   stale or pointing at something not under
   `packages/client/src`? grep shows zero styled-components usage.
5. **Plugin widget id namespace policy.** Should
   `registry.defineWidget` enforce `<pluginId>.<category>.<name>`
   so hot-reload can drop-by-prefix? Today only
   `hyperforge.<category>.<name>` is used.
