import { ethers } from "ethers";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

import {
  type RunMode,
  type TrackedOrder,
  type DuelSignal,
  type DuelStatePayload,
  type AggressivenessTier,
  type AggressivenessParams,
  type CycleTelemetry,
  type MMHealthStatus,
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
  validateOrderSize,
  GOLD_CLOB_ABI,
  ERC20_ABI,
  normalizeAddress,
  sleep,
  toTokenUnits,
} from "./common.js";

dotenv.config();

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
const SOLANA_PROGRAM_ID = resolveSolanaProgramId();
const SOLANA_HEALTHCHECK_INTERVAL_MS = readEnvNumber(
  "SOLANA_HEALTHCHECK_INTERVAL_MS",
  60_000,
  5_000,
);
const MM_ENABLE_BSC = readEnvBoolean("MM_ENABLE_BSC", true);
const MM_ENABLE_BASE = readEnvBoolean("MM_ENABLE_BASE", true);
const MM_ENABLE_SOLANA = readEnvBoolean("MM_ENABLE_SOLANA", true);
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
const TOXICITY_THRESHOLD_BPS = 1000;
const CANCEL_STALE_AGE_MS = readEnvNumber("CANCEL_STALE_AGE_MS", 30_000, 5000);
const KILL_SWITCH_FILE = path.resolve(
  import.meta.dirname ?? ".",
  "../.kill-switch",
);

// Heartbeat configuration
const MM_HEARTBEAT_CYCLES = readEnvNumber("MM_HEARTBEAT_CYCLES", 5, 1, 100);
const MM_HEARTBEAT_FILE = path.resolve(
  process.cwd(),
  process.env.MM_HEARTBEAT_FILE || ".runtime-locks/mm-health.json",
);
const MM_TELEMETRY_ENABLED = readEnvBoolean("MM_TELEMETRY_ENABLED", true);

