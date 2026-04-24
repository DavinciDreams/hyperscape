/**
 * Editor snap-settings manifest schema.
 *
 * Phase J3 of the World Studio AAA plan — captures the editor's
 * snap / grid / alignment preferences as data so studios can pin a
 * standard (e.g. "everyone uses a 1m grid with surface-snap on") per
 * project. Runtime wiring is editor-only — these settings don't
 * affect the shipped game.
 */

import { z } from "zod";

/**
 * Grid snap — values like 0.1, 0.25, 0.5, 1, 2, 5, 10 are common
 * world-unit steps. Enforced positive; author can pick any value.
 */
export const GridSnapSchema = z.object({
  enabled: z.boolean().default(true),
  /** Translation snap step in world units. */
  translate: z.number().positive().default(1.0),
  /** Rotation snap step in degrees. */
  rotate: z.number().positive().default(15),
  /** Scale snap step — 0.1 = 10% increments. */
  scale: z.number().positive().default(0.1),
});
export type GridSnap = z.infer<typeof GridSnapSchema>;

/**
 * Vertex / surface snap — when dragging an entity, snap to the
 * nearest vertex or surface within `tolerance` world units.
 */
export const SurfaceSnapSchema = z.object({
  enabled: z.boolean().default(false),
  /** Search radius for snap candidates, world units. */
  tolerance: z.number().positive().default(0.5),
  /** Align the entity's up axis to the surface normal. */
  alignToNormal: z.boolean().default(true),
  /** Snap mode — vertex of nearest mesh, or raycast onto surface. */
  mode: z.enum(["vertex", "surface", "both"]).default("surface"),
});
export type SurfaceSnap = z.infer<typeof SurfaceSnapSchema>;

/**
 * Pivot / axis preferences that affect gizmo behavior.
 */
export const GizmoSettingsSchema = z.object({
  /** `local` rotates around the entity frame, `world` around world axes. */
  space: z.enum(["local", "world"]).default("local"),
  /** `center` uses multi-select centroid, `individual` each entity's origin. */
  pivot: z.enum(["center", "individual"]).default("center"),
  /** Size multiplier applied to the gizmo screen-space scale. */
  size: z.number().positive().default(1.0),
});
export type GizmoSettings = z.infer<typeof GizmoSettingsSchema>;

export const EditorSnapManifestSchema = z.object({
  grid: GridSnapSchema.default({
    enabled: true,
    translate: 1.0,
    rotate: 15,
    scale: 0.1,
  }),
  surface: SurfaceSnapSchema.default({
    enabled: false,
    tolerance: 0.5,
    alignToNormal: true,
    mode: "surface",
  }),
  gizmo: GizmoSettingsSchema.default({
    space: "local",
    pivot: "center",
    size: 1.0,
  }),
  /**
   * Global toggle — when false, holding `Shift` during drag still
   * snaps, matching UE5 / Blender behavior. Authors can pin the
   * default here.
   */
  snapByDefault: z.boolean().default(true),
});
export type EditorSnapManifest = z.infer<typeof EditorSnapManifestSchema>;
