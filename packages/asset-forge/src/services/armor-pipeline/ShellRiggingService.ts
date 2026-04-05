import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import type { ShellMesh, RiggedArmorResult } from "./types";

/**
 * ShellRiggingService — POC-3 implementation
 *
 * Re-rigs a textured shell (from Meshy retexture) by transferring bone weights
 * from the original shell geometry back onto the textured mesh.
 *
 * Two strategies:
 * - Fast path: vertex counts match → direct attribute copy
 * - Fallback: vertex counts differ → nearest-vertex weight transfer
 */
export class ShellRiggingService {
  private gltfLoader: GLTFLoader;

  constructor() {
    this.gltfLoader = new GLTFLoader();
  }

  /**
   * Rig a textured shell by transferring bone weights from the original shell.
   *
   * @param originalShell - The shell mesh with skeleton + skinIndex/skinWeight
   * @param texturedGlbUrl - URL to the textured GLB (from Meshy or file upload)
   * @returns RiggedArmorResult with a SkinnedMesh bound to the original skeleton
   */
  async rigTexturedShell(
    originalShell: ShellMesh,
    texturedGlbUrl: string,
    /** If provided, bind to this skeleton instead of the shell's skeleton.
     *  Required when the preview VRM is a different instance than the extraction VRM. */
    targetSkeleton?: THREE.Skeleton,
  ): Promise<RiggedArmorResult> {
    // Load textured GLB
    const gltf = await this.gltfLoader.loadAsync(texturedGlbUrl);

    // Find the first Mesh in the loaded scene
    let texturedMesh: THREE.Mesh | null = null;
    gltf.scene.traverse((child) => {
      if (!texturedMesh && child instanceof THREE.Mesh) {
        texturedMesh = child;
      }
    });

    if (!texturedMesh) {
      throw new Error("No Mesh found in textured GLB");
    }

    const mesh = texturedMesh as THREE.Mesh;
    const texturedGeo = mesh.geometry;
    const originalGeo = originalShell.geometry;

    // Bake GLTF scene hierarchy transforms into geometry (the mesh node may
    // be nested inside groups with translation/rotation/scale)
    gltf.scene.updateMatrixWorld(true);
    texturedGeo.applyMatrix4(mesh.matrixWorld);
    // Reset the mesh's own transform since it's now baked into geometry
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrixWorld(true);

    // Align textured geometry to original shell — Meshy often centers/normalizes
    // the model, so positions end up at origin instead of at chest/leg height.
    this.alignGeometry(texturedGeo, originalGeo);

    const texturedVertCount = texturedGeo.attributes.position.count;
    const originalVertCount = originalGeo.attributes.position.count;

    const vertexMatch = texturedVertCount === originalVertCount;

    // Get skinning attributes from original shell
    const srcSkinIndex = originalGeo.attributes
      .skinIndex as THREE.BufferAttribute;
    const srcSkinWeight = originalGeo.attributes
      .skinWeight as THREE.BufferAttribute;

    if (!srcSkinIndex || !srcSkinWeight) {
      throw new Error(
        "Original shell geometry missing skinIndex/skinWeight attributes",
      );
    }

    let skinIndexArray: Float32Array;
    let skinWeightArray: Float32Array;

    if (vertexMatch) {
      // Fast path: direct copy — vertex counts match (expected with enable_original_uv)
      skinIndexArray = new Float32Array(srcSkinIndex.array);
      skinWeightArray = new Float32Array(srcSkinWeight.array);
    } else {
      // Fallback: nearest-vertex weight transfer by position distance
      console.warn(
        `[ShellRiggingService] Vertex count mismatch: original=${originalVertCount}, textured=${texturedVertCount}. Using nearest-vertex transfer.`,
      );

      const result = this.nearestVertexWeightTransfer(
        originalGeo,
        texturedGeo,
        srcSkinIndex,
        srcSkinWeight,
      );
      skinIndexArray = result.skinIndices;
      skinWeightArray = result.skinWeights;
    }

    // Set skinning attributes on textured geometry
    texturedGeo.setAttribute(
      "skinIndex",
      new THREE.BufferAttribute(new Uint16Array(skinIndexArray), 4),
    );
    texturedGeo.setAttribute(
      "skinWeight",
      new THREE.BufferAttribute(skinWeightArray, 4),
    );

    // Use the target skeleton (from the preview VRM) or fall back to the shell's skeleton
    const skeleton = targetSkeleton ?? originalShell.skeleton;

    // Preserve textured materials (Meshy PBR)
    let material = mesh.material;
    if (Array.isArray(material)) {
      material = material.map((m) => {
        m.side = THREE.DoubleSide;
        return m;
      });
    } else {
      material.side = THREE.DoubleSide;
    }

    const skinnedMesh = new THREE.SkinnedMesh(texturedGeo, material);
    skinnedMesh.name = `rigged_${originalShell.slotName}_${originalShell.bulkClass}`;

    // Bind to the skeleton that will be animated
    skinnedMesh.bind(skeleton);

    return {
      skinnedMesh,
      skeleton,
      slotName: originalShell.slotName,
      bulkClass: originalShell.bulkClass,
      vertexMatch,
      vertexCount: texturedVertCount,
    };
  }

