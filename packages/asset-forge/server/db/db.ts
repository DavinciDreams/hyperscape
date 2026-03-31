/**
 * Database Connection
 * PostgreSQL connection using Bun-optimized postgres library and Drizzle ORM
 *
 * Supports two modes:
 * 1. USE_LOCAL_POSTGRES=true — auto-starts a Docker PostgreSQL container
 * 2. DATABASE_URL=... — connects to an external PostgreSQL instance
 *
 * If neither is set, runs in file-based mode (database features disabled).
 *
 * IMPORTANT: Use getDb() and isDatabaseEnabled() getters, NOT raw imports.
 * Raw `export let` variables can break with some bundlers that snapshot
 * the value at import time instead of creating live bindings.
 */

import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { schema } from "./schema";
import type { Sql } from "postgres";
import {
  createDefaultDockerManager,
  type DockerManager,
} from "../infrastructure/docker/docker-manager";

// Private state — consumers use the getter functions below
let _queryClient: Sql | null = null;
let _db: PostgresJsDatabase<typeof schema> | null = null;
let _isDatabaseEnabled = false;
let _dockerManager: DockerManager | undefined;

/** Get the Drizzle database client. Returns null if DB is not connected. */
export function getDb(): PostgresJsDatabase<typeof schema> | null {
  return _db;
}

/** Check if the database is connected and available. */
export function isDatabaseEnabled(): boolean {
  return _isDatabaseEnabled;
}

/** Get the raw postgres query client. Returns null if DB is not connected. */
export function getQueryClient(): Sql | null {
  return _queryClient;
}

/**
 * Initialize the database connection.
 * Called from server startup (api-elysia.ts) BEFORE routes are registered.
 */
export async function initializeDatabase(): Promise<void> {
  let connectionString = process.env.DATABASE_URL || "";

  const useLocalPostgres =
    process.env.USE_LOCAL_POSTGRES === "true" && !connectionString;

  if (useLocalPostgres) {
    try {
      _dockerManager = createDefaultDockerManager();
      await _dockerManager.checkDockerRunning();

      const isRunning = await _dockerManager.checkPostgresRunning();
      if (!isRunning) {
        console.log("[Database] Starting Docker PostgreSQL...");
        await _dockerManager.startPostgres();
      } else {
        console.log("[Database] Docker PostgreSQL already running");
      }

      connectionString = await _dockerManager.getConnectionString();
      console.log("[Database] Using local Docker PostgreSQL");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Database] Docker PostgreSQL unavailable:", msg);
      console.log(
        "[Database] Continuing without database - file-based storage only",
      );
      return;
    }
  }

  if (!connectionString) {
    console.log(
      "[Database] No database configured (set USE_LOCAL_POSTGRES=true or DATABASE_URL) - file-based mode",
    );
    return;
  }

  _queryClient = postgres(connectionString, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  _db = drizzle(_queryClient, { schema });
  _isDatabaseEnabled = true;

  try {
    const result = await _queryClient`SELECT NOW()`;
    console.log("[Database] Connected to PostgreSQL at", result[0].now);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Database] Connection failed:", msg);
    console.warn(
      "[Database] Continuing without database - file-based storage only",
    );
    _queryClient = null;
    _db = null;
    _isDatabaseEnabled = false;
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      const { execSync } = await import("child_process");
      execSync("bunx drizzle-kit push --force", {
        cwd: new URL("../../", import.meta.url).pathname,
        env: { ...process.env, DATABASE_URL: connectionString },
        stdio: "pipe",
      });
      console.log("[Database] Schema synced via drizzle-kit push");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Database] Schema sync skipped:", msg);
    }
  }

  const shutdown = async () => {
    if (_queryClient) {
      console.log("[Database] Closing connection...");
      await _queryClient.end();
    }
    if (_dockerManager) {
      await _dockerManager.stopPostgres();
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
