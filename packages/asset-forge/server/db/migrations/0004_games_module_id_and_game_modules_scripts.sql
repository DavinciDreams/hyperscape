-- Adds the `games.module_id` column introduced by the GameModule feature
-- (commits 6e252e9c9 / 2419c6581) and the new `game_modules` / `scripts`
-- tables. Without this migration Drizzle's generated SELECT for the games
-- list fails — the schema expects `module_id` but the column never made it
-- into a migration, so GET /api/teams/:teamId/games returns an error and the
-- editor's "New World" button is left disabled (no selectedGameId).
--
-- Backfill existing rows with the default "hyperscape" module so the NOT NULL
-- constraint is satisfiable. New rows get the default via the column default
-- (we keep the default in place so application code does not need to pass
-- moduleId on every insert).

ALTER TABLE "games"
  ADD COLUMN "module_id" text NOT NULL DEFAULT 'hyperscape';

--> statement-breakpoint

-- Game Modules table: stores custom GameModule JSON definitions per team.
-- Built-in modules (e.g. Hyperscape) are NOT stored here — they are
-- returned as synthetic entries by the API.
CREATE TABLE "game_modules" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "version" text NOT NULL DEFAULT '1.0.0',
  "module_data" jsonb NOT NULL,
  "is_builtin" boolean NOT NULL DEFAULT false,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "game_modules_team_slug_unique" UNIQUE("team_id","slug")
);

--> statement-breakpoint

ALTER TABLE "game_modules"
  ADD CONSTRAINT "game_modules_team_id_teams_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id")
  ON DELETE cascade ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "game_modules"
  ADD CONSTRAINT "game_modules_created_by_forge_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."forge_users"("id")
  ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

CREATE INDEX "idx_game_modules_team" ON "game_modules" USING btree ("team_id");

--> statement-breakpoint

-- Scripts table: standalone visual-script graphs referenced by world
-- entities (entity.scriptRef = { scriptId, version }).
CREATE TABLE "scripts" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" uuid NOT NULL,
  "game_id" text,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "version" text NOT NULL DEFAULT '1.0.0',
  "graph_data" jsonb NOT NULL,
  "is_template" boolean NOT NULL DEFAULT false,
  "is_public" boolean NOT NULL DEFAULT false,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scripts_team_game_slug_unique" UNIQUE("team_id","game_id","slug")
);

--> statement-breakpoint

ALTER TABLE "scripts"
  ADD CONSTRAINT "scripts_team_id_teams_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id")
  ON DELETE cascade ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "scripts"
  ADD CONSTRAINT "scripts_created_by_forge_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."forge_users"("id")
  ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

CREATE INDEX "idx_scripts_team" ON "scripts" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX "idx_scripts_game" ON "scripts" USING btree ("game_id");
--> statement-breakpoint
CREATE INDEX "idx_scripts_public" ON "scripts" USING btree ("is_public");
--> statement-breakpoint
CREATE INDEX "idx_scripts_template" ON "scripts" USING btree ("is_template");
