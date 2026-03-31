/**
 * Health Check Routes
 * Simple health check endpoint for monitoring
 */

import { Elysia } from "elysia";
import * as Models from "../models";
import { isDatabaseEnabled, getDb } from "../db/db";

export const healthRoutes = new Elysia({ prefix: "/api", name: "health" })
  .get(
    "/health",
    () => ({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        meshy: !!process.env.MESHY_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
      },
    }),
    {
      response: Models.HealthResponse,
      detail: {
        tags: ["Health"],
        summary: "Health check",
        description:
          "Returns server health status and available services. (Auth optional)",
      },
    },
  )
  .get("/health/auth-debug", ({ request }) => {
    const authHeader = request.headers.get("authorization");
    const hasBearer = authHeader?.startsWith("Bearer ") ?? false;
    const tokenLength = hasBearer ? authHeader!.slice(7).length : 0;
    const tokenPrefix = hasBearer ? authHeader!.slice(7, 27) + "..." : null;

    return {
      database: {
        enabled: isDatabaseEnabled(),
        hasClient: getDb() !== null,
      },
      privy: {
        hasAppId: !!(
          process.env.PRIVY_APP_ID || process.env.PUBLIC_PRIVY_APP_ID
        ),
        hasSecret: !!process.env.PRIVY_APP_SECRET,
        appIdPrefix:
          (
            process.env.PRIVY_APP_ID ||
            process.env.PUBLIC_PRIVY_APP_ID ||
            ""
          ).slice(0, 8) + "...",
      },
      request: {
        hasAuthHeader: !!authHeader,
        hasBearerToken: hasBearer,
        tokenLength,
        tokenPrefix,
      },
      env: {
        grantDevAdmin: process.env.GRANT_DEV_ADMIN,
        nodeEnv: process.env.NODE_ENV,
        useLocalPostgres: process.env.USE_LOCAL_POSTGRES,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
      },
    };
  });
