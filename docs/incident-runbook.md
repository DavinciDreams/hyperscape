# Incident Runbook — Hyperscape Market Maker & Arena

> Last updated: 2026-02-25

---

## Table of Contents

1. [Kill-Switch Activation](#1-kill-switch-activation)
2. [Stuck Settlement](#2-stuck-settlement)
3. [Stream Loss / Data Feed Disconnect](#3-stream-loss--data-feed-disconnect)
4. [Bot Runaway Quoting](#4-bot-runaway-quoting)
5. [RPC Degradation](#5-rpc-degradation)
6. [Committed Secrets / Key Rotation](#6-committed-secrets--key-rotation)
7. [Reconciliation Discrepancy](#7-reconciliation-discrepancy)

---

## 1. Kill-Switch Activation

### When to Use
- Any unexpected bot behaviour (runaway orders, wrong prices, excessive fills)
- Suspected exploit or unauthorized access
- Upstream infrastructure failure requiring immediate halt

### Steps

```bash
# Immediate: activate kill-switch (cancels all orders, blocks new placement)
cd packages/market-maker-bot
bun run kill-switch

# With balance withdrawal to safe wallets:
bun run kill-switch:withdraw

# Check status:
bun run kill-switch:status

# After investigation, reset:
bun run kill-switch:reset
```

### How It Works
- Writes a `.kill-switch` sentinel file in the bot package root
- The bot checks for this file every cycle and enters cancel-only mode
- No new orders are placed while the file exists
- Deleting the file (or `--reset`) resumes normal operation

### Post-Incident
- [ ] Review `.risk-status.json` for drawdown/notional data
- [ ] Check on-chain state via `bun run reconcile`
- [ ] Determine root cause before resetting
- [ ] File incident report

---

## 2. Stuck Settlement

### Symptoms
- Match resolved on-chain but payouts not distributed
- Arena UI shows "Resolving..." indefinitely
- `SOLANA_ARENA_KEEPER_SECRET` wallet has pending transactions

### Diagnosis

```bash
# Check keeper wallet for stuck transactions
solana confirm <tx-signature> --url $SOLANA_RPC_URL

# Check match state on-chain
solana account <market-pda> --url $SOLANA_RPC_URL --output json
```

### Resolution

1. **Check RPC health** — Is the RPC endpoint responding? (see §5)
2. **Retry settlement tx** — The keeper may need to resubmit with a higher priority fee:
   ```bash
   # Manually invoke resolve/claim-for instructions with higher compute budget
   ```
3. **Check blockhash expiry** — If the transaction used an expired blockhash, build a new one
4. **Escalate** — If the on-chain program is in an unexpected state, escalate to the Solana program maintainer

### Prevention
- Monitor keeper wallet SOL balance (needs gas for claim txns)
- Set `BOT_MIN_BALANCE_LAMPORTS` to auto-warn on low funds
- Run `bun run reconcile --interval 60` to catch discrepancies early

---

## 3. Stream Loss / Data Feed Disconnect

### Symptoms
- Bot quoting without duel signal (reverts to book-only mid)
- `MM_DUEL_STATE_API_URL` returning errors or timeouts
- Log messages: `[DUEL] signal fetch timeout` or no duel-signal log lines

### Diagnosis

```bash
# Test the duel state endpoint directly
curl -s "$MM_DUEL_STATE_API_URL" | jq .

# Check game server health
curl -s http://localhost:5555/api/health | jq .
```

### Resolution

1. **If game server is down** — Restart the game server
2. **If network issue** — Check server-to-server connectivity
3. **If data is stale** — The bot falls back to book midpoint automatically; this is safe but less accurate
4. **Kill-switch if pricing diverges** — If the bot is quoting wildly wrong prices without the signal, activate kill-switch

### Notes
- Duel signal has a configurable cache TTL (`MM_DUEL_SIGNAL_CACHE_MS`) and fetch timeout (`MM_DUEL_SIGNAL_FETCH_TIMEOUT_MS`)
- The bot will NOT crash on signal loss — it degrades gracefully to book-only quoting

---

## 4. Bot Runaway Quoting

### Symptoms
- Orders placed at extreme prices (near 1 or 999)
- Order rate much higher than normal
- Inventory growing rapidly on one side
- Daily notional approaching limit

### Immediate Action

```bash
# IMMEDIATE: Activate kill-switch
cd packages/market-maker-bot
bun run kill-switch
```

### Diagnosis

1. Check `.risk-status.json` for current risk state
2. Review recent bot logs for anomalous pricing
3. Check if duel signal is returning garbage data
4. Check if on-chain book state is corrupted
5. Verify RPC is returning correct data (not a stale/forked view)

### Resolution

1. Kill-switch cancels all orders automatically
2. Run reconciliation: `bun run reconcile`
3. Compare on-chain state vs bot internal accounting
4. Fix root cause before resetting kill-switch
5. Consider lowering `RISK_MAX_ORDER_SIZE` and `RISK_MAX_DAILY_NOTIONAL` temporarily

### Risk Controls That Should Catch This
- `RISK_MAX_ORDER_SIZE` — caps individual orders
- `RISK_MAX_DAILY_NOTIONAL` — caps total daily volume
- `RISK_SPREAD_FLOOR_BPS` / `RISK_SPREAD_CEILING_BPS` — rejects orders at extreme spreads
- `RISK_PER_MATCH_DRAWDOWN_LIMIT` — pauses per-match on excessive loss
- `RISK_GLOBAL_DRAWDOWN_LIMIT` — triggers auto kill-switch

---

## 5. RPC Degradation

### Symptoms
- Increased transaction failures / timeouts
- Solana: `[SOLANA] Market make error: ...timeout` or `429 Too Many Requests`
- EVM: `[BSC/BASE] Order failed: ...timeout` or nonce errors

### Diagnosis

```bash
# Solana RPC health
curl -s -X POST "$SOLANA_RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | jq .

# Check Helius status page
# https://status.helius.dev/

# EVM RPC check
cast block-number --rpc-url "$EVM_BSC_RPC_URL"
cast block-number --rpc-url "$EVM_BASE_RPC_URL"
```

### Resolution

1. **Rate limiting** — Reduce bot cycle frequency by increasing `RELOAD_DELAY_MIN_MS` / `RELOAD_DELAY_MAX_MS`
2. **Switch RPC** — Update `SOLANA_RPC_URL` to a fallback endpoint
3. **Kill-switch if severe** — If the bot cannot reliably read chain state, activate kill-switch to prevent trading on stale data
4. **Fallback endpoints:**
   - Solana public: `https://api.mainnet-beta.solana.com` (rate-limited)
   - Solana devnet: `https://api.devnet.solana.com`

### Prevention
- Use a paid RPC provider (Helius, QuickNode, Triton) for production
- Set `SOLANA_HEALTHCHECK_INTERVAL_MS` to detect degradation quickly
- Monitor RPC latency as part of the reconcile loop

---

## 6. Committed Secrets / Key Rotation

### If secrets are found in git history

**IMPORTANT: Even after removing secrets from files, they remain in git history.**

### Steps

1. **Immediately rotate all exposed keys:**
   - Helius API key: https://dashboard.helius.dev/ → Regenerate
   - Birdeye API key: https://birdeye.so/developer → Regenerate
   - Any wallet private keys: Generate new keypairs and transfer funds

2. **Remove secrets from tracked files:**
   ```bash
   # Edit the file to remove the secret value
   # Commit the cleanup
   git add <file>
   git commit -m "chore: remove committed secrets"
   ```

3. **For thorough history cleanup** (optional, disruptive):
   ```bash
   # Use BFG or git-filter-repo to scrub from all history
   # WARNING: This rewrites history and requires force-push
   pip install git-filter-repo
   git filter-repo --replace-text <(echo 'OLD_SECRET==>REDACTED')
   ```

4. **Update CI:**
   - Add secrets as GitHub repository secrets
   - Reference via `${{ secrets.HELIUS_API_KEY }}` in workflows

5. **Verify with secret scanner:**
   ```bash
   # Run the CI secret scanner locally
   bash -c "$(cat .github/workflows/secret-scanner.yml | grep -A100 'Grep for' | head -80)"
   ```

### Currently Exposed (as of 2026-02-25)
- ⚠️ `packages/gold-betting-demo/.env.mainnet` had Helius + Birdeye API keys — **ROTATE THESE**
- ⚠️ `packages/app/.env.e2e` had a test wallet secret key (low risk if test-only)

---

## 7. Reconciliation Discrepancy

### Symptoms
- `bun run reconcile` reports balance mismatches
- Alert webhook fires with discrepancy data

### Diagnosis

```bash
# Run one-shot reconcile
cd packages/market-maker-bot
bun run reconcile

# Run continuous with alerts
bun run reconcile -- --interval 60 --alert-webhook "$ALERT_WEBHOOK_URL"
```

### Common Causes
1. **Pending transactions** — Wait for confirmation and re-check
2. **Fee deductions** — Gas costs reduce native balances
3. **External transfers** — Someone sent/received tokens outside the bot
4. **Program state mismatch** — On-chain market state diverged from bot's view

### Resolution
1. If discrepancy is within tolerance (`RECONCILE_TOLERANCE_BPS`), likely just fees/timing
2. If large discrepancy, activate kill-switch and investigate
3. Compare on-chain transaction history with bot logs
4. If funds are missing, check for unauthorized transactions

---

## General Incident Process

1. **Detect** — Monitoring, alerts, or manual observation
2. **Triage** — Is the bot still running? Is it making bad trades?
3. **Contain** — Activate kill-switch if any doubt
4. **Diagnose** — Use logs, risk-status, reconcile
5. **Resolve** — Fix root cause
6. **Recover** — Reset kill-switch, verify with reconcile
7. **Post-mortem** — Document what happened and improve controls

### Escalation Contacts
- Bot operator: Check `MM_INSTANCE_ID` in logs
- Solana program maintainer: (add contact)
- Infrastructure/RPC provider: Helius support

### Monitoring Endpoints
- Game server health: `GET /api/health`
- Duel state: `GET /api/streaming/state`
- Risk status file: `packages/market-maker-bot/.risk-status.json`
- Kill-switch file: `packages/market-maker-bot/.kill-switch`
