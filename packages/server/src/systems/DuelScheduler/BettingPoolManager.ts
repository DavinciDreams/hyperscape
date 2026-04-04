/**
 * BettingPoolManager — Handles bet placement, pool aggregation, and claim creation
 *
 * Works with the DuelBettingBridge for market lifecycle and the solanaBets/solanaPayoutJobs
 * tables for persistence. Emits betting:pool:updated events on the World.
 */

import type { World } from "@hyperscape/shared";
import { eq, and, sql } from "drizzle-orm";
import { getDatabase } from "../../database/client.js";
import {
  solanaBets,
  solanaPayoutJobs,
  arenaRounds,
} from "../../database/schema.js";
import { Logger } from "../ServerNetwork/services";
import { randomUUID } from "node:crypto";

export interface BetPlacement {
  roundId: string;
  side: "A" | "B";
  amount: string; // string to preserve precision
  walletAddress: string;
}

export interface PoolState {
  roundId: string;
  sideATotal: string;
  sideBTotal: string;
  sideACount: number;
  sideBCount: number;
}

export interface BetRecord {
  id: string;
  roundId: string;
  side: string;
  amount: string;
  walletAddress: string;
  status: string;
  createdAt: number;
}

export class BettingPoolManager {
  private readonly world: World;

  constructor(world: World) {
    this.world = world;
  }

  /**
   * Place a bet on a duel market.
   */
  async placeBet(
    bet: BetPlacement,
  ): Promise<{ success: boolean; error?: string; betId?: string }> {
    const db = getDatabase();

    // Verify the round exists and is in betting phase
    const bridge = (
      this.world as World & {
        duelBettingBridge?: {
          getMarket(id: string): { status: string } | null;
        };
      }
    ).duelBettingBridge;
    const market = bridge?.getMarket(bet.roundId);

    if (!market) {
      return { success: false, error: "Market not found" };
    }

    if (market.status !== "betting") {
      return {
        success: false,
        error: `Market is ${market.status}, betting is closed`,
      };
    }

    const amount = parseFloat(bet.amount);
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Invalid bet amount" };
    }

