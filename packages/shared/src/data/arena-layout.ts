/**
 * Arena Layout Constants — MANIFEST FAÇADE
 *
 * As of Phase A11 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, arena
 * positioning lives in `arena-layout.json`, validated at module load
 * time against `ArenaLayoutManifestSchema` from
 * `@hyperforge/manifest-schema`.
 *
 * ALL arena positioning derives from the values in this file. To
 * relocate the arena complex, edit the JSON manifest and everything
 * (visuals, server logic, zone bounds) follows automatically.
 */

import { ArenaLayoutManifestSchema } from "@hyperforge/manifest-schema";

import arenaLayoutManifestJson from "./arena-layout.json" with { type: "json" };

const manifest = ArenaLayoutManifestSchema.parse(arenaLayoutManifestJson);

// ---------------------------------------------------------------------------
// Arena Grid
// ---------------------------------------------------------------------------
export const ARENA_BASE_X = manifest.arenaGrid.baseX;
export const ARENA_BASE_Z = manifest.arenaGrid.baseZ;
export const ARENA_BASE_Y = manifest.arenaGrid.baseY;
export const ARENA_WIDTH = manifest.arenaGrid.width;
export const ARENA_LENGTH = manifest.arenaGrid.length;
export const ARENA_GAP = manifest.arenaGrid.gap;
export const ARENA_COLUMNS = manifest.arenaGrid.columns;
export const ARENA_ROWS = manifest.arenaGrid.rows;
export const ARENA_COUNT = manifest.arenaGrid.count;
export const ARENA_SPAWN_OFFSET = manifest.arenaGrid.spawnOffset;

// ---------------------------------------------------------------------------
// Lobby (south of arenas, right side)
// ---------------------------------------------------------------------------
export const LOBBY_CENTER_X = manifest.lobby.centerX;
export const LOBBY_CENTER_Z = manifest.lobby.centerZ;
export const LOBBY_WIDTH = manifest.lobby.width;
export const LOBBY_LENGTH = manifest.lobby.length;

// ---------------------------------------------------------------------------
// Hospital (south of arenas, left side)
// ---------------------------------------------------------------------------
export const HOSPITAL_CENTER_X = manifest.hospital.centerX;
export const HOSPITAL_CENTER_Z = manifest.hospital.centerZ;
export const HOSPITAL_WIDTH = manifest.hospital.width;
export const HOSPITAL_LENGTH = manifest.hospital.length;

// ---------------------------------------------------------------------------
// Lobby Spawn Point (where players appear in the lobby)
// ---------------------------------------------------------------------------
export const LOBBY_SPAWN_X = manifest.lobbySpawn.x;
export const LOBBY_SPAWN_Y = manifest.lobbySpawn.y;
export const LOBBY_SPAWN_Z = manifest.lobbySpawn.z;

// ---------------------------------------------------------------------------
// Derived: overall zone bounds (encompasses arenas + lobby + hospital + margin)
// ---------------------------------------------------------------------------
const gridMaxX =
  ARENA_BASE_X + ARENA_COLUMNS * ARENA_WIDTH + (ARENA_COLUMNS - 1) * ARENA_GAP;
const gridMaxZ =
  ARENA_BASE_Z + ARENA_ROWS * ARENA_LENGTH + (ARENA_ROWS - 1) * ARENA_GAP;
const lobbyMinX = LOBBY_CENTER_X - LOBBY_WIDTH / 2;
const lobbyMaxX = LOBBY_CENTER_X + LOBBY_WIDTH / 2;
const lobbyMinZ = LOBBY_CENTER_Z - LOBBY_LENGTH / 2;
const hospMinX = HOSPITAL_CENTER_X - HOSPITAL_WIDTH / 2;
const hospMinZ = HOSPITAL_CENTER_Z - HOSPITAL_LENGTH / 2;

const MARGIN = 15;
export const ZONE_BOUNDS_MIN_X =
  Math.min(ARENA_BASE_X, lobbyMinX, hospMinX) - MARGIN;
export const ZONE_BOUNDS_MAX_X = Math.max(gridMaxX, lobbyMaxX) + MARGIN;
export const ZONE_BOUNDS_MIN_Z =
  Math.min(ARENA_BASE_Z, lobbyMinZ, hospMinZ) - MARGIN;
export const ZONE_BOUNDS_MAX_Z = Math.max(gridMaxZ) + MARGIN;
