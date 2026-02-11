import {
  BufferGeometry,
  BufferAttribute,
  Vector3,
  Mesh,
  Box3,
  Matrix4,
  Matrix3,
} from "three";
import { MeshBVH } from "three-mesh-bvh";

export interface SmartFittingParameters {
  /** Distance to maintain above body surface (meters, world space) */
  offset: number;
  /** How strongly the armor conforms to body shape (0-1) */
  conformStrength: number;
  /** Smoothing intensity for displacement vectors (0-1) */
  smoothingStrength: number;
  /** Number of Laplacian smoothing passes on deltas */
  smoothingPasses: number;
  /** How much to reduce corrections near boundary edges (0-1) */
  boundaryFalloff: number;
  /** Progress callback */
  onProgress?: (progress: number, message?: string) => void;
}

const DEFAULT_PARAMS: SmartFittingParameters = {
  offset: 0.04,
  conformStrength: 0.85,
  smoothingStrength: 0.5,
  smoothingPasses: 6,
  boundaryFalloff: 0.8,
};

/**
 * Blender-style shrinkwrap fitting service.
 *
 * Algorithm (mirrors Blender's "Nearest Surface Point" + "Above Surface" snap):
 *   1. For each armor vertex, find the closest point on the body surface (BVH)
 *   2. Compute a smooth interpolated normal at that point (barycentric interpolation
 *      of the body mesh's vertex normals — continuous across triangle edges)
 *   3. Place the vertex at: closestPoint + smoothNormal * offset
 *   4. Laplacian smooth the displacement deltas (not positions — preserves detail)
 *   5. Apply deltas, enforce UV seam coincidence, push-out safety net
 *
 * One pass. No iterations. ~300 lines instead of ~1100.
 */
export class SinglePassFittingService {
  // Reusable temp vectors
  private _v0 = new Vector3();
  private _v1 = new Vector3();
  private _v2 = new Vector3();
  private _n0 = new Vector3();
  private _n1 = new Vector3();
  private _n2 = new Vector3();
  private _vertex = new Vector3();
  private _bodyLocal = new Vector3();
  private _closestWorld = new Vector3();
  private _smoothNormal = new Vector3();
  private _targetPos = new Vector3();
  private _delta = new Vector3();
  private _edge1 = new Vector3();
  private _edge2 = new Vector3();
  private _faceNormal = new Vector3();

  // ── Main fitting algorithm ───────────────────────────────────────────

