/**
 * Risk Controls & Kill-Switch for the Cross-Chain Market Maker
 *
 * All live bot runs MUST configure explicit risk limits.
 * Missing or zero limits will cause the bot to abort at startup.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RiskLimits {
  /** Maximum single order size (token units). Required > 0. */
  maxOrderSize: number;
  /** Maximum daily notional volume (token units). Required > 0. */
  maxDailyNotional: number;
  /** Minimum spread floor in bps. Orders below this spread are rejected. */
  spreadFloorBps: number;
  /** Maximum spread ceiling in bps. Orders above this are rejected. */
  spreadCeilingBps: number;
  /** Maximum drawdown per match/market before auto-pause (token units). */
  perMatchDrawdownLimit: number;
  /** Maximum cumulative loss across all matches before kill-switch triggers. */
  globalDrawdownLimit: number;
}

export interface RiskState {
  dailyNotional: number;
  dailyNotionalResetAt: number; // epoch ms of last reset
  perMatchPnl: Map<string, number>; // matchId -> cumulative PnL
  globalPnl: number;
  killSwitchActive: boolean;
  killSwitchReason: string | null;
  killSwitchAt: number | null;
}

// ─── Chain & Program Allowlist ────────────────────────────────────────────────

/** Allowed Solana cluster RPC URL prefixes */
const ALLOWED_SOLANA_RPC_PREFIXES = [
  "https://api.devnet.solana.com",
  "https://api.testnet.solana.com",
  "https://api.mainnet-beta.solana.com",
  "https://mainnet.helius-rpc.com",
  "https://devnet.helius-rpc.com",
  "http://127.0.0.1",
  "http://localhost",
];

/** Allowed Solana program IDs the bot may interact with */
const ALLOWED_SOLANA_PROGRAM_IDS = new Set([
  "AqRu5b1fd67VyR4MgjKPN9EMgQ8wxauDUxyY5pUsGdAW", // arena market (testnet/devnet)
  // Add mainnet program IDs here after audit
]);

/** Allowed EVM chain IDs (decimal strings) */
const ALLOWED_EVM_CHAIN_IDS = new Set([
  "97",     // BSC Testnet
  "56",     // BSC Mainnet
  "84532",  // Base Sepolia
  "8453",   // Base Mainnet
  "31337",  // Anvil / Hardhat local
]);

export function validateSolanaRpc(url: string): void {
  const normalizedUrl = url.trim().toLowerCase();
  const allowed = ALLOWED_SOLANA_RPC_PREFIXES.some((prefix) =>
    normalizedUrl.startsWith(prefix.toLowerCase()),
  );
  if (!allowed) {
    throw new Error(
      `[RISK] Solana RPC URL not in allowlist: ${url}\n` +
        `Allowed prefixes: ${ALLOWED_SOLANA_RPC_PREFIXES.join(", ")}`,
    );
  }
}

export function validateSolanaProgramId(programId: string): void {
  if (!ALLOWED_SOLANA_PROGRAM_IDS.has(programId)) {
    throw new Error(
      `[RISK] Solana program ID not in allowlist: ${programId}\n` +
        `Allowed: ${[...ALLOWED_SOLANA_PROGRAM_IDS].join(", ")}`,
    );
  }
}

export function validateEvmChainId(chainId: string | bigint): void {
  const id = String(chainId);
  if (!ALLOWED_EVM_CHAIN_IDS.has(id)) {
    throw new Error(
      `[RISK] EVM chain ID not in allowlist: ${id}\n` +
        `Allowed: ${[...ALLOWED_EVM_CHAIN_IDS].join(", ")}`,
    );
  }
}

// ─── Risk Limits Loader ───────────────────────────────────────────────────────

function readPositiveEnv(name: string): number {
  const raw = process.env[name];
  if (!raw) return 0;
  const val = Number(raw);
  return Number.isFinite(val) && val > 0 ? val : 0;
}

/**
 * Load risk limits from environment variables.
 * Throws if any required limit is missing or zero.
 */
export function loadRiskLimits(): RiskLimits {
  const limits: RiskLimits = {
    maxOrderSize: readPositiveEnv("RISK_MAX_ORDER_SIZE"),
    maxDailyNotional: readPositiveEnv("RISK_MAX_DAILY_NOTIONAL"),
    spreadFloorBps: readPositiveEnv("RISK_SPREAD_FLOOR_BPS"),
    spreadCeilingBps: readPositiveEnv("RISK_SPREAD_CEILING_BPS"),
    perMatchDrawdownLimit: readPositiveEnv("RISK_PER_MATCH_DRAWDOWN_LIMIT"),
    globalDrawdownLimit: readPositiveEnv("RISK_GLOBAL_DRAWDOWN_LIMIT"),
  };

  const errors: string[] = [];
  if (limits.maxOrderSize <= 0)
    errors.push("RISK_MAX_ORDER_SIZE must be > 0");
  if (limits.maxDailyNotional <= 0)
    errors.push("RISK_MAX_DAILY_NOTIONAL must be > 0");
  if (limits.spreadFloorBps <= 0)
    errors.push("RISK_SPREAD_FLOOR_BPS must be > 0");
  if (limits.spreadCeilingBps <= 0)
    errors.push("RISK_SPREAD_CEILING_BPS must be > 0");
  if (limits.spreadFloorBps >= limits.spreadCeilingBps)
    errors.push("RISK_SPREAD_FLOOR_BPS must be < RISK_SPREAD_CEILING_BPS");
  if (limits.perMatchDrawdownLimit <= 0)
    errors.push("RISK_PER_MATCH_DRAWDOWN_LIMIT must be > 0");
  if (limits.globalDrawdownLimit <= 0)
    errors.push("RISK_GLOBAL_DRAWDOWN_LIMIT must be > 0");

  if (errors.length > 0) {
    throw new Error(
      `[RISK] Missing or invalid risk configuration:\n  ${errors.join("\n  ")}\n` +
        `All live bot runs MUST set explicit risk limits in the environment.`,
    );
  }

  return limits;
}

