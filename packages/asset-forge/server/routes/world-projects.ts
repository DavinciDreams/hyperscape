/**
 * World Project Routes — CRUD + lock/unlock/snapshot for world projects
 * All routes require authentication and team membership with appropriate permissions.
 */

import { Elysia, t } from "elysia";
import { authDerive, requireAuthGuard } from "../middleware/auth";
import { TeamService } from "../services/TeamService";
import { WorldProjectService } from "../services/WorldProjectService";
import { AuditLogService } from "../services/AuditLogService";
import * as WS from "../models/world-studio.models";
import * as Models from "../models";

export const createWorldProjectRoutes = (
  teamService: TeamService,
  worldProjectService: WorldProjectService,
  auditLogService: AuditLogService,
) => {
  return new Elysia({
    prefix: "/api/world/projects",
    name: "world-project-routes",
  })
    .derive(authDerive)
    .guard({ beforeHandle: [requireAuthGuard] }, (app) =>
      app
        // ==================== CRUD ====================

        .post(
          "/",
          async ({ auth, body, set }) => {
            const user = auth.user!;

            // Resolve team from game
            const game = await teamService.getGame(body.gameId);
            if (!game) {
              set.status = 404;
              return { error: "Game not found" };
            }

            const hasPermission = await teamService.hasPermission(
              game.teamId,
              user.id,
              "project:create",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "project:create permission required" };
            }

            const project = await worldProjectService.create({
              teamId: game.teamId,
              gameId: body.gameId,
              name: body.name,
              description: body.description,
              worldData: body.worldData as Record<string, unknown>,
              createdBy: user.id,
            });

            if (!project) {
              set.status = 500;
              return { error: "Failed to create project" };
            }

            await auditLogService.log({
              teamId: game.teamId,
              gameId: body.gameId,
              userId: user.id,
              action: "project:create",
              targetType: "project",
              targetId: project.id,
            });

            return formatProjectResponse(project);
          },
          {
            body: WS.CreateWorldProjectBody,
            response: {
              200: WS.WorldProjectResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["World Projects"],
              summary: "Create a new world project",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        .get(
          "/",
          async ({ auth, query, set }) => {
            const user = auth.user!;
            const { teamId, gameId, limit, offset } = query;

            if (!teamId || !gameId) {
              set.status = 400;
              return { error: "teamId and gameId query params required" };
            }

            const role = await teamService.getMemberRole(teamId, user.id);
            if (!role) {
              set.status = 403;
              return { error: "Not a member of this team" };
            }

            const projects = await worldProjectService.list(teamId, gameId, {
              limit: limit ? parseInt(limit) : undefined,
              offset: offset ? parseInt(offset) : undefined,
            });

            return projects.map(formatProjectResponse);
          },
          {
            query: t.Object({
              teamId: t.String(),
              gameId: t.String(),
              limit: t.Optional(t.String()),
              offset: t.Optional(t.String()),
            }),
            response: {
              200: WS.WorldProjectListResponse,
              400: Models.ErrorResponse,
              403: Models.ErrorResponse,
            },
            detail: {
              tags: ["World Projects"],
              summary: "List world projects for a team + game",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        .get(
          "/:projectId",
          async ({ auth, params: { projectId }, set }) => {
            const user = auth.user!;

            const project = await worldProjectService.getById(projectId);
            if (!project) {
              set.status = 404;
              return { error: "Project not found" };
            }

            const role = await teamService.getMemberRole(
              project.teamId,
              user.id,
            );
            if (!role) {
              set.status = 403;
              return { error: "Not a member of this team" };
            }

            return {
              ...formatProjectResponse(project),
              worldData: project.worldData,
              manifestSnapshot: project.manifestSnapshot,
            };
          },
          {
            params: t.Object({ projectId: t.String() }),
            response: {
              200: WS.WorldProjectDetailResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
            },
            detail: {
              tags: ["World Projects"],
              summary: "Get full world project with data",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        .put(
          "/:projectId",
          async ({ auth, params: { projectId }, body, set }) => {
            const user = auth.user!;

            const existing = await worldProjectService.getById(projectId);
            if (!existing) {
              set.status = 404;
              return { error: "Project not found" };
            }

            const hasPermission = await teamService.hasPermission(
              existing.teamId,
              user.id,
              "project:edit",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "project:edit permission required" };
            }

            try {
              const project = await worldProjectService.save(
                projectId,
                {
                  name: body.name,
                  description: body.description,
                  worldData: body.worldData as
                    | Record<string, unknown>
                    | undefined,
                },
                user.id,
              );

              if (!project) {
                set.status = 500;
                return { error: "Failed to save project" };
              }

              await auditLogService.log({
                teamId: existing.teamId,
                gameId: existing.gameId,
                userId: user.id,
                action: "project:save",
                targetType: "project",
                targetId: projectId,
                details: { version: project.version },
              });

              return formatProjectResponse(project);
            } catch (error) {
              if (error instanceof Error && error.message.includes("locked")) {
                set.status = 409;
                return { error: error.message };
              }
              throw error;
            }
          },
          {
            params: t.Object({ projectId: t.String() }),
            body: WS.UpdateWorldProjectBody,
            response: {
              200: WS.WorldProjectResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
              409: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["World Projects"],
              summary: "Save world project (increments version)",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        .delete(
          "/:projectId",
          async ({ auth, params: { projectId }, set }) => {
            const user = auth.user!;

            const existing = await worldProjectService.getById(projectId);
            if (!existing) {
              set.status = 404;
              return { error: "Project not found" };
            }

            const hasPermission = await teamService.hasPermission(
              existing.teamId,
              user.id,
              "project:delete",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "project:delete permission required" };
            }

            await worldProjectService.delete(projectId);

            await auditLogService.log({
              teamId: existing.teamId,
              gameId: existing.gameId,
              userId: user.id,
              action: "project:delete",
              targetType: "project",
              targetId: projectId,
            });

            return { success: true, message: "Project deleted" };
          },
          {
            params: t.Object({ projectId: t.String() }),
            response: {
              200: Models.SuccessResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
            },
            detail: {
              tags: ["World Projects"],
              summary: "Delete a world project",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== Lock / Unlock ====================

        .post(
          "/:projectId/lock",
          async ({ auth, params: { projectId }, set }) => {
            const user = auth.user!;

            const existing = await worldProjectService.getById(projectId);
            if (!existing) {
              set.status = 404;
              return { error: "Project not found" };
            }

            const role = await teamService.getMemberRole(
              existing.teamId,
              user.id,
            );
            if (!role) {
              set.status = 403;
              return { error: "Not a member of this team" };
            }

            const result = await worldProjectService.acquireLock(
              projectId,
              user.id,
            );
            if (!result.success) {
              set.status = 409;
              return {
                error: `Project is locked by another user: ${result.lockedBy}`,
              };
            }

            return { success: true, message: "Lock acquired" };
          },
          {
            params: t.Object({ projectId: t.String() }),
            response: {
              200: Models.SuccessResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
              409: Models.ErrorResponse,
            },
            detail: {
              tags: ["World Projects"],
              summary: "Acquire edit lock",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        .post(
          "/:projectId/unlock",
          async ({ auth, params: { projectId }, set }) => {
            const user = auth.user!;

            const existing = await worldProjectService.getById(projectId);
            if (!existing) {
              set.status = 404;
              return { error: "Project not found" };
            }

            const released = await worldProjectService.releaseLock(
              projectId,
              user.id,
            );
            if (!released) {
              set.status = 409;
              return { error: "Cannot release lock — held by another user" };
            }

            return { success: true, message: "Lock released" };
          },
          {
            params: t.Object({ projectId: t.String() }),
            response: {
              200: Models.SuccessResponse,
              404: Models.ErrorResponse,
              409: Models.ErrorResponse,
            },
            detail: {
              tags: ["World Projects"],
              summary: "Release edit lock",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== Snapshot ====================

        .post(
          "/:projectId/snapshot",
          async ({ auth, params: { projectId }, body, set }) => {
            const user = auth.user!;

            const existing = await worldProjectService.getById(projectId);
            if (!existing) {
              set.status = 404;
              return { error: "Project not found" };
            }

            const hasPermission = await teamService.hasPermission(
              existing.teamId,
              user.id,
              "project:edit",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "project:edit permission required" };
            }

            const project = await worldProjectService.createSnapshot(
              projectId,
              body.manifestSnapshot as Record<string, unknown>,
            );
            if (!project) {
              set.status = 500;
              return { error: "Failed to create snapshot" };
            }

            await auditLogService.log({
              teamId: existing.teamId,
              gameId: existing.gameId,
              userId: user.id,
              action: "project:snapshot",
              targetType: "project",
              targetId: projectId,
            });

            return formatProjectResponse(project);
          },
          {
            params: t.Object({ projectId: t.String() }),
            body: t.Object({ manifestSnapshot: t.Any() }),
            response: {
              200: WS.WorldProjectResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["World Projects"],
              summary: "Create manifest snapshot",
              security: [{ BearerAuth: [] }],
            },
          },
        ),
    );
};

/** Format a WorldProject row to a JSON-safe response */
function formatProjectResponse(project: {
  id: string;
  teamId: string;
  gameId: string;
  name: string;
  description: string | null;
  version: number;
  createdBy: string | null;
  lockedBy: string | null;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: project.id,
    teamId: project.teamId,
    gameId: project.gameId,
    name: project.name,
    description: project.description,
    version: project.version,
    createdBy: project.createdBy,
    lockedBy: project.lockedBy,
    lockedAt: project.lockedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
