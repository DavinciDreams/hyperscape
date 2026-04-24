/**
 * UI Layout Service
 * CRUD for standalone UILayoutManifest assets stored in PostgreSQL.
 *
 * Layouts are referenced from game code / project data by `{ layoutId }`;
 * the full UILayoutManifest JSON lives here.
 *
 * Validation (UILayoutManifestSchema from @hyperforge/ui-framework) is
 * the caller's responsibility before insert/update — the route layer
 * does that so the service stays storage-only.
 */

import { eq, and, or, isNull } from "drizzle-orm";
import { getDb, isDatabaseEnabled } from "../db/db";
import { uiLayouts, type UILayoutRow, type NewUILayoutRow } from "../db/schema";

export class UILayoutService {
  /** List layouts visible to a team (team-owned + public library + templates). */
  async listForTeam(teamId: string): Promise<UILayoutRow[]> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return [];

    return db
      .select()
      .from(uiLayouts)
      .where(
        or(
          eq(uiLayouts.teamId, teamId),
          eq(uiLayouts.isPublic, true),
          eq(uiLayouts.isTemplate, true),
        ),
      );
  }

  /**
   * List layouts available for a specific game context (U6).
   *
   * Returned set:
   *   - team-owned layouts scoped to this `gameId`
   *   - team-owned layouts that are team-wide (`gameId IS NULL`)
   *   - public layouts and templates (same visibility as `listForTeam`)
   *
   * Used by the player-facing layout switcher — the game at runtime
   * picks one of these as the active HUD.
   */
  async listForGame(teamId: string, gameId: string): Promise<UILayoutRow[]> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return [];

    return db
      .select()
      .from(uiLayouts)
      .where(
        or(
          and(
            eq(uiLayouts.teamId, teamId),
            or(eq(uiLayouts.gameId, gameId), isNull(uiLayouts.gameId)),
          ),
          eq(uiLayouts.isPublic, true),
          eq(uiLayouts.isTemplate, true),
        ),
      );
  }

  /** List only templates (public starter layouts). */
  async listTemplates(): Promise<UILayoutRow[]> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return [];

    return db.select().from(uiLayouts).where(eq(uiLayouts.isTemplate, true));
  }

  /** Get a single layout by id. */
  async getById(layoutId: string): Promise<UILayoutRow | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [row] = await db
      .select()
      .from(uiLayouts)
      .where(eq(uiLayouts.id, layoutId))
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
        ? eq(uiLayouts.gameId, null as unknown as string)
        : eq(uiLayouts.gameId, gameId);

    const [existing] = await db
      .select({ id: uiLayouts.id })
      .from(uiLayouts)
      .where(
        and(
          eq(uiLayouts.teamId, teamId),
          scopeFilter,
          eq(uiLayouts.slug, slug),
        ),
      )
      .limit(1);

    return !!existing;
  }

  /** Create a new layout row. Caller must validate `manifestData` first. */
  async create(data: NewUILayoutRow): Promise<UILayoutRow | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [row] = await db.insert(uiLayouts).values(data).returning();
    return row;
  }

  /** Update an existing layout. Returns the new row, or null if not found. */
  async update(
    layoutId: string,
    updates: {
      name?: string;
      slug?: string;
      description?: string | null;
      version?: string;
      manifestData?: unknown;
      isTemplate?: boolean;
      isPublic?: boolean;
    },
  ): Promise<UILayoutRow | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) setValues.name = updates.name;
    if (updates.slug !== undefined) setValues.slug = updates.slug;
    if (updates.description !== undefined)
      setValues.description = updates.description;
    if (updates.version !== undefined) setValues.version = updates.version;
    if (updates.manifestData !== undefined)
      setValues.manifestData = updates.manifestData;
    if (updates.isTemplate !== undefined)
      setValues.isTemplate = updates.isTemplate;
    if (updates.isPublic !== undefined) setValues.isPublic = updates.isPublic;

    const [updated] = await db
      .update(uiLayouts)
      .set(setValues)
      .where(eq(uiLayouts.id, layoutId))
      .returning();

    return updated ?? null;
  }

  /** Delete a layout by id. Returns true if a row was deleted. */
  async delete(layoutId: string): Promise<boolean> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return false;

    const result = await db.delete(uiLayouts).where(eq(uiLayouts.id, layoutId));
    return (result?.rowCount ?? 0) > 0;
  }
}
