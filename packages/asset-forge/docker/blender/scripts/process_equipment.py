"""
Equipment Processing Pipeline for Hyperscape
=============================================

Blender headless script for fitting equipment meshes to a reference body.
The armor KEEPS its original shape — only vertices that penetrate inside
the body are pushed outward to the surface. Weight transfer uses
barycentric interpolation for smooth bone skinning.

Pipeline order:
  1. Import reference body + equipment
  2. Align equipment to slot region (scale + position)
  3. Fix penetration — push only INSIDE vertices to surface + offset
  4. Parent to armature (creates vertex groups)
  5. Transfer bone weights (barycentric interpolation from nearest face)
  6. Clean + region-filter weights
  7. Export rigged GLB

Usage:
    blender --background --python process_equipment.py -- \
        --reference /data/reference/reference_body.vrm \
        --equipment /data/gdd-assets/{assetId}/model.glb \
        --output /data/gdd-assets/{assetId}/{assetId}-rigged.glb \
        --slot body \
        --offset 0.05 --max-influences 4 --smoothing-passes 3
"""

import bpy
import mathutils
import sys
import os
import json
import argparse
import time
from pathlib import Path

# Add utils to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "utils"))
from region_filter import get_allowed_bones, zero_irrelevant_weights
from export_helpers import write_metadata_sidecar


def parse_args():
    """Parse CLI arguments after the '--' separator."""
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser(description="Equipment weight transfer pipeline")
    parser.add_argument("--reference", required=True, help="Path to reference body VRM")
    parser.add_argument("--equipment", required=True, help="Path to raw equipment GLB")
    parser.add_argument("--output", required=True, help="Output path for rigged GLB")
    parser.add_argument("--slot", required=True,
                        choices=["body", "legs", "helmet", "boots", "gloves", "cape", "shield"],
                        help="Equipment slot for bone region filtering")
    parser.add_argument("--offset", type=float, default=0.05,
                        help="Min distance from body surface (default: 0.05 = 5cm)")
    parser.add_argument("--max-influences", type=int, default=4,
                        help="Maximum bone influences per vertex (default: 4)")
    parser.add_argument("--smoothing-passes", type=int, default=3,
                        help="Weight smoothing passes (default: 3)")
    parser.add_argument("--tier", type=int, default=1,
                        help="Equipment tier for metadata (default: 1)")
    return parser.parse_args(argv)


def log(msg):
    """Print progress message to stdout for the parent process to parse."""
    print(f"[EQUIPMENT_PIPELINE] {msg}", flush=True)


# ─── Scene Management ────────────────────────────────────────────────────────

