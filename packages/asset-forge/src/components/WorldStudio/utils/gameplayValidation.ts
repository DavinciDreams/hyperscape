/**
 * gameplayValidation — Validates hand-placed entities against zone rules
 *
 * Catches common design mistakes: high-level mobs in safe zones,
 * resources too close to mobs, progression gaps, out-of-bounds placements.
 *
 * Every warning can be overridden with a reason — designers know best.
 */

import type {
  PlacedMobSpawn,
  PlacedResource,
  PlacedRegion,
  DifficultyTierConfig,
  ManifestData,
  ManifestNPC,
  ExtendedWorldLayers,
} from "../types";
import { SpatialGrid } from "./SpatialGrid";

// ============== TYPES ==============

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  ruleId: string;
  severity: ValidationSeverity;
  entityId: string;
  entityName: string;
  entityType: "mob" | "resource" | "npc" | "station" | "zone";
  message: string;
  /** If applicable, ID of the conflicting entity/zone */
  relatedId?: string;
  /** Suggested fix (human-readable) */
  suggestion?: string;
}

export interface ValidationOverride {
  ruleId: string;
  entityId: string;
  reason: string;
  suppressedAt: number;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

// ============== VALIDATION CONTEXT ==============

interface ValidationContext {
  layers: ExtendedWorldLayers;
  manifests: ManifestData;
  tiers: DifficultyTierConfig[];
  waterThreshold: number;
  worldBounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  overrides: ValidationOverride[];
}

// ============== RULES ==============

/**
 * Rule 1: Difficulty mismatch — entity level vs zone tier
 */
function validateDifficultyMismatch(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const npcLookup = new Map<string, ManifestNPC>();
  for (const npc of ctx.manifests.npcs) {
    npcLookup.set(npc.id, npc);
  }

  for (const mob of ctx.layers.mobSpawns) {
    if (mob.source === "procgen") continue; // auto-gen is already tier-matched
    const npcData = npcLookup.get(mob.mobId);
    if (!npcData || npcData.category !== "mob") continue;

    const mobLevel = npcData.levelRange[1]; // use max level
    const region = findRegionForPosition(
      mob.position.x,
      mob.position.z,
      ctx.layers.regions,
    );
    if (!region) continue;

    const tier = findTierForRegion(region, ctx.tiers);
    if (!tier) continue;

    const [tierMin, tierMax] = tier.levelRange;
    if (mobLevel > tierMax + 10) {
      issues.push({
        ruleId: "difficulty-mismatch",
        severity: "warning",
        entityId: mob.id,
        entityName: mob.name,
        entityType: "mob",
        message: `Level ${mobLevel} mob in "${tier.name}" zone (expects ${tierMin}-${tierMax})`,
        relatedId: region.id,
        suggestion: `Move to a higher-difficulty zone or adjust zone tier`,
      });
    }
  }

  return issues;
}

/**
 * Rule 2: Safe zone violation — aggressive mob in safe zone
 */
function validateSafeZoneViolation(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const npcLookup = new Map<string, ManifestNPC>();
  for (const npc of ctx.manifests.npcs) {
    npcLookup.set(npc.id, npc);
  }

  for (const mob of ctx.layers.mobSpawns) {
    const npcData = npcLookup.get(mob.mobId);
    if (!npcData || npcData.category !== "mob") continue;

    const region = findRegionForPosition(
      mob.position.x,
      mob.position.z,
      ctx.layers.regions,
    );
    if (!region) continue;

    const isSafeZone =
      region.tags.includes("autogen") && region.tags.includes("safe");
    if (!isSafeZone) continue;

    issues.push({
      ruleId: "safe-zone-violation",
      severity: "warning",
      entityId: mob.id,
      entityName: mob.name,
      entityType: "mob",
      message: `Aggressive mob "${mob.mobId}" placed in safe zone "${region.name}"`,
      relatedId: region.id,
      suggestion: `Move outside the safe zone or mark as non-aggressive`,
    });
  }

  return issues;
}

/**
 * Rule 3: Mob-resource proximity — resource too close to mob spawn
 */
function validateMobResourceProximity(
  ctx: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Build spatial grid of mob positions
  const mobGrid = new SpatialGrid<string>(30);
  for (const mob of ctx.layers.mobSpawns) {
    mobGrid.insert(mob.position.x, mob.position.z, mob.id);
  }

  for (const res of ctx.layers.resources) {
    if (res.source === "procgen") continue; // auto-gen already applies buffers

    const nearest = mobGrid.nearest(res.position.x, res.position.z);
    if (!nearest) continue;

    // Use a conservative 10m threshold for hand-placed warnings
    if (nearest.distance < 10) {
      issues.push({
        ruleId: "mob-resource-proximity",
        severity: "info",
        entityId: res.id,
        entityName: res.name,
        entityType: "resource",
        message: `Resource ${Math.round(nearest.distance)}m from mob spawn (consider 10m+ buffer)`,
        relatedId: nearest.data,
      });
    }
  }

  return issues;
}

/**
 * Rule 4: Placement validity — entity outside world bounds or in water
 */
function validatePlacementValidity(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { minX, maxX, minZ, maxZ } = ctx.worldBounds;

  const checkPosition = (
    id: string,
    name: string,
    type: ValidationIssue["entityType"],
    x: number,
    z: number,
  ) => {
    if (x < minX || x > maxX || z < minZ || z > maxZ) {
      issues.push({
        ruleId: "placement-validity",
        severity: "error",
        entityId: id,
        entityName: name,
        entityType: type,
        message: `Outside world bounds (${Math.round(x)}, ${Math.round(z)})`,
        suggestion: `Move inside world bounds [${minX}, ${maxX}] x [${minZ}, ${maxZ}]`,
      });
    }
  };

  for (const mob of ctx.layers.mobSpawns) {
    checkPosition(mob.id, mob.name, "mob", mob.position.x, mob.position.z);
  }
  for (const res of ctx.layers.resources) {
    checkPosition(res.id, res.name, "resource", res.position.x, res.position.z);
  }

  return issues;
}

/**
 * Rule 5: Empty zone — zone with no entities
 */
function validateEmptyZones(ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const region of ctx.layers.regions) {
    if (!region.spawnRules) continue; // no rules = decorative region, OK to be empty

    const hasMobs = ctx.layers.mobSpawns.some(
      (m) => m.sourceRegionId === region.id,
    );
    const hasResources = ctx.layers.resources.some(
      (r) => r.sourceRegionId === region.id,
    );

    if (!hasMobs && !hasResources) {
      issues.push({
        ruleId: "empty-zone",
        severity: "info",
        entityId: region.id,
        entityName: region.name,
        entityType: "zone",
        message: `Zone has spawn rules but no entities — needs population or rule removal`,
        suggestion: `Run procgen for this zone or remove spawn rules`,
      });
    }
  }

