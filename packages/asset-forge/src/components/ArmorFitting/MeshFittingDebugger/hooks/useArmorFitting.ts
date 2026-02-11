import { MutableRefObject } from "react";
import * as THREE from "three";

import { ArmorFittingService } from "../../../../services/fitting/ArmorFittingService";
import {
  MeshFittingService,
  MeshFittingParameters,
} from "../../../../services/fitting/MeshFittingService";
import { ExtendedMesh } from "../../../../types";
import {
  calculateScaleRatio,
  calculateFittingScale,
  calculateVolumeBasedScale,
  updateSceneMatrices,
  isMeshStandardMaterial,
} from "../utils";

interface ArmorFittingProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  avatarMeshRef: MutableRefObject<THREE.SkinnedMesh | null>;
  armorMeshRef: MutableRefObject<ExtendedMesh | null>;
  originalArmorGeometryRef: MutableRefObject<THREE.BufferGeometry | null>;
  debugArrowGroupRef: MutableRefObject<THREE.Group | null>;
  hullMeshRef: MutableRefObject<THREE.Mesh | null>;
  fittingService: MutableRefObject<MeshFittingService>;
  armorFittingService: MutableRefObject<ArmorFittingService>;

  setIsProcessing: (value: boolean) => void;
  setIsArmorFitted: (value: boolean) => void;
  setIsArmorBound: (value: boolean) => void;
  setBoundArmorMesh: (mesh: THREE.SkinnedMesh | null) => void;
  setSkinnedArmorMesh: (mesh: THREE.SkinnedMesh | null) => void;
  setError: (value: string) => void;

  isProcessing: boolean;
  showHull: boolean;
  fittingParameters: MeshFittingParameters;
  selectedAvatar: { name: string } | null;
}

