# The Hyperscape Armor Generation Pipeline

## A Comprehensive Architecture Plan

**Last updated:** 2026-04-05
**Status:** Research complete, validated against real APIs and industry practice

---

## Part 1: The Core Insight

The current pipeline generates armor as a standalone mesh, then spends ~7,900 lines of code trying to force it onto a body. This is backwards.

Every successful MMORPG equipment system avoids this problem entirely:
- **RuneScape (OSRS/RS3)**: Assembles characters from 12 modular body-part meshes. Equipping a platebody replaces the torso+arms model entirely (including skin geometry). No fitting.
- **World of Warcraft**: Uses ~90 geosets (submesh toggles) within a single character mesh plus texture compositing. Equipment toggles visibility flags and composites textures onto UV regions. No fitting.
- **FFXIV/GW2**: Pre-seamed body meshes where equipment replaces entire sections. Shared skeleton, predefined cut boundaries. No fitting.

The common thread: **equipment geometry is authored (or generated) to already fit the body. Nobody deforms standalone meshes onto bodies at runtime or in a pipeline.**

Hyperscape should adopt the same principle, but with AI generating the content instead of artists hand-modeling it.

### The Three-Tier Architecture

| Tier | Relationship | Examples | Method |
|---|---|---|---|
| **1** | Surface replacement | Chestplate, platelegs, boots, gloves, helmet | Body-derived shell + AI textures |
| **2** | Unique silhouette | Dragon armor, ornate sets, boss drops | Tripo generate_parts + per-part texturing pipeline |
| **3** | Bone-attached object | Sword, shield, cape, backpack, amulet | Standalone generation + bone parenting |

~80% of equipment falls into Tier 1. Tier 2 leverages Tripo's full AI mesh pipeline. Tier 3 is largely unchanged from the current approach.

### Tripo as Strategic Platform

Tripo3D (by VAST AI Research) is the strategic platform for this pipeline. Their API provides a complete task-chained mesh processing stack — not just generation, but segmentation (HoloPart), part completion, per-part texturing, learned retopology (Smart Mesh), auto-rigging (UniRig, Mixamo-compatible), and animation retargeting. Critically, their `import_model` endpoint accepts any existing GLB/FBX/OBJ, making their entire post-processing suite available for meshes from ANY source — including our pre-computed shells.

Key Tripo capabilities used across all three tiers:

| Capability | API Task | Use In Pipeline |
|---|---|---|
| Import any mesh | `import_model` | Upload shells for texturing (Tier 1) |
| AI texturing with UV preservation | `texture_model` | Shell textures (T1), per-part textures (T2) |
| Per-part texturing | `texture_model` + `part_names` | Tier variants on segmented armor (T2) |
| Pre-segmented generation | `generate_parts=true` | Armor pieces already separated (T2) |
| AI mesh segmentation | `mesh_segmentation` | Split character into body + armor (T2) |
| Hidden geometry reconstruction | `mesh_completion` (HoloPart) | Complete armor pieces after segmentation (T2) |
| Learned retopology | `highpoly_to_lowpoly` (Smart Mesh) | Game-ready topology on all AI meshes (T2, T3) |
| Auto-rigging | `animate_rig` (UniRig) | Mixamo skeleton on armor/weapons (T2, T3) |
| Animation retargeting | `animate_retarget` | Verify armor animates correctly (T2) |
| Bilateral symmetry | `force_symmetry` on `convert_model` | Clean symmetric armor (T2) |
| Format conversion | `convert_model` | GLB export with per-part selection (all) |

---

## Part 1.5: Code Isolation Strategy — DO NOT TOUCH EXISTING CODE

### The Golden Rule

**All new pipeline code lives in entirely new files, directories, and UI tabs.** We do NOT modify, refactor, or delete any existing Asset Forge code until the new pipeline is fully validated and shipping.

### Why

The current armor fitting pipeline (ArmorFittingService, MeshFittingService, AICreationService, the Equipment Viewer, etc.) is working code that people actively use. Even though the fitting results aren't great, the generation flow, the viewer, the Meshy integration, and the UI all function. Breaking any of that while building the new pipeline would leave us with **zero working paths** instead of one imperfect one.

### What This Means In Practice

```
DO:
  ✅ Create new directories:  src/services/armor-pipeline/
  ✅ Create new UI tabs:       "Shell Generator", "Tripo Pipeline", "Armor Preview"
  ✅ Create new service files:  ShellExtractionService.ts, TripoAPIService.ts, etc.
  ✅ Create new viewer:         ShellPreviewViewer.tsx (or extend with new tab)
  ✅ Import shared types from existing code (read-only dependency)
  ✅ Reuse EquipmentVisualSystem's skeleton-sharing pattern (reference, don't modify)

DO NOT:
  ❌ Edit ArmorFittingService.ts or MeshFittingService.ts
  ❌ Modify AICreationService.ts (MeshyService)
  ❌ Change existing UI panels or tabs
  ❌ Alter EquipmentVisualSystem.ts or EquipmentVisualHelpers.ts
  ❌ Delete ANY existing files during development
  ❌ Refactor shared types to accommodate the new pipeline
```

### Directory Structure for New Code

```
packages/asset-forge/
├── src/
│   ├── services/
│   │   ├── fitting/                  # ← EXISTING — DO NOT TOUCH
│   │   │   ├── ArmorFittingService.ts
│   │   │   ├── MeshFittingService.ts
│   │   │   └── WeightTransferService.ts
│   │   │
│   │   └── armor-pipeline/           # ← ALL NEW CODE GOES HERE
│   │       ├── ShellExtractionService.ts
│   │       ├── ShellLibrary.ts
│   │       ├── TripoAPIService.ts
│   │       ├── ArmorTextureService.ts
│   │       ├── DetailMeshService.ts
│   │       ├── PipelineOrchestrator.ts
│   │       └── types.ts
│   │
│   ├── components/
│   │   ├── EquipmentViewer/          # ← EXISTING — DO NOT TOUCH
│   │   │
│   │   └── ArmorPipeline/            # ← NEW UI TABS/PANELS
│   │       ├── ShellGeneratorTab.tsx
│   │       ├── TripoPipelineTab.tsx
│   │       ├── ArmorPreviewTab.tsx
│   │       └── PipelineProgressPanel.tsx
│   │
│   └── ...
│
├── server/
│   ├── services/
│   │   ├── AICreationService.ts      # ← EXISTING — DO NOT TOUCH
│   │   │
│   │   └── armor-pipeline/           # ← NEW API ROUTES
│   │       ├── tripo-routes.ts
│   │       ├── shell-routes.ts
│   │       └── TripoServerService.ts
```

### When Existing Code Gets Modified

Only in **Phase 5 (Polish + Deprecation)**, after the new pipeline is:
1. Fully functional across all three tiers
2. Tested with real armor sets in-game
3. Validated by the team

