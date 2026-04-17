# Engine / Game Separation — Uncompromising Plan

**Status:** planning locked, execution starting
**Branch:** `feat/world-studio` (user elected to continue here, not a separate branch)
**Last updated:** 2026-04-17

---

## The vision

1. **`@hyperforge/engine`** — publishable, game-neutral 3D MMO engine. Third parties can `npm install @hyperforge/engine` and build games on it.
2. **`hyperia`** — the RuneScape-style MMORPG as a complete game package. Unscoped, brand-forward (matches `three`, `react`, `next` — headline products don't hide behind a scope). Also publishable. Installable as a template. *(Requires `npm view hyperia` check before Phase 8 publish; fallback is `@hyperforge/hyperia`.)*
3. **`@hyperforge/studio`** — World Studio renamed from `asset-forge`. Multi-game AI-native editor. Works with any game built on the engine.
4. **`@hyperforge/types`** — zero-runtime shared type contracts. Created lazily when needed to break cycles.
5. **At least two games on the engine.** Hyperia is one. `@hyperforge/demo-arena` (top-down arena) is the second. If the engine can only build Hyperia, the split failed.
6. **Monorepo root** is named `hyperforge` (unscoped, `private: true`). The platform brand. Never published.
6. **PIE is real PIE.** In-process server + client + loopback socket. UE5 parity.
7. **AI generation is a pluggable layer** the studio offers to any game.

## The 10 invariants (non-negotiable)

1. Live game never regresses. Full vitest + Playwright smoke green between every phase.
2. Engine has zero game imports. Enforced by CI check.
3. Game files move unmodified during extraction. Git diff of moved files is empty.
4. No hand-maintained `.d.ts`. Switch to `tsc --emitDeclarationOnly` in Phase 5.
5. Public API is frozen before 1.0.
6. Second game exists as a living acceptance test by end of Phase 7.
7. Zero "TODO later" stubs. Each phase lands complete.
8. PIE uses the same code paths as production.
9. Data migrations preserve production worlds.
10. Tests grow, not shrink. Engine ships with ≥80% coverage of its public API.

## Locked decisions

| Question | Locked answer |
|---|---|
| PIE topology | Real loopback (dual-world + duplex socket pair) |
| Plugin loading | Federated dynamic bundles from the start |
| Engine publishability | Publish `@hyperforge/engine` to npm at Phase 8 |
| Studio rename | `asset-forge` → `@hyperforge/studio` in Phase 7 |
| Second game | `@hyperforge/demo-arena` — top-down arena: 1 pawn, 1 mob type, click-to-attack, health bar, score counter. No inventory/skills/quests. |
| AI generation | Studio-owned pluggable layer in Phase 7 |
| Type definitions | Switch to `tsc --emitDeclarationOnly` in Phase 5 |
| Zero-regression gate | Full vitest + Playwright smoke + CI engine-purity check, every phase |
| Approval cadence | Execute once signed off; surface blockers as they appear |
| GameMode contract | Expanded to PlayerState + GameState + HUD + GameRules in Phase 4 |
| Networking | Generic RPC + replication primitives in engine; games declare packet types in Phase 4 |
| Physics layers | Engine ships primitives; games declare layer enums in Phase 4 |
| Save/load | Schema-driven persistence layer in engine; games declare save shapes in Phase 4 |
| Agent integration | Engine exposes hook API; Hyperia ships its own agent layer |
| Scripting security | Formal sandbox + capability model + fuzz tests in Phase 7 |
| Branching strategy | `feat/world-studio` (user chose to continue on current branch) |
| Phase 0 (research) | **SKIPPED** — execute live, inventory becomes a living doc as we discover |

## Naming — locked

- **Platform / monorepo root:** `hyperforge` (unscoped, private)
- **Engine:** `@hyperforge/engine` (scoped, publishable)
- **Game (was Hyperscape):** `hyperia` (unscoped, brand-forward, publishable as template)
- **Studio (was asset-forge):** `@hyperforge/studio`
- **Second game:** `@hyperforge/demo-arena`
- **All other infra:** `@hyperforge/*` (server, client, procgen, physx-js-webidl, docs-site, types)

The `@hyperscape/*` scope sweep is **done** — every package.json, import, tsconfig, turbo.json, CI workflow, and doc now uses `@hyperforge/*`. The `Hyperscape → Hyperia` code-content rename (class names like `HyperscapeService` → `HyperiaService`, service identifiers, user-facing copy) is a **separate follow-up batch**, executed after the scope rename commit lands cleanly.

---

## The phases

### Phase 1 — `@hyperforge/types` package [deferred]
Originally first, now lazy. The `shared↔procgen` cycle is deep runtime, not types-only — a types package doesn't break it cleanly. Create this package when an actual phase needs it (likely Phase 4 when engine and game need to share Vector3/Quaternion-like primitives without runtime coupling).

### Phase 2 — Close the deferred gameMode-phase-4 wiring
Scope:
- `createPlayTestWorld.ts` hosts a minimal InteractionRouter + ClientCameraSystem surface that controllers' `attach()` methods need.
- `usePIESession.ts:297-319` three-way fall-through replaced with real `controller.attach(ctx)` calls per resolved GameMode.
- `pieRoundtrip.test.ts` "click-to-walk: tick is a facade no-op" test upgraded to assert real routing.

Exit: 47+ gameMode tests pass. Click-to-walk works in PIE. Manual smoke: camera orbits pawn; clicks issue move intents.

### Phase 3 — Real loopback PIE
Scope: PlayTestWorld replaced by PIESession that spawns in-process server World + client World, connected by duplex in-memory Socket pair implementing the same interface as the WebSocket transport.

Includes:
- Packet roundtrip tests
- Latency simulation knobs
- Desync-detection instrumentation
- Net-sync regression tests

Exit: PIE indistinguishable from real server connection. Every packet type roundtrips. `PIENetworkStub` deleted.

### Phase 4 — `hyperia` shell + GameMode contract expansion
**Two parallel tracks:**

**Track A:** New package scaffolded with re-exports from shared. Every game-specific import site migrated one at a time, driven by a living inventory doc. Automated codemods for mechanical cases. Engine-specific imports keep pointing at `@hyperforge/shared`.

**Track B:** GameMode contract expanded:
- PlayerState (per-session data: score, name)
- GameState (game-wide: match timer, phase)
- HUD (game-specific UI layer)
- GameRules (win conditions, scoring, spawn rules)

Plus game-owned packet registry, physics layers, save shapes.

Exit: `hyperia` exists. Every game-specific import in the monorepo points at it. `@hyperforge/shared` still has all the files but only engine imports. Full vitest + Playwright smoke green.

### Phase 5 — Move files + `tsc --emitDeclarationOnly`
Physically relocate game files from `packages/shared/src/` to `packages/hyperia/src/`. Mechanical because imports already resolve. Git rename preserves history.

Delete every hand-maintained `.d.ts`. Switch both packages to `tsc --emitDeclarationOnly`.

Exit: `packages/shared/` contains only engine. `packages/hyperia/` contains all game. Leaked-`.d.ts`-in-`src/` gone.

### Phase 6 — Rename `@hyperforge/shared` → `@hyperforge/engine`
Pure textual rename. Every import, every package.json, every tsconfig, every doc.

CI engine-purity check added: `@hyperforge/engine` may not import from `hyperia` or any game package.

Exit: Engine imports clean. CI enforces boundary.

### Phase 7 — Studio, federated plugins, second game
**Four parallel tracks:**

**Track A:** `asset-forge` → `@hyperforge/studio`.

**Track B:** Federated GameMode loading. Studio discovers bundled GameMode packages at boot, loads in isolated runtimes, exposes in GameMode picker.

**Track C:** `@hyperforge/demo-arena` built. Top-down arena, 1 pawn, 1 mob type, no inventory/skills. Ships as package. Loads in studio via federated loader. Plays in PIE. **Acceptance test for the split.**

**Track D:** AI generation extracted to studio-owned pluggable layer. Hyperia declares prompts/services through protocol. demo-arena declares minimal stub.

Plus: scripting sandbox + capability model + fuzz tests.

Exit: Studio loads Hyperia and demo-arena through same loader. PIE works for both. Generation works for both. Sandbox tests pass.

### Phase 8 — Publish + lock
Engine + Hyperia + Studio publish to npm at 1.0.0. Docs site updated. TypeDoc generated. Every re-export shim deleted. API frozen.

Ship `create-hyperforge-game` CLI: `npx create-hyperforge-game my-game` scaffolds new game on `@hyperforge/engine` (with `hyperia` as the reference template).

Exit: Third parties can use the engine. 1.0.0 everywhere.

---

## Estimated shape

- Phase 1: deferred
- Phase 2: 1–2 days
- Phase 3: 1–2 weeks
- Phase 4: 2–3 weeks (heart of the project)
- Phase 5: 1 week
- Phase 6: 1–2 days
- Phase 7: 3–4 weeks
- Phase 8: 1 week

Total: ~9–11 weeks.

---

## Next concrete action

**Resolve the naming question above (A or B), then begin Phase 2.**

Phase 2 is the right first phase because:
- Doesn't depend on the types package
- Doesn't depend on the scaffold
- Proves the existing GameMode contract works end-to-end before we lean on it heavily
- Small, visible win (PIE actually uses click-to-walk)

Phase 4 Track A then starts the scaffold and begins migrating imports.
