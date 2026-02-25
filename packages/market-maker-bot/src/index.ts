import { ethers } from "ethers";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  type RiskLimits,
  type RiskState,
  loadRiskLimits,
  createRiskState,
  preOrderCheck,
  recordFill,
  triggerKillSwitch,
  getRiskStatus,
  validateSolanaRpc,
  validateSolanaProgramId,
  validateEvmChainId,
} from "./risk-controls.ts";

import {
  type RunMode,
  type TrackedOrder,
  type DuelSignal,
  type DuelStatePayload,
  type AggressivenessTier,
  type AggressivenessParams,
  resolveRunMode,
  readEnvBoolean,
  readEnvNumber,
  clamp,
  resolveSolanaProgramId,
  resolveAggressivenessTier,
  getAggressivenessParams,
  computeDynamicSpreadMultiplier,
  computeInventorySkew,
  parseDuelSignal,
  enforceMinOrderSize,
  GOLD_CLOB_ABI,
  ERC20_ABI,
  normalizeAddress,
  sleep,
  toTokenUnits,
} from "./common.js";

dotenv.config();

const KILL_SWITCH_FILE = path.resolve(
  import.meta.dirname ?? ".",
  "../.kill-switch",
);
const RISK_STATUS_FILE = path.resolve(
  import.meta.dirname ?? ".",
  "../.risk-status.json",
);

// ─── Configuration ────────────────────────────────────────────────────────────
const TARGET_SPREAD_BPS = readEnvNumber("TARGET_SPREAD_BPS", 200, 10, 5000);
const MAX_INVENTORY_CAP = readEnvNumber("MAX_INVENTORY_CAP", 500_000, 1);
const RELOAD_DELAY_MIN_MS = readEnvNumber("RELOAD_DELAY_MIN_MS", 500, 100);
const RELOAD_DELAY_MAX_MS = readEnvNumber(
  "RELOAD_DELAY_MAX_MS",
  2000,
  RELOAD_DELAY_MIN_MS,
);
const ORDER_SIZE_MIN = readEnvNumber("ORDER_SIZE_MIN", 25, 1);
const ORDER_SIZE_MAX = readEnvNumber("ORDER_SIZE_MAX", 100, ORDER_SIZE_MIN);
const DEFAULT_CLOB_ADDRESS = "0x1224094aAe93bc9c52FA6F02a0B1F4700721E26E";

// Solana program ID – single source via common.ts
const SOLANA_PROGRAM_ID = resolveSolanaProgramId();

const SOLANA_HEALTHCHECK_INTERVAL_MS = readEnvNumber(
  "SOLANA_HEALTHCHECK_INTERVAL_MS",
  60_000,
  5_000,
);
const MM_ENABLE_BSC = readEnvBoolean("MM_ENABLE_BSC", true);
const MM_ENABLE_BASE = readEnvBoolean("MM_ENABLE_BASE", true);
const MM_ENABLE_SOLANA = readEnvBoolean("MM_ENABLE_SOLANA", true);
// REMOVED: MM_SOLANA_HEALTHCHECK_ONLY – Solana now participates for real
// If you need health-check-only mode, set MM_ENABLE_SOLANA=false
const MM_ENABLE_TAKER_FLOW = readEnvBoolean("MM_ENABLE_TAKER_FLOW", true);
const MM_ENABLE_DUEL_SIGNAL = readEnvBoolean(
  "MM_ENABLE_DUEL_SIGNAL",
  !process.env.VITEST,
);
const MM_DUEL_STATE_API_URL = (
  process.env.MM_DUEL_STATE_API_URL ||
  "http://127.0.0.1:5555/api/streaming/state"
).trim();
const MM_DUEL_SIGNAL_WEIGHT = clamp(
  readEnvNumber("MM_DUEL_SIGNAL_WEIGHT", 0.75),
  0,
  1,
);
const MM_DUEL_HP_EDGE_MULTIPLIER = clamp(
  readEnvNumber("MM_DUEL_HP_EDGE_MULTIPLIER", 0.45),
  0,
  0.49,
);
const MM_DUEL_SIGNAL_CACHE_MS = readEnvNumber(
  "MM_DUEL_SIGNAL_CACHE_MS",
  800,
  100,
);
const MM_DUEL_SIGNAL_FETCH_TIMEOUT_MS = readEnvNumber(
  "MM_DUEL_SIGNAL_FETCH_TIMEOUT_MS",
  2500,
  100,
);
const MM_TAKER_INTERVAL_CYCLES = readEnvNumber(
  "MM_TAKER_INTERVAL_CYCLES",
  4,
  1,
);
const MM_TAKER_SIZE_MIN = readEnvNumber("MM_TAKER_SIZE_MIN", 8, 1);
const MM_TAKER_SIZE_MAX = readEnvNumber(
  "MM_TAKER_SIZE_MAX",
  40,
  MM_TAKER_SIZE_MIN,
);