At that point — and only then — we:
- Wire `EquipmentVisualSystem` to load from the new pipeline's output
- Deprecate and eventually remove the old fitting services (~6,900 lines)
- Migrate the Meshy integration if needed

Until Phase 5, the old and new pipelines coexist completely independently.

---

## Part 2: The Shell System (Tier 1)

### 2.1 What Is a Shell

A shell is a pre-computed mesh derived from the base VRM avatar's body, offset outward along vertex normals. It has:
- **Identical topology** to the body region it covers (same vertex count, same triangle connectivity)
- **Inherited bone weights** from the underlying body vertices (automatic rigging)
- **Clean UV layout** optimized for the slot's texture needs
- **Defined boundary edges** where the shell meets adjacent body regions

A shell is NOT armor. It's a **canvas**. Armor is what the AI paints onto it.

> **NOVELTY WARNING**: No shipping game engine automatically generates equipment shells from body meshes. Every system researched (VRChat/Modular Avatar, Ready Player Me, WoW, OSRS, Unreal Engine) relies on artist-authored equipment meshes. This would be a first-of-its-kind implementation. The closest precedent is VRChat's Modular Avatar "Mesh Cutter" which extracts body portions by bone weight — but it does NOT offset them into shells.

### 2.2 Slot Region Definitions

Each of the 11 equipment slots maps to a set of VRM humanoid bones. Vertices are assigned to a slot based on bone influence weight:

```
SLOT            VRM BONES                           BOUNDARY BEHAVIOR
────────────────────────────────────────────────────────────────────
helmet          head, neck                          Fades at upper neck
body            spine, chest, upperChest,           Fades at waist (hips),
                leftShoulder, rightShoulder         upper arm, neck base
legs            hips, leftUpperLeg, rightUpperLeg,  Fades at waist (overlap
                leftLowerLeg, rightLowerLeg         with body), above ankle
boots           leftFoot, rightFoot,                Fades at mid-shin
                leftLowerLeg*, rightLowerLeg*       (* lower 30% only)
gloves          leftHand, rightHand,                Fades at mid-forearm
                leftForeArm*, rightForeArm*         (* lower 40% only)
cape            upperChest*, spine*                  Back-facing verts only,
                                                    hangs from shoulders
```

Boundary vertices belong to BOTH adjacent slots with blended influence. This prevents visible seams when adjacent slots have different armor equipped.

**Existing codebase support**: `ArmorFittingService.ts` (lines 81-320) already implements `computeBodyRegions()` with bone-name pattern matching and weight thresholds. `extractBodyVertices()` (lines 719-846) extracts sub-meshes by region. The infrastructure for slot extraction partially exists.

### 2.3 Bulk Classes

Not all armor has the same thickness. A silk robe sits closer to the skin than full plate. Each slot has 3-4 pre-computed shell variants at different offsets:

```
BULK CLASS    NORMAL OFFSET    USE CASE
────────────────────────────────────────
skin          0-1mm            Tattoos, body paint, bare skin tinting
cloth         3-5mm            Robes, shirts, tunics, wizard hats
leather       8-15mm           Leather armor, ranger gear, boots
plate         20-40mm          Full plate, dragon armor, heavy helmets
```

The bulk class is selected based on the armor's item data (a property on the item definition, not AI-determined). Bronze platebody -> plate class. Mystic robes -> cloth class. This is a data-driven lookup, not a runtime computation.

### 2.4 The Self-Intersection Problem (Critical Technical Risk)

**When you offset vertices along normals on a human body mesh, self-intersection is GUARANTEED at concavities.** This is the hardest unsolved problem in the shell approach.

**Problem areas by severity:**

| Region | Severity | Why |
|---|---|---|
| Armpits | SEVERE | Concave pocket — offset from both sides collides. Even 2cm offset causes intersection |
| Inner thighs/groin | SEVERE | Narrow gap between legs; any offset from both sides meets in the middle |
| Neck/chin junction | MODERATE | Concavity under jaw |
| Inner elbows | MODERATE | Concave when arm is straight |
| Behind knees | MODERATE | Similar to inner elbows |

**Mitigation strategies (must implement):**

1. **Curvature-based offset clamping**: Compute local mesh curvature at each vertex. At concavities (negative curvature), reduce the offset distance proportionally. Blender's Solidify modifier uses a similar "Clamp" parameter.

2. **Per-slot offset tuning**: Different maximum offsets for different regions:
   - Helmet: 30mm (no concavity issues on head)
   - Torso plate: 20mm body, but only 5mm at armpits
   - Legs plate: 15mm outer, 5mm inner thigh
   - Boots: 15mm (feet have minimal concavity)
   - Gloves: 10mm (hands are mostly convex)

3. **Post-process intersection removal**: Detect self-intersecting triangles and either delete them or push them apart. The project already has constrained smoothing patterns from the Blender pipeline.

4. **Strategic vertex deletion at concavities**: At severe concavities (armpits, groin), simply exclude those vertices from the shell. The resulting holes are hidden by the body mesh underneath and adjacent slot overlap.

5. **Proof-of-concept FIRST**: Before building the full system, manually offset one torso shell in Blender using the Solidify modifier with Complex mode + Clamp. If the armpit/groin results are acceptable, proceed. If not, consider the alternative approach in Section 2.5.

### 2.5 Alternative: Hand-Authored Shells (WoW-Style Fallback)

If automatic shell generation produces unacceptable self-intersection artifacts, fall back to a hybrid approach inspired by WoW:

1. **Manually author 3-5 base shell meshes per slot** (not per armor — per slot x bulk class). These are hand-modeled once by an artist to avoid all concavity issues.
2. **AI generates textures for these fixed shells** (the same Meshy/Tripo retexture pipeline).
3. Trade-off: less geometric variety (every plate chestpiece has the same shape) but guaranteed quality. This is literally how WoW handles most body armor — texture compositing on fixed geometry.

This fallback still achieves the core win: armor = texture swap on pre-rigged geometry, no fitting pipeline needed.

### 2.6 Shell Pre-Computation (One-Time Setup)

This runs once per base avatar model, producing a library of shell meshes:

