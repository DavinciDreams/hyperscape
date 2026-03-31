/**
 * World Studio TypeBox Models
 * Request/response validation schemas for World Studio API endpoints
 */

import { t, type Static } from "elysia";

// ==================== Team Models ====================

export const CreateTeamBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  slug: t.String({
    minLength: 1,
    maxLength: 50,
    pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
  }),
  description: t.Optional(t.String({ maxLength: 500 })),
});

export const UpdateTeamBody = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  description: t.Optional(t.String({ maxLength: 500 })),
  avatarUrl: t.Optional(t.String()),
});

export const TeamResponse = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.String(),
  description: t.Nullable(t.String()),
  avatarUrl: t.Nullable(t.String()),
  plan: t.String(),
  aiBudgetMonthlyCents: t.Number(),
  aiSpentThisMonthCents: t.Number(),
  createdAt: t.String(),
});

export const TeamMemberResponse = t.Object({
  id: t.String(),
  userId: t.String(),
  displayName: t.String(),
  email: t.Nullable(t.String()),
  avatarUrl: t.Nullable(t.String()),
  role: t.String(),
  joinedAt: t.String(),
});

// ==================== Game Models ====================

export const CreateGameBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  slug: t.String({
    minLength: 1,
    maxLength: 50,
    pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
  }),
  description: t.Optional(t.String({ maxLength: 500 })),
  stagingServerUrl: t.Optional(t.String()),
  stagingAssetsPath: t.Optional(t.String()),
  productionServerUrl: t.Optional(t.String()),
  productionAssetsPath: t.Optional(t.String()),
});

export const UpdateGameBody = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  description: t.Optional(t.String({ maxLength: 500 })),
  stagingServerUrl: t.Optional(t.String()),
  stagingAssetsPath: t.Optional(t.String()),
  productionServerUrl: t.Optional(t.String()),
  productionAssetsPath: t.Optional(t.String()),
  stagingAdminCode: t.Optional(t.String()),
  productionAdminCode: t.Optional(t.String()),
});

export const GameResponse = t.Object({
  id: t.String(),
  teamId: t.String(),
  name: t.String(),
  slug: t.String(),
  description: t.Nullable(t.String()),
  stagingServerUrl: t.Nullable(t.String()),
  productionServerUrl: t.Nullable(t.String()),
  createdAt: t.String(),
});

// ==================== Invite Models ====================

export const TeamInviteBody = t.Object({
  email: t.String({ format: "email" }),
  role: t.Optional(
    t.Union([t.Literal("viewer"), t.Literal("editor"), t.Literal("admin")]),
  ),
});

export const TeamInviteResponse = t.Object({
  id: t.String(),
  teamId: t.String(),
  email: t.String(),
  role: t.String(),
  token: t.String(),
  expiresAt: t.String(),
  acceptedAt: t.Nullable(t.String()),
});

// ==================== World Project Models ====================

export const CreateWorldProjectBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  gameId: t.String({ format: "uuid" }),
  worldData: t.Any(), // Full WorldBuilderContext serialized state
});

export const UpdateWorldProjectBody = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  description: t.Optional(t.String({ maxLength: 2000 })),
  worldData: t.Optional(t.Any()),
});

export const WorldProjectResponse = t.Object({
  id: t.String(),
  teamId: t.String(),
  gameId: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  version: t.Number(),
  createdBy: t.Nullable(t.String()),
  lockedBy: t.Nullable(t.String()),
  lockedAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const WorldProjectDetailResponse = t.Composite([
  WorldProjectResponse,
  t.Object({
    worldData: t.Any(),
    manifestSnapshot: t.Nullable(t.Any()),
  }),
]);

export const WorldProjectListResponse = t.Array(WorldProjectResponse);

// ==================== Deployment Models ====================

export const WorldDeploymentResponse = t.Object({
  id: t.String(),
  projectId: t.String(),
  gameId: t.String(),
  target: t.String(),
  version: t.Number(),
  deployedBy: t.Nullable(t.String()),
  approvedBy: t.Nullable(t.String()),
  deployedAt: t.String(),
});

// ==================== Auth Models ====================

export const AuthMeResponse = t.Object({
  user: t.Object({
    id: t.String(),
    privyUserId: t.Nullable(t.String()),
    email: t.Nullable(t.String()),
    displayName: t.String(),
    avatarUrl: t.Nullable(t.String()),
  }),
  teams: t.Array(
    t.Object({
      teamId: t.String(),
      teamName: t.String(),
      teamSlug: t.String(),
      role: t.String(),
    }),
  ),
});

// ==================== Common ====================

export const TeamIdParam = t.Object({
  teamId: t.String({ format: "uuid" }),
});

export const GameIdParam = t.Object({
  gameId: t.String({ format: "uuid" }),
});

export const ProjectIdParam = t.Object({
  projectId: t.String({ format: "uuid" }),
});

export const PaginationQuery = t.Object({
  limit: t.Optional(t.String()),
  offset: t.Optional(t.String()),
});

// ==================== Type Exports ====================

export type CreateTeamBodyType = Static<typeof CreateTeamBody>;
export type UpdateTeamBodyType = Static<typeof UpdateTeamBody>;
export type CreateGameBodyType = Static<typeof CreateGameBody>;
export type UpdateGameBodyType = Static<typeof UpdateGameBody>;
export type TeamInviteBodyType = Static<typeof TeamInviteBody>;
export type CreateWorldProjectBodyType = Static<typeof CreateWorldProjectBody>;
export type UpdateWorldProjectBodyType = Static<typeof UpdateWorldProjectBody>;
