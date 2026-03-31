import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types – World positions & placed entities
// ---------------------------------------------------------------------------

interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

interface PlacedSpawnPoint {
  id: string;
  name: string;
  position: WorldPosition;
  rotation: number;
  spawnType: "initial" | "death-respawn" | "teleport-arrival";
  capacity: number;
  properties: Record<string, unknown>;
}

interface PlacedTeleport {
  id: string;
  name: string;
  position: WorldPosition;
  connections: string[];
  requirements: Record<string, unknown>;
  cost: number;
  properties: Record<string, unknown>;
}

interface PlacedMobSpawn {
  id: string;
  name: string;
  mobId: string;
  position: WorldPosition;
  spawnRadius: number;
  maxCount: number;
  respawnTicks: number;
  properties: Record<string, unknown>;
}

interface PlacedResource {
  id: string;
  name: string;
  resourceId: string;
  resourceType: "mining" | "woodcutting" | "fishing";
  position: WorldPosition;
  rotation: number;
  modelVariant: number;
  properties: Record<string, unknown>;
}

interface PlacedStation {
  id: string;
  name: string;
  stationType: string;
  position: WorldPosition;
  rotation: number;
  properties: Record<string, unknown>;
}

interface PlacedPOI {
  id: string;
  name: string;
  category: string;
  position: WorldPosition;
  importance: number;
  radius: number;
  connectedRoads: string[];
  properties: Record<string, unknown>;
}

interface PlacedWaterBody {
  id: string;
  name: string;
  bodyType: "river" | "lake" | "pond";
  waypoints?: Array<{ x: number; z: number; halfWidth: number; depth: number }>;
  polygon?: Array<{ x: number; z: number }>;
  surfaceY: number;
  bermWidth: number;
  valleyMultiplier: number;
  properties: Record<string, unknown>;
}

interface PlacedNPC {
  id: string;
  name: string;
  npcTypeId: string;
  position: WorldPosition;
  rotation: number;
  parentContext: { type: string; townId?: string };
  properties: Record<string, unknown>;
}

interface ExtendedWorldLayers {
  spawnPoints: PlacedSpawnPoint[];
  teleports: PlacedTeleport[];
  mobSpawns: PlacedMobSpawn[];
  resources: PlacedResource[];
  stations: PlacedStation[];
  npcs: PlacedNPC[];
  pois: PlacedPOI[];
  waterBodies: PlacedWaterBody[];
}

// ---------------------------------------------------------------------------
// Types – Brush overlays
// ---------------------------------------------------------------------------

type BrushType = "terrain" | "biome" | "vegetation" | "collision";

interface TerrainSculptStroke {
  center: { x: number; z: number };
  radius: number;
  strength: number;
  mode: string;
  points: Array<{ x: number; z: number; intensity: number }>;
}

interface BiomePaintStroke {
  center: { x: number; z: number };
  radius: number;
  biomeId: string;
  points: Array<{ tileX: number; tileZ: number }>;
}

interface VegetationPaintStroke {
  center: { x: number; z: number };
  radius: number;
  species: string;
  mode: string;
  points: Array<{ x: number; z: number; density: number }>;
}

interface TileCollision {
  tileX: number;
  tileZ: number;
  blocked: boolean;
}