```
FOR each equipment slot:
  1. Identify body vertices by bone weight threshold (> 0.1 influence)
     - Use existing computeBodyRegions() as starting point
     - Include boundary ring (1-2 edge loops beyond threshold) for blending
  2. Extract sub-mesh: vertices, faces, UVs, bone weights
     - Use existing extractBodyVertices() pattern
     - Handle the 2-5cm fuzzy zone at joints by including all faces where
       ANY vertex passes threshold (over-include rather than under-include)

  FOR each bulk class:
    3. Compute offset: push each vertex along its smoothed normal
       - Use area-weighted average of adjacent face normals (not vertex normal)
       - This prevents thin spikes at sharp body features
       - APPLY CURVATURE CLAMPING: reduce offset at concavities (see 2.4)
    4. Smooth the offset shell: 3-5 iterations of constrained Laplacian smooth
       - Constrained: vertices cannot move closer to body than the offset distance
       - Boundary vertices are pinned (no movement)
       - Jacobi-style iteration (read old positions, write new) — matches
         existing constrained smooth pattern from Blender pipeline
    5. Detect and resolve self-intersections:
       - BVH-accelerated self-intersection test
       - Delete or push apart intersecting triangles
       - Fill small holes with triangulation
    6. Re-UV the shell:
       - Option A: Inherit body UVs (works if body has good UV layout)
       - Option B: Auto-unwrap with ABF++ (better for texture generation)
       - IMPORTANT: UV layout must be STANDARDIZED across all shells of the
         same slot+bulk. Same UV = same texture works on any avatar.
    7. Compute smooth boundary blend weights:
       - Vertices at boundary edge: weight 0.0 (fully inherits adjacent slot)
       - Vertices 2+ edges inward: weight 1.0 (fully this slot's material)
       - Linear interpolation between
    8. Export as GLB with:
       - Geometry (position, normal, UV, UV2 for AO)
       - Bone indices + bone weights (4 bones per vertex)
       - Boundary blend weights (as vertex color or custom attribute)
       - Slot metadata (slot name, bulk class, vertex count)
```

**Output**: ~20-30 shell GLBs per avatar (5-7 slots x 3-4 bulk classes). These are small (5-30KB each) and cached permanently.

### 2.7 Why This Eliminates Fitting

| Current Pipeline Problem | Shell System Solution |
|---|---|
| GLTF vertex splitting at UV seams | Shell UVs are computed once, never deformed |
| `normals_make_consistent()` fails on open meshes | Shell normals computed once during creation |
| Inside/outside detection blind spots | Vertices start on the outside by construction |
| Shrinkwrap creates gaps at concavities | No shrinkwrap. Geometry is pre-computed |
| Weight transfer is approximate | Weights are inherited exactly from body vertices |
| Each new armor needs re-fitting | Armor is a texture, not a mesh. Zero fitting |

---

## Part 3: AI Texture Generation for Shells

This is where the AI does its creative work — generating PBR materials that turn a blank shell canvas into visible armor.

### 3.1 The Texture Stack

Each armor piece requires 4-5 texture maps applied to the shell:

```
MAP              RESOLUTION    COLOR SPACE     PURPOSE
───────────────────────────────────────────────────────────────
Albedo/Base      1024-2048     sRGB            Surface color and pattern
Normal           1024-2048     Linear          Fine surface detail (rivets,
                                               engravings, chain links, fabric weave)
Roughness        512-1024      Linear          Matte vs glossy (cloth=rough,
                                               polished steel=smooth)
Metalness        512-1024      Linear          Metal vs non-metal (0 or 1,
                                               with blending at edges)
Displacement     512-1024      Linear          Low-frequency shape variation
(optional)                                     (raised ridges, recessed panels)
```

### 3.2 Texture Provider Strategy

Two primary providers, tested head-to-head in Phase 0:

**Provider A: Meshy v6 Retexture (already integrated)**

- Accepts arbitrary GLBs via `model_url`
- `enable_original_uv: true` preserves shell UV layout
- Geometry is NOT modified — only textures change
- `enable_pbr: true` for metallic, roughness, normal maps
- `remove_lighting: true` (meshy-6+) strips baked lighting for clean PBR
- ~$0.20/call, ~2-5 min

```typescript
const result = await meshyService.startRetextureTask(
  { modelUrl: shellGlbUrl },
  { imageUrl: conceptArtUrl },
  { enableOriginalUV: true, enablePBR: true, aiModel: 'meshy-6', removeLighting: true }
);
```

**Provider B: Tripo `import_model` + `texture_model`**

- Upload shell GLB via `import_model` (accepts GLB/FBX/OBJ)
- Run `texture_model` with concept art as style reference + text prompt
- Full PBR output (albedo, normal, roughness, metalness)
- UV preservation confirmed in user reports
- Per-part texturing available via `part_names` (if shell has multiple zones)
- ~$0.30/call, ~1-3 min

```python
task_id = client.import_model(file=shell_glb_path)
client.wait_for_task(task_id)
texture_task = client.texture_model(
    original_model_task_id=task_id,
    texture_prompt="iron plate armor with skull engravings",
    style_image=concept_art_path,
    pbr=True, texture_quality="detailed"
)
```

**Provider C: Self-hosted ComfyUI + StableGen (for displacement maps)**

No commercial API generates mesh-specific displacement maps. For armor needing geometric detail beyond normal maps (raised ridges, sculpted panels), self-host:
1. Render shell from 6 angles with depth/normal passes
2. SDXL/FLUX + ControlNet depth with concept art as IP-Adapter reference
3. PBR decomposition via StableGen — extracts height map
4. Apply height to subdivided shell

Reserve for rare/legendary tiers. Requires 24GB+ VRAM GPU server.

> **UNVALIDATED RISK**: No public examples exist of either Meshy or Tripo retexturing a body-shaped open shell mesh. Both were likely trained on complete objects. **Must run proof-of-concept before committing.**

### 3.3 Material Tier Variants

RuneScape's tier system (bronze -> iron -> steel -> mithril -> adamant -> rune -> dragon) is the same geometry with different materials. This maps perfectly to the shell system:

```
BASE ARMOR: "platebody" (body slot, plate bulk)
    |
    +-- Bronze:  warm copper albedo, high roughness (0.7), low metalness (0.3)
    +-- Iron:    dark grey albedo, medium roughness (0.5), high metalness (0.8)
    +-- Steel:   silver albedo, low roughness (0.3), high metalness (0.9)
    +-- Mithril: blue-tinted steel, low roughness (0.2), high metalness (0.9)
    +-- Adamant: deep green, very low roughness (0.15), high metalness (0.95)
    +-- Rune:    cyan/teal, polished, very low roughness (0.1), metalness (1.0)
    +-- Dragon:  red/black, unique textures, DIFFERENT GEOMETRY (Tier 2 pipeline)
```

**Tiers 1-6**: Same shell mesh, different textures. Each variant is a single retexture call with a tier-specific style prompt. 6 calls in parallel = 6 armor tiers. ~$1.20-1.80 total.

**Tier 7+ (Dragon, Barrows, God Wars)**: Unique silhouette. Tier 2 pipeline.

### 3.4 Style Consistency via LoRA

For RuneScape-style visual consistency across all generated armor:

1. **Curate training set**: 200-500 screenshots of OSRS/RS3 armor from the wiki
2. **Train SDXL/FLUX LoRA**: Fine-tune with captions describing each piece
3. **Use in all generation paths**: LoRA in ComfyUI pipeline, reference images in Meshy/Tripo calls
4. **Result**: Consistent visual language across all AI-generated equipment