export function useArmorFitting({
  sceneRef,
  avatarMeshRef,
  armorMeshRef,
  originalArmorGeometryRef,
  debugArrowGroupRef,
  hullMeshRef: _hullMeshRef,
  fittingService,
  armorFittingService,
  setIsProcessing,
  setIsArmorFitted,
  setIsArmorBound,
  setBoundArmorMesh,
  setSkinnedArmorMesh,
  setError,
  isProcessing,
  showHull: _showHull,
  fittingParameters,
  selectedAvatar,
}: ArmorFittingProps) {
  const performArmorFitting = async () => {
    if (!sceneRef.current || !armorMeshRef.current || !avatarMeshRef.current) {
      console.error("Scene, armor, or avatar not available");
      return;
    }

    const scene = sceneRef.current;
    const armorMesh = armorMeshRef.current;
    const avatarMesh = avatarMeshRef.current;

    // Update entire scene before any calculations
    updateSceneMatrices(scene);
    console.log("Updated scene matrix world before fitting");

    // Ensure we're not already processing
    if (isProcessing) {
      console.warn("Already processing a fitting operation");
      return;
    }

    setIsProcessing(true);

    // Log current state
    console.log("=== PRE-FITTING STATE CHECK ===");
    console.log("Armor scale:", armorMesh.scale.clone());
    console.log("Armor position:", armorMesh.position.clone());
    console.log("Armor parent scale:", armorMesh.parent?.scale.clone());
    console.log("Has been fitted before:", armorMesh.userData.hasBeenFitted);

    // Ensure armor starts at scale 1,1,1
    if (
      armorMesh.scale.x !== 1 ||
      armorMesh.scale.y !== 1 ||
      armorMesh.scale.z !== 1
    ) {
      console.warn(
        "⚠️ Armor scale is not 1,1,1! Resetting scale before fitting.",
      );
      armorMesh.scale.set(1, 1, 1);
      armorMesh.updateMatrixWorld(true);
    }

    console.log("=== ARMOR TO TORSO FITTING ===");

    // Store parent references
    const avatarParent = avatarMesh.parent;
    const armorParent = armorMesh.parent;

    // Check and normalize scales
    console.log("=== SCALE ANALYSIS ===");
    const scaleRatio = calculateScaleRatio(avatarMesh, armorMesh);
    console.log("Scale ratio (armor/avatar):", scaleRatio);

    // Normalize armor scale if needed
    if (Math.abs(scaleRatio - 1.0) > 0.1) {
      console.warn(
        `SCALE MISMATCH DETECTED: Armor is ${scaleRatio.toFixed(1)}x the size of avatar`,
      );
      const normalizationFactor = 1 / scaleRatio;
      armorMesh.scale.multiplyScalar(normalizationFactor);
      armorMesh.updateMatrixWorld(true);
      console.log("Applied normalization factor:", normalizationFactor);
    }

    // Calculate torso bounds
    const torsoInfo = calculateTorsoBounds(avatarMesh);
    if (!torsoInfo) {
      console.error("Could not calculate torso bounds");
      setIsProcessing(false);
      return;
    }

    const { torsoCenter, torsoSize, torsoBounds: _torsoBounds } = torsoInfo;

    // Scale and position armor
    const scaledArmor = scaleAndPositionArmor(
      armorMesh,
      torsoCenter,
      torsoSize,
      originalArmorGeometryRef,
      selectedAvatar,
    );

    if (!scaledArmor) {
      console.error("Failed to scale and position armor");
      setIsProcessing(false);
      return;
    }

    // Apply the fitting using the service
    try {
      const shrinkwrapParams = {
        ...fittingParameters,
        iterations: Math.min(fittingParameters.iterations, 10),
        stepSize: fittingParameters.stepSize || 0.1,
        targetOffset: fittingParameters.targetOffset || 0.01,
        sampleRate: fittingParameters.sampleRate || 1.0,
        smoothingStrength: fittingParameters.smoothingStrength || 0.2,
      };

      console.log("Shrinkwrap parameters:", shrinkwrapParams);

      // Clear any existing debug arrows
      if (debugArrowGroupRef.current) {
        debugArrowGroupRef.current.clear();
      }

      // Perform the fitting
      await fittingService.current.fitMeshToTarget(
        armorMesh,
        avatarMesh,
        shrinkwrapParams,
      );

      console.log("✅ Armor fitting complete!");

      // Mark armor as fitted
      armorMesh.userData.hasBeenFitted = true;
      setIsArmorFitted(true);
      setIsArmorBound(false);

      // Ensure armor is visible and properly updated
      armorMesh.visible = true;
      armorMesh.updateMatrix();
      armorMesh.updateMatrixWorld(true);

      // Force scene update
      scene.updateMatrixWorld(true);
    } catch (error) {
      console.error("Armor fitting failed:", error);
      setError("Failed to fit armor to avatar");
    } finally {
      // Ensure meshes are properly attached to their original parents
      if (avatarParent && !avatarMesh.parent) {
        avatarParent.add(avatarMesh);
      }
      if (armorParent && !armorMesh.parent) {
        armorParent.add(armorMesh);
      }

      setTimeout(() => setIsProcessing(false), 100);
    }
  };

  const bindArmorToSkeleton = () => {
    if (!sceneRef.current || !avatarMeshRef.current || !armorMeshRef.current) {
      console.error("Scene, avatar, or armor not available for binding");
      return;
    }

    console.log("=== BINDING ARMOR TO SKELETON ===");
    setIsProcessing(true);

    try {
      const currentArmorMesh = armorMeshRef.current;
      const avatarMesh = avatarMeshRef.current;
      const scene = sceneRef.current;

      console.log(
        "Current armor mesh:",
        currentArmorMesh.name,
        "Parent:",
        currentArmorMesh.parent?.name,
      );

      // Store the current world transform
      currentArmorMesh.updateMatrixWorld(true);
      const perfectWorldPosition = currentArmorMesh.getWorldPosition(
        new THREE.Vector3(),
      );
      const _perfectWorldQuaternion = currentArmorMesh.getWorldQuaternion(
        new THREE.Quaternion(),
      );
      const perfectWorldScale = currentArmorMesh.getWorldScale(
        new THREE.Vector3(),
      );

      console.log("=== FITTED ARMOR WORLD TRANSFORM ===");
      console.log("World position:", perfectWorldPosition);
      console.log("World scale:", perfectWorldScale);

      // Create the skinned mesh with transform baked into geometry
      const skinnedArmor = armorFittingService.current.bindArmorToSkeleton(
        currentArmorMesh,
        avatarMesh,
        {
          searchRadius: 0.3,
          applyGeometryTransform: true,
        },
      );

      console.log("Skinned armor created");

      // Copy material settings
      if (skinnedArmor.material && currentArmorMesh.material) {
        if (
          isMeshStandardMaterial(skinnedArmor.material) &&
          isMeshStandardMaterial(currentArmorMesh.material)
        ) {
          skinnedArmor.material.wireframe = currentArmorMesh.material.wireframe;
          skinnedArmor.material.transparent =
            currentArmorMesh.material.transparent;
          skinnedArmor.material.opacity = currentArmorMesh.material.opacity;
        }
      }

      // Remove old mesh first
      const armorParent = currentArmorMesh.parent;
      if (armorParent) {
        armorParent.remove(currentArmorMesh);
      } else {
        scene.remove(currentArmorMesh);
      }

      // Add skinned armor to the correct parent
      const armature = avatarMesh.parent;
      if (
        armature &&
        (armature.name === "Armature" ||
          armature.name.toLowerCase().includes("armature"))
      ) {
        console.log("Adding skinned armor to Armature");
        armature.add(skinnedArmor);
      } else {
        console.log("No Armature found, adding to scene");
        scene.add(skinnedArmor);
      }

      skinnedArmor.updateMatrixWorld(true);

      // Verify position
      const finalWorldPos = skinnedArmor.getWorldPosition(new THREE.Vector3());
      const positionDrift = finalWorldPos.distanceTo(perfectWorldPosition);

      if (positionDrift > 0.01) {
        console.warn("⚠️ Skinned armor position drifted from fitted position!");
        console.warn("Expected:", perfectWorldPosition);
        console.warn("Actual:", finalWorldPos);
      } else {
        console.log("✅ Skinned armor is at the correct fitted position!");
      }

      // Check for extreme scales
      const armatureScale =
        skinnedArmor.parent?.getWorldScale(new THREE.Vector3()) ||
        new THREE.Vector3(1, 1, 1);
      if (armatureScale.x < 0.1) {
        console.log(
          "Armature has extreme scale - applying visibility workaround",
        );
        skinnedArmor.frustumCulled = false;
        skinnedArmor.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.frustumCulled = false;
          }
        });
      }

      // Update references
      setSkinnedArmorMesh(skinnedArmor);
      armorMeshRef.current = skinnedArmor as ExtendedMesh;

      // Clean up extra armor meshes
      let armorCount = 0;
      scene.traverse((obj) => {
        if (obj.userData.isArmor && obj instanceof THREE.Mesh) {
          armorCount++;
          if (obj !== skinnedArmor) {
            console.warn("Found extra armor mesh, removing:", obj.name);
            if (obj.parent) obj.parent.remove(obj);
          }
        }
      });
      console.log("Total armor meshes in scene after binding:", armorCount);

      // Update state
      setIsArmorBound(true);
      setBoundArmorMesh(skinnedArmor);

      console.log("✅ Armor successfully bound to skeleton!");

      // Force scene update
      scene.updateMatrixWorld(true);
    } catch (error) {
      console.error("Failed to bind armor to skeleton:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    performArmorFitting,
    bindArmorToSkeleton,
  };
}