  async fitArmor(
    armorMesh: Mesh,
    bodyMesh: Mesh,
    params: Partial<SmartFittingParameters> = {},
  ): Promise<void> {
    const p = { ...DEFAULT_PARAMS, ...params };
    const onProgress = p.onProgress;

    onProgress?.(0, "Preparing...");

    const armorGeo = armorMesh.geometry as BufferGeometry;
    const bodyGeo = bodyMesh.geometry as BufferGeometry;
    const position = armorGeo.attributes.position as BufferAttribute;
    const vertexCount = position.count;
    if (vertexCount === 0) return;

    const originalPositions = new Float32Array(position.array);

    // ── Phase 1: Preparation ──────────────────────────────────────────

    onProgress?.(5, "Building BVH...");
    armorMesh.updateMatrixWorld(true);
    bodyMesh.updateMatrixWorld(true);

    if (!bodyGeo.attributes.normal) bodyGeo.computeVertexNormals();
    if (!armorGeo.attributes.normal) armorGeo.computeVertexNormals();

    const bodyBVH = this.buildBVH(bodyGeo);

    const armorWorldMatrix = armorMesh.matrixWorld;
    const inverseArmorMatrix = armorWorldMatrix.clone().invert();
    const bodyWorldMatrix = bodyMesh.matrixWorld;
    const inverseBodyMatrix = bodyWorldMatrix.clone().invert();
    const invArmorRotScale = inverseArmorMatrix.clone().setPosition(0, 0, 0);

    const bodyPosAttr = bodyGeo.attributes.position as BufferAttribute;
    const bodyNormalAttr = bodyGeo.attributes.normal as BufferAttribute;
    const bodyIndexAttr = bodyGeo.index!;

    onProgress?.(10, "Building topology...");

    const neighborMap = this.buildNeighborMap(armorGeo);
    const coincidentGroups = this.buildCoincidentGroups(position, vertexCount);
    this.mergeCoincidentNeighbors(neighborMap, coincidentGroups);
    const boundaryVertices = this.detectBoundaryVertices(armorGeo);

    // BFS distance from boundary (for falloff near open edges)
    const distToBoundary = new Uint16Array(vertexCount);
    distToBoundary.fill(65535);
    const bfsQueue: number[] = [];
    for (const bv of boundaryVertices) {
      distToBoundary[bv] = 0;
      bfsQueue.push(bv);
    }
    let bfsHead = 0;
    while (bfsHead < bfsQueue.length) {
      const vi = bfsQueue[bfsHead++];
      const d = distToBoundary[vi];
      if (d >= 10) continue;
      const neighbors = neighborMap.get(vi);
      if (!neighbors) continue;
      for (const ni of neighbors) {
        if (d + 1 < distToBoundary[ni]) {
          distToBoundary[ni] = d + 1;
          bfsQueue.push(ni);
        }
      }
    }

    // Reference sizing
    const armorWorldBounds = new Box3()
      .setFromBufferAttribute(position)
      .applyMatrix4(armorWorldMatrix);
    const armorWorldSize = armorWorldBounds.getSize(new Vector3());
    const bodyRef = Math.min(armorWorldSize.x, armorWorldSize.z);
    const effectiveOffset = Math.max(p.offset, bodyRef * 0.015);
    const maxPush = bodyRef * 0.5;
    const boundaryRadius = Math.max(1, 4 * p.boundaryFalloff);

    console.log(
      "Shrinkwrap fitting — bodyRef:",
      bodyRef.toFixed(4),
      "offset:",
      effectiveOffset.toFixed(4),
    );

    const bvhResult = { point: new Vector3(), distance: 0, faceIndex: 0 };

    // ── Phase 2: Project each vertex to body surface + offset ─────────

    onProgress?.(20, "Projecting to body surface...");

    const deltaX = new Float32Array(vertexCount);
    const deltaY = new Float32Array(vertexCount);
    const deltaZ = new Float32Array(vertexCount);
    let projectedCount = 0;

    for (let i = 0; i < vertexCount; i++) {
      if (boundaryVertices.has(i)) continue;

      // Armor vertex → world space
      this._vertex.set(position.getX(i), position.getY(i), position.getZ(i));
      this._vertex.applyMatrix4(armorWorldMatrix);

      // Transform to body-local for BVH query
      this._bodyLocal.copy(this._vertex).applyMatrix4(inverseBodyMatrix);

      // Find closest point on body surface
      bvhResult.point.set(0, 0, 0);
      bvhResult.distance = 0;
      bvhResult.faceIndex = 0;
      const cpHit = bodyBVH.closestPointToPoint(this._bodyLocal, bvhResult);
      if (!cpHit) continue;

      // Get triangle vertex indices
      const fi = cpHit.faceIndex;
      const i0 = bodyIndexAttr.getX(fi * 3);
      const i1 = bodyIndexAttr.getX(fi * 3 + 1);
      const i2 = bodyIndexAttr.getX(fi * 3 + 2);

      // Triangle vertices in body-local space
      this._v0.fromBufferAttribute(bodyPosAttr, i0);
      this._v1.fromBufferAttribute(bodyPosAttr, i1);
      this._v2.fromBufferAttribute(bodyPosAttr, i2);

      // Barycentric coordinates of hit point within the triangle
      const [w0, w1, w2] = this.computeBarycentric(
        cpHit.point,
        this._v0,
        this._v1,
        this._v2,
      );

      // Interpolate smooth vertex normals (continuous across triangle edges)
      this._n0.fromBufferAttribute(bodyNormalAttr, i0);
      this._n1.fromBufferAttribute(bodyNormalAttr, i1);
      this._n2.fromBufferAttribute(bodyNormalAttr, i2);

      this._smoothNormal
        .set(0, 0, 0)
        .addScaledVector(this._n0, w0)
        .addScaledVector(this._n1, w1)
        .addScaledVector(this._n2, w2);

      // Transform to world space and normalize
      this._smoothNormal.transformDirection(bodyWorldMatrix);
      const normalLen = this._smoothNormal.length();
      if (normalLen < 1e-8) continue;
      this._smoothNormal.divideScalar(normalLen);

      // Target = closest point (world) + smooth normal * offset
      this._closestWorld.copy(cpHit.point).applyMatrix4(bodyWorldMatrix);
      this._targetPos
        .copy(this._closestWorld)
        .addScaledVector(this._smoothNormal, effectiveOffset);

      // Delta = target - current (world space)
      this._delta.subVectors(this._targetPos, this._vertex);

      // Transform delta to armor-local space (rotation+scale only)
      this._delta.applyMatrix4(invArmorRotScale);

      // Boundary falloff + conform strength
      let strength = p.conformStrength;
      const bDist = distToBoundary[i];
      if (bDist < boundaryRadius) {
        const t = bDist / boundaryRadius;
        strength *= t * t * (3 - 2 * t);
      }

      deltaX[i] = this._delta.x * strength;
      deltaY[i] = this._delta.y * strength;
      deltaZ[i] = this._delta.z * strength;
      projectedCount++;
    }

    console.log(`Projected ${projectedCount}/${vertexCount} vertices`);
    await this.yieldToUI();

    // ── Phase 3: Laplacian smooth deltas (Blender's approach) ─────────
    // Smooth the corrections, not the positions — preserves unaffected detail

    onProgress?.(50, "Smoothing deltas...");

    const lambda = 0.3 + 0.4 * p.smoothingStrength;
    for (let pass = 0; pass < p.smoothingPasses; pass++) {
      this.laplacianSmoothDeltas(
        deltaX,
        deltaY,
        deltaZ,
        vertexCount,
        neighborMap,
        boundaryVertices,
        distToBoundary,
        boundaryRadius,
        lambda,
      );
      this.enforceCoincidentDeltas(deltaX, deltaY, deltaZ, coincidentGroups);
    }

    await this.yieldToUI();

    // ── Phase 4: Apply deltas ─────────────────────────────────────────

    onProgress?.(70, "Applying displacements...");

    for (let i = 0; i < vertexCount; i++) {
      if (boundaryVertices.has(i)) continue;
      const dx = deltaX[i],
        dy = deltaY[i],
        dz = deltaZ[i];
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9 && Math.abs(dz) < 1e-9)
        continue;
      position.setX(i, position.getX(i) + dx);
      position.setY(i, position.getY(i) + dy);
      position.setZ(i, position.getZ(i) + dz);
    }
    this.enforceCoincidentPositions(position, coincidentGroups);

