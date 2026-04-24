/**
 * UI Layout Routes — CRUD for standalone UILayoutManifest assets.
 *
 * Routes are team-scoped (mirrors scripts.ts):
 *   GET    /api/teams/:teamId/ui-layouts                 list visible layouts
 *   GET    /api/teams/:teamId/ui-layouts/templates       list public templates
 *   GET    /api/teams/:teamId/ui-layouts/:layoutId       get detail + manifestData
 *   POST   /api/teams/:teamId/ui-layouts                 create
 *   PUT    /api/teams/:teamId/ui-layouts/:layoutId       update
 *   DELETE /api/teams/:teamId/ui-layouts/:layoutId       delete
 *   POST   /api/teams/:teamId/ui-layouts/:layoutId/clone clone into this team
 *
 * All routes require authentication + team membership. Editor+ is required
 * to create/update/clone; admin to delete. Manifests are validated by
 * `UILayoutManifestSchema` from @hyperforge/ui-framework before insert/update.
 */

import { Elysia, t } from "elysia";
import { UILayoutManifestSchema } from "@hyperforge/ui-framework";
import { authDerive, requireAuthGuard } from "../middleware/auth";
import { TeamService } from "../services/TeamService";
import { UILayoutService } from "../services/UILayoutService";
import { AuditLogService } from "../services/AuditLogService";
import * as WS from "../models/world-studio.models";
import * as Models from "../models";
import type { UILayoutRow } from "../db/schema";

// ==================== Helpers ====================

