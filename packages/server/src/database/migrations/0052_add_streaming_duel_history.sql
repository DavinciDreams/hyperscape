-- Persisted log of streaming duel outcomes (MatchmakingManager inserts after each cycle)

CREATE TABLE IF NOT EXISTS "streaming_duel_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "cycleId" text NOT NULL,
  "duelId" text,
  "finishedAt" bigint NOT NULL,
  "winnerId" text NOT NULL,
  "winnerName" text NOT NULL,
  "loserId" text NOT NULL,
  "loserName" text NOT NULL,
  "winReason" text NOT NULL,
  "damageWinner" integer DEFAULT 0 NOT NULL,
  "damageLoser" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_streaming_duel_history_finished" ON "streaming_duel_history" USING btree ("finishedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_streaming_duel_history_winner" ON "streaming_duel_history" USING btree ("winnerId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_streaming_duel_history_loser" ON "streaming_duel_history" USING btree ("loserId");
