# AI Authoring Foundations — Plan

**Status:** Draft — 2026-04-28
**Tip commit at planning time:** `5ab4af98b` on `feat/world-studio`
**Prior diagnostic:** `cedf92723` (`tinyThirdPartyPack.test.tsx` — proves
read-only end-to-end authoring works today)
**Successor to (in spirit):** `PLAN_UI_PACK_AAA.md` Phase D6.c arc
which produced the 50-widget catalog this plan turns into a usable
library.

## North star

HyperForge is a game-construction framework whose **primary user is
an AI agent**, not a human engineer. The framework's value flywheel:

1. **AI composes a game** from existing plugins and packs.
2. When a plugin doesn't exist, AI **authors a new one** and ships
   it back to the library.
3. The library **grows monotonically** over time as both humans and
   AIs contribute.
4. Each new contribution makes the next game easier to build.
5. AI agents play the games (via the existing `EmbeddedHyperiaService`
   pattern) and AI agents build the games (this plan).

**This plan is about the foundations the AI authoring loop needs
*before* any AI is wired up.** Live LLM testing is explicitly
deferred.

---

## Diagnostic findings — 2026-04-28

The `tinyThirdPartyPack` E2E diagnostic
(`packages/client/tests/unit/ui-framework/tinyThirdPartyPack.test.tsx`)
runs the production pipeline against a hand-written third-party
pack and asserts six load-bearing claims:

| Step | Claim | Status |
|---|---|---|
| 1 | `UIPackManifestSchema` accepts a hand-written pack | ✅ |
| 2 | `loadUIPackOnClient` validates + registers + activates | ✅ |
| 3 | `uiRegistry` binds every layout `widgetId` to a component | ✅ |
| 4 | `ManifestRenderer` produces DOM | ✅ |
| 5 | `bindings` resolve from `DataContext` (data flow IN) | ✅ |
| 6 | No JSON path for action / command bindings (data flow OUT) | ❌ |

**Implication:** the framework **today** lets a third party (human or
AI) ship a working **read-only** UI from JSON — health bars, chat
logs, leaderboards, inventory displays, themed reskins. It does NOT
let them ship interactive UI (buttons that send packets, inputs
that submit, drag-and-drop) from JSON alone — that requires host
code.

A second finding from inspecting the catalog:

- 50 widgets shipped to the meta-plugin (slices 31-80) under
  `com.hyperforge.hyperscape.*` ids.
- 30 of them declare callback props via `*RuntimeProps` interfaces.
- **None of those callbacks can be wired from JSON today** — the
  `WidgetInstance` schema has `props`, `bindings`, `customization`,
  and `visibility`, and no `actions` / `commands` / `callbacks`
  field.

A third finding:

- The catalog is real but **invisible**. There is no
  machine-readable index. An AI opening the codebase has to grep
  through 52 widget files in `hyperscape-plugin/src/widgets/` to
  discover what exists. No `catalog.json`, no MCP server, no CLI.

These three findings define the foundational work this plan covers.

---

## AI runtime split — Eliza orchestrates, Claude Code edits

A separate finding from the strategy conversation: ElizaOS — the
agent framework already used by `EmbeddedHyperiaService` for
in-game AI — is the right runtime for **two of the three** AI
roles in the vision, but probably not the third.

**Role 1 — Game-design agent.** Composes existing widgets and
plugins into a game; converses with the human; remembers prior
sessions; reasons about layouts. → **Eliza is a perfect fit.**
Memory layer, conversation state, plugin/action surface, multi-step
reasoning, and provider abstraction are all directly useful.

**Role 2 — In-game NPC / autonomous-player agent.** The existing
combat/duel/behavior agents. → **Eliza, already done.** Don't
change anything about that path.

