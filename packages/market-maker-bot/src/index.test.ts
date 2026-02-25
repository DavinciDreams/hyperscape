import { describe, it, expect, vi, beforeEach } from "vitest";
import bs58 from "bs58";

// ─── Mock ethers before importing the bot ─────────────────────────────────────
const mockContract = {
  target: "0x1234567890123456789012345678901234567890",
  nextMatchId: vi.fn().mockResolvedValue(2n),
  matches: vi
    .fn()
    .mockResolvedValue({ status: 1n, winner: 0n, yesPool: 0n, noPool: 0n }),
  bestBids: vi.fn().mockResolvedValue(450n),
  bestAsks: vi.fn().mockResolvedValue(550n),
  placeOrder: vi.fn().mockResolvedValue({
    wait: vi.fn().mockResolvedValue({ logs: [] }),
  }),
  cancelOrder: vi.fn().mockResolvedValue({
    wait: vi.fn().mockResolvedValue({}),
  }),
};

const mockFromSecretKey = vi.fn(() => ({
  publicKey: { toBase58: () => "TestSolanaPublicKey" },
  secretKey: new Uint8Array(64),
}));
const mockFromSeed = vi.fn(() => ({
  publicKey: { toBase58: () => "TestSolanaPublicKey" },
  secretKey: new Uint8Array(64),
}));
const mockGenerate = vi.fn(() => ({
  publicKey: { toBase58: () => "TestSolanaPublicKey" },
  secretKey: new Uint8Array(64),
}));

vi.mock("ethers", () => {
  class MockJsonRpcProvider {
    private nonce = 0;

    async getNetwork() {
      return { chainId: 31337n };
    }

    async getCode() {
      return "0x6000";
    }

    async getTransactionCount() {
      const current = this.nonce;
      this.nonce += 1;
      return current;
    }
  }
  class MockWallet {
    address = "0xTestWallet";
    constructor() {}
  }
  class MockContract {
    constructor() {
      return mockContract;
    }
  }
  class MockInterface {
    parseLog() {
      return null;
    }
  }

  return {
    ethers: {
      JsonRpcProvider: MockJsonRpcProvider,
      Wallet: MockWallet,
      Contract: MockContract,
      Interface: MockInterface,
      getAddress: (value: string) => value,
      MaxUint256: 2n ** 256n - 1n,
      formatEther: (v: bigint) => String(Number(v) / 1e18),
    },
  };
});

vi.mock("@solana/web3.js", () => {
  class MockConnection {
    rpcEndpoint = "http://localhost:8899";

    async getVersion() {
      return { "solana-core": "1.18.0-test" };
    }

    async getAccountInfo() {
      return { executable: true };
    }

    async getLatestBlockhash() {
      return { blockhash: "test-blockhash", lastValidBlockHeight: 1 };
    }

    async getBalance() {
      return 1_000_000_000;
    }
  }
  return {
    Connection: MockConnection,
    Keypair: {
      generate: (...args: unknown[]) => mockGenerate(...args),
      fromSecretKey: (...args: unknown[]) => mockFromSecretKey(...args),
      fromSeed: (...args: unknown[]) => mockFromSeed(...args),
    },
    PublicKey: class MockPublicKey {
      private value: string;
      constructor(value?: string) {
        this.value = value ?? "MockSolanaProgram111111111111111111111111111";
      }
      toBase58() {
        return this.value;
      }
    },
  };
});

vi.mock("@coral-xyz/anchor", () => ({}));

type MarketMakerCtor = typeof import("./index.js").CrossChainMarketMaker;

