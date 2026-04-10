/**
 * World persistence: barrel re-export of all sub-modules.
 *
 * Split into focused modules:
 *   - worldSerialization: serialize/deserialize, import/export JSON, file I/O, world creation
 *   - worldValidation: data validation, migration, game export validation, reference checking
 *   - worldManifestExport: game manifest generation, download, clipboard, merge
 *   - worldStorage: IndexedDB persistence, autosave/localStorage
 *   - worldGeneration: difficulty zones, wilderness, mob spawns, boss generation
 */

// --- worldSerialization ---
export {
  serializeWorld,
  deserializeWorld,
  exportWorldToJSON,
  importWorldFromJSON,
  downloadWorldAsFile,
  importWorldFromFile,
  generateWorldId,
  generateWorldName,
  createNewWorld,
  calculateWorldStats,
} from "./worldSerialization";

export type {
  SerializedWorldData,
  SerializedWorldFoundation,
  SerializedWorldLayers,
} from "./worldSerialization";

// --- worldValidation ---
export {
  validateWorldData,
  migrateWorldData,
  validateGameExport,
  validateWorldReferences,
} from "./worldValidation";

export type {
  ExportValidationError,
  ExportValidationResult,
} from "./worldValidation";

// --- worldManifestExport ---
export {
  exportToGameManifest,
  exportFullGameManifest,
  downloadGameManifests,
  downloadAllGameManifests,
  copyGameManifestsToClipboard,
  importManifestFromFile,
  mergeManifestIntoWorld,
  DEFAULT_MERGE_OPTIONS,
} from "./worldManifestExport";

export type {
  FullGameManifest,
  MergeStrategy,
  ManifestMergeOptions,
} from "./worldManifestExport";

// --- worldStorage ---
export {
  isIndexedDBAvailable,
  isLocalStorageAvailable,
  saveWorldToIndexedDB,
  loadWorldFromIndexedDB,
  listWorldsInIndexedDB,
  deleteWorldFromIndexedDB,
  saveManifestToIndexedDB,
  loadManifestFromIndexedDB,
  exportAndCacheWorld,
  importAndMergeFromIndexedDB,
  getAutosaveList,
  autosaveWorld,
  loadAutosave,
  deleteAutosave,
  clearAllAutosaves,
  getMostRecentAutosave,
} from "./worldStorage";

// --- worldGeneration ---
export {
  generateDifficultyZones,
  generateWilderness,
  isInWilderness,
  getWildernessLevel,
  generateMobSpawns,
  generateBosses,
} from "./worldGeneration";

// --- Default export (preserves backward compatibility) ---
import {
  serializeWorld,
  deserializeWorld,
  exportWorldToJSON,
  importWorldFromJSON,
  downloadWorldAsFile,
  importWorldFromFile,
  generateWorldId,
  generateWorldName,
  createNewWorld,
  calculateWorldStats,
} from "./worldSerialization";

import {
  validateWorldData,
  migrateWorldData,
  validateGameExport,
  validateWorldReferences,
} from "./worldValidation";

import {
  exportToGameManifest,
  exportFullGameManifest,
  downloadGameManifests,
  downloadAllGameManifests,
  copyGameManifestsToClipboard,
  importManifestFromFile,
  mergeManifestIntoWorld,
} from "./worldManifestExport";

import {
  saveWorldToIndexedDB,
  loadWorldFromIndexedDB,
  listWorldsInIndexedDB,
  deleteWorldFromIndexedDB,
  saveManifestToIndexedDB,
  loadManifestFromIndexedDB,
  exportAndCacheWorld,
  importAndMergeFromIndexedDB,
  getAutosaveList,
  autosaveWorld,
  loadAutosave,
  deleteAutosave,
  clearAllAutosaves,
  getMostRecentAutosave,
} from "./worldStorage";

import {
  generateDifficultyZones,
  generateWilderness,
  isInWilderness,
  getWildernessLevel,
  generateMobSpawns,
  generateBosses,
} from "./worldGeneration";

export default {
  serializeWorld,
  deserializeWorld,
  exportWorldToJSON,
  importWorldFromJSON,
  downloadWorldAsFile,
  importWorldFromFile,
  validateWorldData,
  validateWorldReferences,
  migrateWorldData,
  generateWorldId,
  generateWorldName,
  createNewWorld,
  calculateWorldStats,
  exportToGameManifest,
  validateGameExport,
  downloadGameManifests,
  copyGameManifestsToClipboard,
  // Autosave
  getAutosaveList,
  autosaveWorld,
  loadAutosave,
  deleteAutosave,
  clearAllAutosaves,
  getMostRecentAutosave,
  // Difficulty zones
  generateDifficultyZones,
  generateWilderness,
  isInWilderness,
  getWildernessLevel,
  // Mob spawns
  generateMobSpawns,
  // Boss generation
  generateBosses,
  // Full export
  exportFullGameManifest,
  downloadAllGameManifests,
  // IndexedDB storage
  saveWorldToIndexedDB,
  loadWorldFromIndexedDB,
  listWorldsInIndexedDB,
  deleteWorldFromIndexedDB,
  saveManifestToIndexedDB,
  loadManifestFromIndexedDB,
  exportAndCacheWorld,
  // Import & merge
  importManifestFromFile,
  mergeManifestIntoWorld,
  importAndMergeFromIndexedDB,
};
