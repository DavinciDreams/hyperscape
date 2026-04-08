-- Persistent agent thought/decision log
-- Survives server restarts; in-memory ServerNetwork.agentThoughts is the hot cache.

CREATE TABLE IF NOT EXISTS "agent_thoughts" (
  "id" serial PRIMARY KEY,
  "character_id" text NOT NULL,
  "type" text NOT NULL,
  "content" text NOT NULL,
  "decision_path" text,
  "timestamp" bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_agent_thoughts_char_ts" ON "agent_thoughts" ("character_id", "timestamp");
