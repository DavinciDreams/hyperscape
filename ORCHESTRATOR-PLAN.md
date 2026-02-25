# Hyperscape Duel+MM+UI Orchestration Plan
**Date:** 2026-02-25  
**Branch:** `feat/solana-clob-mm-updates`  
**Repo:** `/home/shad0w/hyperscape-sol-work`  
**Model:** Opus 4.6 (all builders)  
**Review:** codex CLI (gpt-5.2-codex)

## Execution Sequence

### ✅ PHASE 1: Parallel Launch (A + B)

#### Task A: Unified Duel+MM Launcher
**Owner:** Builder 1  
**Depends on:** None  
**Files:**
- `scripts/duel-mm-stack.mjs` (create)
- `package.json` (update - add scripts)

**Task:**
```
Create scripts/duel-mm-stack.mjs that wraps scripts/duel-stack.mjs with:
- --with-mm, --verify, --mm-mode, --mm-config, --mm-stagger-ms, --fresh flags
- --strict-preflight (default true)
- --strict-mm-eligible (maps to MM_FAIL_ON_NO_ELIGIBLE=true)
- Block stack-online announcement until all health gates green

Add to package.json:
- "duel:mm": "bun scripts/duel-mm-stack.mjs"
- "duel:mm:full": "bun scripts/duel-mm-stack.mjs --fresh --with-keeper"
- "duel:mm:verify": "bun scripts/duel-mm-stack.mjs --verify-only"

Acceptance:
- bun run duel:mm --fresh reaches online without manual intervention
- Startup output includes explicit PASS/FAIL for: game server, duel state, HLS, betting UI, MM workers
- Non-zero exit on strict preflight failure
```

**Spawn:**
```bash
sessions_spawn agentId:builder label:"A-launcher" task:"[task above]" model:opus thinking:medium runTimeoutSeconds:1800
```

#### Task B: MM Reliability & Aggressiveness
**Owner:** Builder 2  
**Depends on:** None (parallel with A)  
**Files:**
- `packages/market-maker-bot/src/index.ts`
- `packages/market-maker-bot/src/run-multi.ts`
- `packages/market-maker-bot/.env.example`

**Task:**
```
Update MM bot to guarantee:
1. Non-zero order sizing in ALL quote/taker paths (add min-size guard)
2. Duel-state-weighted fair value update each cycle
3. Safe aggressive modes (low|medium|high) with sane defaults
4. Per-cycle telemetry: mid_book, mid_duel, mid_final, spread_bps, size, fills, reason_skipped
5. Heartbeat JSON every N cycles → .runtime-locks/mm-health.json

In run-multi.ts:
- Keep no-eligible behavior configurable via MM_FAIL_ON_NO_ELIGIBLE
- Emit structured worker lifecycle events

Create .env.example with all env contract docs

Acceptance:
- In 10min runtime, no trade has size <= 0
- When duel HP delta is material, quoted mid moves away from static 0.5
- MM status heartbeat updates every ≤5s
```

**Spawn:**
```bash
sessions_spawn agentId:builder-2 label:"B-mm-core" task:"[task above]" model:opus thinking:medium runTimeoutSeconds:1800
```

---

### ⏳ PHASE 2: Health Contract (C)
**Trigger:** After Agent A completes and establishes health file locations

#### Task C: Unified Health API
**Owner:** Builder 3  
**Depends on:** Task A (needs .runtime-locks path)  
**Files:**
- `packages/server/src/.../system-health-route.ts` (create)
- Route integration in existing API surface

**Task:**
```
Create /api/arena/system-health endpoint returning:
{
  "ok": true,
  "timestamp": "ISO-8601",
  "services": {
    "server": {"ok": true, "latencyMs": 42},
    "duelState": {"ok": true, "phase": "FIGHTING", "freshMs": 1200},
    "stream": {"ok": true, "url": "http://127.0.0.1:4179/live/stream.m3u8", "freshMs": 1800},
    "bettingApi": {"ok": true, "freshMs": 900},
    "mm": {"ok": true, "mode": "multi", "workers": 3, "freshMs": 2100}
  },
  "wallets": {
    "solana": {"connected": true, "pubkey": "..."},
    "evm": {"connected": true, "address": "...", "chain": "base-sepolia"}
  },
  "market": {
    "lastTradeAt": "ISO-8601",
    "lastTradeSize": "string",
    "orderbookFreshMs": 1300,
    "midPrice": 0.62
  }
}

Read MM heartbeat from .runtime-locks/mm-health.json
Validate stream source from :4179 perspective (not just server-local)

Acceptance:
- curl http://127.0.0.1:5555/api/arena/system-health returns stable JSON
- ok=false when any critical dependency stale/unreachable
- Payload freshness fields update continuously during runtime
```

