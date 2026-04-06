import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

import type {
  EquipmentSlotName,
  BulkClass,
  BodyRegion,
  ShellMesh,
  ShellExtractionResult,
  ShellExtractionProgress,
} from "./types";
import { SLOT_BONE_MAP, SLOT_PARTIAL_BONES, BULK_OFFSETS } from "./types";

type ProgressCallback = (progress: ShellExtractionProgress) => void;

/** Per-bulk-class smoothing parameters. Thicker shells get more smoothing. */
const SMOOTH_PARAMS: Record<BulkClass, { iterations: number; factor: number }> =
  {
    skin: { iterations: 4, factor: 0.2 },
    cloth: { iterations: 6, factor: 0.25 },
    leather: { iterations: 8, factor: 0.3 },
    plate: { iterations: 12, factor: 0.35 },
  };

/**
 * ShellExtractionService — POC-1 implementation
 *
 * Extracts body regions from a VRM avatar by bone weight analysis,
 * then offsets them along vertex normals to create "shell" meshes
 * at various bulk classes (skin, cloth, leather, plate).
 *
 * Features:
 * - Curvature-adaptive offset clamping (prevents self-intersection at concavities)
 * - Body-constrained Laplacian smooth (enforces minimum distance from body surface)
 * - Boundary edge tapering (smooth falloff at shell edges)
 * - Per-bulk-class smooth parameters (thicker shells get more smoothing)
 */
export class ShellExtractionService {
  private loader: GLTFLoader;

  constructor() {
    this.loader = new GLTFLoader();
    this.loader.register((parser) => new VRMLoaderPlugin(parser));
  }

  /**
   * Load a VRM avatar and extract shell meshes for all slots and bulk classes.
   */
  async extractShells(
    vrmUrl: string,
    slots: EquipmentSlotName[] = ["helmet", "body", "legs", "boots", "gloves"],
    bulkClasses: BulkClass[] = ["skin", "cloth", "leather", "plate"],
    onProgress?: ProgressCallback,
  ): Promise<ShellExtractionResult> {
    onProgress?.({
      stage: "loading",
      progress: 0,
      message: "Loading VRM avatar...",
    });

    const {
      skinnedMesh,
      skeleton,
      vrm,
      scene: vrmScene,
    } = await this.loadVRM(vrmUrl);
    const geometry = skinnedMesh.geometry;

    vrmScene.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(vrmScene);
    const avatarHeight = bbox.max.y - bbox.min.y;

    onProgress?.({
      stage: "loading",
      progress: 1,
      message: `VRM loaded. ${geometry.attributes.position.count} vertices, height ${avatarHeight.toFixed(3)}m`,
    });

    // Extract body regions by bone weight
    onProgress?.({
      stage: "regions",
      progress: 0,
      message: "Extracting body regions by bone weight...",
    });

    const boneNameToIndex = this.buildBoneNameMap(skeleton, vrm);

    const regions = this.extractExclusiveRegions(
      geometry,
      boneNameToIndex,
      slots,
    );

    for (const slot of slots) {
      const region = regions.get(slot)!;
      onProgress?.({
        stage: "regions",
        slotName: slot,
        progress: 1,
        message: `Region "${slot}": ${region.vertexIndices.length} verts, ${region.triangleIndices.length / 3} tris`,
      });
    }

    // Generate offset shells (createShell handles curvature clamp + constrained smooth)
    const shells = new Map<string, ShellMesh>();
    const totalShells = slots.length * bulkClasses.length;
    let shellIndex = 0;

    for (const slot of slots) {
      const region = regions.get(slot)!;
      for (const bulk of bulkClasses) {
        const key = `${slot}_${bulk}`;

        onProgress?.({
          stage: "offsetting",
          slotName: slot,
          bulkClass: bulk,
          progress: shellIndex / totalShells,
          message: `Shell: ${slot}/${bulk} (${BULK_OFFSETS[bulk] * 1000}mm)...`,
        });

        const shell = this.createShell(geometry, skeleton, region, slot, bulk);
        shells.set(key, shell);
        shellIndex++;
      }
    }

    onProgress?.({
      stage: "complete",
      progress: 1,
      message: `Done. ${shells.size} shells across ${slots.length} slots.`,
    });

    return {
      regions,
      shells,
      avatarSkeleton: skeleton,
      avatarHeight,
      skinnedMesh,
      vrmScene,
      vrm,
    };
  }