    // ── Phase 5: Push-out safety net ──────────────────────────────────
    // Laplacian smoothing can re-introduce minor penetrations; fix them.

    onProgress?.(80, "Checking penetrations...");

    const pushed = this.pushOutViolations(
      position,
      vertexCount,
      boundaryVertices,
      armorWorldMatrix,
      inverseArmorMatrix,
      inverseBodyMatrix,
      bodyWorldMatrix,
      bodyBVH,
      effectiveOffset,
      maxPush,
      bvhResult,
      bodyPosAttr,
      bodyIndexAttr,
    );
    if (pushed > 0) {
      console.log(`Push-out fixed ${pushed} penetrating vertices`);
      this.enforceCoincidentPositions(position, coincidentGroups);
    }

    // ── Phase 6: Normals + collapse check ─────────────────────────────

    onProgress?.(90, "Computing normals...");
    position.needsUpdate = true;
    armorGeo.computeVertexNormals();

    const finalBounds = new Box3().setFromBufferAttribute(position);
    const finalSize = finalBounds.getSize(new Vector3());
    if (finalSize.length() < 0.001) {
      console.error("Mesh collapsed! Restoring original positions.");
      (position.array as Float32Array).set(originalPositions);
      position.needsUpdate = true;
      armorGeo.computeVertexNormals();
    }