---

## Part 4: Tier 2 — Unique Silhouette Armor via Tripo Full Pipeline

For ~15% of equipment that needs a unique silhouette (boss drops, quest rewards, cosmetic overrides), the shell system isn't enough. These need custom geometry.

**Tripo provides a complete end-to-end pipeline for this** — generation, segmentation, part completion, per-part texturing, retopology, rigging, and export. All task-chained through a single API.

### 4.1 Two Generation Paths

**Path A: `generate_parts` (Preferred for tier variants)**

Generate with pre-segmented output. The AI produces separate meshes for body, helmet, chestplate, etc. from the start — no post-hoc segmentation needed.

```
1. image_to_model with generate_parts=true     Geometry only (no texture/PBR)
   |                                            Parts already separated
   v
2. mesh_completion per part (HoloPart)          Reconstructs complete geometry
   |                                            for each part including hidden
   v                                            surfaces
3. texture_model per part with part_names       Different prompts per part:
   |                                            "iron plate armor" for chest,
   v                                            "human skin" for exposed body
4. highpoly_to_lowpoly per part (Smart Mesh)    Learned retopology -> clean
   |                                            game-ready quads/tris
   v                                            bake=true transfers detail
5. animate_rig with spec: "mixamo"              Mixamo-compatible skeleton
   |                                            Maps to VRM humanoid bones
   v
6. convert_model with force_symmetry            GLB export, bilateral symmetry
   |  + part_names for individual export        auto_size for world-scale
   v
   Final armor parts as separate GLBs
```

**Why Path A is preferred**: Per-part texturing means tier variants are trivial. Generate geometry once (steps 1-2), then retexture with different prompts per tier (step 3 x N tiers). The same geometry gets "bronze plate armor," "mithril plate armor," "rune plate armor" textures. This matches Tier 1's "same geometry, different textures" philosophy but with AI-generated geometry instead of body-derived shells.

**Constraint**: `generate_parts` requires `texture=false, pbr=false, quad=false`. You get geometry-only output. Texturing happens afterward via `texture_model`.

**Path B: Generate textured, then segment (Better single-piece quality)**

Generate a fully textured model first, then segment afterward.

```
1. image_to_model (texture=true, pbr=true)      Full textured model
   |
   v
2. mesh_segmentation                             AI identifies body vs armor
   |
   v
3. mesh_completion per part (HoloPart)           Complete hidden geometry
   |
   v
4. highpoly_to_lowpoly per part                  Game-ready topology
   |
   v
5. animate_rig with spec: "mixamo"               Mixamo skeleton
   |
   v
6. convert_model + part_names                    Export individual pieces
```

**Advantage**: Single-piece texture quality is higher because the model was generated with textures from the start. **Disadvantage**: Tier variants require regenerating the entire model with different prompts (no per-part retexturing on pre-textured models without disrupting existing textures).

### 4.2 Cost and Timing

```
PATH A (generate_parts — preferred for tier variants):
─────────────────────────────────────────────────────────────────────
Step                       Credits    Cost      Time
Concept art (GPT-Image-1)  N/A       ~$0.08    ~10s
image_to_model + parts     60        $0.60     ~2-3 min
mesh_completion            ~10       $0.10     ~30s
texture_model (1 tier)     30        $0.30     ~1-2 min
highpoly_to_lowpoly        20        $0.20     ~30s
animate_rig                10        $0.10     ~30s
convert_model              ~5        $0.05     ~10s
─────────────────────────────────────────────────────────────────────
1 TIER TOTAL                         ~$1.43    ~5-7 min
6 TIERS (reuse steps 1-3,5-7)       ~$2.93    ~8-12 min
  (only step 4 repeats per tier)

PATH B (segment after — single hero piece):
─────────────────────────────────────────────────────────────────────
image_to_model (textured)  30-50     $0.30-0.50  ~2-3 min
mesh_segmentation          ~10       $0.10       ~30s
mesh_completion            ~10       $0.10       ~30s
highpoly_to_lowpoly        20        $0.20       ~30s
animate_rig                10        $0.10       ~30s
convert_model              ~5        $0.05       ~10s
─────────────────────────────────────────────────────────────────────
TOTAL                                ~$0.85-1.05  ~4-6 min
```

### 4.3 The Critical Unknown: Does Segmentation Work for Armor?

**No published examples exist of Tripo segmenting armor from a character body.** All demonstrated examples are furniture, robots, and accessories. HoloPart was trained on Objaverse + ABO + PartObjaverse-Tiny — mostly manufactured objects, not articulated characters with clothing.

**Phase 0 must validate this** (see Part 10). If segmentation doesn't reliably separate armor from body:
- `generate_parts` may still work (it segments at generation time, not post-hoc)
- Fallback to vertex-distance extraction against base avatar mesh (existing approach, but noisy)
- Fallback to Tripo Studio's manual brush tool for boundary refinement

### 4.4 Smart Low-Poly: Why It Matters Here

Standard AI-generated meshes have messy, unpredictable topology unsuitable for game rendering and animation. Tripo's `highpoly_to_lowpoly` (Smart Mesh P1.0) solves this with **learned retopology** — not simple decimation but a model that produces organized edge flow and predictable polygon structure in ~2 seconds.

Key features for our pipeline:
- `part_names` parameter: retopologize individual armor parts after segmentation
- `bake=true`: transfers high-poly surface detail to normal maps on the low-poly output
- `quad=true/false`: choose quad or triangle topology
- `face_limit`: precise polycount control (e.g., 2000 for a chestplate, 500 for a gauntlet)
- Result: animation-ready topology without manual cleanup

### 4.5 Rigging with UniRig

Tripo's auto-rigging (`animate_rig`) uses UniRig — a SIGGRAPH 2025 system with:
- `spec: "mixamo"` generates Mixamo-compatible skeleton hierarchy
- Mixamo bones map directly to VRM humanoid bones (your existing `vrmAnimationRetarget.ts`)
- Supports biped, quadruped, avian, and more via `rig_type`
- Spring bone prediction for hair/cloth (VRoid-style)

For armor that needs skinning (Tier 2 body-wrapping pieces), this produces weights compatible with your existing `EquipmentVisualHelpers.ts` skeleton-sharing code.

### 4.6 Verification via Animation Retarget

After rigging, immediately verify the armor animates correctly:

```python
retarget_task = client.retarget_animation(
    original_model_task_id=rig_task_id,
    animations=["preset:walk", "preset:run", "preset:slash"],
    out_format="glb",
    bake_animation=True
)
```

If the armor clips, deforms badly, or doesn't follow the body during walk/run/slash animations, the piece needs manual adjustment before shipping. This automated check catches rigging problems before they reach players.

