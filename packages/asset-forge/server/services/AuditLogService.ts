/**
 * Audit Log Service
 * Records significant actions for compliance and debugging.
 *
 * Database is optional — log calls are silently skipped when DB is unavailable.
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb, isDatabaseEnabled } from "../db/db";
import { auditLog, type AuditLogEntry } from "../db/schema";

export class AuditLogService {
  /**
   * Log an action. Fire-and-forget — never blocks the caller.
   */
  async log(entry: {
    teamId?: string;
    gameId?: string;
    userId?: string;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return;

    try {
      await db.insert(auditLog).values({
        teamId: entry.teamId ?? null,
        gameId: entry.gameId ?? null,
        userId: entry.userId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        details: entry.details ?? null,
      });
    } catch (error) {
      // Audit logging should never crash the request
      console.error("[AuditLog] Failed to write:", error);
    }
  }

  /**
   * Query audit logs for a team, ordered by most recent first.
   */
  async queryByTeam(
    teamId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<AuditLogEntry[]> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return [];

    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    return db
      .select()
      .from(auditLog)
      .where(eq(auditLog.teamId, teamId))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Query audit logs for a specific user across all teams.
   */
  async queryByUser(
    userId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<AuditLogEntry[]> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return [];

    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    return db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, userId))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Query audit logs for a specific target (e.g., a project).
   */
  async queryByTarget(
    targetType: string,
    targetId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<AuditLogEntry[]> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return [];

    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    return db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetType, targetType),
          eq(auditLog.targetId, targetId),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset);
  }
}
