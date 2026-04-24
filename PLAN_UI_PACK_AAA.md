# UI Pack AAA — Plan

**North star:** a Hyperscape game module ships a *UI Pack* — widgets + N
layouts + theme + customization policy — that players customize at
runtime within designer-authored limits, with per-user overrides that
survive layout updates. One edit-mode substrate shared across HUD
widgets and window panels. Mobile and desktop from the same manifest.

This plan is a companion to `PLAN_WORLD_STUDIO_AAA_COMPLETION.md` and
inherits its invariants:

- **Every phase = ≥ 2 commits**: `extract-zero-change` (plumbing) →
  `expose-editor` (surface in World Studio).
- **Zod schemas in `@hyperforge/ui-framework` are source of truth.**
- **No mocks.** Real layouts, real overrides, real persistence.
- **Window Panel System is stable; we extend, don't rewrite.**
  `editStore` becomes the shared substrate between the two UI worlds.
- **No `any`.** Colocate types; class bodies over interfaces where the
  contract carries behavior.

---

## Phase U0 — Schema substrate ✅ *(shipped)*

**Goal:** add the contracts needed by every later phase so schema
churn stops being blocking.

| File | Change |
|---|---|
| `packages/ui-framework/src/layout.ts` | Added `width`/`height` to `AnchoredPositionSchema`; `WidgetCustomizationSchema`; `customization` field on `WidgetInstanceSchema`; `revision` field on `UILayoutManifestSchema`; `UIOverridePositionSchema`, `UIOverrideSchema`, `UIUserLayoutSchema` |
| `packages/ui-framework/src/resolve.ts` *(new)* | `resolveLayout(manifest, userLayout \| null) → ResolvedLayout` — pure function that merges overrides, prunes stale ids, never throws |
| `packages/ui-framework/src/resolve.test.ts` *(new)* | 12 tests: round-trip merge, stale pruning, anchor override, width/height override, visibility override, mutation-free, order preserved |
| `packages/ui-framework/src/layout.test.ts` | +15 tests covering the new schemas |
| `packages/ui-framework/src/index.ts` | Exports the new schemas and resolver |

**Exit:** 137 tests pass. Typecheck clean. No runtime consumer yet.

---

## Phase U1 — Edit-mode substrate unification ✅ *(shipped 2026-04-19)*

`editStore` remains the substrate for both HUD widgets and window
panels. No behavior change for panels.

| File | Change |
|---|---|
| `packages/client/src/ui/stores/editStore.ts` | Added `EditScope` type; `editScope` state (persisted), `draggingInstanceId`/`resizingInstanceId` (ephemeral), setters |

---

## Phase U2 — ManifestRenderer becomes drag-aware ✅ *(shipped 2026-04-19)*

Drag + snap wired into `ManifestRenderer` for widgets whose
`customization.movable === true`. Resize deferred to U4.

| File | Change |
|---|---|
| `packages/client/src/ui-framework/ManifestRenderer.tsx` | Wraps anchored instances in `MovableWidgetShell`; threads `layoutId`/`revision` |
| `packages/client/src/ui-framework/MovableWidgetShell.tsx` *(new)* | Pointer-driven drag with per-widget or global snap; writes `UIOverride` on drop |
| `packages/client/src/ui-framework/useUserLayout.ts` *(new)* | Zustand store persisting `Record<layoutId, UIUserLayout>` in localStorage; merges partial patches |
| `packages/client/src/ui-framework/ManifestHud.tsx` | Calls `resolveLayout(manifest, userLayout)` before render |
| `packages/client/src/ui-framework/defaultLayout.ts` | hp-bar, action-bar, minimap opted into `customization.movable: true` |

**Exit:** player unlocks edit mode (L-hold, manifest scope), drags HP bar, reloads, position persists via `hyperia-user-layout` localStorage key.

---

## Phase U3 — Customization policy editor in World Studio ✅ *(shipped 2026-04-19)*

Customization field exposed to designers in the UI Layout Editor.

| File | Change |
|---|---|
| `packages/asset-forge/src/components/UILayoutEditor/store.ts` | `updateInstanceCustomization(id, patch)` — merges partial `WidgetCustomization`, prunes empty record |
| `packages/asset-forge/src/components/UILayoutEditor/WidgetPropertyInspector.tsx` | "Customization" section: movable / resizable / lockable toggles, min/max W/H, snap-grid, aspect ratio |
| `packages/asset-forge/src/components/UILayoutEditor/LayoutPreview.tsx` | "Move" / "Size" corner badges on movable/resizable instances |
| `packages/asset-forge/src/components/UILayoutEditor/__tests__/store.test.ts` | +4 tests for customization merge/prune semantics |

