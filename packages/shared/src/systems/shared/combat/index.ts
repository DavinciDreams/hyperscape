/**
 * Combat barrel — most files migrated to @hyperforge/hyperscape
 * (2026-04-26, Wave 6). DeathTypes + DeathUtils stay in shared
 * because PlayerSystem/PlayerDeathSystem (now in plugin) still
 * import them via the top-level @hyperforge/shared barrel.
 */

export * from "./DeathTypes";
export * from "./DeathUtils";