interface BrushOverlays {
  terrainSculpts: TerrainSculptStroke[];
  biomePaints: BiomePaintStroke[];
  vegetationPaints: VegetationPaintStroke[];
  tileCollisions: TileCollision[];
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface SceneStoreState {
  extendedLayers: ExtendedWorldLayers;
  brushOverlays: BrushOverlays;

  // -- Extended layers: spawn points --
  addSpawnPoint: (sp: PlacedSpawnPoint) => void;
  updateSpawnPoint: (id: string, updates: Partial<PlacedSpawnPoint>) => void;
  removeSpawnPoint: (id: string) => void;

  // -- Extended layers: teleports --
  addTeleport: (tp: PlacedTeleport) => void;
  updateTeleport: (id: string, updates: Partial<PlacedTeleport>) => void;
  removeTeleport: (id: string) => void;

  // -- Extended layers: mob spawns --
  addMobSpawn: (ms: PlacedMobSpawn) => void;
  updateMobSpawn: (id: string, updates: Partial<PlacedMobSpawn>) => void;
  removeMobSpawn: (id: string) => void;

  // -- Extended layers: resources --
  addResource: (res: PlacedResource) => void;
  updateResource: (id: string, updates: Partial<PlacedResource>) => void;
  removeResource: (id: string) => void;

  // -- Extended layers: stations --
  addStation: (st: PlacedStation) => void;
  updateStation: (id: string, updates: Partial<PlacedStation>) => void;
  removeStation: (id: string) => void;

  // -- Extended layers: NPCs --
  addNpc: (npc: PlacedNPC) => void;
  updateNpc: (id: string, updates: Partial<PlacedNPC>) => void;
  removeNpc: (id: string) => void;

  // -- Extended layers: POIs --
  addPoi: (poi: PlacedPOI) => void;
  updatePoi: (id: string, updates: Partial<PlacedPOI>) => void;
  removePoi: (id: string) => void;

  // -- Extended layers: water bodies --
  addWaterBody: (wb: PlacedWaterBody) => void;
  updateWaterBody: (id: string, updates: Partial<PlacedWaterBody>) => void;
  removeWaterBody: (id: string) => void;

  // -- Brush overlays --
  addTerrainSculpt: (stroke: TerrainSculptStroke) => void;
  addBiomePaint: (stroke: BiomePaintStroke) => void;
  addVegetationPaint: (stroke: VegetationPaintStroke) => void;
  setTileCollision: (tiles: TileCollision[]) => void;
  undoLastBrushStroke: (brushType: BrushType) => void;
  clearBrushOverlays: (brushType?: BrushType) => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const EMPTY_EXTENDED_LAYERS: ExtendedWorldLayers = {
  spawnPoints: [],
  teleports: [],
  mobSpawns: [],
  resources: [],
  stations: [],
  npcs: [],
  pois: [],
  waterBodies: [],
};

const EMPTY_BRUSH_OVERLAYS: BrushOverlays = {
  terrainSculpts: [],
  biomePaints: [],
  vegetationPaints: [],
  tileCollisions: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generic add-to-array helper for a given layer key. */
function addToLayer<K extends keyof ExtendedWorldLayers>(
  key: K,
  item: ExtendedWorldLayers[K][number],
) {
  return (state: SceneStoreState) => ({
    extendedLayers: {
      ...state.extendedLayers,
      [key]: [...state.extendedLayers[key], item],
    },
  });
}

/** Generic update-by-id helper for a given layer key. */
function updateInLayer<K extends keyof ExtendedWorldLayers>(
  key: K,
  id: string,
  updates: Partial<ExtendedWorldLayers[K][number]>,
) {
  return (state: SceneStoreState) => ({
    extendedLayers: {
      ...state.extendedLayers,
      [key]: (state.extendedLayers[key] as Array<{ id: string }>).map((item) =>
        item.id === id ? { ...item, ...updates } : item,
      ),
    },
  });
}

/** Generic remove-by-id helper for a given layer key. */
function removeFromLayer<K extends keyof ExtendedWorldLayers>(
  key: K,
  id: string,
) {
  return (state: SceneStoreState) => ({
    extendedLayers: {
      ...state.extendedLayers,
      [key]: (state.extendedLayers[key] as Array<{ id: string }>).filter(
        (item) => item.id !== id,
      ),
    },
  });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSceneStore = create<SceneStoreState>()((set) => ({
  extendedLayers: { ...EMPTY_EXTENDED_LAYERS },
  brushOverlays: { ...EMPTY_BRUSH_OVERLAYS },

  // -- Spawn points --------------------------------------------------------
  addSpawnPoint: (sp) => set(addToLayer("spawnPoints", sp)),
  updateSpawnPoint: (id, updates) =>
    set(updateInLayer("spawnPoints", id, updates)),
  removeSpawnPoint: (id) => set(removeFromLayer("spawnPoints", id)),

  // -- Teleports -----------------------------------------------------------
  addTeleport: (tp) => set(addToLayer("teleports", tp)),
  updateTeleport: (id, updates) => set(updateInLayer("teleports", id, updates)),
  removeTeleport: (id) => set(removeFromLayer("teleports", id)),

  // -- Mob spawns ----------------------------------------------------------
  addMobSpawn: (ms) => set(addToLayer("mobSpawns", ms)),
  updateMobSpawn: (id, updates) => set(updateInLayer("mobSpawns", id, updates)),
  removeMobSpawn: (id) => set(removeFromLayer("mobSpawns", id)),

  // -- Resources -----------------------------------------------------------
  addResource: (res) => set(addToLayer("resources", res)),
  updateResource: (id, updates) => set(updateInLayer("resources", id, updates)),
  removeResource: (id) => set(removeFromLayer("resources", id)),

  // -- Stations ------------------------------------------------------------
  addStation: (st) => set(addToLayer("stations", st)),
  updateStation: (id, updates) => set(updateInLayer("stations", id, updates)),
  removeStation: (id) => set(removeFromLayer("stations", id)),

  // -- NPCs ----------------------------------------------------------------
  addNpc: (npc) => set(addToLayer("npcs", npc)),
  updateNpc: (id, updates) => set(updateInLayer("npcs", id, updates)),
  removeNpc: (id) => set(removeFromLayer("npcs", id)),

  // -- POIs ----------------------------------------------------------------
  addPoi: (poi) => set(addToLayer("pois", poi)),
  updatePoi: (id, updates) => set(updateInLayer("pois", id, updates)),
  removePoi: (id) => set(removeFromLayer("pois", id)),

  // -- Water bodies --------------------------------------------------------
  addWaterBody: (wb) => set(addToLayer("waterBodies", wb)),
  updateWaterBody: (id, updates) =>
    set(updateInLayer("waterBodies", id, updates)),
  removeWaterBody: (id) => set(removeFromLayer("waterBodies", id)),

  // -- Brush overlays: append strokes --------------------------------------
  addTerrainSculpt: (stroke) =>
    set((state) => ({
      brushOverlays: {
        ...state.brushOverlays,
        terrainSculpts: [...state.brushOverlays.terrainSculpts, stroke],
      },
    })),

  addBiomePaint: (stroke) =>
    set((state) => ({
      brushOverlays: {
        ...state.brushOverlays,
        biomePaints: [...state.brushOverlays.biomePaints, stroke],
      },
    })),

  addVegetationPaint: (stroke) =>
    set((state) => ({
      brushOverlays: {
        ...state.brushOverlays,
        vegetationPaints: [...state.brushOverlays.vegetationPaints, stroke],
      },
    })),

  // -- Brush overlays: tile collisions (upsert by tileX/tileZ) ------------
  setTileCollision: (tiles) =>
    set((state) => {
      const existing = [...state.brushOverlays.tileCollisions];
      for (const tile of tiles) {
        const idx = existing.findIndex(
          (t) => t.tileX === tile.tileX && t.tileZ === tile.tileZ,
        );
        if (idx >= 0) {
          existing[idx] = tile;
        } else {
          existing.push(tile);
        }
      }
      return {
        brushOverlays: {
          ...state.brushOverlays,
          tileCollisions: existing,
        },
      };
    }),

  // -- Brush overlays: undo last stroke of a given type --------------------
  undoLastBrushStroke: (brushType) =>
    set((state) => {
      const overlays = { ...state.brushOverlays };
      switch (brushType) {
        case "terrain":
          overlays.terrainSculpts = overlays.terrainSculpts.slice(0, -1);
          break;
        case "biome":
          overlays.biomePaints = overlays.biomePaints.slice(0, -1);
          break;
        case "vegetation":
          overlays.vegetationPaints = overlays.vegetationPaints.slice(0, -1);
          break;
        case "collision":
          overlays.tileCollisions = overlays.tileCollisions.slice(0, -1);
          break;
      }
      return { brushOverlays: overlays };
    }),

  // -- Brush overlays: clear -----------------------------------------------
  clearBrushOverlays: (brushType?) =>
    set((state) => {
      if (!brushType) {
        return { brushOverlays: { ...EMPTY_BRUSH_OVERLAYS } };
      }
      const overlays = { ...state.brushOverlays };
      switch (brushType) {
        case "terrain":
          overlays.terrainSculpts = [];
          break;
        case "biome":
          overlays.biomePaints = [];
          break;
        case "vegetation":
          overlays.vegetationPaints = [];
          break;
        case "collision":
          overlays.tileCollisions = [];
          break;
      }
      return { brushOverlays: overlays };
    }),
}));
