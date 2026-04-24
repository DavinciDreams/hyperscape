/**
 * Game Routes — CRUD for games within teams
 * All routes require authentication and team membership.
 */

import { Elysia, t } from "elysia";
import { authDerive, requireAuthGuard } from "../middleware/auth";
import { TeamService } from "../services/TeamService";
import { AuditLogService } from "../services/AuditLogService";
import { UILayoutService } from "../services/UILayoutService";
import * as WS from "../models/world-studio.models";
import * as Models from "../models";
import {
  DEFAULT_GAME_MODE_MANIFEST,
  validateGameModeManifest,
  type GameModeManifest,
} from "../utils/gameModeRegistry";

export const createGameRoutes = (
  teamService: TeamService,
  auditLogService: AuditLogService,
  uiLayoutService: UILayoutService,
) => {
  return new Elysia({ prefix: "/api/teams/:teamId/games", name: "game-routes" })
    .derive(authDerive)
    .guard({ beforeHandle: [requireAuthGuard] }, (app) =>
      app
        .get(
          "/",
          async ({ auth, params: { teamId }, set }) => {
            const user = auth.user!;
            const role = await teamService.getMemberRole(teamId, user.id);
            if (!role) {
              set.status = 403;
              return { error: "Not a member of this team" };
            }

            const gameList = await teamService.getGamesForTeam(teamId);
            return gameList.map((g) => ({
              id: g.id,
              teamId: g.teamId,
              name: g.name,
              slug: g.slug,
              description: g.description,
              moduleId: g.moduleId,
              gameMode: g.gameMode,
              stagingServerUrl: g.stagingServerUrl,
              productionServerUrl: g.productionServerUrl,
              activeUiLayoutId: g.activeUiLayoutId,
              createdAt: g.createdAt.toISOString(),
            }));
          },
          {
            params: t.Object({ teamId: t.String() }),
            response: {
              200: t.Array(WS.GameResponse),
              403: Models.ErrorResponse,
            },
            detail: {
              tags: ["Games"],
              summary: "List games for a team",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        .post(
          "/",
          async ({ auth, params: { teamId }, body, set }) => {
            const user = auth.user!;
            const hasPermission = await teamService.hasRoleLevel(
              teamId,
              user.id,
              "admin",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "Admin role required to create games" };
            }

            // Validate optional GameMode manifest against the server-side
            // registry allowlist. Unknown ids would produce a broken PIE /
            // client session — reject at the edge.
            if (body.gameMode) {
              const err = validateGameModeManifest(
                body.gameMode as GameModeManifest,
              );
              if (err) {
                set.status = 400;
                return {
                  error: `Invalid gameMode.${err.field}: "${err.value}". Known: ${err.known.join(", ")}`,
                };
              }
            }

            const game = await teamService.createGame(teamId, {
              ...body,
              gameMode: body.gameMode ?? DEFAULT_GAME_MODE_MANIFEST,
            });
            if (!game) {
              set.status = 500;
              return { error: "Failed to create game" };
            }

            await auditLogService.log({
              teamId,
              gameId: game.id,
              userId: user.id,
              action: "game:create",
              targetType: "game",
              targetId: game.id,
            });

            return {
              id: game.id,
              teamId: game.teamId,
              name: game.name,
              slug: game.slug,
              description: game.description,
              moduleId: game.moduleId,
              gameMode: game.gameMode,
              stagingServerUrl: game.stagingServerUrl,
              productionServerUrl: game.productionServerUrl,
              activeUiLayoutId: game.activeUiLayoutId,
              createdAt: game.createdAt.toISOString(),
            };
          },
          {
            params: t.Object({ teamId: t.String() }),
            body: WS.CreateGameBody,
            response: {
              200: WS.GameResponse,
              400: Models.ErrorResponse,
              403: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["Games"],
              summary: "Create a new game in a team",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        .get(
          "/:gameId",
          async ({ auth, params: { teamId, gameId }, set }) => {
            const user = auth.user!;
            const role = await teamService.getMemberRole(teamId, user.id);
            if (!role) {
              set.status = 403;
              return { error: "Not a member of this team" };
            }

            const game = await teamService.getGame(gameId);
            if (!game || game.teamId !== teamId) {
              set.status = 404;
              return { error: "Game not found" };
            }

            return {
              id: game.id,
              teamId: game.teamId,
              name: game.name,
              slug: game.slug,
              description: game.description,
              moduleId: game.moduleId,
              gameMode: game.gameMode,
              stagingServerUrl: game.stagingServerUrl,
              productionServerUrl: game.productionServerUrl,
              activeUiLayoutId: game.activeUiLayoutId,
              createdAt: game.createdAt.toISOString(),
            };
          },
          {
            params: t.Object({ teamId: t.String(), gameId: t.String() }),
            response: {
              200: WS.GameResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
            },
            detail: {
              tags: ["Games"],
              summary: "Get game details",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        // List UI layouts available to this game (U6 — layout switcher
        // source of truth). Returns team-owned layouts scoped to the
        // game plus team-wide layouts, public layouts, and templates.
        // The caller (client layout switcher) uses this list to let
        // the player pick one as their active HUD.
        .get(
          "/:gameId/ui-layouts",
          async ({ auth, params: { teamId, gameId }, set }) => {
            const user = auth.user!;
            const role = await teamService.getMemberRole(teamId, user.id);
            if (!role) {
              set.status = 403;
              return { error: "Not a member of this team" };
            }
            const game = await teamService.getGame(gameId);
            if (!game || game.teamId !== teamId) {
              set.status = 404;
              return { error: "Game not found" };
            }
            const rows = await uiLayoutService.listForGame(teamId, gameId);
            return rows.map((row) => ({
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
            }));
          },
          {
            params: t.Object({ teamId: t.String(), gameId: t.String() }),
            response: {
              200: t.Array(WS.UILayoutResponse),
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
            },
            detail: {
              tags: ["Games"],
              summary: "List UI layouts available for this game",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        .put(
          "/:gameId",
          async ({ auth, params: { teamId, gameId }, body, set }) => {
            const user = auth.user!;
            const hasPermission = await teamService.hasRoleLevel(
              teamId,
              user.id,
              "admin",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "Admin role required" };
            }

            const existing = await teamService.getGame(gameId);
            if (!existing || existing.teamId !== teamId) {
              set.status = 404;
              return { error: "Game not found" };
            }

            // Validate optional GameMode manifest on update.
            if (body.gameMode) {
              const err = validateGameModeManifest(
                body.gameMode as GameModeManifest,
              );
              if (err) {
                set.status = 400;
                return {
                  error: `Invalid gameMode.${err.field}: "${err.value}". Known: ${err.known.join(", ")}`,
                };
              }
            }

            const game = await teamService.updateGame(gameId, body);
            if (!game) {
              set.status = 500;
              return { error: "Failed to update game" };
            }

            await auditLogService.log({
              teamId,
              gameId,
              userId: user.id,
              action: "game:update",
              targetType: "game",
              targetId: gameId,
            });

            return {
              id: game.id,
              teamId: game.teamId,
              name: game.name,
              slug: game.slug,
              description: game.description,
              moduleId: game.moduleId,
              gameMode: game.gameMode,
              stagingServerUrl: game.stagingServerUrl,
              productionServerUrl: game.productionServerUrl,
              activeUiLayoutId: game.activeUiLayoutId,
              createdAt: game.createdAt.toISOString(),
            };
          },
          {
            params: t.Object({ teamId: t.String(), gameId: t.String() }),
            body: WS.UpdateGameBody,
            response: {
              200: WS.GameResponse,
              400: Models.ErrorResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["Games"],
              summary: "Update game settings",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        .patch(
          "/:gameId/active-ui-layout",
          async ({ auth, params: { teamId, gameId }, body, set }) => {
            const user = auth.user!;
            const hasPermission = await teamService.hasRoleLevel(
              teamId,
              user.id,
              "editor",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "Editor role required" };
            }

            const existing = await teamService.getGame(gameId);
            if (!existing || existing.teamId !== teamId) {
              set.status = 404;
              return { error: "Game not found" };
            }

            // When setting (not clearing), verify the layout exists and is
            // usable by this team: either team-owned, public library, or a
            // template. Otherwise we'd happily pin a layout the game's
            // client can't fetch back.
            if (body.activeUiLayoutId) {
              const layout = await uiLayoutService.getById(
                body.activeUiLayoutId,
              );
              const usable =
                layout !== null &&
                (layout.teamId === teamId ||
                  layout.isPublic === true ||
                  layout.isTemplate === true);
              if (!usable) {
                set.status = 400;
                return {
                  error: "Layout not found, or not accessible to this team",
                };
              }
            }

            const updated = await teamService.updateGame(gameId, {
              activeUiLayoutId: body.activeUiLayoutId,
            });
            if (!updated) {
              set.status = 500;
              return { error: "Failed to update active layout" };
            }

            await auditLogService.log({
              teamId,
              gameId,
              userId: user.id,
              action: "game:set-active-ui-layout",
              targetType: "game",
              targetId: gameId,
              details: {
                activeUiLayoutId: body.activeUiLayoutId,
              },
            });

            return {
              id: updated.id,
              teamId: updated.teamId,
              name: updated.name,
              slug: updated.slug,
              description: updated.description,
              moduleId: updated.moduleId,
              gameMode: updated.gameMode,
              stagingServerUrl: updated.stagingServerUrl,
              productionServerUrl: updated.productionServerUrl,
              activeUiLayoutId: updated.activeUiLayoutId,
              createdAt: updated.createdAt.toISOString(),
            };
          },
          {
            params: t.Object({ teamId: t.String(), gameId: t.String() }),
            body: WS.SetActiveUILayoutBody,
            response: {
              200: WS.GameResponse,
              400: Models.ErrorResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
              500: Models.ErrorResponse,
            },
            detail: {
              tags: ["Games"],
              summary: "Set the active UI layout for a game",
              security: [{ BearerAuth: [] }],
            },
          },
        )

        .delete(
          "/:gameId",
          async ({ auth, params: { teamId, gameId }, set }) => {
            const user = auth.user!;
            const hasPermission = await teamService.hasRoleLevel(
              teamId,
              user.id,
              "admin",
            );
            if (!hasPermission) {
              set.status = 403;
              return { error: "Admin role required" };
            }

            const existing = await teamService.getGame(gameId);
            if (!existing || existing.teamId !== teamId) {
              set.status = 404;
              return { error: "Game not found" };
            }

            await teamService.deleteGame(gameId);

            await auditLogService.log({
              teamId,
              gameId,
              userId: user.id,
              action: "game:delete",
              targetType: "game",
              targetId: gameId,
            });

            return { success: true, message: "Game deleted" };
          },
          {
            params: t.Object({ teamId: t.String(), gameId: t.String() }),
            response: {
              200: Models.SuccessResponse,
              403: Models.ErrorResponse,
              404: Models.ErrorResponse,
            },
            detail: {
              tags: ["Games"],
              summary: "Delete a game",
              security: [{ BearerAuth: [] }],
            },
          },
        ),
    );
};
