/**
 * common.ts – Shared types, utilities, and configuration for the MM bot.
 *
 * Single source of truth for env-key normalization, run modes,
 * aggressiveness tiers, and duel-state fair-value engine.
 */

import { ethers } from "ethers";

// ─── Run Mode ─────────────────────────────────────────────────────────────────
export type RunMode = "dry-run" | "paper" | "live";

export function resolveRunMode(): RunMode {
  const raw = (process.env.MM_RUN_MODE || "live").trim().toLowerCase();
  if (raw === "dry-run" || raw === "dryrun" || raw === "dry") return "dry-run";
  if (raw === "paper" || raw === "sim" || raw === "simulate") return "paper";
  return "live";
}

// ─── Env helpers ──────────────────────────────────────────────────────────────
export const readEnvBoolean = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
};

export const readEnvNumber = (
  name: string,
  fallback: number,
  min?: number,
  max?: number,
): number => {
  const raw = Number(process.env[name]);
  let value = Number.isFinite(raw) ? raw : fallback;
  if (min !== undefined) value = Math.max(min, value);
  if (max !== undefined) value = Math.min(max, value);
  return value;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

// ─── Solana Program ID normalization (single source) ──────────────────────────
/**
 * Resolve the Solana program ID from environment.
 * Accepts: SOLANA_ARENA_MARKET_PROGRAM_ID, SOLANA_PROGRAM_ID, SOL_PROGRAM_ID
 * Falls back to the hardcoded devnet address.
 */
export function resolveSolanaProgramId(): string {
  return (
    process.env.SOLANA_ARENA_MARKET_PROGRAM_ID ||
    process.env.SOLANA_PROGRAM_ID ||
    process.env.SOL_PROGRAM_ID ||
    "AqRu5b1fd67VyR4MgjKPN9EMgQ8wxauDUxyY5pUsGdAW"
  );
}

// ─── Tracked Order ────────────────────────────────────────────────────────────
export interface TrackedOrder {
  orderId: number;
  chain: "evm-bsc" | "evm-base" | "solana";
  isBuy: boolean;
  price: number;
  amount: number;
  placedAt: number;
  matchId: number | string;
  walletId?: string;
}

// ─── Aggressiveness Tiers ─────────────────────────────────────────────────────
export type AggressivenessTier = "passive" | "normal" | "aggressive" | "hyper";

export interface AggressivenessParams {
  /** Spread multiplier (1.0 = base spread, 0.5 = tighter, 2.0 = wider) */
  spreadMultiplier: number;
  /** How much to skew quotes for inventory control (0 = none, 1 = max) */
  inventorySkewFactor: number;
  /** Participation rate – fraction of cycles that actually place orders */
  participationRate: number;
  /** Max orders per side override */
  maxOrdersPerSide: number;
}

const AGGRESSIVENESS_PRESETS: Record<AggressivenessTier, AggressivenessParams> =
  {
    passive: {
      spreadMultiplier: 2.0,
      inventorySkewFactor: 0.2,
      participationRate: 0.3,
      maxOrdersPerSide: 2,
    },
    normal: {
      spreadMultiplier: 1.0,
      inventorySkewFactor: 0.5,
      participationRate: 0.7,
      maxOrdersPerSide: 3,
    },
    aggressive: {
      spreadMultiplier: 0.6,
      inventorySkewFactor: 0.8,
      participationRate: 0.9,
      maxOrdersPerSide: 5,
    },
    hyper: {
      spreadMultiplier: 0.35,
      inventorySkewFactor: 1.0,
      participationRate: 1.0,
      maxOrdersPerSide: 8,
    },
  };

export function resolveAggressivenessTier(): AggressivenessTier {
  const raw = (process.env.MM_AGGRESSIVENESS || "normal").trim().toLowerCase();
  if (raw in AGGRESSIVENESS_PRESETS) return raw as AggressivenessTier;
  return "normal";
}

export function getAggressivenessParams(
  tier: AggressivenessTier,
): AggressivenessParams {
  return { ...AGGRESSIVENESS_PRESETS[tier] };
}

/**
 * Dynamic aggressiveness based on duel confidence and volatility.
 */
export function computeDynamicSpreadMultiplier(
  baseTier: AggressivenessParams,
  duelConfidence: number, // 0..1, how confident the duel signal is
  volatilityBps: number, // current spread in bps as volatility proxy
): number {
  // Higher confidence → tighter spread (we know fair value better)
  const confidenceAdj = 1 - duelConfidence * 0.3;
  // Higher volatility → wider spread (protect against adverse selection)
  const volAdj = volatilityBps > 500 ? 1 + (volatilityBps - 500) / 2000 : 1;
  return Math.max(0.2, baseTier.spreadMultiplier * confidenceAdj * volAdj);
}

/**
 * Inventory skew: shift mid price to discourage building more of the
 * already-heavy side.
 *
 * Returns a price offset (in price units, can be negative).
 */
export function computeInventorySkew(
  inventoryYes: number,
  inventoryNo: number,
  maxInventory: number,
  skewFactor: number,
  baseSpreadWidth: number,
): number {
  if (maxInventory <= 0) return 0;
  // Positive imbalance = too much YES → push mid down to sell YES / buy NO
  const imbalance = (inventoryYes - inventoryNo) / maxInventory; // -1..1
  return -imbalance * skewFactor * baseSpreadWidth;
}

// ─── Duel State Fair Value Engine ─────────────────────────────────────────────
export type DuelSignal = {
  /** Fair value in price units (1-999, where 500 = 50%) */
  midPrice: number;
  /** Duel phase (FIGHTING, RESOLUTION, IDLE, etc.) */
  phase: string;
  /** Signal weight (0-1) for blending with book mid */
  weight: number;
  /** Confidence in this signal (0-1) */
  confidence: number;
};

export interface DuelStatePayload {
  cycle?: {
    phase?: string;
    state?: string;
    winnerId?: string;
    winnerName?: string;
    agent1?: {
      id?: string;
      characterId?: string;
      name?: string;
      hp?: number;
      currentHp?: number;
      health?: number;
      maxHp?: number;
      maxHealth?: number;
      startingHp?: number;
    } | null;
    agent2?: {
      id?: string;
      characterId?: string;
      name?: string;
      hp?: number;
      currentHp?: number;
      health?: number;
      maxHp?: number;
      maxHealth?: number;
      startingHp?: number;
    } | null;
  };
}

/**
 * Parse a raw duel-state payload into a DuelSignal.
 * This replaces the static 0.5 fair value with state-derived probability.
 */
export function parseDuelSignal(
  payload: DuelStatePayload,
  hpEdgeMultiplier: number,
  signalWeight: number,
): DuelSignal | null {
  const cycle = payload?.cycle;
  const phase = String(cycle?.phase ?? cycle?.state ?? "").toUpperCase();
  if (!cycle || !phase) return null;

  const agent1 = cycle.agent1 ?? null;
  const agent2 = cycle.agent2 ?? null;

  const readFiniteNumber = (...candidates: unknown[]): number => {
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  };

  const readAgentId = (
    agent: DuelStatePayload["cycle"] extends { agent1?: infer A } ? A : never,
  ): string => String((agent as any)?.id ?? (agent as any)?.characterId ?? "");

  const readAgentName = (
    agent: DuelStatePayload["cycle"] extends { agent1?: infer A } ? A : never,
  ): string =>
    String((agent as any)?.name ?? "")
      .trim()
      .toLowerCase();

  let implied = 500;
  let confidence = 0;

  if (phase === "RESOLUTION") {
    const winnerId = String(cycle.winnerId || "");
    const winnerName = String(cycle.winnerName || "")
      .trim()
      .toLowerCase();
    const agent1Id = readAgentId(agent1);
    const agent1Name = readAgentName(agent1);

    if (
      winnerId &&
      agent1Id &&
      winnerId.toLowerCase() === agent1Id.toLowerCase()
    ) {
      implied = 985;
      confidence = 0.95;
    } else if (winnerId && agent1Id) {
      implied = 15;
      confidence = 0.95;
    } else if (winnerName && agent1Name) {
      implied = winnerName === agent1Name ? 985 : 15;
      confidence = 0.9;
    }
  } else if (phase === "FIGHTING") {
    const hp1 = readFiniteNumber(
      agent1?.hp,
      agent1?.currentHp,
      agent1?.health,
    );
    const max1 = readFiniteNumber(
      agent1?.maxHp,
      agent1?.maxHealth,
      agent1?.startingHp,
    );
    const hp2 = readFiniteNumber(
      agent2?.hp,
      agent2?.currentHp,
      agent2?.health,
    );
    const max2 = readFiniteNumber(
      agent2?.maxHp,
      agent2?.maxHealth,
      agent2?.startingHp,
    );

    if (
      max1 > 0 &&
      max2 > 0 &&
      Number.isFinite(hp1) &&
      Number.isFinite(hp2)
    ) {
      const hpRatio1 = hp1 / max1;
      const hpRatio2 = hp2 / max2;
      const edge = clamp(hpRatio1 - hpRatio2, -1, 1);
      const probYes = clamp(
        0.5 + edge * hpEdgeMultiplier,
        0.02,
        0.98,
      );
      implied = Math.round(probYes * 1000);
      // Confidence scales with how different the HP ratios are
      confidence = clamp(Math.abs(edge) * 0.8 + 0.2, 0.2, 0.85);
    }
  } else if (phase === "IDLE" || phase === "MATCHMAKING") {
    // No active duel – stay at 50/50 but with low weight
    implied = 500;
    confidence = 0.1;
  }

  return {
    midPrice: clamp(implied, 1, 999),
    phase,
    weight: clamp(confidence > 0 ? signalWeight : 0, 0, 1),
    confidence,
  };
}

// ─── Minimum order size enforcement ───────────────────────────────────────────
/**
 * Enforce a minimum order size floor.
 * Returns the capped size or 0 if the order should be skipped.
 */
export function enforceMinOrderSize(
  rawSize: number,
  minSize: number,
): number {
  const floor = Math.max(1, minSize);
  const rounded = Math.max(0, Math.floor(rawSize));
  if (rounded < floor) return 0; // skip, don't place a tiny order
  return rounded;
}

// ─── Multi-wallet types ───────────────────────────────────────────────────────
export interface WalletConfig {
  name: string;
  evmPrivateKey?: string;
  evmPrivateKeyBsc?: string;
  evmPrivateKeyBase?: string;
  solanaPrivateKey?: string;
  /** Per-wallet max inventory cap (overrides global) */
  maxInventoryCap?: number;
  /** Per-wallet max order size */
  maxOrderSize?: number;
  /** Whether this wallet is enabled */
  enabled?: boolean;
  env?: Record<string, string>;
}

export interface MultiWalletConfig {
  defaults?: Record<string, string>;
  wallets: WalletConfig[];
  /** Rotation cadence – how many cycles before rotating to next wallet */
  rotationCadence?: number;
  /** Minimum SOL/ETH balance to keep wallet active */
  minFundingLamports?: number;
  minFundingWei?: string;
}

// ─── EVM ABI ──────────────────────────────────────────────────────────────────
export const GOLD_CLOB_ABI = [
  "function bestBids(uint256 matchId) view returns (uint16)",
  "function bestAsks(uint256 matchId) view returns (uint16)",
  "function orders(uint64 orderId) view returns (uint64 id, uint16 price, bool isBuy, address maker, uint128 amount, uint128 filled)",
  "function nextOrderId() view returns (uint64)",
  "function nextMatchId() view returns (uint256)",
  "function goldToken() view returns (address)",
  "function matches(uint256 matchId) view returns (uint8 status, uint8 winner, uint256 yesPool, uint256 noPool)",
  "function positions(uint256 matchId, address user) view returns (uint256 yesShares, uint256 noShares)",
  "function placeOrder(uint256 matchId, bool isBuy, uint16 price, uint256 amount)",
  "function cancelOrder(uint256 matchId, uint64 orderId, uint16 price)",
  "event OrderPlaced(uint256 indexed matchId, uint64 indexed orderId, address indexed maker, bool isBuy, uint16 price, uint256 amount)",
  "event OrderMatched(uint256 indexed matchId, uint64 makerOrderId, uint64 takerOrderId, uint256 matchedAmount, uint16 price)",
];

export const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export const normalizeAddress = (value: string): string => {
  const trimmed = value.trim();
  try {
    return ethers.getAddress(trimmed);
  } catch {
    return ethers.getAddress(trimmed.toLowerCase());
  }
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toTokenUnits(amount: number, decimals: number): bigint {
  const normalizedAmount = Number.isFinite(amount) ? Math.max(amount, 0) : 0;
  const safeDecimals = Number.isFinite(decimals)
    ? Math.max(0, Math.floor(decimals))
    : 18;
  const scaledMicros = BigInt(Math.round(normalizedAmount * 1_000_000));
  return (scaledMicros * 10n ** BigInt(safeDecimals)) / 1_000_000n;
}