**Deferred:** `PreviewModeToggle.tsx` ("Preview as Player Locked/Unlocked") — simulation mode is an isolated follow-up that does not block U4.

---

## Phase U4 — Resize + aspect constraints ✅ *(shipped 2026-04-19)*

Bottom-right grip resize wired into `MovableWidgetShell` for widgets
whose `customization.resizable === true`. Full 8-direction resize
grips deferred until an author asks — single corner grip covers the
overwhelmingly common case and mirrors how browser window resize works.

| File | Change |
|---|---|
| `packages/client/src/ui-framework/MovableWidgetShell.tsx` | `handleResize{PointerDown,PointerMove,PointerUp,PointerCancel}` + `finalizeResize`; aspect-ratio lock with dominant-axis arbitration; min/max clamp with post-clamp aspect re-application; grid snap; `liveSize` applied to wrapper style; resize-aware unmount cleanup; bottom-right grip JSX tagged `data-resize-grip="true"` |
| `packages/client/tests/unit/ui-framework/MovableWidgetShell.resize.test.tsx` *(new)* | 9 cases: no-grip gating, live-size tracking, max clamp, aspect lock, grid snap, commit-on-up, cancel-discards, unmount cleanup |

---

## Phase U5 — Layout presets for HUD ✅ *(shipped 2026-04-19)*

`LayoutPreset` now carries the full HUD-override map alongside window
state. Save captures both; load restores both. Presets saved before U5
carry `uiOverrides === undefined` and intentionally leave the live HUD
overrides untouched on load, so upgrading to this phase can't blow away
a player's current HUD tweaks.

| File | Change |
|---|---|
| `packages/client/src/ui/types.ts` | `LayoutPreset.uiOverrides?: Record<string, UIUserLayout>` |
| `packages/client/src/ui/stores/presetStore.ts` | `savePreset(name, windows, resolution, uiOverrides?)` deep-clones the overrides map into the persisted preset record |
| `packages/client/src/ui/core/presets/usePresets.ts` | `savePreset` snapshots `useUserLayoutStore.getState().layouts`; `loadPreset` writes the cloned snapshot back via `setState({ layouts })`; undefined field = window-only preset, HUD left alone |
| `packages/client/tests/unit/ui-framework/presetOverrideRoundtrip.test.ts` *(new)* | 4 tests: snapshot, round-trip clone isolation, empty-preset clears, load-replaces-not-merges |

**Deferred:** `PresetBar.tsx` in-edit-mode UI — not blocking U6+. The
existing `PresetPanel.tsx` already covers window-mode save/load; HUD
Preset Bar is a follow-up when the design calls for a separate surface.

---

## Phase U6 — Multiple author layouts per module ✅ *(shipped 2026-04-19)*

| File | Change |
|---|---|
| `server/services/UILayoutService.ts` ✅ | New `listForGame(teamId, gameId)` — team-owned (scoped-to-game OR team-wide NULL) + public + templates |
| `server/routes/games.ts` ✅ | `GET /api/teams/:teamId/games/:gameId/ui-layouts` — team-membership + game-existence checks, returns `UILayoutResponse[]` |
| `client/src/ui-framework/useActiveUILayout.ts` ✅ | Player override > game's authored `activeUiLayoutId`; `readPlayerLayoutOverride` / `setPlayerLayoutOverride` localStorage helpers keyed by gameId; new `useGameUILayouts()` hook returning `UILayoutSummary[]` for the switcher |
| `client/src/ui-framework/LayoutSwitcher.tsx` *(new)* ✅ | Dropdown component: reads `useGameUILayouts`, seeds current value from `readPlayerLayoutOverride`, writes on change via `setPlayerLayoutOverride`. "Default" entry clears the override. Hides itself on missing gameId / error / empty list. |
| `client/src/ui-framework/index.ts` ✅ | Re-exports `LayoutSwitcher`, `useActiveUILayout`, `useGameUILayouts`, player override helpers, and `UILayoutSummary` type |
| `client/tests/.../playerLayoutOverride.test.ts` *(new)* ✅ | 6 tests: default null, round-trip, null-clears, per-game isolation, empty-gameId no-op, last-write-wins |
| `client/tests/.../LayoutSwitcher.test.tsx` *(new)* ✅ | 6 tests: hide-on-no-gameId, hide-on-empty, hide-on-error, renders Default + layouts, persists selection, "Default" clears override |

---

## Phase U7 — Theme as manifest companion

**Status: substrate + renderer ✅ shipped 2026-04-19.** Editor `ThemePanel` remains.

