# State of the Project

**Date:** 2026-04-29
**Tip commit:** `6180449f0` on `feat/world-studio`
**Purpose:** Single composite picture of HyperForge / Hyperia work-to-date,
the active plan ecosystem, and the path to AAA. Update at each major
phase boundary; reference at session start.

---

## The vision

**HyperForge** is a game-construction platform whose primary user is
an AI agent. Its strategic test: can **Hyperia** (the reference game,
running on port 3333) be **rebuilt regression-free from its own
plugin building blocks** via PIE in World Studio? If yes, the
platform exists. If not, agent-built games on the same blocks are
on unstable ground.

**Two operational claims that define "done":**

1. **Reconstruction**: pressing Play on the hyperscape project in
   World Studio plays bit-for-bit identical to port 3333.
2. **Composition**: a designer sits in front of the editor for 10
   minutes, chats with an AI agent, and ends up with a small
   playable scene that survives Publish.

Without (1), (2) is incoherent. Both are required for AAA.

Long-term: a plugin marketplace where humans + AIs both contribute
building blocks; the library grows monotonically; each new
contribution makes the next game easier to build.

---

## Plan ecosystem (10 active plans)

### Complete plans

| Plan | What | Closing commits |
|---|---|---|
| `PLAN_AI_AUTHORING_FOUNDATIONS.md` | Phase A: catalog → action surface → agent runner → server → chat panel | A1 `f3845ac36` → A5 `48b664c23` |
| `PLAN_SERVERNETWORK_MIGRATION.md` | Move ServerNetwork to shared, real loopback in PIE | Steps 1–9 done, capstone `054588a48` |
| `PLAN_ENGINE_API_EXTRACTION.md` | Substrate interfaces (ISpatialIndex etc.) pinned to world.X | Phases A–F + G-1 done at `b7fd7318a` |
| `PLAN_UI_PACK_AAA.md` | UI pack runtime + authoring substrate (themes, variants, presets, rebinding) | U0–U11 all shipped 2026-04-19 |

### In-flight plans

| Plan | What | Status |
|---|---|---|
| `PLAN_AAA_QUALITY.md` | Phase B (B0–B10) — close 10 quality gaps | B0 just inserted as priority 1 (`6180449f0`) |
| `PLAN_NEXT_SESSIONS.md` | Top-10 decomposition queue | Sessions 1, 3, 5–8 still pending; Session 2 voided |
| `PLAN_ENGINE_GAME_SEPARATION.md` | Master engine/game split, 8 phases | Phase 2 ~70%, Phase 3 done, Phases 4–8 queued |
| `PLAN_WORLD_STUDIO_AAA_COMPLETION.md` | World Studio editor parity | Phases A/B/C ~30%, Phase D ~50%, E–K queued |
| `PLAN_PHASE_D.md` | UI/HUD framework D1–D10 | D1–D6 partial; D7–D10 queued |
| `PLAN_HEAVY_CLUSTER_MIGRATION.md` | Move 13 coupled gameplay systems out of shared | Wave 1 attempted, reverted on tsconfig strictness |

---

## Decomposition status (per domain)

| Domain | Status | New home | Remaining in shared |
|---|---|---|---|
| Combat | ~95% | `@hyperforge/hyperscape` | Substrate interfaces only |
| Skills / gathering / crafting | ~70% | `@hyperforge/hyperscape` | Constants façades |
| Player / character | ~70% | Plugin (queued, Wave 5) | Player ECS, spawn service |
| Inventory / equipment / bank | ~70% | Plugin (queued, Wave 5) | Type defs, interfaces |
| Loot / economy | ~80% | Plugin | Economy constants |
| Quests / dialogue | ~50% | Plugin (partial) | Quest system core |
| NPCs / mobs / spawning | ~70% | Plugin (queued, Wave 3) | Mob behavior, spawn logic |
| Networking / ServerNetwork | 100% | `@hyperforge/shared` (engine) | — |
| UI / HUD / panels | ~40% | Widget registry + plugin | 70+ panels still hardcoded |
| World content / terrain / vegetation | ~70% | Plugin (TownSystem queued, Wave 2) | Terrain, spatial grid |
| Rendering / graphics / particles | 100% | `@hyperforge/shared` (engine) | — |

