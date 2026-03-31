/**
 * EntityRegistry — Unified registry of all entities from all sources.
 *
 * Inspired by UE5's World Outliner, this provides a flat Map of every entity
 * in the world regardless of source (manifest, extended layers, foundation).
 *
 * Used by:
 * - OutlinerPanel (tree view)
 * - Selection system (object lookup)
 * - Data layers (visibility toggling)
 */

import * as THREE from "three";

// ============== TYPES ==============

/** Entity source — where the entity data comes from */
export type EntitySource =
  | "manifest"
  | "extended"
  | "foundation"
  | "vegetation";

/** Entity category for filtering and display */
export type EntityCategory =
  | "npc"
  | "station"
  | "resource"
  | "mobSpawn"
  | "spawnPoint"
  | "teleport"
  | "poi"
  | "waterBody"
  | "town"
  | "building"
  | "road"
  | "musicZone"
  | "ambientZone"
  | "sfxTrigger";

/** Unified entity descriptor */
export interface EntityDescriptor {
  id: string;
  type: EntityCategory;
  name: string;
  source: EntitySource;
  position: { x: number; y: number; z: number };
  visible: boolean;
  locked: boolean;
  folder?: string;
  /** Reference to 3D scene object for viewport interaction */
  sceneObject?: THREE.Object3D;
  /** Type-specific metadata */
  metadata: Record<string, unknown>;
}

/** Listener for registry changes */
export type RegistryChangeListener = (
  entities: Map<string, EntityDescriptor>,
) => void;

// ============== CATEGORY DISPLAY CONFIG ==============

export const CATEGORY_CONFIG: Record<
  EntityCategory,
  { label: string; icon: string; color: string }
> = {
  npc: { label: "NPCs", icon: "User", color: "#ffd700" },
  station: { label: "Stations", icon: "Box", color: "#f59e0b" },
  resource: { label: "Resources", icon: "Gem", color: "#3b82f6" },
  mobSpawn: { label: "Mob Spawns", icon: "Skull", color: "#ef4444" },
  spawnPoint: { label: "Spawn Points", icon: "MapPin", color: "#22c55e" },
  teleport: { label: "Teleports", icon: "Zap", color: "#8b5cf6" },
  poi: { label: "Points of Interest", icon: "Star", color: "#ec4899" },
  waterBody: { label: "Water Bodies", icon: "Droplets", color: "#06b6d4" },
  town: { label: "Towns", icon: "Home", color: "#ff0000" },
  building: { label: "Buildings", icon: "Building2", color: "#a855f7" },
  road: { label: "Roads", icon: "Route", color: "#78716c" },
  musicZone: { label: "Music Zones", icon: "Music", color: "#f97316" },
  ambientZone: { label: "Ambient Zones", icon: "Volume2", color: "#14b8a6" },
  sfxTrigger: { label: "SFX Triggers", icon: "Bell", color: "#eab308" },
};

// ============== ENTITY REGISTRY ==============

export class EntityRegistry {
  private entities: Map<string, EntityDescriptor> = new Map();
  private listeners: Set<RegistryChangeListener> = new Set();
  private categoryVisibility: Map<EntityCategory, boolean> = new Map();

  constructor() {
    // All categories visible by default
    for (const cat of Object.keys(CATEGORY_CONFIG) as EntityCategory[]) {
      this.categoryVisibility.set(cat, true);
    }
  }

  /** Register or update an entity */
  set(id: string, descriptor: EntityDescriptor): void {
    this.entities.set(id, descriptor);
    this.notify();
  }

  /** Remove an entity */
  delete(id: string): void {
    this.entities.delete(id);
    this.notify();
  }

  /** Get an entity by ID */
  get(id: string): EntityDescriptor | undefined {
    return this.entities.get(id);
  }

  /** Check if an entity exists */
  has(id: string): boolean {
    return this.entities.has(id);
  }

  /** Get all entities */
  getAll(): Map<string, EntityDescriptor> {
    return this.entities;
  }

  /** Get entities by category */
  getByCategory(category: EntityCategory): EntityDescriptor[] {
    const result: EntityDescriptor[] = [];
    for (const entity of this.entities.values()) {
      if (entity.type === category) result.push(entity);
    }
    return result;
  }

  /** Get entities by source */
  getBySource(source: EntitySource): EntityDescriptor[] {
    const result: EntityDescriptor[] = [];
    for (const entity of this.entities.values()) {
      if (entity.source === source) result.push(entity);
    }
    return result;
  }

  /** Get entity count per category */
  getCategoryCounts(): Map<EntityCategory, number> {
    const counts = new Map<EntityCategory, number>();
    for (const entity of this.entities.values()) {
      counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
    }
    return counts;
  }

  /** Total entity count */
  get size(): number {
    return this.entities.size;
  }

  /** Toggle visibility of a category */
  setCategoryVisibility(category: EntityCategory, visible: boolean): void {
    this.categoryVisibility.set(category, visible);
    // Update all entities of this category
    for (const entity of this.entities.values()) {
      if (entity.type === category) {
        entity.visible = visible;
        if (entity.sceneObject) {
          entity.sceneObject.visible = visible;
        }
      }
    }
    this.notify();
  }

  /** Get visibility of a category */
  isCategoryVisible(category: EntityCategory): boolean {
    return this.categoryVisibility.get(category) ?? true;
  }

  /** Clear all entities */
  clear(): void {
    this.entities.clear();
    this.notify();
  }

  /** Search entities by name */
  search(query: string): EntityDescriptor[] {
    const lower = query.toLowerCase();
    const results: EntityDescriptor[] = [];
    for (const entity of this.entities.values()) {
      if (
        entity.name.toLowerCase().includes(lower) ||
        entity.id.toLowerCase().includes(lower)
      ) {
        results.push(entity);
      }
    }
    return results;
  }

  /** Subscribe to changes */
  subscribe(listener: RegistryChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.entities);
    }
  }
}

/** Singleton registry for the editor */
export const entityRegistry = new EntityRegistry();
