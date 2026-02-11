"""
Fit Verification Script
=======================

Loads the reference body VRM and the rigged equipment GLB, then measures
how well the equipment fits:
  - % vertices inside the body (should be 0%)
  - % vertices within acceptable distance of body surface
  - Average/max distance from body surface
  - Bounding box comparison (equipment vs torso region)

Usage:
    blender --background --python verify_fit.py -- \
        --reference /data/reference/reference_body.vrm \
        --equipment /data/gdd-assets/{assetId}/{assetId}-rigged.glb \
        --slot body
"""

import bpy
import bmesh
import mathutils
import sys
import os
import argparse


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", required=True)
    parser.add_argument("--equipment", required=True)
    parser.add_argument("--slot", default="body")
    return parser.parse_args(argv)


def log(msg):
    print(f"[VERIFY_FIT] {msg}", flush=True)


def clean_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def import_vrm(filepath):
    bpy.ops.import_scene.vrm(filepath=filepath)
    armature = None
    body_mesh = None
    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            armature = obj
        elif obj.type == "MESH":
            if body_mesh is None or len(obj.data.vertices) > len(body_mesh.data.vertices):
                body_mesh = obj
    return armature, body_mesh


def import_glb(filepath):
    existing = set(obj.name for obj in bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=filepath)
    new_meshes = [
        obj for obj in bpy.context.scene.objects
        if obj.name not in existing and obj.type == "MESH"
    ]
    if not new_meshes:
        return None
    # Return the largest mesh
    return max(new_meshes, key=lambda m: len(m.data.vertices))


_SLOT_BONE_REGIONS = {
    "body":    ("hips",  "neck"),
    "legs":    ("foot",  "upperleg"),
    "helmet":  ("neck",  "head"),
    "boots":   ("foot",  "lowerleg"),
    "gloves":  ("hand",  "lowerarm"),
    "cape":    ("hips",  "neck"),
    "shield":  ("hand",  "lowerarm"),
}


def _matches_bone(bone_name, target):
    lower = bone_name.lower()
    for prefix in ["mixamorig:", "mixamorig_", "j_bip_c_", "j_bip_l_", "j_bip_r_", "def_", "def-"]:
        if lower.startswith(prefix):
            lower = lower[len(prefix):]
            break
    return target.lower() in lower


