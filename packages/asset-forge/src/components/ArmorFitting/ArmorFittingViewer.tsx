import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as THREE from "three";
// import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter'
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { VRM } from "@pixiv/three-vrm";

// @ts-ignore - Three.js examples modules don't have proper type declarations
import {
  ArmorFittingService,
  BodyRegion,
  CollisionPoint,
} from "../../services/fitting/ArmorFittingService";
import { MeshFittingService } from "../../services/fitting/MeshFittingService";
import { SinglePassFittingService } from "../../services/fitting/SinglePassFittingService";
import type { SmartFittingParameters } from "../../services/fitting/SinglePassFittingService";
import { WasmFittingService } from "../../services/fitting/WasmFittingService";
import type { WasmFittingParameters } from "../../services/fitting/WasmFittingService";
// import { WeightTransferService } from '../../services/fitting/WeightTransferService'
import { retargetAnimation } from "../../services/retargeting/AnimationRetargeting";
import { notify } from "../../utils/notify";

import { useArmorExport } from "@/hooks";

// All VRM humanoid bone names (used for animation baking)
const VRM_HUMANOID_BONES = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
  "leftThumbMetacarpal",
  "leftThumbProximal",
  "leftThumbDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftRingProximal",
  "leftRingIntermediate",
  "leftRingDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
  "rightThumbMetacarpal",
  "rightThumbProximal",
  "rightThumbDistal",
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal",
] as const;

/**
 * Bake a VRM-retargeted animation clip into a clip that directly drives GLB bone names.
 *
 * The retargeted clip targets VRM normalized bone names and is designed to play
 * on vrm.scene. This function samples the VRM pipeline (mixer + vrm.update) to
 * capture the raw bone transforms, then builds a new clip that can play on the
 * GLB avatar's AnimationMixer — no per-frame bone copying needed.
 */
function bakeAnimationForGLB(
  vrm: VRM,
  retargetedClip: THREE.AnimationClip,
  glbRoot: THREE.Object3D,
): THREE.AnimationClip | null {
  const fps = 30;
  const duration = retargetedClip.duration;
  const numFrames = Math.ceil(duration * fps) + 1;

  // Build mapping: VRM raw bone node → GLB bone name
  // Use VRM humanoid API to get raw bone nodes (guaranteed correct)
  const glbBoneMap = new Map<string, THREE.Bone>();
  glbRoot.traverse((child) => {
    if (child instanceof THREE.Bone) {
      glbBoneMap.set(child.name, child);
    }
  });

  const boneMapping: Array<{
    rawNode: THREE.Object3D;
    glbBoneName: string;
    isHips: boolean;
  }> = [];
  for (const boneName of VRM_HUMANOID_BONES) {
    // getRawBoneNode uses VRMHumanBoneName which is typed strictly
    const rawNode = vrm.humanoid.getRawBoneNode(boneName as never);
    if (rawNode && glbBoneMap.has(rawNode.name)) {
      boneMapping.push({
        rawNode,
        glbBoneName: rawNode.name,
        isHips: boneName === "hips",
      });
    }
  }

  if (boneMapping.length === 0) {
    console.error("[BakeAnimation] No bone mapping found between VRM and GLB");
    // Debug: log what bones exist
    const vrmBoneNames: string[] = [];
    for (const boneName of VRM_HUMANOID_BONES) {
      const rawNode = vrm.humanoid.getRawBoneNode(boneName as never);
      if (rawNode) vrmBoneNames.push(`${boneName}→${rawNode.name}`);
    }
    const glbBoneNames = Array.from(glbBoneMap.keys());
    console.error("[BakeAnimation] VRM raw bones:", vrmBoneNames);
    console.error("[BakeAnimation] GLB bones:", glbBoneNames);
    return null;
  }

  console.log(
    `[BakeAnimation] Mapping ${boneMapping.length} bones, sampling ${numFrames} frames at ${fps}fps`,
  );

  // Create temporary mixer to sample the retargeted clip on VRM scene
  const tempMixer = new THREE.AnimationMixer(vrm.scene);
  const tempAction = tempMixer.clipAction(retargetedClip);
  tempAction.play();

  // Storage for sampled keyframes
  const times: number[] = [];
  const quatData = new Map<string, number[]>();
  const posData = new Map<string, number[]>();

  // Sample each frame
  for (let i = 0; i < numFrames; i++) {
    const t = Math.min(i / fps, duration);
    times.push(t);

    // Set mixer to this time (resets to 0 internally, then advances to t)
    tempMixer.setTime(t);
    // Sync normalized → raw bones (delta=0 just syncs without advancing spring bones)
    vrm.update(0);

    // Capture raw bone transforms
    for (const { rawNode, glbBoneName, isHips } of boneMapping) {
      if (!quatData.has(glbBoneName)) {
        quatData.set(glbBoneName, []);
        posData.set(glbBoneName, []);
      }
      quatData
        .get(glbBoneName)!
        .push(
          rawNode.quaternion.x,
          rawNode.quaternion.y,
          rawNode.quaternion.z,
          rawNode.quaternion.w,
        );
      // Only sample position for hips (other bones don't translate)
      if (isHips) {
        posData
          .get(glbBoneName)!
          .push(rawNode.position.x, rawNode.position.y, rawNode.position.z);
      }
    }
  }

  // Clean up temporary mixer
  tempMixer.stopAllAction();
  tempMixer.uncacheClip(retargetedClip);

  // Build tracks
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [boneName, values] of quatData) {
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${boneName}.quaternion`,
        new Float32Array(times),
        new Float32Array(values),
      ),
    );
  }
  for (const [boneName, values] of posData) {
    if (values.length > 0) {
      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${boneName}.position`,
          new Float32Array(times),
          new Float32Array(values),
        ),
      );
    }
  }

  console.log(
    `[BakeAnimation] Baked ${tracks.length} tracks (${times.length} keyframes each)`,
  );
  return new THREE.AnimationClip(
    "baked-" + retargetedClip.name,
    duration,
    tracks,
  );
}

// Type declarations
interface AnimatedGLTF extends GLTF {
  animations: THREE.AnimationClip[];
}

declare global {
  interface Window {
    __visualizationGroup?: THREE.Group;
  }
}

// Fitting parameter interfaces
interface ArmorFittingParams {
  iterations: number;
  stepSize: number;
  targetOffset: number;
  sampleRate: number;
  smoothingStrength: number;
  smoothingRadius: number;
  preserveFeatures?: boolean;
  featureAngleThreshold?: number;
  useImprovedShrinkwrap?: boolean;
  preserveOpenings?: boolean;
  pushInteriorVertices?: boolean;
}

interface HelmetFittingParams {
  method?: "auto" | "manual";
  sizeMultiplier?: number;
  fitTightness?: number;
  verticalOffset?: number;
  forwardOffset?: number;
  rotation?: { x: number; y: number; z: number };
  attachToHead?: boolean;
  showHeadBounds?: boolean;
  showCollisionDebug?: boolean;
}

// ── Torso bounds detection (shared between auto-position and fitting) ──

type BoneInfo = { y: number; pos: THREE.Vector3 };

/**
 * Matches a bone name to a semantic role across all common skeleton formats:
 * VRM (hips, spine, chest, upperChest, neck), VRoid (J_Bip_C_*),
 * Mixamo (mixamorig:*), Meshy (Hips, Spine01, Spine02),
 * Blender (spine.001), DEF- prefix, generic names.
 */
function matchesBoneRole(
  boneName: string,
  role:
    | "hips"
    | "spine"
    | "chest"
    | "upperChest"
    | "neck"
    | "head"
    | "shoulder",
): boolean {
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
}

/**
 * Calculate torso bounds from skeleton bones.
 * Returns center, size, and bounding box of the torso region.
 */
function calculateTorsoBounds(avatarMesh: THREE.SkinnedMesh): {
  torsoCenter: THREE.Vector3;
  torsoSize: THREE.Vector3;
  torsoBounds: THREE.Box3;
} | null {
  const avatarBounds = new THREE.Box3().setFromObject(avatarMesh);
  const avatarSize = avatarBounds.getSize(new THREE.Vector3());
  const avatarCenter = avatarBounds.getCenter(new THREE.Vector3());

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

  // Find bone positions by role
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
    torsoBottom = (hips as BoneInfo).y;
  } else if (spine) {
    torsoBottom = (spine as BoneInfo).y - avatarSize.y * 0.05;
  } else {
    torsoBottom = avatarBounds.min.y + avatarSize.y * 0.47;
  }

  // Calculate torso top: neck > shoulder > upperChest > chest > fallback
  let torsoTop: number;
  if (neck) {
    torsoTop = (neck as BoneInfo).y;
  } else if (leftShoulder || rightShoulder) {
    const lsy = leftShoulder ? (leftShoulder as BoneInfo).y : -Infinity;
    const rsy = rightShoulder ? (rightShoulder as BoneInfo).y : -Infinity;
    torsoTop = Math.max(lsy, rsy);
  } else if (upperChest) {
    torsoTop = (upperChest as BoneInfo).y + avatarSize.y * 0.04;
  } else if (chest) {
    torsoTop = (chest as BoneInfo).y + avatarSize.y * 0.08;
  } else {
    torsoTop = avatarBounds.min.y + avatarSize.y * 0.72;
  }

  // Ensure minimum torso height
  if (torsoTop - torsoBottom < avatarSize.y * 0.1) {
    const mid = (torsoTop + torsoBottom) / 2;
    torsoBottom = mid - avatarSize.y * 0.12;
    torsoTop = mid + avatarSize.y * 0.12;
  }

  // Width: shoulder distance or T-pose-aware proportional
  let torsoWidth: number;
  if (leftShoulder && rightShoulder) {
    const shoulderDistance = Math.abs(
      (leftShoulder as BoneInfo).pos.x - (rightShoulder as BoneInfo).pos.x,
    );
    torsoWidth = shoulderDistance * 1.1;
  } else {
    torsoWidth = avatarSize.x * 0.28;
  }

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

/**
 * Auto-position and scale armor to the avatar's torso region.
 * Called when both models are loaded so the armor appears at the chest,
 * giving instant visual feedback before the user clicks "Perform Fitting".
 */
function autoPositionArmorOnTorso(
  avatarMesh: THREE.SkinnedMesh,
  armorMesh: THREE.Mesh,
): void {
  console.log("=== AUTO-POSITIONING ARMOR ON TORSO ===");

  // Ensure entire parent chain has up-to-date matrices.
  // updateWorldMatrix(true, true) walks UP ancestors first, then DOWN children —
  // unlike updateMatrixWorld(true) which only propagates downward.
  avatarMesh.updateWorldMatrix(true, true);
  armorMesh.updateWorldMatrix(true, true);

  const torsoInfo = calculateTorsoBounds(avatarMesh);
  if (!torsoInfo) {
    console.warn("Could not calculate torso bounds for auto-positioning");
    return;
  }

  const { torsoCenter, torsoSize } = torsoInfo;

  // Group scale already makes armor roughly the right world-space size (Step 1).
  // Fine-tune mesh-level scale so armor roughly matches the body surface.
  // Torso bounds are from bones (inside the flesh), so add ~15% to approximate
  // the actual body surface. With normal projection we don't need the armor to
  // start oversized — keeping it close preserves arm hole alignment.
  const armorBounds = new THREE.Box3().setFromObject(armorMesh);
  const armorWorldSize = armorBounds.getSize(new THREE.Vector3());

  if (armorWorldSize.y > 0) {
    const margin = 1.15; // Just above body surface; arm holes stay aligned
    const scaleX =
      armorWorldSize.x > 0 ? (torsoSize.x * margin) / armorWorldSize.x : 1;
    const scaleY = (torsoSize.y * margin) / armorWorldSize.y;
    const scaleZ =
      armorWorldSize.z > 0 ? (torsoSize.z * margin) / armorWorldSize.z : 1;
    const scaleFactor = Math.max(scaleX, scaleY, scaleZ);
    armorMesh.scale.multiplyScalar(scaleFactor);
    armorMesh.updateWorldMatrix(false, true);
  }

  // Position armor center at torso center.
  // CRITICAL: armorMesh.position is in parent-local space, but torsoCenter is
  // in world space. Use parent.worldToLocal for correct coordinate conversion.
  const scaledBounds = new THREE.Box3().setFromObject(armorMesh);
  const scaledWorldCenter = scaledBounds.getCenter(new THREE.Vector3());

  if (armorMesh.parent) {
    const targetInParent = armorMesh.parent.worldToLocal(torsoCenter.clone());
    const currentInParent = armorMesh.parent.worldToLocal(scaledWorldCenter);
    armorMesh.position.add(targetInParent.sub(currentInParent));
  } else {
    armorMesh.position.add(torsoCenter.clone().sub(scaledWorldCenter));
  }
  armorMesh.updateWorldMatrix(false, true);

  console.log(
    "Auto-positioned armor: meshScale=",
    armorMesh.scale.x.toFixed(3),
    "position=",
    armorMesh.position,
  );
}

