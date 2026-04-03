-- Per-agent opt-out from streaming duel arena matchmaking (dashboard / debugging)

ALTER TABLE "agent_mappings" ADD COLUMN IF NOT EXISTS "streaming_duel_enabled" boolean DEFAULT true NOT NULL;
