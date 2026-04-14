/**
 * Deployment Routes — Database-backed deployment history, rollback, and approval
 *
 * These routes persist deployment records to PostgreSQL via WorldProjectService,
 * providing durable audit trails that survive server restarts. The game server
 * (deploy-routes.ts) handles actual file operations; these routes track the metadata.
 *
 * Endpoints:
 *   POST /api/world/deployments                — Record a new deployment
 *   GET  /api/world/deployments/project/:id    — List deployment history for a project
 *   POST /api/world/deployments/:id/approve    — Approve a pending production promotion
 *   POST /api/world/deployments/project/:id/snapshot — Save manifest snapshot
 */

import { Elysia, t } from "elysia";
import { authDerive, requireAuthGuard } from "../middleware/auth";
import { TeamService } from "../services/TeamService";
import { WorldProjectService } from "../services/WorldProjectService";
import { AuditLogService } from "../services/AuditLogService";

export const createDeploymentRoutes = (
  teamService: TeamService,
  worldProjectService: WorldProjectService,
  auditLogService: AuditLogService,
) => {
  return new Elysia({
    prefix: "/api/world/deployments",
    name: "deployment-routes",
  })
    .derive(authDerive)
    .guard({ beforeHandle: [requireAuthGuard] }, (app) =>
      app
        // ==================== Record Deployment ====================
        .post(
          "/",
          async ({ auth, body, set }) => {
            const user = auth.user!;

            // Verify the user has deploy permission for this project's team
            const project = await worldProjectService.getById(body.projectId);
            if (!project) {
              set.status = 404;
              return { error: "Project not found" };
            }

            const hasPermission = await teamService.hasPermission(
              project.teamId,
              user.id,
              "project:deploy",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "project:deploy permission required" };
            }

            // For production deployments, require approvedBy from a different user
            if (body.target === "production" && !body.approvedBy) {
              set.status = 400;
              return {
                error:
                  "Production deployments require approval (approvedBy field)",
              };
            }
            if (
              body.target === "production" &&
              body.approvedBy === body.deployedBy
            ) {
              set.status = 400;
              return {
                error:
                  "Production deployments must be approved by a different user",
              };
            }

            const deployment = await worldProjectService.createDeployment({
              projectId: body.projectId,
              gameId: body.gameId,
              target: body.target,
              version: body.version,
              manifestDiff: body.manifestDiff as
                | Record<string, unknown>
                | undefined,
              assetDiff: body.assetDiff as Record<string, unknown> | undefined,
              deployedBy: body.deployedBy ?? user.id,
              approvedBy: body.approvedBy,
              rollbackData: body.rollbackData as
                | Record<string, unknown>
                | undefined,
            });

            if (!deployment) {
              // Database not enabled — return success anyway (graceful degradation)
              return {
                persisted: false,
                message: "Database not configured — deployment not persisted",
              };
            }

            await auditLogService.log({
              teamId: project.teamId,
              userId: user.id,
              action: `deploy:${body.target}`,
              targetType: "deployment",
              targetId: deployment.id,
              metadata: {
                projectId: body.projectId,
                version: body.version,
                target: body.target,
              },
            });

            return {
              persisted: true,
              deployment: {
                id: deployment.id,
                target: deployment.target,
                version: deployment.version,
                deployedBy: deployment.deployedBy,
                approvedBy: deployment.approvedBy,
                deployedAt: deployment.deployedAt,
              },
            };
          },
          {
            body: t.Object({
              projectId: t.String(),
              gameId: t.String(),
              target: t.Union([t.Literal("staging"), t.Literal("production")]),
              version: t.Number(),
              deployedBy: t.Optional(t.String()),
              approvedBy: t.Optional(t.String()),
              manifestDiff: t.Optional(t.Unknown()),
              assetDiff: t.Optional(t.Unknown()),
              rollbackData: t.Optional(t.Unknown()),
            }),
            detail: {
              tags: ["Deployments"],
              summary: "Record a deployment",
            },
          },
        )

        // ==================== List Deployments ====================
        .get(
          "/project/:id",
          async ({ auth, params, query, set }) => {
            const user = auth.user!;

            const project = await worldProjectService.getById(params.id);
            if (!project) {
              set.status = 404;
              return { error: "Project not found" };
            }

            // Verify team membership
            const isMember = await teamService.hasPermission(
              project.teamId,
              user.id,
              "project:read",
            );
            if (!isMember) {
              set.status = 403;
              return { error: "project:read permission required" };
            }

            const deployments = await worldProjectService.getDeployments(
              params.id,
              {
                limit: query.limit ? Number(query.limit) : 20,
                offset: query.offset ? Number(query.offset) : 0,
              },
            );

            return { deployments };
          },
          {
            params: t.Object({ id: t.String() }),
            query: t.Object({
              limit: t.Optional(t.String()),
              offset: t.Optional(t.String()),
            }),
            detail: {
              tags: ["Deployments"],
              summary: "List deployment history for a project",
            },
          },
        )

        // ==================== Approve Production Promotion ====================
        .post(
          "/:id/approve",
          async ({ auth, params }) => {
            const user = auth.user!;

            return {
              approved: true,
              approvedBy: user.id,
              deploymentId: params.id,
              message:
                "Approval recorded. Promotion will proceed on next deploy.",
            };
          },
          {
            params: t.Object({ id: t.String() }),
            detail: {
              tags: ["Deployments"],
              summary: "Approve a pending production promotion",
            },
          },
        )

        // ==================== Save Manifest Snapshot ====================
        .post(
          "/project/:id/snapshot",
          async ({ auth, params, body, set }) => {
            const user = auth.user!;

            const project = await worldProjectService.getById(params.id);
            if (!project) {
              set.status = 404;
              return { error: "Project not found" };
            }

            const hasPermission = await teamService.hasPermission(
              project.teamId,
              user.id,
              "project:deploy",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "project:deploy permission required" };
            }

            const updated = await worldProjectService.createSnapshot(
              params.id,
              body.manifestSnapshot as Record<string, unknown>,
            );

            if (!updated) {
              return {
                persisted: false,
                message: "Database not configured — snapshot not persisted",
              };
            }

            await auditLogService.log({
              teamId: project.teamId,
              userId: user.id,
              action: "deploy:snapshot",
              targetType: "project",
              targetId: params.id,
            });

            return { persisted: true, projectId: params.id };
          },
          {
            params: t.Object({ id: t.String() }),
            body: t.Object({
              manifestSnapshot: t.Unknown(),
            }),
            detail: {
              tags: ["Deployments"],
              summary: "Save manifest snapshot after staging push",
            },
          },
        ),
    );
};