def main():
    args = parse_args()

    log("=" * 60)
    log("Fit Verification")
    log(f"  Reference: {args.reference}")
    log(f"  Equipment: {args.equipment}")
    log(f"  Slot: {args.slot}")
    log("=" * 60)

    clean_scene()

    # Import reference body
    log("Importing reference body...")
    armature, body_mesh = import_vrm(args.reference)
    if not body_mesh:
        log("FAIL: No body mesh found")
        return

    # Import rigged equipment
    log("Importing rigged equipment...")
    equip = import_glb(args.equipment)
    if not equip:
        log("FAIL: No equipment mesh found")
        return

    log(f"  Body: {body_mesh.name} ({len(body_mesh.data.vertices)} verts)")
    log(f"  Equipment: {equip.name} ({len(equip.data.vertices)} verts)")

    # Build BVH from body mesh
    body_bm = bmesh.new()
    body_bm.from_mesh(body_mesh.data)
    body_bm.transform(body_mesh.matrix_world)
    bmesh.ops.recalc_face_normals(body_bm, faces=body_bm.faces[:])
    body_bm.normal_update()

    from mathutils.bvhtree import BVHTree
    body_bvh = BVHTree.FromBMesh(body_bm)

    # Get body bounds
    body_verts_world = [body_mesh.matrix_world @ v.co for v in body_mesh.data.vertices]
    body_xs = [v.x for v in body_verts_world]
    body_ys = [v.y for v in body_verts_world]
    body_zs = [v.z for v in body_verts_world]
    body_min = mathutils.Vector((min(body_xs), min(body_ys), min(body_zs)))
    body_max = mathutils.Vector((max(body_xs), max(body_ys), max(body_zs)))
    body_center = (body_min + body_max) / 2

    # Get slot region
    bottom_hint, top_hint = _SLOT_BONE_REGIONS.get(args.slot, ("hips", "neck"))
    region_bottom = region_top = None
    for bone in armature.data.bones:
        bz = (armature.matrix_world @ bone.head_local).z
        if _matches_bone(bone.name, bottom_hint):
            if region_bottom is None or bz < region_bottom:
                region_bottom = bz
        if _matches_bone(bone.name, top_hint):
            if region_top is None or bz > region_top:
                region_top = bz

    if region_bottom and region_top:
        if region_bottom > region_top:
            region_bottom, region_top = region_top, region_bottom
        log(f"  Slot region Z: {region_bottom:.3f} → {region_top:.3f}")

    # Measure torso cross-section at slot region (excluding arms)
    torso_verts = [v for v in body_verts_world
                   if region_bottom and region_top
                   and region_bottom <= v.z <= region_top]
    if torso_verts:
        torso_ys = [v.y for v in torso_verts]
        torso_depth = max(torso_ys) - min(torso_ys)
        # Trim outer 20% X to exclude arms
        torso_xs = sorted([v.x for v in torso_verts])
        n = len(torso_xs)
        trim = int(n * 0.2)
        if trim > 0 and n > 2 * trim:
            torso_width = torso_xs[n - trim - 1] - torso_xs[trim]
        else:
            torso_width = torso_xs[-1] - torso_xs[0]
        log(f"  Torso cross-section: width={torso_width:.3f}, depth={torso_depth:.3f}")

    # Equipment bounds
    equip_world = equip.matrix_world
    equip_verts_world = [equip_world @ v.co for v in equip.data.vertices]
    equip_xs = [v.x for v in equip_verts_world]
    equip_ys = [v.y for v in equip_verts_world]
    equip_zs = [v.z for v in equip_verts_world]

    log(f"  Equipment X range: {min(equip_xs):.3f} → {max(equip_xs):.3f} (width={max(equip_xs)-min(equip_xs):.3f})")
    log(f"  Equipment Y range: {min(equip_ys):.3f} → {max(equip_ys):.3f} (depth={max(equip_ys)-min(equip_ys):.3f})")
    log(f"  Equipment Z range: {min(equip_zs):.3f} → {max(equip_zs):.3f} (height={max(equip_zs)-min(equip_zs):.3f})")

    # Per-vertex analysis
    inside_count = 0
    outside_count = 0
    distances = []
    inside_dists = []

    for ev in equip.data.vertices:
        world_co = equip_world @ ev.co
        location, normal, face_idx, dist = body_bvh.find_nearest(world_co)
        if location is None:
            continue

        # Inside/outside using face normal dot product
        # (vertex - surface_point) dot face_normal: negative = inside
        vertex_dir = world_co - location
        face_normal = normal.normalized()

        # Validate face normal points outward
        outward_ref = (location - body_center)
        if face_normal.dot(outward_ref) < 0:
            face_normal = -face_normal

        signed_dist = vertex_dir.dot(face_normal)
        distances.append(signed_dist)

        if signed_dist < 0:
            inside_count += 1
            inside_dists.append(signed_dist)
        else:
            outside_count += 1

    body_bm.free()

    num_verts = len(distances)
    avg_dist = sum(distances) / num_verts if num_verts > 0 else 0
    min_dist = min(distances) if distances else 0
    max_dist = max(distances) if distances else 0

    # Distance histogram (offset target is ~0.03)
    bins = {"deep_inside (<-0.05)": 0, "inside (-0.05 to 0)": 0,
            "too_close (0 to 0.02)": 0, "ideal (0.02 to 0.05)": 0,
            "offset_zone (0.05 to 0.10)": 0, "far (>0.10)": 0}
    for d in distances:
        if d < -0.05:
            bins["deep_inside (<-0.05)"] += 1
        elif d < 0:
            bins["inside (-0.05 to 0)"] += 1
        elif d < 0.02:
            bins["too_close (0 to 0.02)"] += 1
        elif d < 0.05:
            bins["ideal (0.02 to 0.05)"] += 1
        elif d < 0.10:
            bins["offset_zone (0.05 to 0.10)"] += 1
        else:
            bins["far (>0.10)"] += 1

    log("")
    log("═══ FIT QUALITY REPORT ═══")
    log(f"  Total vertices: {num_verts}")
    log(f"  Inside body:  {inside_count} ({100*inside_count/num_verts:.1f}%)")
    log(f"  Outside body: {outside_count} ({100*outside_count/num_verts:.1f}%)")
    log(f"  Signed distance: min={min_dist:.4f}, avg={avg_dist:.4f}, max={max_dist:.4f}")
    if inside_dists:
        log(f"  Inside penetration: avg={sum(inside_dists)/len(inside_dists):.4f}, worst={min(inside_dists):.4f}")
    log("")
    log("  Distance distribution:")
    for label, count in bins.items():
        bar = "█" * int(count / num_verts * 50)
        log(f"    {label:25s}: {count:5d} ({100*count/num_verts:5.1f}%) {bar}")
    log("")

    # Pass/fail criteria
    inside_pct = 100 * inside_count / num_verts if num_verts > 0 else 0
    if inside_pct < 5:
        log("  PASS: Less than 5% vertices inside body")
    else:
        log(f"  FAIL: {inside_pct:.1f}% vertices inside body (target: <5%)")

    # With 0.03 offset, most vertices should be in ideal range (0.02-0.05)
    ideal_pct = 100 * (bins["ideal (0.02 to 0.05)"] + bins["offset_zone (0.05 to 0.10)"]) / num_verts if num_verts > 0 else 0
    if ideal_pct > 50:
        log(f"  PASS: {ideal_pct:.1f}% vertices in offset zone (2-10cm from surface)")
    else:
        log(f"  FAIL: Only {ideal_pct:.1f}% vertices in offset zone (target: >50%)")

    far_pct = 100 * bins["far (>0.10)"] / num_verts if num_verts > 0 else 0
    if far_pct < 20:
        log(f"  PASS: Only {far_pct:.1f}% vertices far from surface")
    else:
        log(f"  FAIL: {far_pct:.1f}% vertices far from surface (target: <20%)")

    log("═══════════════════════════")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[VERIFY_FIT] FATAL ERROR: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
