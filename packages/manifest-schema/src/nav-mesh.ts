/**
 * Navigation-mesh manifest schema.
 *
 * Section 15 (UE5 parity — navmesh / pathfinding) of the World
 * Studio AAA plan. Describes offline navmesh bake settings,
 * agent locomotion profiles, and authored nav modifier volumes
 * (e.g. "no-go zone", "swim area", "jump link").
 *
 * Scope: declarative input to the baker + runtime pathfinder.
 * Does NOT describe the solver itself or per-frame steering
 * (those are engine-internal concerns).
 */

import { z } from "zod";

const Vec3 = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  })
  .strict();

/** Bake quality preset — buckets for voxelizer resolution. */
export const NavMeshQualitySchema = z.enum([
  "preview",
  "low",
  "medium",
  "high",
]);
export type NavMeshQuality = z.infer<typeof NavMeshQualitySchema>;

/**
 * Walkable-area tag — a small integer id that runtime filters can
 * include/exclude. 0 reserved for "default walkable".
 */
export const NavAreaTagSchema = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "nav area tag must be lowerCamelCase ASCII identifier",
  );
export type NavAreaTag = z.infer<typeof NavAreaTagSchema>;

/** Agent locomotion profile — describes an NPC class's footprint. */
export const NavAgentProfileSchema = z
  .object({
    id: NavAreaTagSchema,
    /** Human-readable label for editors. */
    name: z.string().min(1),
    /** Cylinder radius in meters. */
    radius: z.number().positive().max(10).default(0.3),
    /** Cylinder height in meters. */
    height: z.number().positive().max(20).default(1.8),
    /** Max step-up in meters the agent can traverse without jumping. */
    maxStep: z.number().min(0).max(5).default(0.4),
    /** Max slope angle in degrees the agent can walk on. */
    maxSlopeDeg: z.number().min(0).max(90).default(45),
    /** Agents with different tags don't share baked surfaces. */
    areaTags: z.array(NavAreaTagSchema).default([]),
  })
  .strict();
export type NavAgentProfile = z.infer<typeof NavAgentProfileSchema>;

/** Effect applied by a nav modifier volume to overlapping tiles. */
export const NavModifierEffectSchema = z.enum([
  "block",
  "unwalkable",
  "cost-multiply",
  "area-override",
]);
export type NavModifierEffect = z.infer<typeof NavModifierEffectSchema>;

/** Nav modifier volume — region-bounded override of the baked surface. */
export const NavModifierVolumeSchema = z
  .object({
    id: NavAreaTagSchema,
    kind: z.enum(["aabb", "sphere"]),
    center: Vec3,
    /** aabb: extent = half-size per axis. sphere: only extent.x is used (radius). */
    extent: Vec3,
    effect: NavModifierEffectSchema,
    /** Only meaningful when `effect === "cost-multiply"`. */
    costMultiplier: z.number().positive().max(1000).default(1),
    /** Only meaningful when `effect === "area-override"`. */
    areaTagOverride: NavAreaTagSchema.optional(),
  })
  .strict()
  .refine(
    ({ effect, costMultiplier }) =>
      effect === "cost-multiply" ? costMultiplier !== 1 : true,
    {
      message:
        "`cost-multiply` effect requires `costMultiplier` to differ from the default 1",
    },
  )
  .refine(
    ({ effect, areaTagOverride }) =>
      effect === "area-override" ? areaTagOverride !== undefined : true,
    {
      message: "`area-override` effect requires `areaTagOverride` to be set",
    },
  )
  .refine(({ extent }) => extent.x > 0 && extent.y > 0 && extent.z > 0, {
    message: "nav modifier volume extent components must be positive",
  });
export type NavModifierVolume = z.infer<typeof NavModifierVolumeSchema>;

/** Authored jump-link — one-way or two-way traversal shortcut. */
export const NavJumpLinkSchema = z
  .object({
    id: NavAreaTagSchema,
    from: Vec3,
    to: Vec3,
    /** If true, traversal allowed in both directions. */
    bidirectional: z.boolean().default(false),
    /** Extra cost beyond Euclidean distance. */
    extraCost: z.number().min(0).max(1000).default(0),
    /** Jump links only available to agents whose profile includes this tag. */
    agentTag: NavAreaTagSchema.optional(),
  })
  .strict();
export type NavJumpLink = z.infer<typeof NavJumpLinkSchema>;

export const NavMeshManifestSchema = z
  .object({
    quality: NavMeshQualitySchema.default("medium"),
    /** Voxel size in meters — higher = coarser mesh, cheaper bake. */
    cellSize: z.number().positive().max(2).default(0.3),
    /** Vertical voxel size in meters. */
    cellHeight: z.number().positive().max(2).default(0.2),
    /** Merge tiny regions smaller than this (sq meters) into neighbors. */
    minRegionAreaSqMeters: z.number().min(0).max(100).default(1),
    /** Tile dimension in voxels — controls streaming granularity. */
    tileSizeVoxels: z.number().int().min(16).max(1024).default(64),
    agents: z.array(NavAgentProfileSchema).min(1),
    modifierVolumes: z.array(NavModifierVolumeSchema).default([]),
    jumpLinks: z.array(NavJumpLinkSchema).default([]),
  })
  .refine(
    ({ agents }) => new Set(agents.map((a) => a.id)).size === agents.length,
    { message: "nav agent profile ids must be unique" },
  )
  .refine(
    ({ modifierVolumes }) =>
      new Set(modifierVolumes.map((v) => v.id)).size === modifierVolumes.length,
    { message: "nav modifier volume ids must be unique" },
  )
  .refine(
    ({ jumpLinks }) =>
      new Set(jumpLinks.map((j) => j.id)).size === jumpLinks.length,
    { message: "nav jump-link ids must be unique" },
  )
  .refine(
    ({ agents, jumpLinks }) => {
      const tags = new Set(agents.flatMap((a) => [a.id, ...a.areaTags]));
      return jumpLinks.every(
        (j) => j.agentTag === undefined || tags.has(j.agentTag),
      );
    },
    {
      message:
        "jump-link `agentTag` must reference an agent id or area tag declared by an agent",
    },
  );
export type NavMeshManifest = z.infer<typeof NavMeshManifestSchema>;