// Simplified demo component that handles model loading
interface ModelDemoProps {
  avatarUrl?: string;
  armorUrl?: string;
  helmetUrl?: string;
  showWireframe: boolean;
  equipmentSlot: "Head" | "Spine2" | "Pelvis";
  armorIsRigged?: boolean;
  currentAnimation: "tpose" | "walking" | "running";
  isAnimationPlaying: boolean;
  vrmAnimation?: string | null;
  vrmUrl?: string;
  onModelsReady: (meshes: {
    avatar: THREE.SkinnedMesh | null;
    armor: THREE.Mesh | null;
    helmet: THREE.Mesh | null;
    helmetGroup?: THREE.Group | null;
  }) => void;
}

const ModelDemo: React.FC<ModelDemoProps> = ({
  avatarUrl,
  armorUrl,
  helmetUrl,
  showWireframe,
  equipmentSlot,
  armorIsRigged,
  currentAnimation,
  isAnimationPlaying,
  vrmAnimation,
  vrmUrl,
  onModelsReady,
}) => {
  const avatarRef = useRef<THREE.Group>(null);
  const armorRef = useRef<THREE.Group>(null);
  const helmetRef = useRef<THREE.Group>(null);

  // VRM animation state
  const vrmRef = useRef<VRM | null>(null);
  const vrmMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const vrmActionRef = useRef<THREE.AnimationAction | null>(null);
  const rootToHipsRef = useRef<number>(1);
  const vrmLoadedUrlRef = useRef<string>("");
  // Triggers animation effect re-run after async VRM load completes
  const [vrmReady, setVrmReady] = useState(false);
  // Store the rigged armor SkinnedMesh when in animation mode
  const riggedArmorMeshRef = useRef<THREE.SkinnedMesh | null>(null);

  // Track loaded URLs to prevent unnecessary reloads
  const loadedUrlsRef = useRef({
    avatar: "",
    armor: "",
    armorVrmMode: false, // whether armor was loaded in VRM animation mode
    helmet: "",
  });

  // Cache the original (raw) armor material — Blender's GLTF roundtrip
  // degrades materials (color space, PBR params), so we reuse the original
  // material from the raw GLB when displaying the rigged version.
  const rawArmorMaterialRef = useRef<THREE.Material | THREE.Material[] | null>(
    null,
  );

  // Animation state
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const needsAnimationFile = currentAnimation !== "tpose";

  // Construct animation file path based on the model if animation is needed
  const animationPath = useMemo(() => {
    if (needsAnimationFile && avatarUrl) {
      // Handle API paths (/api/assets/{id}/model)
      const apiMatch = avatarUrl.match(
        new RegExp("^/api/assets/([^/]+)/model"),
      );
      if (apiMatch) {
        const assetId = apiMatch[1];
        const animFileName =
          currentAnimation === "walking"
            ? "animations/walking.glb"
            : "animations/running.glb";
        // Use the API endpoint to get animation files
        return `/api/assets/${assetId}/${animFileName}`;
      }

      // Handle direct gdd-assets paths (for local testing)
      const gddMatch = avatarUrl.match(new RegExp("gdd-assets/([^/]+)/"));
      if (gddMatch) {
        const characterName = gddMatch[1];
        const animFileName =
          currentAnimation === "walking"
            ? "animations/walking.glb"
            : "animations/running.glb";
        return `./gdd-assets/${characterName}/${animFileName}`;
      }
    }
    return null;
  }, [avatarUrl, currentAnimation, needsAnimationFile]);

  // Load animation file if available - with error handling
  const [animationGltf, setAnimationGltf] = useState<AnimatedGLTF | null>(null);

  useEffect(() => {
    if (!animationPath) {
      setAnimationGltf(null);
      return;
    }

    // Try to load the animation file directly (no HEAD request check)
    const loader = new GLTFLoader();

    console.log("Loading animation from:", animationPath);
    loader.load(
      animationPath,
      (gltf: GLTF) => {
        console.log("Animation loaded successfully:", animationPath);
        console.log("Animation count:", gltf.animations.length);
        setAnimationGltf(gltf as AnimatedGLTF);
      },
      (_progress: ProgressEvent) => {
        // Progress callback
      },
      () => {
        // File doesn't exist or failed to load - this is expected for many assets
        console.log(
          `Animation file not available: ${animationPath} - will use built-in animations if available`,
        );
        setAnimationGltf(null);
      },
    );
  }, [animationPath]);

  // Load models when URLs change
  useEffect(() => {
    let avatarMesh: THREE.SkinnedMesh | null = null;
    let armorMesh: THREE.Mesh | null = null;
    let helmetMesh: THREE.Mesh | null = null;

    const loadModels = async () => {
      const loader = new GLTFLoader();
      const isVrmMode = !!vrmAnimation;

      // Load avatar only if URL changed (always as GLB — VRM loaded hidden for animation)
      if (
        avatarUrl &&
        avatarRef.current &&
        avatarUrl !== loadedUrlsRef.current.avatar
      ) {
        try {
          const gltf = await loader.loadAsync(avatarUrl);
          avatarRef.current.clear();
          loadedUrlsRef.current.avatar = avatarUrl;

          avatarRef.current.add(gltf.scene);

          // Store gltf data on the scene for animation access
          gltf.scene.userData.gltf = gltf;

          // Find skinned mesh
          gltf.scene.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.SkinnedMesh && !avatarMesh) {
              avatarMesh = child;
              avatarMesh.userData.isAvatar = true;
            }
          });

          console.log("Avatar loaded with animations:", gltf.animations.length);
          if (gltf.animations.length > 0) {
            gltf.animations.forEach((clip: THREE.AnimationClip) => {
              console.log(
                `- Built-in animation: "${clip.name}" (${clip.duration}s)`,
              );
            });
          }

          // Normalize scale
          if (avatarMesh) {
            const bounds = new THREE.Box3().setFromObject(avatarMesh);
            const height = bounds.getSize(new THREE.Vector3()).y;
            const scale = 2 / height; // Normalize to 2 units tall
            avatarRef.current.scale.setScalar(scale);

            // Debug: log avatar hierarchy transforms
            console.log(
              `Avatar normalize: rawHeight=${height.toFixed(3)}, scale=${scale.toFixed(4)}`,
            );
            avatarRef.current.updateMatrixWorld(true);
            const worldBounds = new THREE.Box3().setFromObject(
              avatarRef.current,
            );
            const worldSize = worldBounds.getSize(new THREE.Vector3());
            console.log(
              `Avatar world bounds: min=(${worldBounds.min.x.toFixed(3)}, ${worldBounds.min.y.toFixed(3)}, ${worldBounds.min.z.toFixed(3)}) ` +
                `max=(${worldBounds.max.x.toFixed(3)}, ${worldBounds.max.y.toFixed(3)}, ${worldBounds.max.z.toFixed(3)}) ` +
                `size=(${worldSize.x.toFixed(3)}, ${worldSize.y.toFixed(3)}, ${worldSize.z.toFixed(3)})`,
            );
          }
        } catch (error) {
          console.error("Failed to load avatar:", error);
        }
      } else if (avatarUrl && avatarRef.current) {
        // URL exists but already loaded - find the mesh
        avatarRef.current.traverse((child) => {
          if (child instanceof THREE.SkinnedMesh && !avatarMesh) {
            avatarMesh = child;
          }
        });
        console.log("Avatar already loaded, reusing existing mesh");
      }

      // Clear armor if not in Spine2 mode or no URL
      if (!armorUrl || equipmentSlot !== "Spine2") {
        if (armorRef.current) {
          armorRef.current.clear();
          loadedUrlsRef.current.armor = "";
          armorRef.current.userData.transformCaptured = false;
        }
      }
      // Load armor only if URL changed OR VRM mode changed (need to reload
      // as SkinnedMesh for animation or plain Mesh for static display)
      else if (
        armorUrl &&
        equipmentSlot === "Spine2" &&
        armorRef.current &&
        (armorUrl !== loadedUrlsRef.current.armor ||
          isVrmMode !== loadedUrlsRef.current.armorVrmMode)
      ) {
        try {
          // Clear Three.js in-memory cache to ensure fresh load.
          // THREE.Cache (used by FileLoader inside GLTFLoader) is keyed by URL
          // and persists for the lifetime of the page — even HTTP no-cache
          // headers won't bypass it.
          THREE.Cache.remove(armorUrl);
          console.log(
            `[ArmorViewer] Loading armor: ${armorUrl} (rigged=${armorIsRigged}, vrmMode=${isVrmMode})`,
          );
          const gltf = await loader.loadAsync(armorUrl);
          armorRef.current.clear();
          armorRef.current.add(gltf.scene);
          loadedUrlsRef.current.armor = armorUrl;
          loadedUrlsRef.current.armorVrmMode = isVrmMode;

          // Find mesh
          gltf.scene.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh && !armorMesh) {
              armorMesh = child;
              armorMesh.userData.isArmor = true;
              armorMesh.userData.isEquipment = true;
              armorMesh.userData.equipmentSlot = "Spine2";
            }
          });

          // Scale armor to fit the avatar
          if (avatarRef.current && armorMesh) {
            // Cache raw armor material for later use with rigged geometry
            if (!armorIsRigged) {
              rawArmorMaterialRef.current = armorMesh.material;
            }

            if (armorIsRigged) {
              const fixMaterial = (mat: THREE.Material): THREE.Material => {
                const cloned = mat.clone();
                cloned.side = THREE.DoubleSide;
                cloned.polygonOffset = true;
                cloned.polygonOffsetFactor = -1;
                cloned.polygonOffsetUnits = -1;
                cloned.depthWrite = true;
                // Force vertex colors OFF — Meshy bakes AO into vertex colors,
                // and we strip the color attribute from geometry. Without this,
                // the shader reads missing/garbage data → red/colored spots.
                cloned.vertexColors = false;
                cloned.needsUpdate = true;
                return cloned;
              };

              gltf.scene.updateMatrixWorld(true);

              if (isVrmMode && avatarMesh) {
                // ANIMATION MODE: Keep SkinnedMesh and bind to GLB avatar skeleton
                // so the armor deforms when VRM bone transforms are copied over.
                let foundSkinnedMesh: THREE.SkinnedMesh | null = null;
                gltf.scene.traverse((child: THREE.Object3D) => {
                  if (child instanceof THREE.SkinnedMesh && !foundSkinnedMesh) {
                    foundSkinnedMesh = child;
                  }
                });

                if (foundSkinnedMesh) {
                  const riggedMesh = foundSkinnedMesh as THREE.SkinnedMesh;

                  // Fix material
                  if (Array.isArray(riggedMesh.material)) {
                    riggedMesh.material = riggedMesh.material.map(fixMaterial);
                  } else {
                    riggedMesh.material = fixMaterial(riggedMesh.material);
                  }

                  // Strip non-essential attributes (keep skinning attrs for animation)
                  const keepAttrs = new Set([
                    "position",
                    "normal",
                    "uv",
                    "uv2",
                    "tangent",
                    "skinIndex",
                    "skinWeight",
                  ]);
                  const strippedAttrs: string[] = [];
                  for (const name of Object.keys(
                    riggedMesh.geometry.attributes,
                  )) {
                    if (!keepAttrs.has(name)) {
                      riggedMesh.geometry.deleteAttribute(name);
                      strippedAttrs.push(name);
                    }
                  }
                  if (strippedAttrs.length > 0) {
                    console.log(
                      `[ArmorViewer] Stripped attributes from ${riggedMesh.name} (anim mode): ${strippedAttrs.join(", ")}`,
                    );
                  }

                  // Remap bone indices from rigged GLB skeleton → avatar skeleton
                  // (same logic as performEquipmentPreview)
                  const avatarSkeleton = avatarMesh.skeleton;
                  if (avatarSkeleton) {
                    const avatarBoneNames = avatarSkeleton.bones.map(
                      (b: THREE.Bone) => b.name,
                    );
                    const riggedBoneNames = riggedMesh.skeleton.bones.map(
                      (b: THREE.Bone) => b.name,
                    );

                    const indexMap = new Map<number, number>();
                    for (let i = 0; i < riggedBoneNames.length; i++) {
                      const avatarIdx = avatarBoneNames.indexOf(
                        riggedBoneNames[i],
                      );
                      if (avatarIdx !== -1) {
                        indexMap.set(i, avatarIdx);
                      }
                    }

                    const skinIndex =
                      riggedMesh.geometry.getAttribute("skinIndex");
                    if (skinIndex) {
                      for (let i = 0; i < skinIndex.count; i++) {
                        for (let j = 0; j < skinIndex.itemSize; j++) {
                          const oldIdx = skinIndex.getComponent(i, j);
                          const newIdx = indexMap.get(oldIdx);
                          if (newIdx !== undefined) {
                            skinIndex.setComponent(i, j, newIdx);
                          }
                        }
                      }
                      skinIndex.needsUpdate = true;
                    }

                    // Bind to avatar's skeleton.
                    // CRITICAL: pass bindMatrix to prevent calculateInverses().
                    // bind() without bindMatrix calls skeleton.calculateInverses()
                    // which DESTROYS the avatar skeleton's GLTF boneInverses
                    // (they get recalculated from scaled bone world positions),
                    // causing massive deformation of both avatar and armor.
                    riggedMesh.bind(avatarSkeleton, riggedMesh.bindMatrix);

                    console.log(
                      `[ArmorViewer] Bound rigged armor to avatar skeleton: ${indexMap.size}/${riggedBoneNames.length} bones mapped`,
                    );
                  }

                  riggedMesh.userData.isArmor = true;
                  riggedMesh.userData.isEquipment = true;
                  riggedMesh.userData.equipmentSlot = "Spine2";
                  riggedMesh.renderOrder = 1;
                  riggedArmorMeshRef.current = riggedMesh;
                  armorMesh = riggedMesh;

                  console.log(
                    `[ArmorViewer] Kept SkinnedMesh for animation: ${riggedMesh.name}, ` +
                      `verts=${riggedMesh.geometry.attributes.position.count}`,
                  );
                }
              } else {
                // STATIC MODE: Replace SkinnedMeshes with plain Meshes
                // Rigged GLB contains a SkinnedMesh with bone weights. The GPU
                // skinning shader distorts the mesh even in bind pose, causing
                // dark spots and artifacts.
                //
                // APPROACH: Keep the GLTF scene hierarchy intact and replace
                // SkinnedMeshes with plain Meshes in-place.
                riggedArmorMeshRef.current = null;

                const replacements: {
                  old: THREE.Object3D;
                  parent: THREE.Object3D;
                  geo: THREE.BufferGeometry;
                  mat: THREE.Material | THREE.Material[];
                  name: string;
                }[] = [];

                let finalMesh: THREE.Mesh | null = null;
                gltf.scene.traverse((child: THREE.Object3D) => {
                  if (
                    child instanceof THREE.SkinnedMesh ||
                    child instanceof THREE.Mesh
                  ) {
                    if (!child.parent) return;
                    const geo = child.geometry.clone();

                    // Strip non-essential attributes. Keep position, normal, uv,
                    // and TANGENT. Tangent is critical — the normal map needs it
                    // for correct tangent-space lighting. Without tangent, Three.js
                    // falls back to screen-space derivatives (dFdx/dFdy) which
                    // produce garbage values at UV seams → red/colored spots on
                    // shoulders and sides.
                    const keepAttrs = new Set([
                      "position",
                      "normal",
                      "uv",
                      "uv2",
                      "tangent",
                    ]);
                    const strippedAttrs: string[] = [];
                    for (const name of Object.keys(geo.attributes)) {
                      if (!keepAttrs.has(name)) {
                        geo.deleteAttribute(name);
                        strippedAttrs.push(name);
                      }
                    }
                    if (strippedAttrs.length > 0) {
                      console.log(
                        `[ArmorViewer] Stripped attributes from ${child.name}: ${strippedAttrs.join(", ")}`,
                      );
                    }

                    replacements.push({
                      old: child,
                      parent: child.parent,
                      geo,
                      mat: child.material,
                      name: child.name,
                    });
                  }
                });

                // Replace SkinnedMeshes with plain Meshes in the hierarchy
                for (const rep of replacements) {
                  const plainMesh = new THREE.Mesh(rep.geo);
                  plainMesh.name = rep.name;

                  // Copy local transform so the mesh occupies the same
                  // position within the hierarchy
                  plainMesh.position.copy(rep.old.position);
                  plainMesh.quaternion.copy(rep.old.quaternion);
                  plainMesh.scale.copy(rep.old.scale);

                  plainMesh.userData = {
                    ...rep.old.userData,
                    isArmor: true,
                    isEquipment: true,
                    equipmentSlot: "Spine2",
                  };
                  plainMesh.renderOrder = 1;

                  // Use the material from the processed GLB (not the raw
                  // original). Blender's GLTF roundtrip can subtly change
                  // UV layout — using the raw material on processed geometry
                  // causes texture mismatch (dark spots).
                  if (Array.isArray(rep.mat)) {
                    plainMesh.material = rep.mat.map(fixMaterial);
                  } else {
                    plainMesh.material = fixMaterial(rep.mat);
                  }

                  rep.parent.add(plainMesh);
                  rep.parent.remove(rep.old);

                  if (!finalMesh) {
                    finalMesh = plainMesh;

                    console.log(
                      `[ArmorViewer] Converted SkinnedMesh→Mesh (in-hierarchy): ${rep.name}, ` +
                        `verts=${rep.geo.attributes.position.count}, ` +
                        `tris=${rep.geo.index ? rep.geo.index.count / 3 : "non-indexed"}, ` +
                        `material=processed (Blender), skinAttrs stripped, normals=exported`,
                    );
                  }
                }
              }

              // In static mode, find the final plain Mesh that was created
              if (!isVrmMode && !armorMesh) {
                armorRef.current?.traverse((child) => {
                  if (
                    child instanceof THREE.Mesh &&
                    !armorMesh &&
                    child.userData.isArmor
                  ) {
                    armorMesh = child;
                  }
                });
              }

              if (armorMesh) {
                // Scale to match avatar normalization
                const avatarScale = avatarRef.current.scale.x;
                armorRef.current.scale.setScalar(avatarScale);
                armorRef.current.updateMatrixWorld(true);

                // Diagnostic: compare armor and body bounds
                const armorBounds = new THREE.Box3().setFromObject(
                  armorRef.current,
                );
                const armorCenter = armorBounds.getCenter(new THREE.Vector3());
                const armorSize = armorBounds.getSize(new THREE.Vector3());
                const bodyBounds = new THREE.Box3().setFromObject(
                  avatarRef.current,
                );
                const bodyCenter = bodyBounds.getCenter(new THREE.Vector3());
                const bodySize = bodyBounds.getSize(new THREE.Vector3());
                const offset = armorCenter.clone().sub(bodyCenter);
                console.log(
                  `[ArmorViewer] Rigged armor bounds: center=(${armorCenter.x.toFixed(3)}, ${armorCenter.y.toFixed(3)}, ${armorCenter.z.toFixed(3)}) ` +
                    `size=(${armorSize.x.toFixed(3)}, ${armorSize.y.toFixed(3)}, ${armorSize.z.toFixed(3)})`,
                );
                console.log(
                  `[ArmorViewer] Avatar body bounds:  center=(${bodyCenter.x.toFixed(3)}, ${bodyCenter.y.toFixed(3)}, ${bodyCenter.z.toFixed(3)}) ` +
                    `size=(${bodySize.x.toFixed(3)}, ${bodySize.y.toFixed(3)}, ${bodySize.z.toFixed(3)})`,
                );
                console.log(
                  `[ArmorViewer] Armor-body offset: (${offset.x.toFixed(4)}, ${offset.y.toFixed(4)}, ${offset.z.toFixed(4)}) ` +
                    `magnitude=${offset.length().toFixed(4)}`,
                );

                // Set body mesh render order
                avatarRef.current.traverse((child: THREE.Object3D) => {
                  if (
                    child instanceof THREE.SkinnedMesh ||
                    child instanceof THREE.Mesh
                  ) {
                    child.renderOrder = 0;
                  }
                });
              }
            } else {
              // Raw (unrigged) armor — scale to ~40% of avatar height
              const avatarWorldBounds = new THREE.Box3().setFromObject(
                avatarRef.current,
              );
              const avatarWorldHeight = avatarWorldBounds.getSize(
                new THREE.Vector3(),
              ).y;

              const rawArmorBounds = new THREE.Box3().setFromObject(armorMesh);
              const rawArmorHeight = rawArmorBounds.getSize(
                new THREE.Vector3(),
              ).y;

              if (rawArmorHeight > 0) {
                const armorGroupScale =
                  (avatarWorldHeight * 0.4) / rawArmorHeight;
                armorRef.current.scale.setScalar(armorGroupScale);
                armorRef.current.updateMatrixWorld(true);
                console.log(
                  `Armor group scale: ${armorGroupScale.toFixed(4)} ` +
                    `(avatarH=${avatarWorldHeight.toFixed(3)}, armorRawH=${rawArmorHeight.toFixed(3)})`,
                );
              } else {
                armorRef.current.scale.setScalar(1);
                armorRef.current.updateMatrixWorld(true);
              }
            }
          }
        } catch (error) {
          console.error("Failed to load armor:", error);
        }
      } else if (armorUrl && equipmentSlot === "Spine2" && armorRef.current) {
        // URL exists but already loaded - find the mesh
        armorRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && !armorMesh) {
            armorMesh = child;
          }
        });
      }

      // Clear helmet if not in Head mode or no URL
      if (!helmetUrl || equipmentSlot !== "Head") {
        if (helmetRef.current) {
          // Clear transform captured flag before clearing
          helmetRef.current.traverse((child) => {
            if (
              child instanceof THREE.Mesh &&
              child.userData.transformCaptured
            ) {
              child.userData.transformCaptured = false;
              child.userData.originalTransform = null;
              child.userData.originalParent = null;
            }
          });
          helmetRef.current.clear();
          loadedUrlsRef.current.helmet = "";
        }
      }
      // Load helmet only if URL changed
      else if (
        helmetUrl &&
        equipmentSlot === "Head" &&
        helmetRef.current &&
        helmetUrl !== loadedUrlsRef.current.helmet
      ) {
        try {
          const gltf = await loader.loadAsync(helmetUrl);

          // Only clear and reload if the helmet isn't fitted
          const existingHelmet = helmetRef.current.children[0]
            ?.children[0] as THREE.Mesh;
          if (!existingHelmet?.userData.hasBeenFitted) {
            helmetRef.current.clear();
            helmetRef.current.add(gltf.scene);
            loadedUrlsRef.current.helmet = helmetUrl;
          }

          // Find mesh and store the gltf scene reference
          const gltfScene = gltf.scene;
          gltfScene.userData.isGltfRoot = true; // Mark this as the GLTF root

          gltf.scene.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh && !helmetMesh) {
              helmetMesh = child;
              helmetMesh.userData.isHelmet = true;
              helmetMesh.userData.isEquipment = true;
              helmetMesh.userData.equipmentSlot = "Head";
              helmetMesh.userData.gltfRoot = gltfScene; // Store reference to GLTF root
              console.log("Found helmet mesh:", helmetMesh.name || "unnamed");
              console.log(
                "Helmet parent after loading:",
                helmetMesh.parent?.name || "unknown",
              );
            }
          });

          // Log the structure
          console.log("Helmet structure after loading:");
          console.log("- helmetRef.current:", helmetRef.current);
          console.log("- gltf.scene:", gltf.scene);
          console.log("- helmetMesh found:", !!helmetMesh);

          // Don't scale helmet - let fitting algorithm handle it
          // This matches MeshFittingDebugger behavior

          // Store original helmet transform immediately when loaded
          // Match MeshFittingDebugger's approach exactly
          if (helmetMesh && !helmetMesh.userData.transformCaptured) {
            // Make sure the helmet's world matrix is updated
            helmetMesh.updateMatrixWorld(true);

            const originalTransform = {
              position: helmetMesh.position.clone(),
              rotation: helmetMesh.rotation.clone(),
              scale: helmetMesh.scale.clone(),
            };

            // Store the original parent for proper reset
            helmetMesh.userData.originalParent = helmetMesh.parent;
            helmetMesh.userData.originalTransform = originalTransform;
            helmetMesh.userData.transformCaptured = true;

            console.log(
              "Captured original helmet transform:",
              originalTransform,
            );
            console.log(
              "Original helmet parent:",
              helmetMesh.parent?.name || "scene",
            );
            console.log(
              "Is position at origin?",
              helmetMesh.position.length() < 0.001,
            );
          }
        } catch (error) {
          console.error("Failed to load helmet:", error);
        }
      } else if (helmetUrl && equipmentSlot === "Head" && helmetRef.current) {
        // URL exists but already loaded - find the mesh
        helmetRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && !helmetMesh) {
            helmetMesh = child;
          }
        });
      }

      // Notify parent only if we have meshes
      if (avatarMesh || armorMesh || helmetMesh) {
        onModelsReady({
          avatar: avatarMesh,
          armor: armorMesh,
          helmet: helmetMesh,
          helmetGroup: helmetRef.current,
        });
      }
    };

    loadModels();
  }, [
    avatarUrl,
    armorUrl,
    helmetUrl,
    equipmentSlot,
    vrmAnimation,
    onModelsReady,
  ]);

  // Apply wireframe
  useEffect(() => {
    if (armorRef.current) {
      armorRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material.wireframe = showWireframe;
        }
      });
    }
    if (helmetRef.current) {
      helmetRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material.wireframe = showWireframe;
        }
      });
    }
  }, [showWireframe]);

  // Handle animation playback
  useEffect(() => {
    if (!avatarRef.current) return;

    console.log("Animation useEffect triggered:", {
      currentAnimation,
      isAnimationPlaying,
    });

    // Find the avatar mesh
    let avatarMesh: THREE.SkinnedMesh | null = null;
    avatarRef.current.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh && !avatarMesh) {
        avatarMesh = child;
      }
    });

    if (!avatarMesh) {
      console.log("No avatar mesh found");
      return;
    }

    // Create or recreate mixer for the avatar group (not just the mesh)
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current = null;
    }

    mixerRef.current = new THREE.AnimationMixer(avatarRef.current);
    const mixer = mixerRef.current;

    if (isAnimationPlaying && currentAnimation !== "tpose") {
      // Get animations from loaded GLB
      let animations: THREE.AnimationClip[] = [];

      // Check if animation file has animations
      if (animationGltf?.animations && animationGltf.animations.length > 0) {
        animations = animationGltf.animations;
        console.log(
          `Using animations from ${currentAnimation} file:`,
          animations.length,
        );
      } else {
        console.log("No animations found in animation file");
        // Try to get from base model as fallback
        avatarRef.current.traverse((child) => {
          if (
            child.userData?.gltf?.animations &&
            child.userData.gltf.animations.length > 0
          ) {
            animations = child.userData.gltf.animations;
            console.log(
              "Found animations in child userData:",
              animations.length,
            );
          }
        });

        // Also check the group itself
        const avatarGltf = avatarRef.current.children[0]?.userData?.gltf as
          | AnimatedGLTF
          | undefined;
        if (!animations.length && avatarGltf?.animations) {
          animations = avatarGltf.animations;
          console.log("Using animations from base model:", animations.length);
        }
      }

      if (animations.length > 0) {
        // Log available animations
        animations.forEach((clip) => {
          console.log(
            `Available animation: "${clip.name}" (duration: ${clip.duration}s)`,
          );
        });

        // Find the appropriate animation clip
        let targetClip: THREE.AnimationClip | null = null;

        if (currentAnimation === "walking") {
          targetClip =
            animations.find((clip) => {
              const name = clip.name.toLowerCase();
              return (
                (name.includes("walk") || name.includes("walking")) &&
                !name.includes("run") &&
                !name.includes("running")
              );
            }) || animations[0];
        } else if (currentAnimation === "running") {
          targetClip =
            animations.find((clip) => {
              const name = clip.name.toLowerCase();
              return (
                (name.includes("run") || name.includes("running")) &&
                !name.includes("walk") &&
                !name.includes("walking")
              );
            }) || animations[0];
        }

        if (targetClip) {
          console.log(`Playing animation: "${targetClip.name}"`);
          const action = mixer.clipAction(targetClip, avatarRef.current);
          action.reset();
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
        } else {
          console.log("No suitable animation clip found");
        }
      } else {
        console.log("No animations available for this avatar");
        // Note: Some avatars may not have built-in animations
        // Animation files should be placed in animations/ subdirectory (e.g., animations/walking.glb, animations/running.glb)
      }
    }

    return () => {
      if (mixer) {
        mixer.stopAllAction();
      }
    };
  }, [currentAnimation, isAnimationPlaying, animationGltf, avatarUrl]);

  // Hidden VRM loading — load VRM (not displayed) for animation baking.
  // The VRM provides the humanoid bone mapping and normalized bone system
  // needed to retarget Mixamo animations. After baking, the VRM is only
  // kept alive for re-baking when the user switches animations.
  useEffect(() => {
    if (!vrmAnimation || !vrmUrl) {
      // Clean up hidden VRM and any playing baked animation
      vrmRef.current = null;
      vrmLoadedUrlRef.current = "";
      setVrmReady(false);

      // Stop baked animation mixer
      if (vrmActionRef.current) {
        vrmActionRef.current.fadeOut(0.2);
        vrmActionRef.current = null;
      }
      if (vrmMixerRef.current) {
        vrmMixerRef.current.stopAllAction();
        vrmMixerRef.current = null;
      }

      // Reset GLB skeleton to bind pose when stopping animation
      avatarRef.current?.traverse((child) => {
        if (child instanceof THREE.SkinnedMesh) {
          child.skeleton.pose();
        }
      });
      return;
    }

    // Don't reload if same VRM URL is already loaded
    if (vrmLoadedUrlRef.current === vrmUrl && vrmRef.current) {
      return;
    }

    let cancelled = false;
    const loadHiddenVrm = async () => {
      try {
        console.log("[ArmorViewer] Loading hidden VRM for baking:", vrmUrl);
        const vrmLoader = new GLTFLoader();
        vrmLoader.register((parser) => new VRMLoaderPlugin(parser));

        const gltf = await vrmLoader.loadAsync(vrmUrl);
        if (cancelled) return;

        const vrm = gltf.userData.vrm as VRM;
        if (!vrm) {
          console.error("[ArmorViewer] No VRM data found in file");
          return;
        }

        // Detect VRM version and rotate if needed
        const meta = vrm.meta as unknown as Record<string, unknown>;
        const vrmVersion =
          (meta?.metaVersion as string) ||
          ((meta?.specVersion as string)?.startsWith("0.") ? "0" : "1");
        if (vrmVersion === "0") {
          VRMUtils.rotateVRM0(vrm);
        }

        // Calculate rootToHips (once, stored for retargeting)
        const humanoid = vrm.humanoid;
        const normalizedRestPose = (
          humanoid as unknown as Record<string, unknown>
        )?.normalizedRestPose as
          | Record<string, { position: number[] }>
          | undefined;
        if (normalizedRestPose?.hips) {
          rootToHipsRef.current = normalizedRestPose.hips.position[1];
        } else {
          const hipsNode = humanoid?.getRawBoneNode("hips");
          if (hipsNode) {
            const v = new THREE.Vector3();
            hipsNode.getWorldPosition(v);
            rootToHipsRef.current = v.y;
          }
        }
        console.log(
          "[ArmorViewer] Hidden VRM rootToHips:",
          rootToHipsRef.current,
        );

        // Store VRM (no mixer needed here — baking creates its own temp mixer)
        vrmRef.current = vrm;
        vrmLoadedUrlRef.current = vrmUrl;
        setVrmReady(true);
        console.log("[ArmorViewer] Hidden VRM loaded, ready for baking");
      } catch (err) {
        console.error("[ArmorViewer] Failed to load hidden VRM:", err);
      }
    };

    loadHiddenVrm();
    return () => {
      cancelled = true;
    };
  }, [vrmUrl, vrmAnimation]);

  // Load emote, bake animation for GLB, and play on GLB mixer.
  // Baking samples the VRM pipeline (retarget → normalized bones → raw bones)
  // and creates a new clip that directly drives GLB bone names.
  useEffect(() => {
    if (!vrmAnimation || !vrmRef.current) {
      // Stop any playing baked animation
      if (vrmActionRef.current) {
        vrmActionRef.current.fadeOut(0.2);
        vrmActionRef.current = null;
      }
      if (vrmMixerRef.current) {
        vrmMixerRef.current.stopAllAction();
        vrmMixerRef.current = null;
      }
      return;
    }

    if (!avatarRef.current) return;

    const vrm = vrmRef.current;
    const glbRoot = avatarRef.current;

    let cancelled = false;

    const loadAndBakeEmote = async () => {
      try {
        const animUrl = `/emotes/emote-${vrmAnimation}.glb`;
        console.log(`[ArmorViewer] Loading emote for baking: ${animUrl}`);

        const animLoader = new GLTFLoader();
        const gltf = await animLoader.loadAsync(animUrl);

        if (cancelled) return;

        if (!gltf.animations || gltf.animations.length === 0) {
          console.error("[ArmorViewer] No animations found in emote GLB");
          return;
        }

        // Step 1: Retarget Mixamo → VRM normalized bone clip
        const retargetedClip = retargetAnimation(
          gltf,
          vrm,
          rootToHipsRef.current,
        );
        if (!retargetedClip) {
          console.error("[ArmorViewer] Animation retargeting failed");
          return;
        }

        // Step 2: Bake — sample VRM pipeline to produce GLB-compatible clip
        const bakedClip = bakeAnimationForGLB(vrm, retargetedClip, glbRoot);
        if (!bakedClip) {
          console.error("[ArmorViewer] Animation baking failed");
          return;
        }

        if (cancelled) return;

        // Step 3: Play baked clip on GLB avatar's mixer
        if (vrmActionRef.current) {
          vrmActionRef.current.fadeOut(0.2);
        }
        if (vrmMixerRef.current) {
          vrmMixerRef.current.stopAllAction();
        }

        const glbMixer = new THREE.AnimationMixer(glbRoot);
        const action = glbMixer.clipAction(bakedClip);
        action.reset().fadeIn(0.2).setLoop(THREE.LoopRepeat, Infinity).play();

        vrmMixerRef.current = glbMixer;
        vrmActionRef.current = action;

        console.log(
          `[ArmorViewer] Playing baked animation: ${vrmAnimation} (${bakedClip.duration}s, ${bakedClip.tracks.length} tracks)`,
        );
      } catch (err) {
        console.error("[ArmorViewer] Failed to load/bake emote:", err);
      }
    };

    loadAndBakeEmote();

    return () => {
      cancelled = true;
      if (vrmActionRef.current) {
        vrmActionRef.current.fadeOut(0.2);
        vrmActionRef.current = null;
      }
      if (vrmMixerRef.current) {
        vrmMixerRef.current.stopAllAction();
        vrmMixerRef.current = null;
      }
    };
  }, [vrmAnimation, vrmReady]);

  // Animation update loop
  useFrame((_state, delta) => {
    // Standard animation mixer (non-VRM mode)
    if (
      mixerRef.current &&
      isAnimationPlaying &&
      currentAnimation !== "tpose"
    ) {
      mixerRef.current.update(delta);
    }

    // VRM baked animation: just advance the GLB mixer
    // The baked clip directly drives GLB bone transforms — no per-frame
    // bone copying needed. Armor shares the same skeleton, so it deforms too.
    if (vrmAnimation && vrmMixerRef.current) {
      vrmMixerRef.current.update(delta);
    }
  });

  return (
    <>
      <group ref={avatarRef} />
      <group ref={armorRef} />
      <group ref={helmetRef} />
    </>
  );
};

