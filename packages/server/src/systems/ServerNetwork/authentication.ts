/**
 * Authentication Module
 *
 * Handles user authentication through multiple providers:
 * - Hyperscape JWT (custom token authentication)
 * - Anonymous users (fallback)
 * - Load test mode (in-memory users, no DB)
 *
 * Also handles ban checking to prevent banned users from connecting.
 *
 * This module extracts all authentication logic from ServerNetwork
 * to improve maintainability and testability.
 */

import type {
  ConnectionParams,
  User,
  SystemDatabase,
} from "../../shared/types";
import { createJWT, verifyJWT } from "../../shared/utils";
import { uuid } from "@hyperscape/shared";
import { errMsg } from "../../shared/errMsg.js";

/**
 * Check if load test mode is enabled
 * When enabled, allows anonymous connections without database insertion
 */
export function isLoadTestMode(): boolean {
  return process.env.LOAD_TEST_MODE === "true";
}

/**
 * Ban information returned when a user is banned
 */
export type BanInfo = {
  isBanned: boolean;
  reason?: string;
  expiresAt?: number | null;
  bannedByName?: string;
};

/**
 * Checks if a user is currently banned
 *
 * @param userId - The user ID to check
 * @param db - Database instance for ban lookups
 * @returns Ban information if banned, or { isBanned: false } if not banned
 */
export async function checkUserBan(
  userId: string,
  db: SystemDatabase,
): Promise<BanInfo> {
  try {
    const now = Date.now();

    // Query for active bans that haven't expired
    // A ban is active if: active=1 AND (expiresAt IS NULL OR expiresAt > now)
    // Type for ban query result
    type BanRow = {
      bannedByUserId?: string;
      reason?: string;
      expiresAt?: number | null;
    };

    const activeBan = (await db("user_bans")
      .where("bannedUserId", userId)
      .where("active", 1)
      .where(function (this: ReturnType<SystemDatabase>) {
        this.whereNull("expiresAt").orWhere("expiresAt", ">", now);
      })
      .first()) as BanRow | undefined;

    if (!activeBan) {
      return { isBanned: false };
    }

    // Get the name of who banned them (for the ban message)
    let bannedByName = "a moderator";
    if (activeBan.bannedByUserId) {
      const bannedByUser = (await db("users")
        .where("id", activeBan.bannedByUserId)
        .select("name")
        .first()) as { name?: string } | undefined;
      if (bannedByUser?.name) {
        bannedByName = bannedByUser.name;
      }
    }

    return {
      isBanned: true,
      reason: activeBan.reason || undefined,
      expiresAt: activeBan.expiresAt || null,
      bannedByName,
    };
  } catch (err) {
    // ONLY allow connection if the error is specifically about missing table
    // This prevents security bypass if database has other issues
    const errorMessage = errMsg(err);

    // DrizzleQueryError wraps the original PG error in cause - check both
    type ErrorWithCause = Error & {
      cause?: Error & { code?: string; message?: string };
    };
    const cause =
      err instanceof Error ? (err as ErrorWithCause).cause : undefined;
    const causeMessage = cause?.message || "";
    const causeCode = cause?.code || "";

    // Combine main error message with cause message for detection
    const fullErrorText = `${errorMessage} ${causeMessage}`;

    const isTableMissing =
      fullErrorText.includes("user_bans") &&
      (fullErrorText.includes("does not exist") ||
        fullErrorText.includes("no such table") ||
        fullErrorText.includes("relation") ||
        fullErrorText.includes("42P01") ||
        causeCode === "42P01"); // PostgreSQL error code for undefined table

    if (isTableMissing) {
      console.warn(
        "[Authentication] user_bans table does not exist - skipping ban check (run migrations)",
      );
      return { isBanned: false };
    }

    // For any other error, log it and DENY access to be safe
    console.error(
      "[Authentication] Ban check failed with unexpected error:",
      err,
    );
    console.error("[Authentication] DENYING ACCESS due to ban check failure");
    return {
      isBanned: true,
      reason: "Unable to verify ban status - please try again later",
    };
  }
}

/**
 * Authenticates a user from connection parameters
 *
 * Authentication flow:
 * 1. Try Hyperscape JWT authentication
 * 2. Create anonymous user if no authentication succeeds
 *
 * @param params - Connection parameters from WebSocket
 * @param db - Database instance for user lookups/creation
 * @returns Authenticated user and auth token
 */