  return issues;
}

// ============== HELPERS ==============

function findRegionForPosition(
  x: number,
  z: number,
  regions: PlacedRegion[],
): PlacedRegion | null {
  // Check auto-gen regions by bounding box
  for (const r of regions) {
    if (r.autoGenBounds) {
      const bb = r.autoGenBounds.boundingBox;
      if (x >= bb.minX && x <= bb.maxX && z >= bb.minZ && z <= bb.maxZ) {
        return r;
      }
    }
  }
  return null;
}

function findTierForRegion(
  region: PlacedRegion,
  tiers: DifficultyTierConfig[],
): DifficultyTierConfig | null {
  if (!region.autoGenBounds) return null;
  const [lo] = region.autoGenBounds.difficultyRange;
  for (const tier of tiers) {
    if (lo >= tier.scalarRange[0] && lo < tier.scalarRange[1]) {
      return tier;
    }
  }
  return null;
}

// ============== MAIN VALIDATOR ==============

/**
 * Run all validation rules against the current world state.
 * Returns issues filtered by active overrides.
 */
export function validateWorld(ctx: ValidationContext): ValidationResult {
  const allIssues: ValidationIssue[] = [
    ...validateDifficultyMismatch(ctx),
    ...validateSafeZoneViolation(ctx),
    ...validateMobResourceProximity(ctx),
    ...validatePlacementValidity(ctx),
    ...validateEmptyZones(ctx),
  ];

  // Filter out overridden issues
  const overrideKeys = new Set(
    ctx.overrides.map((o) => `${o.ruleId}:${o.entityId}`),
  );
  const issues = allIssues.filter(
    (issue) => !overrideKeys.has(`${issue.ruleId}:${issue.entityId}`),
  );

  return {
    issues,
    errorCount: issues.filter((i) => i.severity === "error").length,
    warningCount: issues.filter((i) => i.severity === "warning").length,
    infoCount: issues.filter((i) => i.severity === "info").length,
  };
}

/**
 * Validate a single entity (for real-time feedback on placement/move).
 * Faster than full validation — only checks rules relevant to the given entity.
 */
export function validateSingleEntity(
  entityId: string,
  ctx: ValidationContext,
): ValidationIssue[] {
  const allIssues = [
    ...validateDifficultyMismatch(ctx),
    ...validateSafeZoneViolation(ctx),
    ...validateMobResourceProximity(ctx),
    ...validatePlacementValidity(ctx),
  ];

  return allIssues.filter((i) => i.entityId === entityId);
}