### 4.7 When to Use Tier 2 vs Tier 1

```typescript
function selectGenerationTier(item: ItemDefinition): GenerationTier {
  // Tier 3: non-body equipment
  if (['weapon', 'shield', 'amulet', 'ring', 'arrows'].includes(item.slot)) {
    return Tier.STANDALONE;
  }

  // Tier 2: unique silhouette items
  if (item.hasCustomSilhouette || item.rarity >= Rarity.DRAGON || item.isCosmetic) {
    return Tier.TRIPO_FULL_PIPELINE;
  }

  // Tier 1: standard armor (vast majority)
  return Tier.BODY_SHELL;
}
```

---

## Part 5: Tier 3 — Bone-Attached Standalone Equipment

Weapons, shields, amulets, rings, arrows, and capes don't wrap the body. They exist as independent objects attached to bones.

### 5.1 Pipeline

```
USER INPUT: "rune scimitar with blue glow"
                    |
                    v
           GPT-Image-1 concept art
                    |
                    v
           Tripo image_to_model
           (quad topology, PBR textures)
                    |
                    v
           highpoly_to_lowpoly (Smart Mesh)
           (game-ready retopology, bake detail to normals)
                    |
                    v
           animate_rig with spec: "mixamo" (if applicable)
                    |
                    v
           convert_model with auto_size, force_symmetry
                    |
                    v
         Orient + Scale to Slot
         +-------------------------------+
         | weapon -> grip aligned to     |
         |           hand bone Z-axis    |
         | shield -> face outward from   |
         |           left forearm        |
         | cape   -> drape from          |
         |           upperChest bone     |
         | amulet -> hang from neck bone |
         +---------------+---------------+
                         v
              Store with attachment
              metadata in GLB userData
```

### 5.2 Auto-Orientation

GPT-4V analyzes the generated mesh to determine grip point, facing direction, and up vector:

```
INPUT: weapon GLB + "sword" type tag
OUTPUT: {
  gripPoint: Vector3,
  forwardAxis: Vector3,
  upAxis: Vector3,
  relativeMatrix: Matrix4
}
```

Stored in the GLB's `userData.hyperscape` field, matching the existing `EquipmentAttachmentData` interface.

### 5.3 Cost per Standalone Item

```
Concept art (GPT-Image-1)     ~$0.08
image_to_model (Tripo)        ~$0.30  (20 credits + detailed texture)
highpoly_to_lowpoly            $0.20
convert_model                  $0.05
─────────────────────────────────────
TOTAL                         ~$0.63  ~3-5 min
```

---

## Part 6: Runtime Equipment System

### 6.1 Architecture Change

```
CURRENT:
  equip(item) -> load GLB -> attach to bone -> done

NEW:
  equip(item) -> determine tier ->
    TIER 1 (shell): swap material on pre-loaded slot mesh
    TIER 2 (unique): load GLB -> replace slot mesh (pre-fitted during generation)
    TIER 3 (standalone): load GLB -> attach to bone (unchanged)
```

### 6.2 Slot Mesh Management

Each player entity gets slot mesh instances at avatar load time:

```typescript
interface PlayerSlotMeshes {
  helmet: {
    mesh: THREE.SkinnedMesh;
    currentBulk: BulkClass;
    defaultMaterial: THREE.Material;     // "bare skin"
    equippedMaterial: THREE.Material | null;
  };
  body: { /* same */ };
  legs: { /* same */ };
  boots: { /* same */ };
  gloves: { /* same */ };
}
```

**On avatar VRM load:**
1. Hide VRM's default body mesh regions for equippable slots
2. Load corresponding shell meshes (cloth bulk by default)
3. Bind shells to VRM skeleton (same bone hierarchy)
4. Apply "bare skin" default material

**Skeleton sharing is already proven** — `EquipmentVisualHelpers.ts` (lines 229-248) already rebinds SkinnedMeshes to the player's skeleton.

**On armor equip (Tier 1):**
1. Determine bulk class from item data
2. If bulk differs -> swap shell mesh geometry
3. Load PBR textures from CDN
4. Create `MeshStandardNodeMaterial`, apply to slot mesh
5. Blend boundaries with adjacent slots

**On armor equip (Tier 2):**
1. Load the pre-rigged armor GLB (already fitted + retopologized by Tripo pipeline)
2. Bind to VRM skeleton
3. Replace the slot mesh entirely

### 6.3 Boundary Blending

Pre-computed boundary blend weights (vertex color) blend adjacent slots:

```glsl
// TSL pseudocode
fn getSlotColor(uv: vec2f, boundaryWeight: f32) -> vec4f {
    let armorColor = textureSample(armorAlbedo, uv);
    let skinColor  = textureSample(skinAlbedo, uv);
    return mix(skinColor, armorColor, boundaryWeight);
}
```

### 6.4 TSL Material Setup

```typescript
function createArmorMaterial(textures: ArmorTextureSet): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.map = textures.albedo;              // sRGB
  material.normalMap = textures.normal;         // Linear
  material.roughnessMap = textures.roughness;   // Linear
  material.metalnessMap = textures.metalness;   // Linear

  for (const tex of [textures.albedo, textures.normal, textures.roughness, textures.metalness]) {
    if (tex) tex.anisotropy = 16;
  }

  material.envMapIntensity = 1.0;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;

  return material;
}
```

---

## Part 7: The Layered Shell + Detail Mesh Architecture

Some Tier 1 armor benefits from small protruding elements without the full Tier 2 pipeline.

### 7.1 Detail Meshes

Small (50-500 polygon) standalone meshes parented to bones on the shell:

```
PLATEBODY ASSEMBLY:
+─────────────────────────────────────────────────+
|  Shell mesh (body slot, plate bulk)             |
|  +-- Material: iron platebody PBR textures      |
|  +-- Detail: left_pauldron (bone: leftShoulder) |
|  |   +-- 200 polys, rigid, no deformation       |
|  +-- Detail: right_pauldron (bone: rightShoulder|
|  |   +-- 200 polys, rigid, no deformation       |
|  +-- Detail: belt_buckle (bone: hips)           |
|      +-- 80 polys, rigid                        |
+─────────────────────────────────────────────────+
```

### 7.2 Generation

GPT-4V analyzes concept art for protruding elements, returns JSON with name, bone, size, description. Each element is generated via Tripo `image_to_model` + `highpoly_to_lowpoly` and packed into the armor GLB.

**Alternative**: Use Tripo's `generate_parts` on the concept art. If the AI already separates pauldrons/buckles as distinct parts, skip the GPT-4V analysis step and use the generated parts directly.

---

## Part 8: Complete Asset Pipeline Flows

### 8.1 Tier 1: Standard Armor Set (6 Tier Variants)