def clean_scene():
    """Remove all objects from the scene."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)
    for block in bpy.data.armatures:
        if block.users == 0:
            bpy.data.armatures.remove(block)


# ─── Import ──────────────────────────────────────────────────────────────────

def import_vrm(filepath):
    """Import a VRM file and return the armature and body mesh."""
    log(f"Importing VRM: {filepath}")
    bpy.ops.import_scene.vrm(filepath=filepath)

    armature = None
    body_mesh = None

    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            armature = obj
        elif obj.type == "MESH":
            if body_mesh is None or len(obj.data.vertices) > len(body_mesh.data.vertices):
                body_mesh = obj

    if armature is None:
        raise RuntimeError("No armature found in VRM file")
    if body_mesh is None:
        raise RuntimeError("No mesh found in VRM file")

    log(f"  Armature: {armature.name} ({len(armature.data.bones)} bones)")
    log(f"  Body mesh: {body_mesh.name} ({len(body_mesh.data.vertices)} verts)")
    return armature, body_mesh


def import_equipment(filepath):
    """Import equipment GLB and join all mesh pieces into one."""
    log(f"Importing equipment: {filepath}")

    existing = set(obj.name for obj in bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=filepath)

    new_meshes = [
        obj for obj in bpy.context.scene.objects
        if obj.name not in existing and obj.type == "MESH"
    ]

    if not new_meshes:
        raise RuntimeError("No mesh found in equipment GLB")

    if len(new_meshes) > 1:
        log(f"  Joining {len(new_meshes)} mesh pieces")
        bpy.ops.object.select_all(action="DESELECT")
        for mesh in new_meshes:
            mesh.select_set(True)
        bpy.context.view_layer.objects.active = new_meshes[0]
        bpy.ops.object.join()
        equipment = bpy.context.active_object
    else:
        equipment = new_meshes[0]

    # Clear any existing parent
    if equipment.parent:
        bpy.ops.object.select_all(action="DESELECT")
        equipment.select_set(True)
        bpy.context.view_layer.objects.active = equipment
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")

    # Apply transforms so mesh data is in world space
    bpy.ops.object.select_all(action="DESELECT")
    equipment.select_set(True)
    bpy.context.view_layer.objects.active = equipment
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    log(f"  Equipment: {equipment.name} ({len(equipment.data.vertices)} verts)")
    return equipment


# ─── Geometry Helpers ────────────────────────────────────────────────────────

def _get_world_bounds(obj):
    """Get world-space bounding box as (min_vec, max_vec)."""
    corners = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return (
        mathutils.Vector((min(xs), min(ys), min(zs))),
        mathutils.Vector((max(xs), max(ys), max(zs))),
    )


def _find_bone_z(armature, hint):
    """Find a bone matching the hint and return its world-space Z position."""
    for bone in armature.data.bones:
        if _matches_bone(bone.name, hint):
            return (armature.matrix_world @ bone.head_local).z, bone.name
    return None, None


def _matches_bone(bone_name, target):
    """Check if a bone name matches a target role (case-insensitive)."""
    lower = bone_name.lower()
    for prefix in ["mixamorig:", "mixamorig_", "j_bip_c_", "j_bip_l_", "j_bip_r_", "def_", "def-"]:
        if lower.startswith(prefix):
            lower = lower[len(prefix):]
            break
    return target.lower() in lower


def _compute_barycentric(point, v0, v1, v2):
    """Compute barycentric coordinates of a point in triangle v0-v1-v2."""
    edge1 = v1 - v0
    edge2 = v2 - v0
    vp = point - v0

    d00 = edge1.dot(edge1)
    d01 = edge1.dot(edge2)
    d11 = edge2.dot(edge2)
    d20 = vp.dot(edge1)
    d21 = vp.dot(edge2)

    denom = d00 * d11 - d01 * d01
    if abs(denom) < 1e-10:
        return (1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0)

    v = (d11 * d20 - d01 * d21) / denom
    w = (d00 * d21 - d01 * d20) / denom
    u = 1.0 - v - w

    # Clamp for numerical safety
    u = max(0.0, min(1.0, u))
    v = max(0.0, min(1.0, v))
    w = max(0.0, min(1.0, w))
    total = u + v + w
    if total > 0:
        u /= total
        v /= total
        w /= total

    return (u, v, w)


# Slot → (bottom_bone_hint, top_bone_hint) defining the body region
_SLOT_BONE_REGIONS = {
    "body":    ("hips",  "neck"),
    "legs":    ("foot",  "upperleg"),
    "helmet":  ("neck",  "head"),
    "boots":   ("foot",  "lowerleg"),
    "gloves":  ("hand",  "lowerarm"),
    "cape":    ("hips",  "neck"),
    "shield":  ("hand",  "lowerarm"),
}


# ─── Step 4: Align ──────────────────────────────────────────────────────────

def align_equipment_to_body(equipment, armature, body_mesh, slot):
    """Scale and position equipment to match the slot's bone region.

    Uses height-based uniform scaling so the equipment's proportions are
    preserved. The armor keeps its original shape — penetration is fixed
    in the next step.
    """
    log(f"Aligning equipment to body (slot: {slot})")

    body_min, body_max = _get_world_bounds(body_mesh)
    body_center = (body_min + body_max) / 2
    body_size = body_max - body_min

    equip_min, equip_max = _get_world_bounds(equipment)
    equip_size = equip_max - equip_min

    log(f"  Body size: ({body_size.x:.3f}, {body_size.y:.3f}, {body_size.z:.3f})")
    log(f"  Equip size: ({equip_size.x:.3f}, {equip_size.y:.3f}, {equip_size.z:.3f})")

    # Find slot-specific bone region
    bottom_hint, top_hint = _SLOT_BONE_REGIONS.get(slot, ("hips", "neck"))
    bottom_z, bottom_name = _find_bone_z(armature, bottom_hint)
    top_z, top_name = _find_bone_z(armature, top_hint)

    if bottom_z is not None and top_z is not None:
        region_bottom = min(bottom_z, top_z)
        region_top = max(bottom_z, top_z)
        region_height = region_top - region_bottom
        region_center_z = (region_bottom + region_top) / 2
        log(f"  Slot region: {bottom_name}(Z={bottom_z:.3f}) → {top_name}(Z={top_z:.3f}), "
            f"height={region_height:.3f}")
    else:
        region_height = body_size.z * 0.4
        region_center_z = body_center.z

    # Scale equipment to match region height with small margin
    if equip_size.z > 0.0001 and region_height > 0.0001:
        scale_ratio = region_height / equip_size.z * 1.05
        scale_ratio = max(0.01, min(scale_ratio, 100.0))
        log(f"  Scale ratio: {scale_ratio:.3f}")
        equipment.scale = (scale_ratio, scale_ratio, scale_ratio)

    bpy.context.view_layer.update()

    # Center on region
    equip_min2, equip_max2 = _get_world_bounds(equipment)
    equip_center2 = (equip_min2 + equip_max2) / 2

    equipment.location.x += body_center.x - equip_center2.x
    equipment.location.y += body_center.y - equip_center2.y
    equipment.location.z += region_center_z - equip_center2.z

    # Apply transforms
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    equipment.select_set(True)
    bpy.context.view_layer.objects.active = equipment
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    bpy.context.view_layer.update()
    final_min, final_max = _get_world_bounds(equipment)
    final_size = final_max - final_min
    log(f"  Aligned equip: min=({final_min.x:.3f}, {final_min.y:.3f}, {final_min.z:.3f}) "
        f"max=({final_max.x:.3f}, {final_max.y:.3f}, {final_max.z:.3f}) "
        f"size=({final_size.x:.3f}, {final_size.y:.3f}, {final_size.z:.3f})")


# ─── Coincident Vertex Handling ────────────────────────────────────────────
# GLTF splits vertices at UV seams and sharp edges — co-located vertices
# with different normals/UVs get separate indices. When pushed independently
# they diverge, creating visible gaps at shoulders/sides.

def _build_coincident_groups(equipment, threshold=0.0001):
    """Find groups of co-located vertices (UV seam splits) using KDTree."""
    from mathutils.kdtree import KDTree

    mesh = equipment.data
    size = len(mesh.vertices)
    kd = KDTree(size)
    for i, v in enumerate(mesh.vertices):
        kd.insert(v.co, i)
    kd.balance()

    visited = set()
    groups = []

    for i, v in enumerate(mesh.vertices):
        if i in visited:
            continue
        nearby = kd.find_range(v.co, threshold)
        if len(nearby) > 1:
            group = [idx for (co, idx, dist) in nearby]
            groups.append(group)
            for idx in group:
                visited.add(idx)
        else:
            visited.add(i)

    split_count = sum(len(g) for g in groups)
    log(f"  Coincident groups: {len(groups)} groups ({split_count} split verts "
        f"of {size} total)")
    return groups


def _enforce_coincident_positions(equipment, groups):
    """Force co-located vertices to share the same position (average)."""
    mesh = equipment.data
    snapped = 0
    for group in groups:
        avg = mathutils.Vector((0, 0, 0))
        for vi in group:
            avg += mesh.vertices[vi].co
        avg /= len(group)
        for vi in group:
            if (mesh.vertices[vi].co - avg).length > 1e-7:
                mesh.vertices[vi].co = avg.copy()
                snapped += 1
    mesh.update()
    return snapped


# ─── Step 5: Fix Body Penetration ──────────────────────────────────────────

def fix_body_penetration(equipment, body_mesh, offset=0.05):
    """Ensure all vertices are at least `offset` distance outside the body.

    Uses ray-cast parity (not signed distance) for inside/outside detection.
    The old find_nearest + dot-product approach had blind spots at concave
    body regions (lower back, sides) where the nearest face is on the
    opposite wall of the concavity. Ray-parity counts mesh intersections
    along multiple directions — odd = inside, even = outside — which is
    geometrically correct regardless of mesh concavity.

    Pipeline:
      1. Build coincident vertex groups (UV seam split vertices)
      2. Ray-parity push to get all inside vertices outside
      3. Constrained smoothing — each iteration smooths positions AND
         enforces minimum body distance, preventing the oscillating
         dents from separate smooth→push cycles
      4. Ray-march guarantee for any remaining inside vertices
      5. Face-spanning fix for triangles that cut through curved body
      6. Normal rebuild: fix face winding, smooth shade
    """
    import bmesh
    from mathutils.bvhtree import BVHTree

    log(f"Fixing body penetration (min_offset={offset})")

    # ── Diagnostic: boundary loop info ──
    diag_bm = bmesh.new()
    diag_bm.from_mesh(equipment.data)
    diag_bm.edges.ensure_lookup_table()
    boundary_edges_diag = [e for e in diag_bm.edges if e.is_boundary]
    if boundary_edges_diag:
        _remaining = set(e.index for e in boundary_edges_diag)
        _edge_map = {e.index: e for e in boundary_edges_diag}
        _loops = []
        while _remaining:
            _start = next(iter(_remaining))
            _se = _edge_map[_start]
            _remaining.remove(_start)
            _loop = [_se]
            _cv = _se.verts[1]
            for _ in range(len(boundary_edges_diag)):
                _found = False
                for _le in _cv.link_edges:
                    if _le.index in _remaining and _le.is_boundary:
                        _remaining.remove(_le.index)
                        _loop.append(_le)
                        _cv = _le.other_vert(_cv)
                        _found = True
                        break
                if not _found:
                    break
            _loops.append(_loop)
        log(f"  Original mesh: {len(boundary_edges_diag)} boundary edges, "
            f"{len(_loops)} loops: {sorted(len(l) for l in _loops)}")
    else:
        log("  Original mesh is watertight (no open edges)")
    diag_bm.free()

    # ── Build coincident vertex groups BEFORE any manipulation ──
    # These are co-located vertices split by GLTF at UV/normal seams.
    # Every push/smooth pass must be followed by position enforcement
    # to prevent gaps at seam boundaries.
    coincident_groups = _build_coincident_groups(equipment)

    # Build BVH from body mesh using BMesh — no depsgraph needed
    body_bm = bmesh.new()
    body_bm.from_mesh(body_mesh.data)
    body_bm.transform(body_mesh.matrix_world)
    bmesh.ops.recalc_face_normals(body_bm, faces=body_bm.faces[:])
    body_bm.normal_update()
    body_bvh = BVHTree.FromBMesh(body_bm)

    # Body center — used to validate face normal direction
    body_min, body_max = _get_world_bounds(body_mesh)
    body_center = (body_min + body_max) / 2
    log(f"  Body center: ({body_center.x:.3f}, {body_center.y:.3f}, {body_center.z:.3f})")

    # ── Ray-parity inside/outside test ──
    # The old signed-distance approach (find_nearest + dot product) has
    # FUNDAMENTAL blind spots at concave body regions (lower back, sides,
    # armpits). At a concavity, find_nearest can return a face on the
    # opposite wall, whose normal incorrectly says "outside".
    #
    # Ray-parity is geometrically correct: cast rays from the vertex and
    # count mesh intersections. Odd = inside, even = outside. We use 3
    # non-coplanar directions with majority voting for robustness against
    # rays that graze edges/vertices.
    _RAY_DIRS = [
        mathutils.Vector((1, 0, 0)),
        mathutils.Vector((0, 1, 0)),
        mathutils.Vector((0, 0, 1)),
    ]

    def _is_inside(bvh, point):
        """Test if a point is inside the body mesh using ray-parity voting."""
        inside_votes = 0
        for ray_dir in _RAY_DIRS:
            hits = 0
            origin = mathutils.Vector(point)
            epsilon = ray_dir * 1e-6
            loc, nor, idx, dist = bvh.ray_cast(origin, ray_dir)
            while loc is not None:
                hits += 1
                origin = loc + epsilon
                loc, nor, idx, dist = bvh.ray_cast(origin, ray_dir)
            if hits % 2 == 1:
                inside_votes += 1
        return inside_votes >= 2  # majority of 3 directions

    def _push_outside(equip, bvh, center, min_dist, pass_name="push"):
        """Push inside/too-close vertices outward.

        Uses ray-parity for inside/outside detection, and find_nearest
        for push direction. Vertices confirmed outside but closer than
        min_dist are also pushed outward to maintain clearance.
        """
        eq_world = equip.matrix_world
        eq_world_inv = eq_world.inverted()
        pushed_inside = 0
        pushed_close = 0
        kept = 0
        for vert in equip.data.vertices:
            world_co = eq_world @ vert.co
            location, normal, face_idx, dist = bvh.find_nearest(world_co)
            if location is None:
                continue

            face_normal = normal.normalized()
            outward_ref = (location - center)
            if face_normal.dot(outward_ref) < 0:
                face_normal = -face_normal

            if _is_inside(bvh, world_co):
                # Vertex is INSIDE — project to surface + offset
                projected_world = location + face_normal * min_dist
                vert.co = eq_world_inv @ projected_world
                pushed_inside += 1
            else:
                # Vertex is outside — check if it's too close
                vertex_dir = world_co - location
                signed_dist = vertex_dir.dot(face_normal)
                if signed_dist < min_dist:
                    push_amount = min_dist - signed_dist
                    projected_world = world_co + face_normal * push_amount
                    vert.co = eq_world_inv @ projected_world
                    pushed_close += 1
                else:
                    kept += 1
        equip.data.update()
        log(f"  {pass_name}: pushed {pushed_inside} inside + {pushed_close} too-close, kept {kept}")
        return pushed_inside + pushed_close

    def _constrained_smooth(equip, bvh, center, min_dist, groups,
                            passes=6, factor=0.3, pass_name="constrained-smooth"):
        """Smooth vertex positions while maintaining minimum body distance.

        Unlike separate smooth→push cycles which create oscillating dents,
        this combines smoothing and distance enforcement in each iteration.
        Each iteration: (1) move each vertex toward its neighbor average,
        (2) if the smoothed position is inside or too close to the body,
        project it back to surface + offset. This produces a smooth, uniform
        shell that follows the body contour without bumps or dents.
        """
        mesh = equip.data
        num_verts = len(mesh.vertices)
        eq_world = equip.matrix_world
        eq_world_inv = eq_world.inverted()

        # Build adjacency from edges (Jacobi-style: read old, write new)
        adjacency = [[] for _ in range(num_verts)]
        for edge in mesh.edges:
            v0, v1 = edge.vertices
            adjacency[v0].append(v1)
            adjacency[v1].append(v0)

        for p in range(passes):
            constrained = 0
            # Snapshot positions so all reads are from the same iteration
            positions = [v.co.copy() for v in mesh.vertices]

            for vi in range(num_verts):
                neighbors = adjacency[vi]
                if not neighbors:
                    continue

                # Step 1: Smooth — lerp toward neighbor average
                avg = mathutils.Vector((0, 0, 0))
                for ni in neighbors:
                    avg += positions[ni]
                avg /= len(neighbors)
                smoothed = positions[vi].lerp(avg, factor)

                # Step 2: Check body distance constraint in world space
                world_co = eq_world @ smoothed
                location, normal, face_idx, dist = bvh.find_nearest(world_co)

                if location is None:
                    mesh.vertices[vi].co = smoothed
                    continue

                face_normal = normal.normalized()
                outward_ref = location - center
                if face_normal.dot(outward_ref) < 0:
                    face_normal = -face_normal

                inside = _is_inside(bvh, world_co)
                if inside:
                    # Inside body — project to surface + offset
                    projected = location + face_normal * min_dist
                    mesh.vertices[vi].co = eq_world_inv @ projected
                    constrained += 1
                else:
                    vertex_dir = world_co - location
                    signed_dist = vertex_dir.dot(face_normal)
                    if signed_dist < min_dist:
                        # Too close — push out to min distance
                        push = min_dist - signed_dist
                        projected = world_co + face_normal * push
                        mesh.vertices[vi].co = eq_world_inv @ projected
                        constrained += 1
                    else:
                        # Already clear — accept smoothed position
                        mesh.vertices[vi].co = smoothed

            # Enforce coincident positions after each iteration
            _enforce_coincident_positions(equip, groups)
            mesh.update()
            log(f"  {pass_name} iter {p+1}/{passes}: constrained {constrained}/{num_verts} verts")

    # ── Phase 1: Initial push (ray-parity detection) ──
    _push_outside(equipment, body_bvh, body_center, offset, "Pass 1 (ray-parity)")
    snapped = _enforce_coincident_positions(equipment, coincident_groups)
    log(f"  Coincident snap after push 1: {snapped} verts")

    # ── Phase 2: Constrained smoothing ──
    # Replaces the old smooth→push→smooth→push cycle that created oscillating
    # dents. Each iteration smooths vertex positions AND enforces the body
    # distance constraint together, producing a uniform shell without bumps.
    _constrained_smooth(equipment, body_bvh, body_center, offset,
                        coincident_groups, passes=8, factor=0.3,
                        pass_name="Constrained smooth")

    # ── Phase 3: Ray-march guarantee ──
    # Both find_nearest (dot product) and Shrinkwrap OUTSIDE fail at body
    # concavities (lower back, sides) because the nearest face is on the
    # opposite wall. The ray-march approach is brute-force but GUARANTEED:
    # walk the vertex outward in small steps until ray-parity confirms
    # it's outside the body, then add clearance offset.
    #
    # CRITICAL: When fixing a vertex, also move ALL its coincident partners
    # to the same position. Otherwise the coincident snap that follows will
    # average the fixed position with the unfixed partners, pulling the
    # vertex right back inside.
    log("  Ray-march: scanning for remaining inside vertices")

    # Build vertex → coincident group lookup
    vert_to_group = {}
    for group in coincident_groups:
        for vi in group:
            vert_to_group[vi] = group

    eq_world = equipment.matrix_world
    eq_world_inv = eq_world.inverted()
    marched = 0
    partners_fixed = 0
    step_size = 0.005  # 5mm steps
    max_steps = 200    # max 1m travel
    already_fixed = set()

    for vert in equipment.data.vertices:
        if vert.index in already_fixed:
            continue
        world_co = eq_world @ vert.co
        if not _is_inside(body_bvh, world_co):
            continue
        # Walk outward from body center through vertex
        direction = (world_co - body_center).normalized()
        current = mathutils.Vector(world_co)
        escaped = False
        for step in range(max_steps):
            current = current + direction * step_size
            if not _is_inside(body_bvh, current):
                # Found outside — add offset clearance
                current = current + direction * offset
                escaped = True
                break
        if escaped:
            new_local = eq_world_inv @ current
            vert.co = new_local
            already_fixed.add(vert.index)
            marched += 1
            # Move all coincident partners to the SAME position
            # so the subsequent snap can't pull this vertex back inside
            group = vert_to_group.get(vert.index)
            if group:
                for partner_vi in group:
                    if partner_vi != vert.index:
                        equipment.data.vertices[partner_vi].co = new_local.copy()
                        already_fixed.add(partner_vi)
                        partners_fixed += 1
    equipment.data.update()
    log(f"  Ray-march: fixed {marched} inside verts + {partners_fixed} coincident partners")

    # Run snap to fix any other coincident groups not touched by ray-march
    snapped = _enforce_coincident_positions(equipment, coincident_groups)
    log(f"  Coincident snap after ray-march: {snapped} verts")

    # Final check: any STILL inside after snap? Fix them without snap.
    still_inside = 0
    for vert in equipment.data.vertices:
        world_co = eq_world @ vert.co
        if _is_inside(body_bvh, world_co):
            direction = (world_co - body_center).normalized()
            current = mathutils.Vector(world_co)
            for step in range(max_steps):
                current = current + direction * step_size
                if not _is_inside(body_bvh, current):
                    current = current + direction * offset
                    new_local = eq_world_inv @ current
                    vert.co = new_local
                    # Also fix partners
                    group = vert_to_group.get(vert.index)
                    if group:
                        for partner_vi in group:
                            if partner_vi != vert.index:
                                equipment.data.vertices[partner_vi].co = new_local.copy()
                    still_inside += 1
                    break
    if still_inside > 0:
        equipment.data.update()
    log(f"  Final inside check: fixed {still_inside} (no snap after this)")

    # ── Phase 4: Face-spanning fix ──
    # All VERTICES are now outside the body, but flat triangle FACES can
    # still cut through the curved body surface. At high-curvature areas
    # (lower back, side waist), two outside vertices with a straight-line
    # face between them can pass through the body's inward curve.
    #
    # Fix: check each face's center point. If inside, push the face's
    # vertices further outward so the face clears the body. Repeat until
    # no face centers are inside.
    log("  Face-spanning fix: checking face centers")
    mesh = equipment.data
    for iteration in range(5):  # max 5 iterations
        faces_fixed = 0
        for poly in mesh.polygons:
            # Compute face center in world space
            face_center_local = mathutils.Vector((0, 0, 0))
            for vi in poly.vertices:
                face_center_local += mesh.vertices[vi].co
            face_center_local /= len(poly.vertices)
            face_center_world = eq_world @ face_center_local

            if not _is_inside(body_bvh, face_center_world):
                continue

            # Face center is inside — push each vertex further outward
            # by the distance needed to clear the body at the center
            outward_dir = (face_center_world - body_center).normalized()

            # Ray-march the face center to find where it exits
            current = mathutils.Vector(face_center_world)
            target = None
            for step in range(max_steps):
                current = current + outward_dir * step_size
                if not _is_inside(body_bvh, current):
                    target = current + outward_dir * offset
                    break

            if target is None:
                continue

            # Push each face vertex outward by the delta
            delta_world = target - face_center_world
            for vi in poly.vertices:
                old_world = eq_world @ mesh.vertices[vi].co
                new_world = old_world + delta_world
                mesh.vertices[vi].co = eq_world_inv @ new_world
                # Also fix coincident partners
                group = vert_to_group.get(vi)
                if group:
                    for partner_vi in group:
                        if partner_vi != vi:
                            mesh.vertices[partner_vi].co = mesh.vertices[vi].co.copy()
            faces_fixed += 1

        mesh.update()
        log(f"  Face-spanning iteration {iteration + 1}: fixed {faces_fixed} faces")
        if faces_fixed == 0:
            break

    # ── Post-push diagnostic: check boundary edges after manipulation ──
    post_bm = bmesh.new()
    post_bm.from_mesh(equipment.data)
    post_bm.edges.ensure_lookup_table()
    post_boundary = [e for e in post_bm.edges if e.is_boundary]
    if post_boundary:
        _remaining = set(e.index for e in post_boundary)
        _edge_map = {e.index: e for e in post_boundary}
        _loops = []
        while _remaining:
            _start = next(iter(_remaining))
            _se = _edge_map[_start]
            _remaining.remove(_start)
            _loop = [_se]
            _cv = _se.verts[1]
            for _ in range(len(post_boundary)):
                _found = False
                for _le in _cv.link_edges:
                    if _le.index in _remaining and _le.is_boundary:
                        _remaining.remove(_le.index)
                        _loop.append(_le)
                        _cv = _le.other_vert(_cv)
                        _found = True
                        break
                if not _found:
                    break
            _loops.append(_loop)
        log(f"  Post-push: {len(post_boundary)} boundary edges, "
            f"loops: {sorted(len(l) for l in _loops)}")
    else:
        log("  Post-push: mesh is watertight")
    post_bm.free()

    # ── Mesh cleanup + normal rebuild (Blender 4.2 compatible) ──
    log("  Cleaning mesh + rebuilding normals (Blender 4.2)")

    bpy.ops.object.select_all(action="DESELECT")
    equipment.select_set(True)
    bpy.context.view_layer.objects.active = equipment

    # NOTE: Do NOT use dissolve_degenerate — after coincident vertex snapping,
    # thin faces at UV seams can have near-zero-length edges that
    # dissolve_degenerate removes, creating visible holes at the lower back
    # and side seams. Do NOT use remove_doubles — it merges co-located
    # vertices at UV seams (different UVs but same position), destroying UV
    # mapping and creating visible gaps.
    log(f"  Mesh preserved: {len(equipment.data.vertices)} verts, "
        f"{len(equipment.data.polygons)} faces")

    # Step 1: Clear stale custom split normals.
    # GLTF import brings custom split normals that override vertex normals
    # in the exporter. After vertex pushes they're stale and MUST go.
    # Must happen BEFORE face winding fix.
    if equipment.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
        log("  Cleared stale custom split normals")

    # Step 2: Fix face winding using body center reference.
    # The armor wraps around the body — all face normals should point
    # AWAY from the body center. For each face, check the dot product
    # of the face normal with the direction from body center to face
    # center. If negative, the face points inward and needs flipping.
    # This is simpler and more reliable than recalc_face_normals which
    # gets faces wrong on open meshes with many boundary loops.
    eq_bm = bmesh.new()
    eq_bm.from_mesh(equipment.data)
    eq_bm.faces.ensure_lookup_table()
    eq_bm.normal_update()

    eq_world = equipment.matrix_world
    faces_to_flip = []
    for face in eq_bm.faces:
        face_center = eq_world @ face.calc_center_median()
        face_normal = (eq_world.to_3x3() @ face.normal).normalized()
        # Direction from body center to face center = expected outward direction
        outward = (face_center - body_center).normalized()
        if face_normal.dot(outward) < 0:
            faces_to_flip.append(face)

    if faces_to_flip:
        bmesh.ops.reverse_faces(eq_bm, faces=faces_to_flip)
        eq_bm.normal_update()

    eq_bm.to_mesh(equipment.data)
    eq_bm.free()
    equipment.data.update()
    log(f"  Face normals: body-center reference (flipped {len(faces_to_flip)}/{len(equipment.data.polygons)} faces)")

    body_bm.free()

    # Step 3: Set smooth shading so GLTF exporter writes interpolated normals
    for poly in equipment.data.polygons:
        poly.use_smooth = True
    equipment.data.update()
    log(f"  Set smooth shading on {len(equipment.data.polygons)} faces")

    # Apply transforms
    bpy.ops.object.select_all(action="DESELECT")
    equipment.select_set(True)
    bpy.context.view_layer.objects.active = equipment
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()


# ─── Step 6: Parent to Armature ──────────────────────────────────────────────

def parent_to_armature(equipment, armature):
    """Parent equipment mesh to armature with empty vertex groups."""
    log("Parenting equipment to armature")

    bpy.ops.object.select_all(action="DESELECT")
    equipment.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    bpy.ops.object.parent_set(type="ARMATURE_NAME")

    log(f"  Created {len(equipment.vertex_groups)} vertex groups")


# ─── Step 7: Weight Transfer (Barycentric) ───────────────────────────────────

def transfer_weights(body_mesh, equipment, offset=0.0):
    """Transfer bone weights using BVH nearest-face + barycentric interpolation.

    For each equipment vertex, finds the nearest point on the body surface,
    determines which body face it belongs to, computes barycentric coordinates
    within that face, and interpolates the bone weights from the face's 3
    vertices. This produces smooth weight gradients — equivalent to Blender's
    POLYINTERP_NEAREST (Nearest Face Interpolated) data transfer method.
    """
    log("Transferring weights (barycentric interpolation)")

    if not body_mesh.vertex_groups:
        raise RuntimeError("Body mesh has no vertex groups to transfer")

    log(f"  Source: {body_mesh.name} ({len(body_mesh.vertex_groups)} groups, "
        f"{len(body_mesh.data.vertices)} verts)")
    log(f"  Target: {equipment.name} ({len(equipment.vertex_groups)} groups, "
        f"{len(equipment.data.vertices)} verts)")

    import bmesh
    from mathutils.bvhtree import BVHTree

    # Use FromBMesh for reliable headless/Docker operation
    body_bm = bmesh.new()
    body_bm.from_mesh(body_mesh.data)
    body_bm.transform(body_mesh.matrix_world)
    body_bm.normal_update()
    body_bvh = BVHTree.FromBMesh(body_bm)

    body_data = body_mesh.data
    body_world = body_mesh.matrix_world
    equip_world = equipment.matrix_world

    # Body vertex group index → name
    body_group_names = {vg.index: vg.name for vg in body_mesh.vertex_groups}

    # Equipment vertex group name → object
    equip_groups = {vg.name: vg for vg in equipment.vertex_groups}

    weighted_count = 0
    total_dist = 0.0
    max_dist = 0.0

    for ev in equipment.data.vertices:
        world_co = equip_world @ ev.co

        # Find nearest point on body surface — returns the face index
        loc, normal, face_idx, dist = body_bvh.find_nearest(world_co)
        if loc is None or face_idx is None:
            continue

        total_dist += dist
        max_dist = max(max_dist, dist)

        # Get the body face's vertex indices
        face = body_data.polygons[face_idx]
        fverts = list(face.vertices)
        if len(fverts) < 3:
            continue

        # World positions of face vertices (first 3 for barycentric)
        v0 = body_world @ body_data.vertices[fverts[0]].co
        v1 = body_world @ body_data.vertices[fverts[1]].co
        v2 = body_world @ body_data.vertices[fverts[2]].co

        bary = _compute_barycentric(loc, v0, v1, v2)

        # Interpolate weights from the 3 face vertices
        interpolated = {}
        for fi in range(min(3, len(fverts))):
            fv = body_data.vertices[fverts[fi]]
            weight_factor = bary[fi]
            for g in fv.groups:
                name = body_group_names.get(g.group)
                if name and g.weight > 0.001:
                    interpolated[name] = interpolated.get(name, 0.0) + g.weight * weight_factor

        # Apply to equipment vertex
        has_weight = False
        for name, weight in interpolated.items():
            if weight > 0.001:
                eq_group = equip_groups.get(name)
                if eq_group:
                    eq_group.add([ev.index], weight, "REPLACE")
                    has_weight = True

        if has_weight:
            weighted_count += 1

    num_verts = len(equipment.data.vertices)
    avg_dist = total_dist / num_verts if num_verts > 0 else 0
    log(f"  Vertices with weights: {weighted_count}/{num_verts}")
    log(f"  Surface distance: avg={avg_dist:.4f}, max={max_dist:.4f}")

    body_bm.free()

    if weighted_count == 0:
        raise RuntimeError("Weight transfer produced no weights — check mesh alignment")


# ─── Step 8: Clean Weights ───────────────────────────────────────────────────

def clean_weights(equipment, max_influences=4, smoothing_passes=3):
    """Normalize, limit influences, and smooth vertex weights."""
    log(f"Cleaning weights (max_influences={max_influences}, smoothing={smoothing_passes})")

    bpy.ops.object.select_all(action="DESELECT")
    equipment.select_set(True)
    bpy.context.view_layer.objects.active = equipment
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    bpy.ops.object.vertex_group_limit_total(limit=max_influences)

    if smoothing_passes > 0:
        _smooth_weights_direct(equipment, smoothing_passes, factor=0.5)

    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    log("  Weights cleaned and normalized")


def _smooth_weights_direct(equipment, passes, factor=0.5):
    """Smooth vertex weights by averaging with connected neighbors."""
    mesh = equipment.data
    num_verts = len(mesh.vertices)
    num_groups = len(equipment.vertex_groups)

    if num_groups == 0 or num_verts == 0:
        return

    adjacency = [[] for _ in range(num_verts)]
    for edge in mesh.edges:
        v0, v1 = edge.vertices
        adjacency[v0].append(v1)
        adjacency[v1].append(v0)

    for p in range(passes):
        weights = [[0.0] * num_groups for _ in range(num_verts)]
        for vert in mesh.vertices:
            for g in vert.groups:
                if g.group < num_groups:
                    weights[vert.index][g.group] = g.weight

        for vi in range(num_verts):
            neighbors = adjacency[vi]
            if not neighbors:
                continue
            for gi in range(num_groups):
                neighbor_avg = sum(weights[ni][gi] for ni in neighbors) / len(neighbors)
                new_weight = weights[vi][gi] * (1.0 - factor) + neighbor_avg * factor
                if new_weight > 0.001:
                    equipment.vertex_groups[gi].add([vi], new_weight, "REPLACE")
                else:
                    try:
                        equipment.vertex_groups[gi].remove([vi])
                    except RuntimeError:
                        pass


# ─── Step 9: Region Filter ──────────────────────────────────────────────────

def apply_region_filter(equipment, slot):
    """Zero out weights from bones irrelevant to the equipment slot."""
    log(f"Applying region filter for slot: {slot}")

    allowed_bones = get_allowed_bones(slot)
    if not allowed_bones:
        log("  No region filter for this slot (all bones allowed)")
        return

    zeroed = zero_irrelevant_weights(equipment, allowed_bones)
    log(f"  Zeroed weights for {zeroed} irrelevant bone groups")

    bpy.ops.object.select_all(action="DESELECT")
    equipment.select_set(True)
    bpy.context.view_layer.objects.active = equipment
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)


# ─── Step 10: Export ─────────────────────────────────────────────────────────

def remove_body_meshes(equipment, body_mesh, armature):
    """Remove the reference body mesh, keeping only equipment + armature."""
    log("Removing reference body mesh")

    meshes_to_remove = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj is not equipment
    ]

    for mesh in meshes_to_remove:
        bpy.data.objects.remove(mesh, do_unlink=True)

    log(f"  Removed {len(meshes_to_remove)} body mesh(es)")

    has_armature_mod = any(mod.type == "ARMATURE" for mod in equipment.modifiers)
    log(f"  Equipment parent: {equipment.parent.name if equipment.parent else 'None'}")
    log(f"  Armature modifier: {has_armature_mod}")
    log(f"  Vertex groups: {len(equipment.vertex_groups)}")


def export_rigged_glb(equipment, output_path):
    """Export the rigged equipment as a GLB file."""
    log(f"Exporting rigged GLB: {output_path}")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    has_armature_mod = any(mod.type == "ARMATURE" for mod in equipment.modifiers)
    weighted_verts = sum(1 for v in equipment.data.vertices if any(g.weight > 0.001 for g in v.groups))
    log(f"  Pre-export: armature_mod={has_armature_mod}, weighted_verts={weighted_verts}")

    if not has_armature_mod:
        raise RuntimeError("Equipment has no Armature modifier — skin data will be missing")

    # Strip vertex colors from mesh data before export.
    # Meshy AI bakes AO into vertex colors. If these survive into the GLB,
    # the viewer's material can read them as garbage data → red/colored spots.
    if equipment.data.color_attributes:
        names_to_remove = [ca.name for ca in equipment.data.color_attributes]
        for name in names_to_remove:
            equipment.data.color_attributes.remove(
                equipment.data.color_attributes[name]
            )
        log(f"  Stripped {len(names_to_remove)} vertex color layer(s): {names_to_remove}")

    bpy.ops.object.select_all(action="SELECT")

    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=True,
        export_skins=True,
        export_normals=True,
        export_tangents=True,
        export_animations=False,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
        export_yup=True,
        export_image_format="AUTO",
    )

    file_size = os.path.getsize(output_path)
    log(f"  Exported: {file_size / 1024:.1f} KB")


def get_active_bones(equipment):
    """Get list of bone names that have non-zero weights on the equipment."""
    active = []
    for vg in equipment.vertex_groups:
        has_weight = False
        for vert in equipment.data.vertices:
            for group in vert.groups:
                if group.group == vg.index and group.weight > 0.001:
                    has_weight = True
                    break
            if has_weight:
                break
        if has_weight:
            active.append(vg.name)
    return active


# ─── Main Pipeline ───────────────────────────────────────────────────────────

def main():
    args = parse_args()
    start_time = time.time()

    log("=" * 60)
    log("Equipment Processing Pipeline")
    log(f"  Reference: {args.reference}")
    log(f"  Equipment: {args.equipment}")
    log(f"  Output: {args.output}")
    log(f"  Slot: {args.slot}")
    log(f"  Offset: {args.offset}")
    log(f"  Max influences: {args.max_influences}")
    log(f"  Smoothing passes: {args.smoothing_passes}")
    log("=" * 60)

    if not os.path.exists(args.reference):
        raise FileNotFoundError(f"Reference file not found: {args.reference}")
    if not os.path.exists(args.equipment):
        raise FileNotFoundError(f"Equipment file not found: {args.equipment}")

    # Step 1: Clean scene
    log("STEP 1/9: Cleaning scene")
    clean_scene()

    # Step 2: Import reference body
    log("STEP 2/9: Importing reference body")
    armature, body_mesh = import_vrm(args.reference)

    # Step 3: Import equipment
    log("STEP 3/9: Importing equipment")
    equipment = import_equipment(args.equipment)

    # Step 4: Rough-align equipment to body region
    log("STEP 4/9: Aligning equipment")
    align_equipment_to_body(equipment, armature, body_mesh, args.slot)

    # Step 5: Fix penetration — push only inside vertices to surface
    log("STEP 5/9: Fixing body penetration")
    fix_body_penetration(equipment, body_mesh, args.offset)

    # Step 6: Parent to armature (creates empty vertex groups)
    log("STEP 6/9: Parenting to armature")
    parent_to_armature(equipment, armature)

    # Step 7: Transfer bone weights (barycentric interpolation)
    log("STEP 7/9: Transferring weights")
    transfer_weights(body_mesh, equipment)

    # Step 8: Clean weights
    log("STEP 8/9: Cleaning weights")
    clean_weights(equipment, args.max_influences, args.smoothing_passes)

    # Step 9: Region filter + export
    log("STEP 9/9: Region filter + export")
    apply_region_filter(equipment, args.slot)

    # Get metadata before removing body
    active_bones = get_active_bones(equipment)
    vertex_count = len(equipment.data.vertices)
    ordered_bone_names = [bone.name for bone in armature.data.bones]

    hidden_parts_map = {
        "body": ["torso"],
        "legs": ["legs"],
        "helmet": ["head"],
        "boots": ["feet"],
        "gloves": ["hands"],
        "cape": [],
        "shield": [],
    }

    remove_body_meshes(equipment, body_mesh, armature)
    export_rigged_glb(equipment, args.output)

    metadata_path = args.output.replace(".glb", ".equipment.json")
    write_metadata_sidecar(
        output_path=metadata_path,
        tier=args.tier,
        slot=args.slot,
        active_bones=active_bones,
        ordered_bone_names=ordered_bone_names,
        hidden_body_parts=hidden_parts_map.get(args.slot, []),
        vertex_count=vertex_count,
        processing_params={
            "offset": args.offset,
            "maxInfluences": args.max_influences,
            "smoothingPasses": args.smoothing_passes,
        },
    )

    elapsed = time.time() - start_time
    log(f"Pipeline complete in {elapsed:.1f}s")
    log(f"Output: {args.output}")
    log(f"Metadata: {metadata_path}")
    log("DONE")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[EQUIPMENT_PIPELINE] FATAL ERROR: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