// Helper functions specific to armor fitting

function calculateTorsoBounds(avatarMesh: THREE.SkinnedMesh): {
  torsoCenter: THREE.Vector3;
  torsoSize: THREE.Vector3;
  torsoBounds: THREE.Box3;
} | null {
  const avatarBounds = new THREE.Box3().setFromObject(avatarMesh);
  const avatarSize = avatarBounds.getSize(new THREE.Vector3());
  const avatarCenter = avatarBounds.getCenter(new THREE.Vector3());

  console.log("Avatar bounds:", avatarBounds);
  console.log("Avatar height:", avatarSize.y);

  const skeleton = avatarMesh.skeleton;
  if (!skeleton) {
    console.error("Avatar has no skeleton!");
    return null;
  }

  // Update transforms
  avatarMesh.updateMatrix();
  avatarMesh.updateMatrixWorld(true);
  skeleton.bones.forEach((bone) => {
    bone.updateMatrixWorld(true);
  });

  // Bone role matching supporting: VRM (hips, spine, chest, upperChest, neck),
  // VRoid (J_Bip_C_Hips), Mixamo (mixamorig:Hips), Meshy (Hips, Spine01, Spine02),
  // Blender (spine.001), DEF- prefix, generic (Hips, Spine, Chest)
  const matchesBoneRole = (
    boneName: string,
    role:
      | "hips"
      | "spine"
      | "chest"
      | "upperChest"
      | "neck"
      | "head"
      | "shoulder",
  ): boolean => {
    const lower = boneName.toLowerCase();
    const stripped = lower
      .replace(/^mixamorig[_:]?/i, "")
      .replace(/^j_bip_[clr]_/i, "")
      .replace(/^def[_-]/i, "");

    switch (role) {
      case "hips":
        return (
          stripped === "hips" ||
          stripped === "hip" ||
          stripped === "pelvis" ||
          lower === "hips" ||
          lower === "pelvis"
        );
      case "spine":
        return (
          stripped === "spine" ||
          stripped === "spine001" ||
          stripped === "spine.001"
        );
      case "chest":
        return (
          stripped === "chest" ||
          stripped === "spine1" ||
          stripped === "spine01" ||
          stripped === "spine002" ||
          stripped === "spine.002"
        );
      case "upperChest":
        return (
          stripped === "upperchest" ||
          stripped === "upper_chest" ||
          stripped === "spine2" ||
          stripped === "spine02" ||
          stripped === "spine003" ||
          stripped === "spine.003"
        );
      case "neck":
        return stripped === "neck";
      case "head":
        return (
          (stripped === "head" || stripped.startsWith("head")) &&
          !stripped.includes("end") &&
          !stripped.includes("_end")
        );
      case "shoulder":
        return stripped.includes("shoulder") || stripped.includes("clavicle");
    }
  };

  // Find bone positions by role
  type BoneInfo = { y: number; pos: THREE.Vector3 };
  let hips: BoneInfo | null = null;
  let spine: BoneInfo | null = null;
  let chest: BoneInfo | null = null;
  let upperChest: BoneInfo | null = null;
  let neck: BoneInfo | null = null;
  let head: BoneInfo | null = null;
  let leftShoulder: BoneInfo | null = null;
  let rightShoulder: BoneInfo | null = null;

  skeleton.bones.forEach((bone) => {
    const bonePos = new THREE.Vector3();
    bone.getWorldPosition(bonePos);
    const info: BoneInfo = { y: bonePos.y, pos: bonePos.clone() };

    if (matchesBoneRole(bone.name, "hips") && !hips) hips = info;
    if (matchesBoneRole(bone.name, "spine") && !spine) spine = info;
    if (matchesBoneRole(bone.name, "chest") && !chest) chest = info;
    if (matchesBoneRole(bone.name, "upperChest") && !upperChest)
      upperChest = info;
    if (matchesBoneRole(bone.name, "neck") && !neck) neck = info;
    if (matchesBoneRole(bone.name, "head") && !head) head = info;
    if (matchesBoneRole(bone.name, "shoulder")) {
      const lower = bone.name.toLowerCase();
      const isLeft =
        lower.includes("left") ||
        lower.includes("_l_") ||
        lower.endsWith(".l") ||
        lower.endsWith("_l");
      const isRight =
        lower.includes("right") ||
        lower.includes("_r_") ||
        lower.endsWith(".r") ||
        lower.endsWith("_r");
      if (isLeft && !leftShoulder) leftShoulder = info;
      if (isRight && !rightShoulder) rightShoulder = info;
    }
  });

  console.log("Bone detection results:", {
    hips: hips ? `y=${(hips as BoneInfo).y.toFixed(3)}` : "NOT FOUND",
    spine: spine ? `y=${(spine as BoneInfo).y.toFixed(3)}` : "NOT FOUND",
    chest: chest ? `y=${(chest as BoneInfo).y.toFixed(3)}` : "NOT FOUND",
    upperChest: upperChest
      ? `y=${(upperChest as BoneInfo).y.toFixed(3)}`
      : "NOT FOUND",
    neck: neck ? `y=${(neck as BoneInfo).y.toFixed(3)}` : "NOT FOUND",
    head: head ? `y=${(head as BoneInfo).y.toFixed(3)}` : "NOT FOUND",
    leftShoulder: leftShoulder
      ? `y=${(leftShoulder as BoneInfo).y.toFixed(3)}`
      : "NOT FOUND",
    rightShoulder: rightShoulder
      ? `y=${(rightShoulder as BoneInfo).y.toFixed(3)}`
      : "NOT FOUND",
  });

  // Calculate torso bottom: hips bone or proportional fallback
  let torsoBottom: number;
  if (hips) {
    // Hips bone marks the bottom of the torso
    torsoBottom = (hips as BoneInfo).y;
    console.log(`Torso bottom from hips bone: ${torsoBottom.toFixed(3)}`);
  } else if (spine) {
    // Spine is slightly above hips, offset down
    torsoBottom = (spine as BoneInfo).y - avatarSize.y * 0.05;
    console.log(
      `Torso bottom from spine bone (offset): ${torsoBottom.toFixed(3)}`,
    );
  } else {
    // Fallback: 47% of height (approximate hip level for humanoids)
    torsoBottom = avatarBounds.min.y + avatarSize.y * 0.47;
    console.log(`Torso bottom from fallback (47%): ${torsoBottom.toFixed(3)}`);
  }

  // Calculate torso top: neck > shoulder > upperChest > chest > fallback
  let torsoTop: number;
  if (neck) {
    torsoTop = (neck as BoneInfo).y;
    console.log(`Torso top from neck bone: ${torsoTop.toFixed(3)}`);
  } else if (leftShoulder || rightShoulder) {
    const lsy = leftShoulder ? (leftShoulder as BoneInfo).y : -Infinity;
    const rsy = rightShoulder ? (rightShoulder as BoneInfo).y : -Infinity;
    torsoTop = Math.max(lsy, rsy);
    console.log(`Torso top from shoulder bones: ${torsoTop.toFixed(3)}`);
  } else if (upperChest) {
    torsoTop = (upperChest as BoneInfo).y + avatarSize.y * 0.04;
    console.log(`Torso top from upperChest bone: ${torsoTop.toFixed(3)}`);
  } else if (chest) {
    torsoTop = (chest as BoneInfo).y + avatarSize.y * 0.08;
    console.log(`Torso top from chest bone: ${torsoTop.toFixed(3)}`);
  } else {
    // Fallback: 72% of height (approximate neck level)
    torsoTop = avatarBounds.min.y + avatarSize.y * 0.72;
    console.log(`Torso top from fallback (72%): ${torsoTop.toFixed(3)}`);
  }

  // Ensure minimum torso height (at least 10% of avatar height)
  if (torsoTop - torsoBottom < avatarSize.y * 0.1) {
    console.warn("Torso height too small, adjusting bounds");
    const mid = (torsoTop + torsoBottom) / 2;
    torsoBottom = mid - avatarSize.y * 0.12;
    torsoTop = mid + avatarSize.y * 0.12;
  }

  // Calculate torso width: use shoulder distance if available, otherwise proportional
  let torsoWidth: number;
  if (leftShoulder && rightShoulder) {
    const shoulderDistance = Math.abs(
      (leftShoulder as BoneInfo).pos.x - (rightShoulder as BoneInfo).pos.x,
    );
    // Shoulders define the outer edge; torso is slightly wider for armor
    torsoWidth = shoulderDistance * 1.1;
    console.log(
      `Torso width from shoulder distance: ${torsoWidth.toFixed(3)} (distance: ${shoulderDistance.toFixed(3)})`,
    );
  } else {
    // In T-pose, avatarSize.x includes outstretched arms
    // Actual torso is roughly 25-30% of full T-pose width
    torsoWidth = avatarSize.x * 0.28;
    console.log(
      `Torso width from proportional (28% of bbox): ${torsoWidth.toFixed(3)}`,
    );
  }

  // Torso depth
  const torsoDepth = avatarSize.z * 0.5;

  const torsoCenter = new THREE.Vector3(
    avatarCenter.x,
    (torsoBottom + torsoTop) / 2,
    avatarCenter.z,
  );
  const torsoSize = new THREE.Vector3(
    torsoWidth,
    torsoTop - torsoBottom,
    torsoDepth,
  );
  const torsoBounds = new THREE.Box3();
  torsoBounds.setFromCenterAndSize(torsoCenter, torsoSize);

  console.log(
    "Torso Y range:",
    torsoBounds.min.y.toFixed(3),
    "to",
    torsoBounds.max.y.toFixed(3),
  );
  console.log("Torso center:", torsoCenter);
  console.log("Torso size:", torsoSize);

  return { torsoCenter, torsoSize, torsoBounds };
}

