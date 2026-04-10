/**
 * World storage: IndexedDB persistence, autosave/localStorage, and import-merge from storage.
 */

import type { WorldData } from "../types";

import type { SerializedWorldData } from "./worldSerialization";
import { serializeWorld, deserializeWorld } from "./worldSerialization";
import type {
  FullGameManifest,
  ManifestMergeOptions,
} from "./worldManifestExport";
import {
  exportFullGameManifest,
  mergeManifestIntoWorld,
} from "./worldManifestExport";

const DB_NAME = "world-builder-db";
const DB_VERSION = 1;
const WORLD_STORE = "worlds";
const MANIFEST_STORE = "manifests";

/** Check if IndexedDB is available (fails in private browsing on some browsers) */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

/** Check if localStorage is available and has space */
export function isLocalStorageAvailable(): boolean {
  try {
    const test = "__storage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error("IndexedDB not available (private browsing mode?)"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () =>
      reject(
        new Error(`IndexedDB error: ${request.error?.message || "unknown"}`),
      );
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create worlds store
      if (!db.objectStoreNames.contains(WORLD_STORE)) {
        const worldStore = db.createObjectStore(WORLD_STORE, { keyPath: "id" });
        worldStore.createIndex("name", "name", { unique: false });
        worldStore.createIndex("modifiedAt", "modifiedAt", { unique: false });
      }

      // Create manifests store
      if (!db.objectStoreNames.contains(MANIFEST_STORE)) {
        const manifestStore = db.createObjectStore(MANIFEST_STORE, {
          keyPath: "worldId",
        });
        manifestStore.createIndex("exportedAt", "exportedAt", {
          unique: false,
        });
      }
    };
  });
}

export async function saveWorldToIndexedDB(world: WorldData): Promise<void> {
  const db = await openDatabase();
  const serialized = serializeWorld(world);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WORLD_STORE], "readwrite");
    const store = transaction.objectStore(WORLD_STORE);
    const request = store.put(serialized);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function loadWorldFromIndexedDB(
  worldId: string,
): Promise<WorldData | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WORLD_STORE], "readonly");
    const store = transaction.objectStore(WORLD_STORE);
    const request = store.get(worldId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (request.result) {
        resolve(deserializeWorld(request.result));
      } else {
        resolve(null);
      }
    };
  });
}

export async function listWorldsInIndexedDB(): Promise<
  Array<{ id: string; name: string; modifiedAt: number }>
> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WORLD_STORE], "readonly");
    const store = transaction.objectStore(WORLD_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const worlds = request.result.map((w: SerializedWorldData) => ({
        id: w.id,
        name: w.name,
        modifiedAt: w.modifiedAt,
      }));
      resolve(worlds.sort((a, b) => b.modifiedAt - a.modifiedAt));
    };
  });
}

export async function deleteWorldFromIndexedDB(worldId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [WORLD_STORE, MANIFEST_STORE],
      "readwrite",
    );

    // Delete from worlds store
    const worldStore = transaction.objectStore(WORLD_STORE);
    worldStore.delete(worldId);

    // Delete associated manifest
    const manifestStore = transaction.objectStore(MANIFEST_STORE);
    manifestStore.delete(worldId);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveManifestToIndexedDB(
  manifest: FullGameManifest,
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MANIFEST_STORE], "readwrite");
    const store = transaction.objectStore(MANIFEST_STORE);
    const request = store.put(manifest);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function loadManifestFromIndexedDB(
  worldId: string,
): Promise<FullGameManifest | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MANIFEST_STORE], "readonly");
    const store = transaction.objectStore(MANIFEST_STORE);
    const request = store.get(worldId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

export async function exportAndCacheWorld(
  world: WorldData,
): Promise<FullGameManifest> {
  // Save world
  await saveWorldToIndexedDB(world);

  // Generate and save manifest
  const manifest = exportFullGameManifest(world);
  await saveManifestToIndexedDB(manifest);

  return manifest;
}

export async function importAndMergeFromIndexedDB(
  targetWorld: WorldData,
  sourceWorldId: string,
  options?: Partial<ManifestMergeOptions>,
): Promise<WorldData> {
  const manifest = await loadManifestFromIndexedDB(sourceWorldId);
  if (!manifest) {
    throw new Error(`No manifest found for world ${sourceWorldId}`);
  }

  return mergeManifestIntoWorld(targetWorld, manifest, options);
}

const AUTOSAVE_KEY = "worldbuilder_autosave";
const AUTOSAVE_LIST_KEY = "worldbuilder_autosave_list";
const MAX_AUTOSAVES = 10;

interface AutosaveMetadata {
  worldId: string;
  worldName: string;
  savedAt: number;
  storageKey: string;
}

export function getAutosaveList(): AutosaveMetadata[] {
  const listJson = localStorage.getItem(AUTOSAVE_LIST_KEY);
  if (!listJson) return [];

  const list = JSON.parse(listJson) as AutosaveMetadata[];
  return list.sort((a, b) => b.savedAt - a.savedAt);
}

export function autosaveWorld(world: WorldData): void {
  if (!isLocalStorageAvailable()) return; // Silently skip if unavailable

  const storageKey = `${AUTOSAVE_KEY}_${world.id}`;
  const serialized = serializeWorld(world);

  try {
    localStorage.setItem(storageKey, JSON.stringify(serialized));
  } catch {
    // localStorage full or unavailable - silently skip
    return;
  }

  // Update the autosave list
  const list = getAutosaveList();
  const existingIndex = list.findIndex((m) => m.worldId === world.id);

  const metadata: AutosaveMetadata = {
    worldId: world.id,
    worldName: world.name,
    savedAt: Date.now(),
    storageKey,
  };

  if (existingIndex >= 0) {
    list[existingIndex] = metadata;
  } else {
    list.unshift(metadata);
  }

  // Prune old autosaves if we exceed the limit
  while (list.length > MAX_AUTOSAVES) {
    const oldest = list.pop();
    if (oldest) {
      localStorage.removeItem(oldest.storageKey);
    }
  }

  localStorage.setItem(AUTOSAVE_LIST_KEY, JSON.stringify(list));
}

export function loadAutosave(worldId: string): WorldData | null {
  const storageKey = `${AUTOSAVE_KEY}_${worldId}`;
  const json = localStorage.getItem(storageKey);
  if (!json) return null;

  const serialized = JSON.parse(json) as SerializedWorldData;
  return deserializeWorld(serialized);
}

export function deleteAutosave(worldId: string): void {
  const storageKey = `${AUTOSAVE_KEY}_${worldId}`;
  localStorage.removeItem(storageKey);

  const list = getAutosaveList();
  const filtered = list.filter((m) => m.worldId !== worldId);
  localStorage.setItem(AUTOSAVE_LIST_KEY, JSON.stringify(filtered));
}

export function clearAllAutosaves(): void {
  const list = getAutosaveList();
  for (const metadata of list) {
    localStorage.removeItem(metadata.storageKey);
  }
  localStorage.removeItem(AUTOSAVE_LIST_KEY);
}

export function getMostRecentAutosave(): WorldData | null {
  const list = getAutosaveList();
  if (list.length === 0) return null;
  return loadAutosave(list[0].worldId);
}