// Scene component similar to debugger
interface SceneProps {
  avatarUrl?: string;
  armorUrl?: string;
  helmetUrl?: string;
  showWireframe: boolean;
  equipmentSlot: "Head" | "Spine2" | "Pelvis";
  armorIsRigged?: boolean;
  currentAnimation: "tpose" | "walking" | "running";
  isAnimationPlaying: boolean;
  vrmAnimation?: string | null;
  vrmUrl?: string;
  visualizationGroup?: THREE.Group;
  onModelsLoaded: (meshes: {
    avatar: THREE.SkinnedMesh | null;
    armor: THREE.Mesh | null;
    helmet: THREE.Mesh | null;
    scene: THREE.Scene;
    helmetGroup?: THREE.Group | null;
  }) => void;
}

const Scene: React.FC<SceneProps> = ({
  avatarUrl,
  armorUrl,
  helmetUrl,
  showWireframe,
  equipmentSlot,
  armorIsRigged,
  currentAnimation,
  isAnimationPlaying,
  vrmAnimation,
  vrmUrl,
  visualizationGroup,
  onModelsLoaded,
}) => {
  const sceneRef = useRef<THREE.Scene>(null!);

  useEffect(() => {
    if (sceneRef.current) {
      console.log("Scene initialized");
    }
  }, []);

  const handleModelsReady = (meshes: {
    avatar: THREE.SkinnedMesh | null;
    armor: THREE.Mesh | null;
    helmet: THREE.Mesh | null;
    helmetGroup?: THREE.Group | null;
  }) => {
    console.log("Models ready in scene:", {
      avatar: !!meshes.avatar,
      armor: !!meshes.armor,
      helmet: !!meshes.helmet,
    });

    onModelsLoaded({
      ...meshes,
      scene: sceneRef.current,
    });
  };

  return (
    <scene ref={sceneRef}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <OrbitControls />

      <ModelDemo
        avatarUrl={avatarUrl}
        armorUrl={armorUrl}
        helmetUrl={helmetUrl}
        showWireframe={showWireframe}
        equipmentSlot={equipmentSlot}
        armorIsRigged={armorIsRigged}
        currentAnimation={currentAnimation}
        isAnimationPlaying={isAnimationPlaying}
        vrmAnimation={vrmAnimation}
        vrmUrl={vrmUrl}
        onModelsReady={handleModelsReady}
      />

      <gridHelper args={[10, 10]} />

      {/* Add visualization group if provided */}
      {visualizationGroup && <primitive object={visualizationGroup} />}
    </scene>
  );
};