    const betId = randomUUID();
    try {
      await db.insert(solanaBets).values({
        id: betId,
        roundId: bet.roundId,
        bettorWallet: bet.walletAddress,
        side: bet.side,
        sourceAsset: "GOLD",
        sourceAmount: bet.amount,
        goldAmount: bet.amount,
        status: "CONFIRMED",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (err) {
      Logger.error(
        "BettingPoolManager",
        "Failed to insert bet",
        err instanceof Error ? err : null,
        { roundId: bet.roundId, wallet: bet.walletAddress },
      );
      return { success: false, error: "Database error" };
    }

    // Emit pool update
    const pool = await this.getPool(bet.roundId);
    if (pool) {
      this.world.emit("betting:pool:updated", {
        roundId: bet.roundId,
        sideATotal: pool.sideATotal,
        sideBTotal: pool.sideBTotal,
        sideACount: pool.sideACount,
        sideBCount: pool.sideBCount,
      });
    }

    Logger.info("BettingPoolManager", "Bet placed", {
      betId,
      roundId: bet.roundId,
      side: bet.side,
      amount: bet.amount,
      wallet: bet.walletAddress,
    });

    return { success: true, betId };
  }

  /**
   * Get aggregated pool totals for a round.
   */
  async getPool(roundId: string): Promise<PoolState | null> {
    const db = getDatabase();

    try {
      const result = await db
        .select({
          side: solanaBets.side,
          total: sql<string>`COALESCE(SUM(CAST(${solanaBets.goldAmount} AS NUMERIC)), 0)::TEXT`,
          count: sql<number>`COUNT(*)::INT`,
        })
        .from(solanaBets)
        .where(
          and(
            eq(solanaBets.roundId, roundId),
            eq(solanaBets.status, "CONFIRMED"),
          ),
        )
        .groupBy(solanaBets.side);

      const pool: PoolState = {
        roundId,
        sideATotal: "0",
        sideBTotal: "0",
        sideACount: 0,
        sideBCount: 0,
      };

      for (const row of result) {
        if (row.side === "A") {
          pool.sideATotal = row.total;
          pool.sideACount = row.count;
        } else if (row.side === "B") {
          pool.sideBTotal = row.total;
          pool.sideBCount = row.count;
        }
      }

      return pool;
    } catch (err) {
      Logger.error(
        "BettingPoolManager",
        "Failed to get pool",
        err instanceof Error ? err : null,
        { roundId },
      );
      return null;
    }
  }

  /**
   * Get bet history for a wallet.
   */
  async getBetsByWallet(
    walletAddress: string,
    limit = 50,
  ): Promise<BetRecord[]> {
    const db = getDatabase();

    try {
      const rows = await db
        .select({
          id: solanaBets.id,
          roundId: solanaBets.roundId,
          side: solanaBets.side,
          amount: solanaBets.goldAmount,
          walletAddress: solanaBets.bettorWallet,
          status: solanaBets.status,
          createdAt: solanaBets.createdAt,
        })
        .from(solanaBets)
        .where(eq(solanaBets.bettorWallet, walletAddress))
        .orderBy(sql`${solanaBets.createdAt} DESC`)
        .limit(limit);

      return rows;
    } catch (err) {
      Logger.error(
        "BettingPoolManager",
        "Failed to get bets by wallet",
        err instanceof Error ? err : null,
        { walletAddress },
      );
      return [];
    }
  }

  /**
   * Create a claim/payout job for a winning bettor.
   */
  async createClaimJob(
    roundId: string,
    walletAddress: string,
  ): Promise<{ success: boolean; error?: string; jobId?: string }> {
    const db = getDatabase();

    // Verify they have a winning bet
    const bets = await db
      .select()
      .from(solanaBets)
      .where(
        and(
          eq(solanaBets.roundId, roundId),
          eq(solanaBets.bettorWallet, walletAddress),
          eq(solanaBets.status, "CONFIRMED"),
        ),
      )
      .limit(1);

    if (bets.length === 0) {
      return { success: false, error: "No confirmed bet found for this round" };
    }

    // Check if payout job already exists
    const existing = await db
      .select()
      .from(solanaPayoutJobs)
      .where(
        and(
          eq(solanaPayoutJobs.roundId, roundId),
          eq(solanaPayoutJobs.bettorWallet, walletAddress),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return { success: true, jobId: existing[0].id };
    }

    const jobId = randomUUID();
    try {
      await db.insert(solanaPayoutJobs).values({
        id: jobId,
        roundId,
        bettorWallet: walletAddress,
        status: "PENDING",
        attempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (err) {
      Logger.error(
        "BettingPoolManager",
        "Failed to create payout job",
        err instanceof Error ? err : null,
        { roundId, wallet: walletAddress },
      );
      return { success: false, error: "Database error" };
    }

    Logger.info("BettingPoolManager", "Claim job created", {
      jobId,
      roundId,
      wallet: walletAddress,
    });

    return { success: true, jobId };
  }

  /**
   * Get leaderboard — top bettors by total winnings.
   */
  async getLeaderboard(
    limit = 20,
  ): Promise<
    Array<{ wallet: string; totalBets: number; totalWagered: string }>
  > {
    const db = getDatabase();

    try {
      const rows = await db
        .select({
          wallet: solanaBets.bettorWallet,
          totalBets: sql<number>`COUNT(*)::INT`,
          totalWagered: sql<string>`COALESCE(SUM(CAST(${solanaBets.goldAmount} AS NUMERIC)), 0)::TEXT`,
        })
        .from(solanaBets)
        .where(eq(solanaBets.status, "CONFIRMED"))
        .groupBy(solanaBets.bettorWallet)
        .orderBy(sql`SUM(CAST(${solanaBets.goldAmount} AS NUMERIC)) DESC`)
        .limit(limit);

      return rows;
    } catch (err) {
      Logger.error(
        "BettingPoolManager",
        "Failed to get leaderboard",
        err instanceof Error ? err : null,
      );
      return [];
    }
  }
}
