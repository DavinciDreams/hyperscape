import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import { createPrograms, createReadonlyPrograms } from "../lib/programs";
import {
  GAME_API_URL,
  CONFIG,
  DEFAULT_NEW_ROUND_BET_WINDOW_SECONDS,
  buildArenaWriteHeaders,
  ENABLE_MANUAL_MARKET_ADMIN_CONTROLS,
} from "../lib/config";
import { getStoredInviteCode } from "../lib/invite";
import { findClobConfigPda } from "../lib/clobPdas";
import { findMatchPda, findOracleConfigPda } from "../lib/pdas";
import { findProgramAddressSync } from "../lib/programAddress";
import {
  confirmSignatureViaRpc,
  getLatestBlockhashViaRpc,
  sendRawTransactionViaRpc,
} from "../lib/solanaRpc";
import {
  PredictionMarketPanel,
  type ChartDataPoint,
} from "./PredictionMarketPanel";
import { type Trade } from "./RecentTrades";
import { type OrderLevel } from "./OrderBook";
import { PointsDisplay } from "./PointsDisplay";

type BetSide = "YES" | "NO";

type ActiveMatch = {
  matchState: PublicKey;
  oracleMatch: PublicKey;
  orderBook: PublicKey;
  vault: PublicKey;
  isOpen: boolean;
  winner: number;
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

const DEFAULT_EXTERNAL_TRACKING_FEE_BPS = 200;
const DEFAULT_TREASURY_FEE_OWNER =
  "JC4LUSsT3DZYGHrukS3WP5wwBGmA5w5jVGNbjDSgexFH";
const DEFAULT_MARKET_MAKER_FEE_OWNER =
  "BpG23aqgtPoNYGhGqn3wZHhzcULZ2Fd7Y8Bm8XNL2JdC";
const TEXT_ENCODER = new TextEncoder();
const SEED_VAULT = TEXT_ENCODER.encode("vault");
const SEED_ORDER = TEXT_ENCODER.encode("order");
const SEED_BALANCE = TEXT_ENCODER.encode("balance");
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const SOLANA_SETTLEMENT_DECIMALS = 9;

function deriveProgramDataAddress(programId: PublicKey): PublicKey {
  return findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  )[0];
}

