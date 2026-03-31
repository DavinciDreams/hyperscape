/**
 * Forge Users Schema
 * Asset Forge user accounts linked to game users via Privy
 */

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

export const forgeUsers = pgTable(
  "forge_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Privy identity link
    privyUserId: text("privy_user_id").unique(),

    // Profile
    email: text("email"),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  },
  (table) => ({
    privyIdx: index("idx_forge_users_privy").on(table.privyUserId),
  }),
);

// Type exports
export type ForgeUser = typeof forgeUsers.$inferSelect;
export type NewForgeUser = typeof forgeUsers.$inferInsert;