| File | Change |
|---|---|
| `ui-framework/src/layout.ts` ✅ | `UILayoutManifestSchema.theme?: ThemeManifest` (inline, wins) + `themeId?: string` (reference) |
| `ui-framework/src/layout.test.ts` ✅ | +5 schema tests: no-theme default, themeId, inline theme, empty-themeId rejected, malformed inline-theme rejected |
| `client/src/ui-framework/ManifestRenderer.tsx` ✅ | New `resolveTheme?: (id) => ThemeManifest \| null` prop; computes `themeVars` (inline > resolver > empty) via `themeToCssVars` and spreads onto overlay inline style → CSS vars scoped to HUD subtree, no `:root` pollution, no FOUC |
| `client/tests/.../ManifestRenderer.theme.test.tsx` *(new)* ✅ | 5 renderer-level tests: no theme → no vars, inline wins, themeId via resolver, unresolved themeId → no vars + no throw, inline wins over themeId |
| `ThemePanel.tsx` *(new)* | Editor for colors, typography, border tokens, live preview — **follow-up** |
| `ManifestHud.tsx` | Thread resolver from a future theme registry — **follow-up**. Existing inline-theme case already works through the renderer. |

---

## Phase U8 — Context-aware visibility

AAA HUDs hide/show widgets based on game state (in-combat, in-menu, cutscene).

**Status: end-to-end ✅ shipped 2026-04-19.** Opacity-fade animation + richer `gameContext` sources remain.

| File | Change |
|---|---|
| `layout.ts` ✅ | Extracted `WidgetVisibilityRuleSchema` + `WidgetVisibilityRule` type, re-exported from package index. Instance schema references the named schema. |
| `visibility.ts` *(new)* ✅ | `isWidgetVisible({ instance, gameContext, data })` — pure AND-gate evaluator, fails closed on malformed expression |
| `visibility.test.ts` *(new)* ✅ | 11 tests — default visible, authored `visible:false` wins, positive contexts, null context handling, `hiddenIn`, expression truthy/falsy, no DataContext, malformed expression, AND across gates, empty contexts array is no-op |
| `layout.test.ts` ✅ | +5 schema tests for the `visibility` field on `WidgetInstanceSchema` |
| `ManifestRenderer.tsx` ✅ | Accepts `gameContext?: string \| null`; filters instances through `isWidgetVisible` each render (pass-through when no rule, AND-gated otherwise). Opacity-fade animation remains follow-up. |
| `ManifestHud.tsx` ✅ | Threads `gameContext = playerStats?.inCombat ? "combat" : "world"` into the renderer. Richer contexts (`"menu"`, `"cutscene"`, `"loading"`) sourced from dedicated UI stores — **follow-up**. |
| `WidgetPropertyInspector.tsx` ✅ | New `VisibilitySection` — `TagsInput` for `contexts`/`hiddenIn`, free-text expression with live `parseBindingExpression` validation + red-ring error styling. Mirrors `BindingField` UX (commit on blur/Enter, keep invalid draft on screen). |
| `store.ts` ✅ | New `updateInstanceVisibility(instanceId, patch)` action — same merge / `undefined`-removes / prune-empty semantics as `updateInstanceCustomization`. 4 new store tests (attach / merge / remove / drop). |

---

## Phase U9 — Mobile + responsive

**Status: substrate + runtime ✅ shipped 2026-04-19.** Editor `ViewportSwitcher.tsx` remains.

| File | Change |
|---|---|
| `ui-framework/src/layout.ts` ✅ | `LayoutVariantOverrideSchema` (sparse per-instance author override — position/visible/hidden); `LayoutVariantSchema` (overrides[] + optional grid/theme); `UILayoutManifestSchema.variants?: { mobile?, tablet?, desktop? }`. Also refactored `UIOverridePositionSchema` up in-file so author variants and runtime overrides share the same partial-position shape. |
| `ui-framework/src/variant.ts` *(new)* ✅ | Pure `applyLayoutVariant(manifest, viewport)` → `{ manifest, applied, droppedOverrides }`; `hidden: true` drops instances; variant `grid`/`theme`/`themeId` override the base's counterparts. `classifyViewport(widthPx, opts?)` with `DEFAULT_VIEWPORT_BREAKPOINTS` (640/1024). `VIEWPORT_KEYS` constant tuple. |
| `ui-framework/src/variant.test.ts` *(new)* ✅ | 14 tests: no-op paths, position override per-viewport, hidden-drops-instance, droppedOverrides for unknown ids, grid/themeId override, visible flip, mutation-free, classifier thresholds + custom breakpoints |
| `ui-framework/src/layout.test.ts` ✅ | +11 schema tests for `LayoutVariantOverrideSchema`, `LayoutVariantSchema`, and `UILayoutManifestSchema.variants` |
| `client/src/ui-framework/useViewportVariant.ts` *(new)* ✅ | `useViewportVariant()` hook: classifies `window.innerWidth` on mount, updates on `resize`, returns `null` in non-browser envs |
| `client/src/ui-framework/ManifestHud.tsx` ✅ | Applies `applyLayoutVariant(authored, viewport)` before merging per-player user overrides, so variants and user overrides compose in the correct order |
| `client/tests/.../useViewportVariant.test.tsx` *(new)* ✅ | 3 tests: initial classification, reclassify on resize, listener removed on unmount |
| `ViewportSwitcher.tsx` *(new)* | Editor tabs to preview "mobile / tablet / desktop" variants in the World Studio UI Layout editor — **follow-up** |