function scaleAndPositionArmor(
  armorMesh: THREE.Mesh,
  torsoCenter: THREE.Vector3,
  torsoSize: THREE.Vector3,
  originalArmorGeometryRef: MutableRefObject<THREE.BufferGeometry | null>,
  selectedAvatar: { name: string } | null,
): boolean {
  console.log("=== SCALING AND POSITIONING ARMOR ===");

  // Get armor bounds
  const armorBounds = new THREE.Box3().setFromObject(armorMesh);
  const armorSize = armorBounds.getSize(new THREE.Vector3());
  const armorCenter = armorBounds.getCenter(new THREE.Vector3());

  console.log("Initial armor center:", armorCenter);
  console.log("Initial armor size:", armorSize);
  console.log("Target torso center:", torsoCenter);
  console.log("Target torso size:", torsoSize);

  // Calculate scales
  const targetScale = calculateFittingScale(armorSize, torsoSize);
  const minScale = 0.5;
  const _finalScale = Math.max(targetScale, minScale);

  // Get character-specific adjustments
  const characterProfile = selectedAvatar?.name
    ?.toLowerCase()
    .includes("goblin")
    ? { scaleBoost: 0.7 }
    : { scaleBoost: 1.0 };

  // Volume-based scaling
  const improvedFinalScale = Math.max(
    calculateVolumeBasedScale(armorSize, torsoSize, characterProfile),
    minScale,
  );

  console.log("Volume-based scale:", improvedFinalScale.toFixed(3));

  // Restore original geometry if previously fitted
  if (originalArmorGeometryRef.current && armorMesh.userData.hasBeenFitted) {
    console.log("Restoring original geometry before scaling");
    armorMesh.geometry.dispose();
    armorMesh.geometry = originalArmorGeometryRef.current.clone();
    armorMesh.geometry.computeVertexNormals();
  }

  // Apply scale
  armorMesh.scale.multiplyScalar(improvedFinalScale);
  armorMesh.updateMatrixWorld(true);

  // Get new bounds after scaling
  const scaledBounds = new THREE.Box3().setFromObject(armorMesh);
  const scaledCenter = scaledBounds.getCenter(new THREE.Vector3());

  // Center armor on torso
  const currentMeshPos = armorMesh.position.clone();
  const geometryOffset = scaledCenter.clone().sub(currentMeshPos);
  const targetMeshPosition = torsoCenter.clone().sub(geometryOffset);
  const centerOffset = targetMeshPosition.clone().sub(currentMeshPos);

  // Smart vertical adjustments
  const scaledArmorHeight = scaledBounds.max.y - scaledBounds.min.y;
  const armorCenterY = scaledCenter.y + centerOffset.y;
  const armorTopY = armorCenterY + scaledArmorHeight / 2;
  const armorBottomY = armorCenterY - scaledArmorHeight / 2;

  let verticalAdjustment = 0;
  const torsoTop = torsoCenter.y + torsoSize.y / 2;
  const torsoBottom = torsoCenter.y - torsoSize.y / 2;

  if (armorTopY > torsoTop + 0.1) {
    const overhang = armorTopY - (torsoTop + 0.1);
    verticalAdjustment = -overhang;
    console.log(
      "Armor would extend above torso by",
      overhang.toFixed(3),
      "- adjusting down",
    );
  } else if (armorBottomY < torsoBottom - 0.05) {
    const underhang = torsoBottom - 0.05 - armorBottomY;
    verticalAdjustment = underhang;
    console.log(
      "Armor would extend below torso by",
      underhang.toFixed(3),
      "- adjusting up",
    );
  }

  centerOffset.y += verticalAdjustment;

  // Apply position offset
  armorMesh.position.add(centerOffset);
  armorMesh.updateMatrixWorld(true);

  console.log("Positioned armor at:", armorMesh.position);

  return true;
}
