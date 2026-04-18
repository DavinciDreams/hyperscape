/**
 * @deprecated Re-export shim.
 *
 * Handler relocated to
 * `packages/shared/src/systems/server/network/handlers/friends.ts`
 * as part of the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 5).
 *
 * The migrated handler uses `world.getSystem("database") as IDatabaseSystem`
 * + `dbSystem.getFriendRepository()` for FriendRepository access instead of
 * instantiating one via WeakMap cache, so shared has no dependency on pg /
 * drizzle-orm.
 * Delete after Step 8.
 */

export * from "../../../../../shared/src/systems/server/network/handlers/friends";