// Main viewer component
export interface ArmorFittingViewerRef {
  // Mesh access
  getMeshes: () => {
    avatar: THREE.SkinnedMesh | null;
    armor: THREE.Mesh | null;
    helmet: THREE.Mesh | null;
    scene: THREE.Scene | null;
  };

  // Fitting operations
  performFitting: (params: ArmorFittingParams) => Promise<void>;
  performSmartFitting: (
    params: Partial<SmartFittingParameters>,
  ) => Promise<void>;
  performWasmFitting: (params: Partial<WasmFittingParameters>) => Promise<void>;
  performHelmetFitting: (params: HelmetFittingParams) => Promise<void>;
  attachHelmetToHead: () => void;
  detachHelmetFromHead: () => void;
  transferWeights: () => void;

  // Export
  exportFittedModel: () => Promise<ArrayBuffer>;

  // Transform operations
  resetTransform: () => void;

  // Equipment processing preview
  performEquipmentPreview: (riggedGlbUrl: string) => Promise<void>;

  // Clear specific meshes
  clearHelmet: () => void;
  clearArmor: () => void;
}

interface ArmorFittingViewerProps {
  avatarUrl?: string;
  armorUrl?: string;
  helmetUrl?: string;
  showWireframe: boolean;
  equipmentSlot: "Head" | "Spine2" | "Pelvis";
  armorIsRigged?: boolean;
  selectedAvatar?: { name: string } | null;
  onModelsLoaded?: () => void;
  currentAnimation?: "tpose" | "walking" | "running";
  isAnimationPlaying?: boolean;
  vrmAnimation?: string | null;
  vrmUrl?: string;
  visualizationMode?: "none" | "regions" | "collisions" | "weights";
  selectedBone?: number;
  onBodyRegionsDetected?: (regions: Map<string, any>) => void;
  onCollisionsDetected?: (collisions: any[]) => void;
}