  /**
   * Align textured geometry to match the original shell's bounding box.
   * Handles Meshy centering/normalization by matching scale and position.
   */
  private alignGeometry(
    texturedGeo: THREE.BufferGeometry,
    originalGeo: THREE.BufferGeometry,
  ): void {
    originalGeo.computeBoundingBox();
    texturedGeo.computeBoundingBox();

    if (!originalGeo.boundingBox || !texturedGeo.boundingBox) return;

    const origCenter = originalGeo.boundingBox.getCenter(new THREE.Vector3());
    const origSize = originalGeo.boundingBox.getSize(new THREE.Vector3());
    const texCenter = texturedGeo.boundingBox.getCenter(new THREE.Vector3());
    const texSize = texturedGeo.boundingBox.getSize(new THREE.Vector3());

    // Scale to match if sizes differ by more than 5%
    const maxOrigDim = Math.max(origSize.x, origSize.y, origSize.z);
    const maxTexDim = Math.max(texSize.x, texSize.y, texSize.z);

    if (maxTexDim > 0.001 && Math.abs(maxOrigDim / maxTexDim - 1) > 0.05) {
      const scale = maxOrigDim / maxTexDim;
      console.log(
        `[ShellRiggingService] Scaling textured mesh by ${scale.toFixed(3)} to match original`,
      );
      texturedGeo.scale(scale, scale, scale);
      // Recompute after scale
      texturedGeo.computeBoundingBox();
      texturedGeo.boundingBox!.getCenter(texCenter);
    }

    // Translate to match center position
    const offset = origCenter.clone().sub(texCenter);
    if (offset.length() > 0.001) {
      console.log(
        `[ShellRiggingService] Translating textured mesh by (${offset.x.toFixed(3)}, ${offset.y.toFixed(3)}, ${offset.z.toFixed(3)}) to align with original`,
      );
      texturedGeo.translate(offset.x, offset.y, offset.z);
    }
  }

