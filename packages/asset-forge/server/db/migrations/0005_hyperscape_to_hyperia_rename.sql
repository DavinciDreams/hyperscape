-- Backfill migration: rename "hyperscape" → "hyperia" across DB-persisted
-- identifiers introduced by migrations 0002/0003/0004.
--
-- Drives the Hyperscape → Hyperia brand rename. The GameModeRegistry keeps
-- backward-compat aliases so clients in flight still resolve, but stored
-- identifiers must be normalized so that new lookups, reports, and joins
-- use the canonical `hyperia` namespace.
--
-- Operations are idempotent (each WHERE clause filters to the pre-rename
-- value) so re-runs are safe.

-- games.module_id
UPDATE "games"
   SET "module_id" = 'hyperia'
 WHERE "module_id" = 'hyperscape';

--> statement-breakpoint

-- games.game_mode JSONB path updates
UPDATE "games"
   SET "game_mode" = jsonb_set("game_mode", '{inputContext}', '"hyperia-default"'::jsonb, true)
 WHERE "game_mode"->>'inputContext' = 'hyperscape-default';

--> statement-breakpoint

-- Normalize default game slug/name created by auth.ts's personal-team seed.
-- Only rewrite rows that still carry the auto-seeded "hyperscape" identifiers.
UPDATE "games"
   SET "slug" = 'hyperia'
 WHERE "slug" = 'hyperscape';

--> statement-breakpoint

UPDATE "games"
   SET "name" = 'Hyperia'
 WHERE "name" = 'Hyperscape';

--> statement-breakpoint

-- Custom game modules that copied the built-in "hyperscape" slug (shouldn't
-- exist because modules.ts reserves it, but harmless to normalize).
UPDATE "game_modules"
   SET "slug" = 'hyperia'
 WHERE "slug" = 'hyperscape';
