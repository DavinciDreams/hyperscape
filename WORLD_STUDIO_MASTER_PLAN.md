# World Studio Master Plan: Three.js/WebGPU UE5 Game Engine

**Goal:** Asset Forge = the full game building pipeline (like Unreal Editor). Hyperscape = the live production game (like a shipped UE5 title). World Studio is the world editor module within Asset Forge, but the entire Asset Forge platform is the unified authoring environment.

**Current state:** ~70% of the pieces exist. The critical gaps are broken export pipelines, disconnected tools, and no gameplay preview. This plan fixes every gap to reach 10/10.

---

## Architecture Vision

```
┌─────────────────────────────────────────────────────────────┐
│                    ASSET FORGE (Editor)                      │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ World    │ │ Asset    │ │ Content  │ │ Audio    │      │
│  │ Studio   │ │ Pipeline │ │ Gen (AI) │ │ Studio   │      │
│  │          │ │          │ │          │ │          │      │
│  │ Terrain  │ │ Models   │ │ Quests   │ │ Music    │      │
│  │ Entities │ │ Textures │ │ Dialogue │ │ SFX      │      │
│  │ Biomes   │ │ Armor    │ │ NPC AI   │ │ Ambient  │      │
│  │ Towns    │ │ Weapons  │ │ Lore     │ │ Voice    │      │
│  │ Roads    │ │ Sprites  │ │          │ │          │      │
│  │ Zones    │ │ LOD/VAT  │ │          │ │          │      │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘      │
│       │            │            │            │              │
│       └────────────┴────────────┴────────────┘              │
│                         │                                    │
│              ┌──────────▼──────────┐                        │
│              │   Manifest Compiler  │                        │
│              │   (world.json +     │                        │
│              │    38 manifests)     │                        │
│              └──────────┬──────────┘                        │
│                         │                                    │
│              ┌──────────▼──────────┐                        │
│              │  Deploy Pipeline     │                        │
│              │  staging → prod      │                        │
│              └──────────┬──────────┘                        │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   HYPERSCAPE (Live Game)                     │
│                                                             │
│  Game Server (Fastify + ECS + PhysX + WebSockets)           │
│  Game Client (Three.js WebGPU + React + ECS)                │
│  Loads manifests → runs world → serves players              │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Fix Broken Export Pipelines
**Priority: CRITICAL — existing tools produce work that's silently discarded on deploy**
**Estimated scope: ~400 lines changed across 4 files**

### 1.1 Export Terrain Sculpt Strokes

The brush tool lets designers raise/lower/flatten/smooth terrain. Strokes are stored in `state.brushOverlays.terrainSculpts` and visually applied via `applySculptStrokesToGeometry()`. They persist across auto-saves. **But they're thrown away on deploy** — the manifest compiler ignores `_brushOverlays`.

**Approach: Stroke Replay** (simplest, highest fidelity — the application code already exists)

- **Manifest compiler** (`useManifestCompiler.ts`): Stop ignoring `_brushOverlays`. Include `terrainSculpts` array in a new `brush-overlays.json` manifest file.
- **Deploy route** (`deploy-routes.ts`): Write `brush-overlays.json` alongside other manifests to staging/production.
- **Game TerrainSystem** (`TerrainSystem.ts`): Load `brush-overlays.json` via DataManager. Pass strokes to tile generation. Call existing `applySculptStrokesToGeometry()` after generating each tile.
- **Shared code**: The stroke application function (`brushApplication.ts`) already lives in the shared-accessible WorldBuilder utils. Extract to a shared location or duplicate the ~60-line function into `@hyperscape/shared`.

**Files:**
- `packages/asset-forge/src/components/WorldStudio/hooks/useManifestCompiler.ts` — use `brushOverlays` param
- `packages/shared/src/systems/shared/world/TerrainSystem.ts` — load + apply strokes
- `packages/shared/src/data/DataManager.ts` — load brush-overlays.json

### 1.2 Export Biome Paint Strokes

Same broken pattern — biome brush paints modify vertex colors visually but `compileBiomes()` only reads `biomeOverrides`, not brush strokes.

**Approach: Stroke Replay** (same as terrain sculpts)

- Include `biomePaints` array in the same `brush-overlays.json` manifest.
- Game side: apply biome paint strokes to vertex colors during tile generation using existing `applyBiomePaintToTiles()` logic.
- For gameplay effect (biome-based spawns, difficulty): convert painted strokes to a `biomePaintMap` lookup that `BiomeSystem.getDominantBiome()` checks as override.

### 1.3 Game-Side Region Loading

Zone painting exports correctly to `regions.json` but the game server never loads or uses it. Regions should drive:
- Music/ambient zone selection
- Difficulty scaling
- Spawn rule overrides
- Biome behavior within painted zones

**Files:**
- `packages/shared/src/data/DataManager.ts` — load regions.json
- `packages/shared/src/systems/shared/world/TerrainSystem.ts` — apply region biome overrides
- `packages/server/src/startup/world.ts` — load region data on startup

### 1.4 Fix Manifest Dirty Flag

14 `MANIFEST_UPDATE_*` reducer cases don't set `hasUnsavedChanges: true`. Designers can edit items, quests, NPCs, stores, prayers, recipes without triggering save.

**File:** `packages/asset-forge/src/components/WorldStudio/worldStudioReducer.ts` — add `hasUnsavedChanges: true` to all 14 cases.

---

## Phase 2: Enable Stubbed Tools
**Priority: HIGH — UI already exists, just needs backend wiring**
**Estimated scope: ~800 lines new code**

### 2.1 Vegetation Brush

BrushSettingsPanel has full UI for vegetation painting (add/remove mode, species filter, radius/strength). Message says "Plants are currently disabled in the generator."

**Implementation:**
- In `useBrushInteraction.ts`: implement the `onVegetationPaint` callback to generate tree instances at painted positions using Poisson disk sampling within the brush radius, filtered by the species selection.
- Store painted vegetation in `brushOverlays.vegetationPaints` (type already exists).
- In `initVegetation`/`refreshVegetation`: merge painted trees with manifest/procgen trees.
- Export painted trees alongside procgen trees in world.json.

### 2.2 Path/Road Creation Tool

PathToolPanel says "Path editing tools are in development." It shows generated roads as read-only. Need:

- **Spline drawing mode**: Click to place waypoints in viewport. Each click adds a control point. Double-click to finish.
- **Waypoint editing**: Select waypoint → drag to move. Delete key removes waypoint.
- **Width control**: Per-road width slider in properties panel.
- **Export**: Custom paths exported in `roads.json` alongside procgen roads. Flag `isCustom: true` to distinguish.
- **Game side**: RoadNetworkSystem already loads roads.json — custom roads render identically.

**Files:**
- `packages/asset-forge/src/components/WorldStudio/panels/PathToolPanel.tsx` — full rewrite
- `packages/asset-forge/src/components/WorldStudio/hooks/usePathInteraction.ts` — new hook for viewport spline drawing
- Reducer: add path CRUD actions (ADD_CUSTOM_ROAD, UPDATE_ROAD_WAYPOINT, REMOVE_CUSTOM_ROAD)

### 2.3 Building Editing

Buildings generated in towns currently have no property editor. Need:

- **Building properties panel**: type, dimensions, rotation editable in PropertiesPanel.
- **Building transform**: select building → gizmo appears → drag to reposition within town.
- **Add/remove buildings**: button in town properties to add new building from template or remove existing.
- **Export**: buildings.json already exports from foundation data — just need to wire property edits back to foundation.buildings.

### 2.4 Road Property Editing

Roads in PropertiesPanel are read-only. Need:

- Width slider (updates road width, re-renders ribbon).
- Waypoint list with drag-to-reorder and delete.
- "Straighten" / "Smooth" buttons for quick path cleanup.

---

## Phase 3: Terrain Material Layers
**Priority: HIGH — fundamental visual quality gap**
**Estimated scope: ~600 lines new code**

UE5's landscape system has material layers (grass, dirt, rock, sand, snow) painted via brush. World Studio terrain color is purely biome-derived vertex colors.

### 3.1 Material Layer System

- Define 6-8 base terrain materials: grass, dirt, rock, sand, snow, gravel, mud, volcanic.
- Each material has a diffuse color, normal map, roughness, and tiling parameters.
- Store material weights per-vertex using a splatmap approach (RGBA texture per tile, 4 layers per texture, 2 textures = 8 layers).
- TSL shader in terrain material: sample splatmap, blend material textures by weight.

### 3.2 Material Paint Brush

- New brush type: "material" (alongside terrain, biome, vegetation, collision).
- Paint material layer weights onto terrain vertices.
- Store as `brushOverlays.materialPaints` strokes.
- Export splatmap data in manifests.
- Game TerrainSystem loads splatmaps and applies to terrain shader.

### 3.3 Auto-Material from Biome

- Default material assignment based on biome + slope + altitude.
- Forest biome → grass base, rock on steep slopes.
- Desert biome → sand base, gravel on slopes.
- Mountain biome → rock base, snow at altitude.
- Material brush overrides auto-assignment.

---

## Phase 4: Play-In-Editor (PIE)
**Priority: HIGH — the single biggest UE5 gap**
**Estimated scope: ~1200 lines new code, ~2-3 days**

### 4.1 Create `createPlayTestWorld()` Factory

Based on existing `createEditorWorld()` and `createClientWorld()`:

```
createPlayTestWorld(options):
  - All gameplay systems (combat, physics, entities, AI, inventory, skills)
  - NO networking (local-only, no server connection)
  - NO graphics system (World Studio viewport handles rendering)
  - PhysX initialization (already has async loading + timeout fallback)
  - Audio: muted/optional
  - Entity spawning from manifest data (NPCs, mobs, resources)