```
TIME    ACTION                                          COST
─────────────────────────────────────────────────────────────
0:00    User submits description + slot + bulk
0:02    GPT-Image-1 concept art (3 views)               $0.24
0:05    GPT-4V protruding element analysis               $0.03
0:08    -- PARALLEL FORK --
        |
        +- Branch A: Retexture shell x 6 tiers          $1.20-1.80
        |  (Meshy or Tripo, parallel per tier)
        |
        +- Branch B: Tripo generate detail meshes        $0.30
        |  (pauldrons etc. from GPT-4V analysis)
        |
~5:00   -- PARALLEL JOIN --
5:05    Assembly: shell + textures + details -> GLB
5:10    Preview in Asset Forge
─────────────────────────────────────────────────────────────
TOTAL   ~5 min, ~$1.77-2.37 for complete 6-tier set
        ~$0.30-0.40 per tier variant
```

### 8.2 Tier 2: Unique Armor Set via Tripo Pipeline (6 Tier Variants)

```
TIME    ACTION                                          COST
─────────────────────────────────────────────────────────────
0:00    User submits description
0:02    GPT-Image-1 concept art                          $0.08
0:05    Tripo image_to_model + generate_parts            $0.60
~3:00   Tripo mesh_completion (HoloPart) per part        $0.10
~3:30   -- PARALLEL: texture_model x 6 tiers --          $1.80
        (per-part retexture with tier-specific prompts)
~6:00   Tripo highpoly_to_lowpoly per part               $0.20
~6:30   Tripo animate_rig (Mixamo)                       $0.10
~7:00   Tripo convert_model + force_symmetry             $0.05
~7:00   Preview + animate_retarget verification          $0.05
─────────────────────────────────────────────────────────────
TOTAL   ~7 min, ~$2.98 for complete 6-tier set
        ~$0.50 per tier variant
        Zero manual cleanup needed (if segmentation works)
```

### 8.3 Tier 3: Standalone Weapon

```
TIME    ACTION                                          COST
─────────────────────────────────────────────────────────────
0:00    GPT-Image-1 concept art                          $0.08
0:05    Tripo image_to_model (textured, PBR)             $0.30
~3:00   Tripo highpoly_to_lowpoly (Smart Mesh)           $0.20
~3:30   Tripo convert_model + auto_size                  $0.05
~3:30   GPT-4V auto-orientation analysis                 $0.03
─────────────────────────────────────────────────────────────
TOTAL   ~4 min, ~$0.66
```

---

## Part 9: Technology Stack

### 9.1 Recommended Stack

```
CONCEPT ART:                GPT-Image-1 (already integrated)
ANALYSIS:                   GPT-4V (protruding elements, auto-orientation)

TIER 1 TEXTURE (PRIMARY):  Phase 0 determines: Meshy v6 or Tripo texture_model
TIER 1 TEXTURE (BACKUP):   Whichever wasn't selected as primary
TIER 1 DISPLACEMENT:       Self-hosted ComfyUI + StableGen (rare/legendary only)

TIER 2 FULL PIPELINE:      Tripo 3.0 (generate_parts -> complete -> texture -> retopo -> rig)
TIER 2 FALLBACK:           Tripo 3.0 (segment after generation) or Meshy-6 + existing fitting

TIER 3 GENERATION:         Tripo 3.0 image_to_model + highpoly_to_lowpoly
TIER 3 FALLBACK:           Meshy-6 Image-to-3D (already integrated)

STYLE CONSISTENCY:         Custom SDXL/FLUX LoRA trained on RuneScape armor
```

### 9.2 Tripo API Reference

All tasks follow the same pattern: POST to create, GET to poll status.

```
BASE URL:  https://api.tripo3d.ai/v2/openapi/task
AUTH:      Bearer tsk_* API key
PRICING:   $0.01 per credit

TASK TYPES USED IN THIS PIPELINE:
──────────────────────────────────────────────────────────────────
image_to_model          20 credits (+20 detailed texture, +40 generate_parts)
text_to_model           20 credits (+20 detailed texture, +40 generate_parts)
multiview_to_model      20 credits (2-4 views: front required)
import_model            Free (uploads external mesh into Tripo pipeline)
texture_model           20-30 credits (text/image prompt, per-part via part_names)
mesh_segmentation       ~10 credits
mesh_completion         ~10 credits (HoloPart, per-part via part_names)
highpoly_to_lowpoly     20 credits (Smart Mesh, per-part via part_names, bake option)
animate_rig             10 credits (spec: "mixamo" or "tripo")
animate_retarget        10 credits (up to 5 animation presets per call)
convert_model           ~5 credits (force_symmetry, auto_size, part_names export)
stylize_model           10 credits (lego, voxel, voronoi)
```

### 9.3 Infrastructure Requirements

**API-only deployment (recommended to start):**
- Meshy API key (existing)
- Tripo API key (~$30/month Advanced plan, or pay-per-use)
- No GPU server needed
- Total API cost per month depends on volume:
  - 100 Tier 1 armor sets/month: ~$180-240
  - 20 Tier 2 armor sets/month: ~$60
  - 50 Tier 3 weapons/month: ~$33

**Full pipeline with displacement (optional self-hosted):**
- 1x GPU with 24GB+ VRAM
- ComfyUI + FLUX + ControlNet + StableGen
- ~$200-400/month cloud or ~$2,000 one-time hardware

---

## Part 10: Implementation Phases

### Phase 0: Proof of Concept (3-5 days) — MUST DO FIRST

**Goal**: Validate the critical unknowns before investing weeks.

```
POC-1: Shell Offset Viability
  - Open VRM avatar in Blender
  - Use Solidify modifier (Complex mode, Clamp) on torso region
  - Test at cloth (5mm), leather (12mm), plate (30mm) offsets
  - EVALUATE: Are armpits/groin acceptable?
  - GATE: If yes -> proceed. If no -> use hand-authored shells (Section 2.5).

POC-2: Meshy Retexture on Shell
  - Export one shell from POC-1 as GLB with clean UVs
  - Upload to Meshy retexture API via model_url
  - Test: "iron plate armor", "leather armor", "cloth robe"
  - EVALUATE: Does Meshy produce good textures on a body-shaped open mesh?

POC-3: Tripo import_model + texture_model on Shell
  - Upload same shell GLB via Tripo import_model
  - Run texture_model with same prompts as POC-2
  - EVALUATE: Compare quality, UV preservation, PBR output vs Meshy
  - GATE: Select primary Tier 1 texture provider based on POC-2 vs POC-3.

POC-4: Tripo generate_parts on Armored Character
  - Generate "knight in iron plate armor" via image_to_model + generate_parts=true
  - Examine: does it produce usable separate helmet/chest/legs parts?
  - Run mesh_completion on each part
  - Run texture_model per part with "iron plate armor" prompt
  - EVALUATE: Are the textured parts usable as game equipment?
  - GATE: If yes -> Tier 2 uses Tripo full pipeline.
          If no -> Tier 2 uses single-image generation + vertex-distance extraction.

POC-5: Tripo mesh_segmentation on Armored Character
  - Generate "knight in plate armor" via image_to_model (textured, PBR)
  - Run mesh_segmentation
  - EVALUATE: Does AI correctly separate armor from body?
  - This tests Path B as alternative to Path A (generate_parts).
```