// ─── Risk State Manager ───────────────────────────────────────────────────────

export function createRiskState(): RiskState {
  return {
    dailyNotional: 0,
    dailyNotionalResetAt: Date.now(),
    perMatchPnl: new Map(),
    globalPnl: 0,
    killSwitchActive: false,
    killSwitchReason: null,
    killSwitchAt: null,
  };
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pre-flight check before placing any order.
 * Returns null if OK, or a rejection reason string.
 */
export function preOrderCheck(
  limits: RiskLimits,
  state: RiskState,
  orderSize: number,
  spreadBps: number,
  matchId: string,
): string | null {
  if (state.killSwitchActive) {
    return `Kill-switch active: ${state.killSwitchReason}`;
  }

  // Reset daily notional on day boundary
  const now = Date.now();
  if (now - state.dailyNotionalResetAt >= ONE_DAY_MS) {
    state.dailyNotional = 0;
    state.dailyNotionalResetAt = now;
  }

  if (orderSize > limits.maxOrderSize) {
    return `Order size ${orderSize} exceeds max ${limits.maxOrderSize}`;
  }

  if (state.dailyNotional + orderSize > limits.maxDailyNotional) {
    return `Daily notional ${state.dailyNotional + orderSize} would exceed max ${limits.maxDailyNotional}`;
  }

  if (spreadBps < limits.spreadFloorBps) {
    return `Spread ${spreadBps}bps below floor ${limits.spreadFloorBps}bps`;
  }

  if (spreadBps > limits.spreadCeilingBps) {
    return `Spread ${spreadBps}bps above ceiling ${limits.spreadCeilingBps}bps`;
  }

  // Per-match drawdown check
  const matchPnl = state.perMatchPnl.get(matchId) ?? 0;
  if (matchPnl < -limits.perMatchDrawdownLimit) {
    return `Per-match drawdown ${matchPnl} exceeds limit -${limits.perMatchDrawdownLimit} on match ${matchId}`;
  }

  // Global drawdown check
  if (state.globalPnl < -limits.globalDrawdownLimit) {
    triggerKillSwitch(state, `Global drawdown ${state.globalPnl} breached limit -${limits.globalDrawdownLimit}`);
    return `Kill-switch triggered: global drawdown`;
  }

  return null;
}

/**
 * Record a fill / PnL event.
 */
export function recordFill(
  state: RiskState,
  matchId: string,
  notionalSize: number,
  pnl: number,
): void {
  state.dailyNotional += Math.abs(notionalSize);
  const existing = state.perMatchPnl.get(matchId) ?? 0;
  state.perMatchPnl.set(matchId, existing + pnl);
  state.globalPnl += pnl;
}

// ─── Kill-Switch ──────────────────────────────────────────────────────────────

/**
 * Trigger the kill-switch. Once active, no new orders will be placed.
 * The bot's main loop should call `executeKillSwitch()` to cancel all open orders.
 */
export function triggerKillSwitch(state: RiskState, reason: string): void {
  if (state.killSwitchActive) return; // already active
  state.killSwitchActive = true;
  state.killSwitchReason = reason;
  state.killSwitchAt = Date.now();
  console.error(`\n🚨 KILL-SWITCH ACTIVATED: ${reason}\n`);
}

/**
 * Reset the kill-switch (for operator recovery).
 */
export function resetKillSwitch(state: RiskState): void {
  state.killSwitchActive = false;
  state.killSwitchReason = null;
  state.killSwitchAt = null;
  console.log("[RISK] Kill-switch reset by operator.");
}

/**
 * Get human-readable risk status for monitoring.
 */
export function getRiskStatus(limits: RiskLimits, state: RiskState): object {
  return {
    killSwitch: {
      active: state.killSwitchActive,
      reason: state.killSwitchReason,
      activatedAt: state.killSwitchAt
        ? new Date(state.killSwitchAt).toISOString()
        : null,
    },
    dailyNotional: {
      current: state.dailyNotional,
      limit: limits.maxDailyNotional,
      pctUsed: ((state.dailyNotional / limits.maxDailyNotional) * 100).toFixed(1) + "%",
    },
    globalPnl: state.globalPnl,
    globalDrawdownLimit: limits.globalDrawdownLimit,
    perMatchPnl: Object.fromEntries(state.perMatchPnl),
    limits: { ...limits },
  };
}
