/**
 * PayoutKeeper — Processes solanaPayoutJobs and sends winnings to bettors.
 *
 * Custodial model for launch: the server's operator wallet sends SOL/tokens
 * to winning bettors. The fight oracle records results on-chain for verifiability.
 *
 * Polls the solanaPayoutJobs table every 5s for PENDING entries.
 * Implements exponential backoff on failure, max 5 attempts.
 */

import { eq, and, sql } from "drizzle-orm";
import { getDatabase } from "../../database/client.js";
import {
  solanaPayoutJobs,
  solanaBets,
  arenaRounds,
} from "../../database/schema.js";
import { Logger } from "../ServerNetwork/services";

const POLL_INTERVAL_MS = 5_000;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 10_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;

/**
 * Start the payout keeper polling loop.
 */
export function startPayoutKeeper(): void {
  if (pollTimer) return;

  Logger.info("PayoutKeeper", "Starting payout keeper");

  // Initial run
  void processJobs();

  pollTimer = setInterval(() => {
    void processJobs();
  }, POLL_INTERVAL_MS);
  pollTimer.unref();
}

/**
 * Stop the payout keeper.
 */
export function stopPayoutKeeper(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  Logger.info("PayoutKeeper", "Payout keeper stopped");
}

async function processJobs(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    const db = getDatabase();
    const now = Date.now();

    // Fetch PENDING jobs that are due for processing
    const jobs = await db
      .select()
      .from(solanaPayoutJobs)
      .where(
        and(
          eq(solanaPayoutJobs.status, "PENDING"),
          sql`(${solanaPayoutJobs.nextAttemptAt} IS NULL OR ${solanaPayoutJobs.nextAttemptAt} <= ${now})`,
        ),
      )
      .limit(10);

    for (const job of jobs) {
      await processOneJob(db, job);
    }
  } catch (err) {
    Logger.error(
      "PayoutKeeper",
      "Job processing loop failed",
      err instanceof Error ? err : null,
    );
  } finally {
    processing = false;
  }
}

async function processOneJob(
  db: ReturnType<typeof getDatabase>,
  job: typeof solanaPayoutJobs.$inferSelect,
): Promise<void> {
  try {
    // Look up the round to check if it's resolved and who won
    const rounds = await db
      .select()
      .from(arenaRounds)
      .where(eq(arenaRounds.id, job.roundId))
      .limit(1);

    if (rounds.length === 0) {
      await markFailed(db, job.id, "Round not found");
      return;
    }

    const round = rounds[0];
    if (!round.winnerId) {
      // Round not resolved yet — schedule retry
      await scheduleRetry(db, job.id, job.attempts, "Round not yet resolved");
      return;
    }

    // Get the bettor's bets for this round
    const bets = await db
      .select()
      .from(solanaBets)
      .where(
        and(
          eq(solanaBets.roundId, job.roundId),
          eq(solanaBets.bettorWallet, job.bettorWallet),
          eq(solanaBets.status, "CONFIRMED"),
        ),
      );

    if (bets.length === 0) {
      await markFailed(db, job.id, "No confirmed bets found");
      return;
    }

    // Determine if this bettor won
    // Agent A is the round's agentAId, Agent B is agentBId
    const winningSide =
      round.winnerId === round.agentAId
        ? "A"
        : round.winnerId === round.agentBId
          ? "B"
          : null;
    if (!winningSide) {
      await markFailed(db, job.id, "Round winner does not match either side");
      return;
    }
    const userBetOnWinner = bets.some((b) => b.side === winningSide);

    if (!userBetOnWinner) {
      // Bettor lost — mark job as complete (no payout needed)
      await db
        .update(solanaPayoutJobs)
        .set({ status: "NO_PAYOUT", updatedAt: Date.now() })
        .where(eq(solanaPayoutJobs.id, job.id));

      Logger.info("PayoutKeeper", "Bettor lost — no payout", {
        jobId: job.id,
        wallet: job.bettorWallet,
        roundId: job.roundId,
      });
      return;
    }

    // Calculate payout: (user's winning bet / total winning pool) * total pool
    // For now, mark as READY_FOR_PAYOUT — actual transfer will be implemented
    // when the token infrastructure is connected
    await db
      .update(solanaPayoutJobs)
      .set({
        status: "READY_FOR_PAYOUT",
        updatedAt: Date.now(),
      })
      .where(eq(solanaPayoutJobs.id, job.id));

    Logger.info("PayoutKeeper", "Payout job marked ready", {
      jobId: job.id,
      wallet: job.bettorWallet,
      roundId: job.roundId,
      winningSide,
    });

    // Payout transfer plumbing is not wired in this branch yet. The keeper
    // intentionally stops at READY_FOR_PAYOUT after recording the winner so a
    // transfer-capable follow-up can calculate the final amount, submit the
    // Solana transfer, persist claimSignature, and then mark COMPLETE.
  } catch (err) {
    Logger.error(
      "PayoutKeeper",
      "Failed to process job",
      err instanceof Error ? err : null,
      { jobId: job.id, roundId: job.roundId },
    );
    await scheduleRetry(
      db,
      job.id,
      job.attempts,
      err instanceof Error ? err.message : "Unknown error",
    );
  }
}

async function scheduleRetry(
  db: ReturnType<typeof getDatabase>,
  jobId: string,
  currentAttempts: number,
  error: string,
): Promise<void> {
  const nextAttempt = currentAttempts + 1;

  if (nextAttempt >= MAX_ATTEMPTS) {
    await markFailed(db, jobId, error);
    return;
  }

  const backoff = BASE_BACKOFF_MS * Math.pow(2, currentAttempts);
  const nextAttemptAt = Date.now() + backoff;

  await db
    .update(solanaPayoutJobs)
    .set({
      attempts: nextAttempt,
      lastError: error,
      nextAttemptAt,
      updatedAt: Date.now(),
    })
    .where(eq(solanaPayoutJobs.id, jobId));

  Logger.warn("PayoutKeeper", "Scheduled retry", {
    jobId,
    attempt: nextAttempt,
    backoffMs: backoff,
    error,
  });
}

async function markFailed(
  db: ReturnType<typeof getDatabase>,
  jobId: string,
  error: string,
): Promise<void> {
  await db
    .update(solanaPayoutJobs)
    .set({
      status: "FAILED",
      lastError: error,
      updatedAt: Date.now(),
    })
    .where(eq(solanaPayoutJobs.id, jobId));

  Logger.error("PayoutKeeper", "Job permanently failed", null, {
    jobId,
    error,
  });
}
