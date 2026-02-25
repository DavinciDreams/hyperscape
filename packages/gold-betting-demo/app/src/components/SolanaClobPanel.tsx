import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";

import {
  GOLD_CLOB_MARKET_PROGRAM_ID,
  createPrograms,
  createReadonlyPrograms,
} from "../lib/programs";
import {
  GAME_API_URL,
  CONFIG,
  buildArenaWriteHeaders,
  ENABLE_MANUAL_MARKET_ADMIN_CONTROLS,
} from "../lib/config";
import { getStoredInviteCode } from "../lib/invite";
import {
  findClobConfigPda,
  findClobVaultPda,
  findClobUserBalancePda,
  findClobOrderPda,
} from "../lib/clobPdas";
import {
  PredictionMarketPanel,
  type ChartDataPoint,
} from "./PredictionMarketPanel";
import { type Trade } from "./RecentTrades";
import { type OrderLevel } from "./OrderBook";
import { PointsDisplay } from "./PointsDisplay";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BetSide = "YES" | "NO";

type ActiveMatch = {
  matchState: PublicKey;
  orderBook: PublicKey;
  vault: PublicKey;
  isOpen: boolean;
  winner: number; // 0=None, 1=Yes, 2=No
  nextOrderId: bigint;
  authority: PublicKey;
};

type ClobConfigAccount = {
  treasury: PublicKey;
  marketMaker: PublicKey;
  tradeTreasuryFeeBps: number;
  tradeMarketMakerFeeBps: number;
  winningsMarketMakerFeeBps: number;
};

type UserPosition = {
  yesShares: bigint;
  noShares: bigint;
};

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const SOL_DECIMALS = 9;

const DEFAULT_TREASURY_WALLET = "JC4LUSsT3DZYGHrukS3WP5wwBGmA5w5jVGNbjDSgexFH";
const DEFAULT_MARKET_MAKER_WALLET =
  "BpG23aqgtPoNYGhGqn3wZHhzcULZ2Fd7Y8Bm8XNL2JdC";

function parseConfiguredPubkey(value: string | undefined): PublicKey | null {
  if (!value || value.trim().length === 0) return null;
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

const TREASURY_WALLET =
  parseConfiguredPubkey(CONFIG.binaryTradeTreasuryWallet) ||
  new PublicKey(DEFAULT_TREASURY_WALLET);
const MARKET_MAKER_WALLET =
  parseConfiguredPubkey(CONFIG.binaryTradeMarketMakerWallet) ||
  parseConfiguredPubkey(CONFIG.binaryMarketMakerWallet) ||
  new PublicKey(DEFAULT_MARKET_MAKER_WALLET);

/** Convert a human-readable SOL string to lamports (bigint). */
function toLamports(solInput: string): bigint {
  const value = Number(solInput.trim());
  if (!Number.isFinite(value) || value <= 0) return 0n;
  return BigInt(Math.floor(value * LAMPORTS_PER_SOL));
}

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.floor(value));
  if (value && typeof value === "object" && "toString" in value) {
    return BigInt((value as { toString: () => string }).toString());
  }
  return 0n;
}

function clampPrice(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 500;
  return Math.min(999, Math.max(1, Math.floor(parsed)));
}

