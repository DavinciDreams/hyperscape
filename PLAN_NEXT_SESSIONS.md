# Next Sessions Plan — 2026-04-26

**Status:** Drafted after PROGRESS_AUDIT refresh (commit `e5ecf612c`).
Engine/game separation just moved from 5% → 70% in 27 commits this
weekend. The work pattern is shifting from "find structural blockers"
to "finish enumerable items". This plan sequences those items.

**Tip commit at planning time:** `e5ecf612c` on `feat/world-studio`,
59 commits ahead of `main`. Plugin tests 187/187. Server build
clean. Server typecheck: 34 errors remaining (all real product
issues, none migration-related).

---

## Sequencing principle

Work the items in **leverage order** — each session should produce
either a closed phase or a measurable runtime change a non-engineer
could observe (a UI, a data file, a flag flip). Avoid sessions that
only produce internal refactors with no externally-visible delta.

---

## Session 1 — Wire plugin into prod startup (S, ~2h)

**Item #1 from top-10. Smallest concrete unlock.**

### Why first
The structural separation we shipped this weekend is real but
dormant — `gameplay-framework` exists, `@hyperforge/hyperscape-plugin`
exists with all 14 handler families and 6 substrate-promoted
services, but neither server nor client *boots through* the plugin
loader. Until this lands, the migration is a code-organization
change rather than a runtime architecture change.

### Concrete deliverables
1. Server `startup/world.ts` (or equivalent) loads
   `@hyperforge/hyperscape-plugin` via `gameplay-framework`'s host
   loader before world init.
2. Client `index.client.ts` does the same on the client side.
3. Plugin's `onEnable` runs and:
   - Registers all systems (`register("trading", ...)` etc.)
   - Installs all 6 substrate services (`world.connectionRegistry`,
     `world.combatAttackService`, `world.friendsService`,
     `world.homeTeleportFactory`, `world.playerSpawnService`,
     `world.processingHandlerContext` constructor)
   - Registers all network handlers via `world.connectionRegistry`
4. **Acceptance:** server boots end-to-end, character creation +
   spawn flow works, combat works, trade/duel work — same as
   before, but now plugin-loaded.

### Risks
- **Boot order**: server is `register → onEnable → init`; PIE/test
  is `register → init → onEnable`. Substrate pinning at register
  time covers both, but verify enter-world flow specifically (it's
  the most boot-order-sensitive path now that it's substrate-
  resolved).
- **Test environment**: `onEnable.test.ts` (the FakeWorld test)
  must continue to pass. Plugin tests 187/187 throughout.

### Acceptance gates
- `bun run dev` boots a server that responds to a client connection
- Manual smoke: spawn a character, attack a mob, complete a trade
- Plugin tests still 187/187
- Server typecheck doesn't regress (still ≤34)

---

## Session 2 — Game-data JSON extraction (M, ~3h)

**Item #2 from top-10.** Closes Phase A meaningfully and removes
~2,000 LOC of Hyperscape-specific TypeScript from `shared/data/*.ts`.

### Targets (in priority order)

Each is independent — can ship as separate commits within one
session or split across sessions.

| Target file | LOC est. | Existing manifest? | Action |
|---|---:|---|---|
| `shared/src/data/duel-manifest.ts` | 427 | Partial in `combat-tuning.json` | Extract `DUEL_RULE_DEFINITIONS`, `EQUIPMENT_SLOT_DEFINITIONS`, `CHALLENGE_TIMEOUT_MS` to `duel-rules.json`; load via provider |
| `shared/src/data/items.ts` | ~600 | `server/world/assets/items/` already manifest | Consolidate — drop the TS module, route consumers through `itemsProvider` |
| `shared/src/data/npcs.ts`, `npc-sizes.ts` | ~400 | `server/world/assets/npcs.json` already exists | Consolidate via `npcsProvider` |
| `shared/src/data/banks-stores.ts` | ~300 | `stores.json` exists | Consolidate via `storesProvider` |
| `shared/src/data/runes.ts`, `combat-spells.ts` | ~250 | Both already have JSON twins | Drop TS modules; route through providers |

### Acceptance per target
- Old `.ts` file deleted
- Manifest schema added to `@hyperforge/manifest-schema` if not
  present
- Provider exposes typed accessors (`getItem(id)`, `getDuelRules()`)
- All consumers route through provider (grep verification)
- Hot-reload via PIE `updateManifests()` works
- No runtime regression (smoke test the affected feature)

### Why it matters
Master criterion #4 ("a different game can be built from the same
blocks") requires that game data is data, not code. Each of these
files is a hardcoded Hyperscape constant set; a non-Hyperscape game
can't use the engine without first deleting these.

---

## Session 3 — Plugin Browser UI (M, ~3h)

**Item #3 from top-10.** Closes Phase I.