  /**
   * Load VRM and find the primary SkinnedMesh.
   */
  async loadVRM(url: string): Promise<{
    skinnedMesh: THREE.SkinnedMesh;
    skeleton: THREE.Skeleton;
    vrm: Record<string, unknown>;
    scene: THREE.Scene;
  }> {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          const vrm = gltf.userData.vrm;
          if (!vrm) {
            reject(new Error("Not a valid VRM file — no VRM data found"));
            return;
          }

          // Handle VRM 0.0 rotation synchronously (VRMUtils is statically imported)
          const meta = (vrm as Record<string, Record<string, string>>).meta;
          const vrmVersion =
            meta?.metaVersion ||
            (meta?.specVersion?.startsWith("0.") ? "0" : "1");
          if (vrmVersion === "0") {
            VRMUtils.rotateVRM0(vrm);
          }

          const vrmScene = (vrm as Record<string, THREE.Scene>).scene;
          const sceneToUse = vrmScene || gltf.scene;

          // Find the primary SkinnedMesh (usually "Body" or the largest one)
          let primaryMesh: THREE.SkinnedMesh | null = null;
          let maxVertices = 0;

          sceneToUse.traverse((child) => {
            if (child instanceof THREE.SkinnedMesh) {
              const count = child.geometry.attributes.position?.count ?? 0;
              if (count > maxVertices) {
                maxVertices = count;
                primaryMesh = child;
              }
            }
          });

          if (!primaryMesh) {
            reject(new Error("No SkinnedMesh found in VRM"));
            return;
          }

          sceneToUse.updateMatrixWorld(true);

          const mesh = primaryMesh as THREE.SkinnedMesh;
          resolve({
            skinnedMesh: mesh,
            skeleton: mesh.skeleton,
            vrm: vrm as Record<string, unknown>,
            scene: sceneToUse as THREE.Scene,
          });
        },
        undefined,
        (error) => reject(error),
      );
    });
  }

  /**
   * Build a map from VRM humanoid bone names to skeleton bone indices.
   *
   * Tries multiple bone sources (public API, raw, normalized) and picks
   * whichever maps the most bones. This is critical because normalized
   * bone nodes are often different objects from skeleton bones, causing
   * indexOf() to silently fail for limb bones.
   */
  private buildBoneNameMap(
    skeleton: THREE.Skeleton,
    vrm: Record<string, unknown>,
  ): Map<string, number> {
    const allBoneNames = [
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
    ];

    const humanoid = (vrm as Record<string, Record<string, unknown>>).humanoid;
    if (humanoid) {
      // Collect all possible bone dictionaries to try
      const boneSources: Record<string, unknown>[] = [];

      // 1. Public humanBones property (returns raw bones — most reliable)
      const publicBones = (humanoid as Record<string, unknown>).humanBones;
      if (publicBones && typeof publicBones === "object") {
        boneSources.push(publicBones as Record<string, unknown>);
      }

      // 2. Raw human bones (internal, should match skeleton)
      const rawSrc = (humanoid as Record<string, Record<string, unknown>>)
        ._rawHumanBones;
      if (rawSrc?.humanBones && typeof rawSrc.humanBones === "object") {
        boneSources.push(rawSrc.humanBones as Record<string, unknown>);
      }

      // 3. Normalized human bones (internal, may NOT match skeleton)
      const normSrc = (humanoid as Record<string, Record<string, unknown>>)
        ._normalizedHumanBones;
      if (normSrc?.humanBones && typeof normSrc.humanBones === "object") {
        boneSources.push(normSrc.humanBones as Record<string, unknown>);
      }

      // Try each source, keep whichever maps the most bones
      let bestMap = new Map<string, number>();

      for (const source of boneSources) {
        const candidate = new Map<string, number>();
        for (const boneName of allBoneNames) {
          const boneData = source[boneName] as
            | Record<string, unknown>
            | undefined;
          const node = boneData?.node as THREE.Object3D | undefined;
          if (node) {
            const idx = skeleton.bones.indexOf(node as THREE.Bone);
            if (idx >= 0) {
              candidate.set(boneName, idx);
            }
          }
        }
        if (candidate.size > bestMap.size) {
          bestMap = candidate;
        }
      }

      if (bestMap.size > 0) {
        return bestMap;
      }
    }

    // Fallback: match skeleton bone names by string
    const map = new Map<string, number>();
    for (const vrmName of allBoneNames) {
      const lowerName = vrmName.toLowerCase();
      const idx = skeleton.bones.findIndex(
        (b) =>
          b.name.toLowerCase() === lowerName ||
          b.name.toLowerCase().includes(lowerName),
      );
      if (idx >= 0) {
        map.set(vrmName, idx);
      }
    }

    return map;
  }

  /**
   * Extract exclusive body regions — each vertex belongs to exactly one slot
   * (whichever has the highest bone weight). This eliminates overlap at
   * boundaries, producing clean color transitions instead of Z-fighting mix.
   *
   * Triangles are assigned by majority vote (2-of-3 vertices), so boundary
   * triangles go to the dominant side rather than being duplicated or dropped.
   */
  private extractExclusiveRegions(
    geometry: THREE.BufferGeometry,
    boneNameToIndex: Map<string, number>,
    slots: EquipmentSlotName[],
  ): Map<EquipmentSlotName, BodyRegion> {
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const skinIndex = geometry.attributes.skinIndex as THREE.BufferAttribute;
    const skinWeight = geometry.attributes.skinWeight as THREE.BufferAttribute;
    const index = geometry.index;

    // Pre-compute bone sets + partial caps for each slot
    const slotConfigs = new Map<
      EquipmentSlotName,
      {
        bones: Set<number>;
        partialCaps: Map<number, number>;
      }
    >();

    for (const slot of slots) {
      const bones = new Set<number>();
      const partialCaps = new Map<number, number>();

      for (const boneName of SLOT_BONE_MAP[slot]) {
        const idx = boneNameToIndex.get(boneName);
        if (idx !== undefined) bones.add(idx);
      }

      const partials = SLOT_PARTIAL_BONES[slot];
      if (partials) {
        for (const { boneName, maxWeight } of partials) {
          const idx = boneNameToIndex.get(boneName);
          if (idx !== undefined) {
            bones.add(idx);
            partialCaps.set(idx, maxWeight);
          }
        }
      }

      slotConfigs.set(slot, { bones, partialCaps });
    }

    // For each vertex, compute weight per slot and assign to the highest
    const vertexSlot = new Array<EquipmentSlotName | null>(position.count).fill(
      null,
    );
    const MIN_WEIGHT = 0.15; // minimum total weight to be assigned at all

    for (let i = 0; i < position.count; i++) {
      let bestSlot: EquipmentSlotName | null = null;
      let bestWeight = MIN_WEIGHT;

      for (const slot of slots) {
        const { bones, partialCaps } = slotConfigs.get(slot)!;
        let totalWeight = 0;

        for (let j = 0; j < 4; j++) {
          const boneIdx = skinIndex.getComponent(i, j);
          const weight = skinWeight.getComponent(i, j);

          if (bones.has(boneIdx)) {
            const cap = partialCaps.get(boneIdx);
            totalWeight += cap !== undefined ? Math.min(weight, cap) : weight;
          }
        }

        if (totalWeight > bestWeight) {
          bestWeight = totalWeight;
          bestSlot = slot;
        }
      }

      vertexSlot[i] = bestSlot;
    }

    // Build per-slot vertex and triangle lists
    const slotVertexSets = new Map<EquipmentSlotName, Set<number>>();
    const slotTriangles = new Map<EquipmentSlotName, number[]>();

    for (const slot of slots) {
      slotVertexSets.set(slot, new Set());
      slotTriangles.set(slot, []);
    }

    // Assign triangles by majority vote (2-of-3 vertices)
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i);
        const b = index.getX(i + 1);
        const c = index.getX(i + 2);

        const sa = vertexSlot[a];
        const sb = vertexSlot[b];
        const sc = vertexSlot[c];

        // Find majority slot
        let triSlot: EquipmentSlotName | null = null;
        if (sa && sa === sb) triSlot = sa;
        else if (sa && sa === sc) triSlot = sa;
        else if (sb && sb === sc) triSlot = sb;
        else if (sa)
          triSlot = sa; // no majority — use first assigned vertex
        else if (sb) triSlot = sb;
        else if (sc) triSlot = sc;

        if (triSlot) {
          slotTriangles.get(triSlot)!.push(a, b, c);
          slotVertexSets.get(triSlot)!.add(a);
          slotVertexSets.get(triSlot)!.add(b);
          slotVertexSets.get(triSlot)!.add(c);
        }
      }
    }

    // Build BodyRegion for each slot
    const regions = new Map<EquipmentSlotName, BodyRegion>();
    const tempVec = new THREE.Vector3();

    for (const slot of slots) {
      const vertexSet = slotVertexSets.get(slot)!;
      const triangleIndices = slotTriangles.get(slot)!;
      const vertexIndices = Array.from(vertexSet);

      const boundingBox = new THREE.Box3();
      const center = new THREE.Vector3();

      for (const vi of vertexIndices) {
        tempVec.fromBufferAttribute(position, vi);
        boundingBox.expandByPoint(tempVec);
        center.add(tempVec);
      }

      if (vertexIndices.length > 0) {
        center.divideScalar(vertexIndices.length);
      }

      // Collect bone indices for this slot
      const boneIndices = new Set<number>();
      const { bones } = slotConfigs.get(slot)!;
      for (const boneIdx of bones) boneIndices.add(boneIdx);

      regions.set(slot, {
        slotName: slot,
        vertexIndices,
        triangleIndices,
        boundingBox,
        center,
        boneIndices,
      });
    }

    return regions;
  }

  // ─── Geometry helpers ────────────────────────────────────────────────

  /**
   * Build adjacency list from index buffer using Set-based dedup (O(1) per edge).
   */
  private buildAdjacency(vertCount: number, indices: Uint32Array): number[][] {
    const adjSets: Set<number>[] = new Array(vertCount);
    for (let i = 0; i < vertCount; i++) adjSets[i] = new Set();

    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i],
        b = indices[i + 1],
        c = indices[i + 2];
      adjSets[a].add(b);
      adjSets[a].add(c);
      adjSets[b].add(a);
      adjSets[b].add(c);
      adjSets[c].add(a);
      adjSets[c].add(b);
    }

    const adj: number[][] = new Array(vertCount);
    for (let i = 0; i < vertCount; i++) adj[i] = Array.from(adjSets[i]);
    return adj;
  }

  /**
   * Estimate per-vertex mean curvature using discrete Laplacian.
   *
   * L(v) = (1/|N|) * sum(n_i - v) for neighbors n_i
   * |L(v)| approximates 2 * mean_curvature
   *
   * High curvature at concavities (armpits, groin) signals where offset
   * must be clamped to prevent self-intersection.
   */
  private estimateCurvature(
    srcPosition: THREE.BufferAttribute,
    sortedVertices: number[],
    adjacency: number[][],
  ): Float32Array {
    const count = sortedVertices.length;
    const curvatures = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const neighbors = adjacency[i];
      if (neighbors.length === 0) continue;

      const oldIdx = sortedVertices[i];
      const px = srcPosition.getX(oldIdx);
      const py = srcPosition.getY(oldIdx);
      const pz = srcPosition.getZ(oldIdx);

      let lx = 0,
        ly = 0,
        lz = 0;
      for (const n of neighbors) {
        const nOldIdx = sortedVertices[n];
        lx += srcPosition.getX(nOldIdx) - px;
        ly += srcPosition.getY(nOldIdx) - py;
        lz += srcPosition.getZ(nOldIdx) - pz;
      }
      lx /= neighbors.length;
      ly /= neighbors.length;
      lz /= neighbors.length;

      curvatures[i] = Math.sqrt(lx * lx + ly * ly + lz * lz) * 2;
    }

    return curvatures;
  }

  /**
   * Find groups of coincident vertices — vertices at the same position that were
   * split by GLTF at UV seams or sharp edges. Each group member has a different
   * normal, so when offset along normals they diverge → visible cracks.
   *
   * Returns array of groups (each group is array of NEW vertex indices).
   * Only groups with 2+ members are returned.
   */
  private findCoincidentGroups(
    srcPosition: THREE.BufferAttribute,
    sortedVertices: number[],
  ): number[][] {
    const PRECISION = 10000; // 0.1mm quantization
    const posMap = new Map<string, number[]>();

    for (let i = 0; i < sortedVertices.length; i++) {
      const oldIdx = sortedVertices[i];
      const x = Math.round(srcPosition.getX(oldIdx) * PRECISION);
      const y = Math.round(srcPosition.getY(oldIdx) * PRECISION);
      const z = Math.round(srcPosition.getZ(oldIdx) * PRECISION);
      const key = `${x},${y},${z}`;

      let group = posMap.get(key);
      if (!group) {
        group = [];
        posMap.set(key, group);
      }
      group.push(i);
    }

    return Array.from(posMap.values()).filter((g) => g.length > 1);
  }

  /**
   * Average normals within each coincident group so all split vertices
   * at a UV seam offset in the same direction. This prevents them from
   * diverging and creating visible cracks.
   */
  private averageCoincidentNormals(
    normals: Float32Array,
    groups: number[][],
  ): void {
    for (const group of groups) {
      // Compute average normal for this group
      let ax = 0,
        ay = 0,
        az = 0;
      for (const vi of group) {
        ax += normals[vi * 3];
        ay += normals[vi * 3 + 1];
        az += normals[vi * 3 + 2];
      }
      // Normalize
      const len = Math.sqrt(ax * ax + ay * ay + az * az);
      if (len < 1e-8) continue;
      ax /= len;
      ay /= len;
      az /= len;

      // Assign averaged normal to all group members
      for (const vi of group) {
        normals[vi * 3] = ax;
        normals[vi * 3 + 1] = ay;
        normals[vi * 3 + 2] = az;
      }
    }
  }

  /**
   * Enforce position coherence for coincident vertex groups.
   * Snaps all members of each group to their average position.
   * Must be called after each smooth iteration to prevent divergence.
   */
  private enforceCoincidentPositions(
    posArray: Float32Array,
    groups: number[][],
  ): void {
    for (const group of groups) {
      let ax = 0,
        ay = 0,
        az = 0;
      for (const vi of group) {
        ax += posArray[vi * 3];
        ay += posArray[vi * 3 + 1];
        az += posArray[vi * 3 + 2];
      }
      ax /= group.length;
      ay /= group.length;
      az /= group.length;

      for (const vi of group) {
        posArray[vi * 3] = ax;
        posArray[vi * 3 + 1] = ay;
        posArray[vi * 3 + 2] = az;
      }
    }
  }

  /**
   * Find boundary vertices — vertices on edges that belong to only one triangle.
   * These are at the open edges of the shell where it meets adjacent slots.
   */
  private findBoundaryVertices(indices: Uint32Array): Set<number> {
    const edgeCount = new Map<number, number>();

    // Encode edge as a single number: min * maxVerts + max
    // This avoids string allocation for edge keys
    const MAX_V = 100000;

    for (let i = 0; i < indices.length; i += 3) {
      const tri = [indices[i], indices[i + 1], indices[i + 2]];
      for (let j = 0; j < 3; j++) {
        const a = tri[j],
          b = tri[(j + 1) % 3];
        const key = Math.min(a, b) * MAX_V + Math.max(a, b);
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      }
    }

    const boundary = new Set<number>();
    for (const [key, count] of edgeCount) {
      if (count === 1) {
        boundary.add(Math.floor(key / MAX_V));
        boundary.add(key % MAX_V);
      }
    }

    return boundary;
  }

  /**
   * BFS from boundary vertices to compute per-vertex ring distance.
   * Returns a taper multiplier: 0.5 at boundary, ramping to 1.0 over maxRings edges inward.
   */
  private computeBoundaryTaper(
    vertCount: number,
    adjacency: number[][],
    boundaryVerts: Set<number>,
    maxRings: number = 3,
  ): Float32Array {
    const taper = new Float32Array(vertCount);

    // BFS from all boundary vertices simultaneously
    const queue: number[] = [];
    const ringOf: number[] = new Array(vertCount).fill(maxRings);

    for (const v of boundaryVerts) {
      ringOf[v] = 0;
      queue.push(v);
    }

    let head = 0;
    while (head < queue.length) {
      const v = queue[head++];
      const ring = ringOf[v];
      if (ring >= maxRings) continue;

      for (const n of adjacency[v]) {
        if (ringOf[n] > ring + 1) {
          ringOf[n] = ring + 1;
          queue.push(n);
        }
      }
    }

    // Convert ring distance to smooth taper: 0.5 at boundary → 1.0 at maxRings
    for (let i = 0; i < vertCount; i++) {
      const r = Math.min(ringOf[i], maxRings);
      taper[i] = 0.5 + 0.5 * (r / maxRings); // linear: 0.5 → 1.0
    }

    return taper;
  }

  /**
   * Smooth a Float32Array by averaging each value with its neighbors.
   * Prevents sharp transitions in offset or curvature values.
   */
  private smoothFloatArray(
    values: Float32Array,
    adjacency: number[][],
    passes: number = 2,
  ): void {
    const temp = new Float32Array(values.length);
    for (let pass = 0; pass < passes; pass++) {
      temp.set(values);
      for (let i = 0; i < values.length; i++) {
        const neighbors = adjacency[i];
        if (neighbors.length === 0) continue;
        let sum = temp[i]; // include self
        for (const n of neighbors) sum += temp[n];
        values[i] = sum / (neighbors.length + 1);
      }
    }
  }

  // ─── Shell generation ────────────────────────────────────────────────

  /**
   * Create a shell mesh with curvature-adaptive offset, boundary tapering,
   * and body-constrained Laplacian smooth.
   */
  private createShell(
    sourceGeometry: THREE.BufferGeometry,
    skeleton: THREE.Skeleton,
    region: BodyRegion,
    slotName: EquipmentSlotName,
    bulkClass: BulkClass,
  ): ShellMesh {
    const srcPosition = sourceGeometry.attributes
      .position as THREE.BufferAttribute;
    const srcNormal = sourceGeometry.attributes.normal as THREE.BufferAttribute;
    const srcSkinIndex = sourceGeometry.attributes
      .skinIndex as THREE.BufferAttribute;
    const srcSkinWeight = sourceGeometry.attributes
      .skinWeight as THREE.BufferAttribute;
    const srcUV = sourceGeometry.attributes.uv as
      | THREE.BufferAttribute
      | undefined;

    const baseOffset = BULK_OFFSETS[bulkClass];

    // Build vertex mapping (old source index → new shell index)
    const usedVertices = new Set<number>();
    for (const idx of region.triangleIndices) usedVertices.add(idx);
    const sortedVertices = Array.from(usedVertices).sort((a, b) => a - b);
    const oldToNew = new Map<number, number>();
    sortedVertices.forEach((v, i) => oldToNew.set(v, i));
    const vertCount = sortedVertices.length;

    // Build remapped index buffer first (needed for adjacency + curvature)
    const triCount = region.triangleIndices.length;
    const indices = new Uint32Array(triCount);
    for (let i = 0; i < triCount; i++) {
      indices[i] = oldToNew.get(region.triangleIndices[i])!;
    }

    // Find coincident vertex groups (GLTF splits at UV seams/sharp edges)
    const coincidentGroups = this.findCoincidentGroups(
      srcPosition,
      sortedVertices,
    );

    // Pre-compute topology analysis
    const adjacency = this.buildAdjacency(vertCount, indices);
    const curvatures = this.estimateCurvature(
      srcPosition,
      sortedVertices,
      adjacency,
    );
    const boundaryVerts = this.findBoundaryVertices(indices);

    // Smooth curvature estimates to reduce noise (1 pass)
    this.smoothFloatArray(curvatures, adjacency, 1);

    // Compute multi-ring boundary taper (gradual falloff: 0.5 → 1.0 over 3 rings)
    const boundaryTaper = this.computeBoundaryTaper(
      vertCount,
      adjacency,
      boundaryVerts,
      3,
    );

    // Allocate output arrays
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const bodyPositions = new Float32Array(vertCount * 3);
    const bodyNormals = new Float32Array(vertCount * 3);
    const effectiveOffsets = new Float32Array(vertCount);
    const skinIndices = new Float32Array(vertCount * 4);
    const skinWeights = new Float32Array(vertCount * 4);
    const uvs = srcUV ? new Float32Array(vertCount * 2) : null;

    // Minimum offset floor: curvature clamping can never reduce below 50% of base
    const minOffsetFloor = baseOffset * 0.5;

    for (let i = 0; i < vertCount; i++) {
      const oldIdx = sortedVertices[i];

      const px = srcPosition.getX(oldIdx);
      const py = srcPosition.getY(oldIdx);
      const pz = srcPosition.getZ(oldIdx);
      const nx = srcNormal.getX(oldIdx);
      const ny = srcNormal.getY(oldIdx);
      const nz = srcNormal.getZ(oldIdx);

      // Store body surface reference (for constrained smooth)
      bodyPositions[i * 3] = px;
      bodyPositions[i * 3 + 1] = py;
      bodyPositions[i * 3 + 2] = pz;
      bodyNormals[i * 3] = nx;
      bodyNormals[i * 3 + 1] = ny;
      bodyNormals[i * 3 + 2] = nz;

      // Curvature-adaptive offset with floor
      const kappa = curvatures[i];
      const maxSafe = kappa > 0.01 ? 0.5 / kappa : baseOffset * 100;
      let eff = Math.max(minOffsetFloor, Math.min(baseOffset, maxSafe));

      // Apply multi-ring boundary taper (gradual falloff at shell edges)
      eff *= boundaryTaper[i];

      effectiveOffsets[i] = eff;

      // Copy normals from body (NOT recomputed — partial mesh normals are wrong at boundaries)
      normals[i * 3] = nx;
      normals[i * 3 + 1] = ny;
      normals[i * 3 + 2] = nz;

      // Copy skin data (inherits rigging from body)
      for (let j = 0; j < 4; j++) {
        skinIndices[i * 4 + j] = srcSkinIndex.getComponent(oldIdx, j);
        skinWeights[i * 4 + j] = srcSkinWeight.getComponent(oldIdx, j);
      }

      // Copy UVs
      if (srcUV && uvs) {
        uvs[i * 2] = srcUV.getX(oldIdx);
        uvs[i * 2 + 1] = srcUV.getY(oldIdx);
      }
    }

    // Average normals for coincident vertex groups so UV-seam-split vertices
    // offset in the same direction (prevents cracks/fractures at seams)
    this.averageCoincidentNormals(normals, coincidentGroups);

    // Also average the body normals used for constrained smooth enforcement
    this.averageCoincidentNormals(bodyNormals, coincidentGroups);

    // Smooth effective offsets to prevent sharp transitions between clamped/unclamped vertices
    this.smoothFloatArray(effectiveOffsets, adjacency, 2);

    // Now apply offsets to positions (after smoothing offsets for uniformity)
    for (let i = 0; i < vertCount; i++) {
      const eff = effectiveOffsets[i];
      positions[i * 3] = bodyPositions[i * 3] + normals[i * 3] * eff;
      positions[i * 3 + 1] =
        bodyPositions[i * 3 + 1] + normals[i * 3 + 1] * eff;
      positions[i * 3 + 2] =
        bodyPositions[i * 3 + 2] + normals[i * 3 + 2] * eff;
    }

    // Enforce position coherence for coincident groups after initial offset
    this.enforceCoincidentPositions(positions, coincidentGroups);

    // Build BufferGeometry
    const shellGeometry = new THREE.BufferGeometry();
    shellGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    shellGeometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    shellGeometry.setAttribute(
      "skinIndex",
      new THREE.BufferAttribute(new Uint16Array(skinIndices), 4),
    );
    shellGeometry.setAttribute(
      "skinWeight",
      new THREE.BufferAttribute(skinWeights, 4),
    );
    if (uvs) {
      shellGeometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    }
    shellGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

    // Body-constrained Laplacian smooth (with coincident position enforcement)
    const { iterations, factor } = SMOOTH_PARAMS[bulkClass];
    this.constrainedSmooth(
      shellGeometry,
      bodyPositions,
      bodyNormals,
      effectiveOffsets,
      adjacency,
      boundaryTaper,
      coincidentGroups,
      iterations,
      factor,
    );

    // Keep body normals — do NOT call computeVertexNormals() on partial mesh
    // (partial mesh normals are wrong at boundaries where adjacent slot faces are missing)
    shellGeometry.computeBoundingBox();

    return {
      slotName,
      bulkClass,
      geometry: shellGeometry,
      skeleton,
      boundingBox: shellGeometry.boundingBox ?? new THREE.Box3(),
      vertexCount: vertCount,
      triangleCount: triCount / 3,
    };
  }

  /**
   * Body-constrained Laplacian smooth.
   *
   * Each iteration:
   *   1. Lerp each vertex toward neighbor average (factor scaled by boundary taper)
   *   2. Enforce minimum distance from body surface along normal direction
   *
   * Near-boundary vertices get reduced smooth factor (not pinned), creating
   * a gradual transition instead of an abrupt step at shell edges.
   * Jacobi-style: reads from old positions, writes to new.
   */
  private constrainedSmooth(
    geometry: THREE.BufferGeometry,
    bodyPositions: Float32Array,
    bodyNormals: Float32Array,
    effectiveOffsets: Float32Array,
    adjacency: number[][],
    boundaryTaper: Float32Array,
    coincidentGroups: number[][],
    iterations: number,
    factor: number,
  ): void {
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const count = position.count;
    const posArray = position.array as Float32Array;
    const oldPositions = new Float32Array(count * 3);

    for (let iter = 0; iter < iterations; iter++) {
      oldPositions.set(posArray);

      for (let i = 0; i < count; i++) {
        const neighbors = adjacency[i];
        if (neighbors.length === 0) continue;

        // Scale smooth factor by boundary taper (0.5 at edge → 1.0 interior)
        // This gives boundary verts minimal smoothing while interior gets full
        const localFactor = factor * boundaryTaper[i];

        // Step 1: Laplacian smooth — lerp toward neighbor average
        let avgX = 0,
          avgY = 0,
          avgZ = 0;
        for (const n of neighbors) {
          avgX += oldPositions[n * 3];
          avgY += oldPositions[n * 3 + 1];
          avgZ += oldPositions[n * 3 + 2];
        }
        avgX /= neighbors.length;
        avgY /= neighbors.length;
        avgZ /= neighbors.length;

        let newX =
          oldPositions[i * 3] + (avgX - oldPositions[i * 3]) * localFactor;
        let newY =
          oldPositions[i * 3 + 1] +
          (avgY - oldPositions[i * 3 + 1]) * localFactor;
        let newZ =
          oldPositions[i * 3 + 2] +
          (avgZ - oldPositions[i * 3 + 2]) * localFactor;

        // Step 2: Enforce minimum distance from body surface
        const bx = bodyPositions[i * 3];
        const by = bodyPositions[i * 3 + 1];
        const bz = bodyPositions[i * 3 + 2];
        const nx = bodyNormals[i * 3];
        const ny = bodyNormals[i * 3 + 1];
        const nz = bodyNormals[i * 3 + 2];
        const minOffset = effectiveOffsets[i];

        const dx = newX - bx;
        const dy = newY - by;
        const dz = newZ - bz;
        const normalDist = dx * nx + dy * ny + dz * nz;

        if (normalDist < minOffset) {
          const correction = minOffset - normalDist;
          newX += nx * correction;
          newY += ny * correction;
          newZ += nz * correction;
        }

        posArray[i * 3] = newX;
        posArray[i * 3 + 1] = newY;
        posArray[i * 3 + 2] = newZ;
      }

      // Step 3: Snap coincident vertex groups to average position
      // Prevents UV-seam-split vertices from diverging during smooth
      this.enforceCoincidentPositions(posArray, coincidentGroups);
    }

    position.needsUpdate = true;
  }

  /**
   * Export a shell as a standalone GLB file.
   */
  async exportShellAsGLB(shell: ShellMesh): Promise<Blob> {
    const { GLTFExporter } =
      await import("three/addons/exporters/GLTFExporter.js");

    const exporter = new GLTFExporter();

    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.7,
      metalness: 0.1,
    });

    // Export as plain Mesh (not SkinnedMesh) — retexture APIs only need
    // static geometry + UVs, and skinned meshes can cause failures.
    const geo = shell.geometry.clone();
    geo.deleteAttribute("skinIndex");
    geo.deleteAttribute("skinWeight");
    const mesh = new THREE.Mesh(geo, material);

    return new Promise((resolve, reject) => {
      exporter.parse(
        mesh,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(new Blob([result], { type: "model/gltf-binary" }));
          } else {
            resolve(
              new Blob([JSON.stringify(result)], { type: "model/gltf+json" }),
            );
          }
        },
        reject,
        { binary: true },
      );
    });
  }
}
