/**
 * Game Module Routes — CRUD for custom GameModule definitions within teams
 *
 * Built-in modules (Hyperia) are returned as synthetic entries in list/get
 * responses but are not stored in the database and cannot be modified or deleted.
 *
 * All routes require authentication and team membership.
 */

import { Elysia, t } from "elysia";
import { authDerive, requireAuthGuard } from "../middleware/auth";
import { TeamService } from "../services/TeamService";
import { GameModuleService } from "../services/GameModuleService";
import { AuditLogService } from "../services/AuditLogService";
import {
  loadGameModule,
  ModuleValidationError,
} from "../../src/gameModules/GameModuleLoader";
import { HyperiaModule } from "../../src/gameModules/hyperia/HyperiaModule";
import * as WS from "../models/world-studio.models";
import * as Models from "../models";
import type { GameModuleRow } from "../db/schema";

// ==================== Helpers ====================

/** Generate a unique module ID. */
function generateModuleId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `module_${ts}_${rand}`;
}

/** Derive a URL-safe slug from a display name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/** Format a DB row into the API list response shape. */
function formatModuleRow(row: GameModuleRow) {
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    slug: row.slug,
    version: row.version,
    isBuiltin: row.isBuiltin,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Format a DB row into the API detail response shape (includes moduleData). */
function formatModuleDetailRow(row: GameModuleRow) {
  return {
    ...formatModuleRow(row),
    moduleData: row.moduleData,
  };
}

/** Build the synthetic Hyperia entry for list/get responses. */
function buildHyperiaSyntheticEntry(teamId: string) {
  const now = new Date().toISOString();
  return {
    id: "hyperia",
    teamId,
    name: HyperiaModule.name,
    slug: "hyperia",
    version: HyperiaModule.version,
    isBuiltin: true,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildHyperiaDetailEntry(teamId: string) {
  return {
    ...buildHyperiaSyntheticEntry(teamId),
    moduleData: HyperiaModule,
  };
}

// ==================== Route Factory ====================

export const createModuleRoutes = (
  teamService: TeamService,
  gameModuleService: GameModuleService,
  auditLogService: AuditLogService,
) => {
  return new Elysia({
    prefix: "/api/teams/:teamId/modules",
    name: "module-routes",
  })
    .derive(authDerive)
    .guard({ beforeHandle: [requireAuthGuard] }, (app) =>
      app
        // ==================== LIST ====================
        .get(
          "/",
          async ({ auth, params: { teamId }, set }) => {
            const user = auth.user!;
            const role = await teamService.getMemberRole(teamId, user.id);
            if (!role) {
              set.status = 403;
              return { error: "Not a member of this team" };
            }

            const dbModules = await gameModuleService.listForTeam(teamId);
            const formatted = dbModules.map(formatModuleRow);

            // Prepend the built-in Hyperia module as a synthetic entry
            return [buildHyperiaSyntheticEntry(teamId), ...formatted];
          },
          {
            params: t.Object({ teamId: t.String() }),
            response: {
              200: t.Array(WS.GameModuleResponse),
              403: Models.ErrorResponse,
            },
            detail: {
              tags: ["Game Modules"],
              summary: "List game modules for a team",
              description:
                "Returns all custom modules plus the built-in Hyperia module.",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== GET ====================
        .get(
          "/:moduleId",
          async ({ auth, params: { teamId, moduleId }, set }) => {
            const user = auth.user!;
            const role = await teamService.getMemberRole(teamId, user.id);
            if (!role) {
              set.status = 403;
              return { error: "Not a member of this team" };
            }

            // Handle built-in Hyperia module
            if (moduleId === "hyperia") {
              return buildHyperiaDetailEntry(teamId);
            }

            const row = await gameModuleService.getById(moduleId);
            if (!row || row.teamId !== teamId) {
              set.status = 404;
              return { error: "Module not found" };
            }

            return formatModuleDetailRow(row);
          },
          {
            params: t.Object({ teamId: t.String(), moduleId: t.String() }),
            response: {
              200: WS.GameModuleDetailResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
            },
            detail: {
              tags: ["Game Modules"],
              summary: "Get game module detail with full JSON",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== CREATE ====================
        .post(
          "/",
          async ({ auth, params: { teamId }, body, set }) => {
            const user = auth.user!;
            const hasPermission = await teamService.hasRoleLevel(
              teamId,
              user.id,
              "editor",
            );
            if (!hasPermission) {
              set.status = 403;
              return {
                error: "Editor role or higher required to create modules",
              };
            }

            // Validate the module JSON using loadGameModule
            let validatedModule;
            try {
              validatedModule = loadGameModule(body.moduleData);
            } catch (err) {
              set.status = 422;
              const message =
                err instanceof ModuleValidationError
                  ? err.message
                  : "Invalid module data";
              return { error: message };
            }

            const name = body.name || validatedModule.name;
            const slug = slugify(name);
            const version = body.version || validatedModule.version || "1.0.0";

            // Prevent collision with the built-in "hyperia" slug
            if (slug === "hyperia") {
              set.status = 409;
              return {
                error: 'Slug "hyperia" is reserved for the built-in module',
              };
            }

            // Check slug uniqueness within the team
            const slugTaken = await gameModuleService.slugExists(teamId, slug);
            if (slugTaken) {
              set.status = 409;
              return {
                error: `Module slug "${slug}" already exists in this team`,
              };
            }

            const id = generateModuleId();
            const row = await gameModuleService.create({
              id,
              teamId,
              name,
              slug,
              version,
              moduleData: validatedModule,
              isBuiltin: false,
              createdBy: user.id,
            });

            if (!row) {
              set.status = 500;
              return { error: "Failed to create module" };
            }

            await auditLogService.log({
              teamId,
              userId: user.id,
              action: "module:create",
              targetType: "game_module",
              targetId: row.id,
            });

            set.status = 201;
            return formatModuleDetailRow(row);
          },
          {
            params: t.Object({ teamId: t.String() }),
            body: WS.CreateGameModuleBody,
            response: {
              201: WS.GameModuleDetailResponse,
              403: Models.ErrorResponse,
              409: Models.ErrorResponse,
              422: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["Game Modules"],
              summary: "Create a new game module",
              description:
                "Validates the moduleData JSON using loadGameModule() before storing.",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== UPDATE ====================
        .put(
          "/:moduleId",
          async ({ auth, params: { teamId, moduleId }, body, set }) => {
            const user = auth.user!;
            const hasPermission = await teamService.hasRoleLevel(
              teamId,
              user.id,
              "editor",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "Editor role or higher required" };
            }

            // Prevent editing built-in modules
            if (moduleId === "hyperia") {
              set.status = 403;
              return { error: "Built-in modules cannot be modified" };
            }

            const existing = await gameModuleService.getById(moduleId);
            if (!existing || existing.teamId !== teamId) {
              set.status = 404;
              return { error: "Module not found" };
            }
            if (existing.isBuiltin) {
              set.status = 403;
              return { error: "Built-in modules cannot be modified" };
            }

            // If moduleData is provided, re-validate
            let validatedModuleData: unknown = undefined;
            if (body.moduleData !== undefined) {
              try {
                const validated = loadGameModule(body.moduleData);
                validatedModuleData = validated;
              } catch (err) {
                set.status = 422;
                const message =
                  err instanceof ModuleValidationError
                    ? err.message
                    : "Invalid module data";
                return { error: message };
              }
            }

            // Derive slug if name changed
            let newSlug: string | undefined;
            if (body.name !== undefined) {
              newSlug = slugify(body.name);
              if (newSlug === "hyperia") {
                set.status = 409;
                return {
                  error: 'Slug "hyperia" is reserved for the built-in module',
                };
              }
              if (newSlug !== existing.slug) {
                const slugTaken = await gameModuleService.slugExists(
                  teamId,
                  newSlug,
                );
                if (slugTaken) {
                  set.status = 409;
                  return {
                    error: `Module slug "${newSlug}" already exists in this team`,
                  };
                }
              }
            }

            const updated = await gameModuleService.update(moduleId, {
              name: body.name,
              slug: newSlug,
              version: body.version,
              moduleData: validatedModuleData,
            });

            if (!updated) {
              set.status = 500;
              return { error: "Failed to update module" };
            }

            await auditLogService.log({
              teamId,
              userId: user.id,
              action: "module:update",
              targetType: "game_module",
              targetId: moduleId,
            });

            return formatModuleDetailRow(updated);
          },
          {
            params: t.Object({ teamId: t.String(), moduleId: t.String() }),
            body: WS.UpdateGameModuleBody,
            response: {
              200: WS.GameModuleDetailResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
              409: Models.ErrorResponse,
              422: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["Game Modules"],
              summary: "Update a custom game module",
              description:
                "Re-validates moduleData if provided. Built-in modules cannot be updated.",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== DELETE ====================
        .delete(
          "/:moduleId",
          async ({ auth, params: { teamId, moduleId }, set }) => {
            const user = auth.user!;
            const hasPermission = await teamService.hasRoleLevel(
              teamId,
              user.id,
              "admin",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "Admin role required to delete modules" };
            }

            // Prevent deleting built-in modules
            if (moduleId === "hyperia") {
              set.status = 403;
              return { error: "Built-in modules cannot be deleted" };
            }

            const existing = await gameModuleService.getById(moduleId);
            if (!existing || existing.teamId !== teamId) {
              set.status = 404;
              return { error: "Module not found" };
            }
            if (existing.isBuiltin) {
              set.status = 403;
              return { error: "Built-in modules cannot be deleted" };
            }

            await gameModuleService.delete(moduleId);

            await auditLogService.log({
              teamId,
              userId: user.id,
              action: "module:delete",
              targetType: "game_module",
              targetId: moduleId,
            });

            return { success: true, message: "Module deleted" };
          },
          {
            params: t.Object({ teamId: t.String(), moduleId: t.String() }),
            response: {
              200: Models.SuccessResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
            },
            detail: {
              tags: ["Game Modules"],
              summary: "Delete a custom game module",
              description:
                "Only custom modules can be deleted. Built-in modules are protected.",
              security: [{ BearerAuth: [] }],
            },
          },
        ),
    );
};
