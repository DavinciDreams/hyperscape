# Duel + MM Stack QA Documentation

**Date:** 2026-02-25  
**Branch:** `feat/solana-clob-mm-updates`  
**Sprint:** Duel+MM+UI Orchestration

---

## Overview

This document covers QA validation for the unified Duel + Market Maker stack, consolidating work from:
- **Agent A:** Unified launcher (`duel-mm-stack.mjs`)
- **Agent B:** MM reliability & aggressiveness updates
- **Agent C:** System health API endpoint
- **Agent D:** UI health panel & UX improvements

---

## Acceptance Criteria Checklist

### Agent A: Unified Duel+MM Launcher

| Criteria | Status | Verification Method |
|----------|--------|---------------------|
| `bun run duel:mm --fresh` reaches online without manual intervention | ✅ | Run command, observe "STACK ONLINE" output |
| Startup includes PASS/FAIL for: game server, duel state, HLS, betting UI, MM workers | ✅ | Output shows 5 gates with explicit status |
| Non-zero exit on strict preflight failure | ✅ | With `--strict-preflight`, exit code != 0 on failure |
| `--no-strict-preflight` allows degraded startup | ✅ | Stack continues with warnings when gates fail |
| `--verify-only` checks existing stack | ✅ | Runs preflight + verification without starting stack |
| Scripts added to package.json | ✅ | `duel:mm`, `duel:mm:full`, `duel:mm:verify` present |

**Files Modified:**
- `scripts/duel-mm-stack.mjs` (created)
- `package.json` (scripts added)

### Agent B: MM Reliability & Aggressiveness

| Criteria | Status | Verification Method |
|----------|--------|---------------------|
| Non-zero order sizing in ALL quote/taker paths | ✅ | `enforceMinOrderSize()` guards all order paths |
| Duel-state-weighted fair value each cycle | ✅ | `parseDuelSignal()` computes HP-based mid shift |
| Safe aggressive modes (low/medium/high) | ✅ | `AGGRESSIVENESS_PRESETS` with sane defaults |
| Per-cycle telemetry logged | ✅ | `CycleTelemetry` type with mid_book, mid_duel, etc. |
| Heartbeat JSON → `.runtime-locks/mm-health.json` | ✅ | File written every N cycles per `MM_HEARTBEAT_CYCLES` |
| In 10min runtime, no trade has size <= 0 | 📋 Manual | Run stack, grep logs for zero-size orders |
| Quoted mid moves with duel HP delta | 📋 Manual | Observe mid shift during combat |

**Files Modified:**
- `packages/market-maker-bot/src/index.ts`
- `packages/market-maker-bot/src/run-multi.ts`
- `packages/market-maker-bot/src/common.ts`
- `packages/market-maker-bot/.env.example` (created)

### Agent C: Unified Health API

| Criteria | Status | Verification Method |
|----------|--------|---------------------|
| Endpoint registered at `/api/arena/system-health` | ✅ | `curl localhost:5555/api/arena/system-health` |
| Returns valid JSON with required structure | ✅ | Schema validation in `verify-duel-mm-stack.mjs` |
| `ok=false` when any critical dependency stale/unreachable | ✅ | Response status 503 with `ok: false` |
| Services object contains: server, duelState, stream, bettingApi, mm | ✅ | Schema includes all 5 services |
| Wallets object contains: solana, evm with connected/address | ✅ | Response includes wallet status |
| Market object contains: lastTradeAt, lastTradeSize, midPrice, orderbookFreshMs | ✅ | Response includes market data |
| MM health read from `.runtime-locks/mm-health.json` | ✅ | Code reads and parses MM heartbeat file |
| Stream validated from :4179 perspective | ✅ | HEAD request to HLS manifest URL |

**Response Schema:**
```json
{
  "ok": true,
  "timestamp": "2026-02-25T07:00:00.000Z",
  "services": {
    "server": { "ok": true, "latencyMs": 42 },
    "duelState": { "ok": true, "phase": "FIGHTING", "freshMs": 1200 },
    "stream": { "ok": true, "url": "http://127.0.0.1:4179/live/stream.m3u8", "freshMs": 1800 },
    "bettingApi": { "ok": true, "freshMs": 900 },
    "mm": { "ok": true, "mode": "multi", "workers": 3, "freshMs": 2100 }
  },
  "wallets": {
    "solana": { "connected": true, "pubkey": "..." },
    "evm": { "connected": true, "address": "...", "chain": "base-sepolia" }
  },
  "market": {
    "lastTradeAt": "2026-02-25T06:59:50.000Z",
    "lastTradeSize": "50",
    "orderbookFreshMs": 1300,
    "midPrice": 0.62
  }
}
```

