/**
 * Game Module Service
 * CRUD operations for custom GameModule definitions stored in PostgreSQL.
 *
 * Built-in modules (e.g. Hyperscape) are NOT stored in the database — the
 * route layer injects them as synthetic entries.
 */

import { eq, and } from "drizzle-orm";
import { getDb, isDatabaseEnabled } from "../db/db";
import {
  gameModules,
  type GameModuleRow,
  type NewGameModuleRow,
} from "../db/schema";

export class GameModuleService {
  /**
   * List all custom modules for a team.
   * Does NOT include built-in modules — the route layer merges those in.
   */
  async listForTeam(teamId: string): Promise<GameModuleRow[]> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return [];

    return db.select().from(gameModules).where(eq(gameModules.teamId, teamId));
  }

  /**
   * Get a single module by ID.
   * Returns null if not found or DB is unavailable.
   */
  async getById(moduleId: string): Promise<GameModuleRow | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [row] = await db
      .select()
      .from(gameModules)
      .where(eq(gameModules.id, moduleId))
      .limit(1);

    return row ?? null;
  }

  /**
   * Check if a slug already exists for a given team.
   */
  async slugExists(teamId: string, slug: string): Promise<boolean> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return false;

    const [existing] = await db
      .select({ id: gameModules.id })
      .from(gameModules)
      .where(and(eq(gameModules.teamId, teamId), eq(gameModules.slug, slug)))
      .limit(1);

    return !!existing;
  }

  /**
   * Create a new custom module.
   * The caller is responsible for validation (loadGameModule) before calling this.
   */
  async create(data: NewGameModuleRow): Promise<GameModuleRow | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [row] = await db.insert(gameModules).values(data).returning();
    return row;
  }

  /**
   * Update an existing module.
   * Returns the updated row or null if not found.
   */
  async update(
    moduleId: string,
    updates: {
      name?: string;
      slug?: string;
      version?: string;
      moduleData?: unknown;
    },
  ): Promise<GameModuleRow | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const setValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (updates.name !== undefined) setValues.name = updates.name;
    if (updates.slug !== undefined) setValues.slug = updates.slug;
    if (updates.version !== undefined) setValues.version = updates.version;
    if (updates.moduleData !== undefined)
      setValues.moduleData = updates.moduleData;

    const [updated] = await db
      .update(gameModules)
      .set(setValues)
      .where(eq(gameModules.id, moduleId))
      .returning();

    return updated ?? null;
  }

  /**
   * Delete a module by ID.
   * Returns true if a row was deleted.
   */
  async delete(moduleId: string): Promise<boolean> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return false;

    const result = await db
      .delete(gameModules)
      .where(eq(gameModules.id, moduleId));

    return (result?.rowCount ?? 0) > 0;
  }
}
