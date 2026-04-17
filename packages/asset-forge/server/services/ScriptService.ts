/**
 * Script Service
 * CRUD operations for standalone visual scripting graphs stored in PostgreSQL.
 *
 * Scripts are referenced from world projects by `{ scriptId, version }`; the
 * full RuntimeScriptGraph JSON lives here.
 *
 * Validation (scriptGraphValidator) is the caller's responsibility before
 * insert/update.
 */

import { eq, and, or } from "drizzle-orm";
import { getDb, isDatabaseEnabled } from "../db/db";
import { scripts, type ScriptRow, type NewScriptRow } from "../db/schema";

export class ScriptService {
  /** List scripts visible to a team (team-owned + public library + templates). */
  async listForTeam(teamId: string): Promise<ScriptRow[]> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return [];

    return db
      .select()
      .from(scripts)
      .where(
        or(
          eq(scripts.teamId, teamId),
          eq(scripts.isPublic, true),
          eq(scripts.isTemplate, true),
        ),
      );
  }

  /** List only templates (publicly available starter graphs). */
  async listTemplates(): Promise<ScriptRow[]> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return [];

    return db.select().from(scripts).where(eq(scripts.isTemplate, true));
  }

  /** Get a single script by id. */
  async getById(scriptId: string): Promise<ScriptRow | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [row] = await db
      .select()
      .from(scripts)
      .where(eq(scripts.id, scriptId))
      .limit(1);

    return row ?? null;
  }

  /** Slug uniqueness check within a (team, gameId) bucket. */
  async slugExists(
    teamId: string,
    gameId: string | null,
    slug: string,
  ): Promise<boolean> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return false;

    const scopeFilter =
      gameId === null
        ? eq(scripts.gameId, null as unknown as string)
        : eq(scripts.gameId, gameId);

    const [existing] = await db
      .select({ id: scripts.id })
      .from(scripts)
      .where(
        and(eq(scripts.teamId, teamId), scopeFilter, eq(scripts.slug, slug)),
      )
      .limit(1);

    return !!existing;
  }

  /** Create a new script row. Caller must validate `graphData` first. */
  async create(data: NewScriptRow): Promise<ScriptRow | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [row] = await db.insert(scripts).values(data).returning();
    return row;
  }

  /** Update an existing script. Returns the new row, or null if not found. */
  async update(
    scriptId: string,
    updates: {
      name?: string;
      slug?: string;
      description?: string | null;
      version?: string;
      graphData?: unknown;
      isTemplate?: boolean;
      isPublic?: boolean;
    },
  ): Promise<ScriptRow | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) setValues.name = updates.name;
    if (updates.slug !== undefined) setValues.slug = updates.slug;
    if (updates.description !== undefined)
      setValues.description = updates.description;
    if (updates.version !== undefined) setValues.version = updates.version;
    if (updates.graphData !== undefined)
      setValues.graphData = updates.graphData;
    if (updates.isTemplate !== undefined)
      setValues.isTemplate = updates.isTemplate;
    if (updates.isPublic !== undefined) setValues.isPublic = updates.isPublic;

    const [updated] = await db
      .update(scripts)
      .set(setValues)
      .where(eq(scripts.id, scriptId))
      .returning();

    return updated ?? null;
  }

  /** Delete a script by id. Returns true if a row was deleted. */
  async delete(scriptId: string): Promise<boolean> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return false;

    const result = await db.delete(scripts).where(eq(scripts.id, scriptId));
    return (result?.rowCount ?? 0) > 0;
  }
}