**Files Created:**
- `packages/server/src/startup/routes/system-health-routes.ts`

### Agent D: Betting UI Health + UX

| Criteria | Status | Verification Method |
|----------|--------|---------------------|
| `useSystemHealth` hook polls health endpoint | ✅ | Hook fetches every 5s with timeout handling |
| `SystemHealthPanel` component shows green/yellow/red states | ✅ | Visual indicator based on `overallStatus` |
| Panel integrated in App.tsx | ✅ | Component rendered at top of betting UI |
| Service dots visible (SRV, DUEL, STRM, API, MM) | ✅ | Compact status indicators in collapsed bar |
| Wallet badges separate for Solana and EVM | ✅ | SOL and EVM badges with short addresses |
| "last update Xs ago" displayed | ✅ | `formatFreshness()` helper used throughout |
| Operator identifies failed subsystem at a glance | ✅ | Red indicators with error tooltips |
| Zero-size trades filtered in trade panels | ✅ | `.filter((t) => t.amount > 0)` in both panels |

**Files Created:**
- `packages/gold-betting-demo/app/src/hooks/useSystemHealth.ts`
- `packages/gold-betting-demo/app/src/components/SystemHealthPanel.tsx`

**Files Modified:**
- `packages/gold-betting-demo/app/src/App.tsx`
- `packages/gold-betting-demo/app/src/components/SolanaClobPanel.tsx`
- `packages/gold-betting-demo/app/src/components/EvmBettingPanel.tsx`

---

## Manual Test Procedures

### Test 1: Full Stack Startup

```bash
# From repo root
cd /home/shad0w/hyperscape-sol-work

# Start fresh with all components
bun run duel:mm --fresh --verbose

# Expected output:
# - 5 health gates with PASS/FAIL status
# - "STACK ONLINE" announcement
# - URLs for all services
```

**Pass Criteria:**
- All 5 health gates show `[PASS]`
- Stack announces "STACK ONLINE"
- No errors in console

### Test 2: Health Endpoint Validation

```bash
# With stack running:
curl -sS http://localhost:5555/api/arena/system-health | jq .

# Check specific fields:
curl -sS http://localhost:5555/api/arena/system-health | jq '.services | keys'
curl -sS http://localhost:5555/api/arena/system-health | jq '.ok, .services.mm.ok'
```

**Pass Criteria:**
- Returns valid JSON
- Contains all required service fields
- `ok: true` when healthy, `ok: false` when degraded

### Test 3: Degraded Mode Detection

```bash
# Stop MM workers (Ctrl+C the MM process)
# Then check health:
curl -sS http://localhost:5555/api/arena/system-health | jq '.ok, .services.mm'

# Expected: ok=true (MM not critical), mm.ok=false with error message
```

**Pass Criteria:**
- Overall `ok` remains true (MM not critical)
- `services.mm.ok` becomes false
- Error message indicates "Health file not found" or "Stale"

### Test 4: HLS Stream Manifest

```bash
# Check manifest is valid:
curl -sS http://localhost:4179/live/stream.m3u8 | head -20

# Expected: #EXTM3U header and segment references
```

**Pass Criteria:**
- Manifest starts with `#EXTM3U`
- Contains `#EXTINF` segment entries (may take a moment after startup)

### Test 5: MM Heartbeat File

```bash
# Check MM health file:
cat .runtime-locks/mm-health.json | jq .

# Verify freshness:
jq '.updatedAt // .lastCycleAt' .runtime-locks/mm-health.json
```

**Pass Criteria:**
- File exists and contains valid JSON
- `status` is "healthy"
- `updatedAt`/`lastCycleAt` within last 30 seconds

### Test 6: UI Health Panel

1. Open betting UI at http://localhost:4179
2. Observe top bar showing system status
3. Click to expand details panel
4. Verify:
   - Status dots for all 5 services
   - Wallet badges for SOL/EVM
   - Market status (last trade, mid price)
   - "Updated Xs ago" counter

**Pass Criteria:**
- Panel displays without errors
- All services show green dots when healthy
- Expand/collapse works
- Refresh button triggers immediate poll

### Test 7: Zero-Size Trade Filtering

