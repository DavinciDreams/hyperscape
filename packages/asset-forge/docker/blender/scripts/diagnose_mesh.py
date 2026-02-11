"""Diagnose mesh issues: degenerate faces, flipped normals, non-manifold edges."""
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
    parser.add_argument("--equipment", required=True)
    return parser.parse_args(argv)

def log(msg):
    print(f"[DIAGNOSE] {msg}", flush=True)

def main():
    args = parse_args()
    
    # Clean scene
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    
    # Import equipment
    log(f"Importing: {args.equipment}")
    bpy.ops.import_scene.gltf(filepath=args.equipment)
    
    equip = None
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            if equip is None or len(obj.data.vertices) > len(equip.data.vertices):
                equip = obj
    
    if not equip:
        log("No mesh found!")
        return
    
    log(f"Mesh: {equip.name} ({len(equip.data.vertices)} verts, {len(equip.data.polygons)} faces, {len(equip.data.edges)} edges)")
    
    # Check for custom split normals
    log(f"Has custom normals: {equip.data.has_custom_normals}")
    
    # Check smooth/flat shading
    smooth_count = sum(1 for p in equip.data.polygons if p.use_smooth)
    flat_count = len(equip.data.polygons) - smooth_count
    log(f"Smooth faces: {smooth_count}, Flat faces: {flat_count}")
    
    # Check materials
    for i, mat in enumerate(equip.data.materials):
        if mat:
            log(f"Material {i}: {mat.name}, backface_culling={mat.use_backface_culling}")
            if mat.node_tree:
                for node in mat.node_tree.nodes:
                    if node.type == 'BSDF_PRINCIPLED':
                        for inp in node.inputs:
                            if inp.name in ['Base Color', 'Alpha', 'Metallic', 'Roughness']:
                                log(f"  {inp.name}: {inp.default_value}")
    
    # BMesh analysis
    bm = bmesh.new()
    bm.from_mesh(equip.data)
    bm.transform(equip.matrix_world)
    
    # Check degenerate faces (near-zero area)
    degenerate = 0
    tiny_faces = 0
    flipped = 0
    total_area = 0
    for face in bm.faces:
        area = face.calc_area()
        total_area += area
        if area < 1e-8:
            degenerate += 1
        elif area < 1e-4:
            tiny_faces += 1
    
    log(f"Total face area: {total_area:.6f}")
    log(f"Degenerate faces (area < 1e-8): {degenerate}")
    log(f"Tiny faces (area < 1e-4): {tiny_faces}")
    
    # Check non-manifold edges (edges shared by != 2 faces)
    non_manifold = 0
    boundary = 0
    for edge in bm.edges:
        face_count = len(edge.link_faces)
        if face_count == 1:
            boundary += 1
        elif face_count != 2:
            non_manifold += 1
    
    log(f"Boundary edges (1 face): {boundary}")
    log(f"Non-manifold edges (!= 1 or 2 faces): {non_manifold}")
    
    # Check for loose/duplicate vertices
    loose = sum(1 for v in bm.verts if not v.link_edges)
    log(f"Loose vertices (no edges): {loose}")
    
    # Check vertex normals - look for zero-length or NaN normals
    # calc_normals() removed - not available in Blender 4.2+
    zero_normals = 0
    nan_normals = 0
    negative_z_normals = 0
    corner_normals = equip.data.corner_normals
    for cn in corner_normals:
        n = cn.vector
        length = (n[0]**2 + n[1]**2 + n[2]**2) ** 0.5
        if length < 0.001:
            zero_normals += 1
        if any(str(v) == 'nan' for v in n):
            nan_normals += 1
    
    log(f"Corner normals - total: {len(corner_normals)}, zero-length: {zero_normals}, NaN: {nan_normals}")
    
    # Check face normal consistency using BMesh
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # Compare with current normals
    center = mathutils.Vector((0, 0, 0))
    for v in bm.verts:
        center += v.co
    center /= len(bm.verts)
    
    inward_normals = 0
    for face in bm.faces:
        face_center = face.calc_center_median()
        outward = face_center - center
        if face.normal.dot(outward) < 0:
            inward_normals += 1
    
    log(f"Faces with inward-pointing normals: {inward_normals}/{len(bm.faces)}")
    
    # Check for duplicate faces
    face_verts_set = set()
    duplicate_faces = 0
    for face in bm.faces:
        key = tuple(sorted(v.index for v in face.verts))
        if key in face_verts_set:
            duplicate_faces += 1
        face_verts_set.add(key)
    
    log(f"Duplicate faces: {duplicate_faces}")
    
    bm.free()
    
    log("=== DIAGNOSIS COMPLETE ===")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[DIAGNOSE] ERROR: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