export const ArmorFittingViewer = forwardRef<
  ArmorFittingViewerRef,
  ArmorFittingViewerProps
>((props, ref) => {
  const {
    avatarUrl,
    armorUrl,
    helmetUrl,
    showWireframe,
    equipmentSlot,
    armorIsRigged,
  } = props;

  // Mesh references
  const avatarMeshRef = useRef<THREE.SkinnedMesh | null>(null);
  const armorMeshRef = useRef<THREE.Mesh | null>(null);
  const helmetMeshRef = useRef<THREE.Mesh | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  // Services
  const genericFittingService = useRef(new MeshFittingService());
  const singlePassFittingService = useRef(new SinglePassFittingService());
  const wasmFittingService = useRef(new WasmFittingService());
  const armorFittingService = useRef(new ArmorFittingService());
  // const weightTransferService = useRef(new WeightTransferService())

  // Original geometry storage
  const originalArmorGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const originalHelmetTransformRef = useRef<{
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
  } | null>(null);

  const helmetGroupRef = useRef<THREE.Group | null>(null);

  // Export helper
  const { exportFittedModel: exportFittedModelHook } = useArmorExport({
    sceneRef,
    equipmentSlot,
    helmetMeshRef,
    armorMeshRef,
  });

  // Visualization state
  const visualizationGroupRef = useRef<THREE.Group>(
    (() => {
      const group = new THREE.Group();
      group.name = "visualization";
      return group;
    })(),
  );
  const [bodyRegions, setBodyRegions] = useState<Map<
    string,
    BodyRegion
  > | null>(null);
  const [collisions, setCollisions] = useState<CollisionPoint[] | null>(null);
  const visualizationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastComputedAvatar = useRef<string | null>(null);
  const lastComputedArmor = useRef<string | null>(null);

  // Detach helmet function that can be used by both reset and imperative handle
  const detachHelmetFromHeadInternal = () => {
    if (!helmetMeshRef.current) {
      console.error("No helmet to detach");
      return;
    }

    const scene = sceneRef.current;
    if (!scene) return;

    // Make sure helmet is visible
    helmetMeshRef.current.visible = true;
    helmetMeshRef.current.traverse((child) => {
      child.visible = true;
    });

    // Remove from parent and add back to scene
    if (helmetMeshRef.current.parent) {
      // Use attach() which preserves world transform
      scene.attach(helmetMeshRef.current);

      helmetMeshRef.current.userData.isAttached = false;
      console.log("Helmet detached from head");
    }
  };

  const handleModelsLoaded = (meshes: {
    avatar: THREE.SkinnedMesh | null;
    armor: THREE.Mesh | null;
    helmet: THREE.Mesh | null;
    scene: THREE.Scene;
    helmetGroup?: THREE.Group | null;
  }) => {
    console.log("=== MODELS LOADED IN VIEWER ===");
    avatarMeshRef.current = meshes.avatar;
    armorMeshRef.current = meshes.armor;
    helmetMeshRef.current = meshes.helmet;
    sceneRef.current = meshes.scene;
    helmetGroupRef.current = meshes.helmetGroup || null;

    // Log mesh details
    if (meshes.helmet) {
      console.log("Helmet mesh details:");
      console.log("- Type:", meshes.helmet.type);
      console.log(
        "- Geometry vertices:",
        meshes.helmet.geometry?.attributes.position?.count,
      );
      console.log("- Parent:", meshes.helmet.parent?.name || "unknown");

      // Check if this is actually the mesh or a group
      if (meshes.helmet.type !== "Mesh") {
        console.warn(
          "WARNING: Helmet reference is not a Mesh, it's a",
          meshes.helmet.type,
        );
      }
    }

    // Log avatar details
    if (meshes.avatar) {
      console.log("Avatar mesh details:");
      console.log("- Type:", meshes.avatar.type);
      console.log("- Has skeleton:", !!meshes.avatar.skeleton);
      console.log("- Parent:", meshes.avatar.parent?.name || "unknown");

      // Get avatar bounds
      const avatarBounds = new THREE.Box3().setFromObject(meshes.avatar);
      const avatarSize = avatarBounds.getSize(new THREE.Vector3());
      console.log("Avatar bounds:", avatarBounds);
      console.log("Avatar size:", avatarSize);
      console.log("Avatar scale:", meshes.avatar.scale);

      // Check parent scale
      if (meshes.avatar.parent) {
        console.log("Avatar parent scale:", meshes.avatar.parent.scale);
      }
    }

    // Store original geometry
    if (meshes.armor) {
      originalArmorGeometryRef.current = meshes.armor.geometry.clone();
    }

    // Auto-position armor at the torso so it appears in the right place immediately.
    // Skip for rigged armor — its built-in skeleton already positions vertices
    // correctly. Calling autoPositionArmorOnTorso on rigged armor would
    // double-transform it (skeleton + auto-position), pushing it inside the torso.
    if (
      meshes.avatar &&
      meshes.armor &&
      meshes.avatar.skeleton &&
      !armorIsRigged
    ) {
      autoPositionArmorOnTorso(meshes.avatar, meshes.armor);
    }

    // Use the original transform that was captured when helmet was loaded
    if (meshes.helmet) {
      if (meshes.helmet.userData.originalTransform) {
        originalHelmetTransformRef.current =
          meshes.helmet.userData.originalTransform;
        console.log(
          "Using original helmet transform from mesh userData:",
          originalHelmetTransformRef.current,
        );
      } else {
        // Capture it now if not already captured
        originalHelmetTransformRef.current = {
          position: meshes.helmet.position.clone(),
          rotation: meshes.helmet.rotation.clone(),
          scale: meshes.helmet.scale.clone(),
        };
        meshes.helmet.userData.originalTransform =
          originalHelmetTransformRef.current;
        meshes.helmet.userData.originalParent = meshes.helmet.parent;
        console.log(
          "Captured original helmet transform in handleModelsLoaded:",
          originalHelmetTransformRef.current,
        );
      }

      // Get helmet bounds for debugging
      const helmetBounds = new THREE.Box3().setFromObject(meshes.helmet);
      const helmetSize = helmetBounds.getSize(new THREE.Vector3());
      console.log("Helmet initial bounds:", helmetBounds);
      console.log("Helmet size:", helmetSize);

      // Also check parent scale
      if (meshes.helmet.parent) {
        console.log("Helmet parent scale:", meshes.helmet.parent.scale);
      }
    }

    // Add visualization group to scene
    if (meshes.scene && visualizationGroupRef.current) {
      meshes.scene.add(visualizationGroupRef.current);
      console.log("Added visualization group to scene");
      // Store globally for Scene component access
      window.__visualizationGroup = visualizationGroupRef.current;
    }

    // Compute body regions if avatar changed
    if (
      meshes.avatar &&
      meshes.avatar.skeleton &&
      props.avatarUrl !== lastComputedAvatar.current
    ) {
      console.log("Computing body regions for new avatar...");
      const detectedRegions = armorFittingService.current.computeBodyRegions(
        meshes.avatar,
        meshes.avatar.skeleton,
      );
      setBodyRegions(detectedRegions);
      props.onBodyRegionsDetected?.(detectedRegions);
      lastComputedAvatar.current = props.avatarUrl || null;
    }

    // Collision detection deferred — computed after fitting or when visualization mode is "collisions"
    lastComputedArmor.current = props.armorUrl || null;

    props.onModelsLoaded?.();
  };

  // Visualization functions
  const clearVisualization = () => {
    visualizationGroupRef.current.clear();
  };

  const restoreOriginalMaterials = () => {
    if (
      avatarMeshRef.current &&
      avatarMeshRef.current.userData.originalMaterial
    ) {
      // Also remove any vertex colors that were added
      if (avatarMeshRef.current.geometry.attributes.color) {
        avatarMeshRef.current.geometry.deleteAttribute("color");
      }
      avatarMeshRef.current.material =
        avatarMeshRef.current.userData.originalMaterial;
      delete avatarMeshRef.current.userData.originalMaterial;
    }
  };

  const visualizeBodyRegions = () => {
    if (!bodyRegions || bodyRegions.size === 0) {
      console.log("No body regions to visualize");
      return;
    }

    clearVisualization();

    const colors = {
      head: 0xff0000,
      torso: 0x00ff00,
      arms: 0x0000ff,
      legs: 0xffff00,
      hips: 0xff00ff,
    };

    bodyRegions.forEach((region, name) => {
      const color = colors[name as keyof typeof colors] || 0xffffff;

      // Create bounding box helper
      const helper = new THREE.Box3Helper(
        region.boundingBox,
        new THREE.Color(color),
      );
      visualizationGroupRef.current.add(helper);
    });

    console.log(
      "Visualization group children:",
      visualizationGroupRef.current.children.length,
    );
  };

  const visualizeCollisions = () => {
    if (!collisions || collisions.length === 0) {
      console.log("No collisions to visualize");
      return;
    }

    clearVisualization();

    const sphereGeometry = new THREE.SphereGeometry(0.01, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    collisions.forEach((collision) => {
      const sphere = new THREE.Mesh(sphereGeometry, material);
      sphere.position.copy(collision.position);
      visualizationGroupRef.current.add(sphere);

      // Add line showing push direction
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        collision.position,
        collision.position
          .clone()
          .add(
            collision.normal.clone().multiplyScalar(collision.penetrationDepth),
          ),
      ]);
      const line = new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({ color: 0xff0000 }),
      );
      visualizationGroupRef.current.add(line);
    });
  };

  const visualizeWeights = () => {
    if (!avatarMeshRef.current) return;

    // Check if the mesh is actually skinned
    if (!(avatarMeshRef.current instanceof THREE.SkinnedMesh)) {
      console.warn(
        "Avatar mesh is not a SkinnedMesh, cannot visualize weights",
      );
      return;
    }

    // Clear any pending visualization
    if (visualizationTimeoutRef.current) {
      clearTimeout(visualizationTimeoutRef.current);
      visualizationTimeoutRef.current = null;
    }

    // Always restore original material first to avoid conflicts
    restoreOriginalMaterials();

    // Small delay to ensure cleanup is complete
    visualizationTimeoutRef.current = setTimeout(() => {
      if (!avatarMeshRef.current) return;

      // Store original material if not already stored
      if (!avatarMeshRef.current.userData.originalMaterial) {
        avatarMeshRef.current.userData.originalMaterial =
          avatarMeshRef.current.material;
      }

      // Create a simple color-based visualization without custom shaders
      const geometry = avatarMeshRef.current.geometry;
      if (!geometry.attributes.skinIndex || !geometry.attributes.skinWeight) {
        console.warn("Mesh does not have skinning attributes");
        return;
      }

      // Create vertex colors based on bone weights
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      const skinIndices = geometry.attributes.skinIndex;
      const skinWeights = geometry.attributes.skinWeight;
      const selectedBone = props.selectedBone || 0;

      for (let i = 0; i < geometry.attributes.position.count; i++) {
        let weight = 0;

        // Check if this vertex is influenced by the selected bone
        for (let j = 0; j < 4; j++) {
          const idx = skinIndices.getComponent(i, j);
          if (Math.abs(idx - selectedBone) < 0.5) {
            weight = skinWeights.getComponent(i, j);
            break;
          }
        }

        // Convert weight to color (heatmap)
        let r = 0,
          g = 0,
          b = 0;
        if (weight < 0.25) {
          // Blue to Cyan
          r = 0;
          g = weight * 4;
          b = 1;
        } else if (weight < 0.5) {
          // Cyan to Green
          r = 0;
          g = 1;
          b = 1 - (weight - 0.25) * 4;
        } else if (weight < 0.75) {
          // Green to Yellow
          r = (weight - 0.5) * 4;
          g = 1;
          b = 0;
        } else {
          // Yellow to Red
          r = 1;
          g = 1 - (weight - 0.75) * 4;
          b = 0;
        }

        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }

      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      // Use a simple material with vertex colors
      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      });

      avatarMeshRef.current.material = material;
    }, 50);
  };

  // Effect to handle visualization mode changes
  useEffect(() => {
    if (!sceneRef.current) return;

    // Clear previous visualization
    restoreOriginalMaterials();
    clearVisualization();

    // Apply new visualization
    switch (props.visualizationMode) {
      case "regions":
        visualizeBodyRegions();
        break;
      case "collisions":
        // Lazy collision detection: compute on first visualization request
        if (!collisions && avatarMeshRef.current && armorMeshRef.current) {
          const detectedCollisions =
            armorFittingService.current.detectCollisions(
              avatarMeshRef.current,
              armorMeshRef.current,
            );
          setCollisions(detectedCollisions);
          props.onCollisionsDetected?.(detectedCollisions);
        }
        visualizeCollisions();
        break;
      case "weights":
        visualizeWeights();
        break;
    }

    return () => {
      if (visualizationTimeoutRef.current) {
        clearTimeout(visualizationTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visualizationMode, props.selectedBone, bodyRegions, collisions]);

  useImperativeHandle(ref, () => ({
    getMeshes: () => ({
      avatar: avatarMeshRef.current,
      armor: armorMeshRef.current,
      helmet: helmetMeshRef.current,
      scene: sceneRef.current,
    }),

    performFitting: async (params: ArmorFittingParams) => {
      if (
        !avatarMeshRef.current ||
        !armorMeshRef.current ||
        !sceneRef.current
      ) {
        console.error("Avatar, armor, or scene not available");
        return;
      }

      const armorMesh = armorMeshRef.current;
      const avatarMesh = avatarMeshRef.current;
      const scene = sceneRef.current;

      console.log("=== ARMOR TO TORSO FITTING ===");
      console.log("Performing armor fitting with params:", params);

      // Update entire scene before any calculations
      const updateSceneMatrices = (scene: THREE.Scene) => {
        scene.updateMatrixWorld(true);
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.SkinnedMesh) {
            obj.updateMatrix();
            obj.updateMatrixWorld(true);
          }
        });
      };
      updateSceneMatrices(scene);
      console.log("Updated scene matrix world before fitting");

      // Detect body regions for visualization
      console.log("Computing body regions...");
      if (avatarMesh.skeleton) {
        const detectedRegions = armorFittingService.current.computeBodyRegions(
          avatarMesh,
          avatarMesh.skeleton,
        );
        setBodyRegions(detectedRegions);
        props.onBodyRegionsDetected?.(detectedRegions);
      } else {
        console.warn(
          "Avatar mesh has no skeleton, cannot compute body regions",
        );
      }

      // Store parent references
      const avatarParent = avatarMesh.parent;
      const armorParent = armorMesh.parent;

      // Restore original geometry if previously fitted
      if (
        originalArmorGeometryRef.current &&
        armorMesh.userData.hasBeenFitted
      ) {
        console.log("Restoring original geometry before re-fitting");
        armorMesh.geometry.dispose();
        armorMesh.geometry = originalArmorGeometryRef.current.clone();
        armorMesh.geometry.computeVertexNormals();
      }

      // Reset mesh-level scale/position (group scale from Step 1 stays)
      armorMesh.scale.set(1, 1, 1);
      armorMesh.position.set(0, 0, 0);
      // Use updateWorldMatrix(true, true) to ensure ancestors are updated first,
      // then propagate down — this is critical for correct Box3.setFromObject results.
      armorMesh.updateWorldMatrix(true, true);

      // Calculate torso bounds
      const torsoInfo = calculateTorsoBounds(avatarMesh);
      if (!torsoInfo) {
        console.error("Could not calculate torso bounds");
        return;
      }
      const { torsoCenter, torsoSize, torsoBounds } = torsoInfo;

      // Scale armor to roughly match the body surface.
      // Torso bounds come from bone positions (inside the flesh), so add ~15%
      // to approximate the actual surface. With normal projection we don't need
      // oversizing — keeping it close preserves arm hole alignment.
      const armorBounds = new THREE.Box3().setFromObject(armorMesh);
      const armorSize = armorBounds.getSize(new THREE.Vector3());

      console.log("=== SCALING AND POSITIONING ARMOR ===");
      console.log("Armor world size:", armorSize);
      console.log("Target torso size:", torsoSize);

      if (armorSize.y > 0) {
        const margin = 1.15; // Just above body surface; arm holes stay aligned
        const scaleX =
          armorSize.x > 0 ? (torsoSize.x * margin) / armorSize.x : 1;
        const scaleY = (torsoSize.y * margin) / armorSize.y;
        const scaleZ =
          armorSize.z > 0 ? (torsoSize.z * margin) / armorSize.z : 1;
        const scaleFactor = Math.max(scaleX, scaleY, scaleZ);
        armorMesh.scale.setScalar(scaleFactor);
        armorMesh.updateWorldMatrix(false, true);
        console.log("Applied enclosing scale:", scaleFactor.toFixed(3));
      }

      // Center armor on torso.
      // CRITICAL: armorMesh.position is in parent-local space, but torsoCenter
      // is in world space. Use parent.worldToLocal for correct conversion.
      const scaledBounds = new THREE.Box3().setFromObject(armorMesh);
      const scaledWorldCenter = scaledBounds.getCenter(new THREE.Vector3());

      if (armorMesh.parent) {
        const targetInParent = armorMesh.parent.worldToLocal(
          torsoCenter.clone(),
        );
        const currentInParent =
          armorMesh.parent.worldToLocal(scaledWorldCenter);
        armorMesh.position.add(targetInParent.sub(currentInParent));
      } else {
        armorMesh.position.add(torsoCenter.clone().sub(scaledWorldCenter));
      }
      armorMesh.updateWorldMatrix(false, true);

      console.log("Positioned armor at:", armorMesh.position);

      // Compute a meaningful targetOffset based on body dimensions.
      // The fitting service uses targetOffset for the final surface standoff.
      // For visible armor, offset should be ~5-8% of torso depth.
      const armorStandoff = Math.max(
        torsoSize.z * 0.06, // 6% of torso depth
        0.02, // absolute minimum for a 2-unit avatar
      );
      console.log("Armor standoff offset:", armorStandoff.toFixed(4));

      // Apply the fitting using the service
      try {
        const shrinkwrapParams = {
          ...params,
          iterations: Math.min(params.iterations, 5), // Fewer iterations with normal projection
          stepSize: params.stepSize || 0.5, // Larger steps — projection is more accurate per-iteration
          targetOffset: armorStandoff,
          sampleRate: params.sampleRate || 1.0,
          smoothingStrength: params.smoothingStrength || 0.3,
          relativeOffset: true,
          relativeOffsetPercent: 0.08, // 8% of body width — visible armor thickness
          laplacianSmoothing: true, // Topology-aware smoothing after each iteration
          pushInteriorVertices: true,
          // Pass torso bounds so fitting service constrains to torso region
          targetBounds: torsoBounds,
          constraintCenter: torsoCenter,
        };

        console.log("Shrinkwrap parameters:", shrinkwrapParams);

        // Enable armor-specific intelligence (directional raycasting, arm hole detection)
        armorMesh.userData.originalGeometry = originalArmorGeometryRef.current;

        // Perform the fitting
        await genericFittingService.current.fitMeshToTarget(
          armorMesh,
          avatarMesh,
          shrinkwrapParams,
        );

        console.log("✅ Armor fitting complete!");

        // Detect collisions after fitting
        console.log("Detecting collisions...");
        const detectedCollisions = armorFittingService.current.detectCollisions(
          avatarMesh,
          armorMesh,
        );
        setCollisions(detectedCollisions);
        props.onCollisionsDetected?.(detectedCollisions);
        console.log(`Detected ${detectedCollisions.length} collisions`);

        // Mark armor as fitted
        armorMesh.userData.hasBeenFitted = true;

        // Ensure armor is visible and properly updated
        armorMesh.visible = true;
        armorMesh.updateMatrix();
        armorMesh.updateMatrixWorld(true);

        // Force scene update
        scene.updateMatrixWorld(true);
      } catch (error) {
        console.error("Armor fitting failed:", error);
      } finally {
        // Ensure meshes are properly attached to their original parents
        if (avatarParent && !avatarMesh.parent) {
          avatarParent.add(avatarMesh);
        }
        if (armorParent && !armorMesh.parent) {
          armorParent.add(armorMesh);
        }
      }
    },

    performSmartFitting: async (params: Partial<SmartFittingParameters>) => {
      if (
        !avatarMeshRef.current ||
        !armorMeshRef.current ||
        !sceneRef.current
      ) {
        console.error(
          "Avatar, armor, or scene not available for smart fitting",
        );
        return;
      }

      const armorMesh = armorMeshRef.current;
      const avatarMesh = avatarMeshRef.current;
      const scene = sceneRef.current;

      console.log("=== SMART ARMOR FITTING (Single-Pass BVH Projection) ===");

      // Update scene matrices
      scene.updateMatrixWorld(true);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.SkinnedMesh) {
          obj.updateMatrix();
          obj.updateMatrixWorld(true);
        }
      });

      // Restore original geometry if previously fitted
      if (
        originalArmorGeometryRef.current &&
        armorMesh.userData.hasBeenFitted
      ) {
        console.log("Restoring original geometry before re-fitting");
        armorMesh.geometry.dispose();
        armorMesh.geometry = originalArmorGeometryRef.current.clone();
        armorMesh.geometry.computeVertexNormals();
      }

      // Reset mesh transform (group scale from loading stays)
      armorMesh.scale.set(1, 1, 1);
      armorMesh.position.set(0, 0, 0);
      armorMesh.updateWorldMatrix(true, true);

      // Calculate torso bounds for scaling/positioning
      const torsoInfo = calculateTorsoBounds(avatarMesh);
      if (!torsoInfo) {
        console.error("Could not calculate torso bounds");
        return;
      }
      const { torsoCenter, torsoSize, torsoBounds: _torsoBounds } = torsoInfo;

      // Scale armor to be clearly OUTSIDE the body for shrink-wrap
      const armorBounds = new THREE.Box3().setFromObject(armorMesh);
      const armorSize = armorBounds.getSize(new THREE.Vector3());

      if (armorSize.y > 0) {
        const margin = 1.5;
        const scaleX =
          armorSize.x > 0 ? (torsoSize.x * margin) / armorSize.x : 1;
        const scaleY = (torsoSize.y * margin) / armorSize.y;
        const scaleZ =
          armorSize.z > 0 ? (torsoSize.z * margin) / armorSize.z : 1;
        const scaleFactor = Math.max(scaleX, scaleY, scaleZ, 1.0);
        armorMesh.scale.setScalar(scaleFactor);
        armorMesh.updateWorldMatrix(false, true);
        console.log("Smart fit scale factor:", scaleFactor.toFixed(3));
      }

      // Center armor on torso
      const scaledBounds = new THREE.Box3().setFromObject(armorMesh);
      const scaledWorldCenter = scaledBounds.getCenter(new THREE.Vector3());

      if (armorMesh.parent) {
        const targetInParent = armorMesh.parent.worldToLocal(
          torsoCenter.clone(),
        );
        const currentInParent =
          armorMesh.parent.worldToLocal(scaledWorldCenter);
        armorMesh.position.add(targetInParent.sub(currentInParent));
      } else {
        armorMesh.position.add(torsoCenter.clone().sub(scaledWorldCenter));
      }
      armorMesh.updateWorldMatrix(false, true);

      // Run single-pass fitting
      try {
        await singlePassFittingService.current.fitArmor(
          armorMesh,
          avatarMesh,
          params,
        );

        console.log("Smart fitting complete!");
        armorMesh.userData.hasBeenFitted = true;
        armorMesh.visible = true;

        // Fix materials: fitting can invert some triangle winding,
        // causing black spots with FrontSide culling. DoubleSide prevents this.
        armorMesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mats = Array.isArray(child.material)
              ? child.material
              : [child.material];
            mats.forEach((m) => {
              if (m instanceof THREE.MeshStandardMaterial) {
                m.side = THREE.DoubleSide;
              }
            });
          }
        });
        armorMesh.updateMatrix();
        armorMesh.updateMatrixWorld(true);
        scene.updateMatrixWorld(true);
      } catch (error) {
        console.error("Smart fitting failed:", error);
        throw error;
      }
    },

    performWasmFitting: async (params: Partial<WasmFittingParameters>) => {
      if (
        !avatarMeshRef.current ||
        !armorMeshRef.current ||
        !sceneRef.current
      ) {
        console.error("Avatar, armor, or scene not available for SDF fitting");
        return;
      }

      const armorMesh = armorMeshRef.current;
      const avatarMesh = avatarMeshRef.current;
      const scene = sceneRef.current;

      console.log("=== SDF ARMOR FITTING (Signed Distance Field) ===");

      // Update scene matrices
      scene.updateMatrixWorld(true);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.SkinnedMesh) {
          obj.updateMatrix();
          obj.updateMatrixWorld(true);
        }
      });

      // Restore original geometry if previously fitted
      if (
        originalArmorGeometryRef.current &&
        armorMesh.userData.hasBeenFitted
      ) {
        console.log("Restoring original geometry before re-fitting");
        armorMesh.geometry.dispose();
        armorMesh.geometry = originalArmorGeometryRef.current.clone();
        armorMesh.geometry.computeVertexNormals();
      }

      // Reset mesh transform
      armorMesh.scale.set(1, 1, 1);
      armorMesh.position.set(0, 0, 0);
      armorMesh.updateWorldMatrix(true, true);

      // Calculate torso bounds for scaling/positioning
      const torsoInfo = calculateTorsoBounds(avatarMesh);
      if (!torsoInfo) {
        console.error("Could not calculate torso bounds");
        return;
      }
      const { torsoCenter, torsoSize, torsoBounds: _torsoBounds } = torsoInfo;

      // Scale armor to be clearly OUTSIDE the body for shrink-wrap
      const armorBounds = new THREE.Box3().setFromObject(armorMesh);
      const armorSize = armorBounds.getSize(new THREE.Vector3());

      if (armorSize.y > 0) {
        const margin = 1.5;
        const scaleX =
          armorSize.x > 0 ? (torsoSize.x * margin) / armorSize.x : 1;
        const scaleY = (torsoSize.y * margin) / armorSize.y;
        const scaleZ =
          armorSize.z > 0 ? (torsoSize.z * margin) / armorSize.z : 1;
        const scaleFactor = Math.max(scaleX, scaleY, scaleZ, 1.0);
        armorMesh.scale.setScalar(scaleFactor);
        armorMesh.updateWorldMatrix(false, true);
        console.log("SDF fit scale factor:", scaleFactor.toFixed(3));
      }

      // Center armor on torso
      const scaledBounds = new THREE.Box3().setFromObject(armorMesh);
      const scaledWorldCenter = scaledBounds.getCenter(new THREE.Vector3());

      if (armorMesh.parent) {
        const targetInParent = armorMesh.parent.worldToLocal(
          torsoCenter.clone(),
        );
        const currentInParent =
          armorMesh.parent.worldToLocal(scaledWorldCenter);
        armorMesh.position.add(targetInParent.sub(currentInParent));
      } else {
        armorMesh.position.add(torsoCenter.clone().sub(scaledWorldCenter));
      }
      armorMesh.updateWorldMatrix(false, true);

      // Run SDF fitting
      try {
        await wasmFittingService.current.fitArmor(
          armorMesh,
          avatarMesh,
          params,
        );

        console.log("SDF fitting complete!");
        armorMesh.userData.hasBeenFitted = true;
        armorMesh.visible = true;

        // Fix materials
        armorMesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mats = Array.isArray(child.material)
              ? child.material
              : [child.material];
            mats.forEach((m) => {
              if (m instanceof THREE.MeshStandardMaterial) {
                m.side = THREE.DoubleSide;
              }
            });
          }
        });
        armorMesh.updateMatrix();
        armorMesh.updateMatrixWorld(true);
        scene.updateMatrixWorld(true);
      } catch (error) {
        console.error("SDF fitting failed:", error);
        throw error;
      }
    },

    performHelmetFitting: async (params: HelmetFittingParams) => {
      if (!avatarMeshRef.current || !helmetMeshRef.current) {
        console.error("Avatar or helmet mesh not available");
        return;
      }

      console.log("Performing helmet fitting with params:", params);

      // Ensure avatar's world matrix is up to date
      avatarMeshRef.current.updateMatrixWorld(true);
      helmetMeshRef.current.updateMatrixWorld(true);

      // Convert rotation to THREE.Euler if needed
      const fittingParams = {
        ...params,
        rotation: params.rotation
          ? new THREE.Euler(
              params.rotation.x,
              params.rotation.y,
              params.rotation.z,
            )
          : new THREE.Euler(),
        attachToHead: false, // Match debugger behavior - manual attachment
        showHeadBounds: false,
        showCollisionDebug: false,
      };

      try {
        // Log helmet state before fitting
        console.log("Helmet before fitting:");
        console.log("- Position:", helmetMeshRef.current.position);
        console.log("- Scale:", helmetMeshRef.current.scale);
        console.log(
          "- Parent:",
          helmetMeshRef.current.parent?.name || "unknown",
        );

        const result = await genericFittingService.current.fitHelmetToHead(
          helmetMeshRef.current,
          avatarMeshRef.current,
          fittingParams,
        );

        console.log("Helmet fitting complete:", result);
        console.log("Helmet after fitting:");
        console.log("- Position:", helmetMeshRef.current.position);
        console.log("- Scale:", helmetMeshRef.current.scale);

        // Mark helmet as fitted
        helmetMeshRef.current.userData.hasBeenFitted = true;
      } catch (error) {
        console.error("Helmet fitting failed:", error);
      }
    },

    attachHelmetToHead: () => {
      if (!avatarMeshRef.current || !helmetMeshRef.current) {
        console.error("Avatar or helmet mesh not loaded");
        return;
      }

      // Use the same head detection method as debugger
      const headInfo = genericFittingService.current.detectHeadRegion(
        avatarMeshRef.current,
      );

      if (!headInfo.headBone) {
        console.error("No head bone found - attaching to avatar root instead");

        const message =
          `No head bone found in the model. The system looked for common head bone names but couldn't find any.\n\n` +
          `You can either:\n` +
          `1. Attach the helmet to the avatar root (it won't follow head animations)\n` +
          `2. Cancel and manually parent the helmet in your 3D software\n\n` +
          `Would you like to attach to the avatar root?`;

        if (confirm(message)) {
          const avatarRoot =
            avatarMeshRef.current.parent || avatarMeshRef.current;
          avatarRoot.attach(helmetMeshRef.current);
          console.log("Helmet attached to avatar root");
          notify.info(
            "Helmet attached to avatar root. Note: It will follow body movement but not specific head animations.",
          );
        }
        return;
      }

      // Store world transform before attachment
      console.log("=== BEFORE ATTACHMENT ===");
      const originalWorldPos = helmetMeshRef.current.getWorldPosition(
        new THREE.Vector3(),
      );
      const originalWorldScale = helmetMeshRef.current.getWorldScale(
        new THREE.Vector3(),
      );
      console.log("Helmet world position:", originalWorldPos);
      console.log("Helmet world scale:", originalWorldScale);

      // Check bone scale
      const boneScale = headInfo.headBone.getWorldScale(new THREE.Vector3());

      if (boneScale.x < 0.1) {
        console.log("Bone has extreme scale - applying visibility workaround");

        // Attach with workarounds
        headInfo.headBone.attach(helmetMeshRef.current);

        // Apply material fixes for extreme scales
        helmetMeshRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const materials = Array.isArray(child.material)
              ? child.material
              : [child.material];
            materials.forEach((material) => {
              if (material instanceof THREE.MeshStandardMaterial) {
                material.side = THREE.DoubleSide;
                material.depthWrite = true;
                material.depthTest = true;
              }
            });
          }
        });

        // Force matrix updates
        helmetMeshRef.current.updateMatrix();
        helmetMeshRef.current.updateMatrixWorld(true);

        console.log("Applied extreme scale workarounds");
      } else {
        // Normal attachment process
        console.log("Attaching helmet to head bone...");
        headInfo.headBone.attach(helmetMeshRef.current);
        console.log("Helmet attached to head bone");
      }

      // Debug: Log transforms after attachment
      console.log("=== AFTER ATTACHMENT ===");
      console.log(
        "Helmet world position:",
        helmetMeshRef.current.getWorldPosition(new THREE.Vector3()),
      );
      console.log(
        "Helmet world scale:",
        helmetMeshRef.current.getWorldScale(new THREE.Vector3()),
      );
      console.log(
        "Helmet parent:",
        helmetMeshRef.current.parent?.name || "none",
      );

      // Update flags
      helmetMeshRef.current.userData.isAttached = true;

      console.log(
        "✅ Helmet successfully attached to head bone:",
        headInfo.headBone.name,
      );
    },

    detachHelmetFromHead: () => {
      detachHelmetFromHeadInternal();
    },

    transferWeights: () => {
      if (
        !avatarMeshRef.current ||
        !armorMeshRef.current ||
        !sceneRef.current
      ) {
        console.error("Scene, avatar, or armor not available for binding");
        return;
      }

      console.log("=== BINDING ARMOR TO SKELETON ===");

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

      if (!skinnedArmor) {
        console.error("Failed to create skinned armor");
        return;
      }

      console.log("Skinned armor created");

      // Copy material settings
      if (currentArmorMesh.material) {
        skinnedArmor.material = currentArmorMesh.material;

        if (
          skinnedArmor.material instanceof THREE.MeshStandardMaterial &&
          currentArmorMesh.material instanceof THREE.MeshStandardMaterial
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
        console.log(
          "✅ Skinned armor maintained perfect position after binding",
        );
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
      armorMeshRef.current = skinnedArmor;
      skinnedArmor.userData.isBound = true;
      skinnedArmor.userData.isArmor = true;

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

      console.log("✅ Armor successfully bound to skeleton!");

      // Force scene update
      scene.updateMatrixWorld(true);
    },

    exportFittedModel: async () => {
      return await exportFittedModelHook();
    },

    resetTransform: () => {
      // Reset helmet transform if in Head mode
      if (equipmentSlot === "Head" && helmetMeshRef.current) {
        const helmet = helmetMeshRef.current;

        console.log("=== RESETTING HELMET ===");

        // First, always detach if attached
        if (helmet.userData.isAttached || helmet.parent instanceof THREE.Bone) {
          console.log("Detaching helmet from bone");
          detachHelmetFromHeadInternal();
        }

        // Force the helmet back to origin
        helmet.position.set(0, 0, 0);
        helmet.rotation.set(0, 0, 0);
        helmet.scale.set(1, 1, 1);

        // Find the GLTF root in the helmet group and place helmet there
        if (helmetGroupRef.current) {
          // First ensure the group is at origin
          helmetGroupRef.current.position.set(0, 0, 0);
          helmetGroupRef.current.rotation.set(0, 0, 0);
          helmetGroupRef.current.scale.set(1, 1, 1);

          // Find the GLTF scene inside the group
          let gltfRoot: THREE.Object3D | null = null;
          helmetGroupRef.current.traverse((child) => {
            if (
              child.userData.isGltfRoot ||
              (child.type === "Scene" && !gltfRoot)
            ) {
              gltfRoot = child;
            }
          });

          // If we found the GLTF root and helmet isn't already its child, move it there
          if (gltfRoot && helmet.parent !== gltfRoot) {
            console.log("Moving helmet back to GLTF root");
            if (helmet.parent) {
              helmet.removeFromParent();
            }
            (gltfRoot as THREE.Object3D).add(helmet);
          }

          // Ensure all intermediate groups are also at origin
          helmetGroupRef.current.traverse((child) => {
            if (child instanceof THREE.Group || child.type === "Scene") {
              child.position.set(0, 0, 0);
              child.rotation.set(0, 0, 0);
              child.scale.set(1, 1, 1);
            }
          });
        }

        // Clear fitted flags
        helmet.userData.hasBeenFitted = false;
        helmet.userData.isAttached = false;

        // Force matrix updates on entire hierarchy
        if (helmetGroupRef.current) {
          helmetGroupRef.current.updateMatrix();
          helmetGroupRef.current.updateMatrixWorld(true);
        }

        helmet.updateMatrix();
        helmet.updateMatrixWorld(true);

        // Log final state
        const worldPos = new THREE.Vector3();
        helmet.getWorldPosition(worldPos);
        console.log("Helmet reset complete");
        console.log("- Local position:", helmet.position);
        console.log("- World position:", worldPos);
        console.log(
          "- Parent:",
          helmet.parent?.name || helmet.parent?.type || "none",
        );

        console.log("=== HELMET RESET FINISHED ===");
      }
      // Reset armor transform if in Spine2 mode
      else if (equipmentSlot === "Spine2" && armorMeshRef.current) {
        const armor = armorMeshRef.current;

        console.log("=== RESETTING ARMOR ===");

        // Reset geometry if we have the original
        if (originalArmorGeometryRef.current && armor.userData.hasBeenFitted) {
          console.log("Restoring original armor geometry");
          armor.geometry.dispose();
          armor.geometry = originalArmorGeometryRef.current.clone();
          armor.geometry.computeVertexNormals();
        }

        // If armor was bound to skeleton, detach it
        if (armor.parent && armor.parent !== sceneRef.current) {
          console.log("Detaching armor from parent:", armor.parent?.name);
          if (sceneRef.current) {
            sceneRef.current.attach(armor);
          }
        }

        // Reset transforms
        armor.position.set(0, 0, 0);
        armor.rotation.set(0, 0, 0);
        armor.scale.set(1, 1, 1);

        // Reset material properties
        armor.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const materials = Array.isArray(child.material)
              ? child.material
              : [child.material];
            materials.forEach((material) => {
              if (material instanceof THREE.MeshStandardMaterial) {
                material.wireframe = false;
                material.opacity = 1;
                material.transparent = false;
              }
            });
          }
        });

        // Clear fitted flag
        armor.userData.hasBeenFitted = false;
        armor.userData.isBound = false;

        // Ensure armor is visible
        armor.visible = true;
        armor.updateMatrix();
        armor.updateMatrixWorld(true);

        console.log("=== ARMOR RESET FINISHED ===");
      }
    },

    clearHelmet: () => {
      console.log("=== CLEARING HELMET ===");

      // Clear the helmet group
      if (helmetGroupRef.current) {
        console.log("Clearing helmet group");
        helmetGroupRef.current.clear();
      }

      if (helmetMeshRef.current) {
        // First detach if attached to head bone
        if (
          helmetMeshRef.current.userData.isAttached &&
          helmetMeshRef.current.parent &&
          sceneRef.current
        ) {
          console.log("Detaching helmet before clear");
          // Make sure helmet is visible
          helmetMeshRef.current.visible = true;
          helmetMeshRef.current.traverse((child) => {
            child.visible = true;
          });

          // Use attach() which preserves world transform
          sceneRef.current.attach(helmetMeshRef.current);
          helmetMeshRef.current.userData.isAttached = false;
        }

        // Remove from scene
        if (helmetMeshRef.current.parent) {
          helmetMeshRef.current.parent.remove(helmetMeshRef.current);
        }

        // Dispose geometry and materials
        if (helmetMeshRef.current.geometry) {
          helmetMeshRef.current.geometry.dispose();
        }

        helmetMeshRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.material) {
              const materials = Array.isArray(child.material)
                ? child.material
                : [child.material];
              materials.forEach((mat) => mat.dispose());
            }
          }
        });

        // Clear reference
        helmetMeshRef.current = null;
        originalHelmetTransformRef.current = null;

        console.log("Helmet cleared from scene");
      }

      // Note: loadedUrlsRef is in ModelDemo scope, will be cleared on next render
    },

    performEquipmentPreview: async (riggedGlbUrl: string) => {
      if (!avatarMeshRef.current || !sceneRef.current) {
        console.error("Avatar or scene not available for equipment preview");
        return;
      }

      const loader = new GLTFLoader();
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        loader.load(riggedGlbUrl, resolve, undefined, reject);
      });

      // Find the SkinnedMesh in the rigged GLB
      let foundSkinnedMesh: THREE.SkinnedMesh | null = null;
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.SkinnedMesh && !foundSkinnedMesh) {
          foundSkinnedMesh = child;
        }
      });

      if (!foundSkinnedMesh) {
        // Fall back to regular mesh if no skinned mesh
        let regularMesh: THREE.Mesh | null = null;
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh && !regularMesh) {
            regularMesh = child;
          }
        });

        if (regularMesh) {
          // Display as regular mesh overlay
          sceneRef.current.add(gltf.scene);
          console.log("Equipment preview loaded as regular mesh");
          return;
        }

        throw new Error("No mesh found in rigged GLB");
      }

      const riggedMesh = foundSkinnedMesh as THREE.SkinnedMesh;

      // If avatar has a skeleton, remap the rigged mesh's bone indices
      const avatarMesh = avatarMeshRef.current;
      if (avatarMesh.skeleton) {
        const avatarBoneNames = avatarMesh.skeleton.bones.map(
          (b: THREE.Bone) => b.name,
        );
        const riggedBoneNames = riggedMesh.skeleton.bones.map(
          (b: THREE.Bone) => b.name,
        );

        // Build index mapping: rigged bone index → avatar bone index
        const indexMap = new Map<number, number>();
        for (let i = 0; i < riggedBoneNames.length; i++) {
          const avatarIdx = avatarBoneNames.indexOf(riggedBoneNames[i]);
          if (avatarIdx !== -1) {
            indexMap.set(i, avatarIdx);
          }
        }

        // Remap skin indices in the geometry
        const skinIndex = riggedMesh.geometry.getAttribute("skinIndex");
        if (skinIndex) {
          for (let i = 0; i < skinIndex.count; i++) {
            for (let j = 0; j < skinIndex.itemSize; j++) {
              const oldIdx = skinIndex.getComponent(i, j);
              const newIdx = indexMap.get(oldIdx);
              if (newIdx !== undefined) {
                skinIndex.setComponent(i, j, newIdx);
              }
            }
          }
          skinIndex.needsUpdate = true;
        }

        // Bind to avatar's skeleton (pass bindMatrix to prevent calculateInverses)
        riggedMesh.bind(avatarMesh.skeleton, riggedMesh.bindMatrix);
      }

      // Add to scene
      sceneRef.current.add(riggedMesh);
      console.log("Equipment preview loaded with skeleton binding");

      notify.success("Rigged equipment preview loaded");
    },

    clearArmor: () => {
      if (armorMeshRef.current) {
        // Remove from scene
        if (armorMeshRef.current.parent) {
          armorMeshRef.current.parent.remove(armorMeshRef.current);
        }

        // Dispose geometry and materials
        if (armorMeshRef.current.geometry) {
          armorMeshRef.current.geometry.dispose();
        }

        armorMeshRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.material) {
              const materials = Array.isArray(child.material)
                ? child.material
                : [child.material];
              materials.forEach((mat) => mat.dispose());
            }
          }
        });

        // Clear reference
        armorMeshRef.current = null;

        console.log("Armor cleared from scene");
      }
    },
  }));

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Canvas camera={{ position: [5, 5, 5], fov: 50 }}>
        <Scene
          avatarUrl={avatarUrl}
          armorUrl={armorUrl}
          helmetUrl={helmetUrl}
          showWireframe={showWireframe}
          equipmentSlot={equipmentSlot}
          armorIsRigged={armorIsRigged}
          currentAnimation={props.currentAnimation || "tpose"}
          isAnimationPlaying={props.isAnimationPlaying || false}
          vrmAnimation={props.vrmAnimation}
          vrmUrl={props.vrmUrl}
          visualizationGroup={visualizationGroupRef.current}
          onModelsLoaded={handleModelsLoaded}
        />
      </Canvas>
    </div>
  );
});
