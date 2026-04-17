/**
 * Script Routes — CRUD for standalone visual scripting graphs.
 *
 * Routes are team-scoped:
 *   GET    /api/teams/:teamId/scripts               list visible scripts
 *   GET    /api/teams/:teamId/scripts/templates     list public templates
 *   GET    /api/teams/:teamId/scripts/:scriptId     get detail + graphData
 *   POST   /api/teams/:teamId/scripts               create (editor: "Save to library")
 *   PUT    /api/teams/:teamId/scripts/:scriptId     update
 *   DELETE /api/teams/:teamId/scripts/:scriptId     delete
 *   POST   /api/teams/:teamId/scripts/:scriptId/clone   clone into this team
 *
 * All routes require authentication + team membership. Editor+ is required
 * to create/update; admin to delete. Graphs are validated by
 * `scriptGraphValidator` before insert/update.
 */

import { Elysia, t } from "elysia";
import { authDerive, requireAuthGuard } from "../middleware/auth";
import { TeamService } from "../services/TeamService";
import { ScriptService } from "../services/ScriptService";
import { AuditLogService } from "../services/AuditLogService";
import { validateScriptGraph } from "../utils/scriptGraphValidator";
import * as WS from "../models/world-studio.models";
import * as Models from "../models";
import type { ScriptRow } from "../db/schema";

// ==================== Helpers ====================