1. Open betting UI
2. Navigate to CLOB trade history
3. Observe trade tape

**Pass Criteria:**
- No trades with amount = 0 appear in the list
- Trade amounts are meaningful (> 0)

### Test 8: Verification Suite

```bash
# Run automated smoke test:
bun scripts/verify-duel-mm-stack.mjs --report-only

# Strict mode (fails on any issue):
bun scripts/verify-duel-mm-stack.mjs

# JSON output for CI:
bun scripts/verify-duel-mm-stack.mjs --json
```

**Pass Criteria:**
- All required checks pass
- JSON output contains expected structure
- Exit code 0 on success

---

## Rollback Plan

If issues are discovered after deployment:

### Immediate Rollback (< 5 min)

```bash
# 1. Activate MM kill-switch (stops all trading immediately)
cd packages/market-maker-bot
bun run kill-switch

# 2. Stop the duel stack
# Press Ctrl+C or:
bun run duel:prod:stop

# 3. Revert to previous commit
git checkout <previous-commit-hash>

# 4. Restart with previous version
bun install
bun run duel:mm --fresh
```

### Targeted Rollback (specific component)

**Rollback Launcher Only:**
```bash
git checkout HEAD~1 -- scripts/duel-mm-stack.mjs
bun run duel:full  # Use old launcher
```

**Rollback Health Endpoint:**
```bash
git checkout HEAD~1 -- packages/server/src/startup/routes/system-health-routes.ts
# Health endpoint will be unavailable; UI will show "unknown" status
```

**Rollback UI Components:**
```bash
git checkout HEAD~1 -- packages/gold-betting-demo/app/src/hooks/useSystemHealth.ts
git checkout HEAD~1 -- packages/gold-betting-demo/app/src/components/SystemHealthPanel.tsx
# Health panel won't render; betting still works
```

**Rollback MM Changes:**
```bash
git checkout HEAD~1 -- packages/market-maker-bot/src/
# MM reverts to previous behavior; may have zero-size trades
```

### Post-Rollback Verification

```bash
# Verify stack is operational
bun scripts/verify-duel-mm-stack.mjs --report-only

# Monitor for 10 minutes, checking:
# - No errors in console
# - Health endpoint (if still present) returns ok=true
# - Trades appearing in UI
```

---

## Known Limitations

### Current Limitations

1. **MM Health File Dependency**
   - Health endpoint requires MM to write heartbeat file
   - If MM crashes without cleanup, stale file may persist
   - Workaround: Delete `.runtime-locks/mm-health.json` on restart

2. **Stream Manifest Startup Delay**
   - HLS manifest may not have segments immediately after startup
   - First 10-30 seconds may show "awaiting segments" state
   - This is normal; full stream appears once RTMP ingests

3. **Health Endpoint Latency**
   - `/api/arena/system-health` performs multiple checks serially
   - Response time ~50-200ms depending on external service latency
   - Consider caching for high-frequency polling scenarios

4. **Single-Server Health Model**
   - Current implementation assumes single-server deployment
   - Distributed/multi-region deployments would need aggregated health

5. **Solana Wallet Detection**
   - Solana wallet status requires ArenaService to be initialized
   - May show "not connected" during early startup phase

6. **EVM Wallet Environment-Based**
   - EVM wallet status read from environment variables only
   - Does not verify actual on-chain connectivity

### Future Improvements

- [ ] Add Prometheus/metrics export to health endpoint
- [ ] Implement health check caching (TTL-based)
- [ ] Add alerting integration (PagerDuty, Discord webhooks)
- [ ] Support distributed health aggregation
- [ ] Add historical health data for trend analysis

---

## Test Evidence Collection

For release sign-off, collect the following evidence:

```bash
# 1. Verification suite output
bun scripts/verify-duel-mm-stack.mjs --json > qa-evidence/verify-output.json

# 2. Health endpoint snapshot
curl -sS http://localhost:5555/api/arena/system-health > qa-evidence/health-snapshot.json

# 3. MM health file
cp .runtime-locks/mm-health.json qa-evidence/mm-health.json

# 4. HLS manifest sample
curl -sS http://localhost:4179/live/stream.m3u8 > qa-evidence/hls-manifest.m3u8

# 5. Git commit hash
git rev-parse HEAD > qa-evidence/commit-hash.txt

# 6. Screenshot of UI health panel (manual)
```

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Engineer | Agent E | 2026-02-25 | ✅ |
| Tech Lead | | | |
| Product Owner | | | |
