# Launch Checklist — Duel + MM Stack Update

**Feature Branch:** `feat/solana-clob-mm-updates`  
**Date:** 2026-02-25  
**Sprint:** Duel+MM+UI Orchestration  
**Components:** Launcher, MM Bot, Health API, UI Panel

---

## Pre-Launch Checks

### ✅ Code Review & Testing

| Check | Status | Evidence |
|-------|--------|----------|
| All agent tasks (A-D) completed | ✅ | Git log shows all commits merged |
| Codex review passed with P1 issues fixed | ✅ | `codex review --uncommitted` clean |
| Verification suite created and documented | ✅ | `scripts/verify-duel-mm-stack.mjs` |
| QA documentation complete | ✅ | `docs/duel-mm-stack-qa.md` |
| No linting errors | ⬜ | `bun run lint` |
| TypeScript compiles | ⬜ | `bun run build` |
| Unit tests pass | ⬜ | `bun test` |

### ✅ Environment Validation

| Check | Status | Notes |
|-------|--------|-------|
| `.env.example` files up to date | ✅ | MM bot has complete `.env.example` |
| All required env vars documented | ✅ | See MM `.env.example` for full list |
| No secrets in tracked files | ✅ | Secret scanner CI workflow in place |
| RPC endpoints configured | ⬜ | `SOLANA_RPC_URL`, `BASE_RPC_URL`, `BSC_RPC_URL` |
| Wallet keys configured | ⬜ | Custody wallets for MM operations |

### ✅ Infrastructure Readiness

| Check | Status | Notes |
|-------|--------|-------|
| Server has sufficient resources | ⬜ | Min: 4GB RAM, 2 vCPU |
| Port 5555 available (game server) | ⬜ | API + WebSocket |
| Port 4179 available (betting app) | ⬜ | UI + HLS stream |
| RTMP port available (streaming) | ⬜ | Default: 1935 |
| `.runtime-locks/` directory writable | ⬜ | For MM heartbeat file |

---

## Deployment Steps

### Phase 1: Preparation

```bash
# 1. Pull latest changes
cd /home/shad0w/hyperscape-sol-work
git checkout feat/solana-clob-mm-updates
git pull origin feat/solana-clob-mm-updates

# 2. Install dependencies
bun install

# 3. Build all packages
bun run build

# 4. Verify configuration
cat .env | grep -E "RPC_URL|CUSTODY|SECRET" | head -5  # Ensure env vars set
```

### Phase 2: Pre-Flight Verification

```bash
# 5. Run verification in report-only mode (services not required)
bun scripts/verify-duel-mm-stack.mjs --report-only

# 6. Check for any blocking issues
# Expected: Most checks will fail (services not running)
# This confirms the verification script works
```

### Phase 3: Start Stack

```bash
# 7. Start the unified duel+mm stack
bun run duel:mm --fresh --verbose

# Watch for:
# - All 5 health gates showing [PASS]
# - "STACK ONLINE" announcement
# - URLs printed for all services
```

### Phase 4: Post-Start Verification

```bash
# 8. Run full verification (services should now be running)
bun scripts/verify-duel-mm-stack.mjs

# Expected: All checks pass (exit code 0)

# 9. Manual health check
curl -sS http://localhost:5555/api/arena/system-health | jq .

# 10. Verify HLS stream
curl -sS http://localhost:4179/live/stream.m3u8 | head -10

# 11. Check MM heartbeat
cat .runtime-locks/mm-health.json | jq '.status, .lastCycleAt'
```

### Phase 5: UI Verification

1. Open http://localhost:4179 in browser
2. Verify health panel shows "All Systems Operational" (green)
3. Expand panel and check all 5 service dots are green
4. Verify wallet badges show connected status
5. Observe trade activity in CLOB panel (no zero-size trades)

---

## Post-Launch Monitoring

### Immediate (First 30 minutes)

| Metric | Target | Check Command |
|--------|--------|---------------|
| Health endpoint | `ok: true` | `curl -sS localhost:5555/api/arena/system-health \| jq .ok` |
| MM heartbeat | < 30s stale | `jq '.updatedAt // .lastCycleAt' .runtime-locks/mm-health.json` |
| HLS segments | Present | `curl -sS localhost:4179/live/stream.m3u8 \| grep EXTINF` |
| Trade activity | Non-zero trades | `curl -sS localhost:5555/api/arena/system-health \| jq .market.lastTradeSize` |
| Error rate | 0 in logs | `tail -f` on stack output, grep for "error" |

### Ongoing (Every 4 hours)

```bash
# Run automated smoke test
bun scripts/verify-duel-mm-stack.mjs --json >> /var/log/hyperscape/smoke-test.log

# Check MM status
jq -s 'last' .runtime-locks/mm-health.json

# Review health endpoint history (if logging)
curl -sS localhost:5555/api/arena/system-health | jq '.ok, .services | map_values(.ok)'
```

### Alerting Thresholds

| Condition | Severity | Action |
|-----------|----------|--------|
| Health `ok: false` | P1 | Page on-call, investigate immediately |
| MM heartbeat > 60s stale | P2 | Check MM process, may need restart |
| HLS manifest empty | P2 | Check RTMP ingester, stream encoder |
| No trades in 10 min | P3 | Check MM logs, market conditions |
| API latency > 500ms | P3 | Monitor, investigate if persistent |