---

## Phase U10 — Input rebinding

**Status: substrate + client runtime ✅ shipped 2026-04-19.** Editor panel remains.

| File | Change |
|---|---|
| `ui-framework/src/input.ts` *(new)* ✅ | `InputChordSchema` (key ⨯ modifiers or pointer button); `InputActionSchema` (id, label, defaults[], rebindable, contexts?, category?); `InputBindingManifestSchema`; `UserInputBindingsSchema` (per-player overrides). `validateInputBindings` reports duplicate ids, empty chords, and conflicts in overlapping contexts. `resolveInputBindings` merges defaults + user overrides into `ResolvedInputBindings`. `chordToString` / `chordsEqual` canonicalize modifier ordering so "Ctrl+Shift+K" round-trips deterministically. |
| `ui-framework/src/input.test.ts` *(new)* ✅ | 19 tests: schema defaults (rebindable=true, modifiers=[]); validation of dup-ids / empty-chord / conflict-across-context; resolver — defaults when no overrides, per-action override, explicit `[]` unbind, dropped-overrides for unknown ids, manifest-id mismatch ignored; chord helpers — modifier normalization, equality, pointer-only string |
| `client/src/ui-framework/useInputActions.ts` *(new)* ✅ | React hook: listens to `keydown`, matches chords against `ResolvedInputBindings`, dispatches to the caller. Filters by `gameContext`, skips text inputs by default, calls `preventDefault()` on matches (opt-out). Listener removed on unmount. |
| `client/tests/.../useInputActions.test.tsx` *(new)* ✅ | 8 tests: chord match, modifier awareness, context filtering, context match, ignore-in-text-inputs, preventDefault on/off, unmount cleanup |
| `InputRebindingPanel.tsx` | React component that reads a resolved manifest and persists `UserInputBindings` via localStorage — **follow-up** |
| Editor | Surface next to widgets — **follow-up** |

---

## Phase U11 — Hardening + release gate *(substrate shipped 2026-04-19)*

The "is this AAA?" checklist. Nothing ships `activeUiLayoutId` as
default-on until every box is green.

**Shipped this pass — safe-load substrate:**