**Cost of Phase 0**: ~$5-10 in API calls. 1-3 days of work. Validates every major assumption.

### Phase 1: Shell System Foundation (2-3 weeks)

**All new code. No existing files modified.** (See Part 1.5)

```
+-- NEW: src/services/armor-pipeline/ShellExtractionService.ts
|   +-- Parse VRM skeleton -> identify slot bone groups
|   +-- Extract per-slot mesh regions by bone weight
|   +-- Compute offset shells at 4 bulk classes
|   +-- Curvature-based offset clamping at concavities
|   +-- Constrained Laplacian smooth
|   +-- Self-intersection detection and resolution
|   +-- Standardized UV unwrapping per slot
|   +-- Boundary blend weights
|   +-- Export shell library as GLBs
|
+-- NEW: src/services/armor-pipeline/ShellLibrary.ts
|   +-- Load shells at avatar creation
|   +-- Bind to VRM skeleton
|   +-- Material swap on equip/unequip
|   +-- Bulk class swap
|
+-- NEW: src/components/ArmorPipeline/ShellGeneratorTab.tsx
|   +-- UI for shell generation, preview, bulk class selection
|   +-- Standalone viewer (does NOT modify existing EquipmentViewer)
|
+-- Manual test: hand-paint PBR maps for 1 platebody
    +-- Verify rigging, blending, animation on shell
    +-- Validate approach before adding AI texturing
```

### Phase 2: AI Texture Generation (1-2 weeks)

**All new code. No existing files modified.** (See Part 1.5)

```
+-- NEW: src/services/armor-pipeline/ArmorTextureService.ts
|   +-- Integrate winning provider from POC (Meshy or Tripo)
|   +-- Shell GLB upload + retexture flow
|   +-- Style prompt construction from description + tier
|   +-- PBR texture download and application
|
+-- NEW: src/services/armor-pipeline/TierVariantService.ts
|   +-- Per-tier style prompts (bronze through rune)
|   +-- Parallel retexture calls
|   +-- Texture caching by tier + description hash
|
+-- NEW: src/components/ArmorPipeline/ArmorPreviewTab.tsx
|   +-- Tier selector, bulk class dropdown
|   +-- Real-time tier preview switching
|   +-- (Separate tab from existing Equipment Viewer)
|
+-- Test: generate 5 armor sets across slots and bulk classes
```

### Phase 3: Detail Mesh Pipeline (1 week)

**All new code. No existing files modified.** (See Part 1.5)

```
+-- NEW: src/services/armor-pipeline/DetailMeshService.ts
|   +-- GPT-4V protruding element analyzer (or Tripo generate_parts)
|   +-- Detail mesh generation via Tripo image_to_model + Smart Mesh
|   +-- Runtime: load detail meshes from armor GLB, parent to bones
+-- Test: armor with pauldrons, buckles
```

### Phase 4: Tier 2 Tripo Full Pipeline (2-3 weeks)

**All new code. No existing files modified.** (See Part 1.5)

```
+-- NEW: src/services/armor-pipeline/TripoAPIService.ts
|   +-- import_model, image_to_model, generate_parts
|   +-- mesh_segmentation, mesh_completion
|   +-- texture_model with part_names
|   +-- highpoly_to_lowpoly with part_names
|   +-- animate_rig with Mixamo spec
|   +-- animate_retarget for verification
|   +-- convert_model with force_symmetry, part_names export
|
+-- NEW: src/services/armor-pipeline/PipelineOrchestrator.ts
|   +-- Task chaining (each step's task_id feeds the next)
|   +-- Error handling and retry logic
|
+-- NEW: src/components/ArmorPipeline/TripoPipelineTab.tsx
|   +-- Progress tracking UI
|   +-- Per-part preview and export controls
|
+-- NEW: server/services/armor-pipeline/tripo-routes.ts
|   +-- Server-side API key management and proxied Tripo calls
|
+-- Armor export integration
|   +-- Per-part GLB download
|   +-- Metadata generation (slot, bone mapping, attachment data)
|   +-- Output format compatible with EquipmentVisualSystem (but NO changes to it yet)
|
+-- Test: dragon armor, ornate sets, boss drops
    +-- Verify animation, rigging, visual quality
```

### Phase 5: Polish + Integration + Deprecation (1-2 weeks)

**THIS is the only phase where existing code gets modified.**

```
+-- Style LoRA training (200-500 RuneScape armor images)
+-- CDN + KTX2 texture compression
+-- LOD system (texture resolution + detail mesh visibility by distance)
|
+-- FIRST TIME TOUCHING EXISTING CODE:
|   +-- Wire EquipmentVisualSystem to load from new pipeline output
|   +-- Add new pipeline as the default path, old pipeline as fallback
|   +-- Verify full in-game equipment flow end-to-end
|
+-- Only AFTER full validation, deprecate old fitting pipeline:
    +-- Remove ArmorFittingService.ts (2,799 lines)
    +-- Remove MeshFittingService.ts (4,088 lines)
    +-- Keep WeightTransferService.ts (fallback for Tier 2 if Tripo rig fails)
    +-- Keep BoneDiagnostics.ts (validation)
    +-- Net deletion: ~6,900 lines
```

---

## Part 11: Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Shell self-intersection at concavities | HIGH | HIGH | Curvature clamping + vertex deletion. Fallback: hand-authored shells (2.5). **POC-1 validates.** |
| Retexture quality poor on open shell | MEDIUM | HIGH | Test both Meshy and Tripo in POC-2/3. Fallback: self-hosted ComfyUI. |
| Tripo `generate_parts` doesn't separate armor | MEDIUM | HIGH | **POC-4 validates.** Fallback: Path B (segment after) or vertex-distance extraction. |
| Tripo segmentation can't distinguish armor vs body | MEDIUM | MEDIUM | **POC-5 validates.** Fallback: `generate_parts` (Path A) or manual Tripo Studio brush. |
| HoloPart can't reconstruct body under armor | HIGH | MEDIUM | Trained on furniture, not characters. If fails, use parts as-is (surface only). |
| Smart Mesh retopology inadequate for animation | LOW | MEDIUM | `animate_retarget` verification catches this. Manual retopo in Blender as fallback. |
| Tripo API downtime/rate limits | LOW | MEDIUM | Meshy as fallback for texturing. Keep existing pipeline as emergency fallback. |
| Shell boundary blending visible seams | MEDIUM | MEDIUM | Wider overlap zone, per-fragment blending, test with animations. |
| Style inconsistency across providers | MEDIUM | LOW | LoRA training, consistent style prompts, human review gate. |