function parseConfiguredPubkey(value: string | undefined): PublicKey | null {
  if (!value || value.trim().length === 0) return null;
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

const E2E_CLOB_MATCH_STATE = parseConfiguredPubkey(
  import.meta.env.VITE_E2E_CLOB_MATCH_STATE,
);
const E2E_CLOB_VAULT = parseConfiguredPubkey(
  import.meta.env.VITE_E2E_CLOB_VAULT,
);
const E2E_CLOB_USER_BALANCE = parseConfiguredPubkey(
  import.meta.env.VITE_E2E_CLOB_USER_BALANCE,
);
const E2E_CLOB_FIRST_ORDER = parseConfiguredPubkey(
  import.meta.env.VITE_E2E_CLOB_FIRST_ORDER,
);

function toBaseUnits(amountInput: string): bigint {
  const value = Number(amountInput.trim());
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

function u64LeBytes(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("u64 value must be non-negative");
  let remainder = value;
  const bytes = new Uint8Array(8);
  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number(remainder & 0xffn);
    remainder >>= 8n;
  }
  return bytes;
}

function clampPrice(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 500;
  return Math.min(999, Math.max(1, Math.floor(parsed)));
}

function fmtAmount(value: bigint): number {
  return Number(value) / 10 ** SOLANA_SETTLEMENT_DECIMALS;
}

function walletReady(wallet: ReturnType<typeof useWallet>): boolean {
  return Boolean(
    wallet.publicKey && wallet.signTransaction && wallet.signAllTransactions,
  );
}

interface SolanaClobPanelProps {
  agent1Name: string;
  agent2Name: string;
  /** Sidebar compact mode: hides admin/debug panel, uses single-column PredictionMarketPanel */
  compact?: boolean;
  onMarketSnapshot?: (snapshot: SolanaClobMarketSnapshot) => void;
}

export interface SolanaClobMarketSnapshot {
  matchLabel: string;
  marketStatus: string;
  yesPool: bigint;
  noPool: bigint;
  bids: OrderLevel[];
  asks: OrderLevel[];
  recentTrades: Trade[];
  chartData: ChartDataPoint[];
}

export function SolanaClobPanel({
  agent1Name,
  agent2Name,
  compact = false,
  onMarketSnapshot,
}: SolanaClobPanelProps) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [status, setStatus] = useState("Connect Solana wallet to trade SOL");
  const [side, setSide] = useState<BetSide>("YES");
  const [amountInput, setAmountInput] = useState("1");
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
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);

  const [txs, setTxs] = useState({
    initConfig: "-",
    createMatch: "-",
    initOrderBook: "-",
    placeOrder: "-",
    cancelOrder: "-",
    resolveMatch: "-",
    claim: "-",
  });

  const preferredMatchRef = useRef<string | null>(
    E2E_CLOB_MATCH_STATE?.toBase58() ?? null,
  );
  const autoClaimedMatchesRef = useRef<Set<string>>(new Set());
  const lastSnapshotRef = useRef<{ yes: bigint; no: bigint }>({
    yes: 0n,
    no: 0n,
  });

  const writablePrograms = useMemo(
    () => (walletReady(wallet) ? createPrograms(connection, wallet) : null),
    [connection, wallet],
  );

  const readonlyPrograms = useMemo(
    () => createReadonlyPrograms(connection),
    [connection],
  );

  const submitTransaction = useCallback(
    async (
      transaction: Transaction,
      signers: Keypair[] = [],
      context: string,
    ): Promise<string> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Connect wallet first");
      }

      let stage = "fetching blockhash";
      try {
        transaction.feePayer = wallet.publicKey;
        const latest = await getLatestBlockhashViaRpc(connection);
        transaction.recentBlockhash = latest.blockhash;

        if (signers.length > 0) {
          stage = "applying signer";
          transaction.partialSign(...signers);
        }

        stage = "signing transaction";
        const signed = await wallet.signTransaction(transaction);

        stage = "sending transaction";
        const signature = await sendRawTransactionViaRpc(connection, signed);

        stage = "confirming transaction";
        await confirmSignatureViaRpc(connection, signature);
        return signature;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${context}: ${stage}: ${message}`);
      }
    },
    [connection, wallet.publicKey, wallet.signTransaction],
  );

  const ensureVaultRentExempt = useCallback(
    async (vault: PublicKey): Promise<void> => {
      if (!wallet.publicKey) {
        throw new Error("Connect wallet first");
      }

      const minVaultLamports =
        await connection.getMinimumBalanceForRentExemption(0, "confirmed");
      const currentVaultLamports = await connection.getBalance(
        vault,
        "confirmed",
      );
      if (currentVaultLamports >= minVaultLamports) {
        return;
      }

      const topUpLamports = minVaultLamports - currentVaultLamports;
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: vault,
          lamports: topUpLamports,
        }),
      );
      await submitTransaction(transaction, [], "funding vault rent");
    },
    [connection, submitTransaction, wallet.publicKey],
  );

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
              amount: fmtAmount(yesDelta),
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
              amount: fmtAmount(noDelta),
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

  const refreshData = useCallback(async () => {
    const clobProgram: any = readonlyPrograms.goldClobMarket;
    const runtimeConfigPda = findClobConfigPda(clobProgram.programId);
    setIsRefreshing(true);

    try {
      const cfg = (await clobProgram.account.marketConfig.fetchNullable(
        runtimeConfigPda,
      )) as any;
      if (cfg) {
        setConfigAccount({
          treasury: cfg.treasury as PublicKey,
          marketMaker: cfg.marketMaker as PublicKey,
          tradeTreasuryFeeBps: Number(
            cfg.tradeTreasuryFeeBps ?? cfg.tradingFeeBps ?? 0,
          ),
          tradeMarketMakerFeeBps: Number(cfg.tradeMarketMakerFeeBps ?? 0),
          winningsMarketMakerFeeBps: Number(
            cfg.winningsMarketMakerFeeBps ?? cfg.winningsFeeBps ?? 0,
          ),
        });
      } else {
        setConfigAccount(null);
      }

      const allMatches = (await clobProgram.account.matchState.all()) as Array<{
        publicKey: PublicKey;
        account: any;
      }>;

      // And we need the preferred match if one is active but maybe closed recently
      let preferredMatchAccount: any = null;
      if (preferredMatchRef.current) {
        try {
          preferredMatchAccount = await clobProgram.account.matchState.fetch(
            new PublicKey(preferredMatchRef.current),
          );
        } catch {
          // ignore
        }
      }

      const matchEntries = allMatches
        .map((m) => ({
          publicKey: m.publicKey,
          account: m.account,
        }))
        .sort((a, b) =>
          a.publicKey.toBase58().localeCompare(b.publicKey.toBase58()),
        );

      if (matchEntries.length === 0 && !preferredMatchAccount) {
        setActiveMatch(null);
        setYesPool(0n);
        setNoPool(0n);
        setPosition({ yesShares: 0n, noShares: 0n });
        return;
      }

      const preferred =
        preferredMatchRef.current && preferredMatchAccount
          ? {
              publicKey: new PublicKey(preferredMatchRef.current),
              account: preferredMatchAccount,
            }
          : null;

      const open = matchEntries.filter((entry) =>
        Boolean(entry.account.isOpen),
      );
      const selected =
        preferred ??
        open[open.length - 1] ??
        matchEntries[matchEntries.length - 1];

      const matchStatePk = selected.publicKey;
      const vault = findProgramAddressSync(
        [SEED_VAULT, matchStatePk.toBytes()],
        clobProgram.programId,
      )[0];

      const allOrderBooks =
        (await clobProgram.account.orderBook.all()) as Array<{
          publicKey: PublicKey;
          account: any;
        }>;
      const orderBookEntry = allOrderBooks.find((entry) =>
        (entry.account.matchState as PublicKey).equals(matchStatePk),
      );
      if (!orderBookEntry) {
        setActiveMatch({
          matchState: matchStatePk,
          oracleMatch: selected.account.oracleMatch as PublicKey,
          orderBook: PublicKey.default,
          vault,
          isOpen: Boolean(selected.account.isOpen),
          winner: Number(selected.account.winner),
          nextOrderId: asBigInt(selected.account.nextOrderId),
          authority: selected.account.authority as PublicKey,
        });
        setYesPool(0n);
        setNoPool(0n);
        setBids([]);
        setAsks([]);
        setPosition({ yesShares: 0n, noShares: 0n });
        return;
      }

      const orderBook = orderBookEntry.account;

      const allBalances =
        (await clobProgram.account.userBalance.all()) as Array<{
          publicKey: PublicKey;
          account: any;
        }>;
      const balances = allBalances
        .filter((b) => (b.account.matchState as PublicKey).equals(matchStatePk))
        .map((b) => b.account);

      let yes = 0n;
      let no = 0n;
      let userPos: UserPosition = { yesShares: 0n, noShares: 0n };
      for (const bal of balances) {
        const yesShares = asBigInt(bal.yesShares);
        const noShares = asBigInt(bal.noShares);
        yes += yesShares;
        no += noShares;
        if (
          wallet.publicKey &&
          (bal.user as PublicKey).equals(wallet.publicKey)
        ) {
          userPos = { yesShares, noShares };
        }
      }

      const allOrdersResult = (await clobProgram.account.order.all()) as Array<{
        publicKey: PublicKey;
        account: any;
      }>;
      const matchOrders = allOrdersResult
        .filter((o) => (o.account.matchState as PublicKey).equals(matchStatePk))
        .map((o) => o.account);

      const openOrders = matchOrders.filter(
        (order) => asBigInt(order.amount) > asBigInt(order.filled),
      );
      const bidRows = openOrders
        .filter((order) => order.isBuy)
        .sort((a, b) => Number(b.price) - Number(a.price))
        .map((order) => ({
          price: Number(order.price) / 1000,
          amount: fmtAmount(asBigInt(order.amount) - asBigInt(order.filled)),
          total: 0,
        }));
      const askRows = openOrders
        .filter((order) => !order.isBuy)
        .sort((a, b) => Number(a.price) - Number(b.price))
        .map((order) => ({
          price: Number(order.price) / 1000,
          amount: fmtAmount(asBigInt(order.amount) - asBigInt(order.filled)),
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

      setActiveMatch({
        matchState: matchStatePk,
        oracleMatch: selected.account.oracleMatch as PublicKey,
        orderBook: orderBookEntry.publicKey,
        vault,
        isOpen: Boolean(selected.account.isOpen),
        winner: Number(selected.account.winner),
        nextOrderId: asBigInt(selected.account.nextOrderId),
        authority: selected.account.authority as PublicKey,
      });
      setYesPool(yes);
      setNoPool(no);
      setPosition(userPos);
      setBids(normalizedBids);
      setAsks(normalizedAsks);
      updateChartAndTrades(yes, no);

      if (!wallet.publicKey) {
        setStatus("Connect Solana wallet to trade");
      } else if (!selected.account.isOpen) {
        const winnerLabel =
          Number(selected.account.winner) === 1 ? "YES" : "NO";
        setStatus(`Resolved (${winnerLabel})`);
      } else {
        setStatus("Market open");
      }
    } catch (error) {
      setStatus(`Refresh failed: ${(error as Error).message}`);
    } finally {
      setIsRefreshing(false);
    }
  }, [readonlyPrograms, updateChartAndTrades, wallet.publicKey]);

  const ensureOracle = useCallback(async (): Promise<PublicKey> => {
    const fightProgram: any = writablePrograms?.fightOracle;
    if (!fightProgram || !wallet.publicKey) {
      throw new Error("Connect wallet first");
    }

    const oracleConfigPda = findOracleConfigPda(fightProgram.programId);
    let config = (await fightProgram.account.oracleConfig.fetchNullable(
      oracleConfigPda,
    )) as any;

    if (!config) {
      const transaction = await fightProgram.methods
        .initializeOracle()
        .accountsPartial({
          authority: wallet.publicKey,
          oracleConfig: oracleConfigPda,
          program: fightProgram.programId,
          programData: deriveProgramDataAddress(fightProgram.programId),
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      await submitTransaction(transaction, [], "initializing oracle config");
      config = (await fightProgram.account.oracleConfig.fetchNullable(
        oracleConfigPda,
      )) as any;
    }

    if (!config) {
      throw new Error(
        `Oracle config ${oracleConfigPda.toBase58()} was not created`,
      );
    }
    if (!(config.authority as PublicKey).equals(wallet.publicKey)) {
      throw new Error("Connected wallet is not the oracle authority");
    }

    return oracleConfigPda;
  }, [submitTransaction, wallet.publicKey, writablePrograms]);

  useEffect(() => {
    void refreshData();
    const id = window.setInterval(() => void refreshData(), 5000);
    return () => window.clearInterval(id);
  }, [refreshData]);

  const ensureConfig = useCallback(async (): Promise<ClobConfigAccount> => {
    const clobProgram: any = writablePrograms?.goldClobMarket;
    if (!clobProgram || !wallet.publicKey || !wallet.signTransaction) {
      throw new Error("Connect wallet first");
    }
    const runtimeConfigPda = findClobConfigPda(clobProgram.programId);

    const existing = (await clobProgram.account.marketConfig.fetchNullable(
      runtimeConfigPda,
    )) as any;
    if (existing) {
      let cfg: ClobConfigAccount = {
        treasury: existing.treasury as PublicKey,
        marketMaker: existing.marketMaker as PublicKey,
        tradeTreasuryFeeBps: Number(
          existing.tradeTreasuryFeeBps ?? existing.tradingFeeBps ?? 0,
        ),
        tradeMarketMakerFeeBps: Number(existing.tradeMarketMakerFeeBps ?? 0),
        winningsMarketMakerFeeBps: Number(
          existing.winningsMarketMakerFeeBps ?? existing.winningsFeeBps ?? 0,
        ),
      };

      if (
        CONFIG.cluster === "localnet" &&
        (!cfg.treasury.equals(wallet.publicKey) ||
          !cfg.marketMaker.equals(wallet.publicKey)) &&
        (existing.authority as PublicKey).equals(wallet.publicKey)
      ) {
        const transaction = await clobProgram.methods
          .updateConfig(
            wallet.publicKey,
            wallet.publicKey,
            cfg.tradeTreasuryFeeBps,
            cfg.tradeMarketMakerFeeBps,
            cfg.winningsMarketMakerFeeBps,
          )
          .accounts({
            authority: wallet.publicKey,
            config: runtimeConfigPda,
          })
          .transaction();
        await submitTransaction(transaction, [], "updating local CLOB config");

        cfg = {
          ...cfg,
          treasury: wallet.publicKey,
          marketMaker: wallet.publicKey,
        };
      }
      setConfigAccount(cfg);
      return cfg;
    }

    const localFeeOwner =
      CONFIG.cluster === "localnet" ? wallet.publicKey : null;
    const treasuryFeeOwner =
      parseConfiguredPubkey(CONFIG.binaryTradeTreasuryWallet) ??
      localFeeOwner ??
      new PublicKey(DEFAULT_TREASURY_FEE_OWNER);
    const marketMakerFeeOwner =
      parseConfiguredPubkey(CONFIG.binaryTradeMarketMakerWallet) ??
      parseConfiguredPubkey(CONFIG.binaryMarketMakerWallet) ??
      localFeeOwner ??
      new PublicKey(DEFAULT_MARKET_MAKER_FEE_OWNER);

    const initConfigTransaction = await clobProgram.methods
      .initializeConfig(treasuryFeeOwner, marketMakerFeeOwner, 100, 100, 200)
      .accountsPartial({
        authority: wallet.publicKey,
        config: runtimeConfigPda,
        program: clobProgram.programId,
        programData: deriveProgramDataAddress(clobProgram.programId),
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    const initConfigTx = await submitTransaction(
      initConfigTransaction,
      [],
      "initializing CLOB config",
    );

    setTxs((prev) => ({ ...prev, initConfig: initConfigTx }));

    const created = (await clobProgram.account.marketConfig.fetch(
      runtimeConfigPda,
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
    submitTransaction,
    wallet.publicKey,
    wallet.signTransaction,
    writablePrograms,
  ]);

  const handleCreateMatch = async () => {
    try {
      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Connect wallet first");
      }
      const fightProgram: any = writablePrograms?.fightOracle;
      const clobProgram: any = writablePrograms?.goldClobMarket;
      if (!fightProgram || !clobProgram) throw new Error("Program unavailable");
      const runtimeConfigPda = findClobConfigPda(clobProgram.programId);
      const oracleConfigPda = await ensureOracle();

      await ensureConfig();

      const matchId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
      const oracleMatchPda = findMatchPda(
        fightProgram.programId,
        new BN(matchId.toString()),
      );
      const oracleMetadata = JSON.stringify({
        agent1: agent1Name,
        agent2: agent2Name,
      });
      const createOracleMatchTransaction = await fightProgram.methods
        .createMatch(
          new BN(matchId.toString()),
          new BN(DEFAULT_NEW_ROUND_BET_WINDOW_SECONDS),
          oracleMetadata,
        )
        .accountsPartial({
          authority: wallet.publicKey,
          oracleConfig: oracleConfigPda,
          matchResult: oracleMatchPda,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      await submitTransaction(
        createOracleMatchTransaction,
        [],
        "creating oracle match",
      );

      const matchState = Keypair.generate();
      const orderBook = Keypair.generate();
      const vaultPda = findProgramAddressSync(
        [SEED_VAULT, matchState.publicKey.toBytes()],
        clobProgram.programId,
      )[0];

      const initializeMatchTransaction = await clobProgram.methods
        .initializeMatch(500)
        .accountsPartial({
          matchState: matchState.publicKey,
          user: wallet.publicKey,
          config: runtimeConfigPda,
          oracleMatch: oracleMatchPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      const matchTx = await submitTransaction(
        initializeMatchTransaction,
        [matchState],
        "initializing CLOB match",
      );
      setTxs((prev) => ({ ...prev, createMatch: matchTx }));

      await ensureVaultRentExempt(vaultPda);

      const initializeOrderbookTransaction = await clobProgram.methods
        .initializeOrderBook()
        .accounts({
          user: wallet.publicKey,
          matchState: matchState.publicKey,
          orderBook: orderBook.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      const orderBookTx = await submitTransaction(
        initializeOrderbookTransaction,
        [orderBook],
        "initializing order book",
      );
      setTxs((prev) => ({ ...prev, initOrderBook: orderBookTx }));

      preferredMatchRef.current = matchState.publicKey.toBase58();
      setStatus("Created new Solana CLOB market with linked oracle round");
      await refreshData();
    } catch (error) {
      setStatus(`Create match failed: ${(error as Error).message}`);
    }
  };

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
      const runtimeConfigPda = findClobConfigPda(clobProgram.programId);

      const cfg = await ensureConfig();

      const amount = toBaseUnits(amountInput);
      if (amount <= 0n) throw new Error("Amount must be > 0");
      const isBuy = side === "YES";
      const price = clampPrice(priceInput);

      const allOrdersResult = (await clobProgram.account.order.all()) as Array<{
        publicKey: PublicKey;
        account: any;
      }>;

      const matchOrders = allOrdersResult.filter((o) =>
        (o.account.matchState as PublicKey).equals(activeMatch.matchState),
      );

      const openMakerOrders = matchOrders
        .filter((o) => Boolean(o.account.isBuy) !== isBuy)
        .filter((o) => asBigInt(o.account.amount) > asBigInt(o.account.filled))
        .filter((o) =>
          isBuy
            ? Number(o.account.price) <= price
            : Number(o.account.price) >= price,
        )
        .sort((a, b) =>
          isBuy
            ? Number(a.account.price) - Number(b.account.price)
            : Number(b.account.price) - Number(a.account.price),
        );

      const remainingAccounts = [];
      for (const order of openMakerOrders.slice(0, 15)) {
        const makerBalancePda = findProgramAddressSync(
          [
            Buffer.from("balance"),
            activeMatch.matchState.toBytes(),
            (order.account.maker as PublicKey).toBytes(),
          ],
          clobProgram.programId,
        )[0];
        remainingAccounts.push({
          pubkey: order.publicKey,
          isWritable: true,
          isSigner: false,
        });
        remainingAccounts.push({
          pubkey: makerBalancePda,
          isWritable: true,
          isSigner: false,
        });
      }

      const before = (await clobProgram.account.matchState.fetch(
        activeMatch.matchState,
      )) as any;
      const beforeOrderId = asBigInt(before.nextOrderId);
      const orderId = beforeOrderId;
      const useSeededE2ePdas =
        CONFIG.cluster === "localnet" &&
        E2E_CLOB_MATCH_STATE?.equals(activeMatch.matchState) === true;
      const orderPda = findProgramAddressSync(
        [
          SEED_ORDER,
          activeMatch.matchState.toBytes(),
          wallet.publicKey.toBytes(),
          u64LeBytes(orderId),
        ],
        clobProgram.programId,
      )[0];
      const derivedUserBalancePda = findProgramAddressSync(
        [
          SEED_BALANCE,
          activeMatch.matchState.toBytes(),
          wallet.publicKey.toBytes(),
        ],
        clobProgram.programId,
      )[0];
      const derivedVaultPda = findProgramAddressSync(
        [SEED_VAULT, activeMatch.matchState.toBytes()],
        clobProgram.programId,
      )[0];
      const userBalancePda =
        useSeededE2ePdas && E2E_CLOB_USER_BALANCE
          ? E2E_CLOB_USER_BALANCE
          : derivedUserBalancePda;
      const vaultPda =
        useSeededE2ePdas && E2E_CLOB_VAULT ? E2E_CLOB_VAULT : derivedVaultPda;
      const effectiveOrderPda =
        useSeededE2ePdas && orderId === 1n && E2E_CLOB_FIRST_ORDER
          ? E2E_CLOB_FIRST_ORDER
          : orderPda;

      if (activeMatch.authority.equals(wallet.publicKey)) {
        await ensureVaultRentExempt(vaultPda);
      }

      const placeOrderTransaction = await clobProgram.methods
        .placeOrder(
          new BN(orderId.toString()),
          isBuy,
          price,
          new BN(amount.toString()),
        )
        .accountsPartial({
          matchState: activeMatch.matchState,
          orderBook: activeMatch.orderBook,
          userBalance: userBalancePda,
          newOrder: effectiveOrderPda,
          config: runtimeConfigPda,
          treasury: cfg.treasury,
          marketMaker: cfg.marketMaker,
          vault: vaultPda,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(remainingAccounts)
        .transaction();
      const txSignature = await submitTransaction(
        placeOrderTransaction,
        [],
        "placing order",
      );
      setTxs((prev) => ({ ...prev, placeOrder: txSignature }));

      const after = (await clobProgram.account.matchState.fetch(
        activeMatch.matchState,
      )) as any;
      const afterOrderId = asBigInt(after.nextOrderId);
      if (afterOrderId > beforeOrderId) {
        setLastOrderId(beforeOrderId);
      }

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
              feeBps:
                referralTrackingFeeBps || DEFAULT_EXTERNAL_TRACKING_FEE_BPS,
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

  const handleCancelOrder = async () => {
    try {
      if (!wallet.publicKey) throw new Error("Connect wallet first");
      const clobProgram: any = writablePrograms?.goldClobMarket;
      if (!clobProgram) throw new Error("Program unavailable");
      if (!activeMatch || activeMatch.orderBook.equals(PublicKey.default)) {
        throw new Error("No active order book");
      }
      if (!lastOrderId) throw new Error("No local open order to cancel");
      const orderPda = findProgramAddressSync(
        [
          SEED_ORDER,
          activeMatch.matchState.toBytes(),
          wallet.publicKey.toBytes(),
          u64LeBytes(lastOrderId),
        ],
        clobProgram.programId,
      )[0];
      const vaultPda = findProgramAddressSync(
        [SEED_VAULT, activeMatch.matchState.toBytes()],
        clobProgram.programId,
      )[0];

      const cancelOrderTransaction = await clobProgram.methods
        .cancelOrder(new BN(lastOrderId.toString()))
        .accountsPartial({
          matchState: activeMatch.matchState,
          orderBook: activeMatch.orderBook,
          order: orderPda,
          vault: vaultPda,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      const txSignature = await submitTransaction(
        cancelOrderTransaction,
        [],
        "canceling order",
      );

      setTxs((prev) => ({ ...prev, cancelOrder: txSignature }));
      setStatus("Order canceled");
      await refreshData();
    } catch (error) {
      setStatus(`Cancel failed: ${(error as Error).message}`);
    }
  };

  const handleResolve = async () => {
    try {
      if (!wallet.publicKey) throw new Error("Connect wallet first");
      const fightProgram: any = writablePrograms?.fightOracle;
      const clobProgram: any = writablePrograms?.goldClobMarket;
      if (!fightProgram || !clobProgram) throw new Error("Program unavailable");
      if (!activeMatch) throw new Error("Create/select a match first");
      const oracleConfigPda = await ensureOracle();

      const winner = side === "YES" ? { yes: {} } : { no: {} };
      const replayHash = window.crypto.getRandomValues(new Uint8Array(32));
      const postResultTransaction = await fightProgram.methods
        .postResult(
          winner,
          new BN(Date.now().toString()),
          Array.from(replayHash),
        )
        .accountsPartial({
          authority: wallet.publicKey,
          oracleConfig: oracleConfigPda,
          matchResult: activeMatch.oracleMatch,
        })
        .transaction();
      await submitTransaction(postResultTransaction, [], "posting result");

      const resolveMatchTransaction = await clobProgram.methods
        .resolveMatch()
        .accounts({
          matchState: activeMatch.matchState,
          oracleMatch: activeMatch.oracleMatch,
        })
        .transaction();
      const txSignature = await submitTransaction(
        resolveMatchTransaction,
        [],
        "resolving match",
      );

      setTxs((prev) => ({ ...prev, resolveMatch: txSignature }));
      setStatus(`Resolved. Winner: ${side}`);
      await refreshData();
    } catch (error) {
      setStatus(`Resolve failed: ${(error as Error).message}`);
    }
  };

  const handleClaim = useCallback(
    async (source: "manual" | "auto" = "manual") => {
      try {
        if (!wallet.publicKey) throw new Error("Connect wallet first");
        const clobProgram: any = writablePrograms?.goldClobMarket;
        if (!clobProgram) throw new Error("Program unavailable");
        if (!activeMatch || !configAccount)
          throw new Error("Missing market/config state");
        const runtimeConfigPda = findClobConfigPda(clobProgram.programId);
        const userBalancePda = findProgramAddressSync(
          [
            SEED_BALANCE,
            activeMatch.matchState.toBytes(),
            wallet.publicKey.toBytes(),
          ],
          clobProgram.programId,
        )[0];
        const vaultPda = findProgramAddressSync(
          [SEED_VAULT, activeMatch.matchState.toBytes()],
          clobProgram.programId,
        )[0];

        if (source === "auto") {
          setStatus("Auto-claiming payout...");
        }

        const claimTransaction = await clobProgram.methods
          .claim()
          .accountsPartial({
            matchState: activeMatch.matchState,
            orderBook: activeMatch.orderBook,
            userBalance: userBalancePda,
            config: runtimeConfigPda,
            marketMaker: configAccount.marketMaker,
            vault: vaultPda,
            user: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .transaction();
        const txSignature = await submitTransaction(
          claimTransaction,
          [],
          "claiming payout",
        );

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
      refreshData,
      submitTransaction,
      wallet.publicKey,
      writablePrograms,
    ],
  );

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

  const totalPool = yesPool + noPool;
  const yesPercent = totalPool > 0n ? Number((yesPool * 100n) / totalPool) : 50;
  const noPercent = 100 - yesPercent;

  const matchLabel = activeMatch?.matchState.toBase58() ?? "-";
  const marketStatus = activeMatch
    ? activeMatch.isOpen
      ? "OPEN"
      : activeMatch.winner === 1
        ? "RESOLVED YES"
        : activeMatch.winner === 2
          ? "RESOLVED NO"
          : "RESOLVED"
    : isRefreshing
      ? "REFRESHING"
      : "PENDING";
  const walletConnected = walletReady(wallet);
  const marketFeeSummary = configAccount
    ? `${configAccount.tradeTreasuryFeeBps / 100}% trade -> treasury, ${configAccount.tradeMarketMakerFeeBps / 100}% trade -> MM, ${configAccount.winningsMarketMakerFeeBps / 100}% winnings -> MM`
    : "Config not initialized";

  useEffect(() => {
    if (!onMarketSnapshot) return;
    onMarketSnapshot({
      matchLabel,
      marketStatus,
      yesPool,
      noPool,
      bids: bids.map((level) => ({ ...level })),
      asks: asks.map((level) => ({ ...level })),
      recentTrades: recentTrades.map((trade) => ({ ...trade })),
      chartData: chartData.map((point) => ({ ...point })),
    });
  }, [
    asks,
    bids,
    chartData,
    marketStatus,
    matchLabel,
    noPool,
    onMarketSnapshot,
    recentTrades,
    yesPool,
  ]);

  return (
    <div
      data-testid="solana-clob-panel"
      className={!compact ? "sol-clob-shell" : undefined}
      style={{ display: "grid", gap: 10, position: "relative" }}
    >
      {!compact && (
        <>
          <div className="sol-clob-toolbar">
            <div className="sol-clob-toolbar-copy">
              <span className="sol-clob-toolbar-kicker">
                Solana Prediction Market
              </span>
              <span
                data-testid="solana-clob-match"
                className="sol-clob-toolbar-meta"
              >
                Match: {matchLabel}
              </span>
            </div>
            <button
              data-testid="solana-clob-admin-toggle"
              type="button"
              className="sol-clob-admin-toggle"
              aria-expanded={isAdminPanelOpen}
              onClick={() => setIsAdminPanelOpen((open) => !open)}
            >
              {isAdminPanelOpen ? "Hide Admin" : "Admin"}
            </button>
          </div>

          {isAdminPanelOpen && (
            <section
              data-testid="solana-clob-admin-panel"
              className="sol-clob-admin-panel"
            >
              <div className="sol-clob-admin-panel-header">
                <div className="sol-clob-admin-panel-title">Arena Admin</div>
                <div
                  data-testid="solana-clob-status"
                  className="sol-clob-admin-status"
                >
                  {status}
                </div>
              </div>

              {ENABLE_MANUAL_MARKET_ADMIN_CONTROLS ? (
                <div className="sol-clob-admin-actions">
                  <button
                    data-testid="solana-clob-refresh"
                    type="button"
                    onClick={() => void refreshData()}
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </button>
                  <button
                    data-testid="solana-clob-create-match"
                    type="button"
                    onClick={() => void handleCreateMatch()}
                  >
                    Create Match
                  </button>
                  <button
                    data-testid="solana-clob-resolve"
                    type="button"
                    onClick={() => void handleResolve()}
                    disabled={!activeMatch?.isOpen}
                  >
                    Resolve ({side})
                  </button>
                  <button
                    data-testid="solana-clob-claim"
                    type="button"
                    onClick={() => void handleClaim("manual")}
                  >
                    Claim
                  </button>
                  <button
                    data-testid="solana-clob-cancel-order"
                    type="button"
                    onClick={() => void handleCancelOrder()}
                  >
                    Cancel Last Order
                  </button>
                </div>
              ) : (
                <span className="sol-clob-admin-note">
                  Market lifecycle is automated by the keeper bot.
                </span>
              )}

              <div className="sol-clob-admin-grid">
                <div>{marketFeeSummary}</div>
                <div>
                  Position YES {fmtAmount(position.yesShares).toFixed(4)} | NO{" "}
                  {fmtAmount(position.noShares).toFixed(4)}
                </div>
                <label className="sol-clob-price-input-wrap">
                  <span>Limit Price (1-999)</span>
                  <input
                    data-testid="solana-clob-price-input"
                    type="number"
                    value={priceInput}
                    onChange={(event) => setPriceInput(event.target.value)}
                    min={1}
                    max={999}
                  />
                </label>
                <div>
                  Wallet {walletConnected ? "connected" : "not connected"}
                </div>
              </div>

              <div className="sol-clob-admin-tx-list">
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
                <div data-testid="solana-clob-claim-tx">
                  Claim Tx: {txs.claim}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <PredictionMarketPanel
        compact={compact}
        yesPercent={yesPercent}
        noPercent={noPercent}
        yesPool={fmtAmount(yesPool)}
        noPool={fmtAmount(noPool)}
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
          <button
            type="button"
            data-testid="solana-clob-sell-submit"
            onClick={() => void handlePlaceOrder()}
          >
            Place Limit Order
          </button>
        </div>
      </PredictionMarketPanel>
    </div>
  );
}
