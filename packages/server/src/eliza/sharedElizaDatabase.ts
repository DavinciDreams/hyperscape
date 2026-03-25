/**
 * Shared Eliza SQL database adapter — one Postgres URL (Hyperscape DB), one pool
 * per process via plugin-sql's PostgresConnectionManager singleton.
 *
 * Each AgentRuntime still receives its own {@link IDatabaseAdapter} (per agentId).
 */

import { createDatabaseAdapter } from "@elizaos/plugin-sql";
import type { IDatabaseAdapter, UUID } from "@elizaos/core";

/**
 * Resolve Postgres URL for Eliza: prefer POSTGRES_URL, fall back to DATABASE_URL.
 */
export function resolveElizaPostgresUrl(): string | null {
  const fromPostgres = process.env.POSTGRES_URL?.trim();
  if (fromPostgres) return fromPostgres;
  const fromDatabase = process.env.DATABASE_URL?.trim();
  if (fromDatabase) return fromDatabase;
  return null;
}

/**
 * Ensure env vars are set so plugin-sql and other Eliza tooling see a consistent URL.
 * @throws if neither POSTGRES_URL nor DATABASE_URL is set
 */
export function ensureElizaPostgresEnv(): string {
  const url = resolveElizaPostgresUrl();
  if (!url) {
    throw new Error(
      "[eliza] Postgres URL required for embedded agents: set DATABASE_URL or POSTGRES_URL",
    );
  }
  if (!process.env.POSTGRES_URL) {
    process.env.POSTGRES_URL = url;
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = url;
  }
  if (!process.env.ELIZA_ENABLE_EMBEDDINGS_TABLE) {
    process.env.ELIZA_ENABLE_EMBEDDINGS_TABLE = "false";
  }
  return url;
}

/**
 * Create a Postgres-backed adapter for a single agent runtime.
 * Connection pooling is shared when the same postgresUrl is used (plugin-sql singleton).
 */
export function createSqlAdapterForAgent(
  agentId: UUID,
  postgresUrl: string,
): IDatabaseAdapter {
  return createDatabaseAdapter({ postgresUrl }, agentId);
}