**Critical remaining mass in `packages/shared/src/`:**
- `systems/server/network/` — engine substrate (stay)
- `systems/shared/combat/` — ~2.5K LOC, Wave 6 target
- `systems/shared/character/` — Player + Skills + Equipment, ~3K LOC, Wave 5
- `systems/shared/economy/` — Inventory + GroundItem, Waves 3 + 5
- `systems/shared/entities/` — EntityManager + MobNPC, Wave 3
- `types/game/*.ts` — 3.3K LOC, substrate-promote or move (Session 7)

---

## Hyperia ↔ PIE parity gap (Phase B0 — current priority)

The decomposition succeeded at world content (NPCs, mobs, manifests
render correctly in PIE). Three gameplay-loop gaps remain:

| Gap | Root cause | Plan | Sub-slice |
|---|---|---|---|
| Click-to-interact dead in PIE | `PIEInteractionRouterShim` is throwaway scaffolding (per its own docstring); real `InteractionRouter` exists but isn't wired | `PLAN_SERVERNETWORK_MIGRATION` Step 9 footnote | **B0.2** (~5–7 days) |
| HUD shows placeholders, not live HP/inventory | PIE has registry but no `DataContext` bridge from in-process server world | `PLAN_WORLD_STUDIO_AAA_COMPLETION` Phase 3 | **B0.3** (~3 days) |
| Prod server is monolithic; PIE is plugin-loaded → drift | Plugin loader not yet wired into prod startup | `PLAN_NEXT_SESSIONS` Session 1 | **B0.1** (~1 week) |

**B0.4** = scripted parity smoke test (~2 days).

**B0 total: ~2–3 weeks. Blocks every B1+ capability.**

---

## What's left to reach AAA

### Hard blockers (must complete in order)

1. ~~**B0.1 — Session 1 plugin boot in prod**~~ ✅ **SHIPPED** (verified 2026-04-29). Server `startup/world.ts:149` calls `bootServerPlugins(world)`; client `GameClient.tsx:407` calls `bootClientPlugins(world, undefined, uiRegistry)`. Plugin tests at 712/712 (plan target was 187 — substantial overshoot). Server typecheck has 82 unrelated Eliza-version-drift errors (separate concern).
2. **B0.2 — Real InteractionRouter in PIE** (~5–7 days). Three integration layers:
   - ✅ B0.2a — Expose `renderer: WebGPURenderer` on `TerrainSceneRefs` (shipped 2026-04-29 in this session)
   - ⚪ B0.2b — Add `renderer`/`scene` options to `PIEEditorSession`, mount editor refs onto `_clientWorld.graphics` / `.stage.scene` / `.camera` (~half day)
   - ⚪ B0.2c — Entity registry parity: PIE markers currently live in scene only, not `world.entities`. `RaycastService.getEntityAtPosition` looks up entities by ID in `world.entities`. Either route the server's entities packet through PIE's loopback into `world.entities` (preferred — proves end-to-end packet protocol parity), or adapt RaycastService to fall back to scene userData (~2–3 days, larger because it requires auditing what the server sends through the loopback)
   - ⚪ B0.2d — Register real `InteractionRouter` against `_clientWorld`, delete `PIEInteractionRouterShim` (~half day, gated on a/b/c)
   **NEXT slice in B0.**
3. **B0.3 — Live DataContext bridge in PIE** (~3 days). Pulls live state from in-process `ServerNetwork`.
4. **B0.4 — Parity smoke test** (~2 days). Catches regressions automatically.

### Then AAA capability tier

5. **B1 — Agent authors world content** (~2.5 weeks). 4 actions: NPC placement, zone definition, spawn table, quest graph. Each emits validated `Compiled*` shape; PIE renders.
6. **B2 — Persistence** (~1 week). Pack/world content saves to game data file via asset-forge manifest API; survives reload + ships on Publish.
7. **B3 — State-aware agent** (~1 week). World state in system prompt; agent references real entities by name.

### Then quality + sustainability

8. B4 — Iteration loop (refine/variants/undo) (~1 week)
9. B6 — Streaming UX (no 60s blank wait) (~3–5 days)
10. B7 — Closed code-write loop (test gating) (~3–5 days)
11. B9 — Asset gen wired into agent (~1 week)
12. B8 — Multi-agent orchestration (~1–2 weeks)
13. B10 — Live-LLM CI coverage (~3–5 days)

### Parallel tracks (independent of B sequence)

