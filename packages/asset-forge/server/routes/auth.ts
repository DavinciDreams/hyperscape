/**
 * Auth Routes — GET /api/auth/me
 * Returns the authenticated user's profile and team memberships.
 */

import { Elysia } from "elysia";
import { authDerive, requireAuthGuard } from "../middleware/auth";
import { TeamService } from "../services/TeamService";
import * as WS from "../models/world-studio.models";

export const createAuthRoutes = (teamService: TeamService) => {
  return new Elysia({ prefix: "/api/auth", name: "auth-routes" })
    .derive(authDerive)
    .guard({ beforeHandle: [requireAuthGuard] }, (app) =>
      app.get(
        "/me",
        async ({ auth }) => {
          const user = auth.user!;
          const teamMemberships = await teamService.getTeamsForUser(user.id);

          return {
            user: {
              id: user.id,
              privyUserId: user.privyUserId,
              email: user.email,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
            },
            teams: teamMemberships.map((tm) => ({
              teamId: tm.team.id,
              teamName: tm.team.name,
              teamSlug: tm.team.slug,
              role: tm.role,
            })),
          };
        },
        {
          response: WS.AuthMeResponse,
          detail: {
            tags: ["Auth"],
            summary: "Get current user profile and team memberships",
            security: [{ BearerAuth: [] }],
          },
        },
      ),
    );
};
