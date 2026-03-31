/**
 * Game Routes — CRUD for games within teams
 * All routes require authentication and team membership.
 */

import { Elysia, t } from "elysia";
import { authDerive, requireAuthGuard } from "../middleware/auth";
import { TeamService } from "../services/TeamService";
import { AuditLogService } from "../services/AuditLogService";
import * as WS from "../models/world-studio.models";
import * as Models from "../models";

export const createGameRoutes = (
  teamService: TeamService,
  auditLogService: AuditLogService,
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
              stagingServerUrl: g.stagingServerUrl,
              productionServerUrl: g.productionServerUrl,
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

            const game = await teamService.createGame(teamId, body);
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
              stagingServerUrl: game.stagingServerUrl,
              productionServerUrl: game.productionServerUrl,
              createdAt: game.createdAt.toISOString(),
            };
          },
          {
            params: t.Object({ teamId: t.String() }),
            body: WS.CreateGameBody,
            response: {
              200: WS.GameResponse,
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
              stagingServerUrl: game.stagingServerUrl,
              productionServerUrl: game.productionServerUrl,
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
              stagingServerUrl: game.stagingServerUrl,
              productionServerUrl: game.productionServerUrl,
              createdAt: game.createdAt.toISOString(),
            };
          },
          {
            params: t.Object({ teamId: t.String(), gameId: t.String() }),
            body: WS.UpdateGameBody,
            response: {
              200: WS.GameResponse,
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
