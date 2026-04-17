-- GameMode manifest (UE5-inspired player controller / camera / input / pawn).
-- Adds a JSON column on `games` so each game declares which controller/camera
-- stack the client and PIE should resolve. Existing rows backfill to the
-- Hyperscape default manifest (click-to-walk + orbit + hyperscape-default +
-- humanoid-rpg).
--
-- See `packages/shared/src/gameMode/PLAN.md` Phase 4.

ALTER TABLE "games"
  ADD COLUMN "game_mode" jsonb NOT NULL DEFAULT '{
    "playerController": "click-to-walk",
    "camera": "orbit",
    "inputContext": "hyperscape-default",
    "pawn": "humanoid-rpg"
  }'::jsonb;

--> statement-breakpoint
-- Drop the schema-level default so future inserts must pass a manifest
-- explicitly (server-side route + TeamService.createGame always provide one).
-- Existing rows keep the value the column default backfilled above.
ALTER TABLE "games" ALTER COLUMN "game_mode" DROP DEFAULT;