// ─── Solana key decoding ──────────────────────────────────────────────────────
const decodeSolanaSecretKey = (raw: string): Uint8Array => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new Error("missing key material");

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
  private runMode: RunMode;
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
  private killSwitchLatched = false;

  // Telemetry & Health
  private startedAt = Date.now();
  private ordersPlaced = 0;
  private ordersSkipped = 0;
  private lastHealthWriteAt = 0;
  private recentErrors: string[] = [];
  private lastCycleTelemetry: CycleTelemetry | null = null;

  constructor() {
    this.instanceId = (process.env.MM_INSTANCE_ID || "mm-1").trim() || "mm-1";
    this.runMode = resolveRunMode();
    this.aggressivenessTier = resolveAggressivenessTier();
    this.aggressivenessParams = getAggressivenessParams(
      this.aggressivenessTier,
    );

    // EVM Setup
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

    // Solana Setup
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
          `[${label.toUpperCase()}] Skipping token readiness: clob.goldToken() unavailable.`,
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
          `[${label.toUpperCase()}] Disabled: zero GOLD balance for ${walletAddress}.`,
        );
        return;
      }

      let allowance = initialAllowance;
      if (allowance <= 0n) {
        if (this.runMode === "dry-run") {
          console.log(
            `[${label.toUpperCase()}] DRY-RUN: Would approve GOLD spend.`,
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
          console.log(`[${label.toUpperCase()}] Approved GOLD spend for CLOB.`);
        }
      }

      setChainToken(label, token);
      setChainTokenDecimals(label, Number.isFinite(decimals) ? decimals : 18);
      console.log(
        `[${label.toUpperCase()}] GOLD balance=${balance.toString()} allowance=${allowance.toString()} decimals=${decimals}.`,
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
            `[${label.toUpperCase()}] Disabled: no contract at ${clob.target as string}.`,
          );
          return;
        }
        await clob.nextMatchId();
        await ensureSettlementTokenReady(label, clob);
        if (
          (label === "bsc" && !this.bscEnabled) ||
          (label === "base" && !this.baseEnabled)
        )
          return;
        console.log(
          `[${label.toUpperCase()}] Ready on chain ${network.chainId.toString()}.`,
        );
      } catch (error: any) {
        setChainEnabled(label, false);
        console.warn(`[${label.toUpperCase()}] Disabled: ${error.message}`);
      }
    };

    if (this.bscEnabled) {
      await validateEvm("bsc", this.bscProvider, this.bscClob);
    } else {
      console.log("[BSC] Disabled via MM_ENABLE_BSC=false.");
    }

    if (this.baseEnabled) {
      await validateEvm("base", this.baseProvider, this.baseClob);
    } else {
      console.log("[BASE] Disabled via MM_ENABLE_BASE=false.");
    }

    if (!this.solanaEnabled) {
      console.log("[SOLANA] Disabled via MM_ENABLE_SOLANA=false.");
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
          `[SOLANA] Disabled: program ${this.solanaProgramId.toBase58()} not executable.`,
        );
        return;
      }
      console.log(
        `[SOLANA] Ready on RPC ${this.solanaConnection.rpcEndpoint} (core ${version["solana-core"] ?? "unknown"})`,
      );
    } catch (error: any) {
      this.solanaEnabled = false;
      console.warn(`[SOLANA] Disabled: ${error.message}`);
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
      this.emitTelemetry(
        "throttle",
        null,
        null,
        0,
        0,
        0,
        0,
        "participation_throttle",
      );
      return;
    }

    // 0. Check kill-switch sentinel file
    this.checkKillSwitchFile();

    // 1. Cancel stale orders (anti-snipe)
    await this.cancelStaleOrders();

    // 2. EVM market making
    if (this.bscEnabled) await this.evmMarketMake("bsc", this.bscClob);
    if (this.baseEnabled) await this.evmMarketMake("base", this.baseClob);

    // 3. Solana market making (ACTIVE, not health-check-only)
    if (this.solanaEnabled) await this.solanaMarketMake();

    // 4. Write heartbeat JSON every N cycles
    if (this.cycleCount % MM_HEARTBEAT_CYCLES === 0) {
      await this.writeHealthStatus();
    }

    // 5. Log state periodically
    if (this.cycleCount % 10 === 0) {
      const duelInfo = this.lastDuelSignal
        ? ` | Duel: ${this.lastDuelSignal.phase} mid=${this.lastDuelSignal.midPrice} conf=${this.lastDuelSignal.confidence.toFixed(2)}`
        : "";
      console.log(
        `[${new Date().toISOString()}] Cycle #${this.cycleCount} | Mode: ${this.runMode} | Tier: ${this.aggressivenessTier} | Inv YES:${this.inventoryYes} NO:${this.inventoryNo} | Orders: ${this.activeOrders.length} | Placed: ${this.ordersPlaced} | Skipped: ${this.ordersSkipped}${duelInfo}`,
      );
    }
  }

  // ─── Telemetry Emitter ──────────────────────────────────────────────────────
  private emitTelemetry(
    chain: string,
    midBook: number | null,
    midDuel: number | null,
    midFinal: number,
    spreadBps: number,
    bidPrice: number,
    askPrice: number,
    reasonSkipped: string | null,
    size: number = 0,
    fills: number = 0,
  ) {
    if (!MM_TELEMETRY_ENABLED) return;

    const telemetry: CycleTelemetry = {
      cycle: this.cycleCount,
      timestamp: new Date().toISOString(),
      chain,
      mid_book: midBook,
      mid_duel: midDuel,
      mid_final: midFinal,
      spread_bps: spreadBps,
      bid_price: bidPrice,
      ask_price: askPrice,
      size,
      fills,
      reason_skipped: reasonSkipped,
      duel_phase: this.lastDuelSignal?.phase ?? null,
      duel_confidence: this.lastDuelSignal?.confidence ?? null,
      inventory_yes: this.inventoryYes,
      inventory_no: this.inventoryNo,
    };

    this.lastCycleTelemetry = telemetry;

    // Log telemetry at debug level (every 5 cycles or on skip)
    if (this.cycleCount % 5 === 0 || reasonSkipped) {
      console.log(
        `[TELEMETRY:${chain}] mid_book=${midBook ?? "N/A"} mid_duel=${midDuel ?? "N/A"} mid_final=${midFinal} spread=${spreadBps}bps size=${size}${reasonSkipped ? ` SKIP:${reasonSkipped}` : ""}`,
      );
    }
  }

  // ─── Health Status Writer ───────────────────────────────────────────────────
  private async writeHealthStatus() {
    const now = Date.now();

    // Rate limit: no more than once per second
    if (now - this.lastHealthWriteAt < 1000) return;
    this.lastHealthWriteAt = now;

    const activeChains: string[] = [];
    if (this.bscEnabled) activeChains.push("bsc");
    if (this.baseEnabled) activeChains.push("base");
    if (this.solanaEnabled) activeChains.push("solana");

    const status: MMHealthStatus = {
      instanceId: this.instanceId,
      status: this.recentErrors.length > 3 ? "degraded" : "healthy",
      lastCycle: this.cycleCount,
      lastCycleAt: new Date().toISOString(),
      uptimeMs: now - this.startedAt,
      cyclesTotal: this.cycleCount,
      ordersPlaced: this.ordersPlaced,
      ordersSkipped: this.ordersSkipped,
      activeChains,
      duelSignalActive: MM_ENABLE_DUEL_SIGNAL && this.lastDuelSignal !== null,
      lastDuelPhase: this.lastDuelSignal?.phase ?? null,
      lastMidFinal: this.lastCycleTelemetry?.mid_final ?? 500,
      inventoryYes: this.inventoryYes,
      inventoryNo: this.inventoryNo,
      errors: this.recentErrors.slice(-5),
    };

    try {
      // Ensure directory exists
      const dir = path.dirname(MM_HEARTBEAT_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(MM_HEARTBEAT_FILE, JSON.stringify(status, null, 2));
    } catch (e: any) {
      console.warn(
        `[HEALTH] Failed to write ${MM_HEARTBEAT_FILE}: ${e.message}`,
      );
    }
  }

  private recordError(message: string) {
    this.recentErrors.push(`[${new Date().toISOString()}] ${message}`);
    if (this.recentErrors.length > 20) {
      this.recentErrors = this.recentErrors.slice(-10);
    }
  }

  private checkKillSwitchFile() {
    if (!fs.existsSync(KILL_SWITCH_FILE)) {
      this.killSwitchLatched = false;
      return;
    }

    if (!this.killSwitchLatched) {
      let reason = "manual sentinel trigger";
      try {
        const raw = fs.readFileSync(KILL_SWITCH_FILE, "utf-8").trim();
        if (raw) {
          const parsed = JSON.parse(raw) as { reason?: string };
          if (typeof parsed.reason === "string" && parsed.reason.trim()) {
            reason = parsed.reason.trim();
          }
        }
      } catch {
        // keep default reason for malformed payloads
      }

      console.error(
        `[RISK] Kill-switch active via ${KILL_SWITCH_FILE} (${reason}).`,
      );
      this.killSwitchLatched = true;
    }

    this.bscEnabled = false;
    this.baseEnabled = false;
    this.solanaEnabled = false;
    throw new Error("Kill-switch active");
  }

  // ─── EVM Market Making ──────────────────────────────────────────────────────
  async evmMarketMake(chain: "bsc" | "base", clob: ethers.Contract) {
    let midBook: number | null = null;
    let midDuel: number | null = null;
    let midFinal = 500;
    let spreadBps = 0;
    let bidPrice = 0;
    let askPrice = 0;

    try {
      const nextMatchId = await clob.nextMatchId();
      if (nextMatchId <= 1n) {
        this.emitTelemetry(chain, null, null, 500, 0, 0, 0, "no_active_match");
        return;
      }
      const activeMatchId = nextMatchId - 1n;

      const matchInfo = await clob.matches(activeMatchId);
      if (matchInfo.status !== 1n) {
        this.emitTelemetry(chain, null, null, 500, 0, 0, 0, "match_not_active");
        return;
      }

      const bestBid = Number(await clob.bestBids(activeMatchId));
      const bestAsk = Number(await clob.bestAsks(activeMatchId));

      const hasBookMid =
        Number.isFinite(bestBid) &&
        Number.isFinite(bestAsk) &&
        bestBid > 0 &&
        bestAsk > 0 &&
        bestAsk >= bestBid &&
        bestAsk < 1000;
      const bookMid = hasBookMid ? (bestBid + bestAsk) / 2 : NaN;
      midBook = hasBookMid ? Math.round(bookMid) : null;
      const spread = hasBookMid ? bestAsk - bestBid : 0;
      spreadBps =
        hasBookMid && bookMid > 0 ? (spread * 10000) / bookMid : 10000;

      // ─── DUEL-STATE-WEIGHTED FAIR VALUE (Critical Fix) ─────────────────────
      // Instead of defaulting to static 500 (0.5), we compute fair value from:
      // 1. Book mid (if available)
      // 2. Duel signal mid (HP-weighted probability)
      // The final mid is a weighted blend that MOVES with HP changes.
      const duelSignal = await this.getDuelSignal();
      midDuel = duelSignal?.midPrice ?? null;

      // Base mid from book or duel signal (not static 500)
      let mid: number;
      if (Number.isFinite(bookMid)) {
        mid = bookMid;
      } else if (duelSignal && duelSignal.midPrice !== 500) {
        // If no book but duel signal has moved from neutral, use it directly
        mid = duelSignal.midPrice;
      } else {
        // Fallback to 500 only when we have no information
        mid = 500;
      }

      // Blend with duel signal based on confidence
      if (duelSignal && duelSignal.weight > 0) {
        // Weight increases when book is absent or duel confidence is high
        const bookAbsent = !Number.isFinite(bookMid);
        const effectiveWeight = bookAbsent
          ? Math.min(1, duelSignal.weight + 0.2) // Higher weight when no book
          : duelSignal.weight * duelSignal.confidence; // Scale by confidence

        // Blend towards duel signal
        mid = clamp(
          Math.round(
            mid * (1 - effectiveWeight) + duelSignal.midPrice * effectiveWeight,
          ),
          1,
          999,
        );

        if (this.cycleCount % 12 === 0) {
          console.log(
            `[${chain.toUpperCase()}] duel signal phase=${duelSignal.phase} fairValue=${duelSignal.midPrice} conf=${duelSignal.confidence.toFixed(2)} weight=${effectiveWeight.toFixed(2)} → quoteMid=${mid}`,
          );
        }
      }

      midFinal = Math.round(mid);

      // Dynamic spread from aggressiveness + duel confidence
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

      // Inventory skew
      const skewOffset = computeInventorySkew(
        this.inventoryYes,
        this.inventoryNo,
        MAX_INVENTORY_CAP,
        this.aggressivenessParams.inventorySkewFactor,
        quoteWidth,
      );
      const skewedMid = clamp(Math.round(mid + skewOffset), 1, 999);

      bidPrice = Math.max(1, Math.floor(skewedMid - quoteWidth / 2));
      askPrice = Math.min(999, Math.ceil(skewedMid + quoteWidth / 2));

      // ─── NON-ZERO ORDER SIZING (Critical Guard) ────────────────────────────
      const rawOrderSize = this.computeOrderSize();
      const sizeValidation = validateOrderSize(
        rawOrderSize,
        ORDER_SIZE_MIN,
        ORDER_SIZE_MAX,
        MAX_INVENTORY_CAP - Math.max(this.inventoryYes, this.inventoryNo),
      );

      if (!sizeValidation.valid) {
        this.ordersSkipped++;
        this.emitTelemetry(
          chain,
          midBook,
          midDuel,
          midFinal,
          spreadBps,
          bidPrice,
          askPrice,
          `size_invalid:${sizeValidation.reason}`,
        );
        console.warn(
          `[${chain.toUpperCase()}] Skipping: ${sizeValidation.reason}`,
        );
        return;
      }

      const orderSize = sizeValidation.size;

      // Double-check: NEVER submit zero or negative size
      if (orderSize <= 0) {
        this.ordersSkipped++;
        this.recordError(`Zero size after validation: raw=${rawOrderSize}`);
        this.emitTelemetry(
          chain,
          midBook,
          midDuel,
          midFinal,
          spreadBps,
          bidPrice,
          askPrice,
          `zero_size_guard:${rawOrderSize}`,
        );
        return;
      }

      const maxPerSide = this.aggressivenessParams.maxOrdersPerSide;
      const existingBuys = this.activeOrders.filter(
        (o) => o.chain === `evm-${chain}` && o.isBuy,
      ).length;
      const existingSells = this.activeOrders.filter(
        (o) => o.chain === `evm-${chain}` && !o.isBuy,
      ).length;

      let placedCount = 0;

      if (this.inventoryYes < MAX_INVENTORY_CAP && existingBuys < maxPerSide) {
        const placed = await this.placeEvmOrder(
          chain,
          clob,
          Number(activeMatchId),
          true,
          bidPrice,
          orderSize,
        );
        if (placed) placedCount++;
      }

      if (this.inventoryNo < MAX_INVENTORY_CAP && existingSells < maxPerSide) {
        const placed = await this.placeEvmOrder(
          chain,
          clob,
          Number(activeMatchId),
          false,
          askPrice,
          orderSize,
        );
        if (placed) placedCount++;
      }

      // Emit success telemetry
      this.emitTelemetry(
        chain,
        midBook,
        midDuel,
        midFinal,
        spreadBps,
        bidPrice,
        askPrice,
        null,
        orderSize,
        placedCount,
      );

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
      this.recordError(`${chain}: ${e.message}`);
      this.emitTelemetry(
        chain,
        midBook,
        midDuel,
        midFinal,
        spreadBps,
        bidPrice,
        askPrice,
        `error:${e.message.slice(0, 50)}`,
      );
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
    const remainingCapacity = takeBuy
      ? MAX_INVENTORY_CAP - this.inventoryYes
      : MAX_INVENTORY_CAP - this.inventoryNo;

    // ─── CRITICAL: Non-zero taker size validation ────────────────────────────
    const rawTakerSize = Math.floor(this.computeOrderSize() / 2);
    const clampedRaw = Math.max(
      MM_TAKER_SIZE_MIN,
      Math.min(MM_TAKER_SIZE_MAX, rawTakerSize),
    );

    const sizeValidation = validateOrderSize(
      clampedRaw,
      MM_TAKER_SIZE_MIN,
      MM_TAKER_SIZE_MAX,
      remainingCapacity,
    );

    if (!sizeValidation.valid) {
      console.warn(
        `[${chain.toUpperCase()}] Taker order skipped: ${sizeValidation.reason}`,
      );
      this.ordersSkipped++;
      return;
    }

    const takerSize = sizeValidation.size;

    // FINAL GUARD
    if (takerSize <= 0) {
      console.error(
        `[${chain.toUpperCase()}] CRITICAL: Zero taker size! raw=${rawTakerSize}`,
      );
      this.recordError(`Zero taker size: ${rawTakerSize}`);
      this.ordersSkipped++;
      return;
    }

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
  ): Promise<boolean> {
    try {
      const remainingCapacity = isBuy
        ? MAX_INVENTORY_CAP - this.inventoryYes
        : MAX_INVENTORY_CAP - this.inventoryNo;

      // ─── CRITICAL: Non-zero order size validation ──────────────────────────
      const sizeValidation = validateOrderSize(
        amount,
        ORDER_SIZE_MIN,
        ORDER_SIZE_MAX,
        remainingCapacity,
      );

      if (!sizeValidation.valid) {
        console.warn(
          `[${chain.toUpperCase()}] ${intent} order rejected: ${sizeValidation.reason}`,
        );
        this.ordersSkipped++;
        return false;
      }

      const cappedAmount = sizeValidation.size;

      // FINAL GUARD: Absolutely refuse to place zero or negative orders
      if (cappedAmount <= 0) {
        console.error(
          `[${chain.toUpperCase()}] CRITICAL: Zero size slipped through! raw=${amount} capped=${cappedAmount}`,
        );
        this.recordError(
          `Zero size order prevented: ${amount} → ${cappedAmount}`,
        );
        this.ordersSkipped++;
        return false;
      }

      const tokenDecimals =
        chain === "bsc"
          ? this.bscGoldTokenDecimals
          : this.baseGoldTokenDecimals;
      const onChainAmount = toTokenUnits(cappedAmount, tokenDecimals);

      // FINAL GUARD: Also check on-chain representation
      if (onChainAmount <= 0n) {
        console.error(
          `[${chain.toUpperCase()}] CRITICAL: On-chain size is zero! amount=${cappedAmount} decimals=${tokenDecimals}`,
        );
        this.recordError(
          `On-chain zero: ${cappedAmount} @ ${tokenDecimals} decimals`,
        );
        this.ordersSkipped++;
        return false;
      }

      // Run mode gating
      if (this.runMode === "dry-run") {
        console.log(
          `[${chain.toUpperCase()}] DRY-RUN: Would ${isBuy ? "BID" : "ASK"} @ ${price} x${cappedAmount} (${intent})`,
        );
        this.ordersPlaced++;
        return true;
      }

      if (this.runMode === "paper") {
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
        this.ordersPlaced++;
        console.log(
          `[${chain.toUpperCase()}] PAPER: ${intent === "taker" ? (isBuy ? "TAKER-BUY" : "TAKER-SELL") : isBuy ? "BID" : "ASK"} @ ${price} x${cappedAmount} (orderId: ${fakeOrderId})`,
        );
        return true;
      }

      // LIVE mode
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
      this.ordersPlaced++;

      console.log(
        `[${chain.toUpperCase()}] ✓ ${intent === "taker" ? (isBuy ? "TAKER-BUY" : "TAKER-SELL") : isBuy ? "BID" : "ASK"} @ ${price} x${cappedAmount} (${onChainAmount.toString()} raw) (orderId: ${orderId})`,
      );
      return true;
    } catch (e: any) {
      if (this.isRetryableNonceError(e)) {
        console.warn(
          `[${chain.toUpperCase()}] Nonce race; will retry next cycle.`,
        );
        return false;
      }
      this.recordError(`${chain} order: ${e.message}`);
      console.error(`[${chain.toUpperCase()}] Order failed:`, e.message);
      return false;
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

  // ─── Solana Market Making (ACTIVE) ──────────────────────────────────────────
  async solanaMarketMake() {
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
            `[SOLANA] Disabled: program ${this.solanaProgramId.toBase58()} not executable.`,
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

    // Compute quotes using same fair-value engine as EVM
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
        // LIVE: Anchor instruction dispatch goes here when Agent A/B deliver IDL
        console.log(
          `[SOLANA] READY: BID@${bidPrice} ASK@${askPrice} x${orderSize} (mid=${mid}) – awaiting Anchor wire-up`,
        );
      }
    }
  }

  // ─── Cancel Stale Orders ───────────────────────────────────────────────────
  async cancelStaleOrders() {
    const now = Date.now();
    const stale = this.activeOrders.filter(
      (o) => now - o.placedAt > CANCEL_STALE_AGE_MS,
    );

    for (const order of stale) {
      try {
        if (order.chain.startsWith("evm-")) {
          if (this.runMode === "live") {
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
            `[${order.chain.toUpperCase()}] ✗ Cancelled stale #${order.orderId}${this.runMode !== "live" ? ` (${this.runMode})` : ""}`,
          );
        } else {
          console.log(`[SOLANA] ✗ Cancelled stale #${order.orderId}`);
        }

        if (order.isBuy) this.inventoryYes -= order.amount;
        else this.inventoryNo -= order.amount;
      } catch (e: any) {
        console.warn(`[CANCEL] Failed #${order.orderId}:`, e.message);
      }
    }

    this.activeOrders = this.activeOrders.filter(
      (o) => now - o.placedAt <= CANCEL_STALE_AGE_MS,
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  private computeOrderSize(): number {
    // Base size from min-max range, scaled by aggressiveness
    const range = ORDER_SIZE_MAX - ORDER_SIZE_MIN;
    const base = ORDER_SIZE_MIN + Math.floor(Math.random() * range);
    const scaledBase = Math.floor(
      base * this.aggressivenessParams.sizeMultiplier,
    );

    // Reduce size when inventory is imbalanced
    const imbalance = this.inventoryYes - this.inventoryNo;
    const imbalanceRatio = Math.abs(imbalance) / MAX_INVENTORY_CAP;
    const skewFactor = imbalanceRatio > 0.5 ? 0.5 : 1.0 - imbalanceRatio * 0.3;

    const finalSize = Math.floor(scaledBase * skewFactor);

    // CRITICAL: Always return at least ORDER_SIZE_MIN (never zero)
    return Math.max(ORDER_SIZE_MIN, finalSize);
  }

  private async getDuelSignal(): Promise<DuelSignal | null> {
    if (!MM_ENABLE_DUEL_SIGNAL || !MM_DUEL_STATE_API_URL) return null;

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

  // ─── Public Getters ─────────────────────────────────────────────────────────
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