**Role 3 — Plugin-authoring agent.** Writes new widget code, runs
tests, fixes type errors, commits. → **Mixed.** The pure
code-writing parts (file diffs, build verification, lint gates,
"did the test pass after my edit" loops) are better served by
specialized code-agent infrastructure (Claude Code, Aider, or a
similar agent that has those primitives natively). Eliza can
**orchestrate** this role — decide when to spin a code-writer up,
hand it a typed scaffold spec, validate the result against schemas
— but probably shouldn't be the agent literally writing the diffs.

**The pattern:** Eliza is the **orchestrator and conversation
layer**. Code-writing tools are **subprocess actions Eliza
dispatches to**, structurally identical to how the existing duel AI
delegates pathfinding or rate-limiting to engine systems. Eliza
coordinates, specialized systems execute.

**Implication for this plan:** every foundation must be a typed
TypeScript service callable from any program — Eliza, a CLI, an MCP
server, a unit test. The framework choice is downstream of the
service shape.

---

## Foundations, in priority order

Every item is **typed TypeScript service first**; agent shells
(Eliza actions, MCP wrappers, CLI commands) come after. Each item
is also a focused 1–3 day cut, not a multi-week mega-phase.

### Phase A1 — Catalog discovery service ⚪ *(next)*

**Goal:** make the existing 50-widget library AI-queryable in-process,
without inventing a new agent framework.

**Cheapest with the highest leverage.** Ship this first. Every
later phase benefits.

| File | Change |
|---|---|
| `packages/widget-catalog/` *(new package)* | `WidgetCatalogService` — typed service with `listWidgets(filter?)`, `getWidget(id)`, `searchWidgets(query)`, `listCategories()`, `getCategory(category)`. Backed by walking a `WidgetRegistry`. Returns `WidgetCatalogEntry` with manifest id, category, defaultSize, defaultProps, schema-derived prop summary, JSDoc summary, source plugin id |
| `packages/widget-catalog/src/extractDocs.ts` *(new)* | Pure helper that pulls the JSDoc summary block from a widget source file. Used at build time to produce per-widget docs without importing TypeScript-AST tooling at runtime |
| `packages/widget-catalog/src/index.ts` *(new)* | Public API exports |
| `packages/widget-catalog/__tests__/*` | Round-trip tests: register fixture widgets, query through service, assert shape of returned entries |
| `scripts/build-widget-catalog.ts` *(new)* | Build-time generator that walks every `*Widget.tsx` file across the monorepo, runs `extractDocs`, and produces `dist/catalog.json` — a static index any external tool can consume without booting the framework |

**Exit criteria:**
- `catalog.json` build artifact lists every widget across every
  plugin with stable manifest id, category, default props, JSDoc
  summary, source path.
- `WidgetCatalogService.listWidgets()` returns the same set
  in-process.
- A test asserts the in-process service and the static artifact
  agree on shape.

**Eliza wrapper (deferred to A4):** `actions/listWidgets.ts`,
`actions/getWidget.ts`, `actions/searchWidgets.ts` — each calls
the service, formats for an LLM prompt context.

**Leverage estimate:** unblocks every AI authoring use case. Without
this, an AI literally can't see what exists.

---

### Phase A2 — Action / command bindings

**Goal:** close the JSON authoring gap so interactive UIs can be
authored from manifests, not host code.

| File | Change |
|---|---|
| `packages/ui-framework/src/commands.ts` *(new)* | `CommandRegistry` mirror to `DataSourceRegistry`. Hosts register commands by id (`requestRespawn`, `useAbility`, `sendChatMessage`). Each command has a Zod schema for its arg shape and an async handler |
| `packages/ui-framework/src/commands.test.ts` *(new)* | Schema validation tests, dispatch tests, registry round-trip |
| `packages/ui-framework/src/layout.ts` | Add optional `actions: z.record(z.string(), CommandBindingSchema)` to `WidgetInstanceSchema`. Schema accepts strings like `"$command.requestRespawn"` with optional arg bindings |
| `packages/ui-framework/src/bindings.ts` | Add `evaluateCommandBinding` parallel to `evaluateBinding`. Resolves `$command.X` to the registered command + computes args from the rest of the binding chain |
| `packages/ui-widgets/src/ManifestRenderer.tsx` | At render time, for each `actions` entry, build a callback that dispatches the bound command. Pass the callback to the widget under the matching prop name |
| `packages/ui-widgets/src/widgets/ActionBarWidget.tsx` | First widget rewired with action bindings. Slot click → dispatch `$command.useAbility` |
| `packages/client/tests/unit/ui-framework/tinyThirdPartyPack.test.tsx` | Step 6 flips from "❌ no JSON path" to "✅ JSON path works". New steps assert action dispatch end-to-end |

