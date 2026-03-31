/**
 * Forge User Service
 * Manages forge_users records — the user identity layer for World Studio.
 *
 * Database is optional — all operations return null when DB is unavailable.
 */

import { eq } from "drizzle-orm";
import { getDb, isDatabaseEnabled } from "../db/db";
import { forgeUsers, type ForgeUser } from "../db/schema";

export class ForgeUserService {
  async getById(id: string): Promise<ForgeUser | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [user] = await db
      .select()
      .from(forgeUsers)
      .where(eq(forgeUsers.id, id))
      .limit(1);

    return user ?? null;
  }

  async getByPrivyUserId(privyUserId: string): Promise<ForgeUser | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [user] = await db
      .select()
      .from(forgeUsers)
      .where(eq(forgeUsers.privyUserId, privyUserId))
      .limit(1);

    return user ?? null;
  }

  async findOrCreateByPrivy(
    privyUserId: string,
    email: string | null,
    displayName: string | null,
  ): Promise<ForgeUser | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const existing = await this.getByPrivyUserId(privyUserId);
    if (existing) {
      // Touch last_active_at
      await db
        .update(forgeUsers)
        .set({ lastActiveAt: new Date() })
        .where(eq(forgeUsers.id, existing.id));
      return existing;
    }

    const [newUser] = await db
      .insert(forgeUsers)
      .values({
        privyUserId,
        email,
        displayName: displayName || privyUserId,
      })
      .returning();

    return newUser;
  }

  async updateProfile(
    id: string,
    updates: { displayName?: string; avatarUrl?: string | null },
  ): Promise<ForgeUser | null> {
    const db = getDb();
    if (!isDatabaseEnabled() || !db) return null;

    const [updated] = await db
      .update(forgeUsers)
      .set(updates)
      .where(eq(forgeUsers.id, id))
      .returning();

    return updated ?? null;
  }
}