  /**
   * Nearest-vertex weight transfer: for each vertex in the textured geometry,
   * find the closest vertex in the original geometry and copy its bone weights.
   */
  private nearestVertexWeightTransfer(
    originalGeo: THREE.BufferGeometry,
    texturedGeo: THREE.BufferGeometry,
    srcSkinIndex: THREE.BufferAttribute,
    srcSkinWeight: THREE.BufferAttribute,
  ): { skinIndices: Float32Array; skinWeights: Float32Array } {
    const srcPos = originalGeo.attributes.position as THREE.BufferAttribute;
    const dstPos = texturedGeo.attributes.position as THREE.BufferAttribute;
    const dstCount = dstPos.count;
    const srcCount = srcPos.count;

    const skinIndices = new Float32Array(dstCount * 4);
    const skinWeights = new Float32Array(dstCount * 4);

    // Pre-extract source positions into flat array for fast lookup
    const srcPositions = new Float32Array(srcCount * 3);
    for (let i = 0; i < srcCount; i++) {
      srcPositions[i * 3] = srcPos.getX(i);
      srcPositions[i * 3 + 1] = srcPos.getY(i);
      srcPositions[i * 3 + 2] = srcPos.getZ(i);
    }

    for (let di = 0; di < dstCount; di++) {
      const dx = dstPos.getX(di);
      const dy = dstPos.getY(di);
      const dz = dstPos.getZ(di);

      // Find nearest source vertex
      let bestDist = Infinity;
      let bestIdx = 0;

      for (let si = 0; si < srcCount; si++) {
        const ex = srcPositions[si * 3] - dx;
        const ey = srcPositions[si * 3 + 1] - dy;
        const ez = srcPositions[si * 3 + 2] - dz;
        const dist = ex * ex + ey * ey + ez * ez;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = si;
        }
      }

      // Copy skin data from nearest source vertex
      for (let j = 0; j < 4; j++) {
        skinIndices[di * 4 + j] = srcSkinIndex.getComponent(bestIdx, j);
        skinWeights[di * 4 + j] = srcSkinWeight.getComponent(bestIdx, j);
      }
    }

