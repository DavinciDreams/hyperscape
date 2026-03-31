# World Builder Master Plan: Production World Authoring Pipeline

> **Status**: Planning Phase
> **Last Updated**: 2026-03-28
> **Goal**: Transform the Asset Forge World Builder into the single source of truth for the Hyperscape game world — every NPC, resource, station, mob spawn, biome, road, building, vegetation layer, audio region, quest, and procgen parameter authorable from this tool, with a staging → production deployment pipeline that prevents breaking the live game. Designed from day one for multi-tenant use — teams building their own games on Hyperscape with scoped permissions.

---

## Table of Contents

1. [Current State Assessment](#part-1-current-state-assessment)
2. [Architecture Design](#part-2-architecture-design)
3. [UI/UX Design](#part-3-uiux-design)
4. [Implementation Phases](#part-4-implementation-phases)
5. [Key Technical Decisions](#part-5-key-technical-decisions)
6. [Data Flow Diagrams](#part-6-data-flow-diagrams)
7. [Asset Pipeline Integration](#part-7-asset-pipeline-integration)
8. [AI Content Generation Pipeline](#part-8-ai-content-generation-pipeline)
9. [Accounts, Teams & Permissions](#part-9-accounts-teams--permissions)
10. [Risk Mitigation](#part-10-risk-mitigation)
11. [File Inventory](#part-11-file-inventory)
12. [Review Addendum — Gap Analysis & Filled Gaps](#part-12-review-addendum--gap-analysis--filled-gaps)

---

## Part 1: Current State Assessment

### What Already Exists (Significant Foundation)

**World Builder UI (WorldBuilderPage 6,507 lines + WorldTab 1,058 lines + CreationPanel 1,020 lines)**
- Two-phase workflow: Creation (procgen terrain) → Editing (layer-based content)
- 60 reducer actions in WorldBuilderContext (1,820 lines), undo/redo, hierarchy panel (347 lines), properties panel (1,566 lines)
- Tile-based terrain streaming via TileBasedTerrain component (3,109 lines) — 100m tiles, camera-based loading
- Town generation, road network (MST + A* pathfinding), biome distribution
- Layer system: NPCs, Quests, Bosses, Events, Lore, Difficulty Zones, Custom Placements
- Biome/town overrides (non-destructive — foundation locked after creation)
- Selection modes: auto, biome, tile, town, building, NPC
- Properties panel supports editing: biome type/difficulty/materials/heightmaps/mob spawns, town names/buildings, NPC position/rotation/type/services, quest stages, boss arenas, and more

**World Editor (WorldEditorPage) — 594 lines (SEPARATE tool, not integrated with WorldBuilder)**
- Uses EditorWorld — runs real game systems (terrain, vegetation, grass, towns, roads, buildings, landmarks, water, bridges, docks)
- Editor camera (orbit/pan/fly with damping, 403 lines), selection system (click/shift-multi/marquee, 526 lines), transform gizmo (translate/rotate/scale with snap, 412 lines)
- WYSIWYG — what you see matches what players see in-game
- **Key limitation**: No properties panel — only system toggles + viewport. Does NOT share state with WorldBuilderPage.

**Persistence Layer — 84KB / 3,045 lines (worldPersistence.ts)**
- IndexedDB browser storage, localStorage auto-save
- JSON import/export, game manifest export
- Validation with cross-reference checks

**Asset Forge API Server — Elysia on port 3401 (18 route modules, 21 services)**
- `/api/manifests` — Full CRUD + backup/restore for manifests (ManifestService with timestamped backups, max 10 per file)
- `/api/placements` — Placement group management with spatial queries
- `/api/procgen` — Preset management, batch seed generation
- `/api/lod`, `/api/vat` — LOD/VAT baking pipelines
- `/api/voice/*` — ElevenLabs TTS for NPC dialogue (generate, batch, library)
- `/api/sfx/*` — ElevenLabs sound effects generation (generate, batch, estimate)
- `/api/music/*` — ElevenLabs AI music composition (generate works; `createCompositionPlan` is placeholder/fake)
- `/api/content-generation` — **Already built**: AI NPC/quest/dialogue/lore generation (ContentGenerationService)
- `/api/generation` — MeshyAI 3D model generation pipeline
- `/api/retexture` — MeshyAI retexturing
- `/api/ai-vision` — GPT-4 Vision weapon detection
- `/api/batch-sprites` — Batch 2D sprite generation
- Rate limiting: 100 req/min per IP, CORS configured per environment

**AI Generation Services (Already Built)**
- `ElevenLabsVoiceService` — TTS for NPC dialogue, batch generation, voice library. Speech-to-speech and voice design are NOT yet implemented (throw errors).
- `ElevenLabsSoundEffectsService` — Text-to-SFX, batch generation (0.5-22s), cost estimation
- `ElevenLabsMusicService` — AI music generation works (up to 5 min). **WARNING**: `createCompositionPlan()` is a placeholder returning hardcoded fake data — does NOT call the real API.
- `ContentGenerationService` — **Already built**: AI-powered NPC, quest, dialogue, and lore generation
- MeshyAI (`AICreationService`) — 3D model generation (image-to-3D, retexturing, rigging, PBR materials)
- `AISDKService` — OpenAI via Vercel AI SDK (or Cloudflare AI Gateway). Note: references "gpt-5" models which are placeholder model IDs.

**Game Audio Systems (Already Built)**
- `ClientAudio` — 3D spatial audio (Web Audio API), groups: music/sfx/voice
- `MusicSystem` — Background music with crossfading, combat transitions, 18 tracks
- `ClientLiveKit` — Real-time voice chat with spatial positioning
- `music.json` manifest — Intro/normal/combat categories, `asset://` URIs
- Audio settings — master/music/sfx/voice/ambient volumes, mute controls

**NPC Dialogue System (Already Built)**
- `DialogueSystem` — Branching dialogue trees from `npcs.json`
- Quest-based dialogue overrides (different dialogue per quest status)
- Effects system: openBank, openShop, startQuest, completeQuest
- Server-side validation (prevents client tampering)
- Pre-generated voice files in `world/assets/audio/voice/`

**ElizaOS AI Agent Framework (Already Built)**
- `AgentManager` — Manages embedded AI agent runtimes
- Multi-model support: OpenAI, Anthropic, Groq, OpenRouter, Ollama
- 20+ context providers, 30+ agent actions
- AI bots for duel arena, exploration, social interaction

**Authentication (Already Built)**
- Privy authentication — wallets, email, social logins, Farcaster (server-side token verification)
- JWT sessions — 7-day tokens with configurable secret
- Role system — `user`, `mod`, `admin` only (via `RoleManager`). Note: `builder` role is referenced in some code but NOT defined in RoleManager — only user/mod/admin exist.
- Ban system — temporary + permanent, soft-delete history, compound index for fast lookups
- Users + characters database tables (14+ skill columns each)
- Activity logging/auditing
- First-message auth pattern (token NOT in URL for security)
- Dev admin bypass: `GRANT_DEV_ADMIN=true` + development mode only

**Asset Forge Database (Separate from Game Server)**
- Optional PostgreSQL via Drizzle ORM
- Currently only has `assets` table (asset generation tracking with status/visibility/versioning)
- NOT shared with game server database — completely separate schema
- Team/project tables do NOT exist yet — must be created from scratch

**Game World Definition — All data-driven (38 manifest files, ~550+ entries)**

**World & Biome (4 files):**
- `world-areas.json` (13KB) — Region definitions with NPC/resource/mob/station placements. Structure: `starterTowns.{area}.npcs[]`, `.resources[]`
- `biomes.json` (20KB) — 9 biome definitions (Plains, Mountain, Forest, Desert, Swamp, Ocean, Cave, Volcano, Snow) with **embedded vegetation layers** (density, spacing, clustering, noise params per biome)
- `vegetation.json` — **Nearly empty** (403 bytes, 1 mushroom entry). Real vegetation data lives in `biomes.json` `vegetation.layers[]`
- `buildings.json` — Empty placeholder (3 bytes)

**NPCs & Dialogue (1 file):**
- `npcs.json` (46KB) — 18 NPC definitions including mobs (goblin, bandit, spider, cow, chicken), quest NPCs, shopkeepers, bank clerks. 11 have functional dialogue trees with quest overrides and effects (openBank, openShop, startQuest, completeQuest)

**Items (8 files, 261+ items):**
- `items/weapons.json` (42KB) — 60 weapons: swords, longswords, daggers, axes, bows, staves across bronze→dragon tiers
- `items/armor.json` (35KB) — 69 armor pieces: helmets, platebodies, platelegs, gauntlets, boots across bronze→dragon tiers
- `items/tools.json` (15KB) — 25 tools: hatchets, pickaxes, fishing rods/nets with weapon stats + gathering properties
- `items/resources.json` (32KB) — 69 resources: ores, logs, bars, hides, bones, gems, herbs
- `items/food.json` (4.9KB) — 12 cooked foods with heal amounts (1-6 HP)
- `items/misc.json` (5.7KB) — 14 misc items: thread, needles, chisel, leather, hides
- `items/runes.json` (2.6KB) — 6 rune items (stackable)
- `items/ammunition.json` (4KB) — 6 ammo items with ranged strength bonuses

**Combat (4 files):**
- `combat-spells.json` (3.1KB) — 8 spells: Wind/Water/Earth/Fire Strike and Bolt with level reqs, damage, rune costs
- `prayers.json` (3.7KB) — 9 prayers with drain rates, stat multiplier bonuses, and conflicts
- `runes.json` (1.2KB) — 6 rune types + 4 elemental staves (infinite rune supply)
- `ammunition.json` (901B) — 5 arrow type definitions with ranged strength bonuses

**Shops & Stations (2 files):**
- `stores.json` (56KB) — 7 shops with full inventories, prices, buyback rates
- `stations.json` (2KB) — 6 crafting station types: anvil, furnace, range, bank, altar, runecrafting_altar

**Quests (1 file):**
- `quests.json` (10KB) — 7 quests with stages (dialogue/kill/collect), requirements, rewards (items, XP, quest points)

**Skills & Progression (3 files):**
- `skill-unlocks.json` (20KB) — 17 skills with level milestones and unlock descriptions
- `tier-requirements.json` (2KB) — Equipment level gates for melee/tools/ranged/magic tiers
- `tools.json` (2.8KB) — 20 tool unlock entries with priority ordering and bonus tick mechanics

**Gathering (3 files, 33 spots):**
- `gathering/fishing.json` (7KB) — 7 fishing spots with catch tables, tool requirements, cycle ticks
- `gathering/mining.json` (8.4KB) — 9 ore rocks with yield tables, gem drops (0.4%), depletion/respawn
- `gathering/woodcutting.json` (15KB) — 17 tree types with 4 model variants each, hatchet tier gating

**Recipes (8 files, 167 recipes):**
- `recipes/smithing.json` (13KB) — 72 recipes across weapon/armor types by tier
- `recipes/fletching.json` (11KB) — 37 recipes: arrow shafts, bows, arrows
- `recipes/crafting.json` (7KB) — 24 recipes: leather, studded, dragonhide, jewelry, gems
- `recipes/cooking.json` (2.8KB) — 12 recipes with burn mechanics (fire vs range)
- `recipes/smelting.json` (1.8KB) — 6 recipes: bronze→rune bars (50% iron success rate)
- `recipes/runecrafting.json` (1.3KB) — 6 recipes with multi-rune level thresholds
- `recipes/firemaking.json` (877B) — 8 recipes: XP scaling 40-303.8
- `recipes/tanning.json` (366B) — 2 recipes: cowhide, dragonhide with gold cost

**Audio & Rendering (2 files):**
- `music.json` (4.8KB) — 20 music tracks: 2 intro, 8+ normal, 4+ combat, ambient
- `lod-settings.json` (512B) — LOD distance thresholds and dissolve parameters

**Auto-generated (1 file, read-only):**
- `model-bounds.json` (82KB) — 138 model bounding boxes (auto-generated, protected by ManifestService)

**Arena (1 file):**
- `duel-arenas.json` (2.6KB) — 6 PvP arenas + lobby + hospital with spawn/trapdoor positions

**NOTES:**
- `world-config.json` does NOT exist as a file. Procgen parameters are in code (TerrainHeightParams.ts, GameConstants.ts) and WorldBuilderContext's CreationModeState
- `world.json` (entity spawn definitions) loaded separately from manifests by game server
- All loaded by DataManager singleton at startup (ONE-TIME LOAD — no hot-reload capability exists)

### What's Missing

| Gap | Impact |
|-----|--------|
| No server-side world persistence | Can't share worlds between sessions/machines |
| No staging/production concept | Any change is immediate and dangerous |
| No diff/review before deployment | Can't inspect what changed |
| Browser IndexedDB is ephemeral | World data lost on browser clear |
| WorldBuilder and WorldEditor are disconnected | Two separate tools, no shared state |
| No 3D placement of NPCs/stations/mobs | Layer editing is form-based, not spatial |
| No per-tile collision editing | Can't mark tiles walkable/blocked manually |
| No vegetation painting/brushes | Vegetation is all procgen, no hand painting |
| No terrain sculpting | Terrain is fully procedural, no manual height edits |
| No manifest hot-reload to game server | Server restart required for manifest changes |
| No visual representation of mobs/NPCs in viewport | Only markers, no 3D models |
| Procgen params scattered across UI | No unified procgen tuning dashboard |
| No asset pipeline from forge to game | gdd-assets not connected to server/world/assets |
| No staging assets directory | All assets go directly to production |
| AI audio gen not wired into world builder | Voice/SFX/music APIs exist but not integrated into editor |
| No AI dialogue writing | Dialogue trees hand-written, no AI assistance |
| No music region editor | music.json exists but no spatial music zone painting |
| No ambient sound zone editor | No way to define environmental audio regions |
| No team/organization system | No multi-tenant project ownership |
| No permission scoping for staging/prod | Anyone with access can push to prod |
| Asset Forge API has optional auth only | No real permission enforcement |
| No water body editing tools | Water system is AAA quality (Gerstner waves, GGX specular, Beer-Lambert, SSS, foam) but no editing UI |
| No day/night or lighting controls | No time-of-day or lighting zone editing |
| No spawn point management | Player spawn/respawn locations not editable |
| No teleport network editor | teleport-locations.json not editable in world builder |
| DataManager is one-time-load only | `isInitialized` flag prevents re-initialization; adding hot-reload requires changes across shared/server/client packages (est. 19-32 hours) |
| WorldBuilder and WorldEditor share NO state | They are completely separate pages with different architectures — merging is non-trivial |
| `world-config.json` doesn't exist | Procgen params are hardcoded in TerrainHeightParams.ts/GameConstants.ts, not manifest-driven |
| `vegetation.json` is nearly empty | Real vegetation config is embedded in biomes.json, not standalone |
| ContentGenerationService exists but isn't wired into editor | AI NPC/quest/dialogue generation API exists but editor has no UI for it |

---

## Part 2: Architecture Design

### 2.1 Core Principle: Single Unified Editor

Merge WorldBuilderPage and WorldEditorPage into one tool that combines:
- The real game rendering of EditorWorld (WYSIWYG)
- The content authoring UI of WorldBuilder (layers, properties, hierarchy)
- New spatial editing tools (brushes, gizmos, tile painting)
- AI content generation (dialogue, voice, music, SFX) inline in the editor
- Project-scoped authentication and team permissions

### 2.2 World Data Model

```
WorldProject
├── metadata (id, name, version, timestamps, author, teamId, gameId)
├── worldConfig (terrain params, town params, road params, POI params)
├── biomeConfig[] (biome definitions + overrides)
├── vegetationConfig[] (vegetation assets + layer configs)
├── audioConfig
│   ├── musicRegions[] (spatial music zones with track assignments)
│   ├── ambientZones[] (environmental sound regions)
│   ├── sfxTriggers[] (spatial sound effect triggers)
│   └── globalMusic (default music settings)
├── lightingConfig
│   ├── dayNightCycle (sun angle, color temperature, duration)
│   ├── lightingZones[] (per-area overrides: caves, dungeons, etc.)
│   └── weatherRegions[] (rain, snow, fog per area)
├── foundation (locked procedural output)
│   ├── terrain seed + params
│   ├── biome placement
│   ├── towns[] (procedural towns)
│   ├── roads[] (road network)
│   └── pois[] (points of interest)
├── manifests (snapshot of ALL 38 game manifest files)
│   ├── world-areas.json (13KB — regions, NPC/resource/mob placements)
│   ├── npcs.json (46KB — 18 NPCs with dialogue trees)
│   ├── items/weapons.json (42KB — 60 weapons)
│   ├── items/armor.json (35KB — 69 armor pieces)
│   ├── items/tools.json (15KB — 25 tools)
│   ├── items/resources.json (32KB — 69 resources)
│   ├── items/food.json (4.9KB — 12 foods)
│   ├── items/misc.json (5.7KB — 14 misc items)
│   ├── items/runes.json (2.6KB — 6 rune items)
│   ├── items/ammunition.json (4KB — 6 ammo items)
│   ├── stores.json (56KB — 7 shops)
│   ├── stations.json (2KB — 6 station types)
│   ├── quests.json (10KB — 7 quests with stages + rewards)
│   ├── biomes.json (20KB — 9 biomes + vegetation layers)
│   ├── music.json (4.8KB — 20 tracks: intro/normal/boss/ambient)
│   ├── combat-spells.json (3.1KB — 8 spells: strike + bolt tiers)
│   ├── prayers.json (3.7KB — 9 prayers: drain + stat bonuses)
│   ├── runes.json (1.2KB — 6 rune types + 4 elemental staves)
│   ├── ammunition.json (901B — 5 arrow definitions)
│   ├── duel-arenas.json (2.6KB — 6 PvP arenas + lobby/hospital)
│   ├── skill-unlocks.json (20KB — 17 skills × level milestones)
│   ├── tier-requirements.json (2KB — melee/tools/ranged/magic gates)
│   ├── tools.json (2.8KB — 20 tool unlocks with priority)
│   ├── lod-settings.json (512B — LOD thresholds + dissolve)
│   ├── model-bounds.json (82KB — 138 model bboxes, AUTO-GENERATED read-only)
│   ├── buildings.json (empty placeholder)
│   ├── vegetation.json (403B — nearly empty, real data in biomes.json)
│   ├── teleport-locations.json
│   ├── gathering/fishing.json (7KB — 7 spots with catch tables)
│   ├── gathering/mining.json (8.4KB — 9 rocks with yield tables)
│   ├── gathering/woodcutting.json (15KB — 17 trees with 4 model variants)
│   ├── recipes/cooking.json (2.8KB — 12 recipes with burn mechanics)
│   ├── recipes/crafting.json (7KB — 24 recipes: leather, jewelry, gems)
│   ├── recipes/firemaking.json (877B — 8 recipes)
│   ├── recipes/fletching.json (11KB — 37 recipes: arrows, bows)
│   ├── recipes/smelting.json (1.8KB — 6 recipes, 50% iron rate)
│   ├── recipes/smithing.json (13KB — 72 recipes by tier + type)
│   ├── recipes/runecrafting.json (1.3KB — 6 recipes with multi-rune)
│   └── recipes/tanning.json (366B — 2 recipes with gold cost)
├── overrides (non-destructive layer edits)
│   ├── terrainSculpts[] (height brush strokes)
│   ├── biomePaints[] (biome brush strokes)
│   ├── vegetationPaints[] (density/removal brushes)
│   ├── tileOverrides Map<tileKey, flags> (collision edits)
│   ├── flatZones[] (terrain flattening zones)
│   └── townOverrides[], biomeOverrides[]
├── placements (hand-placed content)
│   ├── npcs[] (with 3D position, rotation, model, services, dialogue)
│   ├── mobs[] (spawn zones with radius, maxCount)
│   ├── resources[] (trees, ores, fishing spots, mining rocks, etc.)
│   ├── stations[] (banks, anvils, furnaces, altars)
│   ├── props[] (decorative objects)
│   ├── quests[] (quest definitions with NPC links)
│   ├── bosses[] (boss encounters with arena bounds)
│   ├── events[] (trigger areas)
│   ├── lore[] (discoverable entries)
│   ├── difficultyZones[] (level scaling regions)
│   ├── spawnPoints[] (player spawn/respawn locations)
│   ├── teleportNodes[] (teleport network destinations)
│   ├── farmingPatches[] (farming skill locations)
│   └── clueSteps[] (clue scroll spatial steps)
├── generatedAudio (AI-generated audio assets)
│   ├── voiceClips[] (generated NPC voice files + metadata)
│   ├── musicTracks[] (generated music + metadata)
│   ├── soundEffects[] (generated SFX + metadata)
│   └── dialogueSessions[] (AI-written dialogue drafts)
└── deploymentHistory[]
    ├── { version, timestamp, author, changelog, diff, approvedBy }
    └── ...
```

### 2.3 Staging → Production Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   EDITOR    │────→│   STAGING   │────→│ PRODUCTION  │
│  (local)    │push │  (server)   │push │  (server)   │
└─────────────┘     └─────────────┘     └─────────────┘
                          │                     │
                    ┌─────┴─────┐         ┌─────┴─────┐
                    │ Staging   │         │ Production│
                    │ Game      │         │ Game      │
                    │ Server    │         │ Server    │
                    └───────────┘         └───────────┘
```

**Flow:**
1. **Edit locally** — All changes in the World Builder are local drafts
2. **Push to Staging** — Requires `staging:push` permission. Generates world snapshot, deploys to staging server
   - Staging server runs with staging manifests + world data
   - Staging game client connects for live testing
3. **Review & Test** — Play-test the staging world, inspect diffs
4. **Promote to Production** — Requires `prod:push` permission + approval from a second team member. Push staging snapshot to production
   - Production server hot-reloads manifests (or restarts gracefully)
   - Old production state archived for rollback

**Technical Implementation:**

```
Asset Forge API (port 3401)
├── POST /api/world/save          — Save world project to server DB
├── GET  /api/world/load/:id      — Load world project
├── GET  /api/world/list          — List all world projects (scoped to team)
├── POST /api/world/push/staging  — Deploy to staging (requires staging:push)
│   ├── Generate manifest diffs
│   ├── Write staging manifests to staging/assets/manifests/
│   ├── Write staging assets to staging/assets/
│   ├── Write staging audio to staging/assets/audio/
│   ├── Signal staging game server to reload
│   └── Return deployment receipt
├── GET  /api/world/diff/staging  — Compare staging vs production
├── POST /api/world/push/prod     — Promote staging to production (requires prod:push + approval)
│   ├── Archive current production
│   ├── Copy staging to production
│   ├── Signal production server to reload
│   └── Return deployment receipt
├── POST /api/world/rollback      — Rollback production to previous version (requires prod:push)
├── GET  /api/world/history       — Deployment history
└── GET  /api/world/status        — Staging/prod server health
```

**Manifest Diff System:**
- Before any push, compute a JSON diff of every manifest file
- Display in UI: added/removed/modified NPCs, items, areas, etc.
- Human-readable changelog generation
- Require explicit confirmation before production push
- Production push requires approval from a second team member with `prod:approve` permission

### 2.4 Game Server Hot-Reload

**Current state**: DataManager is a singleton with `isInitialized = true` after first load — it refuses to re-initialize. No hot-reload mechanism exists. Multiple downstream systems (TownSystem, RoadNetworkSystem, POISystem, VegetationSystem) cache manifest data at init time.

**Required changes (estimated 19-32 hours of focused work):**

1. **DataManager changes** (2-3 hours):
   - Add `reloadManifests()` method that bypasses `isInitialized` guard
   - Clear all in-memory maps (items, NPCs, world areas, etc.)
   - Re-run manifest loading from filesystem
   - Re-validate all cross-references
   - Add mutex lock to prevent concurrent reloads

2. **Downstream system updates** (4-8 hours):
   - TownSystem: add `reloadTowns()` — re-read config, despawn/respawn town entities
   - RoadNetworkSystem: add `reloadRoads()` — regenerate road graph
   - POISystem: add `reloadPOIs()` — regenerate POI placements
   - VegetationSystem: clear cached vegetation instances, regenerate
   - CombatSystem, SkillSystem: verify if they cache manifest data

3. **Client sync** (4-6 hours):
   - Broadcast `MANIFESTS_RELOADED` event to all connected clients
   - Client-side DataManager clears cache and re-fetches from HTTP
   - UI components that reference stale manifest data must refresh

4. **Safety & rollback** (3-5 hours):
   - Validate new manifests BEFORE applying (reject if invalid)
   - Snapshot previous state for automatic rollback on failure
   - Rate-limit reload endpoint (max 1 per 30 seconds)
   - Log all reload operations to audit trail

5. **Admin endpoint**:
```
POST /api/admin/reload-manifests
  Headers: x-admin-code: <secret>
  Body: { manifestNames?: string[] }  // Optional: reload specific manifests
```

**MVP approach (recommended)**: For Phases 1-8, use **graceful server restart** instead of true hot-reload:
- Staging server: Just restart it. No players to disconnect. Fast and safe.
- Production server: Restart with 30-second drain (stop accepting new connections, let existing requests finish, restart). Brief interruption is acceptable for scheduled deployments.
- The deployment API endpoint triggers the restart via process manager (PM2, systemd, Docker restart policy).
- This avoids the 19-32 hour hot-reload investment entirely.

**True hot-reload (Phase 9 optimization)**: Only invest in DataManager hot-reload if production deployments become frequent enough that the restart window is unacceptable. By Phase 9, you'll have real usage data to justify the investment.

---

## Part 3: UI/UX Design

### 3.0 Safety Strategy — Protecting Existing Features

**Non-negotiable**: The World Studio is a NEW page at a NEW route. Existing pages are not touched.

```
WHAT SHIPS AS-IS (untouched):           WHAT'S NEW:
─────────────────────────               ──────────
WorldBuilderPage (/world)               WorldStudioPage (/world-studio)
WorldEditorPage  (/world-editor)          └── new route, new page, new context
ManifestsPage    (/manifests)
All 12 Generator pages
All other Asset Forge pages (24 total)
Navigation.tsx (add 1 nav item only)
App.tsx (add 1 route only)
constants/navigation.ts (add 1 route + 1 view)
types/navigation.ts (add 1 union member)
```

**Why this is safe:**
- No existing component is modified, only extended (one nav item, one route)
- WorldBuilderContext stays in `components/WorldBuilder/` — WorldStudio gets its own `WorldStudioContext`
- EditorWorldContext is reused (shared package, already works in WorldEditorPage)
- Common UI components (Button, Card, Modal, Input) are used, not modified
- Old pages deprecated ONLY after WorldStudio is feature-complete and user-verified
- The WorldStudio can import and reuse individual WorldBuilder components (HierarchyPanel, PropertiesPanel, LayerEditors) without modifying them — they take props + state, they don't own routing

**Files created (new):**
```
packages/asset-forge/src/pages/WorldStudioPage.tsx
packages/asset-forge/src/components/WorldStudio/
├── WorldStudioContext.tsx          — New state management (extends WorldBuilderContext patterns)
├── WorldStudioLayout.tsx           — Master layout orchestrator
├── panels/
│   ├── LeftSidebar.tsx             — Hierarchy + Asset Browser tabs
│   ├── RightSidebar.tsx            — Properties + Manifests tabs
│   ├── HierarchyPanel.tsx          — Extended hierarchy (reuses TreeView)
│   ├── PropertiesPanel.tsx         — Extended properties (reuses form components)
│   ├── AssetBrowserPanel.tsx       — Prod/Staging/Forge asset browser
│   ├── ManifestPanel.tsx           — Inline manifest editing
│   └── AIGenerationPanel.tsx       — AI content generation UI
├── toolbar/
│   ├── MainToolbar.tsx             — Top toolbar with menus + mode switches
│   ├── ToolModeBar.tsx             — Active tool options (brush size, snap, etc.)
│   └── DeploymentBar.tsx           — Push staging / diff / publish buttons
├── viewport/
│   ├── ViewportContainer.tsx       — EditorWorld wrapper with overlay compositing
│   ├── ViewportOverlays.tsx        — Tile grid, collision, biome, audio zone overlays
│   ├── PlacementGhost.tsx          — Ghost preview for entity placement
│   ├── BrushPreview.tsx            — Translucent circle for brush tools
│   └── MinimapOverlay.tsx          — Corner minimap (canvas-based, reuses WorldBuilder's approach)
├── dialogs/
│   ├── NewWorldDialog.tsx          — World creation wizard
│   ├── DeploymentDialog.tsx        — Staging/prod push confirmation + diff
│   └── TeamSelectorDialog.tsx      — Team + game picker
├── editors/                        — Inline property editors per entity type
│   ├── NPCEditor.tsx
│   ├── QuestEditor.tsx
│   ├── CombatEditor.tsx
│   ├── RecipeEditor.tsx
│   ├── AudioZoneEditor.tsx
│   └── ... (one per manifest category)
└── hooks/
    ├── useEditorWorldSync.ts       — Bridges WorldStudioContext ↔ EditorWorld
    ├── useBrushTool.ts             — Terrain/biome/vegetation brush logic
    ├── usePlacementTool.ts         — Entity placement with ghost preview
    └── useKeyboardShortcuts.ts     — Global shortcut registry
```

**Files modified (minimal, additive only):**
```
packages/asset-forge/src/App.tsx                   — 1 line: add <Route path="/world-studio" element={<WorldStudioPage />} />
packages/asset-forge/src/constants/navigation.ts   — 1 line: WORLD_STUDIO: "/world-studio"
packages/asset-forge/src/types/navigation.ts        — 1 line: | "worldStudio"
packages/asset-forge/src/components/shared/Navigation.tsx — 1 item in NAV_ITEMS array
```

### 3.1 Unified Editor Layout

The layout uses the same design language as the rest of Asset Forge (dark theme, indigo primary, Tailwind tokens) but with a full-viewport editor layout instead of the standard scrollable page pattern.

```
┌─────────────────────────────────────────────────────────────────────┐
│ ≡ 3D Asset Forge                                              ← existing nav (44px)
├─────────────────────────────────────────────────────────────────────┤
│ TOOLBAR (40px)                                                      │
│ [File▾][Edit▾][View▾][Tools▾]  [🔲 Select][✋ Pan][🔄 Orbit][🦅 Fly]│
│ [↔ Move][↻ Rotate][⊞ Scale][⊞ Snap]  │  [Push Staging][Diff][Pub] │
├─────────────────────────────────────────────────────────────────────┤
│ TOOL OPTIONS BAR (32px) — context-sensitive, shows active tool opts │
│ Brush: [Size ━━━○━━ 15m] [Strength ━━○━━━ 0.5] [Falloff: Smooth▾] │
├──────────┬──────────────────────────────────────────┬───────────────┤
│ LEFT     │                                          │ RIGHT         │
│ SIDEBAR  │            3D VIEWPORT                   │ SIDEBAR       │
│ (280px)  │         (EditorWorld)                    │ (320px)       │
│          │                                          │               │
│ ┌──────┐ │     Real game systems:                   │ ┌───────────┐ │
│ │Hierch│ │     terrain, vegetation,                 │ │Properties │ │
│ │archy │ │     water, towns, roads,                 │ │           │ │
│ │      │ │     buildings, bridges,                   │ │ Context-  │ │
│ │ World│ │     docks, landmarks                      │ │ sensitive │ │
│ │ ├ Te │ │                                          │ │ editors   │ │
│ │ ├ Bi │ │     + editor overlays:                   │ │           │ │
│ │ ├ To │ │     tile grid, collision,                │ │ Procgen   │ │
│ │ ├ Ro │ │     biome colors, audio                  │ │ controls  │ │
│ │ ├ NP │ │     zones, spawn points,                 │ │ when sys  │ │
│ │ ├ Mo │ │     teleport network,                    │ │ selected  │ │
│ │ ├ St │ │     world boundary,                      │ │           │ │
│ │ ├ Au │ │     POI network                          │ │ AI gen    │ │
│ │ ├ Sp │ │                                          │ │ buttons   │ │
│ │ └ Pr │ │     Selection highlight                  │ │ when NPC  │ │
│ │      │ │     Transform gizmo                      │ │ selected  │ │
│ ├──────┤ │     Placement ghost                      │ │           │ │
│ │Asset │ │     Brush preview                        │ ├───────────┤ │
│ │Browsr│ │                                          │ │Manifest  │ │
│ │[P|S|F│ │              ┌──────┐                    │ │Editor    │ │
│ └──────┘ │              │Mini- │                    │ │(tab)     │ │
│          │              │ map  │                    │ └───────────┘ │
├──────────┴──────────────┴──────┴────────────────────┴───────────────┤
│ STATUS BAR (24px)                                                    │
│ 👤 @lucid │ 🏢 Hyperscape │ 🛡 Editor │ FPS: 60 │ ⚡ 3 unsaved   │
│ Staging: ✓ synced 2m ago │ Prod: v12 │ Entities: 847              │
└─────────────────────────────────────────────────────────────────────┘
```

**Layout details:**
- **Total height**: `100vh` — no scrolling on the page itself (panels scroll internally)
- **Top nav**: Existing Asset Forge nav bar (44px) — unchanged, provides hamburger → full nav
- **Toolbar**: 40px, houses mode switches + deployment buttons
- **Tool Options Bar**: 32px, context-sensitive — shows brush options when brush active, snap settings when placing, nothing when selecting
- **Left Sidebar**: 280px default, resizable (min 200, max 400). Two tabs: Hierarchy | Asset Browser
- **Right Sidebar**: 320px default, resizable (min 240, max 500). Two tabs: Properties | Manifests
- **Viewport**: Fills remaining space. EditorWorld with real game systems
- **Status Bar**: 24px, shows user/team/role, sync status, entity count, FPS
- **Minimap**: 160×160px canvas overlay in bottom-right of viewport (existing WorldBuilder minimap approach)

**Panels are collapsible**: Click the panel edge or press `[` / `]` to collapse left/right panel for full-viewport mode.

### 3.2 Navigation & Entry Points

**How users reach the World Studio:**

1. **Nav menu**: New "World Studio" item in NAV_ITEMS (between "World Editor" and "Manifests")
2. **First-time flow**: Opening World Studio with no project shows the New World dialog
3. **Returning flow**: Opening with a saved project loads it from server (or IndexedDB if offline)
4. **Deep links**: `/world-studio?project=<id>` loads a specific project directly

**Relationship to existing pages:**
- WorldBuilderPage (`/world`) — remains for standalone procgen preview (useful for quick terrain tests)
- WorldEditorPage (`/world-editor`) — remains for standalone WYSIWYG editing (useful for system debugging)
- ManifestsPage (`/manifests`) — remains for standalone manifest editing (the World Studio embeds a subset of this)
- Generator pages (`/generators/*`) — remain standalone. Generators gain "Add to Staging" button in future (Phase 7) but that's a per-generator additive change

### 3.3 Workflow: New World → Edit → Deploy

**Step 1: New World Dialog** (modal, appears on first open or "File → New World")

```
┌───────────────────────────────────────────────────┐
│ 🌍 New World                                      │
│                                                   │
│ Name: [My World                              ]    │
│ Description: [                               ]    │
│                                                   │
│ ── Terrain ──────────────────────────────────     │
│ Preset: [Default Island     ▾]                    │
│ Seed: [483729  ] [🎲 Random]                      │
│ World Size: [━━━━━━━○━━━ 100×100 tiles]           │
│                                                   │
│ ── Quick Settings ───────────────────────────     │
│ Biomes: [━━━━○━━━ 4 biomes]                      │
│ Towns: [━━━━━○━━ 5 towns]                         │
│ Water: [✓] Islands    [ ] Continent                │
│                                                   │
│ [▸ Advanced Terrain...]   (expands full controls) │
│ [▸ Advanced Towns...]                              │
│ [▸ Advanced Roads...]                              │
│                                                   │
│              [Cancel]  [Generate World]            │
└───────────────────────────────────────────────────┘
```

- **Presets**: Reuses existing CreationPanel presets (Default Island, Archipelago, Continent, etc.)
- **Advanced sections**: Expand to show all sliders from CreationPanel (noise weights, island radius, town spacing, road width, etc.)
- **Generate**: Runs procgen → transitions to editing mode with world loaded in EditorWorld
- **This replaces CreationPanel as a modal** — same controls, but not a full-page panel

**Step 2: Editing** — The main editor layout (described in 3.1)

**Step 3: Deploy** (from toolbar buttons)
- "Push Staging" → DeploymentDialog (shows diff preview, confirms)
- "Diff" → Side-by-side diff viewer panel (replaces right sidebar temporarily)
- "Publish" → Production deployment dialog (requires approval if team has >1 member)

### 3.4 Tool Modes

The toolbar shows the current mode. Only one mode is active at a time. Press Escape to return to Select mode.

| Mode | Shortcut | Cursor | Viewport Behavior |
|------|----------|--------|-------------------|
| **Select** | `V` | Arrow | Click to select, drag to marquee, shift+click multi-select |
| **Pan** | `H` | Hand | Drag to pan camera, wheel to zoom |
| **Orbit** | `O` | Orbit | Drag to orbit around target, wheel to zoom |
| **Fly** | `F` | Crosshair | WASD+mouse FPS camera, Space=up, Ctrl=down, Shift=fast |
| **Move** | `W` | Move | Transform gizmo: translate selected objects |
| **Rotate** | `E` | Rotate | Transform gizmo: rotate selected objects |
| **Scale** | `R` | Scale | Transform gizmo: scale selected objects |
| **Place** | `P` | Crosshair+ghost | Click to place entity, ghost follows cursor |
| **Terrain Brush** | `T` | Circle | Click+drag to sculpt terrain (raise/lower/flatten/smooth) |
| **Biome Paint** | `B` | Circle | Click+drag to paint biome assignments |
| **Vegetation Paint** | `G` | Circle | Click+drag to add/remove vegetation |
| **Tile Edit** | `I` | Grid | Click tiles to toggle collision flags |
| **Audio Zone** | `A` | Circle | Click+drag to paint music/ambient zones |

**Tool Options Bar** (appears below toolbar, context-sensitive):

```
SELECT mode:   [Snap to Grid: ✓] [Grid: 1m]
PLACE mode:    [Entity: NPC ▾] [Template: Guard ▾] [Snap: ✓]
TERRAIN mode:  [Tool: Raise ▾] [Size ━━━○━━ 15m] [Strength ━━○━━━ 0.5] [Falloff: Smooth ▾]
BIOME mode:    [Biome: Forest ▾] [Size ━━━○━━ 20m] [Blend: ━○━━━ 0.3]
VEG mode:      [Action: Add ▾] [Species: All ▾] [Size ━━━○━━ 10m] [Density: ━━━○━ 0.7]
TILE mode:     [Flag: Blocked ▾] [Show: Walkability ✓] [Show: Walls ✓]
AUDIO mode:    [Zone: Music ▾] [Track: peaceful_forest ▾] [Size ━━━○━━ 30m]
```

### 3.5 Left Sidebar — Hierarchy & Asset Browser

Two tabs at the top of the left sidebar: **Hierarchy** | **Assets**

#### Hierarchy Tab

Reuses the `TreeView` component pattern from WorldBuilder but with an extended tree:

```
🌍 World: "My World" (v3, 2m ago)
├── 🏔 Terrain
│   ├── Config (click → procgen controls in properties)
│   └── Sculpts (3 brush strokes)
├── 🌿 Biomes (4)
│   ├── 🌲 Forest (locked 🔒)
│   ├── 🏜 Canyon (locked 🔒)
│   ├── ❄️ Tundra (locked 🔒)
│   └── 🌾 Plains (locked 🔒)
│   └── 🎨 Overrides (2 paint strokes)
├── 🏘 Towns (5)
│   ├── 🏠 Central Haven (12 buildings) (locked 🔒)
│   │   ├── 🏛 Bank
│   │   ├── 🏪 General Store
│   │   └── ...
│   └── 🏠 North Watch (8 buildings) (locked 🔒)
├── 🛤 Roads (locked 🔒)
├── 📍 POIs (12)
│   ├── ⚔️ Goblin Cave (dungeon)
│   ├── 🏛 Forest Shrine (shrine)
│   └── ...
├── 💧 Water
│   ├── 🌊 Sea Level
│   └── 🏞 Island River (18 waypoints)
├── 👥 NPCs (18) [+ Add]
│   ├── 🏦 Bank Clerk
│   ├── 🗡 Captain Rowan
│   └── ...
├── 👹 Mob Spawns (8) [+ Add]
│   ├── 🐔 Chicken Pen (max: 5)
│   └── 🗡 Goblin Camp (max: 8)
├── ⛏ Resources (23) [+ Add]
│   ├── 🎣 Fishing (7 spots)
│   ├── ⛏ Mining (9 rocks)
│   └── 🪓 Woodcutting (7 trees)
├── 🏗 Stations (6) [+ Add]
│   ├── 🔨 Anvil (Central Haven)
│   └── 🔥 Furnace (Central Haven)
├── 📜 Quests (7) [+ Add]
│   ├── Goblin Slayer
│   └── Cook's First Lesson
├── 🎵 Audio [+ Add]
│   ├── 🎶 Music Zones (3)
│   ├── 🔊 Ambient Zones (2)
│   └── 📢 SFX Triggers (5)
├── 🎯 Spawn Points (2) [+ Add]
├── 🌀 Teleports (4) [+ Add]
├── ⚔️ Arenas (6)
│   └── Duel Arena 1-6
├── 🎯 Difficulty Zones (3)
├── 📖 Lore Entries (5) [+ Add]
└── 📦 Custom Placements (0) [+ Add]
```

**Interactions:**
- Click node → select in viewport (camera flies to it if off-screen) + show in properties panel
- Double-click node → rename (for user-created content, not locked foundation)
- Right-click node → context menu (Delete, Duplicate, Focus Camera, Copy ID)
- `[+ Add]` button → opens placement mode for that type (no dialog — place directly in viewport)
- Search bar at top filters tree (auto-expands matching nodes)
- Drag nodes to reorder within category
- Lock icon (🔒) on foundation items — cannot delete, but can override properties

#### Asset Browser Tab

```
┌──────────────────────────────┐
│ 🔍 Search assets...          │
│ [Prod ▾] [Model ▾] [All ▾]  │
├──────────────────────────────┤
│ Source: ● Prod ○ Stg ○ Forge │
│ Type:   Models | Textures |  │
│         Audio  | All         │
├──────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐        │
│ │🌲  │ │🪨  │ │🏠  │        │
│ │Oak │ │Gran│ │Cott│        │
│ │Tree│ │ite │ │age │        │
│ └────┘ └────┘ └────┘        │
│ ┌────┐ ┌────┐ ┌────┐        │
│ │🔨  │ │⚔️  │ │🎵  │        │
│ │Anv │ │Bro │ │For │        │
│ │il  │ │nze │ │est │        │
│ └────┘ └────┘ └────┘        │
│ ...                          │
├──────────────────────────────┤
│ Drag to viewport to place    │
└──────────────────────────────┘
```

- Grid of thumbnails (3D preview for models, waveform for audio)
- Hover → larger preview tooltip with metadata (poly count, file size, format)
- Click → select asset (shows full preview in properties panel)
- **Drag to viewport** → enters placement mode with that asset
- Source filter: Production (deployed), Staging (pending), Forge (generated in Asset Forge)
- Badge on each asset: "Prod" (green), "Stg" (yellow), "Forge" (blue)

### 3.6 Right Sidebar — Properties & Manifests

Two tabs: **Properties** | **Manifests**

#### Properties Tab (context-sensitive)

Shows different editors based on what's selected. This reuses patterns from the existing PropertiesPanel (1566 lines) and LayerEditors (1268 lines), but restructured as pluggable editor components.

**Nothing selected:**
```
┌───────────────────────────────┐
│ PROPERTIES                    │
│                               │
│ Select an object in the       │
│ viewport or hierarchy to      │
│ view its properties.          │
│                               │
│ Quick Actions:                │
│ [🌍 World Settings]           │
│ [⚙️ Procgen Controls]          │
│ [📊 World Statistics]          │
└───────────────────────────────┘
```

**Terrain selected** (system node):
```
┌───────────────────────────────┐
│ 🏔 TERRAIN CONFIG             │
│                               │
│ Seed: [483729  ] [🎲]         │
│                               │
│ ▸ Noise Layers                │
│   Continent [━━━━━━━○━ 0.8]  │
│   Ridge     [━━━━○━━━━ 0.5]  │
│   Hill      [━━━━━━○━━ 0.7]  │
│   Erosion   [━━━○━━━━━ 0.4]  │
│   Detail    [━━━━━○━━━ 0.6]  │
│                               │
│ ▸ Island Settings             │
│   Radius: [788   ] units     │
│   Falloff: [━━━━━━○━━ 0.7]  │
│   Coastline Noise: [0.15]    │
│                               │
│ ▸ Heights                     │
│   Max Height: [50  ] units   │
│   Water Level: [8.0 ]        │
│   Base Elev: [0.0  ]        │
│                               │
│ [🔄 Regenerate Terrain]       │
│ ⚠️ Regenerating clears sculpts │
└───────────────────────────────┘
```

**NPC selected** (placed entity):
```
┌───────────────────────────────┐
│ 👤 NPC: Captain Rowan         │
│ ID: captain_rowan             │
│                               │
│ ▸ Transform                   │
│   X: [450.5] Y: [12.3] Z: [320.0]
│   Rotation: [0°  ] [180°] [0° ]
│                               │
│ ▸ Identity                    │
│   Name: [Captain Rowan      ] │
│   Category: [quest_giver   ▾] │
│   Faction: [Haven Guard    ▾] │
│                               │
│ ▸ Combat Stats                │
│   Level: [15 ] HP: [120]     │
│   Attack: [10] Def: [8 ]    │
│                               │
│ ▸ Services                    │
│   [✓] Quest Giver             │
│   [ ] Shop      [ ] Bank     │
│   Quest: [goblin_slayer    ▾] │
│                               │
│ ▸ Dialogue                    │
│   [11 dialogue nodes]         │
│   [📝 Edit Dialogue Tree]     │
│   [🤖 Generate Dialogue] ← AI │
│   [🔊 Generate Voice] ← AI   │
│                               │
│ ▸ Drops                       │
│   Bones (100%), Gold 5-15     │
│   [+ Add Drop]                │
│                               │
│ [🗑 Delete NPC]               │
└───────────────────────────────┘
```

**Quest selected:**
```
┌───────────────────────────────┐
│ 📜 QUEST: Goblin Slayer       │
│ ID: goblin_slayer             │
│                               │
│ ▸ Details                     │
│   Title: [Goblin Slayer     ] │
│   Difficulty: [Beginner    ▾] │
│   Quest Points: [1  ]        │
│                               │
│ ▸ Stages (3)                  │
│   1. Talk to Captain Rowan    │
│      Type: [dialogue ▾]      │
│      NPC: [captain_rowan  ▾]  │
│   2. Kill 10 Goblins          │
│      Type: [kill ▾]          │
│      Target: [goblin ▾]      │
│      Count: [10]              │
│   3. Return to Captain Rowan  │
│      Type: [dialogue ▾]      │
│   [+ Add Stage]               │
│                               │
│ ▸ Requirements                │
│   Min Level: [1  ]           │
│   Required Quest: [none    ▾] │
│                               │
│ ▸ Rewards                     │
│   Gold: [200  ]              │
│   XP: Attack [500], Defense [250]
│   Items: Bronze Sword (1)     │
│   [+ Add Reward]              │
│                               │
│ [🤖 Generate Quest] ← AI     │
│ [📍 Show Quest Path in World] │
│ [🗑 Delete Quest]             │
└───────────────────────────────┘
```

**Music Zone selected:**
```
┌───────────────────────────────┐
│ 🎵 MUSIC ZONE: Forest Theme   │
│                               │
│ Track: [peaceful_forest   ▾]  │
│ [▶ Preview]                   │
│                               │
│ ▸ Zone                        │
│   Shape: [Circle ▾]          │
│   Radius: [100 ] tiles       │
│   Center: X [300] Z [400]    │
│   Blend: [━━━━○━━ 10 tiles]  │
│                               │
│ ▸ Overrides                   │
│   Combat Track: [battle_1 ▾]  │
│   Night Track: [none      ▾]  │
│                               │
│ [🤖 Generate Track] ← AI     │
│ [🗑 Delete Zone]              │
└───────────────────────────────┘
```

#### Manifests Tab

Inline manifest editing (simplified version of ManifestsPage):

```
┌───────────────────────────────┐
│ 📋 MANIFESTS                   │
│ [🔍 Search manifests...]      │
│                               │
│ ▸ Items (261 entries)         │
│   ├── Weapons (60)            │
│   ├── Armor (69)              │
│   ├── Tools (25)              │
│   ├── Food (12)               │
│   ├── Resources (69)          │
│   ├── Misc (14)               │
│   ├── Runes (6)               │
│   └── Ammunition (6)          │
│ ▸ NPCs (18)                   │
│ ▸ Quests (7)                  │
│ ▸ Stores (7)                  │
│ ▸ Stations (6)                │
│ ▸ Combat (spells, prayers...) │
│ ▸ Recipes (167)               │
│ ▸ Gathering (33 spots)        │
│ ▸ Skills & Progression        │
│ ▸ Music (20 tracks)           │
│ ▸ Arenas (6)                  │
│ ▸ LOD Settings                │
│                               │
│ Click to expand and edit      │
│ inline. Changes are tracked   │
│ in the world project.         │
└───────────────────────────────┘
```

Expanding a category shows a searchable list. Clicking an entry loads its editor in the properties area (right sidebar switches to Properties tab automatically).

### 3.7 Viewport Interactions

The 3D viewport uses **EditorWorld** with real game systems — what the user sees IS what players will see. On top of the game rendering, editor overlays are composited.

**Mouse interactions by mode:**

| Mode | Left Click | Left Drag | Right Click | Middle Drag | Scroll |
|------|-----------|-----------|-------------|-------------|--------|
| Select | Select object | Marquee select | Context menu | Pan camera | Zoom |
| Pan | — | Pan camera | — | Pan camera | Zoom |
| Orbit | — | Orbit camera | — | Pan camera | Zoom |
| Fly | — | Look around | — | — | Speed |
| Move/Rotate/Scale | — | Transform gizmo | Cancel | Pan camera | Zoom |
| Place | Place entity | — | Cancel placement | Pan camera | Zoom |
| Brushes | Apply brush | Apply brush (continuous) | Cancel | Pan camera | Zoom |
| Tile Edit | Toggle tile flag | — | Clear tile flag | Pan camera | Zoom |

**Viewport HUD elements** (overlaid on 3D view):
- **Minimap** (bottom-right, 160×160px): island overview, town dots, road lines, camera position indicator. Click to teleport camera.
- **FPS counter** (top-right, subtle): only shown in dev mode
- **Tool hint** (bottom-center): "Click to place NPC" / "Drag to raise terrain" / etc.
- **Selection info** (top-left): "3 objects selected" / "Town: Central Haven"
- **Camera mode** (top-right): current mode icon

### 3.8 Keyboard Shortcuts

All shortcuts work only when viewport has focus (not when typing in text inputs).

**Navigation:**
| Key | Action |
|-----|--------|
| `V` | Select mode |
| `H` | Pan mode |
| `O` | Orbit mode |
| `F` | Fly mode |
| `Numpad .` | Focus camera on selection |
| `Home` | Reset camera to world center |

**Transform:**
| Key | Action |
|-----|--------|
| `W` | Move mode |
| `E` | Rotate mode |
| `R` | Scale mode |
| `X` | Toggle snap to grid |
| `Delete` | Delete selected |
| `Ctrl+D` | Duplicate selected |

**Tools:**
| Key | Action |
|-----|--------|
| `P` | Place mode |
| `T` | Terrain brush mode |
| `B` | Biome paint mode |
| `G` | Vegetation paint mode |
| `I` | Tile edit mode |
| `A` | Audio zone mode |
| `Esc` | Return to Select mode / Cancel current action |

**General:**
| Key | Action |
|-----|--------|
| `Ctrl+S` | Save project |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `[` | Toggle left sidebar |
| `]` | Toggle right sidebar |
| `\` | Toggle both sidebars (full viewport) |
| `Ctrl+Shift+S` | Push to staging |

### 3.9 Component Reuse Strategy

Existing WorldBuilder components that can be **reused directly** (imported, not copied):

| Component | Source | Reuse Method |
|-----------|--------|-------------|
| `TreeView` | `WorldBuilder/shared/TreeView.tsx` (321 lines) | Import directly — takes tree data as props |
| Common form components | `components/common/` (Button, Card, Modal, Input, Badge, etc.) | Import directly — these are already shared |
| `OverlayControls` patterns | `WorldBuilder/EditingMode/OverlayControls.tsx` (322 lines) | Adapt pattern for new overlays |
| CreationPanel slider/toggle patterns | `WorldBuilder/CreationMode/CreationPanel.tsx` (1020 lines) | Reuse SliderInput, ToggleInput, Section components |
| EditorWorldContext + hooks | `context/EditorWorldContext.tsx` (295 lines) | Import directly — already used by WorldEditorPage |
| Minimap rendering logic | `WorldBuilder/TileBasedTerrain.tsx` minimap section | Extract and reuse canvas rendering approach |

Components that need **new implementations** (different architecture):

| Component | Why New |
|-----------|---------|
| WorldStudioContext | Combines WorldBuilderContext patterns + server persistence + team scoping |
| Properties panel | Same form patterns but pluggable per-entity-type, not one giant switch |
| Viewport container | Uses EditorWorld (not TileBasedTerrain), with overlay compositing layer |
| Toolbar | New layout, integrates deployment + AI buttons |
| Asset Browser | Entirely new (three-source browsing, drag-to-place) |
| Deployment UI | Entirely new (diff viewer, approval flow, staging push) |
| AI generation panels | Entirely new (dialogue gen, voice gen, music gen, SFX gen) |

### 3.10 Procgen Controls in Properties Panel

When a procgen system node is selected in the hierarchy, the properties panel shows system-specific controls:

**Terrain Config** → noise layer weights, island radius, water threshold, heights, "Regenerate" button
**Biome Config** → per-biome parameters, vegetation layer editor, difficulty settings
**Town Config** → count, spacing, size distribution, landmark toggles, per-town building editor
**Road Config** → width, smoothing, extra connections, terrain cost weights
**Vegetation Config** → per-biome density, species weights, spacing, clustering
**POI Config** → category, importance, radius, road connections
**Water Config** → sea level, river waypoint editor, lake polygons
**Audio Config** → music zones, ambient zones, SFX triggers

Each shows a "Regenerate" button that re-runs that specific system. Warning dialog if regeneration would lose manual edits.

### 3.11 World Creation → Editing Transition

The two-phase workflow (Creation → Editing) is preserved but streamlined:

1. **User opens World Studio** → if no project, shows New World Dialog (3.3)
2. **New World Dialog** generates world → EditorWorld renders it → Foundation is locked
3. **User edits** in the main layout — adds NPCs, quests, paints biomes, places stations
4. **User can "Regenerate"** specific systems from procgen controls — with warning if manual edits exist
5. **Foundation items** (biomes, towns, roads generated by procgen) are locked (🔒) — can't delete them, but CAN override their properties (e.g., rename town, change biome difficulty)
6. **Manual items** (placed NPCs, quests, audio zones) are fully editable and deletable

This matches the existing WorldBuilderContext `APPLY_AND_LOCK` pattern exactly — the transition from creation config to editing state is the same, just triggered from a modal instead of a panel.

### 3.12 Responsive Considerations

The World Studio is designed for **desktop use** (≥1280px width). On smaller screens:
- Left sidebar auto-collapses, accessible via `[` key or hamburger icon
- Right sidebar auto-collapses, accessible via `]` key or panel icon
- Tool options bar stacks vertically if too narrow
- Minimap hidden below 1024px viewport width
- Touch/mobile: not supported — world editing requires keyboard + mouse

### 3.13 Theme & Visual Consistency

- Uses existing Asset Forge design tokens (`src/styles/tokens.ts`)
- Dark theme (default): same `--bg-primary`, `--bg-secondary`, `--text-primary` CSS vars
- Primary color: Indigo (#6366f1) for active states, selection highlights
- Panel borders: `border-border-primary` (existing token)
- Cards within panels: same `bg-bg-tertiary` pattern used everywhere else
- Icons: Lucide React (already used throughout Asset Forge)
- Font: System monospace (existing)
- Animations: Same `transition-all duration-150` pattern used by Navigation and other components
- Z-index layering: Toolbar (50), Sidebars (40), Minimap (30), Status bar (20), Modals (200+) — doesn't conflict with Navigation sidebar (z-201)

---

## Part 4: Implementation Phases

### Phase 1: Foundation — Accounts, Persistence & World Projects (3-4 weeks)

**Goal**: Authentication, team management, server persistence, project model.

1. **Account & Team System** (see Part 9 for full details):
   - Add `teams`, `team_members`, `team_invites` tables to Asset Forge DB
   - Add authentication middleware to all Asset Forge API routes
   - Implement team CRUD, invite flow, role assignment
   - Scope all API responses to the authenticated user's team

2. **World Project Database Schema (Asset Forge PostgreSQL)**

```sql
CREATE TABLE world_projects (
  id UUID PRIMARY KEY,
  team_id UUID REFERENCES teams(id) NOT NULL,
  game_id UUID REFERENCES games(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER DEFAULT 1,
  created_by UUID REFERENCES users(id),
  world_data JSONB NOT NULL,
  manifest_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  locked_by UUID REFERENCES users(id),  -- Optimistic lock
  locked_at TIMESTAMPTZ
);

CREATE TABLE world_deployments (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES world_projects(id),
  game_id UUID REFERENCES games(id),
  target TEXT NOT NULL,              -- 'staging' | 'production'
  version INTEGER NOT NULL,
  manifest_diff JSONB,
  asset_diff JSONB,
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  deployed_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),  -- Required for prod
  rollback_data JSONB
);
```

3. **API Endpoints** — Add to Asset Forge API (all authenticated, team-scoped):
   - `POST /api/world/projects` — Create new project
   - `GET /api/world/projects` — List projects (for current team + game)
   - `GET /api/world/projects/:id` — Load project
   - `PUT /api/world/projects/:id` — Save project (requires `project:edit`)
   - `DELETE /api/world/projects/:id` — Delete project (requires `project:admin`)
   - `POST /api/world/projects/:id/snapshot` — Create version snapshot
   - `POST /api/world/projects/:id/lock` — Acquire edit lock
   - `POST /api/world/projects/:id/unlock` — Release edit lock

4. **Migrate WorldBuilderContext** — Add server save/load alongside IndexedDB:
   - Auto-save still goes to IndexedDB (offline support)
   - Explicit "Save to Server" syncs to API
   - "Load from Server" replaces local state
   - Conflict detection (server version vs local version)
   - Lock indicator: show who is editing if locked by another user

5. **Manifest Snapshot on Save** — When saving a world project, snapshot all current manifests into the project.

### Phase 2: Unified Editor — Merge WorldBuilder + WorldEditor (3-4 weeks)

**Goal**: One editor page with real game rendering + full content authoring.

**⚠️ This is the highest-risk phase.** WorldBuilder and WorldEditor currently share ZERO state and have fundamentally different architectures:
- WorldBuilder: React reducer (WorldBuilderContext, 60 actions) + TileBasedTerrain component (canvas-based)
- WorldEditor: EditorWorld (real Three.js game systems) + no properties panel

**Merge strategy**: Keep WorldBuilderContext as the authoritative state, but replace TileBasedTerrain rendering with EditorWorld. WorldBuilderContext dispatches drive both the state AND EditorWorld updates via a sync bridge. Do NOT attempt a bottom-up rewrite — incrementally replace the WorldBuilder viewport while keeping all existing reducer logic, undo/redo, and properties panels working.

1. **New WorldStudioPage** at `/world-studio` — NEW page, does NOT replace existing pages (see Part 3.0 Safety Strategy):
   - Uses EditorWorld for viewport (real game systems) — same as WorldEditorPage
   - Uses new WorldStudioContext for state management (extends WorldBuilderContext patterns, same 60 action types)
   - **Sync bridge**: `useEditorWorldSync(worldState, editorWorld)` hook that translates WorldStudioContext state changes into EditorWorld system calls (e.g., NPC placement → spawn NPC entity in EditorWorld)
   - Three-panel layout: left sidebar (hierarchy + assets) | viewport | right sidebar (properties + manifests) — see Part 3.1
   - Toolbar with tool modes — see Part 3.4
   - Shows current user, team, and role in status bar
   - Old WorldBuilderPage and WorldEditorPage remain functional at their existing routes until WorldStudio is verified complete

2. **Viewport Integration:**
   - EditorWorld renders terrain, vegetation, grass, flowers, towns, roads, buildings, landmarks, water
   - Editor camera (orbit/pan/fly) with keyboard shortcuts
   - Selection system highlights clicked objects
   - Transform gizmo for placed objects
   - Water plane rendering at sea level

3. **Hierarchy Panel Enhancement:**
   - Tree view of all world content (from WorldBuilder's HierarchyPanel)
   - Click node → select in viewport + show in properties
   - Add/remove buttons per category
   - Drag to reorder (for priority)
   - Filter/search bar
   - New categories: Audio, Spawns, Teleports, Farming Patches

4. **Properties Panel Enhancement:**
   - Forms from WorldBuilder's PropertiesPanel
   - Live-update EditorWorld when properties change
   - "Apply" button regenerates affected systems
   - AI generation buttons inline (see Phase AI)

5. **Creation → Editing Transition:**
   - Keep two-phase workflow but embedded in same page
   - "New World" dialog with procgen settings
   - After generation, seamlessly transition to editing mode
   - "Regenerate" button available at any time (with warning about losing edits)

### Phase 3: Spatial Editing Tools (3-4 weeks)

**Goal**: Place and edit objects directly in 3D viewport.

1. **Placement Tool:**
   - Entity palette in left panel (NPC, Station, Resource, Mob Zone, Prop, Spawn Point, Teleport, Farming Patch)
   - Each category shows available templates from manifests
   - Click to place ghost → click to confirm
   - Placed objects are registered as Selectable in EditorSelectionSystem
   - Position snaps to tile center (1m grid)

2. **NPC/Station 3D Representation:**
   - Load GLB models from manifest modelPath for NPCs and stations
   - Display in viewport at placed positions
   - Clickable for selection
   - Label overlay showing name
   - Service type icon (bank, shop, quest giver)

3. **Mob Spawn Zone Visualization:**
   - Translucent sphere/cylinder showing spawn radius
   - Color coded by mob type
   - Count badge showing maxCount
   - Drag handles to adjust radius

4. **Resource Node Visualization:**
   - Tree/rock/ore models from procgen
   - Fishing spots as water surface markers
   - Level requirement shown on hover

5. **Spawn Point Management:**
   - Place player spawn points (initial + respawn)
   - Visualize as colored markers with directional indicator
   - Properties: spawn type (initial, death-respawn, teleport-arrival), capacity
   - Link respawn points to regions/towns

6. **Teleport Network Editor:**
   - Place teleport destinations in world
   - Draw connections between teleport nodes
   - Assign requirements (quest completion, level, items)
   - Visualize network as graph overlay
   - Properties: name, destination coordinates, requirements, cost

7. **Skill Resource Placement:**
   - Fishing spots: place at water bodies, assign fish types and levels from `fishing-spots.json`
   - Mining rocks: place on terrain, assign ore types and levels from `mining-rocks.json`
   - Woodcutting trees: place in forests, assign wood types from `woodcutting-trees.json`
   - Farming patches: place in designated areas, assign patch type from `farming-patches.json`

8. **Tile-Level Collision Editor:**
   - Toggle overlay showing walkability grid
   - Click tiles to toggle blocked/walkable
   - Paint edge flags (wall north/south/east/west)
   - Import collision from placed buildings automatically
   - Export tile overrides to manifest

### Phase 4: Procgen Deep Controls (2-3 weeks)

**Goal**: Fine-grained control over every procedural system.

1. **Terrain Procgen Panel:**
   - All noise layer weights as sliders
   - Island shape parameters
   - Biome-specific terrain profiles (terracing, cliff heights)
   - Real-time preview (regenerate terrain tile under cursor)
   - Height profile graph tool (sample height along a line)

2. **Biome System Panel:**
   - Visual biome map overlay (color-coded tiles)
   - Biome center placement (drag biome centers on map)
   - Influence radius adjustment
   - Per-biome vegetation layer editor (inline in properties)
   - Biome blend settings

3. **Town System Panel:**
   - Town list with position, size, building count
   - Click town in list → camera flies to it
   - Per-town building editor:
     - Add/remove buildings
     - Change building type
     - Adjust position/rotation within town bounds
   - Town landmarks toggle (fences, lampposts, wells)
   - Rename towns
   - Add/remove entry points

4. **Road Network Panel:**
   - Visual road overlay on terrain
   - Click road to select → show properties
   - Add manual road connections between towns
   - Adjust road width per segment
   - Road material selection (dirt, cobblestone, stone)
   - "Regenerate roads" with current settings

5. **Vegetation Tuning:**
   - Per-biome density sliders
   - Vegetation species list with weight adjustment
   - Spacing and clustering controls
   - "Regenerate vegetation for selected tile" for quick preview
   - Exclusion zone painting (clear vegetation from area)
   - **Note**: `plants` are disabled in BiomeResourceGenerator ("not looking good yet") — do NOT expose plant placement until underlying system is fixed

6. **POI Editor:**
   - List all 9 POI categories (dungeon, shrine, landmark, resource_area, ruin, camp, crossing, waystation, fishing_spot)
   - Click POI in hierarchy → camera flies to it
   - Per-POI properties: name, category, importance weight, radius, linked roads
   - Add new POIs: click map to place, select category, configure
   - Remove/move existing POIs with transform gizmo
   - Visualize POI influence radii as translucent circles
   - POI connection to road network shown as dashed lines

7. **Water Body & River Editor:**
   - Sea level adjustment with real-time water plane update
   - **River path editing**: Select river in hierarchy → show spline control points on map. Drag points to reshape. Add/remove waypoints. Per-waypoint width control. Currently uses 18-waypoint ISLAND_RIVER definition in RiverDefinition.ts — editor must output same format.
   - **River terrain carving preview**: Show terrain carving depth and berm shaping before applying
   - Lake definition (closed polygon at set height)
   - Shore material blending controls
   - Waterfall placement (linked to terrain height drops)

8. **World Boundary Visualization:**
   - Show island mask boundary (788-unit radius) as a translucent ring/wall in the editor
   - Warn when placing content outside the boundary
   - Camera cannot orbit beyond boundary + margin

### Phase 5: Brush Tools — Terrain, Biome, Vegetation (2-3 weeks)

**Goal**: Painter-style tools for terrain sculpting and biome/vegetation editing.

1. **Terrain Brushes:**
   - Raise/Lower (Gaussian brush, adjustable radius + strength)
   - Flatten (to target height, from click position)
   - Smooth (average neighboring heights)
   - Stored as `terrainSculpts[]` overlay applied on top of procgen
   - Non-destructive: original procgen height preserved, sculpts additive

2. **Biome Paint Brush:**
   - Select target biome from palette
   - Paint over terrain to change biome assignment
   - Affects: terrain color, vegetation type, resource spawns, mob types
   - Stored as `biomePaints[]` override layer
   - Soft blend at brush edges

3. **Vegetation Paint Brush:**
   - Add brush: increases vegetation density in area
   - Remove brush: clears vegetation
   - Species filter: only affect specific vegetation types
   - Stored as `vegetationPaints[]` overlay
   - Applied after procgen vegetation placement

4. **Brush Settings UI:**
   - Radius slider (1m - 50m)
   - Strength slider (0.1 - 1.0)
   - Falloff curve (sharp/linear/smooth)
   - Preview circle on terrain surface
   - Undo/redo per brush stroke

### Phase 6: Manifest Integration & Editing (4-5 weeks)

**Goal**: All 38 manifest files viewable and editable within the World Studio. This is the largest content phase — 261+ items, 167 recipes, 33 gathering spots, 18 NPCs, 8 combat spells, 9 prayers, 7 quests, 7 shops, 6 stations, 6 arenas, plus skills/progression/rendering config.

1. **Embedded Manifest Editor:**
   - Tab in properties panel or separate panel mode
   - Form-based editing for structured manifests (NPCs, items, quests)
   - JSON editor fallback for advanced editing
   - Real-time validation with error highlighting
   - Cross-reference checking (e.g., NPC refers to valid item IDs)

2. **NPC Manifest Integration:**
   - Browse NPCs from manifest in placement palette
   - Edit NPC properties (stats, drops, dialogue) in properties panel
   - Create new NPC definition → automatically added to manifest
   - Changes tracked as part of world project
   - "Generate Dialogue" AI button (see Phase AI)
   - "Generate Voice" AI button (see Phase AI)

3. **Item Manifest Integration:**
   - Browse items when configuring drops, shops, quest rewards
   - Item picker with search/filter
   - Item stat preview on hover

4. **Quest Manifest Integration:**
   - Quest editor with stage builder
   - Link quest stages to placed NPCs (click NPC in viewport)
   - Visualize quest paths on map (giver → objectives → turnin)
   - "Generate Quest" AI assistant (see Phase AI)

5. **Store Manifest Integration:**
   - Shop inventory editor when selecting shopkeeper NPC
   - Item picker for adding shop stock
   - Price and buyback rate editors

6. **Station Manifest Integration:**
   - Station type editor (model, ground flattening, examine text)
   - Recipe browser showing what each station can craft

7. **Music Manifest Integration:**
   - Music track browser with playback preview
   - Assign tracks to music regions
   - "Generate Track" AI button (see Phase AI)

8. **Skill Resource Manifest Integration:**
   - Fishing spots (7 types with catch tables, tool requirements, cycle ticks)
   - Mining rocks (9 types with yield tables, gem drop rates 0.4%, depletion/respawn)
   - Woodcutting trees (17 types with 4 model variants each, hatchet tier gating)
   - Per-resource-type editors with level requirements, yields, respawn times
   - Visual placement linked to resource manifests

9. **Combat System Manifest Integration:**
   - **Combat spells** (8 spells in strike + bolt tiers): level requirements, base damage, XP, rune costs, elements
   - **Prayers** (9 prayers): drain rates, stat bonuses, conflicts, category grouping
   - **Runes** (6 types + 4 elemental staves): element mapping, stackability, staff infinite supply
   - **Ammunition** (5 arrow types): ranged strength bonuses, level requirements
   - Cross-reference validation: spell rune costs must reference valid rune IDs, staff rune types must match

10. **Recipe Manifest Integration (8 files, 167 recipes):**
    - Unified recipe editor organized by skill tab:
      - **Cooking** (12): raw→cooked→burnt, burn stop levels, fire vs range
      - **Smelting** (6): ore+coal→bar, success rates (50% iron, 100% others)
      - **Smithing** (72): bar→weapon/armor, organized by tier (bronze→rune) and type
      - **Crafting** (24): leather, studded, dragonhide, jewelry, gem cutting
      - **Fletching** (37): arrow shafts, bow stringing, arrow assembly
      - **Firemaking** (8): log→fire, XP scaling 40-303.8
      - **Runecrafting** (6): essence→rune, multi-rune level thresholds
      - **Tanning** (2): hide→leather with gold cost
    - Input/output item pickers (validates against items/* manifests)
    - Level requirement + XP reward editors
    - Tick duration sliders
    - "Add Recipe" creates entries in both recipe file AND items/* if output item doesn't exist

11. **Progression Manifest Integration:**
    - **Skill unlocks** (17 skills): level milestone editor with unlock descriptions
    - **Tier requirements** (melee/tools/ranged/magic): equipment level gate editor
    - **Tool priority** (20 tools): priority ordering, bonus tick mechanics for dragon/crystal
    - Cross-reference: tier requirements must match item requirements in items/*.json

12. **Arena & PvP Manifest Integration:**
    - **Duel arenas** (6 arenas): spawn positions, trapdoor positions, wall/floor colors
    - Lobby and hospital area editors
    - Visual placement of arenas in world viewport
    - Constants editor (countdown timer, respawn delay)

13. **Rendering Config Integration:**
    - **LOD settings**: distance thresholds (LOD1, imposter, fadeOut) per category (default, large_tree, small_bush)
    - Dissolve parameters (closeRangeStart/End, transitionDuration)
    - Live preview: adjust LOD distances and see vegetation pop-in change in viewport

14. **Manifest Editing Safety:**
    - `model-bounds.json` is **read-only** (auto-generated, protected by ManifestService) — show in browser but cannot edit
    - `buildings.json` is empty placeholder — mark as "future" in UI
    - `vegetation.json` is nearly empty — real data in biomes.json, warn if user tries to edit directly
    - All edits validated against TypeScript type schemas before save
    - Cross-reference validation across manifests (e.g., NPC drop tables reference valid item IDs, quest rewards reference valid items, shop inventories reference valid items)

### Phase 7: Audio Zone & AI Content Generation (3-4 weeks)

**Goal**: Spatial audio editing and AI-powered content creation integrated into the editor.

*This is a new combined phase — see Part 8 for full AI generation details.*

1. **Music Region Editor:**
   - Paint music zones on world map (similar to biome painting)
   - Each zone references a track from `music.json`
   - Transition blending between adjacent zones
   - Preview: walk through zones to hear crossfades
   - Combat music override per zone

2. **Ambient Sound Zones:**
   - Paint ambient zones (forest ambience, cave echoes, ocean waves, town bustle)
   - Layer multiple ambient tracks per zone
   - Distance-based falloff at zone edges
   - Preview in editor with spatial audio

3. **SFX Trigger Placement:**
   - Place point-source sounds (waterfall, fireplace, anvil clanging)
   - Properties: sound file, volume, radius, looping, 3D positioning
   - Visualize as speaker icons with radius circles

4. **AI Dialogue Generator** (inline in NPC properties):
   - Select NPC → "Generate Dialogue" button
   - Input: NPC role, personality, services, quest involvement
   - Output: Complete dialogue tree (nodes + responses + effects)
   - Uses GPT-5/Claude to write contextually appropriate dialogue
   - Human review: edit before accepting
   - Batch: generate dialogue for all NPCs in a town

5. **AI Voice Generator** (inline in NPC properties):
   - Select NPC with dialogue → "Generate Voice Lines" button
   - Auto-selects voice from ElevenLabs library matching NPC gender/personality
   - Generates audio for every dialogue node text
   - Preview playback in editor
   - Files saved to `generatedAudio.voiceClips[]` in project, deployed with staging push

6. **AI Music Generator** (inline in music region properties):
   - Select music region → "Generate Track" button
   - Input: mood (peaceful, tense, epic), biome context, duration
   - Uses ElevenLabs Music Service
   - Preview in editor
   - Add to `music.json` manifest when accepted

7. **AI SFX Generator** (inline in SFX trigger properties):
   - Select SFX trigger → "Generate Sound" button
   - Input: description ("crackling campfire", "distant thunder")
   - Uses ElevenLabs SFX Service (0.5-22s)
   - Preview and adjust
   - Save to project audio assets

8. **AI Quest Writer** (inline in quest editor):
   - "Generate Quest" button
   - Input: quest type, involved NPCs, difficulty, skill requirements, rewards
   - Output: Full quest definition with stages, objectives, dialogue links
   - Human review and edit
   - Links to placed NPCs in world

### Phase 8: Staging → Production Pipeline (2-3 weeks)

**Goal**: Safe deployment workflow with review, approval, and rollback.

1. **Push to Staging:**
   - Button in toolbar: "Push to Staging" (requires `staging:push` permission)
   - Compiles world project into manifest files:
     - `world-areas.json` (regenerated from placements + zones)
     - `biomes.json` (with overrides applied, includes vegetation layers)
     - `music.json` (with generated tracks + region data)
     - All other manifests (NPCs, items, quests, stores, stations, etc.)
   - Generates `world.json` (entity spawn definitions from placements — NPCs, stations, resources, props with position/rotation/type). **Critical**: server loads entities from world.json separately from manifests; without this file, placed entities won't appear in-game
   - Writes terrain chunk data (sculpts + tile overrides) to staging server's WorldChunkRepository via staging API (per 100m chunk, matching existing chunk storage format)
   - Copies generated audio files to `staging/assets/audio/`
   - Copies new model/texture assets to `staging/assets/`
   - Signals staging server to reload via admin API (graceful restart for MVP)
   - Records deployment in `world_deployments` with full diff

2. **Staging Server:**
   - Game server instance running with `WORLD_ASSETS_PATH=staging/assets`
   - Same game client can connect for testing
   - Environment variable: `HYPERSCAPE_ENV=staging`
   - Separate database (or shared DB with staging flag)

3. **Diff View:**
   - Side-by-side comparison: staging vs production manifests (all 38 files)
   - Grouped by category:
     - **World**: "2 areas modified", "5 tile overrides added", "3 terrain chunks sculpted"
     - **NPCs**: "3 NPCs added", "2 dialogue trees updated", "5 voice clips generated"
     - **Items**: "4 weapons added to items/weapons.json", "2 armor pieces modified"
     - **Combat**: "1 spell added", "2 prayers rebalanced"
     - **Quests**: "1 quest modified", "2 quest stages added"
     - **Recipes**: "3 smithing recipes added", "1 cooking recipe adjusted"
     - **Gathering**: "2 fishing spots moved", "1 mining rock added"
     - **Shops**: "1 store inventory updated"
     - **Audio**: "5 voice clips generated", "2 music tracks added", "3 SFX created"
     - **Config**: "LOD thresholds adjusted", "biome parameters changed"
   - Expandable details showing exact JSON changes per file
   - Visual diff on world map (highlight added/removed/moved entities)
   - Asset diff: new models, textures, audio files
   - Audio diff: listen to new/changed tracks

4. **Promote to Production:**
   - Button: "Publish to Production" (requires `prod:push` permission)
   - **Requires approval**: a second team member with `prod:approve` permission must approve
   - Approval flow: push creates a "pending promotion" → approver reviews diff → approves or rejects
   - On approval: archives current production, copies staging to production, signals server, creates deployment history

5. **Rollback:**
   - "Rollback" button in deployment history (requires `prod:push` permission)
   - Restores archived production manifests and assets
   - Hot-reloads production server
   - Creates rollback entry in history

6. **Deployment History:**
   - List of all deployments with timestamps, authors, approvers, changelogs
   - Click to view diff of that deployment
   - "Restore this version" button
   - Filterable by target (staging/production) and author

### Phase 9: Polish & Advanced Features (ongoing)

1. **Minimap:**
   - Top-down world overview in corner
   - Click to teleport camera
   - Shows entity density heatmap
   - Road network overlay
   - Biome color overlay

2. **Performance Profiling:**
   - Entity count per tile
   - Triangle budget warnings
   - Draw call analysis
   - LOD coverage visualization

3. **Automation:**
   - "Auto-populate" button: procedurally place NPCs/mobs/resources based on biome rules
   - "Balance check": validate difficulty zones have appropriate mob levels
   - "Quest graph": visualize quest dependencies and flow
   - "Audio coverage": highlight areas missing music/ambient assignments

4. **Day/Night & Weather Preview:**
   - Time-of-day slider to preview lighting at different hours
   - Weather toggle (rain, snow, fog, clear) for visual preview
   - Per-zone lighting overrides (caves always dark, etc.)

5. **Collaborative Editing (future):**
   - WebSocket-based real-time sync between editors
   - Operational transform or CRDT for conflict resolution
   - User cursors visible in viewport
   - Currently mitigated by edit locking (one editor at a time per project)

6. **Version Control Integration (future):**
   - Git integration for manifest files
   - Branch support (feature worlds)
   - Pull request workflow for world changes

---

## Part 5: Key Technical Decisions

### 5.1 WorldProject Storage Format

Store as a single JSON document in PostgreSQL JSONB column. Benefits:
- Atomic save/load (no partial states)
- Full-text search on content
- JSON diff for deployment comparison
- Export as file for backup

For large worlds, consider splitting terrain sculpt data and generated audio metadata into separate tables/BLOB storage.

### 5.2 Manifest Compilation

The world project stores structured data (placements, overrides, configs). At deployment time, this is compiled into game manifest format:

```
# ── PLACEMENT → WORLD DEFINITION ──────────────────────────────────────
WorldProject.placements.npcs[]          → world-areas.json starterTowns.{area}.npcs[] arrays
WorldProject.placements.resources[]     → world-areas.json starterTowns.{area}.resources[] arrays
WorldProject.placements.stations[]      → world-areas.json stations
WorldProject.placements.mobs[]          → world-areas.json mobSpawns
WorldProject.placements.spawnPoints[]   → world-areas.json spawn data
WorldProject.placements.teleportNodes[] → teleport-locations.json (new file if needed)
WorldProject.placements.farmingPatches[]→ gathering/farming.json (new file if needed)
WorldProject.placements.duelArenas[]    → duel-arenas.json (6 arenas + lobby/hospital)
WorldProject.placements (all entities)  → world.json (entity spawn definitions — server loads separately)

# ── WORLD CONFIG ──────────────────────────────────────────────────────
WorldProject.biomeConfig                → biomes.json (9 biomes, includes vegetation.layers[])
WorldProject.worldConfig                → TerrainHeightParams overrides (NOTE: no world-config.json file exists)
WorldProject.audioConfig                → music.json (20 tracks) + ambient zone data in world-areas.json
WorldProject.overrides.tileOverrides    → collision data in world-areas.json
WorldProject.overrides.terrainSculpts   → WorldChunkRepository chunk data (per 100m chunk)
WorldProject.lodConfig                  → lod-settings.json (LOD thresholds + dissolve params)

# ── NPC & DIALOGUE ────────────────────────────────────────────────────
WorldProject.manifests.npcs             → npcs.json (18 NPCs, 46KB, includes dialogue trees)
WorldProject.generatedAudio.voiceClips  → audio/voice/ files + NPC dialogue voice references

# ── ITEMS (8 files, 261+ items) ───────────────────────────────────────
WorldProject.manifests.items.weapons    → items/weapons.json (60 weapons: swords, daggers, axes, bows, staves)
WorldProject.manifests.items.armor      → items/armor.json (69 pieces: helmets, bodies, legs, gloves, boots)
WorldProject.manifests.items.tools      → items/tools.json (25 tools: hatchets, pickaxes, rods)
WorldProject.manifests.items.food       → items/food.json (12 cooked foods with heal amounts)
WorldProject.manifests.items.resources  → items/resources.json (69 resources: ores, logs, bars, hides, gems, herbs)
WorldProject.manifests.items.misc       → items/misc.json (14 misc: thread, needles, chisel, leather)
WorldProject.manifests.items.runes      → items/runes.json (6 rune items)
WorldProject.manifests.items.ammunition → items/ammunition.json (6 ammo items)

# ── SHOPS & STATIONS ──────────────────────────────────────────────────
WorldProject.manifests.stores           → stores.json (7 shops, 56KB)
WorldProject.manifests.stations         → stations.json (6 station types)

# ── COMBAT SYSTEM ─────────────────────────────────────────────────────
WorldProject.manifests.combatSpells     → combat-spells.json (8 spells: strike + bolt tiers)
WorldProject.manifests.prayers          → prayers.json (9 prayers with drain + stat bonuses)
WorldProject.manifests.runes            → runes.json (6 rune types + 4 elemental staves)
WorldProject.manifests.ammunition       → ammunition.json (5 arrow definitions with ranged strength)

# ── QUESTS ────────────────────────────────────────────────────────────
WorldProject.manifests.quests           → quests.json (7 quests with stages, rewards, NPC links)

# ── SKILLS & PROGRESSION ─────────────────────────────────────────────
WorldProject.manifests.skillUnlocks     → skill-unlocks.json (17 skills × level milestones)
WorldProject.manifests.tierRequirements → tier-requirements.json (melee/tools/ranged/magic level gates)
WorldProject.manifests.toolPriority     → tools.json (20 tool unlocks with priority ordering)

# ── GATHERING (3 files, 33 spots) ────────────────────────────────────
WorldProject.manifests.fishing          → gathering/fishing.json (7 spots with catch tables)
WorldProject.manifests.mining           → gathering/mining.json (9 rocks with yield tables + gem drops)
WorldProject.manifests.woodcutting      → gathering/woodcutting.json (17 trees with model variants)

# ── RECIPES (8 files, 167 recipes) ───────────────────────────────────
WorldProject.manifests.recipes.cooking      → recipes/cooking.json (12 recipes)
WorldProject.manifests.recipes.crafting     → recipes/crafting.json (24 recipes)
WorldProject.manifests.recipes.firemaking   → recipes/firemaking.json (8 recipes)
WorldProject.manifests.recipes.fletching    → recipes/fletching.json (37 recipes)
WorldProject.manifests.recipes.smelting     → recipes/smelting.json (6 recipes)
WorldProject.manifests.recipes.smithing     → recipes/smithing.json (72 recipes)
WorldProject.manifests.recipes.runecrafting → recipes/runecrafting.json (6 recipes)
WorldProject.manifests.recipes.tanning      → recipes/tanning.json (2 recipes)

# ── AUDIO ─────────────────────────────────────────────────────────────
WorldProject.generatedAudio.musicTracks     → audio/music/ files + music.json entries
WorldProject.generatedAudio.soundEffects    → audio/soundeffects/ files + SFX trigger data

# ── READ-ONLY (auto-generated, NOT compiled from WorldProject) ────────
model-bounds.json                       → 138 model bboxes (auto-generated by bounds tool, protected by ManifestService)
buildings.json                          → Currently empty placeholder (future: building definitions)
vegetation.json                         → Nearly empty (1 entry). Real data in biomes.json vegetation.layers[]
```

**Important architectural notes**:

1. **Vegetation data location**: `vegetation.json` is nearly empty (1 entry). All real vegetation configuration is embedded in `biomes.json` under each biome's `vegetation.layers[]` array. The manifest compiler should write vegetation data into biomes.json, not a separate vegetation file.

2. **No world-config.json**: `world-config.json` does not exist — procgen params are currently hardcoded in `TerrainHeightParams.ts` and `GameConstants.ts`. We may want to CREATE a `world-config.json` manifest to make these runtime-configurable, or store them only in the WorldProject.

3. **world.json entity export**: The game server loads entities from `world.json` separately from manifests — NPCs, stations, and world objects are spawned from this file at startup. The manifest compiler MUST also generate `world.json` from `WorldProject.placements` (NPCs, stations, resources, props with position/rotation/type), not just manifest JSONs. Without this, placed entities won't appear in the game.

4. **Chunk persistence**: `WorldChunkRepository` stores terrain modifications per 100m chunk (upserted with semaphore rate limiting). If the WorldProject includes terrain sculpts or tile overrides, the staging pipeline must also write chunk data to the staging server's chunk store — manifest files alone are insufficient for terrain modifications.

### 5.3 EditorWorld System Configuration

The unified editor needs all game systems plus editor systems:

```typescript
// Current createEditorWorld.ts (154 lines) already registers:
// ALWAYS: Stage, ClientGraphics, Environment, Wind, Settings, LODs
// ALWAYS: EditorCameraSystem, EditorSelectionSystem, EditorGizmoSystem
// CONDITIONAL: TerrainSystem, VegetationSystem, ProceduralGrassSystem,
//   ProceduralFlowerSystem, TownSystem+POISystem, RoadNetworkSystem,
//   BuildingRenderingSystem, ProceduralTownLandmarksSystem

// NEEDS ADDING to createEditorWorld options:
createEditorWorld({
  viewport: containerElement,
  // Already supported:
  enableTerrain: true,       // TerrainSystem (procedural heightmap + biomes)
  enableVegetation: true,    // VegetationSystem (GPU-instanced, LOD)
  enableGrass: true,         // ProceduralGrassSystem
  enableFlowers: true,       // ProceduralFlowerSystem
  enableTowns: true,         // TownSystem + POISystem (9 POI categories)
  enableRoads: true,         // RoadNetworkSystem (MST + A* + Chaikin)
  enableBuildings: true,     // BuildingRenderingSystem
  enableTownLandmarks: true, // ProceduralTownLandmarksSystem
  // Systems that EXIST but need wiring into EditorWorld:
  enableWater: true,         // WaterSystem (AAA: Gerstner waves, GGX, Beer-Lambert, SSS, foam)
  enableBridges: true,       // BridgeSystem (procedural deck + fencing + pillars + collision)
  enableDocks: true,         // ProceduralDocks (posts + planks + fence + collision)
  enableRiver: true,         // RiverDefinition (18-waypoint river with terrain carving)
  // NEW editor overlays (must be built):
  enableTileGrid: false,     // Toggle: show 1m tile grid
  enableCollisionOverlay: false,  // Toggle: show walkability (8-directional walls + WATER/STEEP/BRIDGE/DOCK flags)
  enableBiomeOverlay: false,      // Toggle: show biome colors
  enableDifficultyOverlay: false, // Toggle: show difficulty zones
  enableAudioZoneOverlay: false,  // Toggle: show music/ambient regions
  enableSpawnOverlay: false,      // Toggle: show spawn points
  enableTeleportOverlay: false,   // Toggle: show teleport network
  enableWorldBoundary: false,     // Toggle: show island mask boundary (788-unit radius)
  enablePOIOverlay: false,        // Toggle: show POI markers with category icons
})
```

### 5.4 Overlay System

Non-destructive visualizations toggled via View menu:

| Overlay | Purpose |
|---------|---------|
| Tile Grid | 1m grid for tile-level editing |
| Collision | Green=walkable, Red=blocked, Yellow=wall edges |
| Biomes | Color-coded biome regions |
| Difficulty | Level zones with number labels |
| Roads | Road network highlight |
| Spawn Radii | Mob spawn zone spheres |
| Safe Zones | Town safe zone circles |
| NPC Labels | Floating name labels on NPCs |
| Resource Labels | Resource type labels |
| Music Zones | Color-coded music region boundaries |
| Ambient Zones | Ambient sound region outlines |
| SFX Points | Speaker icons at sound trigger locations |
| Spawn Points | Player spawn/respawn location markers |
| Teleport Network | Teleport node connections graph |
| Water Bodies | Water level and river path visualization |
| World Boundary | Island mask ring (788-unit radius) with out-of-bounds warning |
| POI Network | POI markers with category icons + road connections |

### 5.5 Tile System Integration

All placements snap to the 1m tile grid:
- NPCs snap to tile center (x+0.5, z+0.5)
- Buildings register multi-tile footprints
- Collision flags set automatically from building footprints
- Manual tile editing for fine-tuning walkability
- Height override per tile (for bridges, docks)

### 5.6 Audio Asset Delivery

Generated audio files follow the same staging → production pipeline as other assets:

```
Editor generates voice clip
  → Saved to project generatedAudio store (temporary)
  → On "Push to Staging": copied to staging/assets/audio/voice/{npcId}/
  → On "Promote to Prod": copied to world/assets/audio/voice/{npcId}/
  → Game client loads via asset:// URI scheme (CDN-friendly)
```

Music tracks follow the same pattern but go to `audio/music/{category}/`.

### 5.7 Engineering Standards (Super-Audit Compliance)

The World Studio must meet the following standards, aligned with the project's established super-audit criteria. These are non-negotiable implementation requirements, not aspirational.

#### 5.7.1 Input Validation & API Security (OWASP)

All World Studio API endpoints use **TypeBox schemas** (existing Asset Forge pattern in `server/models.ts`):

```typescript
// Every route input validated with TypeBox — no raw body access
const WorldProjectInput = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  world_data: t.Object({...}),  // Structured, not arbitrary JSON
  team_id: t.String({ format: 'uuid' }),
  game_id: t.String({ format: 'uuid' }),
});

// Enums as Literal unions — no arbitrary strings accepted
const DeployTarget = t.Union([t.Literal('staging'), t.Literal('production')]);
```

**Requirements:**
- **All inputs validated** via TypeBox in Elysia route definitions (matches existing `placements.ts` pattern)
- **No raw JSON body access** — everything through validated schemas
- **ID fields**: `t.String({ minLength: 1 })` minimum — no empty strings
- **Coordinate fields**: `t.Number()` with min/max bounds matching world size (0-10000)
- **Enum fields**: `t.Union([t.Literal(...)])` — never `t.String()` for fixed value sets
- **File paths**: Validated against allowlist patterns — no path traversal (`../`)
- **SQL injection**: Prevented by Drizzle ORM parameterized queries (never raw SQL)
- **XSS**: Manifest content sanitized on display in editor (React's JSX escaping + no `dangerouslySetInnerHTML`)
- **CSRF**: Privy token in Authorization header (not cookies) — CSRF not applicable
- **Rate limiting**: Existing 100 req/min global limit applies. Deploy endpoints get additional per-endpoint limits (1 staging push per 30s, 1 prod push per 5min)
- **Error responses**: Structured `{ error: string, details?: string }` — no stack traces in production (matches `errorHandler.ts` pattern)

#### 5.7.2 Manifest Schema Validation Pipeline

Current validation is minimal (top-level structure checks only). The World Studio requires **deep validation at every stage**:

```
EDITOR (client-side)      → Real-time validation as user edits
  ↓                         TypeScript types catch compile-time errors
SAVE (API)                → TypeBox validates API input structure
  ↓                         ManifestService validates manifest format
COMPILE (pre-deployment)  → Deep cross-reference validation before staging push
  ↓                         Every ID reference checked against every manifest
DEPLOY (staging/prod)     → Final integrity check after files written
                            DataManager.validateCrossReferences() on reload
```

**Deep Cross-Reference Validation (must implement for manifest compiler):**

| Source Field | Must Reference | Validation |
|-------------|---------------|------------|
| NPC `drops[].itemId` | `items/*.json` item IDs | Every drop item must exist |
| Store `items[].id` | `items/*.json` item IDs | Every shop item must exist |
| Quest `rewards[].itemId` | `items/*.json` item IDs | Every reward item must exist |
| Quest `stages[].npcId` | `npcs.json` NPC IDs | Every quest NPC must exist |
| Biome `mobs[].npcId` | `npcs.json` NPC IDs | Biome mobs must be valid NPCs |
| World area `npcs[].id` | `npcs.json` NPC IDs | Placed NPCs must be defined |
| World area `stations[].type` | `stations.json` station types | Station types must exist |
| Combat spell `runeCost[].runeId` | `runes.json` rune IDs | Spell runes must exist |
| Recipe `input[].itemId` | `items/*.json` item IDs | Recipe inputs must exist |
| Recipe `output.itemId` | `items/*.json` item IDs | Recipe outputs must exist |
| Tool `itemId` | `items/tools.json` item IDs | Tool unlock must reference valid tool |
| Tier requirement `items` | `items/*.json` item IDs | Tier items must exist |

**Validation result format** (extends existing `DataValidationResult`):
```typescript
interface ManifestValidationResult {
  valid: boolean;
  errors: { path: string; message: string; severity: 'error' | 'warning' }[];
  crossRefErrors: { source: string; field: string; referencedId: string; targetManifest: string }[];
}
```

**Blocking behavior**: Staging push BLOCKED if any `severity: 'error'`. Warnings shown but don't block. Production push BLOCKED if any errors OR unresolved warnings.

#### 5.7.3 PostgreSQL Discipline

New tables (teams, games, forge_users, world_projects, world_deployments, team_members, team_invites, team_permissions, audit_log) follow these rules:

**Connection Management:**
- Use existing Drizzle + postgres-js pattern from `db/db.ts`: `max: 20, idle_timeout: 20, connect_timeout: 10`
- Graceful shutdown: `process.on("SIGINT", () => queryClient.end())`
- Optional DB pattern: `isDatabaseEnabled` flag when DATABASE_URL not set — World Studio falls back to IndexedDB-only mode

**Transaction Discipline:**
- World project save: single transaction wrapping `UPDATE world_projects` + `INSERT world_deployments` (if deploying)
- Team member changes: transaction for `UPDATE team_members` + `INSERT audit_log`
- Production push: transaction for archive + copy + deployment record — rollback ALL if any step fails
- Read-only queries (project list, audit log) use `readOnly: true` on transaction

**Indexes (beyond primary keys):**
```sql
CREATE INDEX idx_projects_team_game ON world_projects(team_id, game_id);
CREATE INDEX idx_projects_updated ON world_projects(updated_at DESC);
CREATE INDEX idx_deployments_project ON world_deployments(project_id, deployed_at DESC);
CREATE INDEX idx_deployments_game_target ON world_deployments(game_id, target, deployed_at DESC);
CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_audit_team ON audit_log(team_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_invites_token ON team_invites(token);
CREATE INDEX idx_invites_email ON team_invites(email, team_id);
CREATE INDEX idx_forge_users_privy ON forge_users(privy_user_id);
```

**Migration Strategy:**
- Drizzle migrations in `packages/asset-forge/server/db/migrations/`
- Migration files are versioned and reversible
- WorldProject `world_data` JSONB includes a `schemaVersion` field — migration functions per version
- Schema evolution: add migration function per version bump, run on load if `schemaVersion < CURRENT_VERSION`

#### 5.7.4 GPU Resource & Scene Cleanup

The World Studio viewport uses EditorWorld. Resource management follows the existing `EditorWorldContext.tsx` pattern:

**Requirements:**
- EditorWorld stored in `useRef` (not React state) — no re-renders during tick loop
- `requestAnimationFrame` loop tracked with `useRef` for frame ID
- **Cleanup on unmount**: `cancelAnimationFrame(id)` → `world.destroy()` → null all refs
- **Cleanup on mode switch** (creation → editing): `reinitialize()` calls destroy first
- **Overlay disposal**: All overlay meshes (tile grid, collision, biome colors, audio zones) added to a `disposables` set — `.dispose()` called on all geometries, materials, textures when overlays toggled off or component unmounts
- **Brush preview mesh**: Single reusable mesh, resized on brush change — NOT created per frame
- **Placement ghost**: Single reusable ghost mesh, swapped when entity type changes — disposed on mode exit
- **No allocations in hot paths**: Brush application, overlay updates, and selection highlight use pre-allocated vectors/quaternions (existing pattern in CombatSystem: `_attackerTile`, `_targetTile` pools)

#### 5.7.5 UI Framework Integration

**Game loop decoupled from React:**
- EditorWorld tick runs via `requestAnimationFrame` — independent of React reconciliation
- World state changes (selection, camera position) flow through refs and event listeners, NOT React state
- React state updates only for: panel content, toolbar state, hierarchy tree — things that need re-renders
- **No React state for**: camera position, gizmo transform, selection highlight, brush preview position
- `useEditorWorldSync` hook subscribes to EditorWorld events and batches React state updates via `requestAnimationFrame` callback — prevents mid-frame re-renders

**Component unmount safety:**
- All event listeners registered in `useEffect` with cleanup returns
- All intervals/timeouts cleared on unmount
- All async operations check `mountedRef.current` before setting state
- EditorWorld `onError` callback shows error in UI without crashing React tree (ErrorBoundary wraps viewport)

#### 5.7.6 Testing Strategy

**Unit Tests** (Vitest, in `packages/asset-forge/tests/unit/`):
- `worldStudioContext.test.ts` — All 60+ reducer actions, undo/redo, state transitions
- `manifestCompiler.test.ts` — WorldProject → all 38 manifest files, cross-reference validation, world.json generation
- `deploymentService.test.ts` — Staging push, production promote, rollback, diff generation
- `permissionService.test.ts` — Role resolution, permission overrides, team scoping
- `assetValidation.test.ts` — GLB parse, texture validation, audio format checks

**Integration Tests** (Vitest, real services):
- `worldProjectAPI.test.ts` — CRUD operations, locking, versioning, team scoping
- `manifestValidation.test.ts` — Deep cross-reference validation across all 38 manifests (extend existing `manifest-validation.test.ts` pattern)

**E2E Tests** (Playwright, in `packages/asset-forge/tests/e2e/`):
- `world-studio-creation.spec.ts` — New World dialog → generate → editing mode
- `world-studio-editing.spec.ts` — Place NPC → edit properties → save
- `world-studio-deployment.spec.ts` — Push to staging → diff view → approve
- Visual regression: Screenshot comparisons for hierarchy panel, properties panel, toolbar states

**No mocks** — follows CLAUDE.md mandate. Tests use real Vitest + real browser (Playwright).

#### 5.7.7 SOLID Compliance

| Principle | Application |
|-----------|-------------|
| **Single Responsibility** | Each editor component (NPCEditor, QuestEditor, etc.) handles ONE entity type. ManifestCompiler only compiles. DeploymentService only deploys. No god objects. |
| **Open/Closed** | New entity types added by creating a new editor component + registering in the properties panel router — existing editors untouched. |
| **Liskov Substitution** | All editor components implement a common `EntityEditor` interface (`{entityType, entityId, onSave, onDelete}`) — swappable in the properties panel. |
| **Interface Segregation** | Hooks expose narrow interfaces: `useEditorCamera()` returns only camera methods, `useEditorSelection()` returns only selection methods — not the entire world. |
| **Dependency Inversion** | WorldStudioContext depends on abstract `WorldProjectStore` interface (backed by IndexedDB locally, PostgreSQL on server). Swappable without changing consumers. |

#### 5.7.8 Manifest-Driven Architecture Standards

| Requirement | Implementation |
|-------------|---------------|
| **No hardcoded game data in code** | All NPC stats, item values, recipe ingredients come from manifests. Editor reads manifests, never hardcodes fallback values. |
| **Schema validation at build + load + deploy time** | TypeBox schemas for API input. ManifestService validators for write. Deep cross-ref validation before deploy. DataManager validates on server reload. |
| **Type generation from schemas** | Existing TypeScript types in `shared/types/` used at compile time. Runtime validation uses TypeBox (not duplicated Zod schemas). |
| **Referential integrity** | See 5.7.2 cross-reference table. Blocking validation before staging push. |
| **No magic values** | Editor reads all dropdown options, level requirements, and constraints from manifests — not hardcoded arrays. |
| **Manifest diffing** | JSON diff computed before every deployment. Human-readable changelog. Visual diff in UI. |
| **Hot reload (MVP: restart)** | Staging server restart on push. Editor auto-detects restart completion via health check polling. |

#### 5.7.9 Idempotency & Atomicity

- **World project save**: Idempotent — saving the same data twice produces the same result. Uses `ON CONFLICT (id) DO UPDATE` with version check.
- **Staging push**: Idempotent — pushing the same world version to staging is a no-op if already deployed (checked via `world_deployments` table).
- **Production promote**: NOT idempotent by design — each promotion creates a new deployment record with unique ID. But the archive step is idempotent (archiving already-archived data is harmless).
- **Rollback**: Idempotent — rolling back to an already-active version is a no-op.
- **All deployment operations**: Wrapped in database transactions. If file copy fails, DB transaction rolls back. If DB commit fails, file changes cleaned up. No partial states.

#### 5.7.10 Error Handling & Resilience

```
WorldStudioPage
├── ErrorBoundary (catches React rendering errors → shows recovery UI)
│   ├── Viewport
│   │   └── EditorWorld onError → shows error toast, viewport keeps running
│   ├── Left Sidebar
│   │   └── Component errors → sidebar shows error state, other panels unaffected
│   └── Right Sidebar
│       └── Component errors → sidebar shows error state, other panels unaffected
```

- **Panel isolation**: Each panel (hierarchy, properties, asset browser, manifests) is wrapped in its own ErrorBoundary. One panel crashing doesn't take down the others.
- **Auto-save resilience**: If IndexedDB write fails, retry 3 times with exponential backoff. If all fail, show persistent warning banner (not a blocking modal).
- **API failure**: Network errors show toast notification with retry button. Editor continues working in offline mode (IndexedDB).
- **EditorWorld crash**: If WebGPU context is lost, show recovery prompt. User can reinitialize viewport without losing state (state is in WorldStudioContext, not in EditorWorld).
- **Deployment failure**: If staging push fails mid-operation, cleanup partial files. Show what succeeded and what failed. Allow retry.

### World Editing Flow

```
User edits in World Studio
  → WorldBuilderContext dispatch (action)
  → Permission check (user has project:edit for this game/team)
  → Reducer updates world state
  → EditorWorld systems re-render affected areas
  → Auto-save to IndexedDB (every 2s)
  → Explicit "Save" → API (with auth token) → PostgreSQL
```

### AI Content Generation Flow

```
User selects NPC → clicks "Generate Dialogue"
  → API call to /api/ai/dialogue/generate
  → Permission check (user has ai:generate)
  → GPT-5/Claude generates dialogue tree JSON
  → Returns to editor as draft
  → User reviews, edits, accepts
  → Dialogue saved to NPC in WorldProject
  → User clicks "Generate Voice Lines"
  → API call to /api/voice/batch
  → ElevenLabs generates audio for each node
  → Audio files saved to project generatedAudio store
  → On staging push: audio files copied to staging/assets/audio/voice/
```

### Deployment Flow

```
User clicks "Push to Staging"
  → Permission check (user has staging:push for this game)
  → API compiles WorldProject → manifest files + asset files
  → Copies generated audio to staging/assets/audio/
  → Writes to staging/assets/ directory
  → POST /api/admin/reload-manifests to staging server
  → Staging server DataManager reloads
  → Staging game spawns entities from new manifests
  → User connects to staging for testing
  → User clicks "Publish to Production"
  → Permission check (user has prod:push)
  → Creates pending promotion request
  → Second team member with prod:approve reviews diff
  → On approval:
    → API archives current production manifests + assets
    → API copies staging to production
    → POST /api/admin/reload-manifests to production server
    → Production world updates live
```

### Manifest Compilation Flow (all 38 files)

```
WorldProject
  │
  │ ── WORLD DEFINITION (placements → area/entity files) ──
  ├─ placements.npcs[] ──────────→ Grouped by area bounds
  ├─ placements.resources[] ─────→ into world-areas.json (13KB)
  ├─ placements.stations[] ──────→ sections
  ├─ placements.mobs[] ─────────→
  ├─ placements.spawnPoints[] ──→ world-areas.json spawn data
  ├─ placements.teleportNodes[]─→ teleport-locations.json
  ├─ placements.duelArenas[] ───→ duel-arenas.json (6 arenas)
  ├─ placements (all entities) ─→ world.json (entity spawn file — separate from manifests)
  │
  │ ── WORLD CONFIG ──
  ├─ biomeConfig[] ──────────────→ biomes.json (9 biomes + embedded vegetation layers)
  ├─ worldConfig ────────────────→ (no file — code-level TerrainHeightParams.ts constants)
  ├─ audioConfig.musicRegions[] ─→ music.json (20 tracks + region assignments)
  ├─ lodConfig ──────────────────→ lod-settings.json (LOD thresholds + dissolve)
  │
  │ ── NPCs & DIALOGUE ──
  ├─ manifests.npcs ─────────────→ npcs.json (18 NPCs, 46KB, dialogue trees)
  │
  │ ── ITEMS (8 files, 261+ items) ──
  ├─ manifests.items.weapons ────→ items/weapons.json (60 weapons)
  ├─ manifests.items.armor ──────→ items/armor.json (69 pieces)
  ├─ manifests.items.tools ──────→ items/tools.json (25 tools)
  ├─ manifests.items.food ───────→ items/food.json (12 foods)
  ├─ manifests.items.resources ──→ items/resources.json (69 resources)
  ├─ manifests.items.misc ───────→ items/misc.json (14 misc)
  ├─ manifests.items.runes ──────→ items/runes.json (6 rune items)
  ├─ manifests.items.ammunition ─→ items/ammunition.json (6 ammo items)
  │
  │ ── SHOPS & STATIONS ──
  ├─ manifests.stores ───────────→ stores.json (7 shops, 56KB)
  ├─ manifests.stations ─────────→ stations.json (6 station types)
  │
  │ ── COMBAT ──
  ├─ manifests.combatSpells ─────→ combat-spells.json (8 spells)
  ├─ manifests.prayers ──────────→ prayers.json (9 prayers)
  ├─ manifests.runes ────────────→ runes.json (6 runes + 4 staves)
  ├─ manifests.ammunition ───────→ ammunition.json (5 arrow defs)
  │
  │ ── QUESTS ──
  ├─ manifests.quests ───────────→ quests.json (7 quests)
  │
  │ ── SKILLS & PROGRESSION ──
  ├─ manifests.skillUnlocks ─────→ skill-unlocks.json (17 skills)
  ├─ manifests.tierRequirements ─→ tier-requirements.json
  ├─ manifests.toolPriority ─────→ tools.json (20 tool unlocks)
  │
  │ ── GATHERING (3 files, 33 spots) ──
  ├─ manifests.fishing ──────────→ gathering/fishing.json (7 spots)
  ├─ manifests.mining ───────────→ gathering/mining.json (9 rocks)
  ├─ manifests.woodcutting ──────→ gathering/woodcutting.json (17 trees)
  │
  │ ── RECIPES (8 files, 167 recipes) ──
  ├─ manifests.recipes.cooking ──→ recipes/cooking.json (12)
  ├─ manifests.recipes.crafting ─→ recipes/crafting.json (24)
  ├─ manifests.recipes.firemaking→ recipes/firemaking.json (8)
  ├─ manifests.recipes.fletching ─→ recipes/fletching.json (37)
  ├─ manifests.recipes.smelting ──→ recipes/smelting.json (6)
  ├─ manifests.recipes.smithing ──→ recipes/smithing.json (72)
  ├─ manifests.recipes.runecrafting→ recipes/runecrafting.json (6)
  ├─ manifests.recipes.tanning ───→ recipes/tanning.json (2)
  │
  │ ── AUDIO FILES ──
  ├─ generatedAudio.voiceClips──→ audio/voice/{npcId}/ files
  ├─ generatedAudio.musicTracks─→ audio/music/{category}/ files
  ├─ generatedAudio.soundEffects→ audio/soundeffects/ files
  │
  │ ── TERRAIN DATA ──
  └─ overrides.terrainSculpts[] ─→ WorldChunkRepository chunk data
    + overrides.tileOverrides      (per 100m chunk, upserted via staging API)

  ── READ-ONLY (not compiled from WorldProject) ──
  model-bounds.json ─────────────→ Auto-generated (138 model bboxes), protected
  buildings.json ────────────────→ Empty placeholder
  vegetation.json ───────────────→ Nearly empty (real data in biomes.json)
```

**Total: 36 compiled manifest files + world.json + chunk data = 38 outputs**
(model-bounds.json and buildings.json are read-only/empty, vegetation.json compiled into biomes.json)

---

## Part 7: Asset Pipeline Integration

### 7.1 The Problem

Currently there are two disconnected asset worlds:
- **Asset Forge generated assets** (`packages/asset-forge/gdd-assets/`) — AI-generated and hand-crafted models, textures, sprites from the AssetForge tool
- **Game production assets** (`packages/server/world/assets/`) — The actual models, textures, manifests, and data that the Hyperscape game server loads and serves to clients

There is no pipeline connecting them. Assets generated in Asset Forge cannot flow into the game, and game assets are not browsable/usable from the World Builder.

### 7.2 Directory Structure

```
packages/
├── asset-forge/
│   └── gdd-assets/              # FORGE SOURCE — AI-generated and hand-crafted
│       ├── models/              # Generated 3D models (GLB)
│       ├── textures/            # Generated textures
│       ├── sprites/             # Batch sprite outputs
│       └── audio/               # Generated audio (voice, music, sfx)
├── server/
│   ├── world/
│   │   └── assets/              # PRODUCTION — read-only from app perspective
│   │       ├── manifests/       # 23+ production manifest JSON files
│   │       ├── models/          # Production 3D models
│   │       ├── textures/
│   │       ├── animations/
│   │       └── audio/
│   │           ├── music/       # intro/, normal/, combat/
│   │           ├── soundeffects/
│   │           └── voice/       # Per-NPC voice directories
│   └── staging/
│       └── assets/              # STAGING — app writes here first
│           ├── manifests/
│           ├── models/
│           ├── textures/
│           ├── audio/
│           ├── world-chunks/
│           └── .staging-meta.json
```

### 7.3 Asset Flow: Forge → Staging → Production

```
┌───────────────────────┐
│  Asset Forge          │
│  (gdd-assets/)        │
│                       │
│  Generate models,     │
│  textures, sprites,   │
│  audio (voice/music/  │
│  sfx)                 │
└───────────┬───────────┘
            │ "Add to Hyperscape" button
            │ (validates + copies)
            ▼
┌───────────────────────┐
│  Staging              │
│  (staging/assets/)    │
│                       │
│  + manifest entry     │
│  + model file         │
│  + texture files      │
│  + audio files        │
└───────────┬───────────┘
            │ "Promote to Production" button
            │ (diff review + approval + confirmation)
            ▼
┌───────────────────────┐
│  Production           │
│  (server/world/       │
│   assets/)            │
│                       │
│  Live game assets     │
└───────────────────────┘
```

Each promotion step:
1. **Copy files** to target directory
2. **Update manifests** if the asset needs a manifest entry (e.g., new item → items.json, new NPC model → npcs.json, new music → music.json)
3. **Validate** the asset (GLB integrity, manifest schema, texture dimensions, audio format)
4. **Record** the change in staging metadata
5. **Preview** in staging server before final promotion

### 7.4 Unified Asset Browser

A panel in the World Builder that shows ALL available assets from all three sources:

- **Production assets** — from `packages/server/world/assets/`, displayed with a "Prod" badge
- **Staging assets** — from `packages/server/staging/assets/`, displayed with a "Staging" badge (new/modified only)
- **Forge assets** — from `packages/asset-forge/gdd-assets/`, displayed with a "Forge" badge

Features:
- Filter by source (Prod / Staging / Forge)
- Filter by type (Model, Texture, Audio, Manifest)
- Filter by category (Characters, Equipment, Environment, Props, Music, Voice, SFX)
- Search by name
- 3D model preview on hover/click
- Texture preview
- Audio playback preview
- Manifest entry summary
- **Drag-and-drop** from Asset Browser into 3D viewport to place

### 7.5 Asset Validation

Before any asset enters staging:
- **Models (GLB)**: Parse check, vertex count limits, material validation, LOD availability check
- **Textures**: Power-of-two dimensions, format check (PNG/KTX2), file size limits
- **Audio**: Format check (MP3/OGG/WAV), duration limits, sample rate validation
- **Manifests**: JSON schema validation against TypeScript type definitions
- **Naming conventions**: Enforce consistent kebab-case naming
- **Duplicate detection**: Check if an asset with same name already exists in target

### 7.6 Asset API Endpoints

```
GET    /api/assets/production          — List all production assets (cached, refreshed on change)
GET    /api/assets/staging             — List all staging assets
GET    /api/assets/forge               — List all Asset Forge generated assets
POST   /api/assets/promote-to-staging  — Copy forge asset → staging (with validation)
POST   /api/assets/promote-to-prod     — Copy staging asset → production (with backup)
GET    /api/assets/preview/:source/:path — Serve asset file for 3D/audio preview
POST   /api/assets/validate            — Validate asset before promotion
GET    /api/assets/diff                — Diff between staging and production assets
DELETE /api/assets/staging/:path       — Remove asset from staging
```

### 7.7 Integration with Generators

The existing generator pages (TreeGen, RockGen, BuildingGen, DockGen, etc.) gain a new flow:

1. User generates an asset in any generator page
2. New "Add to Hyperscape" button appears alongside existing "Export GLB"
3. Clicking it:
   - Validates the generated GLB
   - Copies it to `staging/assets/models/environment/`
   - Optionally creates a manifest entry (e.g., vegetation.json entry for a new tree)
   - Shows confirmation with staging preview
4. Asset is now available in the World Builder's Asset Browser under "Staging"
5. Can be placed in the world and will deploy with the next staging push

### 7.8 Tasks

- [ ] Create `packages/server/staging/assets/` directory structure with `.gitkeep`
- [ ] Build unified Asset Browser panel component
- [ ] Implement asset file serving API for all three sources (prod, staging, forge)
- [ ] Add "Add to Hyperscape" button to all generator pages
- [ ] Implement asset validation service (GLB parse, texture check, audio check, schema validation)
- [ ] Add forge → staging promotion flow with validation
- [ ] Add staging → production promotion flow with backup + diff review
- [ ] Add drag-and-drop from Asset Browser to world viewport
- [ ] Create 3D model preview component for Asset Browser
- [ ] Create audio preview/playback component for Asset Browser
- [ ] Wire staging asset tracking into `.staging-meta.json`
- [ ] Add asset diff view (new/modified/deleted between staging and prod)

---

## Part 8: AI Content Generation Pipeline

### 8.1 Overview

The codebase already has three ElevenLabs services (voice, SFX, music) and OpenAI/Anthropic integrations — but they're standalone API endpoints, not integrated into the World Builder workflow. This section describes wiring them into the editor as first-class content creation tools.

### 8.2 Existing AI Services

| Service | File | API | Status |
|---------|------|-----|--------|
| NPC Voice (TTS) | `ElevenLabsVoiceService.ts` | `/api/voice/*` | Built. TTS works. Speech-to-speech & voice design NOT implemented (throw errors). |
| Sound Effects | `ElevenLabsSoundEffectsService.ts` | `/api/sfx/*` | Built, needs editor integration |
| Music Composition | `ElevenLabsMusicService.ts` | `/api/music/*` | Partially built. `generateMusic()` works. `createCompositionPlan()` is **FAKE** (returns hardcoded data, doesn't call API). |
| **NPC/Quest/Dialogue/Lore Gen** | **`ContentGenerationService.ts`** | **`/api/content-generation`** | **Already built!** AI-powered NPC, quest, dialogue, and lore generation exists as a service + route module. Needs editor UI integration. |
| 3D Model Generation | `AICreationService.ts` (MeshyAI) | `/api/generation/*` | Built, has generator pages. Supports image-to-3D, retexturing, rigging, PBR. |
| AI SDK | `AISDKService.ts` | Internal | Built. OpenAI via Vercel AI SDK / Cloudflare AI Gateway. Note: references placeholder model IDs. |
| Concept Art | OpenAI integration | Internal | Built |
| AI NPC Agents | ElizaOS framework (`AgentManager.ts`) | Server-side | Built. Supports OpenAI, Anthropic, Groq, OpenRouter, Ollama. 20+ context providers, 30+ actions. |

**Existing voice audio**: 2 NPCs have generated voice clips in `world/assets/audio/voice/` (luna_herbalist with 7 clips, one procedural set with 3 clips). Voice profiles include ElevenLabs voice ID, model settings, and metadata.

### 8.3 AI Services to Build or Extend

#### AI Dialogue Writer (extend existing ContentGenerationService)

**Purpose**: Generate complete NPC dialogue trees using LLMs. The `ContentGenerationService` and `/api/content-generation` route already exist — this work is extending them with structured output matching the game's `NPCDialogueTree` type and integrating into the editor UI.

```
POST /api/content-generation/dialogue
  Body: {
    npcName: string,
    npcRole: "banker" | "shopkeeper" | "quest_giver" | "guard" | "trainer" | ...,
    personality: string,           // "gruff but kind old blacksmith"
    services: string[],            // ["bank", "shop", "quest:cooksAssistant"]
    questContext?: {               // If NPC is involved in quests
      questId: string,
      npcRole: "giver" | "helper" | "turnin",
      questSummary: string
    },
    worldContext?: {               // Where this NPC lives
      townName: string,
      biome: string,
      nearbyNPCs: string[]
    },
    tone: "medieval" | "casual" | "formal" | "humorous",
    model: "gpt-5" | "claude-opus-4-6"  // LLM choice
  }
  Response: {
    dialogueTree: NPCDialogueTree,  // Matches existing game types exactly
    suggestions: string[]            // Alternative dialogue approaches
  }
```

**Implementation:**
- System prompt includes Hyperscape dialogue format spec, existing NPC examples from `npcs.json`
- Output validated against `NPCDialogueTree` TypeScript type
- Effects auto-linked: if NPC has bank service → dialogue includes openBank effect
- Quest-aware: generates quest-stage dialogue overrides automatically

#### AI Quest Writer (extend existing ContentGenerationService)

**Purpose**: Generate complete quest definitions. The ContentGenerationService already has quest generation — extend with structured output matching game types and spatial awareness.

```
POST /api/content-generation/quest
  Body: {
    questType: "fetch" | "kill" | "gather" | "escort" | "explore" | "craft" | "puzzle",
    difficulty: "beginner" | "intermediate" | "advanced" | "master",
    involvedNPCs: { id: string, name: string, role: string }[],
    skills?: string[],             // Required skills
    rewards?: { type: string, amount?: number }[],
    worldContext: {
      area: string,                // World area where quest takes place
      biome: string,
      nearbyResources: string[]
    },
    model: "gpt-5" | "claude-opus-4-6"
  }
  Response: {
    quest: QuestDefinition,         // Full quest with stages, objectives, rewards
    npcDialogueUpdates: Record<string, NPCDialogueTree>,  // Updated dialogue for involved NPCs
    suggestedPlacements: Placement[]  // Suggested new objects to place (quest items, markers)
  }
```

#### AI World Population Assistant

**Purpose**: Suggest NPC/mob/resource placements based on biome, difficulty zone, and game balance rules.

```
POST /api/ai/populate/suggest
  Body: {
    area: WorldArea,               // Area bounds + biome
    difficultyLevel: number,
    existingPlacements: Placement[],
    rules: {
      maxNPCs: number,
      maxMobSpawns: number,
      requiredServices: string[],  // e.g., ["bank", "shop"] for towns
    }
  }
  Response: {
    suggestions: {
      npcs: NPCPlacement[],
      mobs: MobSpawnPlacement[],
      resources: ResourcePlacement[],
      rationale: string            // Why these placements make sense
    }
  }
```

### 8.4 AI Generation Workflow in Editor

**NPC Dialogue + Voice Generation (end-to-end):**

```
1. User places NPC in world
2. User fills in: name, role, personality, services
3. User clicks "Generate Dialogue" in properties panel
   → LLM generates dialogue tree
   → Preview in dialogue tree viewer
   → User edits/adjusts
   → "Accept" saves to NPC manifest entry
4. User clicks "Generate Voice Lines"
   → System auto-selects ElevenLabs voice matching NPC traits
   → Batch generates audio for every dialogue node
   → Progress bar in properties panel
   → Preview playback for each line
   → "Accept All" saves audio files to project
5. On staging push: dialogue in manifest, voice files in audio/voice/
```

**Music Generation:**

```
1. User paints a new music zone or selects existing one
2. Properties panel shows: zone bounds, current track, mood
3. User clicks "Generate Track"
   → Prompts for: mood, tempo, instruments, biome context
   → ElevenLabs Music generates track (up to 5 min)
   → Preview playback in editor
   → "Accept" adds to music.json + saves audio file
4. Track immediately available as zone assignment
```

**Sound Effects:**

```
1. User places SFX trigger point
2. Properties panel shows: position, radius, description
3. User clicks "Generate Sound"
   → Prompts for: description, duration, looping
   → ElevenLabs SFX generates clip (0.5-22s)
   → Preview playback
   → "Accept" saves to project
```

### 8.5 AI Cost Management

AI generation costs money (ElevenLabs, OpenAI). The editor needs:

- **Cost estimate** shown before generation ("This will cost ~$0.30")
- **Usage dashboard**: track spending per team, per month
- **Budget limits**: team admin can set monthly AI generation budget
- **Batch optimization**: batch voice generation is cheaper than individual calls
- **Cache**: identical prompts return cached results (no double-charge)
- **Permission**: `ai:generate` permission required (team admin can restrict)

### 8.6 Tasks

- [ ] Extend existing ContentGenerationService with structured dialogue output matching `NPCDialogueTree` type
- [ ] Extend existing ContentGenerationService with structured quest output matching `QuestDefinition` type
- [ ] Add AI World Population Assistant endpoint to ContentGenerationService
- [ ] Create Dialogue Tree Viewer/Editor component (visual tree with nodes + edges)
- [ ] Wire ElevenLabs Voice into NPC properties panel ("Generate Voice Lines" button)
- [ ] Wire ElevenLabs Music into music region properties ("Generate Track" button)
- [ ] Wire ElevenLabs SFX into SFX trigger properties ("Generate Sound" button)
- [ ] Build AI cost estimation + usage dashboard
- [ ] Implement AI generation caching (avoid duplicate charges)
- [ ] Add batch dialogue generation for towns ("Generate all NPC dialogue in Haven")
- [ ] Add batch voice generation for NPCs ("Generate voices for all NPCs with dialogue")
- [ ] Build voice selection UI (browse ElevenLabs library, match to NPC traits)
- [ ] Add AI generation progress tracking (progress bars, queue status)
- [ ] Wire `ai:generate` permission check into all AI endpoints

---

## Part 9: Accounts, Teams & Permissions

### 9.1 Overview

The current codebase has Privy auth (wallets, email, social) and a basic role system (user/mod/admin/builder) for the game — but the Asset Forge API has optional auth only, no team/org concept, and no project ownership. For a production world builder that multiple people/teams use, we need:

- **Accounts**: Individual user accounts linked to Privy auth
- **Games**: A game is a distinct Hyperscape instance (one team might run multiple games, or the platform hosts many games)
- **Teams**: Groups of users who collaborate on a game
- **Roles**: Granular permissions for who can edit, push to staging, push to prod, manage team
- **Project ownership**: World projects scoped to a team + game
- **Audit trail**: Who did what, when

### 9.2 Database Schema

```sql
-- Organizations / Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,          -- URL-friendly name
  description TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES forge_users(id),
  plan TEXT DEFAULT 'free',           -- 'free' | 'pro' | 'enterprise'
  ai_budget_monthly_cents INTEGER DEFAULT 5000,  -- $50 default AI budget
  ai_spent_this_month_cents INTEGER DEFAULT 0
);

-- Games (a team can have multiple games)
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  -- Server connection info for staging + production
  staging_server_url TEXT,            -- e.g., http://localhost:5556
  staging_assets_path TEXT,           -- e.g., packages/server/staging/assets
  production_server_url TEXT,         -- e.g., http://localhost:5555
  production_assets_path TEXT,        -- e.g., packages/server/world/assets
  staging_admin_code TEXT,            -- Admin code for staging server reload
  production_admin_code TEXT,         -- Admin code for production server reload
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, slug)
);

-- Asset Forge user accounts (linked to game user via Privy)
CREATE TABLE forge_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_user_id TEXT UNIQUE,          -- Links to game user
  email TEXT,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ
);

-- Team membership with roles
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES forge_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  -- role: 'owner' | 'admin' | 'editor' | 'viewer'
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  invited_by UUID REFERENCES forge_users(id),
  UNIQUE(team_id, user_id)
);

-- Team invitations
CREATE TABLE team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES forge_users(id),
  token TEXT UNIQUE NOT NULL,         -- Invite link token
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  UNIQUE(team_id, email)
);

-- Granular permissions (override role defaults)
CREATE TABLE team_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES forge_users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted BOOLEAN DEFAULT TRUE,
  granted_by UUID REFERENCES forge_users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id, permission)
);

-- Audit log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id),
  game_id UUID REFERENCES games(id),
  user_id UUID REFERENCES forge_users(id),
  action TEXT NOT NULL,               -- 'project:save', 'staging:push', 'prod:promote', etc.
  target_type TEXT,                   -- 'project', 'manifest', 'asset', 'team_member'
  target_id TEXT,
  details JSONB,                      -- Action-specific metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_team ON audit_log(team_id, created_at DESC);
```

### 9.3 Role & Permission System

#### Team Roles (default permission bundles)

| Role | Description | Default Permissions |
|------|-------------|-------------------|
| `owner` | Team creator, full control | All permissions |
| `admin` | Team administrator | All except `team:delete`, `team:transfer` |
| `editor` | Can edit world projects | `project:view`, `project:edit`, `project:create`, `staging:push`, `ai:generate`, `asset:promote-staging` |
| `viewer` | Read-only access | `project:view` |

#### Granular Permissions

| Permission | Description | Default Roles |
|------------|-------------|---------------|
| `project:view` | View world projects | All |
| `project:create` | Create new world projects | editor, admin, owner |
| `project:edit` | Edit existing world projects | editor, admin, owner |
| `project:delete` | Delete world projects | admin, owner |
| `staging:push` | Push changes to staging server | editor, admin, owner |
| `prod:push` | Push changes to production | admin, owner |
| `prod:approve` | Approve production promotions | admin, owner |
| `ai:generate` | Use AI generation tools (costs money) | editor, admin, owner |
| `asset:promote-staging` | Promote forge assets to staging | editor, admin, owner |
| `asset:promote-prod` | Promote staging assets to production | admin, owner |
| `manifest:edit` | Edit game manifests | editor, admin, owner |
| `team:invite` | Invite new team members | admin, owner |
| `team:manage-roles` | Change member roles | admin, owner |
| `team:manage-billing` | Manage AI budget and plan | owner |
| `team:delete` | Delete the team | owner |
| `team:transfer` | Transfer ownership | owner |

#### Permission Overrides

The `team_permissions` table allows granting or revoking specific permissions beyond the role default. For example:
- Grant `prod:push` to a specific editor (without making them admin)
- Revoke `ai:generate` from a specific editor (to control spending)

### 9.4 Authentication Flow

```
User opens World Studio
  → Privy login (wallet, email, or social)
  → Asset Forge API verifies Privy token
  → Looks up forge_users by privy_user_id (creates if new)
  → Returns user profile + team memberships
  → UI shows team selector if user is in multiple teams
  → User selects team + game
  → All subsequent API calls include team_id + game_id
  → API checks permissions on every request
```

### 9.5 API Authentication Middleware

Every Asset Forge API route gets authentication middleware:

```typescript
// Middleware: verifyAuth
// 1. Extract Privy token from Authorization header
// 2. Verify token with Privy SDK
// 3. Lookup forge_users by privy_user_id
// 4. Attach user to request context

// Middleware: requirePermission(permission)
// 1. Extract team_id from request (header or body)
// 2. Lookup team_members for user + team
// 3. Check role default permissions
// 4. Check team_permissions overrides
// 5. 403 if not permitted
```

### 9.6 Multi-Game Support

A team can manage multiple games. Each game has:
- Its own staging + production server URLs
- Its own asset directories
- Its own world projects
- Its own deployment history

This allows:
- Hyperscape official team managing the main game
- Community teams building their own games on Hyperscape engine
- Agencies managing multiple game worlds for clients

### 9.7 Scaling Considerations

The Phase 1-8 design assumes a single Asset Forge API server. This works for the Hyperscape team and a small number of community teams. If the platform grows to many concurrent teams:

- **Database**: PostgreSQL with JSONB world_data handles ~100 projects comfortably. Beyond that, consider splitting world_data into separate table for terrain sculpts/chunk data (the largest portion).
- **Asset storage**: File-based staging/production works for single-server. Multi-server deployment requires S3-compatible object storage (MinIO for self-hosted, or AWS S3/Cloudflare R2).
- **AI generation queue**: ElevenLabs rate limits will become a bottleneck with many teams. Add a job queue (BullMQ/Redis) for AI generation requests with per-team fair scheduling.
- **No premature optimization**: Build single-server first. The abstractions (AssetPipelineService, DeploymentService) can be swapped to S3/queue backends later without changing the API or UI.

### 9.8 Hyperscape Protection

The Hyperscape official game is **not editable by default**. Protection measures:

- Hyperscape production is owned by the Hyperscape team
- Only team members with `prod:push` and `prod:approve` can deploy to production
- All production pushes require two-person approval
- Audit log tracks every action with user attribution
- Rate limiting on staging/prod push (prevent accidental spam)
- Production push has a cooldown (e.g., minimum 5 minutes between deployments)

### 9.9 Onboarding Flow for New Teams

```
1. User signs up via Privy (any auth method)
2. "Create Team" → team name, description
3. "Create Game" → game name, server URLs (optional — can use hosted)
4. Team owner invites members via email
5. Invitees sign up / log in via Privy
6. Accept invite → join team with assigned role
7. Team can now create world projects and start building
```

### 9.10 API Endpoints for Teams & Permissions

```
POST   /api/auth/login              — Verify Privy token, return user + teams
GET    /api/auth/me                 — Current user profile

POST   /api/teams                   — Create team
GET    /api/teams                   — List user's teams
GET    /api/teams/:id               — Team details
PUT    /api/teams/:id               — Update team
DELETE /api/teams/:id               — Delete team (owner only)

POST   /api/teams/:id/games         — Create game under team
GET    /api/teams/:id/games         — List games for team
PUT    /api/teams/:id/games/:gid    — Update game settings
DELETE /api/teams/:id/games/:gid    — Delete game

GET    /api/teams/:id/members       — List team members
POST   /api/teams/:id/invite        — Invite member by email
PUT    /api/teams/:id/members/:uid  — Update member role
DELETE /api/teams/:id/members/:uid  — Remove member
POST   /api/teams/:id/leave         — Leave team

GET    /api/teams/:id/permissions/:uid — Get user's permissions
PUT    /api/teams/:id/permissions/:uid — Set permission override

GET    /api/teams/:id/audit-log      — Audit log (admin+ only)
GET    /api/teams/:id/ai-usage       — AI generation usage + budget
```

### 9.11 Tasks

- [ ] Create `forge_users` table + Privy auth middleware for Asset Forge API
- [ ] Create `teams`, `team_members`, `team_invites` tables
- [ ] Create `games` table with staging/production server config
- [ ] Create `team_permissions` table with role defaults
- [ ] Create `audit_log` table with indexes
- [ ] Implement auth middleware: `verifyAuth`, `requirePermission()`
- [ ] Build team management API endpoints
- [ ] Build game management API endpoints
- [ ] Build invite flow (email invite, accept, join)
- [ ] Add team/game selector to World Studio UI header
- [ ] Scope all world project APIs to team + game
- [ ] Add permission checks to staging push, prod push, AI generation
- [ ] Build admin panel: team settings, member management, role assignment
- [ ] Build audit log viewer
- [ ] Build AI usage dashboard with budget controls
- [ ] Add production push approval flow (request → review → approve/reject)
- [ ] Add production push cooldown + rate limiting

---

## Part 10: Risk Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Breaking production world | Critical | Low | Staging → Production pipeline with mandatory diff review + two-person approval |
| Unauthorized production push | Critical | Low | Permission system, two-person approval, audit log, push cooldown |
| Data loss | Critical | Low | Auto-save + server persistence + deployment archives + rollback |
| AI generation cost overruns | High | Medium | Budget limits per team, cost estimates before generation, usage dashboard |
| Performance in large worlds | High | Medium | EditorWorld already has LOD/streaming; limit overlay complexity |
| Manifest format changes | High | Low | Version field in WorldProject; migration functions per version |
| Concurrent editors | Medium | Medium | Edit locking (one user per project), conflict detection on save |
| Procgen determinism drift | Medium | Low | Pin procgen seed + params in WorldProject |
| Hot-reload failures | Medium | Low | Fallback: restart server; rollback to archived state |
| Browser crashes during edit | Medium | Medium | IndexedDB auto-save recovers session |
| Asset corruption during copy | Medium | Low | Validate after copy, checksum verification |
| Staging/prod asset path confusion | Medium | Low | Clear environment variable, server startup validation |
| AI-generated content quality | Medium | High | Human review required before accepting all AI output |
| AI-generated dialogue inappropriate | Medium | Medium | Content moderation prompt, human review, style guidelines |
| Voice generation voice mismatch | Low | Medium | Voice library browser with preview, NPC trait matching |
| Team member leaves with no handoff | Medium | Low | Team ownership transfer, multiple admins encouraged |
| Invalid manifest deployed to prod | Critical | Medium | Deep cross-reference validation blocks deployment (5.7.2). Every ID reference validated. |
| SQL injection via manifest content | Critical | Low | Drizzle ORM parameterized queries. TypeBox input validation. No raw SQL. |
| Path traversal in asset uploads | Critical | Low | File paths validated against allowlist patterns. No `../` sequences. Sandboxed to staging/assets/. |
| WebGPU context lost during editing | Medium | Medium | ErrorBoundary on viewport. State preserved in WorldStudioContext. Reinitialize viewport without data loss. |
| Partial deployment (files written, DB fails) | High | Low | All deployments wrapped in DB transactions. File cleanup on rollback. Idempotent retry. |
| WorldProject JSONB schema drift | Medium | Medium | `schemaVersion` field + migration functions per version. Run migration on load if version < current. |
| Memory leak from editor overlays | Medium | Medium | All overlay meshes tracked in `disposables` set. Disposed on toggle/unmount. No per-frame allocations. |
| React re-renders during game loop | Medium | Medium | World state in refs, not React state. Only panel content triggers re-renders. See 5.7.5. |
| Stale manifest cross-references | High | Medium | Validation runs before every staging push. Cannot deploy with broken references. See 5.7.2. |
| No test coverage for manifest compiler | High | High | Testing strategy mandates unit tests for all 38 manifest outputs + cross-ref validation. See 5.7.6. |

---

## Part 11: File Inventory

### New Files

```
# Account & Team System
packages/asset-forge/server/middleware/auth.ts              — Privy auth middleware
packages/asset-forge/server/middleware/permissions.ts       — Permission checking middleware
packages/asset-forge/server/routes/auth.ts                  — Login, profile endpoints
packages/asset-forge/server/routes/teams.ts                 — Team CRUD + members + invites
packages/asset-forge/server/routes/games.ts                 — Game CRUD endpoints
packages/asset-forge/server/services/TeamService.ts         — Team business logic
packages/asset-forge/server/services/PermissionService.ts   — Permission resolution
packages/asset-forge/server/services/AuditService.ts        — Audit logging

# World Studio (editor) — ALL NEW FILES, no existing files modified
packages/asset-forge/src/pages/WorldStudioPage.tsx          — Unified editor page (new route /world-studio)
packages/asset-forge/src/components/WorldStudio/
├── WorldStudioContext.tsx        — State management (extends WorldBuilderContext patterns)
├── WorldStudioLayout.tsx         — Master layout orchestrator
├── panels/
│   ├── LeftSidebar.tsx           — Hierarchy + Asset Browser tabs
│   ├── RightSidebar.tsx          — Properties + Manifests tabs
│   ├── HierarchyPanel.tsx        — Extended hierarchy (reuses shared/TreeView)
│   ├── PropertiesPanel.tsx       — Pluggable per-entity-type properties
│   ├── AssetBrowserPanel.tsx     — Prod/Staging/Forge asset browser
│   ├── ManifestPanel.tsx         — Inline manifest editing
│   └── AIGenerationPanel.tsx     — AI content generation UI
├── toolbar/
│   ├── MainToolbar.tsx           — Top toolbar with menus + mode switches
│   ├── ToolModeBar.tsx           — Active tool options (brush size, snap, etc.)
│   └── DeploymentBar.tsx         — Push staging / diff / publish buttons
├── viewport/
│   ├── ViewportContainer.tsx     — EditorWorld wrapper with overlay compositing
│   ├── ViewportOverlays.tsx      — Tile grid, collision, biome, audio zone overlays
│   ├── PlacementGhost.tsx        — Ghost preview for entity placement
│   ├── BrushPreview.tsx          — Translucent circle for brush tools
│   └── MinimapOverlay.tsx        — Corner minimap (canvas-based)
├── dialogs/
│   ├── NewWorldDialog.tsx        — World creation wizard (replaces CreationPanel as modal)
│   ├── DeploymentDialog.tsx      — Staging/prod push confirmation + diff
│   ├── DiffViewer.tsx            — Manifest + asset + audio diff visualization
│   ├── TeamSelectorDialog.tsx    — Team + game picker
│   └── AuditLogViewer.tsx        — Audit log viewer component
├── editors/                      — Inline property editors per entity type
│   ├── TerrainEditor.tsx         — Procgen terrain controls
│   ├── BiomeEditor.tsx           — Biome properties + vegetation layers
│   ├── TownEditor.tsx            — Town properties + building list
│   ├── NPCEditor.tsx             — NPC properties + AI gen buttons
│   ├── QuestEditor.tsx           — Quest stages + rewards
│   ├── CombatEditor.tsx          — Spells, prayers, runes, ammo
│   ├── RecipeEditor.tsx          — 8 recipe categories
│   ├── AudioZoneEditor.tsx       — Music + ambient + SFX properties
│   ├── DialogueTreeEditor.tsx    — Visual dialogue tree viewer/editor
│   ├── POIEditor.tsx             — POI placement + categories
│   ├── RiverEditor.tsx           — River waypoint spline editor
│   ├── ArenaEditor.tsx           — Duel arena positions
│   ├── ProgressionEditor.tsx     — Skills, tiers, tools
│   └── AIUsageDashboard.tsx      — AI spending + budget display
├── hooks/
│   ├── useEditorWorldSync.ts     — Bridges WorldStudioContext ↔ EditorWorld
│   ├── useBrushTool.ts           — Terrain/biome/vegetation brush logic
│   ├── usePlacementTool.ts       — Entity placement with ghost preview
│   └── useKeyboardShortcuts.ts   — Global shortcut registry
└── services/
    ├── ManifestCompiler.ts       — WorldProject → 38 manifest files + world.json
    └── WorldStudioAPI.ts         — Client-side API wrapper for world project CRUD

# AI Content Generation (extending existing ContentGenerationService + routes)
# ContentGenerationService.ts ALREADY EXISTS — extend, don't recreate
# content-generation routes ALREADY EXIST — add new endpoints to existing module

# Deployment & Assets
packages/asset-forge/server/routes/world-projects.ts        — World project CRUD API
packages/asset-forge/server/routes/deployment.ts             — Staging/prod deployment API
packages/asset-forge/server/routes/assets-pipeline.ts        — Asset pipeline API
packages/asset-forge/server/services/WorldCompiler.ts        — Manifest compilation service
packages/asset-forge/server/services/DeploymentService.ts    — Deployment orchestration
packages/asset-forge/server/services/AssetPipelineService.ts — Asset promotion + validation
packages/asset-forge/server/services/StagingService.ts       — Staging directory management

# Game Server
packages/server/staging/assets/.gitkeep                      — Staging directory
packages/server/src/startup/routes/manifest-reload.ts        — Hot-reload endpoint
```

### Modified Files (additive-only changes — no existing behavior altered)

```
# PHASE 1 — Minimal additions to wire up the new page (4 one-line changes):
packages/asset-forge/src/App.tsx                    — Add 1 <Route> for WorldStudioPage
packages/asset-forge/src/constants/navigation.ts    — Add 1 WORLD_STUDIO route constant
packages/asset-forge/src/types/navigation.ts        — Add 1 "worldStudio" union member
packages/asset-forge/src/components/shared/Navigation.tsx  — Add 1 item to NAV_ITEMS array

# PHASE 2 — EditorWorld system wiring (additive options, no breaking changes):
packages/shared/src/runtime/createEditorWorld.ts    — Add water/bridge/dock/overlay system options
  (existing options unchanged, new options default to false)

# PHASE 8 — Server-side deployment endpoint (new route, doesn't touch existing routes):
packages/asset-forge/server/api-elysia.ts           — Register new route modules, add auth middleware
  (existing 18 route modules unchanged)
packages/server/src/startup/api-routes.ts           — Add manifest-reload route (new endpoint only)

# PHASE 7+ — Generator pages get "Add to Staging" button (additive UI, existing export unchanged):
packages/asset-forge/src/pages/TreeGenPage.tsx      — Add 1 button alongside existing Export GLB
packages/asset-forge/src/pages/RockGenPage.tsx      — Add 1 button
packages/asset-forge/src/pages/BuildingGenPage.tsx  — Add 1 button
packages/asset-forge/src/pages/DockGenPage.tsx      — Add 1 button
packages/asset-forge/src/pages/BridgeGenPage.tsx    — Add 1 button
packages/asset-forge/src/pages/LandmarkGenPage.tsx  — Add 1 button
packages/asset-forge/src/pages/PlantGenPage.tsx     — Add 1 button
packages/asset-forge/src/pages/VegetationGenPage.tsx — Add 1 button
packages/asset-forge/src/pages/TerrainGenPage.tsx   — Add 1 button

# NOT MODIFIED until WorldStudio is proven and old pages deprecated:
packages/asset-forge/src/pages/WorldBuilderPage.tsx    — UNTOUCHED
packages/asset-forge/src/pages/WorldEditorPage.tsx     — UNTOUCHED
packages/asset-forge/src/pages/ManifestsPage.tsx       — UNTOUCHED
packages/asset-forge/src/components/WorldBuilder/*     — UNTOUCHED
All other existing pages and components                — UNTOUCHED
```

### Preserved Files (reused heavily)

```
packages/asset-forge/src/components/WorldBuilder/WorldBuilderContext.tsx — Core state management
packages/asset-forge/src/components/WorldBuilder/types.ts               — Type definitions
packages/asset-forge/src/components/WorldBuilder/utils/worldPersistence.ts — Persistence utils
packages/asset-forge/src/components/WorldBuilder/EditingMode/           — All editing components
packages/asset-forge/src/context/EditorWorldContext.tsx                  — EditorWorld integration
packages/shared/src/systems/editor/                                     — Editor systems

# AI services (already built, wire into editor):
packages/asset-forge/server/services/ElevenLabsVoiceService.ts
packages/asset-forge/server/services/ElevenLabsSoundEffectsService.ts
packages/asset-forge/server/services/ElevenLabsMusicService.ts
packages/asset-forge/server/routes/voice-generation.ts
packages/asset-forge/server/routes/sound-effects.ts
packages/asset-forge/server/routes/music.ts
```

---

## Part 12: Review Addendum — Deep Audit Findings & Corrections

### Code Audit Results (2026-03-28)

Five parallel deep-research agents audited the entire codebase against the plan. This section documents all findings, corrections, and verified claims.

### Corrections Applied to Plan

| Original Claim | Actual Finding | Corrected |
|---------------|---------------|-----------|
| "70+ reducer actions" | 60 actions in WorldBuilderContext | ✅ Fixed |
| "~68KB persistence" | 84KB / 3,045 lines | ✅ Fixed |
| "23+ manifests" — compilation only mapped ~15 | 38 files total (19 root + 8 items/ + 3 gathering/ + 8 recipes/). All 38 now explicitly mapped in compilation, WorldProject model, Phase 6, and diff view | ✅ Fixed |
| "world-config.json" referenced in compilation | File does NOT exist. Procgen params are in TerrainHeightParams.ts / GameConstants.ts | ✅ Fixed |
| "vegetation.json — 50+ assets" | Only 403 bytes / 1 entry. Real data in biomes.json vegetation.layers[] | ✅ Fixed |
| "DataManager — Add reloadManifests() method" (casual) | Requires 19-32 hours across shared/server/client. isInitialized prevents re-init, downstream systems cache at init | ✅ Fixed — full complexity documented |
| Water/bridges/docks listed as "NEW" in EditorWorld config | All three systems ALREADY EXIST and are production quality. Water has AAA shader (Gerstner, GGX, Beer-Lambert, SSS, foam). | ✅ Fixed |
| "Role system — user, mod, admin, builder" | `builder` role NOT in RoleManager. Only user/mod/admin exist. | ✅ Fixed |
| AI generation services "need to be built" | ContentGenerationService + /api/content-generation ALREADY EXISTS for NPC/quest/dialogue/lore generation | ✅ Fixed |
| "ElevenLabs Music — AI music composition" | `generateMusic()` works but `createCompositionPlan()` is FAKE (hardcoded data) | ✅ Fixed |
| Asset Forge "PostgreSQL" (implied shared DB) | Asset Forge has SEPARATE optional PostgreSQL with only `assets` table | ✅ Fixed |
| WorldBuilder + WorldEditor "disconnected" | More than disconnected — they share ZERO state. Completely different architectures. | ✅ Fixed |

### Verified Claims (Confirmed Accurate)

| Claim | Verification |
|-------|-------------|
| 1m×1m tile grid | ✅ TILE_SIZE = 1.0 in TileSystem.ts |
| 600ms tick duration | ✅ TICK_DURATION_MS = 600 |
| 100m×100m terrain tiles | ✅ TERRAIN_TILE_SIZE = 100 in GameConstants.ts |
| 10km×10km world | ✅ 100×100 grid of 100m tiles |
| 8-directional wall flags | ✅ WALL_NORTH through WALL_WEST + diagonals |
| WATER, STEEP_SLOPE, BRIDGE, DOCK collision flags | ✅ All exist with correct bitmask values |
| MST + A* + Chaikin for roads | ✅ RoadNetworkSystem implements all three |
| GPU-instanced vegetation with LOD | ✅ InstancedMesh + LOD0→Impostor |
| 3 biomes: Forest, Canyon, Tundra | ✅ Plus Plains as a fourth |
| Town placement by terrain flatness | ✅ 40-tile radius sample, 16-point check |
| Town sizes: Hamlet/Village/Town | ✅ 3-5/6-10/11-16 buildings |
| Privy auth with wallets/email/social | ✅ Server-side token verification |
| 11 NPCs with dialogue trees | ✅ Functional in npcs.json with quest overrides |
| EditorCamera orbit/pan/fly | ✅ 403 lines, 3 modes with damping |
| EditorSelection click/multi/marquee | ✅ 526 lines, highlight material overlay |
| EditorGizmo translate/rotate/scale | ✅ 412 lines, snap-to-grid, keyboard shortcuts |
| ManifestService with backups | ✅ Timestamped backups, max 10 per file |
| 18 tracks in music.json | ✅ Plus 18 draft tracks |
| River system with terrain carving | ✅ 18-waypoint ISLAND_RIVER definition |
| POI system with 9 categories | ✅ dungeon, shrine, landmark, resource_area, ruin, camp, crossing, waystation, fishing_spot |

### Additional Systems Discovered (Not in Original Plan)

| System | Details | Impact on Plan |
|--------|---------|---------------|
| **River system** (RiverDefinition.ts) | 18-waypoint river with terrain carving, adaptive width, berm shaping | Water body editor should include river editing, not just sea level/lakes |
| **POI system** (POISystem.ts) | 9 categories, road-connected, importance-weighted | Should be editable in World Studio — POI placement + configuration |
| **Island mask** | Radial boundary with 788-unit radius | World boundary visualization needed in editor |
| **Terrain worker** | Async heightmap computation | Editor terrain brushes must integrate with worker thread |
| **Building collision service** | Auto-registers collision from building footprints | Tile editor should visualize auto-generated building collision |
| **World entities** loaded from `world.json` | Separate from manifests — entities spawned from world.json at startup | May need to export WorldProject → world.json in addition to manifests |
| **Chunk persistence** (WorldChunkRepository) | Terrain mods stored per 100m chunk, upserted with semaphore rate limiting | Staging pipeline may need chunk data too, not just manifests |
| **`plants` disabled** in BiomeResourceGenerator | Comment: "not working/looking good yet" | Don't expose broken plant placement in editor |
| **Playtester swarm** (PlaytesterSwarmOrchestrator) | AI test automation service | Could auto-test staged worlds before production push |
| **Asset status workflow** | draft→processing→completed→failed→approved→published→archived | Asset promotion pipeline should follow this existing status model |
| **Max walkable slope**: 1.5 (~56°) | STEEP_SLOPE collision flag auto-applied | Terrain sculpting must respect slope limits or editor should warn |

### Gaps Still Remaining

| Gap | Where Addressed | Status |
|-----|-----------------|--------|
| AI audio not integrated into editor | Part 8 — AI generation pipeline | Planned |
| No music region editor | Phase 7.1, Part 3.2 Audio Zone Mode | Planned |
| No ambient sound zone editor | Phase 7.2 | Planned |
| No accounts/teams/permissions | Part 9 — full account system | Planned |
| No staging concept anywhere | Phases 1 + 8 | Planned (built from scratch) |
| No production push approval | Phase 8.4 — two-person approval | Planned |
| No audit trail | Part 9.2 — audit_log table | Planned |
| `world.json` entity export | Was missing — server loads entities from `world.json` separately from manifests | ✅ Added to manifest compiler (5.2), compilation flow (6), and Phase 8 staging push |
| Chunk persistence for staging | Was missing — WorldChunkRepository stores terrain mods per 100m chunk | ✅ Added to manifest compiler (5.2), compilation flow (6), and Phase 8 staging push |
| POI editing | POI system has 9 categories but no editor UI was planned | ✅ Added as Phase 4.6 (POI Editor) + POI overlay |
| River editing | River system exists (18 waypoints) but no editor was planned | ✅ Added to Phase 4.7 (Water Body & River Editor) with spline editing |
| World boundary visualization | Island mask (788-unit radius) wasn't shown in editor | ✅ Added to overlay table (5.4), EditorWorld config, and Phase 4.8 |
| Plants broken | BiomeResourceGenerator has plants disabled ("not looking good yet") | ✅ Note added to Phase 4.5 vegetation — don't expose until fixed |

### Architecture Soundness Assessment

| Concern | Assessment |
|---------|-----------|
| **Single JSONB for world data** | Fine for current scale (10km×10km). If terrain sculpt data exceeds 100MB, split to BLOB. Monitor. |
| **File-based staging** | Simpler than DB-based staging. Works for single-server deployment. If multi-server, consider object storage (S3). |
| **Privy for editor auth** | Reuses existing game auth infrastructure. No need to build separate auth. Asset Forge already has PRIVY_APP_ID in .env.example. |
| **Separate Asset Forge DB** | Already has its own PostgreSQL with assets table. Team/project tables go HERE, not in game server DB. |
| **Permission system complexity** | Role + override model is standard. 16 permissions is manageable. Don't over-engineer. |
| **AI generation in editor** | ContentGenerationService ALREADY EXISTS for NPC/quest/dialogue. ElevenLabs services built. Real work is editor UI, not backend. |
| **Manifest compilation correctness** | `world-config.json` doesn't exist, `vegetation.json` is empty, world entities come from `world.json` not just manifests. Compiler must handle all three. |
| **Hot-reload vs restart** | True hot-reload is 19-32 hours of work. For MVP, graceful restart of staging server is fine. Production hot-reload is Phase 9. |
| **Two-person approval** | Good safety for production. Allow configurable: disable for teams with ≤2 members. |
| **Merging WorldBuilder + WorldEditor** | These share ZERO state and have different architectures. WorldBuilder uses React reducer + TileBasedTerrain. WorldEditor uses EditorWorld + real game systems. Merging is the hardest Phase 2 task. |

---

## Summary

This plan covers every system in the codebase — all 38 manifest files (261+ items, 18 NPCs, 167 recipes, 33 gathering spots, 8 combat spells, 9 prayers, 7 quests, 7 shops, 6 stations, 6 arenas), world.json entity spawning, and WorldChunkRepository terrain persistence. The foundation is strong — there is already ~450KB of World Builder code, real game system rendering in EditorWorld, manifest CRUD APIs, placement system, three ElevenLabs audio generation services, Privy authentication, and a role system.

The work is:
1. **Adding accounts, teams, and permissions** (Part 9) so multiple teams can safely use the tool
2. **Unifying the editor** (Phase 2) into a single WYSIWYG tool
3. **Building the staging → production pipeline** (Phase 8) with two-person approval
4. **Connecting the asset pipeline** (Part 7) from forge to game
5. **Wiring AI generation into the editor** (Part 8) for dialogue, voice, music, SFX
6. **Adding spatial editing tools** (Phases 3-6) for professional world design

**Phase 1** (accounts + persistence) is the critical path — everything depends on auth and server storage.

**The non-negotiable safety rails**:
- Nothing touches production without going through staging first
- Production push requires two-person approval
- Every action is audit-logged
- AI generation is budget-capped per team
- Every asset, every manifest, every world change — staging first, test, review diff, then promote

**Engineering standards (Part 5.7)** ensure the implementation meets super-audit criteria:
- **OWASP**: TypeBox input validation on all endpoints, Drizzle parameterized queries, no path traversal
- **SOLID**: Pluggable entity editors, narrow hook interfaces, abstract storage backends
- **Manifest integrity**: Deep cross-reference validation blocks deployment with broken references
- **GPU hygiene**: Refs not state for engine objects, explicit dispose on unmount, no per-frame allocations
- **PostgreSQL discipline**: Connection pooling, indexed queries, transactional deployments, reversible migrations
- **Testing**: Unit tests for manifest compiler (all 38 outputs), E2E for creation/editing/deployment flows
- **Resilience**: Panel-level error boundaries, auto-save with retry, offline IndexedDB fallback
- **Idempotency**: Save and deploy operations safe to retry, no partial states

**Existing features protected** (Part 3.0): WorldStudioPage is a NEW route. Only 4 one-line additive changes to existing files. All 24 current Asset Forge pages remain untouched.