---

## Incident Response Runbook

### Scenario 1: Health Endpoint Returns `ok: false`

**Symptoms:**
- `/api/arena/system-health` returns 503 with `ok: false`
- UI health panel shows red "System Issues"

**Diagnosis:**
```bash
# Check which service(s) are failing
curl -sS localhost:5555/api/arena/system-health | jq '.services | to_entries | map(select(.value.ok == false))'
```

**Resolution by Service:**

| Failed Service | Resolution |
|---------------|------------|
| `server` | Server itself is unhealthy; check process, restart if needed |
| `duelState` | StreamingDuelScheduler not running; restart stack |
| `stream` | HLS not accessible; check RTMP, betting app proxy |
| `bettingApi` | ArenaService not initialized; restart stack |
| `mm` | MM heartbeat stale; check MM process, restart if needed |

### Scenario 2: MM Heartbeat Stale

**Symptoms:**
- Health shows `mm.ok: false` with "Stale (Xs old)"
- No new trades appearing

**Diagnosis:**
```bash
# Check MM process
ps aux | grep market-maker

# Check MM log output
# (depends on how MM is running - direct, PM2, etc.)

# Check heartbeat file timestamp
ls -la .runtime-locks/mm-health.json
```

**Resolution:**
```bash
# If MM crashed, restart it:
# Option 1: Restart entire stack
bun run duel:mm --fresh

# Option 2: Restart MM only (if running separately)
cd packages/market-maker-bot
bun run start

# If MM is stuck, force reset:
rm .runtime-locks/mm-health.json
# Then restart MM
```

### Scenario 3: HLS Stream Not Available

**Symptoms:**
- Stream shows "Connection failed" or blank
- Health shows `stream.ok: false`

**Diagnosis:**
```bash
# Check if betting app is serving
curl -I http://localhost:4179/

# Check HLS manifest
curl -sS http://localhost:4179/live/stream.m3u8

# Check RTMP ingester (if applicable)
# Depends on your RTMP setup (nginx-rtmp, etc.)
```

**Resolution:**
1. Verify RTMP stream is being pushed to ingester
2. Check betting app proxy configuration
3. Restart betting app if needed
4. Restart RTMP transcoder if using one

### Scenario 4: Zero-Size Trades Appearing

**Symptoms:**
- Trade tape shows trades with amount = 0
- (Should not happen with Agent D fixes)

**Diagnosis:**
```bash
# Check if UI filtering is working
# Open browser dev tools, look at raw trade data

# Check MM for zero-size orders
grep -i "size.*0\|amount.*0" packages/market-maker-bot/*.log
```

**Resolution:**
1. Verify UI components have zero-size filter
2. Check MM `enforceMinOrderSize()` is being called
3. If persists, activate kill-switch and investigate

### Scenario 5: Runaway Quoting

**Symptoms:**
- Orders at extreme prices
- Rapid inventory growth
- Risk limits approaching

**Immediate Action:**
```bash
# ACTIVATE KILL-SWITCH IMMEDIATELY
cd packages/market-maker-bot
bun run kill-switch

# This cancels all orders and prevents new ones
```

**Post-Incident:**
1. Review `.risk-status.json`
2. Check duel signal data for anomalies
3. Run reconciliation: `bun run reconcile`
4. Root cause analysis before resetting kill-switch

---

## Rollback Procedure

### Quick Rollback (< 5 minutes)

```bash
# 1. Stop everything
# Ctrl+C or:
bun run duel:prod:stop

# 2. Activate kill-switch (safety)
cd packages/market-maker-bot
bun run kill-switch

# 3. Checkout previous known-good version
git checkout <previous-commit>

# 4. Reinstall and restart
bun install
bun run duel:mm --fresh

# 5. Verify operation
bun scripts/verify-duel-mm-stack.mjs
```

### Selective Rollback

See `docs/duel-mm-stack-qa.md` for component-specific rollback procedures.

---

## Success Criteria

Launch is considered successful when:

- [ ] Stack has been running for 2+ hours without restart
- [ ] Health endpoint consistently returns `ok: true`
- [ ] MM heartbeat stays fresh (< 30s)
- [ ] Non-zero trades appearing regularly
- [ ] No P1/P2 incidents in first 24 hours
- [ ] UI health panel displays correctly to operators
- [ ] Kill-switch tested and confirmed working

---

## Emergency Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| On-Call Engineer | (configure) | PagerDuty |
| MM Operator | Check `MM_INSTANCE_ID` in logs | Slack #trading-ops |
| Infrastructure | (configure) | Slack #infra |

---

## Appendix: Related Documentation

- `docs/duel-mm-stack-qa.md` - Full QA documentation
- `docs/incident-runbook.md` - General incident procedures
- `docs/LAUNCH-CHECKLIST.md` - Previous launch checklist (Solana CLOB)
- `packages/market-maker-bot/README.md` - MM bot documentation
- `scripts/verify-duel-mm-stack.mjs` - Automated verification suite