### Backend already shipped
- 7 routes in `asset-forge` server: POST/GET/GET-by-id for
  community registry, install endpoint with sha256 verification,
  POST/GET content store
- 107 TypeScript types in `manifest-schema` and substrate
- 13-subcommand CLI (`hyperforge create-plugin`, `pack`, `publish`,
  `install`, etc.)
- Content store with idempotent dedup

### Missing
A React UI in `asset-forge` that consumes the existing routes:

| Component | Purpose |
|---|---|
| `PluginBrowserPanel.tsx` | Main panel — search, list, filter |
| `PluginCard.tsx` | Per-plugin tile (name, description, version, install button) |
| `PluginDetailModal.tsx` | Full description, README, version history, dependencies, screenshots |
| `InstalledPluginsTab.tsx` | List of currently installed plugins, update/uninstall |
| `PublishPluginDialog.tsx` | Author flow — pack + publish from UI (optional; CLI is the primary author surface) |

### Acceptance
- Open World Studio, navigate to Plugin Browser
- See `@hyperforge/combat`, `@hyperforge/skills` listed (already
  in registry)
- Click Install — plugin downloads via content store, shows in
  Installed tab
- Hyperscape itself loads as a plugin via this flow (round-trip
  the meta-plugin through the registry)

### Why it matters
Phase I "the architectural payoff" — without the UI, the
plugin marketplace is invisible to non-engineers. This is the
visible-progress surface that completes the I phase.

---

## Session 4 — D7 plugin widget + XP orb (S, ~2h)

**Item #4 from top-10.** Establishes the per-widget migration
pattern for the rest of D6.c.

### Two separate sub-items, shipped together
- **D7**: plugin widget contribution API — let plugins register
  widget types via `world.widgetRegistry.register("xp-orb", ...)`
  at onEnable. Currently widgets are hardcoded in `ui-widgets`
  package.
- **D6.c.1 (XP orb)**: migrate the XP-drop visualization from the
  hardcoded `XPDropSystem` (already plugin-side) into a `widget`
  contribution.

### Acceptance
- XP orb visible in Hyperscape exactly as before, but now sourced
  from a widget the plugin registers
- A different plugin could register a different XP-orb visual
  (drop-in replacement)
- WidgetRegistry test covers register + unregister via plugin
  scope disposer

### Why it matters
Establishes the recipe for D6.c (the larger 19-HUD + 50-panel
migration). One worked example unblocks the systematic chase.

---

## Session 5 — D6.c per-widget migration (L, multi-session)

**Item #5 from top-10.** Largest remaining UI work.

### Scope
~24 HUD elements + ~50 panels currently hardcoded in
`packages/shared/src/systems/client/*` and React components in
`packages/client/src/`. Each becomes a widget registered by the
plugin.

### Sub-batches

| Batch | Targets | Effort |
|---|---|---|
| D6.c.A | Inventory, Equipment, Skills (3 panels — most-used) | 1 session |
| D6.c.B | Bank, Shop, Trade, Duel (4 panels — gameplay-modal) | 1 session |
| D6.c.C | Health bars, Damage splats, Cast bars, Minimap (4 HUDs — render-loop) | 1 session |
| D6.c.D | Quest log, Friends, Chat, Settings (4 panels — overlay) | 1 session |
| D6.c.E | Long tail (~15 HUDs + ~35 panels) | 2-3 sessions |

### Pattern (from D6.c.1)
1. Identify widget surface — what data does it bind to, what
   actions does it emit?
2. Define widget schema in `manifest-schema`
3. Implement the widget in the plugin's `widgets/` directory
4. Register via plugin onEnable
5. Replace the hardcoded React component with `<ManifestHud
   widget="..."/>` instantiation
6. Verify visual + behavior parity

### Why it matters
Until UI is widget-driven, the "build a different game" story has
a giant asterisk: "as long as you have Hyperscape's UI." Master
criterion #4 requires UI is composable too.

---

## Session 6 — AI service test coverage (M, ~3h)

**Item #6 from top-10.** Production-shipped without tests is a real
risk.

### Targets
6 Claude/OpenAI services + 3 ElevenLabs services + GPT-5 Vision +
PlaytesterSwarm — currently zero tests.

### Approach
Vitest contract tests with mocked HTTP responses (don't hit live
APIs in CI). For each service:
1. Snapshot the request shape (URL, headers, body)
2. Snapshot the response parser
3. Verify error paths (rate limit, timeout, malformed response)
4. Cover the happy path with a fixture

### Acceptance
Each service has at least 3 tests: happy path, rate-limit
fallback, malformed-response handling. Total ~30 new tests.

### Why it matters
Phase H (AI as data) is at 35% per the audit, but the production
risk is "zero coverage on 10 integrations". Tests don't move the
phase percentage but they make the existing 35% trustworthy.

---

## Session 7 — Final shared cleanup + closure (M, ~3h)