    onProgress?.(100, "Fitting complete");
  }

  // ── Barycentric coordinates ─────────────────────────────────────────

  private computeBarycentric(
    p: Vector3,
    a: Vector3,
    b: Vector3,
    c: Vector3,
  ): [number, number, number] {
    const v0 = this._edge1.subVectors(b, a);
    const v1 = this._edge2.subVectors(c, a);
    const v2 = this._delta.subVectors(p, a);

    const d00 = v0.dot(v0);
    const d01 = v0.dot(v1);
    const d02 = v0.dot(v2);
    const d11 = v1.dot(v1);
    const d12 = v1.dot(v2);

    const denom = d00 * d11 - d01 * d01;
    if (Math.abs(denom) < 1e-12) return [1 / 3, 1 / 3, 1 / 3];

    const inv = 1 / denom;
    const u = (d11 * d02 - d01 * d12) * inv;
    const v = (d00 * d12 - d01 * d02) * inv;
    const w = 1 - u - v;

    // Clamp to valid range (numerical noise can push slightly outside)
    const w0 = Math.max(0, Math.min(1, w));
    const w1 = Math.max(0, Math.min(1, u));
    const w2 = Math.max(0, Math.min(1, v));
    const sum = w0 + w1 + w2;
    return sum > 1e-8 ? [w0 / sum, w1 / sum, w2 / sum] : [1 / 3, 1 / 3, 1 / 3];
  }

  // ── Push-out safety net ─────────────────────────────────────────────

  private pushOutViolations(
    position: BufferAttribute,
    vertexCount: number,
    boundaryVertices: Set<number>,
    armorWorldMatrix: Matrix4,
    inverseArmorMatrix: Matrix4,
    inverseBodyMatrix: Matrix4,
    bodyWorldMatrix: Matrix4,
    bodyBVH: MeshBVH,
    effectiveOffset: number,
    maxPush: number,
    bvhResult: { point: Vector3; distance: number; faceIndex: number },
    bodyPosAttr: BufferAttribute,
    bodyIndexAttr: BufferAttribute,
  ): number {
    let totalPushed = 0;

    for (let pass = 0; pass < 3; pass++) {
      let pushed = 0;

      for (let i = 0; i < vertexCount; i++) {
        if (boundaryVertices.has(i)) continue;

        this._vertex.set(position.getX(i), position.getY(i), position.getZ(i));
        this._vertex.applyMatrix4(armorWorldMatrix);
        this._bodyLocal.copy(this._vertex).applyMatrix4(inverseBodyMatrix);

        bvhResult.point.set(0, 0, 0);
        bvhResult.distance = 0;
        bvhResult.faceIndex = 0;
        const cpHit = bodyBVH.closestPointToPoint(this._bodyLocal, bvhResult);
        if (!cpHit) continue;

        this._closestWorld.copy(cpHit.point).applyMatrix4(bodyWorldMatrix);
        this._delta.subVectors(this._vertex, this._closestWorld);
        const dist = this._delta.length();

        // Face normal for inside/outside test
        const fi = cpHit.faceIndex;
        const i0 = bodyIndexAttr.getX(fi * 3);
        const i1 = bodyIndexAttr.getX(fi * 3 + 1);
        const i2 = bodyIndexAttr.getX(fi * 3 + 2);
        this._v0.fromBufferAttribute(bodyPosAttr, i0);
        this._v1.fromBufferAttribute(bodyPosAttr, i1);
        this._v2.fromBufferAttribute(bodyPosAttr, i2);
        this._edge1.subVectors(this._v1, this._v0);
        this._edge2.subVectors(this._v2, this._v0);
        this._faceNormal.crossVectors(this._edge1, this._edge2);
        const fnLen = this._faceNormal.length();
        if (fnLen < 1e-10) continue;
        this._faceNormal.divideScalar(fnLen);
        this._faceNormal.transformDirection(bodyWorldMatrix);

        const dotFN =
          dist > 1e-8 ? this._delta.dot(this._faceNormal) / dist : -1;

        if (dotFN < 0.1) {
          // Inside body — push outward along face normal
          const pushAmt = Math.min(dist + effectiveOffset, maxPush);
          this._vertex.addScaledVector(this._faceNormal, pushAmt);
          this._vertex.applyMatrix4(inverseArmorMatrix);
          position.setXYZ(i, this._vertex.x, this._vertex.y, this._vertex.z);
          pushed++;
        } else if (dist < effectiveOffset) {
          // Outside but too close — push along V-CP direction
          this._delta.divideScalar(dist);
          const pushAmt = Math.min(effectiveOffset - dist, maxPush);
          this._vertex.addScaledVector(this._delta, pushAmt);
          this._vertex.applyMatrix4(inverseArmorMatrix);
          position.setXYZ(i, this._vertex.x, this._vertex.y, this._vertex.z);
          pushed++;
        }
      }

      totalPushed += pushed;
      if (pushed === 0) break;
    }

    return totalPushed;
  }

  // ── Laplacian smoothing of deltas ───────────────────────────────────

  private laplacianSmoothDeltas(
    dx: Float32Array,
    dy: Float32Array,
    dz: Float32Array,
    vertexCount: number,
    neighborMap: Map<number, Set<number>>,
    boundaryVertices: Set<number>,
    distToBoundary: Uint16Array,
    boundaryRadius: number,
    lambda: number,
  ): void {
    const snapX = new Float32Array(dx);
    const snapY = new Float32Array(dy);
    const snapZ = new Float32Array(dz);

    for (let i = 0; i < vertexCount; i++) {
      if (boundaryVertices.has(i)) continue;
      const neighbors = neighborMap.get(i);
      if (!neighbors || neighbors.size === 0) continue;

      let localLambda = lambda;
      const bDist = distToBoundary[i];
      if (bDist < boundaryRadius) {
        const t = bDist / boundaryRadius;
        localLambda *= t * t * (3 - 2 * t);
      }

      let avgX = 0,
        avgY = 0,
        avgZ = 0,
        cnt = 0;
      for (const ni of neighbors) {
        avgX += snapX[ni];
        avgY += snapY[ni];
        avgZ += snapZ[ni];
        cnt++;
      }
      if (cnt === 0) continue;
      avgX /= cnt;
      avgY /= cnt;
      avgZ /= cnt;

      dx[i] = snapX[i] * (1 - localLambda) + avgX * localLambda;
      dy[i] = snapY[i] * (1 - localLambda) + avgY * localLambda;
      dz[i] = snapZ[i] * (1 - localLambda) + avgZ * localLambda;
    }
  }

  // ── Topology helpers ────────────────────────────────────────────────

  private buildBVH(geometry: BufferGeometry): MeshBVH {
    if (!geometry.index) {
      const indices: number[] = [];
      for (let i = 0; i < geometry.attributes.position.count; i++) {
        indices.push(i);
      }
      geometry.setIndex(indices);
    }
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }
    return new MeshBVH(geometry);
  }

  private buildNeighborMap(geometry: BufferGeometry): Map<number, Set<number>> {
    const map = new Map<number, Set<number>>();
    const idx = geometry.index;
    if (!idx) return map;

    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i);
      const b = idx.getX(i + 1);
      const c = idx.getX(i + 2);

      if (!map.has(a)) map.set(a, new Set());
      if (!map.has(b)) map.set(b, new Set());
      if (!map.has(c)) map.set(c, new Set());

      map.get(a)!.add(b);
      map.get(a)!.add(c);
      map.get(b)!.add(a);
      map.get(b)!.add(c);
      map.get(c)!.add(a);
      map.get(c)!.add(b);
    }

    return map;
  }

  private buildCoincidentGroups(
    position: BufferAttribute,
    vertexCount: number,
  ): number[][] {
    const posMap = new Map<string, number[]>();
    for (let i = 0; i < vertexCount; i++) {
      const key = `${position.getX(i).toFixed(6)}_${position.getY(i).toFixed(6)}_${position.getZ(i).toFixed(6)}`;
      let group = posMap.get(key);
      if (!group) {
        group = [];
        posMap.set(key, group);
      }
      group.push(i);
    }
    const groups: number[][] = [];
    for (const group of posMap.values()) {
      if (group.length > 1) groups.push(group);
    }
    return groups;
  }

  private mergeCoincidentNeighbors(
    neighborMap: Map<number, Set<number>>,
    groups: number[][],
  ): void {
    for (const group of groups) {
      const allNeighbors = new Set<number>();
      for (const vi of group) {
        const neighbors = neighborMap.get(vi);
        if (neighbors) {
          for (const n of neighbors) allNeighbors.add(n);
        }
      }
      for (const vi of group) allNeighbors.delete(vi);
      for (const vi of group) {
        neighborMap.set(vi, new Set(allNeighbors));
      }
    }
  }

  private detectBoundaryVertices(geometry: BufferGeometry): Set<number> {
    const boundary = new Set<number>();
    const idx = geometry.index;
    if (!idx) return boundary;

    const edgeCount = new Map<string, number>();
    for (let i = 0; i < idx.count; i += 3) {
      const verts = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
      for (let j = 0; j < 3; j++) {
        const a = Math.min(verts[j], verts[(j + 1) % 3]);
        const b = Math.max(verts[j], verts[(j + 1) % 3]);
        const key = `${a}_${b}`;
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      }
    }

    for (const [key, count] of edgeCount) {
      if (count === 1) {
        const [a, b] = key.split("_").map(Number);
        boundary.add(a);
        boundary.add(b);
      }
    }

    return boundary;
  }

  private enforceCoincidentPositions(
    position: BufferAttribute,
    groups: number[][],
  ): void {
    for (const group of groups) {
      let ax = 0,
        ay = 0,
        az = 0;
      for (const vi of group) {
        ax += position.getX(vi);
        ay += position.getY(vi);
        az += position.getZ(vi);
      }
      ax /= group.length;
      ay /= group.length;
      az /= group.length;
      for (const vi of group) {
        position.setXYZ(vi, ax, ay, az);
      }
    }
  }

  private enforceCoincidentDeltas(
    dx: Float32Array,
    dy: Float32Array,
    dz: Float32Array,
    groups: number[][],
  ): void {
    for (const group of groups) {
      let ax = 0,
        ay = 0,
        az = 0;
      for (const vi of group) {
        ax += dx[vi];
        ay += dy[vi];
        az += dz[vi];
      }
      ax /= group.length;
      ay /= group.length;
      az /= group.length;
      for (const vi of group) {
        dx[vi] = ax;
        dy[vi] = ay;
        dz[vi] = az;
      }
    }
  }

  private yieldToUI(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}