**Spawn:** (wait for A completion message)
```bash
sessions_spawn agentId:builder-3 label:"C-health-api" task:"[task above]" model:opus thinking:medium runTimeoutSeconds:1800
```

---

### ⏳ PHASE 3: UI Integration (D)
**Trigger:** After Agent C publishes endpoint payload shape

#### Task D: Betting UI Health + UX Cleanup
**Owner:** Builder 4  
**Depends on:** Task C (needs health endpoint schema)  
**Files:**
- `packages/gold-betting-demo/app/src/hooks/useSystemHealth.ts` (create)
- `packages/gold-betting-demo/app/src/components/SystemHealthPanel.tsx` (create)
- `packages/gold-betting-demo/app/src/App.tsx` (integrate)
- `packages/gold-betting-demo/app/src/components/StreamPlayer.tsx` (improve diagnostics)
- `packages/gold-betting-demo/app/src/components/SolanaClobPanel.tsx` (suppress zero-size trades)
- `packages/gold-betting-demo/app/src/components/EvmBettingPanel.tsx` (suppress zero-size trades)

**Task:**
```
Add health monitoring to betting UI:

1. Create useSystemHealth hook polling /api/arena/system-health
2. Create SystemHealthPanel component with green/yellow/red states
3. Integrate in App.tsx
4. Improve stream diagnostics in StreamPlayer
5. Filter zero-size trades in both CLOB panels

UX Rules:
- No ambiguous "unknown" without reason
- Show "last update Xs ago" on stream, duel state, orderbook/trades
- Wallet badges separate for Solana and EVM (chain + short address)
- Primary actions disabled only with explicit reason

Acceptance:
- Operator identifies failed subsystem from top UI bar in one glance
- Stream fallback/source switching visible and actionable
- Trade panel shows realistic activity (no fake placeholders)
```

**Spawn:** (wait for C completion message)
```bash
sessions_spawn agentId:builder-4 label:"D-ui-health-ux" task:"[task above]" model:opus thinking:medium runTimeoutSeconds:1800
```

---

### ⏳ PHASE 4: QA & Release (E)
**Trigger:** After A+B+C+D all complete and merge

#### Task E: Verification & Regression Gates
**Owner:** Builder 5  
**Depends on:** Tasks A+B+C+D (all merged)  
**Files:**
- Test suite updates
- CI/local verification scripts
- Release docs

**Task:**
```
Create repeatable smoke test suite:

Commands to verify:
bun install
bun run assets:sync
bun run duel:mm --fresh
bun run duel:verify
curl -sS http://127.0.0.1:5555/api/arena/system-health | jq .
curl -sS http://127.0.0.1:4179/live/stream.m3u8 | sed -n '1,40p'

Required tests:
1. Unit: MM sizing/fair-value logic, health payload schema validation
2. Integration: UI health hook + panel rendering with degraded status
3. E2E smoke: boot stack, stream appears, wallet status visible, non-zero trades appear

Create release checklist and verification results doc

Acceptance:
- Full smoke suite passes
- All acceptance criteria from A+B+C+D validated
- Release docs complete
```

**Spawn:** (wait for A+B+C+D completion and manual merge)
```bash
sessions_spawn agentId:builder-5 label:"E-qa-release" task:"[task above]" model:opus thinking:medium runTimeoutSeconds:1800
```

---

## Review Protocol

After each agent completes:
```bash
cd /home/shad0w/hyperscape-sol-work
codex review --uncommitted
```

Fix any P1 issues immediately. Collect P2 issues for batch fix.

---

## Merge Order

1. Agent A (launcher) + codex fixes
2. Agent B (MM core) + codex fixes
3. Agent C (health API) + codex fixes
4. Agent D (UI) + codex fixes
5. Agent E (QA) validates all

---

## Success Criteria

✅ `bun run duel:mm --fresh` is stable and repeatable  
✅ `:4179` shows live stream, health, wallet states, non-zero trades  
✅ MM adjusts pricing with duel state (not anchored at 0.5)  
✅ Health endpoint + UI diagnostics sufficient for unattended operation  

---

## Notes

- All agents use Opus 4.6 (--model=opus)
- Medium thinking level (balance speed vs quality)
- 30min timeout per agent (1800s)
- Codex review uses gpt-5.2-codex binary
- Keep orchestrator updated on completion (agents auto-announce)
