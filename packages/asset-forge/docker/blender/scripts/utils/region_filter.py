"""
Region Filter — Slot-to-Bone Mapping
=====================================

Maps equipment slots to the set of bones whose weights should be preserved.
All other bone weights are zeroed out to prevent unwanted deformation.
"""

import bpy

# Bone role keywords used across skeleton formats (VRM, Mixamo, Meshy, Blender)
_BONE_ROLES = {
    "hips": ["hips", "hip", "pelvis"],
    "spine": ["spine", "spine01", "spine.001"],
    "chest": ["chest", "spine02", "spine.002", "spine1"],
    "upper_chest": ["upperchest", "spine03", "spine.003", "spine2"],
    "neck": ["neck"],
    "head": ["head"],
    "jaw": ["jaw"],
    "eye": ["eye", "eyes"],

    "left_shoulder": ["leftshoulder", "shoulder_l", "shoulder.l", "l_shoulder"],
    "left_upper_arm": ["leftupperarm", "upperarm_l", "upperarm.l", "l_upperarm"],
    "left_lower_arm": ["leftlowerarm", "lowerarm_l", "lowerarm.l", "l_lowerarm", "forearm_l", "forearm.l"],
    "left_hand": ["lefthand", "hand_l", "hand.l", "l_hand"],
    "left_fingers": ["leftthumb", "leftindex", "leftmiddle", "leftring", "leftlittle",
                      "thumb_l", "index_l", "middle_l", "ring_l", "little_l", "pinky_l",
                      "thumb.l", "index.l", "middle.l", "ring.l", "little.l", "pinky.l"],

    "right_shoulder": ["rightshoulder", "shoulder_r", "shoulder.r", "r_shoulder"],
    "right_upper_arm": ["rightupperarm", "upperarm_r", "upperarm.r", "r_upperarm"],
    "right_lower_arm": ["rightlowerarm", "lowerarm_r", "lowerarm.r", "r_lowerarm", "forearm_r", "forearm.r"],
    "right_hand": ["righthand", "hand_r", "hand.r", "r_hand"],
    "right_fingers": ["rightthumb", "rightindex", "rightmiddle", "rightring", "rightlittle",
                       "thumb_r", "index_r", "middle_r", "ring_r", "little_r", "pinky_r",
                       "thumb.r", "index.r", "middle.r", "ring.r", "little.r", "pinky.r"],

    "left_upper_leg": ["leftupperleg", "upperleg_l", "upperleg.l", "l_upperleg", "thigh_l", "thigh.l"],
    "left_lower_leg": ["leftlowerleg", "lowerleg_l", "lowerleg.l", "l_lowerleg", "shin_l", "shin.l", "calf_l"],
    "left_foot": ["leftfoot", "foot_l", "foot.l", "l_foot"],
    "left_toes": ["lefttoes", "toes_l", "toes.l", "l_toes", "toe_l"],

    "right_upper_leg": ["rightupperleg", "upperleg_r", "upperleg.r", "r_upperleg", "thigh_r", "thigh.r"],
    "right_lower_leg": ["rightlowerleg", "lowerleg_r", "lowerleg.r", "r_lowerleg", "shin_r", "shin.r", "calf_r"],
    "right_foot": ["rightfoot", "foot_r", "foot.r", "r_foot"],
    "right_toes": ["righttoes", "toes_r", "toes.r", "r_toes", "toe_r"],
}

# Slot → allowed bone roles
_SLOT_ALLOWED_ROLES = {
    "body": [
        "hips", "spine", "chest", "upper_chest", "neck",
        "left_shoulder", "left_upper_arm",
        "right_shoulder", "right_upper_arm",
    ],
    "legs": [
        "hips",
        "left_upper_leg", "left_lower_leg",
        "right_upper_leg", "right_lower_leg",
    ],
    "helmet": [
        "head", "neck", "jaw", "eye",
    ],
    "boots": [
        "left_lower_leg", "left_foot", "left_toes",
        "right_lower_leg", "right_foot", "right_toes",
    ],
    "gloves": [
        "left_lower_arm", "left_hand", "left_fingers",
        "right_lower_arm", "right_hand", "right_fingers",
    ],
    "cape": [
        "hips", "spine", "chest", "upper_chest", "neck",
        "left_shoulder", "right_shoulder",
        "left_upper_leg", "right_upper_leg",
    ],
    "shield": [
        "left_lower_arm", "left_hand",
    ],
}


def _normalize_bone_name(name):
    """Normalize a bone name by stripping common prefixes and lowering."""
    lower = name.lower()
    for prefix in ["mixamorig:", "mixamorig_", "j_bip_c_", "j_bip_l_", "j_bip_r_", "def_", "def-"]:
        if lower.startswith(prefix):
            lower = lower[len(prefix):]
            break
    return lower


def _bone_matches_role(bone_name, role):
    """Check if a bone name matches any keyword for a given role."""
    normalized = _normalize_bone_name(bone_name)
    keywords = _BONE_ROLES.get(role, [])
    for keyword in keywords:
        if keyword in normalized:
            return True
    return False


def get_allowed_bones(slot):
    """
    Get the set of allowed bone roles for a given equipment slot.
    Returns None if no filtering should be applied.
    """
    return _SLOT_ALLOWED_ROLES.get(slot)


def zero_irrelevant_weights(equipment, allowed_roles):
    """
    Zero out vertex group weights for bones that don't match any allowed role.
    Then reassign zero-weight vertices to the nearest allowed bone group.

    Args:
        equipment: Blender mesh object with vertex groups
        allowed_roles: List of bone role strings (e.g., ["hips", "spine", "chest"])

    Returns:
        Number of vertex groups that were zeroed out
    """
    # Identify allowed and disallowed vertex groups
    allowed_indices = set()
    disallowed_indices = set()

    for vg in equipment.vertex_groups:
        is_allowed = False
        for role in allowed_roles:
            if _bone_matches_role(vg.name, role):
                is_allowed = True
                break

        if is_allowed:
            allowed_indices.add(vg.index)
        else:
            disallowed_indices.add(vg.index)

    # Zero out disallowed weights
    for vert in equipment.data.vertices:
        for group in vert.groups:
            if group.group in disallowed_indices:
                group.weight = 0.0

    # Find vertices that now have zero total weight and assign them
    # to the nearest allowed group that has any weights nearby
    if allowed_indices:
        # Find the allowed group with the most total weight (most common)
        fallback_group_idx = None
        best_total = 0.0
        for idx in allowed_indices:
            vg = equipment.vertex_groups[idx]
            total = 0.0
            for vert in equipment.data.vertices:
                for g in vert.groups:
                    if g.group == idx:
                        total += g.weight
            if total > best_total:
                best_total = total
                fallback_group_idx = idx

        if fallback_group_idx is not None:
            reassigned = 0
            for vert in equipment.data.vertices:
                total_weight = sum(g.weight for g in vert.groups)
                if total_weight < 0.001:
                    # Assign full weight to the fallback group
                    equipment.vertex_groups[fallback_group_idx].add(
                        [vert.index], 1.0, "REPLACE"
                    )
                    reassigned += 1
            if reassigned > 0:
                import bpy
                print(f"[EQUIPMENT_PIPELINE]   Reassigned {reassigned} zero-weight vertices to fallback bone", flush=True)

    return len(disallowed_indices)
