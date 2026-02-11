"""
Export Helpers — Metadata Sidecar Generation
=============================================

Generates the JSON metadata sidecar file that accompanies rigged GLB exports.
"""

import json
import os


def write_metadata_sidecar(
    output_path,
    tier,
    slot,
    active_bones,
    ordered_bone_names,
    hidden_body_parts,
    vertex_count,
    processing_params,
):
    """
    Write a JSON metadata sidecar file for a rigged equipment GLB.

    Args:
        output_path: Path for the .equipment.json file
        tier: Equipment tier number
        slot: Equipment slot (body, legs, helmet, etc.)
        active_bones: List of bone names with non-zero weights
        ordered_bone_names: Full ordered list of skeleton bone names
        hidden_body_parts: List of body parts hidden by this equipment
        vertex_count: Number of vertices in the equipment mesh
        processing_params: Dict of processing parameters used
    """
    metadata = {
        "version": 1,
        "tier": tier,
        "slot": slot,
        "activeBones": active_bones,
        "orderedBoneNames": ordered_bone_names,
        "hiddenBodyParts": hidden_body_parts,
        "vertexCount": vertex_count,
        "processingParams": processing_params,
        "pipelineVersion": "blender-1.0",
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"[EQUIPMENT_PIPELINE] Metadata written: {output_path}", flush=True)