    return { skinIndices, skinWeights };
  }

  /**
   * Export a rigged armor mesh as a game-ready GLB.
   * Follows the pattern from ArmorFittingService.exportSkinnedArmorForGame().
   */
  async exportRiggedGLB(result: RiggedArmorResult): Promise<Blob> {
    const { GLTFExporter } =
      await import("three/addons/exporters/GLTFExporter.js");

    const exporter = new GLTFExporter();
    const { skinnedMesh, skeleton } = result;
    const geometry = skinnedMesh.geometry;

    // Find which bones are actually used by the armor
    const usedBoneIndices = new Set<number>();
    const skinIndex = geometry.attributes.skinIndex as THREE.BufferAttribute;
    const skinWeight = geometry.attributes.skinWeight as THREE.BufferAttribute;

    for (let i = 0; i < skinIndex.count; i++) {
      for (let j = 0; j < 4; j++) {
        const weight = skinWeight.getComponent(i, j);
        if (weight > 0) {
          usedBoneIndices.add(skinIndex.getComponent(i, j));
        }
      }
    }

    // Collect used bones + ancestors to maintain hierarchy
    const requiredBoneIndices = new Set<number>();
    for (const boneIndex of usedBoneIndices) {
      requiredBoneIndices.add(boneIndex);
      let bone = skeleton.bones[boneIndex];
      while (bone?.parent && bone.parent instanceof THREE.Bone) {
        const parentIndex = skeleton.bones.indexOf(bone.parent);
        if (parentIndex !== -1) {
          requiredBoneIndices.add(parentIndex);
          bone = bone.parent;
        } else {
          break;
        }
      }
    }

    // Update skeleton before export
    skeleton.update();

    // Create new bones preserving hierarchy
    const sortedIndices = Array.from(requiredBoneIndices).sort((a, b) => a - b);
    const boneMapping = new Map<number, number>();
    const oldToNewBone = new Map<THREE.Bone, THREE.Bone>();
    const newBones: THREE.Bone[] = [];

    // Store world matrices
    for (const oldIndex of sortedIndices) {
      skeleton.bones[oldIndex].updateWorldMatrix(true, false);
    }

    for (let newIndex = 0; newIndex < sortedIndices.length; newIndex++) {
      const oldIndex = sortedIndices[newIndex];
      const oldBone = skeleton.bones[oldIndex];
      const newBone = new THREE.Bone();
      newBone.name = oldBone.name;
      newBone.position.copy(oldBone.position);
      newBone.quaternion.copy(oldBone.quaternion);
      newBone.scale.set(1, 1, 1);

      newBones.push(newBone);
      boneMapping.set(oldIndex, newIndex);
      oldToNewBone.set(oldBone, newBone);
    }

    // Set up parent-child relationships
    for (const oldIndex of sortedIndices) {
      const oldBone = skeleton.bones[oldIndex];
      const newBone = oldToNewBone.get(oldBone)!;
      if (oldBone.parent && oldBone.parent instanceof THREE.Bone) {
        const parentNewBone = oldToNewBone.get(oldBone.parent);
        if (parentNewBone) {
          parentNewBone.add(newBone);
        }
      }
    }

    const rootBones = newBones.filter(
      (bone) => !bone.parent || !(bone.parent instanceof THREE.Bone),
    );

    rootBones.forEach((root) => root.updateMatrixWorld(true));

    // Create inverse bind matrices
    const boneInverses: THREE.Matrix4[] = [];
    for (const oldIndex of sortedIndices) {
      const inverseBindMatrix = new THREE.Matrix4();
      inverseBindMatrix.copy(skeleton.bones[oldIndex].matrixWorld).invert();
      boneInverses.push(inverseBindMatrix);
    }

    const minimalSkeleton = new THREE.Skeleton(newBones, boneInverses);

    // Clone geometry and remap skin indices
    const exportGeometry = geometry.clone();
    const exportSkinIndex = exportGeometry.attributes
      .skinIndex as THREE.BufferAttribute;
    const newSkinIndices = new Float32Array(exportSkinIndex.array.length);

    for (let i = 0; i < exportSkinIndex.count; i++) {
      for (let j = 0; j < 4; j++) {
        const oldIndex = exportSkinIndex.getComponent(i, j);
        const newIndex = boneMapping.get(oldIndex);
        newSkinIndices[i * 4 + j] = newIndex !== undefined ? newIndex : 0;
      }
    }

    exportGeometry.setAttribute(
      "skinIndex",
      new THREE.BufferAttribute(newSkinIndices, 4),
    );

    // Build export scene
    const exportScene = new THREE.Scene();
    const rootNode = new THREE.Group();
    rootNode.name = "ArmatureRoot";
    exportScene.add(rootNode);
    rootBones.forEach((bone) => rootNode.add(bone));

    // Clone material for export
    let exportMaterial = skinnedMesh.material;
    if (Array.isArray(exportMaterial)) {
      exportMaterial = exportMaterial.map((m) => m.clone());
    } else {
      exportMaterial = exportMaterial.clone();
    }

    const exportMesh = new THREE.SkinnedMesh(exportGeometry, exportMaterial);
    exportMesh.name = result.slotName + "_armor";
    exportMesh.bind(minimalSkeleton, new THREE.Matrix4().identity());
    exportScene.add(exportMesh);

    exportMesh.updateMatrixWorld(true);
    minimalSkeleton.update();

    // Ensure geometry has normals
    if (!exportGeometry.attributes.normal) {
      exportGeometry.computeVertexNormals();
    }

    exportMesh.userData = {
      armorMetadata: {
        slotName: result.slotName,
        bulkClass: result.bulkClass,
        vertexMatch: result.vertexMatch,
        vertexCount: result.vertexCount,
        boneCount: newBones.length,
        boneNames: newBones.map((b) => b.name),
        exportDate: new Date().toISOString(),
      },
    };

    return new Promise((resolve, reject) => {
      exporter.parse(
        exportScene,
        (buffer) => {
          if (buffer instanceof ArrayBuffer) {
            resolve(new Blob([buffer], { type: "model/gltf-binary" }));
          } else {
            resolve(
              new Blob([JSON.stringify(buffer)], { type: "model/gltf+json" }),
            );
          }
        },
        reject,
        { binary: true },
      );
    });
  }
}