function generateLayoutId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `uilayout_${ts}_${rand}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function formatLayoutRow(row: UILayoutRow) {
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

function formatLayoutDetailRow(row: UILayoutRow) {
  return { ...formatLayoutRow(row), manifestData: row.manifestData };
}

// ==================== Route Factory ====================

export const createUILayoutRoutes = (
  teamService: TeamService,
  uiLayoutService: UILayoutService,
  auditLogService: AuditLogService,
) => {
  return new Elysia({
    prefix: "/api/teams/:teamId/ui-layouts",
    name: "ui-layout-routes",
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
            const rows = await uiLayoutService.listForTeam(teamId);
            return rows.map(formatLayoutRow);
          },
          {
            params: t.Object({ teamId: t.String() }),
            response: {
              200: t.Array(WS.UILayoutResponse),
              403: Models.ErrorResponse,
            },
            detail: {
              tags: ["UILayouts"],
              summary:
                "List UI layouts for a team (includes public + template layouts)",
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
            const rows = await uiLayoutService.listTemplates();
            return rows.map(formatLayoutRow);
          },
          {
            params: t.Object({ teamId: t.String() }),
            response: {
              200: t.Array(WS.UILayoutResponse),
              403: Models.ErrorResponse,
            },
            detail: {
              tags: ["UILayouts"],
              summary: "List public UI layout templates",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== GET ====================
        .get(
          "/:layoutId",
          async ({ auth, params: { teamId, layoutId }, set }) => {
            const user = auth.user!;
            const role = await teamService.getMemberRole(teamId, user.id);
            if (!role) {
              set.status = 403;
              return { error: "Not a member of this team" };
            }
            const row = await uiLayoutService.getById(layoutId);
            if (!row) {
              set.status = 404;
              return { error: "UI layout not found" };
            }
            // Visible if team-owned OR public OR template
            const visible =
              row.teamId === teamId || row.isPublic || row.isTemplate;
            if (!visible) {
              set.status = 404;
              return { error: "UI layout not found" };
            }
            return formatLayoutDetailRow(row);
          },
          {
            params: t.Object({ teamId: t.String(), layoutId: t.String() }),
            response: {
              200: WS.UILayoutDetailResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
            },
            detail: {
              tags: ["UILayouts"],
              summary: "Get UI layout detail with full manifest JSON",
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
                error: "Editor role or higher required to create UI layouts",
              };
            }

            // Validate manifest via Zod
            const validation = UILayoutManifestSchema.safeParse(
              body.manifestData,
            );
            if (!validation.success) {
              set.status = 422;
              const msg = validation.error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ");
              return { error: `Invalid UI layout manifest: ${msg}` };
            }

            const name = body.name;
            const slug = slugify(name);
            const version = body.version || "1.0.0";
            const gameId = body.gameId ?? null;

            const slugTaken = await uiLayoutService.slugExists(
              teamId,
              gameId,
              slug,
            );
            if (slugTaken) {
              set.status = 409;
              return {
                error: `UI layout slug "${slug}" already exists in this scope`,
              };
            }

            const id = generateLayoutId();
            const row = await uiLayoutService.create({
              id,
              teamId,
              gameId,
              name,
              slug,
              description: body.description ?? null,
              version,
              manifestData: validation.data,
              isTemplate: body.isTemplate ?? false,
              isPublic: body.isPublic ?? false,
              createdBy: user.id,
            });

            if (!row) {
              set.status = 500;
              return { error: "Failed to create UI layout" };
            }

            await auditLogService.log({
              teamId,
              userId: user.id,
              action: "ui_layout:create",
              targetType: "ui_layout",
              targetId: row.id,
            });

            set.status = 201;
            return formatLayoutDetailRow(row);
          },
          {
            params: t.Object({ teamId: t.String() }),
            body: WS.CreateUILayoutBody,
            response: {
              201: WS.UILayoutDetailResponse,
              403: Models.ErrorResponse,
              409: Models.ErrorResponse,
              422: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["UILayouts"],
              summary: "Create a new UI layout",
              description:
                "Validates manifestData via UILayoutManifestSchema before storing.",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== UPDATE ====================
        .put(
          "/:layoutId",
          async ({ auth, params: { teamId, layoutId }, body, set }) => {
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

            const existing = await uiLayoutService.getById(layoutId);
            if (!existing || existing.teamId !== teamId) {
              set.status = 404;
              return { error: "UI layout not found" };
            }

            // Re-validate manifestData if supplied
            let validatedManifest: unknown | undefined;
            if (body.manifestData !== undefined) {
              const validation = UILayoutManifestSchema.safeParse(
                body.manifestData,
              );
              if (!validation.success) {
                set.status = 422;
                const msg = validation.error.issues
                  .map((i) => `${i.path.join(".")}: ${i.message}`)
                  .join("; ");
                return { error: `Invalid UI layout manifest: ${msg}` };
              }
              validatedManifest = validation.data;
            }

            // Derive new slug if name changed
            let newSlug: string | undefined;
            if (body.name !== undefined) {
              newSlug = slugify(body.name);
              if (newSlug !== existing.slug) {
                const slugTaken = await uiLayoutService.slugExists(
                  teamId,
                  existing.gameId,
                  newSlug,
                );
                if (slugTaken) {
                  set.status = 409;
                  return {
                    error: `UI layout slug "${newSlug}" already exists in this scope`,
                  };
                }
              }
            }

            const updated = await uiLayoutService.update(layoutId, {
              name: body.name,
              slug: newSlug,
              description: body.description,
              version: body.version,
              manifestData: validatedManifest,
              isTemplate: body.isTemplate,
              isPublic: body.isPublic,
            });
            if (!updated) {
              set.status = 500;
              return { error: "Failed to update UI layout" };
            }

            await auditLogService.log({
              teamId,
              userId: user.id,
              action: "ui_layout:update",
              targetType: "ui_layout",
              targetId: layoutId,
            });

            return formatLayoutDetailRow(updated);
          },
          {
            params: t.Object({ teamId: t.String(), layoutId: t.String() }),
            body: WS.UpdateUILayoutBody,
            response: {
              200: WS.UILayoutDetailResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
              409: Models.ErrorResponse,
              422: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["UILayouts"],
              summary: "Update a UI layout",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== DELETE ====================
        .delete(
          "/:layoutId",
          async ({ auth, params: { teamId, layoutId }, set }) => {
            const user = auth.user!;
            const hasPermission = await teamService.hasRoleLevel(
              teamId,
              user.id,
              "admin",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "Admin role required to delete UI layouts" };
            }

            const existing = await uiLayoutService.getById(layoutId);
            if (!existing || existing.teamId !== teamId) {
              set.status = 404;
              return { error: "UI layout not found" };
            }

            await uiLayoutService.delete(layoutId);
            await auditLogService.log({
              teamId,
              userId: user.id,
              action: "ui_layout:delete",
              targetType: "ui_layout",
              targetId: layoutId,
            });

            return { success: true, message: "UI layout deleted" };
          },
          {
            params: t.Object({ teamId: t.String(), layoutId: t.String() }),
            response: {
              200: Models.SuccessResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
            },
            detail: {
              tags: ["UILayouts"],
              summary: "Delete a UI layout",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // ==================== CLONE ====================
        .post(
          "/:layoutId/clone",
          async ({ auth, params: { teamId, layoutId }, body, set }) => {
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

            const source = await uiLayoutService.getById(layoutId);
            if (!source) {
              set.status = 404;
              return { error: "Source UI layout not found" };
            }
            // Source must be visible to this team
            const visible =
              source.teamId === teamId || source.isPublic || source.isTemplate;
            if (!visible) {
              set.status = 404;
              return { error: "Source UI layout not found" };
            }

            const name = body.name ?? `${source.name} (copy)`;
            const slug = slugify(name);
            const gameId = body.gameId ?? null;

            // Handle slug collision by appending a short suffix
            let finalSlug = slug;
            let attempt = 0;
            while (
              await uiLayoutService.slugExists(teamId, gameId, finalSlug)
            ) {
              attempt += 1;
              finalSlug = `${slug}-${attempt}`;
              if (attempt > 20) {
                set.status = 409;
                return { error: "Could not derive a unique slug" };
              }
            }

            const id = generateLayoutId();
            const row = await uiLayoutService.create({
              id,
              teamId,
              gameId,
              name,
              slug: finalSlug,
              description: source.description,
              version: "1.0.0",
              manifestData: source.manifestData,
              isTemplate: false,
              isPublic: false,
              createdBy: user.id,
            });

            if (!row) {
              set.status = 500;
              return { error: "Failed to clone UI layout" };
            }

            await auditLogService.log({
              teamId,
              userId: user.id,
              action: "ui_layout:clone",
              targetType: "ui_layout",
              targetId: row.id,
            });

            set.status = 201;
            return formatLayoutDetailRow(row);
          },
          {
            params: t.Object({ teamId: t.String(), layoutId: t.String() }),
            body: WS.CloneUILayoutBody,
            response: {
              201: WS.UILayoutDetailResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
              409: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["UILayouts"],
              summary: "Clone a UI layout into the current team",
              security: [{ BearerAuth: [] }],
            },
          },
        ),
    );
};
