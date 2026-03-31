-- World Studio Foundation: Accounts, Teams, Projects, Deployments, Audit
-- Phase 1 of the World Builder plan

-- Forge Users (separate from legacy 'users' table)
CREATE TABLE "forge_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"privy_user_id" text UNIQUE,
	"email" text,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_forge_users_privy" ON "forge_users" USING btree ("privy_user_id");

--> statement-breakpoint
-- Teams (organizations)
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text UNIQUE NOT NULL,
	"description" text,
	"avatar_url" text,
	"created_by" uuid,
	"plan" text DEFAULT 'free' NOT NULL,
	"ai_budget_monthly_cents" integer DEFAULT 5000 NOT NULL,
	"ai_spent_this_month_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_forge_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."forge_users"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
-- Games (a team can have multiple games)
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"staging_server_url" text,
	"staging_assets_path" text,
	"production_server_url" text,
	"production_assets_path" text,
	"staging_admin_code" text,
	"production_admin_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_team_slug_unique" UNIQUE("team_id","slug")
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
-- Team Members
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_by" uuid,
	CONSTRAINT "team_members_team_user_unique" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_forge_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."forge_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_invited_by_forge_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."forge_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_team_members_user" ON "team_members" USING btree ("user_id");

--> statement-breakpoint
-- Team Invites
CREATE TABLE "team_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"invited_by" uuid,
	"token" text UNIQUE NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "team_invites_team_email_unique" UNIQUE("team_id","email")
);
--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_invited_by_forge_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."forge_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invites_token" ON "team_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_invites_email" ON "team_invites" USING btree ("email","team_id");

--> statement-breakpoint
-- Team Permissions (granular overrides)
CREATE TABLE "team_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_permissions_unique" UNIQUE("team_id","user_id","permission")
);
--> statement-breakpoint
ALTER TABLE "team_permissions" ADD CONSTRAINT "team_permissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_permissions" ADD CONSTRAINT "team_permissions_user_id_forge_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."forge_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_permissions" ADD CONSTRAINT "team_permissions_granted_by_forge_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."forge_users"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
-- World Projects
CREATE TABLE "world_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"world_data" jsonb NOT NULL,
	"manifest_snapshot" jsonb,
	"locked_by" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "world_projects" ADD CONSTRAINT "world_projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_projects" ADD CONSTRAINT "world_projects_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_projects" ADD CONSTRAINT "world_projects_created_by_forge_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."forge_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_projects" ADD CONSTRAINT "world_projects_locked_by_forge_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."forge_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_projects_team_game" ON "world_projects" USING btree ("team_id","game_id");--> statement-breakpoint
CREATE INDEX "idx_projects_updated" ON "world_projects" USING btree ("updated_at");

--> statement-breakpoint
-- World Deployments
CREATE TABLE "world_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"target" text NOT NULL,
	"version" integer NOT NULL,
	"manifest_diff" jsonb,
	"asset_diff" jsonb,
	"deployed_by" uuid,
	"approved_by" uuid,
	"rollback_data" jsonb,
	"deployed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "world_deployments" ADD CONSTRAINT "world_deployments_project_id_world_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."world_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_deployments" ADD CONSTRAINT "world_deployments_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_deployments" ADD CONSTRAINT "world_deployments_deployed_by_forge_users_id_fk" FOREIGN KEY ("deployed_by") REFERENCES "public"."forge_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_deployments" ADD CONSTRAINT "world_deployments_approved_by_forge_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."forge_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deployments_project" ON "world_deployments" USING btree ("project_id","deployed_at");--> statement-breakpoint
CREATE INDEX "idx_deployments_game_target" ON "world_deployments" USING btree ("game_id","target","deployed_at");

--> statement-breakpoint
-- Audit Log (separate from legacy 'activity_log' table)
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid,
	"game_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_forge_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."forge_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_team" ON "audit_log" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_user" ON "audit_log" USING btree ("user_id","created_at");