**Exit criteria:**
- A pack can declare a button widget with
  `actions: { onClick: "$command.requestRespawn" }` and have it
  fire the command when clicked.
- The diagnostic test's step 6 asserts the new positive path.
- 30 of the meta-plugin widgets that have callback props now
  become usable from JSON authoring without writing host code.

**Eliza wrapper (deferred to A4):** none for this phase — actions
are framework concern, agents consume them via A1.

**Leverage estimate:** flips the framework from "read-only-from-JSON"
to "fully-interactive-from-JSON". Critical for the vision.

---

### Phase A3 — Plugin scaffolder service

**Goal:** close the contributor flywheel half — make creating a
new widget a programmatic call, not a manual file-by-file edit.

| File | Change |
|---|---|
| `packages/plugin-scaffolder/` *(new package)* | `PluginScaffolderService` with `scaffoldWidget(spec)`, `scaffoldPlugin(spec)`. Returns `{ files: Array<{ path, content }> }` plus a list of registration sites that need updating. Pure data — no filesystem I/O |
| `packages/plugin-scaffolder/src/templates/widget.tsx.template` *(new)* | Mustache-style template for `*Widget.tsx`. Slots: name, manifest id, category, prop schema, default props, component body |
| `packages/plugin-scaffolder/src/templates/widgetTest.ts.template` *(new)* | Template for the `__tests__/*Widget.test.ts` companion file |
| `packages/plugin-scaffolder/__tests__/*` | Round-trip: scaffold widget for a fixture spec, parse generated TypeScript through `ts.createSourceFile`, assert it has expected exports / Zod schema / JSX function |
| `packages/plugin-scaffolder/src/applyToWorkspace.ts` *(new)* | Optional helper for callers (CLI, agent) to actually write the files to disk + run formatter. The service itself stays pure |

**Exit criteria:**
- A test calls `scaffoldWidget({ name: "FooBar", category: "panel", schema: <zod> })` and asserts the returned content compiles and matches the established widget shape.
- An end-to-end test scaffolds a widget, writes it to a temp dir,
  imports it, registers it, and asserts the catalog now includes it.

**Eliza wrapper (deferred to A4):** `actions/scaffoldWidget.ts`. The
agent calls this when the catalog doesn't have what it needs. The
result is handed off to a Claude Code subprocess for any edits
beyond the scaffold (e.g., custom render logic).

**Leverage estimate:** without this, the library only grows at
human-coding speed. With it, the library scales with agent-hours,
not engineer-hours.

---

### Phase A4 — Agent shells (Eliza + MCP + CLI)

**Goal:** wrap A1 / A2 / A3 services with the consumer-facing
interfaces an AI runtime needs.

**This is the first phase that touches an AI runtime.** Everything
above is plain TypeScript with no agent dependency.