export async function authenticateUser(
  params: ConnectionParams,
  db: SystemDatabase,
): Promise<{
  user: User;
  authToken: string;
  userWithPrivy?: User;
}> {
  let authToken = params.authToken;
  const name = params.name;
  const avatar = params.avatar;

  let user: User | undefined;

  if (!user && authToken) {
    try {
      const jwtPayload = await verifyJWT(authToken);
      if (jwtPayload && jwtPayload.userId) {
        // Look up user account
        let dbResult = await db("users")
          .where("id", jwtPayload.userId as string)
          .first();

        // If user doesn't exist for a valid server-signed JWT userId, create
        // a minimal user record so accountId remains stable across reconnects.
        if (!dbResult) {
          const timestamp = new Date().toISOString();
          const jwtUserId = jwtPayload.userId as string;
          const newUser = {
            id: jwtUserId,
            name: name || "Agent",
            avatar: avatar || null,
            roles: "",
            createdAt: timestamp,
          };

          try {
            await db("users").insert(newUser);
            dbResult = newUser as User;
          } catch (insertErr) {
            console.error(
              "[Authentication] Failed to create user record:",
              insertErr,
            );
            // Try fetching again in case of race condition
            dbResult = await db("users")
              .where("id", jwtPayload.userId as string)
              .first();
          }
        }

        if (dbResult) {
          user = dbResult as User;
        }
      }
    } catch (err) {
      console.error(
        "[Authentication] Failed to read authToken:",
        authToken,
        err,
      );
    }
  }

  // Create anonymous user if no authentication succeeded
  if (!user) {
    const timestamp = new Date().toISOString();

    // Check if this is a load test bot (URL params come as strings)
    const loadTestBotParam = (params as { loadTestBot?: string | boolean })
      .loadTestBot;
    const isLoadTestBot =
      loadTestBotParam === "true" || loadTestBotParam === true;
    const botName = (params as { botName?: string }).botName;

    user = {
      id: uuid(),
      name: isLoadTestBot && botName ? botName : "Anonymous",
      avatar: null,
      roles: "",
      createdAt: timestamp,
    };

    // In load test mode with load test bots, skip database insertion for performance
    // This allows spawning thousands of bots without DB overhead
    if (isLoadTestMode() && isLoadTestBot) {
      console.log(
        `[Authentication] Load test bot authenticated: ${user.name} (${user.id})`,
      );
    } else {
      // Normal anonymous user - insert into database
      await db("users").insert({
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        roles: Array.isArray(user.roles) ? user.roles.join(",") : user.roles,
        createdAt: timestamp,
      });
    }
    authToken = await createJWT({ userId: user.id });
  }

  // Convert roles string to array - DB stores as string, runtime uses array
  if ((user.roles as string).split) {
    user.roles = (user.roles as string).split(",").filter((r) => r);
  }

  // SECURITY: Only grant dev admin when EXPLICITLY opted in
  // Requires GRANT_DEV_ADMIN=true AND development mode AND no admin code
  // This prevents accidental admin grants in misconfigured environments
  if (
    process.env.GRANT_DEV_ADMIN === "true" &&
    process.env.NODE_ENV === "development" &&
    !process.env.ADMIN_CODE
  ) {
    console.warn(
      "[Authentication] GRANT_DEV_ADMIN=true - granting temporary admin access (dev only)",
    );
    if (Array.isArray(user.roles)) {
      user.roles.push("~admin");
    }
  }

  return { user, authToken: authToken || "", userWithPrivy: user };
}

/**
 * True when connection params carry a cryptographically valid Hyperscape JWT
 * and the user is not banned.
 *
 * Used only for `mode=streaming` when public stream delay is enabled (`STREAMING_PUBLIC_DELAY_MS` > 0): anonymous
 * public viewers stay on the delayed surface, while logged-in accounts can open a
 * real-time streaming WebSocket without relying on loopback IP or `streamToken`.
 */
export async function verifyStreamingViewerCredentials(
  params: ConnectionParams,
  db: SystemDatabase,
): Promise<boolean> {
  const authToken = params.authToken;
  if (!authToken || authToken.length === 0) return false;

  let resolvedUserId: string | undefined;

  try {
    const jwtPayload = await verifyJWT(authToken);
    if (jwtPayload && jwtPayload.userId) {
      resolvedUserId = jwtPayload.userId as string;
    }
  } catch {
    return false;
  }

  if (!resolvedUserId) return false;

  const banInfo = await checkUserBan(resolvedUserId, db);
  return !banInfo.isBanned;
}
