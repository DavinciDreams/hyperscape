#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEDGER_DIR="${ANCHOR_TEST_LEDGER_DIR:-$ROOT_DIR/.anchor/manual-test-ledger}"
VALIDATOR_LOG="${ANCHOR_TEST_VALIDATOR_LOG:-/tmp/hyperscape-anchor-validator.log}"
BUILD_LOG="${ANCHOR_TEST_BUILD_LOG:-/tmp/hyperscape-anchor-build.log}"
TEST_LOG="${ANCHOR_TEST_LOG:-/tmp/hyperscape-anchor-localnet-test.log}"
RPC_PORT="${ANCHOR_TEST_RPC_PORT:-8899}"
WS_PORT="${ANCHOR_TEST_WS_PORT:-8900}"
FAUCET_PORT="${ANCHOR_TEST_FAUCET_PORT:-9900}"
RPC_URL="http://127.0.0.1:${RPC_PORT}"
WS_URL="ws://127.0.0.1:${WS_PORT}"
MINT_AUTHORITY="${ANCHOR_TEST_MINT_AUTHORITY:-DfEnrzh4cgnHxfuZRxLGX69fnLd9DP41XxGuE4gtyJpn}"
MAX_ORACLE_STALENESS_SECONDS="${HYPERSCAPE_MAX_ORACLE_STALENESS_SECONDS:-1}"
STALE_WAIT_MS="${GOLD_PERPS_TEST_STALE_WAIT_MS:-2500}"
VALIDATOR_PID=""
TEST_TARGETS=("$@")

if [[ ${#TEST_TARGETS[@]} -eq 0 ]]; then
  TEST_TARGETS=("tests/**/*.ts")
fi

resolve_wallet_path() {
  local candidates=()

  if [[ -n "${ANCHOR_WALLET:-}" ]]; then
    candidates+=("${ANCHOR_WALLET}")
  fi
  candidates+=(
    "$HOME/.config/solana/hyperscape-keys/deployer.json"
    "$HOME/.config/solana/id.json"
  )

  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  printf 'No Anchor wallet found. Checked:\n' >&2
  printf '  %s\n' "${candidates[@]}" >&2
  exit 1
}

resolve_program_id() {
  local program_name="$1"
  local fallback="$2"
  local idl_path="$ROOT_DIR/target/idl/${program_name}.json"

  if [[ -f "$idl_path" ]]; then
    local idl_program_id
    idl_program_id="$(jq -r '.address // .metadata.address // empty' "$idl_path")"
    if [[ -n "$idl_program_id" && "$idl_program_id" != "null" ]]; then
      printf '%s\n' "$idl_program_id"
      return 0
    fi
  fi

  printf '%s\n' "$fallback"
}

kill_stale_validator_listener() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)"

  if [[ -z "$pids" ]]; then
    return 0
  fi

  for pid in $pids; do
    local command_line
    command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command_line" == *"solana-test-validator"* ]]; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    else
      printf 'Port %s is occupied by a non-validator process: %s\n' "$port" "$command_line" >&2
      exit 1
    fi
  done
}

wait_for_rpc() {
  for _ in {1..90}; do
    if curl -s -X POST "$RPC_URL" \
      -H "content-type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | rg -q '"result":"ok"'; then
      sleep 1
      return 0
    fi
    sleep 1
  done

  return 1
}

cleanup() {
  if [[ -n "$VALIDATOR_PID" ]] && kill -0 "$VALIDATOR_PID" >/dev/null 2>&1; then
    kill "$VALIDATOR_PID" >/dev/null 2>&1 || true
    wait "$VALIDATOR_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

cd "$ROOT_DIR"

if [[ "${ANCHOR_MANUAL_TEST_SKIP_BUILD:-0}" != "1" ]]; then
  if command -v anchor >/dev/null 2>&1; then
    echo "[anchor-test] building workspace with anchor"
    anchor build >"$BUILD_LOG" 2>&1
  else
    echo "[anchor-test] building workspace without anchor"
    bash "$ROOT_DIR/scripts/build-workspace.sh" >"$BUILD_LOG" 2>&1
  fi
fi

for required in solana-test-validator curl jq rg; do
  if ! command -v "$required" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$required" >&2
    exit 1
  fi
done

if [[ ! -x "$ROOT_DIR/node_modules/.bin/ts-mocha" ]]; then
  printf 'Missing local ts-mocha binary at %s\n' "$ROOT_DIR/node_modules/.bin/ts-mocha" >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/target/deploy/fight_oracle.so" || ! -f "$ROOT_DIR/target/deploy/gold_clob_market.so" || ! -f "$ROOT_DIR/target/deploy/gold_perps_market.so" ]]; then
  printf 'Missing one or more deploy artifacts under %s\n' "$ROOT_DIR/target/deploy" >&2
  exit 1
fi

WALLET_PATH="$(resolve_wallet_path)"
PROGRAM_ORACLE_ID="$(resolve_program_id fight_oracle 6tpRysBFd1yXRipYEYwAw9jxEoVHk15kVXfkDGFLMqcD)"
PROGRAM_CLOB_ID="$(resolve_program_id gold_clob_market ARVJNJp49VZnkB8QBYZAAFJmufvtVSPhnuuenwwSLwpi)"
PROGRAM_PERPS_ID="$(resolve_program_id gold_perps_market HbXhqEFevpkfYdZCN6YmJGRmQmj9vsBun2ZHjeeaLRik)"

kill_stale_validator_listener "$RPC_PORT"
kill_stale_validator_listener "$WS_PORT"
kill_stale_validator_listener "$FAUCET_PORT"

rm -rf "$LEDGER_DIR"
mkdir -p "$(dirname "$LEDGER_DIR")"

echo "[anchor-test] starting local validator"
solana-test-validator \
  --reset \
  --quiet \
  --rpc-port "$RPC_PORT" \
  --faucet-port "$FAUCET_PORT" \
  --mint "$MINT_AUTHORITY" \
  --ledger "$LEDGER_DIR" \
  --bpf-program "$PROGRAM_ORACLE_ID" "$ROOT_DIR/target/deploy/fight_oracle.so" \
  --bpf-program "$PROGRAM_CLOB_ID" "$ROOT_DIR/target/deploy/gold_clob_market.so" \
  --bpf-program "$PROGRAM_PERPS_ID" "$ROOT_DIR/target/deploy/gold_perps_market.so" \
  >"$VALIDATOR_LOG" 2>&1 &
VALIDATOR_PID="$!"

if ! wait_for_rpc; then
  echo "[anchor-test] validator did not become ready" >&2
  tail -n 120 "$VALIDATOR_LOG" >&2 || true
  exit 1
fi

echo "[anchor-test] running mocha suite"
ANCHOR_PROVIDER_URL="$RPC_URL" \
ANCHOR_WS_URL="$WS_URL" \
ANCHOR_WALLET="$WALLET_PATH" \
HYPERSCAPE_MAX_ORACLE_STALENESS_SECONDS="$MAX_ORACLE_STALENESS_SECONDS" \
GOLD_PERPS_TEST_STALE_WAIT_MS="$STALE_WAIT_MS" \
  "$ROOT_DIR/node_modules/.bin/ts-mocha" \
  -p ./tsconfig.json \
  -t 1000000 \
  "${TEST_TARGETS[@]}" | tee "$TEST_LOG"