- **D6.c long-tail**: 70+ widgets still hardcoded; ~2–3 weeks at 6–8/week
- **Heavy-cluster Wave 1+**: 13 systems coupled; needs tsconfig strictness fix first; ~2 weeks total
- **D7–D10**: plugin contribution surface, DataSourceRegistry, ui-pack.json, legacy delete; ~4 sessions
- **`PLAN_ENGINE_GAME_SEPARATION` Phases 4–8**: scaffold `hyperia` package, file moves, engine rename, second game, npm publish; ~10–15 weeks

### Total to AAA

- **MVP demo path (B0 + B1 + B2 + B3)**: ~6–8 focused weeks
- **Realistic with D6.c long-tail + cluster migrations parallel**: 4–6 calendar months
- **v1.0 published platform with `demo-arena` second game**: ~9–12 months

---

## Architectural commitments (constraints on future work)

1. **Manifest-first.** If it's data, it's a Zod-schema'd JSON manifest with an editor panel. Estimate editor work as ~40% of every data migration.
2. **Plugin-as-game.** Hyperia must load as a plugin to prove the split works. No special-cased Hyperia code paths.
3. **UILayoutManifest sole source.** Editor is system-of-record for layout/theme/bindings. Hand-edited JSON must safe-load with fallback.
4. **Substrate interfaces.** Cross-package coupling goes through `world.X` interfaces, not direct imports.
5. **Every migration lands in two commits.** Extract (zero behavior change) + expose (editor surface).
6. **No regression.** Each phase lands with vitest + Playwright smoke green. Live game never breaks. CI enforces engine purity.
7. **No OSRS/RuneScape/Jagex references** in code or tracked files. Project = HyperForge, game = Hyperia (not Hyperscape).
8. **Boot-order asymmetry**: server is `register → onEnable → init`; PIE is `register → init → onEnable`. New systems must work in both.

---

## Open risks / known issues

| Risk | Detail | Mitigation |
|---|---|---|
| **Cross-package type errors** | Heavy-cluster Wave 1 reverted on ~80 type errors at d.ts re-export boundary | tsconfig strictness diagnosis (1 day); fix before Wave 2 |
| **Renderer plumbing** | B0.2 needs renderer exposed through 3 levels of editor refs | Refactor `TerrainSceneRefs` to expose renderer (~1 day) |
| **Asset-forge yoga-layout build** | Pre-existing, not root-caused | Diagnose if it surfaces during cluster migration |
| **70+ widget long-tail** | D6.c.5 mechanical but time-consuming | Parallel execution or AI-assisted scaffolding |
| **IP audit cleanup** | 2379 OSRS/RuneScape/Jagex hits, mostly comments/docs | One large pre-v1.0 sweep PR; don't mix with feature work |
| **Plugin context versioning** | No version negotiation between plugin + host | Defer; raise pre-marketplace |
| **localStorage migration cross-deploy** | Old client + new server schema mismatch | safeLoadLayoutManifest covers most; revisit pre-v1.0 |

---

## Recommended immediate sequence

**Next 1–2 working days:**
- Audit + fix `tsconfig` strictness for cluster migration (unblocks Wave 1)
- OR start B0.1 (Session 1 plugin loader in prod)

**Next 1–2 weeks:**
- B0.1 (1 week)
- Begin B0.2 (renderer exposure refactor → real InteractionRouter)
- D6.c widgets in parallel (6–8 widgets/week)

**Next 1–2 months:**
- B0 complete (parity validated, smoke test green)
- B1 in progress (agent authors world content)
- D6.c long-tail substantially closed

**Next 4–6 months:**
- B0 + B1 + B2 + B3 done
- D6.c long-tail done
- Heavy-cluster migrated
- Demo: designer chats with agent, plays a tiny new game in 10 minutes

**Next 9–12 months:**
- `PLAN_ENGINE_GAME_SEPARATION` Phases 4–8 done
- v1.0 with `demo-arena` second game published to npm
- Plugin marketplace MVP

---

## Sources

This document synthesizes content from:
- All 10 `PLAN_*.md` files at the repo root
- `MEMORY.md` index + recent session entries
- 502 commits on `feat/world-studio` (last 30 days)
- Substrate audit (file paths cited in plans)

Update this document when:
- A plan completes (move to "Complete" section)
- A new plan is drafted
- Major architectural commitment changes
- Decomposition status materially advances per domain
- Major risks identified or mitigated