| File | Change |
|---|---|
| `packages/eliza-game-builder/` *(new package)* | Eliza plugin exposing `actions/listWidgets`, `actions/getWidget`, `actions/searchWidgets`, `actions/proposePack`, `actions/loadPack`, `actions/scaffoldWidget`, `actions/dispatchClaudeCode`. Each action wraps a service method from A1 / A2 / A3 |
| `packages/eliza-game-builder/src/promptHelpers.ts` *(new)* | Helpers that format catalog entries / pack manifests for LLM context. The goal is one entry point per action that produces a token-budget-friendly summary |
| `packages/eliza-game-builder/src/dispatchClaudeCode.ts` *(new)* | Subprocess action that hands a typed scaffold spec to Claude Code (or equivalent code-writing agent). Returns `{ success, filesChanged, testResults }` |
| `apps/widget-catalog-mcp/` *(new — optional)* | MCP server wrapping the catalog service for any MCP-aware client. Exposes the same `listWidgets` / `getWidget` shape. Independent of Eliza |
| `apps/hyperforge-cli/` *(new — optional)* | CLI wrapping all three services. `hyperforge widgets list`, `hyperforge widgets get <id>`, `hyperforge scaffold widget <name>`, `hyperforge pack validate <path>`. Useful for human contributors and as an Eliza subprocess target |

**Exit criteria:**
- Eliza plugin loads and registers all actions in a fixture
  Eliza runtime; tests assert action shape conforms to ElizaOS
  expectations.
- (Optional) MCP server starts, responds to `list_widgets` request.
- (Optional) CLI commands round-trip the same data as the in-process
  service.

**Leverage estimate:** this is the surface AI agents actually use.
But: the surface is cheap to build because A1–A3 already exist.

---

### Phase A5 — Worked example: AI builds a tiny game

**Goal:** validate the full loop end-to-end with a real AI agent in
the loop. Acts as the marketing demo, the regression test, and the
onboarding doc.

**This is where live-LLM work begins.** Everything above is
testable without an LLM.

Concrete artifact: a recording (or scripted Eliza session log)
where an AI agent:

1. Asks the catalog what HUD widgets exist (`listWidgets`).
2. Picks 3-4 widgets it wants for a tiny game (HP bar, action bar,
   chat).
3. Authors a `UIPackManifest` referencing them.
4. Discovers it needs a "WeaponLootDrop" widget that doesn't exist.
5. Calls `scaffoldWidget` to generate the boilerplate.
6. Dispatches Claude Code to fill in the custom render logic.
7. Loads the pack via `loadPack`.
8. Visually verifies the result in a running client.

**Exit criteria:** the recording (or script) runs end-to-end without
human intervention beyond the initial prompt. Failure modes are
documented and have follow-up tickets.

**Leverage estimate:** the demo proves the framework. Until this
exists, the AI-first thesis is unproven; once it exists, the
positioning is concrete.

---

## What this plan does NOT cover

**Explicitly deferred:**

- **Live LLM integration** beyond Phase A5. Building the library
  doesn't require an LLM in the loop.
- **Plugin distribution / package registry.** Premature; the local
  monorepo is sufficient until the library has external
  contributors. When it grows, npm + a registry index will
  suffice.
- **Visual editor for UI packs.** World Studio's existing UI Layout
  editor (PLAN_UI_PACK_AAA.md U2-U7) is the path; this plan
  doesn't displace it.
- **Hyperia gameplay polish.** Continues independently. The
  `tinyThirdPartyPack.test.tsx` plus this plan are about the
  framework, not the reference game.

---

## Sequencing principle

Build foundations bottom-up: **A1 → A2 → A3 → A4 → A5**.

Each phase produces a typed service that is testable without an
LLM. Agent shells (A4) come after the services they wrap exist.
Live AI testing (A5) comes only after the agent shells.

A1 is the smallest unit of work that immediately makes the
existing 50-widget library 10× more valuable — even before
interactive bindings or scaffolders land, an AI can build read-only
HUDs from the catalog as soon as it can see what's in it.

---

## Success metric

The framework's success is measured by **how quickly an outside AI
agent — given only the catalog and the docs — can ship a small
playable game without modifying engine code**. Today: not at all
(catalog is invisible). After A1: read-only HUDs only. After A2:
fully-interactive games. After A3: any game including widgets that
don't exist yet. After A4: agent-driven, end-to-end. After A5:
recorded, repeatable, demonstrable.

That is the test. Everything in this plan is in service of it.