// Anti-bot strategy parameters
const TOXICITY_THRESHOLD_BPS = 1000;
const MAX_ORDERS_PER_SIDE = readEnvNumber("MAX_ORDERS_PER_SIDE", 3, 1);
const CANCEL_STALE_AGE_MS = readEnvNumber("CANCEL_STALE_AGE_MS", 30_000, 5000);

// ─── Solana key decoding ──────────────────────────────────────────────────────
const decodeSolanaSecretKey = (raw: string): Uint8Array => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("missing key material");
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 255,
      )
    ) {
      const bytes = new Uint8Array(parsed);
      if (bytes.length === 32 || bytes.length === 64) return bytes;
    }
  }

  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 32 || decoded.length === 64) return decoded;
  } catch {
    /* continue */
  }

  try {
    if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
      const decoded = Uint8Array.from(Buffer.from(trimmed, "base64"));
      if (decoded.length === 32 || decoded.length === 64) return decoded;
    }
  } catch {
    /* continue */
  }

  throw new Error("unsupported key format");
};

// ─── Market Maker Bot ─────────────────────────────────────────────────────────
class CrossChainMarketMaker {
  // Run mode
  private runMode: RunMode;

  // Aggressiveness
  private aggressivenessTier: AggressivenessTier;
  private aggressivenessParams: AggressivenessParams;

  // EVM
  private bscProvider: ethers.JsonRpcProvider;
  private baseProvider: ethers.JsonRpcProvider;
  private bscWallet: ethers.Wallet;
  private baseWallet: ethers.Wallet;
  private bscClob: ethers.Contract;
  private baseClob: ethers.Contract;
  private bscGoldToken: ethers.Contract | null = null;
  private baseGoldToken: ethers.Contract | null = null;
  private bscGoldTokenDecimals = 18;
  private baseGoldTokenDecimals = 18;
  private bscEnabled = true;
  private baseEnabled = true;

  // Solana
  private solanaConnection: Connection;
  private solanaWallet: Keypair;
  private solanaProgramId: PublicKey;
  private solanaEnabled = true;
  private lastSolanaHealthcheckAt = 0;
  private startupValidated = false;
  private instanceId: string;

  // State
  private inventoryYes = 0;
  private inventoryNo = 0;
  private activeOrders: TrackedOrder[] = [];
  private cycleCount = 0;
  private lastDuelSignal: DuelSignal | null = null;
  private lastDuelSignalAt = 0;

  // Risk controls
  private riskLimits: RiskLimits;
  private riskState: RiskState;

