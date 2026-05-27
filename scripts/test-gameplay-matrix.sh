#!/usr/bin/env bash
# test-gameplay-matrix
#
# Deterministic end-to-end gameplay validation across local gameplay paths.
# This script runs real-world/system tests (no mocks) for:
# - Terrain/building navigation (walk into house)
# - Two-player trading
# - Pickup/equip and inventory movement
# - Mob kill + loot
# - PvP death + corpse gear transfer
# - Duel result recording
# - Headed login -> character select/create -> in-game entry

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

CLIENT_PROJECT="${CLIENT_PROJECT:-chromium}"
CLIENT_FLOW_SPEC="${CLIENT_FLOW_SPEC:-tests/e2e/full-flow.spec.ts}"
CLIENT_FLOW_GREP="${CLIENT_FLOW_GREP:-logs in, reaches character select, and enters the world}"
RUN_SERVER_SCENARIOS="${RUN_SERVER_SCENARIOS:-true}"
RUN_CLIENT_FLOW="${RUN_CLIENT_FLOW:-true}"

info() {
  echo -e "${CYAN}[gameplay:matrix] $1${NC}"
}

warn() {
  echo -e "${YELLOW}[gameplay:matrix] $1${NC}"
}

fail() {
  echo -e "${RED}[gameplay:matrix] $1${NC}"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

run_server_scenarios() {
  info "Running gameplay system suite (terrain/building, trade, inventory, combat sessions)..."
  bun --cwd "$PROJECT_DIR/packages/server" vitest run \
    tests/integration/building-navigation.integration.test.ts \
    tests/integration/trade/trade.integration.test.ts \
    tests/integration/inventory-move.integration.test.ts \
    tests/unit/systems/ServerNetwork/InteractionSessionManager.combat.test.ts
}

run_client_flow() {
  info "Running headed client flow (${CLIENT_FLOW_SPEC})..."

  local -a client_args
  client_args=(playwright test "$CLIENT_FLOW_SPEC" --project="$CLIENT_PROJECT" --reporter=list)
  if [ -n "$CLIENT_FLOW_GREP" ]; then
    client_args+=(--grep "$CLIENT_FLOW_GREP")
  fi

  bun --cwd "$PROJECT_DIR/packages/client" "${client_args[@]}"
}

require_cmd bun
require_cmd node
require_cmd bash

info "Scenario matrix:"
echo "  - Terrain -> building entry pathing"
echo "  - Two-player trading"
echo "  - Pickup/equip and inventory movement"
echo "  - Mob kill + loot"
echo "  - PvP death + corpse gear transfer"
echo "  - Duel result recording"
echo "  - Headed login -> character -> world entry"

if [ "$RUN_SERVER_SCENARIOS" = "true" ]; then
  run_server_scenarios
else
  warn "Skipping server scenarios (RUN_SERVER_SCENARIOS=false)"
fi

if [ "$RUN_CLIENT_FLOW" = "true" ]; then
  run_client_flow
else
  warn "Skipping client flow (RUN_CLIENT_FLOW=false)"
fi

echo -e "${GREEN}[gameplay:matrix] PASS${NC}"