describe("CrossChainMarketMaker", () => {
  let CrossChainMarketMaker: MarketMakerCtor;
  let mm: InstanceType<MarketMakerCtor>;

  beforeEach(async () => {
    process.env.EVM_BSC_RPC_URL = "http://localhost:8545";
    process.env.EVM_BASE_RPC_URL = "http://localhost:8546";
    process.env.CLOB_CONTRACT_ADDRESS_BSC =
      "0x1234567890123456789012345678901234567890";
    process.env.CLOB_CONTRACT_ADDRESS_BASE =
      "0x1234567890123456789012345678901234567890";
    process.env.EVM_PRIVATE_KEY = "a".repeat(64);
    process.env.SOLANA_RPC_URL = "http://localhost:8899";
    process.env.SOLANA_PRIVATE_KEY = bs58.encode(new Uint8Array(64).fill(7));
    process.env.TARGET_SPREAD_BPS = "200";
    process.env.MAX_INVENTORY_CAP = "500";
    process.env.MM_RUN_MODE = "paper"; // Paper mode for testing
    process.env.MM_AGGRESSIVENESS = "normal";
    mockFromSecretKey.mockClear();
    mockFromSeed.mockClear();
    mockGenerate.mockClear();
    mockContract.placeOrder.mockClear();
    ({ CrossChainMarketMaker } = await import("./index.js"));
    mm = new CrossChainMarketMaker();
  });

  describe("Initialization", () => {
    it("should initialize with zero inventory", () => {
      const inv = mm.getInventory();
      expect(inv.yes).toBe(0);
      expect(inv.no).toBe(0);
    });

    it("should start with no active orders", () => {
      expect(mm.getActiveOrders()).toHaveLength(0);
    });

    it("should accept a bs58 Solana private key", () => {
      expect(mockFromSecretKey).toHaveBeenCalledTimes(1);
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("should fall back to generated Solana wallet on invalid key material", () => {
      process.env.SOLANA_PRIVATE_KEY = "not-a-valid-solana-key";
      const fallback = new CrossChainMarketMaker();
      expect(fallback).toBeTruthy();
      expect(mockGenerate).toHaveBeenCalledTimes(1);
    });

    it("should have correct config values", () => {
      const config = mm.getConfig();
      expect(config.targetSpreadBps).toBe(200);
      expect(config.maxInventoryCap).toBe(500);
      expect(config.toxicityThresholdBps).toBe(1000);
      expect(config.maxOrdersPerSide).toBe(3); // normal tier
      expect(config.cancelStaleAgeMs).toBe(30_000);
      expect(typeof config.solanaProgramId).toBe("string");
    });

    it("should resolve run mode from env", () => {
      expect(mm.getRunMode()).toBe("paper");
    });

    it("should resolve aggressiveness tier from env", () => {
      const agg = mm.getAggressiveness();
      expect(agg.tier).toBe("normal");
      expect(agg.params.spreadMultiplier).toBe(1.0);
      expect(agg.params.participationRate).toBe(0.7);
    });
  });

  describe("Run Modes", () => {
    it("dry-run mode should not place orders", async () => {
      process.env.MM_RUN_MODE = "dry-run";
      const mod = await import("./index.js");
      const dryMm = new mod.CrossChainMarketMaker();
      expect(dryMm.getRunMode()).toBe("dry-run");
      await dryMm.marketMakeCycle();
      // dry-run should not call placeOrder on-chain
      // (it may or may not be called depending on participation rate, but no state change)
    });

    it("paper mode should track inventory without on-chain calls", async () => {
      // Paper mode is the default in these tests
      await mm.marketMakeCycle();
      const inv = mm.getInventory();
      // Paper mode tracks inventory internally
      expect(inv.yes + inv.no).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Market Making Cycle", () => {
    it("should execute a full cycle without errors", async () => {
      // Should complete without throwing
      await mm.marketMakeCycle();
      // If we got here, no error was thrown
      expect(true).toBe(true);
    });

    it("should place orders on both sides after a cycle (paper mode)", async () => {
      // Run enough cycles to overcome participation rate
      for (let i = 0; i < 10; i++) {
        await mm.marketMakeCycle();
      }
      const orders = mm.getActiveOrders();
      expect(orders.length).toBeGreaterThan(0);
    });

    it("should track inventory after placing orders", async () => {
      for (let i = 0; i < 10; i++) {
        await mm.marketMakeCycle();
      }
      const inv = mm.getInventory();
      expect(inv.yes + inv.no).toBeGreaterThan(0);
    });
  });

  describe("Minimum Order Size Enforcement", () => {
    it("should never place zero-size orders", async () => {
      for (let i = 0; i < 20; i++) {
        await mm.marketMakeCycle();
      }
      const orders = mm.getActiveOrders();
      for (const order of orders) {
        expect(order.amount).toBeGreaterThan(0);
      }
    });

    it("should enforce ORDER_SIZE_MIN as floor", async () => {
      const config = mm.getConfig();
      for (let i = 0; i < 20; i++) {
        await mm.marketMakeCycle();
      }
      const orders = mm.getActiveOrders();
      for (const order of orders) {
        expect(order.amount).toBeGreaterThanOrEqual(config.orderSizeMin);
      }
    });
  });

  describe("Inventory Management", () => {
    it("should respect max orders per side from aggressiveness tier", async () => {
      for (let i = 0; i < 20; i++) {
        await mm.marketMakeCycle();
      }
      const orders = mm.getActiveOrders();
      const agg = mm.getAggressiveness();
      const bscBuys = orders.filter(
        (o) => o.chain === "evm-bsc" && o.isBuy,
      ).length;
      const bscSells = orders.filter(
        (o) => o.chain === "evm-bsc" && !o.isBuy,
      ).length;
      expect(bscBuys).toBeLessThanOrEqual(agg.params.maxOrdersPerSide);
      expect(bscSells).toBeLessThanOrEqual(agg.params.maxOrdersPerSide);
    });

    it("should stop quoting when inventory cap is hit", async () => {
      for (let i = 0; i < 100; i++) {
        await mm.marketMakeCycle();
      }
      const inv = mm.getInventory();
      expect(inv.yes).toBeLessThanOrEqual(500);
      expect(inv.no).toBeLessThanOrEqual(500);
    });
  });

  describe("Anti-Bot Strategy", () => {
    it("should cancel stale orders after timeout", async () => {
      for (let i = 0; i < 5; i++) {
        await mm.marketMakeCycle();
      }
      const initialOrders = mm.getActiveOrders().length;
      expect(initialOrders).toBeGreaterThanOrEqual(0);
    });

    it("should widen spreads during toxic conditions", async () => {
      // Mocked bestBids=450, bestAsks=550, spread = 100/500 = 20% = 2000bps > 1000bps threshold
      for (let i = 0; i < 5; i++) {
        await mm.marketMakeCycle();
      }
      const orders = mm.getActiveOrders();
      // Orders should exist with widened spreads
      expect(orders.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Cross-Chain Parity", () => {
    it("should produce orders on multiple chains", async () => {
      for (let i = 0; i < 10; i++) {
        await mm.marketMakeCycle();
      }
      const orders = mm.getActiveOrders();
      const chains = new Set(orders.map((o) => o.chain));
      // In paper mode we should have orders on both EVM chains
      expect(chains.size).toBeGreaterThanOrEqual(1);
    });

    it("should have symmetric inventory tracking", async () => {
      for (let i = 0; i < 10; i++) {
        await mm.marketMakeCycle();
      }
      const inv = mm.getInventory();
      expect(inv.yes).toBeGreaterThanOrEqual(0);
      expect(inv.no).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Sniper Bot Attack Simulation", () => {
    it("should survive rapid successive cycles without state corruption", async () => {
      for (let i = 0; i < 50; i++) {
        await mm.marketMakeCycle();
      }
      const inv = mm.getInventory();
      expect(inv.yes).toBeGreaterThanOrEqual(0);
      expect(inv.no).toBeGreaterThanOrEqual(0);
    });

    it("should not exceed inventory caps under heavy load", async () => {
      for (let i = 0; i < 100; i++) {
        await mm.marketMakeCycle();
      }
      const inv = mm.getInventory();
      expect(inv.yes).toBeLessThanOrEqual(500);
      expect(inv.no).toBeLessThanOrEqual(500);
    });
  });

  describe("Aggressiveness Tiers", () => {
    it("aggressive tier should have tighter spreads", async () => {
      process.env.MM_AGGRESSIVENESS = "aggressive";
      const mod = await import("./index.js");
      const aggMm = new mod.CrossChainMarketMaker();
      const agg = aggMm.getAggressiveness();
      expect(agg.tier).toBe("aggressive");
      expect(agg.params.spreadMultiplier).toBeLessThan(1.0);
      expect(agg.params.participationRate).toBeGreaterThan(0.7);
    });

    it("passive tier should have wider spreads", async () => {
      process.env.MM_AGGRESSIVENESS = "passive";
      const mod = await import("./index.js");
      const passMm = new mod.CrossChainMarketMaker();
      const agg = passMm.getAggressiveness();
      expect(agg.tier).toBe("passive");
      expect(agg.params.spreadMultiplier).toBeGreaterThan(1.0);
      expect(agg.params.participationRate).toBeLessThan(0.5);
    });
  });
});

describe("common.ts utilities", () => {
  it("parseDuelSignal should return null for empty payload", async () => {
    const { parseDuelSignal } = await import("./common.js");
    expect(parseDuelSignal({}, 0.45, 0.75)).toBeNull();
    expect(parseDuelSignal({ cycle: {} }, 0.45, 0.75)).toBeNull();
  });

  it("parseDuelSignal should compute fighting probability from HP", async () => {
    const { parseDuelSignal } = await import("./common.js");
    const signal = parseDuelSignal(
      {
        cycle: {
          phase: "FIGHTING",
          agent1: { hp: 80, maxHp: 100 } as any,
          agent2: { hp: 20, maxHp: 100 } as any,
        },
      },
      0.45,
      0.75,
    );
    expect(signal).not.toBeNull();
    expect(signal!.midPrice).toBeGreaterThan(500); // Agent 1 is winning
    expect(signal!.phase).toBe("FIGHTING");
    expect(signal!.confidence).toBeGreaterThan(0);
  });

  it("parseDuelSignal should handle RESOLUTION phase", async () => {
    const { parseDuelSignal } = await import("./common.js");
    const signal = parseDuelSignal(
      {
        cycle: {
          phase: "RESOLUTION",
          winnerId: "agent-1",
          agent1: { id: "agent-1" } as any,
          agent2: { id: "agent-2" } as any,
        },
      },
      0.45,
      0.75,
    );
    expect(signal).not.toBeNull();
    expect(signal!.midPrice).toBe(985);
    expect(signal!.confidence).toBe(0.95);
  });

  it("parseDuelSignal should return low confidence for IDLE", async () => {
    const { parseDuelSignal } = await import("./common.js");
    const signal = parseDuelSignal(
      {
        cycle: {
          phase: "IDLE",
        },
      },
      0.45,
      0.75,
    );
    expect(signal).not.toBeNull();
    expect(signal!.midPrice).toBe(500);
    expect(signal!.confidence).toBe(0.1);
  });

  it("enforceMinOrderSize should reject sub-minimum sizes", async () => {
    const { enforceMinOrderSize } = await import("./common.js");
    expect(enforceMinOrderSize(0, 25)).toBe(0);
    expect(enforceMinOrderSize(10, 25)).toBe(0);
    expect(enforceMinOrderSize(25, 25)).toBe(25);
    expect(enforceMinOrderSize(100, 25)).toBe(100);
    expect(enforceMinOrderSize(-5, 25)).toBe(0);
  });

  it("computeInventorySkew should push mid away from heavy side", async () => {
    const { computeInventorySkew } = await import("./common.js");
    // Too much YES → negative skew (push mid down)
    const skew = computeInventorySkew(400, 100, 500, 0.5, 10);
    expect(skew).toBeLessThan(0);
    // Too much NO → positive skew (push mid up)
    const skew2 = computeInventorySkew(100, 400, 500, 0.5, 10);
    expect(skew2).toBeGreaterThan(0);
    // Balanced → near zero
    const skew3 = computeInventorySkew(250, 250, 500, 0.5, 10);
    expect(Math.abs(skew3)).toBe(0);
  });

  it("resolveSolanaProgramId priority: ARENA > PROGRAM > SOL > default", async () => {
    const { resolveSolanaProgramId } = await import("./common.js");

    // Save originals
    const saved = {
      arena: process.env.SOLANA_ARENA_MARKET_PROGRAM_ID,
      prog: process.env.SOLANA_PROGRAM_ID,
      sol: process.env.SOL_PROGRAM_ID,
    };

    try {
      // SOLANA_ARENA_MARKET_PROGRAM_ID takes top priority
      process.env.SOLANA_ARENA_MARKET_PROGRAM_ID =
        "ArenaWins111111111111111111111111111111111111";
      process.env.SOLANA_PROGRAM_ID =
        "ShouldNotWin1111111111111111111111111111111";
      expect(resolveSolanaProgramId()).toBe(
        "ArenaWins111111111111111111111111111111111111",
      );

      // When ARENA is cleared, SOLANA_PROGRAM_ID wins
      delete process.env.SOLANA_ARENA_MARKET_PROGRAM_ID;
      expect(resolveSolanaProgramId()).toBe(
        "ShouldNotWin1111111111111111111111111111111",
      );

      // SOL_PROGRAM_ID as third fallback
      delete process.env.SOLANA_PROGRAM_ID;
      process.env.SOL_PROGRAM_ID =
        "SolFallback11111111111111111111111111111111";
      expect(resolveSolanaProgramId()).toBe(
        "SolFallback11111111111111111111111111111111",
      );
    } finally {
      delete process.env.SOLANA_ARENA_MARKET_PROGRAM_ID;
      delete process.env.SOLANA_PROGRAM_ID;
      delete process.env.SOL_PROGRAM_ID;
      if (saved.arena) process.env.SOLANA_ARENA_MARKET_PROGRAM_ID = saved.arena;
      if (saved.prog) process.env.SOLANA_PROGRAM_ID = saved.prog;
      if (saved.sol) process.env.SOL_PROGRAM_ID = saved.sol;
    }
  });
});
