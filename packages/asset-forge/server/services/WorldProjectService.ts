/**
 * World Project Service
 * CRUD operations for world projects with optimistic locking and versioning.
 *
 * Database is optional — all operations return null/empty when DB is unavailable.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { getDb, isDatabaseEnabled } from "../db/db";
import {
  worldProjects,
  worldDeployments,
  type WorldProject,
  type WorldDeployment,
} from "../db/schema";

/** Lock expiry: 30 minutes */
const LOCK_EXPIRY_MS = 30 * 60 * 1000;

export class WorldProjectService {
  // ==================== CRUD ====================

  async create(data: {
    teamId: string;
    gameId: string;
    name: string;
    description?: string;
    worldData: Record<string, unknown>;
    createdBy: string;
  }): Promise<WorldProject | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [project] = await db
      .insert(worldProjects)
      .values({
        teamId: data.teamId,
        gameId: data.gameId,
        name: data.name,
        description: data.description ?? null,
        worldData: data.worldData,
        createdBy: data.createdBy,
      })
      .returning();

    return project;
  }

  async list(
    teamId: string,
    gameId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<WorldProject[]> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return [];

    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    return db
      .select()
      .from(worldProjects)
      .where(
        and(eq(worldProjects.teamId, teamId), eq(worldProjects.gameId, gameId)),
      )
      .orderBy(desc(worldProjects.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  async getById(projectId: string): Promise<WorldProject | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [project] = await db
      .select()
      .from(worldProjects)
      .where(eq(worldProjects.id, projectId))
      .limit(1);

    return project ?? null;
  }

  /**
   * Save (update) a world project.
   * Increments version, checks optimistic lock, updates timestamp.
   */
  async save(
    projectId: string,
    data: {
      name?: string;
      description?: string;
      worldData?: Record<string, unknown>;
    },
    userId: string,
  ): Promise<WorldProject | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    // Check lock
    const existing = await this.getById(projectId);
    if (!existing) return null;

    if (existing.lockedBy && existing.lockedBy !== userId) {
      // Check if lock expired
      if (existing.lockedAt) {
        const lockAge = Date.now() - new Date(existing.lockedAt).getTime();
        if (lockAge < LOCK_EXPIRY_MS) {
          throw new Error(
            `Project is locked by another user. Lock expires in ${Math.ceil((LOCK_EXPIRY_MS - lockAge) / 60000)} minutes.`,
          );
        }
      }
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      version: sql`${worldProjects.version} + 1`,
    };

    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.worldData !== undefined) updates.worldData = data.worldData;

    const [updated] = await db
      .update(worldProjects)
      .set(updates)
      .where(eq(worldProjects.id, projectId))
      .returning();

    return updated ?? null;
  }

  async delete(projectId: string): Promise<boolean> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return false;

    const result = await db
      .delete(worldProjects)
      .where(eq(worldProjects.id, projectId));

    return (result?.rowCount ?? 0) > 0;
  }

  // ==================== Locking ====================

  async acquireLock(
    projectId: string,
    userId: string,
  ): Promise<{ success: boolean; lockedBy?: string }> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return { success: false };

    const project = await this.getById(projectId);
    if (!project) return { success: false };

    // Already locked by this user
    if (project.lockedBy === userId) {
      // Refresh lock timestamp
      await db
        .update(worldProjects)
        .set({ lockedAt: new Date() })
        .where(eq(worldProjects.id, projectId));
      return { success: true };
    }

    // Locked by someone else — check expiry
    if (project.lockedBy && project.lockedAt) {
      const lockAge = Date.now() - new Date(project.lockedAt).getTime();
      if (lockAge < LOCK_EXPIRY_MS) {
        return { success: false, lockedBy: project.lockedBy };
      }
    }

    // Acquire lock
    await db
      .update(worldProjects)
      .set({ lockedBy: userId, lockedAt: new Date() })
      .where(eq(worldProjects.id, projectId));

    return { success: true };
  }

  async releaseLock(projectId: string, userId: string): Promise<boolean> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return false;

    const project = await this.getById(projectId);
    if (!project) return false;

    // Only the lock holder (or expired lock) can release
    if (project.lockedBy && project.lockedBy !== userId) {
      if (project.lockedAt) {
        const lockAge = Date.now() - new Date(project.lockedAt).getTime();
        if (lockAge < LOCK_EXPIRY_MS) return false;
      }
    }

    await db
      .update(worldProjects)
      .set({ lockedBy: null, lockedAt: null })
      .where(eq(worldProjects.id, projectId));

    return true;
  }

  // ==================== Snapshots ====================

  /**
   * Create a manifest snapshot on the project (saves current manifests state).
   */
  async createSnapshot(
    projectId: string,
    manifestSnapshot: Record<string, unknown>,
  ): Promise<WorldProject | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [updated] = await db
      .update(worldProjects)
      .set({
        manifestSnapshot,
        updatedAt: new Date(),
      })
      .where(eq(worldProjects.id, projectId))
      .returning();

    return updated ?? null;
  }

  // ==================== Deployments ====================

  async createDeployment(data: {
    projectId: string;
    gameId: string;
    target: "staging" | "production";
    version: number;
    manifestDiff?: Record<string, unknown>;
    assetDiff?: Record<string, unknown>;
    deployedBy: string;
    approvedBy?: string;
    rollbackData?: Record<string, unknown>;
  }): Promise<WorldDeployment | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [deployment] = await db
      .insert(worldDeployments)
      .values({
        projectId: data.projectId,
        gameId: data.gameId,
        target: data.target,
        version: data.version,
        manifestDiff: data.manifestDiff ?? null,
        assetDiff: data.assetDiff ?? null,
        deployedBy: data.deployedBy,
        approvedBy: data.approvedBy ?? null,
        rollbackData: data.rollbackData ?? null,
      })
      .returning();

    return deployment;
  }

  async getDeployments(
    projectId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<WorldDeployment[]> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return [];

    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;

    return db
      .select()
      .from(worldDeployments)
      .where(eq(worldDeployments.projectId, projectId))
      .orderBy(desc(worldDeployments.deployedAt))
      .limit(limit)
      .offset(offset);
  }

  async getLatestDeployment(
    gameId: string,
    target: "staging" | "production",
  ): Promise<WorldDeployment | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [deployment] = await db
      .select()
      .from(worldDeployments)
      .where(
        and(
          eq(worldDeployments.gameId, gameId),
          eq(worldDeployments.target, target),
        ),
      )
      .orderBy(desc(worldDeployments.deployedAt))
      .limit(1);

    return deployment ?? null;
  }
}