| File | Change |
|---|---|
| `packages/ui-framework/src/safe-load.ts` *(new)* | `safeLoadLayoutManifest` + `safeLoadUserLayout` return `{value,failure}` instead of throwing; migration registry (`registerUserLayoutMigration`) walks `schemaVersion` up to `CURRENT_USER_LAYOUT_VERSION` before validating |
| `packages/ui-framework/src/safe-load.test.ts` *(new)* | 11 tests: valid parses, malformed/missing `schemaVersion`, migration-missing, migration chain walk, migration-failed, post-migration validation |
| `packages/ui-framework/src/index.ts` | Exports `safeLoadLayoutManifest`, `safeLoadUserLayout`, `registerUserLayoutMigration`, `LoadFailure`, `LoadResult` |
| `packages/client/src/ui-framework/useActiveUILayout.ts` | Replaces `UILayoutManifestSchema.safeParse` with `safeLoadLayoutManifest`; failure path silently falls back to `DEFAULT_UI_LAYOUT` upstream (toast/telemetry hook is a follow-up) |
| `packages/client/src/ui-framework/useUserLayout.ts` | Zustand `persist.merge` runs every rehydrated entry through `safeLoadUserLayout`; tampered / schema-drifted blobs are silently dropped instead of propagating into the HUD |
| `packages/client/tests/unit/ui-framework/useUserLayout.rehydrate.test.ts` *(new)* | 3 tests: drops malformed entries, drops garbage `layouts` root, empty storage no-op |
| `packages/ui-framework/src/safe-load.ts` | Added `safeLoadUserInputBindings` + `registerUserInputBindingsMigration` (same migration-chain pattern as `safeLoadUserLayout`) |
| `packages/client/src/ui-framework/useUserInputBindings.ts` *(new)* | Zustand `persist` store keyed by `manifestId`. `setActionChords(manifestId, actionId, chords \| null)` replaces/unbinds/clears; `null` removes override (falls back to manifest defaults), `[]` persists as explicit unbind. `persist.merge` validates every rehydrated entry via `safeLoadUserInputBindings` |
| `packages/client/tests/unit/ui-framework/useUserInputBindings.test.ts` *(new)* | 10 tests: round-trip, replace, null-clears, empty-unbinds, prune on last remove, manifest isolation, `clearManifest`/`clearAll`, rehydrate drops corrupt entries, rehydrate drops garbage `byManifest` root |
| `packages/client/src/ui-framework/InputRebindingPanel.tsx` *(new)* | React UI on top of `resolveInputBindings`. Grouped by `category`, capture-modal via `keydown` listener, Rebind/Unbind/Reset buttons, ignores pure modifier presses, Escape cancels, hides buttons on non-rebindable actions, surfaces live conflicts via `validateInputBindings` on a synthesized manifest |
| `packages/client/tests/unit/ui-framework/InputRebindingPanel.test.tsx` *(new)* | 9 tests: lists actions, hides rebind for locked actions, captures a chord, captures modifiers, ignores pure-modifier presses, Escape cancels, Unbind persists `[]`, Reset clears override, live conflict shows alert |
| `packages/client/src/ui-framework/safeLoadReport.ts` *(new)* | Pluggable failure sink for `safeLoad*` callsites. `setSafeLoadFailureHandler(handler \| null)` swaps / silences; default is `console.warn`. Throwing handler is swallowed so telemetry breakage can't take down the HUD |
| `packages/client/src/ui-framework/useActiveUILayout.ts` + `useUserLayout.ts` + `useUserInputBindings.ts` | All three callsites now call `reportSafeLoadFailure(context, failure)` on bad input. Contexts: `active-layout`, `user-layout-merge`, `user-input-bindings-merge` |
| `packages/client/tests/unit/ui-framework/safeLoadReport.test.ts` *(new)* + rehydrate test extension | 4 report-pipe tests (invoke, silence, swallow-throw, reset) + 1 rehydrate integration test asserting every dropped entry is reported with the correct context |

Total: 239 ui-framework + 79 client ui-framework tests green.

**Remaining checklist items:**

- [x] Migrations: user-override schema versioning + migration-chain walkers for both user-layout and user-input-bindings
- [x] Error recovery: malformed server layout / localStorage blob → safe-load returns `{value:null}`, caller falls back to defaults (toast hook remains)
- [x] Rebinding UI: `InputRebindingPanel` with capture-modal, Unbind, Reset-to-default, and live conflict surfacing
- [x] Toast + telemetry on safeLoad failures — pluggable handler via `setSafeLoadFailureHandler`; default is `console.warn`. Host app wires the notification store at bootstrap
- [ ] Accessibility: focus order, ARIA roles, keyboard-only drag (arrow nudges 1px, shift+arrow nudges grid-size), `prefers-reduced-motion` honored
- [ ] Performance: `ManifestRenderer` render cost ≤ 2ms on mid-tier laptop; measured test in CI
- [ ] Telemetry (behind flag): edit-mode entries, override saves, preset loads, layout-switch events
- [ ] E2E Playwright: edit mode → drag widget → reload → verify persistence; switch layout → verify override isolation
- [ ] Docs: "Authoring a UI Pack" guide in `docs-site`, screenshots of every editor panel
- [ ] Feature flag flip: `isManifestHudEnabled` defaults `true`, legacy hard-coded HUD deleted in the same commit

---

## Parallelization

- U1–U2 are the critical path; everything else branches off them
- U3 parallel with U4
- U5, U6, U7 are independent
- U9 waits on U4
- U8 benefits from U2–U4 stable first
- U10 can ship after U11 if scope pressure demands

## Final shape — the "UI Pack"

```
game-module/ui/
  widgets.json        # widget catalog this module uses (subset of registry)
  layouts/
    default.json      # UILayoutManifest — Desktop/Tablet/Mobile variants
    minimal.json
  theme.json          # ThemeManifest
  customization.json  # cross-widget defaults (grid size, hold-key, etc.)
```

This is the Hyperscape equivalent of a UE5 UMG plugin pack —
importable, versionable, author-driven, player-customizable.