**Item #8 from top-10.** Path to "shared has zero Hyperscape
identifiers."

### Targets
After Session 2 (game-data JSON extraction) lands, the remaining
Hyperscape-specific code in shared is:

- `shared/src/types/game/*.ts` — game-specific type definitions
  (`combat-types.ts`, `duel-types.ts`, `inventory-types.ts`,
  `prayer-types.ts`, `quest-types.ts`, `social-types.ts`,
  `trade-types.ts`)
- A handful of `shared/src/data/*Provider.ts` files that load
  game-specific manifests

### Strategy
- Game-specific types: each becomes a substrate type in shared
  (engine declares the slim shape it consumes), and the full type
  lives in plugin. Same pattern as `IFriendsService` /
  `IPlayerSpawnService`.
- `*Provider.ts`: keep the abstract `Provider<T>` contract in
  shared but move the game-specific provider classes to plugin.

### Acceptance
- `grep -r "Hyperia\|Hyperscape" packages/shared/src/` returns
  zero matches in code (only in comments + migration history)
- Master criterion #2 fully ✅

### Why it matters
This is the formal close of master criterion #2. After this
session, the audit's engine/game separation row goes from 70% →
~95%.

---

## Session 8 — DataSourceRegistry + ui-pack.json (M, ~3h)

**Item #7 from top-10.** Closes Phase D.

### D8 — DataSourceRegistry
Currently widgets hardcode their data sources (`useGameState()`,
direct `world.entities.get(...)` reads). DataSourceRegistry lets
widgets declare their data sources by string key, and the host
wires them up.

### D9 — ui-pack.json
A manifest that bundles widget definitions + theme + layout per
game. Loading a ui-pack swaps the entire UI surface.

### D10 — exit gate
Verification that D phase's success criteria are met:
- Every Hyperscape HUD/panel is a widget
- Every widget reads its data via DataSourceRegistry
- Hyperscape's UI ships as a single ui-pack.json file
- A different ui-pack.json renders a different game's UI on the
  same engine

---

## Sessions 9+ — Long-tail (ongoing)

**Item #10 from top-10. Hygiene + consumer wiring.**

These don't form discrete sessions but slot into every other
session as opportunistic cleanup:

- Long-tail registry consumer-wiring (~90 still unwired) — pick
  one or two per session
- Logger migration (2,267 console.* calls → logger)
- Skipped tests (4,309) — re-enable in batches
- CombatSystem decomposition (4,019 → <2,000 LOC) — already
  plugin-side, can be split into strategy classes
- Entity.ts decomposition (3,208 → <1,500)
- `as unknown as` audit
- `@ts-ignore` audit

---

## Total realistic effort

| Session | Topic | Effort |
|---|---|---|
| 1 | Wire plugin into prod | S (~2h) |
| 2 | Game-data JSON extraction | M (~3h, can split) |
| 3 | Plugin Browser UI | M (~3h) |
| 4 | D7 plugin widget + XP orb | S (~2h) |
| 5 | D6.c per-widget migration | L (~5 sessions × 3h) |
| 6 | AI service test coverage | M (~3h) |
| 7 | Final shared cleanup | M (~3h) |
| 8 | DataSourceRegistry + ui-pack | M (~3h) |
| 9+ | Long-tail hygiene | ongoing |

**Total focused sessions to AAA done: 10–14** (matches the
refresh's 8–12 estimate when sessions 5 and 9+ are amortized
across other work).

---

## What "done" looks like after this plan

Per master plan success criteria:

| Criterion | Today | After this plan |
|---|---|---|
| 1. Gap Matrix all ✅ | ~50% | ~95% |
| 2. shared zero Hyperscape | 70% | ~95% (Session 7) |
| 3. Hyperscape runs unchanged from manifests + plugins | ~50% | ~95% (Session 1 + 2) |
| 4. Different game from same blocks | ~30% | ~85% (Sessions 1, 2, 4, 5, 8) |
| 5. /super-audit zero P0/P1 | unmeasured | measure post-S5 |
| 6. Plugin Browser UI exists | 0% | 100% (Session 3) |
| 7. AI layer can target every manifest | ~40% | ~70% (Session 6 + ongoing) |

After Sessions 1 + 2 (the small + medium quick wins), the branch
is **shippable as v1 of "AAA AI game studio suite"**. Sessions
3–8 are polish + completeness; the studio is functional after the
first two.

---

## Recommended start: Session 1

**Wire plugin into prod startup.** S effort, ~2h, smallest
concrete unlock. Turns this weekend's structural separation into a
runtime architectural change.

**Plugin tests must stay 187/187 throughout. Server build must
keep passing.** Same discipline as the F3+G-1 migrations.

If anything in Session 1 turns out larger than S — e.g., a boot-
order surprise that needs another substrate type — escalate that
finding back into this plan and reorder.