function generateScriptId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `script_${ts}_${rand}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function formatScriptRow(row: ScriptRow) {
  return {
    id: row.id,
    teamId: row.teamId,
    gameId: row.gameId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    version: row.version,
    isTemplate: row.isTemplate,
    isPublic: row.isPublic,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatScriptDetailRow(row: ScriptRow) {
  return { ...formatScriptRow(row), graphData: row.graphData };
}

// ==================== Route Factory ====================

export const createScriptRoutes = (
  teamService: TeamService,
  scriptService: ScriptService,
  auditLogService: AuditLogService,
) => {
  return new Elysia({
    prefix: "/api/teams/:teamId/scripts",
    name: "script-routes",
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
            const rows = await scriptService.listForTeam(teamId);
            return rows.map(formatScriptRow);
          },
          {
            params: t.Object({ teamId: t.String() }),
            response: {
              200: t.Array(WS.ScriptResponse),
              403: Models.ErrorResponse,
            },
            detail: {
              tags: ["Scripts"],
              summary:
                "List scripts for a team (includes public + template scripts)",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== LIST TEMPLATES ====================
        .get(
          "/templates",
          async ({ auth, params: { teamId }, set }) => {
            const user = auth.user!;
            const role = await teamService.getMemberRole(teamId, user.id);
            if (!role) {
              set.status = 403;
              return { error: "Not a member of this team" };
            }
            const rows = await scriptService.listTemplates();
            return rows.map(formatScriptRow);
          },
          {
            params: t.Object({ teamId: t.String() }),
            response: {
              200: t.Array(WS.ScriptResponse),
              403: Models.ErrorResponse,
            },
            detail: {
              tags: ["Scripts"],
              summary: "List public script templates",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== GET ====================
        .get(
          "/:scriptId",
          async ({ auth, params: { teamId, scriptId }, set }) => {
            const user = auth.user!;
            const role = await teamService.getMemberRole(teamId, user.id);
            if (!role) {
              set.status = 403;
              return { error: "Not a member of this team" };
            }
            const row = await scriptService.getById(scriptId);
            if (!row) {
              set.status = 404;
              return { error: "Script not found" };
            }
            // Visible if team-owned OR public OR template
            const visible =
              row.teamId === teamId || row.isPublic || row.isTemplate;
            if (!visible) {
              set.status = 404;
              return { error: "Script not found" };
            }
            return formatScriptDetailRow(row);
          },
          {
            params: t.Object({ teamId: t.String(), scriptId: t.String() }),
            response: {
              200: WS.ScriptDetailResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
            },
            detail: {
              tags: ["Scripts"],
              summary: "Get script detail with full graph JSON",
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
                error: "Editor role or higher required to create scripts",
              };
            }

            // Validate graph JSON
            const validation = validateScriptGraph(body.graphData);
            if (!validation.valid) {
              set.status = 422;
              return {
                error: `Invalid script graph: ${validation.errors.join("; ")}`,
              };
            }

            const name = body.name;
            const slug = slugify(name);
            const version = body.version || "1.0.0";
            const gameId = body.gameId ?? null;

            const slugTaken = await scriptService.slugExists(
              teamId,
              gameId,
              slug,
            );
            if (slugTaken) {
              set.status = 409;
              return {
                error: `Script slug "${slug}" already exists in this scope`,
              };
            }

            const id = generateScriptId();
            const row = await scriptService.create({
              id,
              teamId,
              gameId,
              name,
              slug,
              description: body.description ?? null,
              version,
              graphData: body.graphData,
              isTemplate: body.isTemplate ?? false,
              isPublic: body.isPublic ?? false,
              createdBy: user.id,
            });

            if (!row) {
              set.status = 500;
              return { error: "Failed to create script" };
            }

            await auditLogService.log({
              teamId,
              userId: user.id,
              action: "script:create",
              targetType: "script",
              targetId: row.id,
            });

            set.status = 201;
            return formatScriptDetailRow(row);
          },
          {
            params: t.Object({ teamId: t.String() }),
            body: WS.CreateScriptBody,
            response: {
              201: WS.ScriptDetailResponse,
              403: Models.ErrorResponse,
              409: Models.ErrorResponse,
              422: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["Scripts"],
              summary: "Create a new script",
              description:
                "Validates graphData via scriptGraphValidator before storing.",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== UPDATE ====================
        .put(
          "/:scriptId",
          async ({ auth, params: { teamId, scriptId }, body, set }) => {
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

            const existing = await scriptService.getById(scriptId);
            if (!existing || existing.teamId !== teamId) {
              set.status = 404;
              return { error: "Script not found" };
            }

            // Re-validate graphData if supplied
            if (body.graphData !== undefined) {
              const validation = validateScriptGraph(body.graphData);
              if (!validation.valid) {
                set.status = 422;
                return {
                  error: `Invalid script graph: ${validation.errors.join("; ")}`,
                };
              }
            }

            // Derive new slug if name changed
            let newSlug: string | undefined;
            if (body.name !== undefined) {
              newSlug = slugify(body.name);
              if (newSlug !== existing.slug) {
                const slugTaken = await scriptService.slugExists(
                  teamId,
                  existing.gameId,
                  newSlug,
                );
                if (slugTaken) {
                  set.status = 409;
                  return {
                    error: `Script slug "${newSlug}" already exists in this scope`,
                  };
                }
              }
            }

            const updated = await scriptService.update(scriptId, {
              name: body.name,
              slug: newSlug,
              description: body.description,
              version: body.version,
              graphData: body.graphData,
              isTemplate: body.isTemplate,
              isPublic: body.isPublic,
            });
            if (!updated) {
              set.status = 500;
              return { error: "Failed to update script" };
            }

            await auditLogService.log({
              teamId,
              userId: user.id,
              action: "script:update",
              targetType: "script",
              targetId: scriptId,
            });

            return formatScriptDetailRow(updated);
          },
          {
            params: t.Object({ teamId: t.String(), scriptId: t.String() }),
            body: WS.UpdateScriptBody,
            response: {
              200: WS.ScriptDetailResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
              409: Models.ErrorResponse,
              422: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["Scripts"],
              summary: "Update a script",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== DELETE ====================
        .delete(
          "/:scriptId",
          async ({ auth, params: { teamId, scriptId }, set }) => {
            const user = auth.user!;
            const hasPermission = await teamService.hasRoleLevel(
              teamId,
              user.id,
              "admin",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "Admin role required to delete scripts" };
            }

            const existing = await scriptService.getById(scriptId);
            if (!existing || existing.teamId !== teamId) {
              set.status = 404;
              return { error: "Script not found" };
            }

            await scriptService.delete(scriptId);
            await auditLogService.log({
              teamId,
              userId: user.id,
              action: "script:delete",
              targetType: "script",
              targetId: scriptId,
            });

            return { success: true, message: "Script deleted" };
          },
          {
            params: t.Object({ teamId: t.String(), scriptId: t.String() }),
            response: {
              200: Models.SuccessResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
            },
            detail: {
              tags: ["Scripts"],
              summary: "Delete a script",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== CLONE ====================
        .post(
          "/:scriptId/clone",
          async ({ auth, params: { teamId, scriptId }, body, set }) => {
            const user = auth.user!;
            const hasPermission = await teamService.hasRoleLevel(
              teamId,
              user.id,
              "editor",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "Editor role or higher required to clone" };
            }

            const source = await scriptService.getById(scriptId);
            if (!source) {
              set.status = 404;
              return { error: "Source script not found" };
            }
            // Source must be visible to this team
            const visible =
              source.teamId === teamId || source.isPublic || source.isTemplate;
            if (!visible) {
              set.status = 404;
              return { error: "Source script not found" };
            }

            const name = body.name ?? `${source.name} (copy)`;
            const slug = slugify(name);
            const gameId = body.gameId ?? null;

            // Handle slug collision by appending a short suffix
            let finalSlug = slug;
            let attempt = 0;
            while (await scriptService.slugExists(teamId, gameId, finalSlug)) {
              attempt += 1;
              finalSlug = `${slug}-${attempt}`;
              if (attempt > 20) {
                set.status = 409;
                return { error: "Could not derive a unique slug" };
              }
            }

            const id = generateScriptId();
            const row = await scriptService.create({
              id,
              teamId,
              gameId,
              name,
              slug: finalSlug,
              description: source.description,
              version: "1.0.0",
              graphData: source.graphData,
              isTemplate: false,
              isPublic: false,
              createdBy: user.id,
            });

            if (!row) {
              set.status = 500;
              return { error: "Failed to clone script" };
            }

            await auditLogService.log({
              teamId,
              userId: user.id,
              action: "script:clone",
              targetType: "script",
              targetId: row.id,
            });

            set.status = 201;
            return formatScriptDetailRow(row);
          },
          {
            params: t.Object({ teamId: t.String(), scriptId: t.String() }),
            body: WS.CloneScriptBody,
            response: {
              201: WS.ScriptDetailResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
              409: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["Scripts"],
              summary: "Clone a script into the current team",
              security: [{ BearerAuth: [] }],
            },
          },
        ),
    );
};