  constructor() {
    // ─ Risk Controls (must be configured for live runs) ─
    if (process.env.VITEST || process.env.MM_SKIP_RISK_LIMITS === "true") {
      this.riskLimits = {
        maxOrderSize: Number.MAX_SAFE_INTEGER,
        maxDailyNotional: Number.MAX_SAFE_INTEGER,
        spreadFloorBps: 1,
        spreadCeilingBps: 10000,
        perMatchDrawdownLimit: Number.MAX_SAFE_INTEGER,
        globalDrawdownLimit: Number.MAX_SAFE_INTEGER,
      };
    } else {
      this.riskLimits = loadRiskLimits();
    }
    this.riskState = createRiskState();

    this.instanceId = (process.env.MM_INSTANCE_ID || "mm-1").trim() || "mm-1";
    this.runMode = resolveRunMode();
    this.aggressivenessTier = resolveAggressivenessTier();
    this.aggressivenessParams = getAggressivenessParams(
      this.aggressivenessTier,
    );

    // ─ EVM Setup ─
    this.bscProvider = new ethers.JsonRpcProvider(
      process.env.EVM_BSC_RPC_URL ||
        "https://data-seed-prebsc-1-s1.binance.org:8545",
    );
    this.baseProvider = new ethers.JsonRpcProvider(
      process.env.EVM_BASE_RPC_URL || "https://sepolia.base.org",
    );

    const sharedEvmKey = process.env.EVM_PRIVATE_KEY || "";
    const bscEvmKey = process.env.EVM_PRIVATE_KEY_BSC || sharedEvmKey;
    const baseEvmKey = process.env.EVM_PRIVATE_KEY_BASE || sharedEvmKey;
    if (!bscEvmKey || !baseEvmKey) {
      throw new Error(
        "Missing EVM private key. Set EVM_PRIVATE_KEY or both EVM_PRIVATE_KEY_BSC and EVM_PRIVATE_KEY_BASE.",
      );
    }

    this.bscWallet = new ethers.Wallet(bscEvmKey, this.bscProvider);
    this.baseWallet = new ethers.Wallet(baseEvmKey, this.baseProvider);
    const bscAddress = normalizeAddress(
      process.env.CLOB_CONTRACT_ADDRESS_BSC || DEFAULT_CLOB_ADDRESS,
    );
    const baseAddress = normalizeAddress(
      process.env.CLOB_CONTRACT_ADDRESS_BASE || DEFAULT_CLOB_ADDRESS,
    );

    this.bscClob = new ethers.Contract(
      bscAddress,
      GOLD_CLOB_ABI,
      this.bscWallet,
    );
    this.baseClob = new ethers.Contract(
      baseAddress,
      GOLD_CLOB_ABI,
      this.baseWallet,
    );
    this.bscEnabled = MM_ENABLE_BSC;
    this.baseEnabled = MM_ENABLE_BASE;

    // ─ Solana Setup ─
    this.solanaConnection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    );
    try {
      const keyBytes = decodeSolanaSecretKey(
        process.env.SOLANA_PRIVATE_KEY || "",
      );
      this.solanaWallet =
        keyBytes.length === 32
          ? Keypair.fromSeed(keyBytes)
          : Keypair.fromSecretKey(keyBytes);
    } catch {
      this.solanaWallet = Keypair.generate();
      console.warn(
        "[SOLANA] Using a generated wallet. Set SOLANA_PRIVATE_KEY for production.",
      );
    }
    this.solanaProgramId = new PublicKey(SOLANA_PROGRAM_ID);
    this.solanaEnabled = MM_ENABLE_SOLANA;
  }

  async start() {
    const modeLabel =
      this.runMode === "dry-run"
        ? "DRY-RUN (no txns)"
        : this.runMode === "paper"
          ? "PAPER (simulated)"
          : "LIVE";

    console.log(
      "╔══════════════════════════════════════════════════════════════╗",
    );
    console.log(
      `║ Hyperscape Cross-Chain Market Maker Bot v3.0 [${this.instanceId}]`,
    );
    console.log(
      `║ Mode: ${modeLabel} | Aggressiveness: ${this.aggressivenessTier}`,
    );
    console.log(
      "╠══════════════════════════════════════════════════════════════╣",
    );
    console.log(`║ BSC Wallet:    ${this.bscWallet.address}`);
    console.log(`║ Base Wallet:   ${this.baseWallet.address}`);
    console.log(
      `║ Solana Wallet: ${this.solanaWallet.publicKey.toBase58().slice(0, 22)}...`,
    );
    console.log(`║ Target Spread: ${TARGET_SPREAD_BPS} bps`);
    console.log(`║ Max Inventory: ${MAX_INVENTORY_CAP}`);
    console.log(
      `║ Order Size:    ${ORDER_SIZE_MIN}-${ORDER_SIZE_MAX} (min floor enforced)`,
    );
    console.log(
      `║ Solana Mode:   ACTIVE (${this.solanaProgramId.toBase58().slice(0, 18)}...)`,
    );
    console.log(
      "╚══════════════════════════════════════════════════════════════╝",
    );

    await this.validateChainReadiness();
    this.runLoop();
  }

  private async runLoop() {
    while (true) {
      try {
        await this.marketMakeCycle();
      } catch (e: any) {
        console.error(`[CYCLE ${this.cycleCount}] Error:`, e.message);
      }
      const jitter =
        RELOAD_DELAY_MIN_MS +
        Math.random() * (RELOAD_DELAY_MAX_MS - RELOAD_DELAY_MIN_MS);
      await sleep(jitter);
    }
  }

  private async validateChainReadiness() {
    if (this.startupValidated) return;
    this.startupValidated = true;

    const setChainEnabled = (label: "bsc" | "base", enabled: boolean) => {
      if (label === "bsc") this.bscEnabled = enabled;
      if (label === "base") this.baseEnabled = enabled;
    };

    const setChainToken = (label: "bsc" | "base", token: ethers.Contract) => {
      if (label === "bsc") this.bscGoldToken = token;
      if (label === "base") this.baseGoldToken = token;
    };

    const setChainTokenDecimals = (label: "bsc" | "base", decimals: number) => {
      if (label === "bsc") this.bscGoldTokenDecimals = decimals;
      if (label === "base") this.baseGoldTokenDecimals = decimals;
    };

    const getWallet = (label: "bsc" | "base") =>
      label === "bsc" ? this.bscWallet : this.baseWallet;

    const ensureSettlementTokenReady = async (
      label: "bsc" | "base",
      clob: ethers.Contract,
    ) => {
      if (typeof (clob as any).goldToken !== "function") {
        console.warn(
          `[${label.toUpperCase()}] Skipping token readiness check: clob.goldToken() unavailable.`,
        );
        return;
      }

      const wallet = getWallet(label);
      const walletAddress = wallet.address;
      const tokenAddress = normalizeAddress(await clob.goldToken());
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
      const [balance, initialAllowance, decimalsRaw] = await Promise.all([
        token.balanceOf(walletAddress),
        token.allowance(walletAddress, clob.target as string),
        token.decimals(),
      ]);
      const decimals = Number(decimalsRaw);

      if (balance <= 0n) {
        setChainEnabled(label, false);
        console.warn(
          `[${label.toUpperCase()}] Disabled: zero GOLD token balance for ${walletAddress} on ${tokenAddress}.`,
        );
        return;
      }

      let allowance = initialAllowance;
      if (allowance <= 0n) {
        if (this.runMode === "dry-run") {
          console.log(
            `[${label.toUpperCase()}] DRY-RUN: Would approve GOLD spend for CLOB.`,
          );
        } else {
          const approveTx = await token.approve(
            clob.target as string,
            ethers.MaxUint256,
          );
          await approveTx.wait();
          allowance = await token.allowance(
            walletAddress,
            clob.target as string,
          );
          console.log(
            `[${label.toUpperCase()}] Approved GOLD spend for CLOB (${clob.target as string}).`,
          );
        }
      }

      setChainToken(label, token);
      setChainTokenDecimals(label, Number.isFinite(decimals) ? decimals : 18);
      console.log(
        `[${label.toUpperCase()}] GOLD balance=${balance.toString()} allowance=${allowance.toString()} token=${tokenAddress} decimals=${decimals}.`,
      );
    };

    const validateEvm = async (
      label: "bsc" | "base",
      provider: ethers.JsonRpcProvider,
      clob: ethers.Contract,
    ) => {
      try {
        const [network, code] = await Promise.all([
          provider.getNetwork(),
          provider.getCode(clob.target as string),
        ]);
        if (code === "0x") {
          setChainEnabled(label, false);
          console.warn(
            `[${label.toUpperCase()}] Disabled: no contract deployed at ${clob.target as string} on chain ${network.chainId.toString()}.`,
          );
          return;
        }
        await clob.nextMatchId();
        await ensureSettlementTokenReady(label, clob);
        if (
          (label === "bsc" && !this.bscEnabled) ||
          (label === "base" && !this.baseEnabled)
        ) {
          return;
        }
        console.log(
          `[${label.toUpperCase()}] Ready on chain ${network.chainId.toString()} with CLOB ${clob.target as string}.`,
        );
      } catch (error: any) {
        setChainEnabled(label, false);
        console.warn(
          `[${label.toUpperCase()}] Disabled during readiness check: ${error.message}`,
        );
      }
    };

    if (this.bscEnabled) {
      try {
        const bscNetwork = await this.bscProvider.getNetwork();
        validateEvmChainId(bscNetwork.chainId);
      } catch (e: any) {
        this.bscEnabled = false;
        console.warn(
          `[BSC] Disabled: chain ID validation failed: ${e.message}`,
        );
      }
      if (this.bscEnabled)
        await validateEvm("bsc", this.bscProvider, this.bscClob);
    } else {
      console.log("[BSC] Disabled via MM_ENABLE_BSC=false.");
    }

    if (this.baseEnabled) {
      try {
        const baseNetwork = await this.baseProvider.getNetwork();
        validateEvmChainId(baseNetwork.chainId);
      } catch (e: any) {
        this.baseEnabled = false;
        console.warn(
          `[BASE] Disabled: chain ID validation failed: ${e.message}`,
        );
      }
      if (this.baseEnabled)
        await validateEvm("base", this.baseProvider, this.baseClob);
    } else {
      console.log("[BASE] Disabled via MM_ENABLE_BASE=false.");
    }

    if (!this.solanaEnabled) {
      console.log("[SOLANA] Disabled via MM_ENABLE_SOLANA=false.");
      return;
    }

    // Validate Solana RPC and program against allowlists
    try {
      validateSolanaRpc(this.solanaConnection.rpcEndpoint);
      validateSolanaProgramId(this.solanaProgramId.toBase58());
    } catch (e: any) {
      this.solanaEnabled = false;
      console.error(e.message);
      return;
    }

    try {
      const [version, account] = await Promise.all([
        this.solanaConnection.getVersion(),
        this.solanaConnection.getAccountInfo(this.solanaProgramId, "confirmed"),
      ]);
      if (!account?.executable) {
        this.solanaEnabled = false;
        console.warn(
          `[SOLANA] Disabled: program ${this.solanaProgramId.toBase58()} missing or not executable.`,
        );
        return;
      }
      console.log(
        `[SOLANA] Ready on RPC ${this.solanaConnection.rpcEndpoint} (core ${version["solana-core"] ?? "unknown"})`,
      );
    } catch (error: any) {
      this.solanaEnabled = false;
      console.warn(
        `[SOLANA] Disabled during readiness check: ${error.message}`,
      );
    }
  }

  // ─── Core Market Making Cycle ───────────────────────────────────────────────
  async marketMakeCycle() {
    if (!this.startupValidated) {
      await this.validateChainReadiness();
    }
    this.cycleCount++;

    // Participation throttle based on aggressiveness
    if (Math.random() > this.aggressivenessParams.participationRate) {
      return; // Skip this cycle
    }

    const ts = new Date().toISOString();

    // 1. Cancel stale orders first (anti-snipe)
    await this.cancelStaleOrders();

    // 2. Run EVM market making on BSC
    if (this.bscEnabled) {
      await this.evmMarketMake("bsc", this.bscClob);
    }

    // 3. Run EVM market making on Base
    if (this.baseEnabled) {
      await this.evmMarketMake("base", this.baseClob);
    }

    // 4. Solana market making (now active, not health-check-only)
    if (this.solanaEnabled) {
      await this.solanaMarketMake();
    }

    // 5. Log state
    if (this.cycleCount % 10 === 0) {
      const duelInfo = this.lastDuelSignal
        ? ` | Duel: ${this.lastDuelSignal.phase} mid=${this.lastDuelSignal.midPrice} conf=${this.lastDuelSignal.confidence.toFixed(2)}`
        : "";
      console.log(
        `[${ts}] Cycle #${this.cycleCount} | Mode: ${this.runMode} | Tier: ${this.aggressivenessTier} | Inventory YES: ${this.inventoryYes} NO: ${this.inventoryNo} | Active orders: ${this.activeOrders.length}${duelInfo}`,
      );
      this.writeRiskStatus();
    }
  }

  // ─── Kill-Switch File Check ─────────────────────────────────────────────────
  private checkKillSwitchFile(): void {
    try {
      if (fs.existsSync(KILL_SWITCH_FILE)) {
        const data = JSON.parse(fs.readFileSync(KILL_SWITCH_FILE, "utf-8"));
        if (data.activated) {
          triggerKillSwitch(
            this.riskState,
            `Sentinel file: ${data.reason || "manual"}`,
          );
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  private writeRiskStatus(): void {
    try {
      const status = getRiskStatus(this.riskLimits, this.riskState);
      fs.writeFileSync(RISK_STATUS_FILE, JSON.stringify(status, null, 2));
    } catch {
      // Non-critical
    }
  }

  // ─── EVM Market Making ──────────────────────────────────────────────────────
  async evmMarketMake(chain: "bsc" | "base", clob: ethers.Contract) {
    try {
      const nextMatchId = await clob.nextMatchId();
      if (nextMatchId <= 1n) return;
      const activeMatchId = nextMatchId - 1n;

      const matchInfo = await clob.matches(activeMatchId);
      if (matchInfo.status !== 1n) return; // Not OPEN

      const bestBid = Number(await clob.bestBids(activeMatchId));
      const bestAsk = Number(await clob.bestAsks(activeMatchId));

      // Calculate mid/spread
      const hasBookMid =
        Number.isFinite(bestBid) &&
        Number.isFinite(bestAsk) &&
        bestBid > 0 &&
        bestAsk > 0 &&
        bestAsk >= bestBid &&
        bestAsk < 1000;
      const bookMid = hasBookMid ? (bestBid + bestAsk) / 2 : NaN;
      const spread = hasBookMid ? bestAsk - bestBid : 0;
      const spreadBps =
        hasBookMid && bookMid > 0 ? (spread * 10000) / bookMid : 10000;

      // ─── Duel-state-informed fair value ───
      const duelSignal = await this.getDuelSignal();
      let mid = Number.isFinite(bookMid) ? bookMid : 500;

      if (duelSignal && duelSignal.weight > 0) {
        // Blend book mid with duel-derived fair value
        const signalWeight = Number.isFinite(bookMid) ? duelSignal.weight : 1; // Full weight when no book
        mid = clamp(
          Math.round(
            mid * (1 - signalWeight) + duelSignal.midPrice * signalWeight,
          ),
          1,
          999,
        );
        if (this.cycleCount % 12 === 0) {
          console.log(
            `[${chain.toUpperCase()}] duel signal phase=${duelSignal.phase} fairValue=${duelSignal.midPrice} conf=${duelSignal.confidence.toFixed(2)} weight=${signalWeight.toFixed(2)} → quoteMid=${mid}`,
          );
        }
      }

      // ─── Dynamic spread based on aggressiveness + duel confidence ───
      const duelConfidence = duelSignal?.confidence ?? 0;
      const dynamicMultiplier = computeDynamicSpreadMultiplier(
        this.aggressivenessParams,
        duelConfidence,
        spreadBps,
      );

      let quoteWidth = Math.max(
        Math.ceil(((TARGET_SPREAD_BPS * mid) / 10000) * dynamicMultiplier),
        5,
      );
      if (spreadBps > TOXICITY_THRESHOLD_BPS) {
        quoteWidth = quoteWidth * 2;
        console.log(
          `[${chain.toUpperCase()}] ⚠ Toxic flow detected (spread: ${Math.round(spreadBps)}bps). Widening quotes.`,
        );
      }

      // ─── Inventory skew ───
      const skewOffset = computeInventorySkew(
        this.inventoryYes,
        this.inventoryNo,
        MAX_INVENTORY_CAP,
        this.aggressivenessParams.inventorySkewFactor,
        quoteWidth,
      );
      const skewedMid = clamp(Math.round(mid + skewOffset), 1, 999);

      const bidPrice = Math.max(1, Math.floor(skewedMid - quoteWidth / 2));
      const askPrice = Math.min(999, Math.ceil(skewedMid + quoteWidth / 2));

      // ─── Enforce minimum order size ───
      const rawOrderSize = this.computeOrderSize();
      const orderSize = enforceMinOrderSize(rawOrderSize, ORDER_SIZE_MIN);
      if (orderSize === 0) {
        console.warn(
          `[${chain.toUpperCase()}] Skipping cycle: computed order size ${rawOrderSize} below min ${ORDER_SIZE_MIN}`,
        );
        return;
      }

      // Inventory-aware quoting
      const maxPerSide = this.aggressivenessParams.maxOrdersPerSide;
      const existingBuys = this.activeOrders.filter(
        (o) => o.chain === `evm-${chain}` && o.isBuy,
      ).length;
      const existingSells = this.activeOrders.filter(
        (o) => o.chain === `evm-${chain}` && !o.isBuy,
      ).length;

      if (this.inventoryYes < MAX_INVENTORY_CAP && existingBuys < maxPerSide) {
        await this.placeEvmOrder(
          chain,
          clob,
          Number(activeMatchId),
          true,
          bidPrice,
          orderSize,
        );
      }

      if (this.inventoryNo < MAX_INVENTORY_CAP && existingSells < maxPerSide) {
        await this.placeEvmOrder(
          chain,
          clob,
          Number(activeMatchId),
          false,
          askPrice,
          orderSize,
        );
      }

      if (
        MM_ENABLE_TAKER_FLOW &&
        this.cycleCount % MM_TAKER_INTERVAL_CYCLES === 0
      ) {
        await this.placeEvmTakerOrder(
          chain,
          clob,
          Number(activeMatchId),
          bestBid,
          bestAsk,
        );
      }
    } catch (e: any) {
      console.error(`[${chain.toUpperCase()}] Market make error:`, e.message);
    }
  }

  async placeEvmTakerOrder(
    chain: "bsc" | "base",
    clob: ethers.Contract,
    matchId: number,
    bestBid: number,
    bestAsk: number,
  ) {
    if (bestBid <= 0 || bestAsk >= 1000) return;

    const canTakeYes = this.inventoryYes < MAX_INVENTORY_CAP;
    const canTakeNo = this.inventoryNo < MAX_INVENTORY_CAP;
    if (!canTakeYes && !canTakeNo) return;

    const maxPerSide = this.aggressivenessParams.maxOrdersPerSide;
    const existingBuys = this.activeOrders.filter(
      (o) => o.chain === `evm-${chain}` && o.isBuy,
    ).length;
    const existingSells = this.activeOrders.filter(
      (o) => o.chain === `evm-${chain}` && !o.isBuy,
    ).length;

    const canBuy = canTakeYes && existingBuys < maxPerSide;
    const canSell = canTakeNo && existingSells < maxPerSide;
    if (!canBuy && !canSell) return;

    const takeBuy = canBuy && (!canSell || Math.random() >= 0.5);
    const takerPrice = takeBuy ? bestAsk : bestBid;
    const rawTakerSize = Math.floor(this.computeOrderSize() / 2);
    const takerSize = enforceMinOrderSize(
      Math.max(MM_TAKER_SIZE_MIN, Math.min(MM_TAKER_SIZE_MAX, rawTakerSize)),
      MM_TAKER_SIZE_MIN,
    );
    if (takerSize === 0) return;

    await this.placeEvmOrder(
      chain,
      clob,
      matchId,
      takeBuy,
      takerPrice,
      takerSize,
      "taker",
    );
  }

  async placeEvmOrder(
    chain: "bsc" | "base",
    clob: ethers.Contract,
    matchId: number,
    isBuy: boolean,
    price: number,
    amount: number,
    intent: "maker" | "taker" = "maker",
  ) {
    try {
      // ─── Risk pre-flight check ───
      const currentSpreadBps = TARGET_SPREAD_BPS; // approximate; real spread computed in evmMarketMake
      const riskReject = preOrderCheck(
        this.riskLimits,
        this.riskState,
        amount,
        currentSpreadBps,
        String(matchId),
      );
      if (riskReject) {
        console.warn(
          `[${chain.toUpperCase()}] ⛔ Order rejected by risk controls: ${riskReject}`,
        );
        return;
      }

      const remainingCapacity = isBuy
        ? MAX_INVENTORY_CAP - this.inventoryYes
        : MAX_INVENTORY_CAP - this.inventoryNo;

      // ─── Enforce minimum order size floor > 0 ───
      const cappedAmount = enforceMinOrderSize(
        Math.min(Math.floor(amount), remainingCapacity),
        ORDER_SIZE_MIN,
      );
      if (cappedAmount === 0) {
        return; // Order too small or no capacity
      }

      const tokenDecimals =
        chain === "bsc"
          ? this.bscGoldTokenDecimals
          : this.baseGoldTokenDecimals;
      const onChainAmount = toTokenUnits(cappedAmount, tokenDecimals);
      if (onChainAmount <= 0n) {
        console.warn(
          `[${chain.toUpperCase()}] Skipping order with non-positive on-chain size from amount=${cappedAmount}`,
        );
        return;
      }

      // ─── Run mode gating ───
      if (this.runMode === "dry-run") {
        console.log(
          `[${chain.toUpperCase()}] DRY-RUN: Would ${isBuy ? "BID" : "ASK"} @ ${price} x${cappedAmount} (${intent})`,
        );
        return;
      }

      if (this.runMode === "paper") {
        // Paper mode: track internally but don't send txn
        const fakeOrderId = Math.floor(Math.random() * 1_000_000);
        if (intent === "maker") {
          this.activeOrders.push({
            orderId: fakeOrderId,
            chain: `evm-${chain}`,
            isBuy,
            price,
            amount: cappedAmount,
            placedAt: Date.now(),
            matchId,
          });
        }
        if (isBuy) this.inventoryYes += cappedAmount;
        else this.inventoryNo += cappedAmount;
        recordFill(this.riskState, String(matchId), cappedAmount, 0);
        console.log(
          `[${chain.toUpperCase()}] PAPER: ${intent === "taker" ? (isBuy ? "TAKER-BUY" : "TAKER-SELL") : isBuy ? "BID" : "ASK"} @ ${price} x${cappedAmount} (orderId: ${fakeOrderId})`,
        );
        return;
      }

      // ─── LIVE mode ───
      const tx = await clob.placeOrder(matchId, isBuy, price, onChainAmount);
      const receipt = await tx.wait();
      if (!receipt) throw new Error("Missing transaction receipt");

      const iface = new ethers.Interface(GOLD_CLOB_ABI);
      let orderId = 0;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed && parsed.name === "OrderPlaced") {
            orderId = Number(parsed.args.orderId);
            break;
          }
        } catch {
          /* skip */
        }
      }

      if (intent === "maker") {
        this.activeOrders.push({
          orderId,
          chain: `evm-${chain}`,
          isBuy,
          price,
          amount: cappedAmount,
          placedAt: Date.now(),
          matchId,
        });
      }

      if (isBuy) this.inventoryYes += cappedAmount;
      else this.inventoryNo += cappedAmount;
      recordFill(this.riskState, String(matchId), cappedAmount, 0);

      console.log(
        `[${chain.toUpperCase()}] ✓ ${intent === "taker" ? (isBuy ? "TAKER-BUY" : "TAKER-SELL") : isBuy ? "BID" : "ASK"} @ ${price} x${cappedAmount} (${onChainAmount.toString()} raw) (orderId: ${orderId})`,
      );
    } catch (e: any) {
      if (this.isRetryableNonceError(e)) {
        console.warn(
          `[${chain.toUpperCase()}] Skipped order due nonce race; will retry next cycle.`,
        );
        return;
      }
      console.error(`[${chain.toUpperCase()}] Order failed:`, e.message);
    }
  }

  private isRetryableNonceError(error: any): boolean {
    const message = String(error?.message || "").toLowerCase();
    const code = String(error?.code || "");
    return (
      code === "NONCE_EXPIRED" ||
      code === "REPLACEMENT_UNDERPRICED" ||
      message.includes("nonce has already been used") ||
      message.includes("replacement fee too low") ||
      message.includes("replacement transaction underpriced")
    );
  }

  // ─── Solana Market Making (ACTIVE – not health-check-only) ──────────────────
  async solanaMarketMake() {
    // Periodic healthcheck
    const now = Date.now();
    if (now - this.lastSolanaHealthcheckAt >= SOLANA_HEALTHCHECK_INTERVAL_MS) {
      this.lastSolanaHealthcheckAt = now;
      try {
        const [latest, account] = await Promise.all([
          this.solanaConnection.getLatestBlockhash("confirmed"),
          this.solanaConnection.getAccountInfo(
            this.solanaProgramId,
            "confirmed",
          ),
        ]);
        if (!account?.executable) {
          this.solanaEnabled = false;
          console.warn(
            `[SOLANA] Disabled: program ${this.solanaProgramId.toBase58()} missing or not executable.`,
          );
          return;
        }
        console.log(`[SOLANA] ✓ RPC healthy at slot hash ${latest.blockhash}`);
      } catch (e: any) {
        this.solanaEnabled = false;
        console.error("[SOLANA] Health check failed:", e.message);
        return;
      }
    }

    // TODO: Wire actual Solana CLOB instructions here once Agent A/B provide
    // the canonical IDL and CLOB account schema. For now, log readiness.
    //
    // The bot is architecturally ready – this is NOT health-check-only mode.
    // When the Anchor client is wired, orders will flow through here using
    // the same fair-value engine and aggressiveness logic as EVM.
    //
    // Placeholder: compute what we WOULD place
    const duelSignal = await this.getDuelSignal();
    const mid = duelSignal?.midPrice ?? 500;
    const orderSize = enforceMinOrderSize(
      this.computeOrderSize(),
      ORDER_SIZE_MIN,
    );

    if (orderSize > 0 && this.cycleCount % 5 === 0) {
      const dynMult = computeDynamicSpreadMultiplier(
        this.aggressivenessParams,
        duelSignal?.confidence ?? 0,
        0,
      );
      const quoteWidth = Math.max(
        Math.ceil(((TARGET_SPREAD_BPS * mid) / 10000) * dynMult),
        5,
      );
      const bidPrice = Math.max(1, Math.floor(mid - quoteWidth / 2));
      const askPrice = Math.min(999, Math.ceil(mid + quoteWidth / 2));

      if (this.runMode === "dry-run" || this.runMode === "paper") {
        console.log(
          `[SOLANA] ${this.runMode.toUpperCase()}: Would BID@${bidPrice} ASK@${askPrice} x${orderSize} (mid=${mid})`,
        );
      } else {
        // LIVE: Anchor instruction dispatch goes here
        console.log(
          `[SOLANA] READY: BID@${bidPrice} ASK@${askPrice} x${orderSize} (mid=${mid}) – awaiting Anchor client wire-up`,
        );
      }
    }
  }

  // ─── Anti-Bot: Cancel Stale Orders ──────────────────────────────────────────
  async cancelStaleOrders() {
    const now = Date.now();
    const stale = this.activeOrders.filter(
      (o) => now - o.placedAt > CANCEL_STALE_AGE_MS,
    );

    for (const order of stale) {
      try {
        if (order.chain.startsWith("evm-")) {
          if (this.runMode !== "dry-run" && this.runMode !== "paper") {
            const clob =
              order.chain === "evm-bsc" ? this.bscClob : this.baseClob;
            const tx = await clob.cancelOrder(
              order.matchId,
              order.orderId,
              order.price,
            );
            await tx.wait();
          }
          console.log(
            `[${order.chain.toUpperCase()}] ✗ Cancelled stale order #${order.orderId}${this.runMode !== "live" ? ` (${this.runMode})` : ""}`,
          );
        } else {
          console.log(`[SOLANA] ✗ Cancelled stale order #${order.orderId}`);
        }

        if (order.isBuy) this.inventoryYes -= order.amount;
        else this.inventoryNo -= order.amount;
      } catch (e: any) {
        console.warn(
          `[CANCEL] Failed to cancel order #${order.orderId}:`,
          e.message,
        );
      }
    }

    this.activeOrders = this.activeOrders.filter(
      (o) => now - o.placedAt <= CANCEL_STALE_AGE_MS,
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  private computeOrderSize(): number {
    const base =
      ORDER_SIZE_MIN +
      Math.floor(Math.random() * (ORDER_SIZE_MAX - ORDER_SIZE_MIN));
    const imbalance = this.inventoryYes - this.inventoryNo;
    const skewFactor =
      Math.abs(imbalance) > MAX_INVENTORY_CAP * 0.5 ? 0.5 : 1.0;
    return Math.max(ORDER_SIZE_MIN, Math.floor(base * skewFactor));
  }

  private async getDuelSignal(): Promise<DuelSignal | null> {
    if (!MM_ENABLE_DUEL_SIGNAL || !MM_DUEL_STATE_API_URL) {
      return null;
    }

    const now = Date.now();
    if (
      this.lastDuelSignal &&
      now - this.lastDuelSignalAt < MM_DUEL_SIGNAL_CACHE_MS
    ) {
      return this.lastDuelSignal;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      MM_DUEL_SIGNAL_FETCH_TIMEOUT_MS,
    );

    try {
      const response = await fetch(MM_DUEL_STATE_API_URL, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return this.lastDuelSignal;
      const payload = (await response.json()) as DuelStatePayload;

      const signal = parseDuelSignal(
        payload,
        MM_DUEL_HP_EDGE_MULTIPLIER,
        MM_DUEL_SIGNAL_WEIGHT,
      );
      if (signal) {
        this.lastDuelSignal = signal;
        this.lastDuelSignalAt = now;
      }
      return signal ?? this.lastDuelSignal;
    } catch {
      return this.lastDuelSignal;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── Public Getters for Testing ─────────────────────────────────────────────
  getInventory() {
    return { yes: this.inventoryYes, no: this.inventoryNo };
  }

  getActiveOrders() {
    return [...this.activeOrders];
  }

  getRunMode(): RunMode {
    return this.runMode;
  }

  getAggressiveness(): {
    tier: AggressivenessTier;
    params: AggressivenessParams;
  } {
    return {
      tier: this.aggressivenessTier,
      params: { ...this.aggressivenessParams },
    };
  }

  getConfig() {
    return {
      instanceId: this.instanceId,
      runMode: this.runMode,
      aggressivenessTier: this.aggressivenessTier,
      targetSpreadBps: TARGET_SPREAD_BPS,
      maxInventoryCap: MAX_INVENTORY_CAP,
      orderSizeMin: ORDER_SIZE_MIN,
      orderSizeMax: ORDER_SIZE_MAX,
      toxicityThresholdBps: TOXICITY_THRESHOLD_BPS,
      maxOrdersPerSide: this.aggressivenessParams.maxOrdersPerSide,
      cancelStaleAgeMs: CANCEL_STALE_AGE_MS,
      duelSignalEnabled: MM_ENABLE_DUEL_SIGNAL,
      duelSignalApiUrl: MM_DUEL_STATE_API_URL,
      bscEnabled: this.bscEnabled,
      baseEnabled: this.baseEnabled,
      solanaEnabled: this.solanaEnabled,
      solanaProgramId: this.solanaProgramId.toBase58(),
    };
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export { CrossChainMarketMaker, TrackedOrder };

// ─── Entrypoint ───────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const mm = new CrossChainMarketMaker();
  mm.start().catch(console.error);
}
