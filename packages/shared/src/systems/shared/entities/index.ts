/**
 * Entity Systems
 * Entity management, NPCs, mobs, spawning, spatial partitioning, and resources
 */

export * from "./Entities";
export * from "./EntityManager";
// NPCSystem migrated to @hyperforge/hyperscape (2026-04-25)
export * from "./MobNPCSystem";
// MobNPCSpawnerSystem migrated to @hyperforge/hyperscape (2026-04-25)
// StationSpawnerSystem migrated to @hyperforge/hyperscape (2026-04-25)
// ItemSpawnerSystem migrated to @hyperforge/hyperscape (2026-04-25)
// ResourceSystem migrated to @hyperforge/hyperscape (2026-04-25, Wave 1)
export * from "./SpatialEntityRegistry";