```

**File:** `packages/shared/src/runtime/createPlayTestWorld.ts` (new)

### 4.2 Entity-to-Scene Renderer

Sync game world ECS entities to World Studio's Three.js scene:

- Subscribe to entity spawn/despawn events from the ECS world.
- On spawn: create Three.js mesh (from game's entity rendering code), add to TileBasedTerrain's scene.
- On despawn: remove mesh, queue GPU disposal.
- Every frame: update mesh transforms from ECS entity positions.
- Use existing entity marker visuals (capsules for NPCs, cylinders for mobs) or load full GLB models.

### 4.3 Player Controller

- "Play" button in toolbar enters PIE mode.
- Camera switches to first/third person following a spawned player entity.
- WASD movement sends commands to ECS player entity (not camera).
- Click-to-move for pathfinding.
- Action bar for combat abilities, inventory access.
- ESC exits PIE, returns to editor camera.

### 4.4 Local Server Simulation

- Stub `ClientNetwork` with a local event bus (no WebSocket).
- Game loop: `world.tick(deltaTime)` called from `requestAnimationFrame`.
- NPC AI runs locally — mobs patrol, aggro on player proximity.
- Combat system runs locally — damage, loot drops, XP.
- Inventory and skills work locally (in-memory, no persistence).

---

## Phase 5: Deployment Pipeline Hardening
**Priority: MEDIUM — existing pipeline works but has gaps**
**Estimated scope: ~300 lines changed**

### 5.1 Persist Deployment History to Database

`deploy-routes.ts` stores records in memory (lost on restart). Write to `worldDeployments` table.

### 5.2 Connect Rollback UI to API

DeploymentPanel's rollback button calls `actions.deployRollback()` (React state only). Wire it to `POST /api/deploy/rollback/:id`.

### 5.3 Server-Side Promotion Approval

Add `POST /api/deploy/approve/:id` endpoint. Store `approvedBy` in deployment record. Enforce approval check before production promotion.

### 5.4 Populate manifestSnapshot

Call `createSnapshot()` on the world project after each successful staging push. Enables restoring project to previously-deployed state.

### 5.5 Deployment Diffing Enhancement

Currently shows file-level added/modified/removed counts. Add entity-level diffing: "3 NPCs added, 1 mob spawn moved, 47 trees removed."

---

## Phase 6: Visual Parity (WYSIWYG)
**Priority: MEDIUM — designers need to see what players see**
**Estimated scope: ~200 lines changed**

### 6.1 Shadow Preview Toggle

Add toggle in viewport overlay bar: "Shadows: On/Off". When on, enable `renderer.shadowMap` with reduced quality (1024×1024 map, basic PCF) for acceptable editor FPS.

### 6.2 Post-Processing Preview

Add toggle: "Game Post-FX: On/Off". When on, enable bloom + tone mapping via existing TSL RenderPipeline. Use lower-quality settings than game for editor performance.

### 6.3 Fog & Atmosphere Parity

Editor fog uses simplified linear fog. Game uses exponential fog with scatter. Match the game's fog shader in editor, controllable via time-of-day slider.

---

## Phase 7: Foliage & Ground Cover
**Priority: MEDIUM — world feels empty without grass/flowers/rocks**
**Estimated scope: ~1000 lines new code**

### 7.1 Foliage System

- Grass, flowers, small rocks, ground cover as GPU-instanced billboards or low-poly meshes.
- Density controlled per-biome (forest = dense grass, desert = sparse).
- Distance-based LOD: billboard at distance, hidden beyond 100m.
- Uses existing InstancedMesh + deferred GPU staging infrastructure.

### 7.2 Foliage Paint Brush

- New brush type: "foliage" (separate from vegetation/trees).
- Paint density/species masks onto terrain.
- Store as foliage overlay strokes.
- Export in manifests for game rendering.

### 7.3 Procedural Foliage from Biome

- Auto-populate foliage based on biome type + terrain slope.
- Grass on flat terrain, moss on north-facing slopes, etc.
- Brush overrides auto-population.

---

## Phase 8: Water & Liquid System
**Priority: MEDIUM**
**Estimated scope: ~500 lines new code**

### 8.1 Water Volume Editor

- Upgrade water body placement from simple EntityPalette drop to polygon editor.
- Click-to-place boundary points, drag to adjust.
- Water surface height slider.
- Flow direction for rivers (arrow visualization).

### 8.2 Water Rendering Parity

- Match game's water shader in editor viewport.
- Reflection, refraction, depth-based color.
- Shore foam at terrain intersection.

---

## Phase 9: Asset Pipeline Integration
**Priority: LOWER — currently separate pages, should be unified**
**Estimated scope: ~800 lines new/refactored code**

### 9.1 Content Browser Asset Import

Asset Forge already has 12 procgen pages (trees, rocks, plants, buildings, etc.) and AI generation (Meshy, TripoSR). These produce GLB models stored in `packages/server/world/assets/`.

- Add "Import Asset" button in World Studio's Content Browser.
- Browse generated assets from Asset Forge's asset database.
- Drag asset from Content Browser → viewport to place as custom prop.
- Custom props stored in `extendedLayers.customPlacements` (already exists).

### 9.2 Prefab System

- Select multiple entities → right-click → "Create Prefab".
- Prefab saved as named template with relative positions/rotations.
- Prefab appears in Content Browser under "Prefabs" category.
- Drag prefab to viewport → places all entities as a group.
- Prefab instances link back to template — update template, all instances update.

### 9.3 Audio Zone Editor Integration

Asset Forge has ElevenLabs music/SFX/voice generation. World Studio has audio layer types defined (MusicZone, AmbientZone, SFXTrigger) but no UI.

- Add audio zone placement tools to EntityPalette.
- Music zones: polygon boundary with track selection from generated music.
- Ambient zones: polygon with ambient sound selection.
- SFX triggers: point + radius with event trigger.
- Preview: play audio in editor when zone is selected.

---

## Phase 10: Collaboration & Polish
**Priority: LOWER — single-user works, multi-user is aspirational**
**Estimated scope: Large**

### 10.1 Multi-Entity Property Editing

Select multiple entities → PropertiesPanel shows shared properties. Edit shared field → applies to all selected.

### 10.2 Enhanced Undo/Redo

- Persist undo stack to project (survives page refresh).
- Increase depth from 50 to 200.
- Group related operations (e.g., "Place Town" groups all building placements).

### 10.3 Real-Time Collaboration (Future)

- WebSocket-based presence (see other users' cursors).
- Operational transform for concurrent edits.
- Per-region locking (only one user edits a zone at a time).

---

## Verification Checklist

After each phase, verify:

1. **Type check**: `npx tsc --noEmit --project packages/asset-forge/tsconfig.json` — no new errors
2. **Round-trip test**: Edit in World Studio → deploy to staging → load in game → verify visual match
3. **Export test**: Every tool's output appears in compiled manifests
4. **Load test**: Game server starts with deployed manifests without errors
5. **Visual test**: Open World Studio, open game client side-by-side, compare rendering

---

## Phase Priority Summary

| Phase | Name | Impact | Effort | Priority |
|-------|------|--------|--------|----------|
| **1** | Fix Broken Export Pipelines | Critical | Small | **DO FIRST** |
| **2** | Enable Stubbed Tools | High | Medium | **DO SECOND** |
| **3** | Terrain Material Layers | High | Medium | High |
| **4** | Play-In-Editor | Transformative | Large | High |
| **5** | Deploy Pipeline Hardening | Medium | Small | Medium |
| **6** | Visual Parity | Medium | Small | Medium |
| **7** | Foliage & Ground Cover | Medium | Large | Medium |
| **8** | Water & Liquid System | Medium | Medium | Medium |
| **9** | Asset Pipeline Integration | High | Large | Medium |
| **10** | Collaboration & Polish | Lower | Very Large | Lower |

---

## What This Achieves

After all phases, Asset Forge becomes:

- **World authoring**: Terrain sculpting, biome painting, vegetation painting, foliage, material layers — all export to game. Like UE5 Landscape + Foliage tools.
- **Entity authoring**: Place any entity type with gizmo transforms, edit all properties, create prefabs. Like UE5 Actor placement.
- **Procgen suite**: Full procedural generation for terrain, towns, roads, vegetation, zones, entity population — with manual override capability for everything. No UE5 equivalent (this is better).
- **Asset pipeline**: AI model generation, equipment fitting, texture generation, LOD/impostor baking, sprite generation — all feeding into the same Content Browser. Like UE5 Content Pipeline but with AI.
- **Audio**: AI-generated music, SFX, voice — placed as spatial audio zones in the world. Like UE5 Sound System but with generative AI.
- **Content**: AI-generated quests, dialogue, NPC personalities — authored and previewed in-editor. No UE5 equivalent.
- **Play-In-Editor**: Run game systems (physics, AI, combat) inside the viewport. Walk around, fight mobs, test gameplay. Like UE5 PIE.
- **Deploy pipeline**: One-click staging → preview → production deployment with diffs, approval, rollback. Like UE5 Cook + Package but for a live service game.
- **Visual parity**: Shadows, post-processing, fog — editor matches game. WYSIWYG.

The game loop: **Author in Asset Forge → Test with PIE → Deploy to Hyperscape → Players play.**

That's a 10/10 Three.js/WebGPU game engine.