---

## Part 12: What This Achieves

### Before (Current Pipeline)
- Generate standalone armor (MeshyAI): **$0.40, 5-10 min**
- Shrinkwrap fit (7,900 lines): **variable, often fails**
- Weight transfer (approximate): **animation artifacts**
- One tier per full run: **$0.40+ each**
- 6-tier set: **~$2.40+, 30-60 min, unreliable**

### After (Shell + Tripo Pipeline)

**Tier 1 (80% of armor):**
- Pre-computed shells: **free at runtime**
- AI retexture: **$0.20-0.30, 2-5 min per tier**
- Perfect rigging: **zero fitting, zero artifacts**
- 6-tier set: **~$1.77-2.37, ~5 min, reliable**

**Tier 2 (15% — unique silhouette):**
- Tripo full pipeline: **~$2.98 for 6-tier set, ~7 min**
- AI segmentation + completion + retopo + rigging
- Per-part texturing for tier variants
- Mixamo-compatible skeleton for VRM binding

**Tier 3 (5% — weapons/accessories):**
- Tripo + Smart Mesh: **~$0.63, ~4 min**
- Game-ready topology automatically

### The Numbers
```
COST:     ~50% reduction for standard armor
TIME:     ~85% reduction (30-60 min -> 5-7 min)
QUALITY:  Dramatically better (perfect rigging, clean topology)
CODE:     ~6,900 lines to delete
SCALING:  Tier variants are texture swaps, not full pipeline runs
```

### What's Genuinely Novel

1. **Automatic body-to-shell mesh generation** for Tier 1. No shipping game does this. If the self-intersection problem is solved, this is a significant innovation.

2. **Tripo's full task-chained pipeline for Tier 2.** Using `generate_parts` -> `mesh_completion` -> per-part `texture_model` -> `highpoly_to_lowpoly` -> `animate_rig` as an end-to-end armor generation pipeline through a single API. This collapses what was previously a multi-provider, multi-tool process into one coherent chain.

3. **Per-part retexturing for tier variants.** Generate geometry once, retexture per part N times for N material tiers. The same paradigm as Tier 1's shell system, but applied to AI-generated geometry via Tripo's `part_names` parameter.

### The Core Principle

The fitting problem is self-inflicted. The shell system dissolves it for standard armor. Tripo's segmentation + completion pipeline dissolves it for unique armor. In both cases, the AI's creative work happens on geometry that already fits — either because it was derived from the body (Tier 1) or because it was generated as properly segmented parts (Tier 2). No shrinkwrap. No vertex pushing. No 7,900 lines of adversarial geometry code.

---

## Appendix A: Research Validation Log (2026-04-05)

| Claim | Status | Finding |
|---|---|---|
| Meshy retexture accepts arbitrary GLBs | CONFIRMED | `model_url` accepts .glb/.gltf/.obj/.fbx/.stl |
| Meshy preserves UVs with `enable_original_uv` | CONFIRMED | API docs + changelog |
| Meshy doesn't modify geometry | CONFIRMED | Retexture is texture-only |
| Tripo `import_model` accepts external meshes | CONFIRMED | GLB/FBX/OBJ upload, then full pipeline available |
| Tripo `texture_model` preserves UVs | CONFIRMED | User reports + documentation |
| Tripo per-part texturing via `part_names` | CONFIRMED | API parameter on texture_model |
| Tripo `generate_parts` produces segmented geometry | CONFIRMED | But incompatible with texture/PBR/quad |
| Tripo `mesh_completion` available via API | CONFIRMED | Task type with part_names support |
| Tripo Smart Mesh is learned retopology (not decimation) | CONFIRMED | Organized edge flow, ~2 second processing |
| Tripo `animate_rig` supports Mixamo skeleton | CONFIRMED | `spec: "mixamo"` parameter |
| Tripo `force_symmetry` on convert | CONFIRMED | Bilateral symmetry enforcement |
| Shell extraction from VRM is feasible | CONFIRMED | Codebase already has computeBodyRegions() + extractBodyVertices() |
| Skeleton sharing works in Three.js | CONFIRMED | Already implemented in EquipmentVisualHelpers.ts |
| Normal offset self-intersects at concavities | CONFIRMED | Guaranteed at armpits, groin. Requires clamping. |
| Hunyuan3D 2.1 accepts multi-view input | REJECTED | Released weights are single-image only |
| IP-Adapter + ControlNet work well together | PARTIALLY | Documented conflict at high IP-Adapter weights |
| RuneScape uses shell overlay | MISLEADING | Uses full body-part replacement with skin geometry included |
| Any game does automatic shell generation | NO | All systems use artist-authored equipment |
| Tripo segmentation works on armored characters | UNVALIDATED | No published examples. POC-4/5 required. |
| HoloPart reconstructs body under armor | UNVALIDATED | Trained on furniture/objects, not characters. |
| Meshy/Tripo retexture works on body-shaped shells | UNVALIDATED | No public examples. POC-2/3 required. |

## Appendix B: Tripo API Quick Reference

```
ENDPOINT:   POST https://api.tripo3d.ai/v2/openapi/task
AUTH:       Authorization: Bearer tsk_*
POLL:       GET  https://api.tripo3d.ai/v2/openapi/task/{task_id}
UPLOAD:     POST https://api.tripo3d.ai/v2/openapi/upload (multipart/form-data)
BALANCE:    GET  https://api.tripo3d.ai/v2/openapi/balance

TASK TYPES:
  Generation:     text_to_model, image_to_model, multiview_to_model, refine_model
  Import:         import_model (gateway to all post-processing on external meshes)
  Mesh Editing:   mesh_segmentation, mesh_completion, highpoly_to_lowpoly
  Texturing:      texture_model (text/image prompt, style_image, part_names)
  Animation:      animate_prerigcheck, animate_rig, animate_retarget
  Post-Process:   convert_model, stylize_model

KEY PARAMETERS:
  generate_parts: true     Pre-segmented output (requires texture=false, pbr=false)
  smart_low_poly: true     Clean topology during generation
  part_names: [...]        Apply operation to specific parts only
  force_symmetry: true     Bilateral symmetry on convert
  auto_size: true          Normalize to real-world dimensions
  spec: "mixamo"           Mixamo-compatible skeleton for rigging
  bake: true               Transfer high-poly detail to texture maps
  texture_quality: "detailed"  Higher quality textures (+20 credits)

OUTPUT URLS (expire after 5 min):
  output.model             GLB download URL
  output.pbr_model         PBR variant URL
  output.base_model        Untextured variant URL
  output.rendered_image    Preview render (WebP)

PYTHON SDK:  pip install tripo3d (v0.3.12, MIT license)
```
