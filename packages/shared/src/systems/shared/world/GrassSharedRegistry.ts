/**
 * GrassSharedRegistry — module-level state for the grass shader.
 *
 * Owns the grid-exclusion + character-bending texture state that
 * ProceduralGrass reads in its TSL shader code, and that
 * GrassExclusionGrid / CharacterInfluenceManager push updates into.
 *
 * Lives in shared (rather than ProceduralGrass) so the in-shared
 * sibling modules (`GrassExclusionGrid`, `CharacterInfluenceManager`)
 * can keep calling the setters without depending on the migrated
 * ProceduralGrass class. Extracted 2026-04-25.
 *
 * Pattern matches `VegetationSsboUtils` — module-level state with
 * setter exports that other code calls; consumers read live bindings
 * through ES-module re-imports.
 */

import { texture, uniform } from "three/tsl";

// ============================================================================
// GRID-BASED EXCLUSION — texture from GrassExclusionGrid
// ============================================================================
// GrassExclusionGrid queries CollisionMatrix/TerrainSystem for blocked tiles.
// ProceduralGrass samples this texture for O(1) per-blade exclusion check.

/** Flag to use grid-based exclusion instead of legacy vegetation exclusion */
export let useGridBasedExclusion = true;

/** Grid exclusion texture node (set by GrassExclusionGrid) */
export let gridExclusionTextureNode: ReturnType<typeof texture> | null = null;

/** Grid exclusion uniforms */
export const uGridExclusionCenterX = uniform(0);
export const uGridExclusionCenterZ = uniform(0);
export const uGridExclusionWorldSize = uniform(256);

/**
 * Set grid-based exclusion texture for the shader.
 * Called by GrassExclusionGrid when texture is updated.
 */
export function setGridExclusionTexture(
  textureNode: ReturnType<typeof texture> | null,
  centerX: number,
  centerZ: number,
  worldSize: number,
): void {
  gridExclusionTextureNode = textureNode;
  uGridExclusionCenterX.value = centerX;
  uGridExclusionCenterZ.value = centerZ;
  uGridExclusionWorldSize.value = worldSize;
}

/** Enable or disable grid-based exclusion. */
export function setUseGridExclusion(use: boolean): void {
  useGridBasedExclusion = use;
}

// ============================================================================
// MULTI-CHARACTER BENDING — texture from CharacterInfluenceManager
// ============================================================================
// Characters (players, NPCs, mobs) bend grass as they walk through it.
// CharacterInfluenceManager packs character data into a 64x2 RGBA Float
// texture; ProceduralGrass samples it per-blade.

/** Flag to use multi-character bending instead of single-player trail */
export let useMultiCharacterBending = true;

/** Character data texture (64x2: row 0 = pos+radius, row 1 = vel+speed) */
export let characterBendingTextureNode: ReturnType<typeof texture> | null =
  null;

/** Number of active characters */
export const uCharacterCount = uniform(0);

/** Texture width (max characters tracked) */
export const CHARACTER_TEXTURE_WIDTH = 64;

/**
 * Set multi-character bending texture for the shader.
 * Called by CharacterInfluenceManager when texture is updated.
 */
export function setCharacterBendingTexture(
  textureNode: ReturnType<typeof texture> | null,
  count: number,
): void {
  characterBendingTextureNode = textureNode;
  uCharacterCount.value = count;
}

/** Enable or disable multi-character bending. */
export function setUseMultiCharacterBending(use: boolean): void {
  useMultiCharacterBending = use;
}