/** Format lamports to SOL display value. */
function fmtSol(lamports: bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

function walletReady(wallet: ReturnType<typeof useWallet>): boolean {
  return Boolean(
    wallet.publicKey && wallet.signTransaction && wallet.signAllTransactions,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SolanaClobPanelProps {
  agent1Name: string;
  agent2Name: string;
}

export function SolanaClobPanel({
  agent1Name,
  agent2Name,
}: SolanaClobPanelProps) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [status, setStatus] = useState("Connect Solana wallet to trade");
  const [side, setSide] = useState<BetSide>("YES");
  const [amountInput, setAmountInput] = useState("0.01");
  const [priceInput, setPriceInput] = useState("500");
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);
  const [configAccount, setConfigAccount] = useState<ClobConfigAccount | null>(
    null,
  );
  const [position, setPosition] = useState<UserPosition>({
    yesShares: 0n,
    noShares: 0n,
  });
  const [yesPool, setYesPool] = useState<bigint>(0n);
  const [noPool, setNoPool] = useState<bigint>(0n);
  const [bids, setBids] = useState<OrderLevel[]>([]);
  const [asks, setAsks] = useState<OrderLevel[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<bigint | null>(null);

  const [txs, setTxs] = useState({
    initConfig: "-",
    createMatch: "-",
    initOrderBook: "-",
    placeOrder: "-",
    cancelOrder: "-",
    resolveMatch: "-",
    claim: "-",
  });

  const preferredMatchRef = useRef<string | null>(null);
  const autoClaimedMatchesRef = useRef<Set<string>>(new Set());
  const lastSnapshotRef = useRef<{ yes: bigint; no: bigint }>({
    yes: 0n,
    no: 0n,
  });

  // -----------------------------------------------------------------------
  // Programs
  // -----------------------------------------------------------------------

  const writablePrograms = useMemo(
    () => (walletReady(wallet) ? createPrograms(connection, wallet) : null),
    [connection, wallet],
  );

  const readonlyPrograms = useMemo(
    () => createReadonlyPrograms(connection),
    [connection],
  );

  const configPda = useMemo(
    () => findClobConfigPda(GOLD_CLOB_MARKET_PROGRAM_ID),
    [],
  );

  // -----------------------------------------------------------------------
  // Chart / trades helper
  // -----------------------------------------------------------------------

  const updateChartAndTrades = useCallback(
    (nextYes: bigint, nextNo: bigint) => {
      const now = Date.now();
      const prev = lastSnapshotRef.current;
      const yesDelta = nextYes - prev.yes;
      const noDelta = nextNo - prev.no;

      const total = nextYes + nextNo;
      const pct = total > 0n ? Number((nextYes * 100n) / total) : 50;

      if (chartData.length === 0) {
        setChartData([{ time: now, pct }]);
      } else if (yesDelta !== 0n || noDelta !== 0n) {
        setChartData((prevChart) => {
          const next = [...prevChart, { time: now, pct }];
          return next.length > 100 ? next.slice(next.length - 100) : next;
        });
      }

      if (yesDelta > 0n) {
        setRecentTrades((prevTrades) =>
          [
            {
              id: `sol-clob-yes-${now}`,
              side: "YES" as const,
              amount: fmtSol(yesDelta),
              price: pct / 100,
              time: now,
            },
            ...prevTrades,
          ].slice(0, 50),
        );
      }
      if (noDelta > 0n) {
        setRecentTrades((prevTrades) =>
          [
            {
              id: `sol-clob-no-${now}`,
              side: "NO" as const,
              amount: fmtSol(noDelta),
              price: pct / 100,
              time: now + 1,
            },
            ...prevTrades,
          ].slice(0, 50),
        );
      }

      lastSnapshotRef.current = { yes: nextYes, no: nextNo };
    },
    [chartData.length],
  );

  // -----------------------------------------------------------------------
  // refreshData – reads all on-chain state
  // -----------------------------------------------------------------------

  const refreshData = useCallback(async () => {
    const clobProgram: any = readonlyPrograms.goldClobMarket;
    setIsRefreshing(true);

    try {
      // --- Config ---
      const cfg = (await clobProgram.account.marketConfig.fetchNullable(
        configPda,
      )) as any;
      if (cfg) {
        setConfigAccount({
          treasury: cfg.treasury as PublicKey,
          marketMaker: cfg.marketMaker as PublicKey,
          tradeTreasuryFeeBps: Number(cfg.tradeTreasuryFeeBps ?? 0),
          tradeMarketMakerFeeBps: Number(cfg.tradeMarketMakerFeeBps ?? 0),
          winningsMarketMakerFeeBps: Number(cfg.winningsMarketMakerFeeBps ?? 0),
        });
      } else {
        setConfigAccount(null);
      }

      // --- Discover match states ---
      const allMatches = (await clobProgram.account.matchState.all()) as Array<{
        publicKey: PublicKey;
        account: any;
      }>;

      // Preferred match (may be closed)
      let preferredEntry: { publicKey: PublicKey; account: any } | null = null;
      if (preferredMatchRef.current) {
        const prefPk = new PublicKey(preferredMatchRef.current);
        preferredEntry =
          allMatches.find((m) => m.publicKey.equals(prefPk)) ?? null;
      }

      const openMatches = allMatches
        .filter((m) => Boolean(m.account.isOpen))
        .sort((a, b) =>
          a.publicKey.toBase58().localeCompare(b.publicKey.toBase58()),
        );

      const selected =
        preferredEntry ??
        openMatches[openMatches.length - 1] ??
        allMatches[allMatches.length - 1] ??
        null;

      if (!selected) {
        setActiveMatch(null);
        setYesPool(0n);
        setNoPool(0n);
        setPosition({ yesShares: 0n, noShares: 0n });
        setBids([]);
        setAsks([]);
        return;
      }

      const matchStatePk = selected.publicKey;
      const matchAccount = selected.account;
      const [vaultPda] = findClobVaultPda(
        GOLD_CLOB_MARKET_PROGRAM_ID,
        matchStatePk,
      );

      // --- Find orderbook account for this match ---
      const allOrderBooks =
        (await clobProgram.account.orderBook.all()) as Array<{
          publicKey: PublicKey;
          account: any;
        }>;
      const orderBookEntry = allOrderBooks.find((entry) =>
        (entry.account.matchState as PublicKey).equals(matchStatePk),
      );

      // --- Fetch orders (PDA accounts) for this match ---
      // Order layout: 8 disc + 8 id + 32 matchState (offset 16)
      const orderAccounts = (await clobProgram.account.order.all([
        {
          memcmp: {
            offset: 16, // 8 (discriminator) + 8 (id)
            bytes: matchStatePk.toBase58(),
          },
        },
      ])) as Array<{ publicKey: PublicKey; account: any }>;

      // --- Fetch balances (PDA accounts) for this match ---
      // UserBalance layout: 8 disc + 32 user + 32 matchState (offset 40)
      const balanceAccounts = (await clobProgram.account.userBalance.all([
        {
          memcmp: {
            offset: 40, // 8 (discriminator) + 32 (user)
            bytes: matchStatePk.toBase58(),
          },
        },
      ])) as Array<{ publicKey: PublicKey; account: any }>;

      // --- Aggregate pools & user position ---
      let yes = 0n;
      let no = 0n;
      let userPos: UserPosition = { yesShares: 0n, noShares: 0n };
      for (const bal of balanceAccounts) {
        const yesShares = asBigInt(bal.account.yesShares);
        const noShares = asBigInt(bal.account.noShares);
        yes += yesShares;
        no += noShares;
        if (
          wallet.publicKey &&
          (bal.account.user as PublicKey).equals(wallet.publicKey)
        ) {
          userPos = { yesShares, noShares };
        }
      }

      // --- Build orderbook levels ---
      const openOrders = orderAccounts.filter(
        (o) => asBigInt(o.account.amount) > asBigInt(o.account.filled),
      );

      const bidRows = openOrders
        .filter((o) => o.account.isBuy)
        .sort((a, b) => Number(b.account.price) - Number(a.account.price))
        .map((o) => ({
          price: Number(o.account.price) / 1000,
          amount: fmtSol(
            asBigInt(o.account.amount) - asBigInt(o.account.filled),
          ),
          total: 0,
        }));

      const askRows = openOrders
        .filter((o) => !o.account.isBuy)
        .sort((a, b) => Number(a.account.price) - Number(b.account.price))
        .map((o) => ({
          price: Number(o.account.price) / 1000,
          amount: fmtSol(
            asBigInt(o.account.amount) - asBigInt(o.account.filled),
          ),
          total: 0,
        }));

      let bidTotal = 0;
      const normalizedBids = bidRows.slice(0, 12).map((row) => {
        bidTotal += row.amount;
        return { ...row, total: bidTotal };
      });
      let askTotal = 0;
      const normalizedAsks = askRows.slice(0, 12).map((row) => {
        askTotal += row.amount;
        return { ...row, total: askTotal };
      });

      // --- Commit state ---
      setActiveMatch({
        matchState: matchStatePk,
        orderBook: orderBookEntry?.publicKey ?? PublicKey.default,
        vault: vaultPda,
        isOpen: Boolean(matchAccount.isOpen),
        winner: Number(
          (() => {
            const w = matchAccount.winner;
            if (!w || typeof w !== "object") return 0;
            if ("yes" in w) return 1;
            if ("no" in w) return 2;
            return 0;
          })(),
        ),
        nextOrderId: asBigInt(matchAccount.nextOrderId),
        authority: matchAccount.authority as PublicKey,
      });
      setYesPool(yes);
      setNoPool(no);
      setPosition(userPos);
      setBids(normalizedBids);
      setAsks(normalizedAsks);
      updateChartAndTrades(yes, no);

      if (!wallet.publicKey) {
        setStatus("Connect Solana wallet to trade");
      } else if (!matchAccount.isOpen) {
        const winnerLabel = (() => {
          const w = matchAccount.winner;
          if (w && typeof w === "object") {
            if ("yes" in w) return "YES";
            if ("no" in w) return "NO";
          }
          return "NONE";
        })();
        setStatus(`Resolved (${winnerLabel})`);
      } else {
        setStatus("Market open");
      }
    } catch (error) {
      setStatus(`Refresh failed: ${(error as Error).message}`);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    connection,
    configPda,
    readonlyPrograms,
    updateChartAndTrades,
    wallet.publicKey,
  ]);

  useEffect(() => {
    void refreshData();
    const id = window.setInterval(() => void refreshData(), 5000);
    return () => window.clearInterval(id);
  }, [refreshData]);

  // -----------------------------------------------------------------------
  // ensureConfig
  // -----------------------------------------------------------------------

  const ensureConfig = useCallback(async (): Promise<ClobConfigAccount> => {
    const clobProgram: any = writablePrograms?.goldClobMarket;
    if (!clobProgram || !wallet.publicKey || !wallet.sendTransaction) {
      throw new Error("Connect wallet first");
    }

    const existing = (await clobProgram.account.marketConfig.fetchNullable(
      configPda,
    )) as any;
    if (existing) {
      const cfg: ClobConfigAccount = {
        treasury: existing.treasury as PublicKey,
        marketMaker: existing.marketMaker as PublicKey,
        tradeTreasuryFeeBps: Number(existing.tradeTreasuryFeeBps ?? 0),
        tradeMarketMakerFeeBps: Number(existing.tradeMarketMakerFeeBps ?? 0),
        winningsMarketMakerFeeBps: Number(
          existing.winningsMarketMakerFeeBps ?? 0,
        ),
      };
      setConfigAccount(cfg);
      return cfg;
    }

    // Initialize config with wallet pubkeys (not token accounts)
    const initConfigTx = (await clobProgram.methods
      .initializeConfig(TREASURY_WALLET, MARKET_MAKER_WALLET, 100, 100, 200)
      .accounts({
        authority: wallet.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc()) as string;

    setTxs((prev) => ({ ...prev, initConfig: initConfigTx }));

    const created = (await clobProgram.account.marketConfig.fetch(
      configPda,
    )) as any;
    const cfg: ClobConfigAccount = {
      treasury: created.treasury as PublicKey,
      marketMaker: created.marketMaker as PublicKey,
      tradeTreasuryFeeBps: Number(created.tradeTreasuryFeeBps),
      tradeMarketMakerFeeBps: Number(created.tradeMarketMakerFeeBps),
      winningsMarketMakerFeeBps: Number(created.winningsMarketMakerFeeBps),
    };
    setConfigAccount(cfg);
    return cfg;
  }, [
    configPda,
    connection,
    wallet.publicKey,
    wallet.sendTransaction,
    writablePrograms,
  ]);

  // -----------------------------------------------------------------------
  // Create match
  // -----------------------------------------------------------------------

  const handleCreateMatch = async () => {
    try {
      if (!wallet.publicKey || !wallet.sendTransaction) {
        throw new Error("Connect wallet first");
      }
      const clobProgram: any = writablePrograms?.goldClobMarket;
      if (!clobProgram) throw new Error("Program unavailable");

      await ensureConfig();

      const matchState = Keypair.generate();
      const orderBook = Keypair.generate();
      const [vaultPda] = findClobVaultPda(
        GOLD_CLOB_MARKET_PROGRAM_ID,
        matchState.publicKey,
      );

      const matchTx = (await clobProgram.methods
        .initializeMatch(500)
        .accounts({
          matchState: matchState.publicKey,
          user: wallet.publicKey,
          config: configPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([matchState])
        .rpc()) as string;
      setTxs((prev) => ({ ...prev, createMatch: matchTx }));

      const orderBookTx = (await clobProgram.methods
        .initializeOrderBook()
        .accounts({
          user: wallet.publicKey,
          matchState: matchState.publicKey,
          orderBook: orderBook.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([orderBook])
        .rpc()) as string;
      setTxs((prev) => ({ ...prev, initOrderBook: orderBookTx }));

      preferredMatchRef.current = matchState.publicKey.toBase58();
      setStatus("Created new Solana CLOB market");
      await refreshData();
    } catch (error) {
      setStatus(`Create match failed: ${(error as Error).message}`);
    }
  };

  // -----------------------------------------------------------------------
  // Place order
  // -----------------------------------------------------------------------

  const handlePlaceOrder = async () => {
    try {
      if (!wallet.publicKey) throw new Error("Connect wallet first");
      const clobProgram: any = writablePrograms?.goldClobMarket;
      if (!clobProgram) throw new Error("Program unavailable");
      if (
        !activeMatch ||
        !activeMatch.orderBook ||
        activeMatch.orderBook.equals(PublicKey.default)
      ) {
        throw new Error("Create a match first");
      }

      const cfg = configAccount ?? (await ensureConfig());

      const amount = toLamports(amountInput);
      if (amount <= 0n) throw new Error("Amount must be > 0");
      const isBuy = side === "YES";
      const price = clampPrice(priceInput);

      // Read next order ID from match state
      const matchData = (await clobProgram.account.matchState.fetch(
        activeMatch.matchState,
      )) as any;
      const orderId = asBigInt(matchData.nextOrderId);

      // Derive PDAs
      const userBalancePda = findClobUserBalancePda(
        GOLD_CLOB_MARKET_PROGRAM_ID,
        activeMatch.matchState,
        wallet.publicKey,
      );
      const newOrderPda = findClobOrderPda(
        GOLD_CLOB_MARKET_PROGRAM_ID,
        activeMatch.matchState,
        wallet.publicKey,
        orderId,
      );

      const txSignature = (await clobProgram.methods
        .placeOrder(
          new BN(orderId.toString()),
          isBuy,
          price,
          new BN(amount.toString()),
        )
        .accounts({
          matchState: activeMatch.matchState,
          orderBook: activeMatch.orderBook,
          userBalance: userBalancePda,
          newOrder: newOrderPda,
          config: configPda,
          treasury: cfg.treasury,
          marketMaker: cfg.marketMaker,
          vault: activeMatch.vault,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc()) as string;
      setTxs((prev) => ({ ...prev, placeOrder: txSignature }));

      // Check if the order rested (next_order_id incremented)
      const afterMatch = (await clobProgram.account.matchState.fetch(
        activeMatch.matchState,
      )) as any;
      const afterOrderId = asBigInt(afterMatch.nextOrderId);
      if (afterOrderId > orderId) {
        setLastOrderId(orderId);
      }

      // Track with backend (best-effort)
      const referralTrackingFeeBps = Math.max(
        0,
        Number(cfg.tradeTreasuryFeeBps) + Number(cfg.tradeMarketMakerFeeBps),
      );

      let trackingError: string | null = null;
      try {
        const response = await fetch(
          `${GAME_API_URL}/api/arena/bet/record-external`,
          {
            method: "POST",
            headers: buildArenaWriteHeaders(),
            body: JSON.stringify({
              bettorWallet: wallet.publicKey.toBase58(),
              chain: "SOLANA",
              sourceAsset: "SOL",
              sourceAmount: amountInput,
              goldAmount: amountInput,
              feeBps: referralTrackingFeeBps,
              txSignature,
              marketPda: activeMatch.matchState.toBase58(),
              inviteCode: getStoredInviteCode(),
              externalBetRef: `solana:clob:${activeMatch.matchState.toBase58()}`,
            }),
          },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          trackingError = payload.error ?? `HTTP ${response.status}`;
        }
      } catch {
        trackingError = "request failed";
      }

      setStatus(
        trackingError
          ? `Order placed on-chain. Tracking failed: ${trackingError}`
          : "Order placed",
      );
      await refreshData();
    } catch (error) {
      setStatus(`Place order failed: ${(error as Error).message}`);
    }
  };

  // -----------------------------------------------------------------------
  // Cancel order
  // -----------------------------------------------------------------------

  const handleCancelOrder = async () => {
    try {
      if (!wallet.publicKey) throw new Error("Connect wallet first");
      const clobProgram: any = writablePrograms?.goldClobMarket;
      if (!clobProgram) throw new Error("Program unavailable");
      if (!activeMatch || activeMatch.orderBook.equals(PublicKey.default)) {
        throw new Error("No active order book");
      }
      if (lastOrderId === null)
        throw new Error("No local open order to cancel");

      const orderPda = findClobOrderPda(
        GOLD_CLOB_MARKET_PROGRAM_ID,
        activeMatch.matchState,
        wallet.publicKey,
        lastOrderId,
      );

      const txSignature = (await clobProgram.methods
        .cancelOrder(new BN(lastOrderId.toString()))
        .accounts({
          matchState: activeMatch.matchState,
          orderBook: activeMatch.orderBook,
          order: orderPda,
          vault: activeMatch.vault,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc()) as string;

      setTxs((prev) => ({ ...prev, cancelOrder: txSignature }));
      setStatus("Order canceled");
      await refreshData();
    } catch (error) {
      setStatus(`Cancel failed: ${(error as Error).message}`);
    }
  };

  // -----------------------------------------------------------------------
  // Resolve match
  // -----------------------------------------------------------------------

  const handleResolve = async () => {
    try {
      if (!wallet.publicKey) throw new Error("Connect wallet first");
      const clobProgram: any = writablePrograms?.goldClobMarket;
      if (!clobProgram) throw new Error("Program unavailable");
      if (!activeMatch) throw new Error("Create/select a match first");

      const winnerEnum = side === "YES" ? { yes: {} } : { no: {} };
      const txSignature = (await clobProgram.methods
        .resolveMatch(winnerEnum)
        .accounts({
          matchState: activeMatch.matchState,
          authority: wallet.publicKey,
        })
        .rpc()) as string;

      setTxs((prev) => ({ ...prev, resolveMatch: txSignature }));
      setStatus(`Resolved. Winner: ${side}`);
      await refreshData();
    } catch (error) {
      setStatus(`Resolve failed: ${(error as Error).message}`);
    }
  };

  // -----------------------------------------------------------------------
  // Claim
  // -----------------------------------------------------------------------

  const handleClaim = useCallback(
    async (source: "manual" | "auto" = "manual") => {
      try {
        if (!wallet.publicKey) throw new Error("Connect wallet first");
        const clobProgram: any = writablePrograms?.goldClobMarket;
        if (!clobProgram) throw new Error("Program unavailable");
        if (!activeMatch || !configAccount)
          throw new Error("Missing market/config state");

        const userBalancePda = findClobUserBalancePda(
          GOLD_CLOB_MARKET_PROGRAM_ID,
          activeMatch.matchState,
          wallet.publicKey,
        );

        if (source === "auto") {
          setStatus("Auto-claiming payout...");
        }

        const txSignature = (await clobProgram.methods
          .claim()
          .accounts({
            matchState: activeMatch.matchState,
            orderBook: activeMatch.orderBook,
            userBalance: userBalancePda,
            config: configPda,
            marketMaker: configAccount.marketMaker,
            vault: activeMatch.vault,
            user: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc()) as string;

        setTxs((prev) => ({ ...prev, claim: txSignature }));
        setStatus(source === "auto" ? "Auto-claim complete" : "Claim complete");
        await refreshData();
      } catch (error) {
        if (source === "auto") {
          setStatus(`Auto-claim skipped: ${(error as Error).message}`);
        } else {
          setStatus(`Claim failed: ${(error as Error).message}`);
        }
      }
    },
    [
      activeMatch,
      configAccount,
      configPda,
      refreshData,
      wallet.publicKey,
      writablePrograms,
    ],
  );

  // -----------------------------------------------------------------------
  // Auto-claim on resolution
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (
      !wallet.publicKey ||
      !activeMatch ||
      activeMatch.isOpen ||
      !configAccount
    ) {
      return;
    }
    if (txs.claim !== "-") return;

    const winningShares =
      activeMatch.winner === 1
        ? position.yesShares
        : activeMatch.winner === 2
          ? position.noShares
          : 0n;
    if (winningShares <= 0n) return;

    const claimKey = `${activeMatch.matchState.toBase58()}:${wallet.publicKey.toBase58()}`;
    if (autoClaimedMatchesRef.current.has(claimKey)) return;
    autoClaimedMatchesRef.current.add(claimKey);

    void handleClaim("auto").catch(() => {
      autoClaimedMatchesRef.current.delete(claimKey);
    });
  }, [
    activeMatch,
    configAccount,
    handleClaim,
    position.noShares,
    position.yesShares,
    txs.claim,
    wallet.publicKey,
  ]);

  // -----------------------------------------------------------------------
  // Derived display values
  // -----------------------------------------------------------------------

  const totalPool = yesPool + noPool;
  const yesPercent = totalPool > 0n ? Number((yesPool * 100n) / totalPool) : 50;
  const noPercent = 100 - yesPercent;

  const matchLabel = activeMatch?.matchState.toBase58() ?? "-";
  const walletConnected = walletReady(wallet);
  const marketFeeSummary = configAccount
    ? `${configAccount.tradeTreasuryFeeBps / 100}% trade → treasury, ${configAccount.tradeMarketMakerFeeBps / 100}% trade → MM, ${configAccount.winningsMarketMakerFeeBps / 100}% winnings → MM`
    : "Config not initialized";

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div
      data-testid="solana-clob-panel"
      style={{ display: "grid", gap: 10, position: "relative" }}
    >
      {/* Top Right Admin Panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          background: "rgba(0, 0, 0, 0.85)",
          border: "1px solid #333",
          padding: 12,
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 100,
          maxWidth: 320,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: "bold",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          Admin Panel
        </div>

        {ENABLE_MANUAL_MARKET_ADMIN_CONTROLS ? (
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginBottom: 4,
            }}
          >
            <button
              data-testid="solana-clob-refresh"
              type="button"
              onClick={() => void refreshData()}
              disabled={isRefreshing}
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              data-testid="solana-clob-create-match"
              type="button"
              onClick={() => void handleCreateMatch()}
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              Create Match
            </button>
            <button
              data-testid="solana-clob-resolve"
              type="button"
              onClick={() => void handleResolve()}
              disabled={!activeMatch?.isOpen}
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              Resolve ({side})
            </button>
            <button
              data-testid="solana-clob-claim"
              type="button"
              onClick={() => void handleClaim("manual")}
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              Claim
            </button>
            <button
              data-testid="solana-clob-cancel-order"
              type="button"
              onClick={() => void handleCancelOrder()}
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              Cancel Last Order
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 11, opacity: 0.85, marginBottom: 4 }}>
            Market lifecycle is automated by keeper bot.
          </span>
        )}

        <div
          style={{
            fontSize: 10,
            opacity: 0.75,
            wordBreak: "break-all",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div
            data-testid="solana-clob-status"
            style={{ color: "#fff", marginBottom: 4 }}
          >
            {status}
          </div>
          <div data-testid="solana-clob-init-config-tx">
            Init Config Tx: {txs.initConfig}
          </div>
          <div data-testid="solana-clob-create-match-tx">
            Create Match Tx: {txs.createMatch}
          </div>
          <div data-testid="solana-clob-init-orderbook-tx">
            Init OrderBook Tx: {txs.initOrderBook}
          </div>
          <div data-testid="solana-clob-place-order-tx">
            Place Order Tx: {txs.placeOrder}
          </div>
          <div data-testid="solana-clob-cancel-order-tx">
            Cancel Tx: {txs.cancelOrder}
          </div>
          <div data-testid="solana-clob-resolve-tx">
            Resolve Tx: {txs.resolveMatch}
          </div>
          <div data-testid="solana-clob-claim-tx">Claim Tx: {txs.claim}</div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span
          data-testid="solana-clob-match"
          style={{ opacity: 0.8, fontSize: 12 }}
        >
          Match: {matchLabel}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          fontSize: 12,
          opacity: 0.85,
        }}
      >
        <span>{marketFeeSummary}</span>
        <span>
          Position YES {fmtSol(position.yesShares).toFixed(4)} | NO{" "}
          {fmtSol(position.noShares).toFixed(4)}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <label style={{ fontSize: 12, opacity: 0.9 }}>
          Limit Price (1-999)
          <input
            data-testid="solana-clob-price-input"
            type="number"
            value={priceInput}
            onChange={(event) => setPriceInput(event.target.value)}
            min={1}
            max={999}
            style={{ marginLeft: 6, width: 90 }}
          />
        </label>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          Wallet {walletConnected ? "connected" : "not connected"}
        </span>
      </div>

      <PredictionMarketPanel
        yesPercent={yesPercent}
        noPercent={noPercent}
        yesPool={fmtSol(yesPool)}
        noPool={fmtSol(noPool)}
        side={side}
        setSide={setSide}
        amountInput={amountInput}
        setAmountInput={setAmountInput}
        onPlaceBet={handlePlaceOrder}
        isWalletReady={walletConnected}
        programsReady={true}
        agent1Name={agent1Name}
        agent2Name={agent2Name}
        isEvm={false}
        currencySymbol="SOL"
        supportsSell={true}
        chartData={chartData}
        bids={bids}
        asks={asks}
        recentTrades={recentTrades}
        pointsDisplay={
          <PointsDisplay
            walletAddress={wallet.publicKey?.toBase58() ?? null}
            compact
          />
        }
      >
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
            Sell/NO flow uses the same limit order action with side = NO.
          </div>
          <button type="button" onClick={() => void handlePlaceOrder()}>
            Place Limit Order
          </button>
        </div>
      </PredictionMarketPanel>
    </div>
  );
}
