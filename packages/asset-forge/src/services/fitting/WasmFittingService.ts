import {
  BufferGeometry,
  BufferAttribute,
  Vector3,
  Mesh,
  Box3,
  Matrix4,
} from "three";
import { MeshBVH } from "three-mesh-bvh";

export interface WasmFittingParameters {
  /** Distance to maintain above body surface (meters, world space) */
  offset: number;
  /** SDF grid resolution along longest axis (32/64/128) */
  sdfResolution: number;
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

const DEFAULT_PARAMS: WasmFittingParameters = {
  offset: 0.04,
  sdfResolution: 64,
  conformStrength: 0.9,
  smoothingStrength: 0.4,
  smoothingPasses: 4,
  boundaryFalloff: 0.8,
};

/**
 * SDF-based armor fitting service.
 *
 * Algorithm:
 *   1. Generate a signed distance field (SDF) from the body mesh on a 3D grid
 *   2. For each armor vertex, trilinear-sample the SDF to get smooth distance + gradient
 *   3. Project the vertex to the offset isosurface (SDF = offset) along the gradient
 *   4. Laplacian smooth the displacement deltas
 *   5. Apply deltas, enforce UV seam coincidence, push-out safety net
 *
 * The SDF approach naturally produces smooth results because trilinear interpolation
 * of the distance field yields a continuous gradient — no discontinuous face normals.
 */
export class WasmFittingService {
  // SDF grid
  private sdfGrid: Float32Array | null = null;
  private gridMin = new Vector3();
  private gridResX = 0;
  private gridResY = 0;
  private gridResZ = 0;
  private cellSize = 0;

  // Reusable temp vectors
  private _v0 = new Vector3();
  private _v1 = new Vector3();
  private _v2 = new Vector3();
  private _vertex = new Vector3();
  private _bodyLocal = new Vector3();
  private _closestWorld = new Vector3();
  private _delta = new Vector3();
  private _gradient = new Vector3();
  private _sampleTemp = new Vector3();
  private _edge1 = new Vector3();
  private _edge2 = new Vector3();
  private _faceNormal = new Vector3();

  // ── Main fitting algorithm ───────────────────────────────────────────

  async fitArmor(
    armorMesh: Mesh,
    bodyMesh: Mesh,
    params: Partial<WasmFittingParameters> = {},
  ): Promise<void> {
    const p = { ...DEFAULT_PARAMS, ...params };
    const report = p.onProgress ?? (() => {});

    report(0, "Preparing...");

    const armorGeo = armorMesh.geometry as BufferGeometry;
    const position = armorGeo.attributes.position as BufferAttribute;
    const vertexCount = position.count;
    if (vertexCount === 0) return;

    const originalPositions = new Float32Array(position.array);

    // ── Phase 1: Build BVH ─────────────────────────────────────────────

    report(2, "Building body BVH...");
    armorMesh.updateMatrixWorld(true);
    bodyMesh.updateMatrixWorld(true);

    const bodyGeo = bodyMesh.geometry as BufferGeometry;
    if (!bodyGeo.attributes.normal) bodyGeo.computeVertexNormals();
    if (!armorGeo.attributes.normal) armorGeo.computeVertexNormals();

    const bodyBVH = this.buildBVH(bodyGeo);
    const bodyPosAttr = bodyGeo.attributes.position as BufferAttribute;
    const bodyIndexAttr = bodyGeo.index!;

    const armorWorldMatrix = armorMesh.matrixWorld;
    const inverseArmorMatrix = armorWorldMatrix.clone().invert();
    const bodyWorldMatrix = bodyMesh.matrixWorld;
    const inverseBodyMatrix = bodyWorldMatrix.clone().invert();
    const invArmorRotScale = inverseArmorMatrix.clone().setPosition(0, 0, 0);

    // ── Phase 2: Generate SDF ──────────────────────────────────────────

    report(5, "Generating signed distance field...");
    await this.generateSDF(
      bodyBVH,
      bodyGeo,
      bodyWorldMatrix,
      inverseBodyMatrix,
      p.sdfResolution,
      (progress) => {
        report(
          5 + progress * 30,
          `Building SDF grid... ${Math.round(progress * 100)}%`,
        );
      },
    );

    // ── Phase 3: Topology ──────────────────────────────────────────────

    report(36, "Building topology...");
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
      "SDF fitting — resolution:",
      p.sdfResolution,
      "bodyRef:",
      bodyRef.toFixed(4),
      "offset:",
      effectiveOffset.toFixed(4),
    );

    // ── Phase 4: SDF Projection ────────────────────────────────────────

    report(40, "Projecting to SDF isosurface...");
    const deltaX = new Float32Array(vertexCount);
    const deltaY = new Float32Array(vertexCount);
    const deltaZ = new Float32Array(vertexCount);
    let projectedCount = 0;

    for (let i = 0; i < vertexCount; i++) {
      if (boundaryVertices.has(i)) continue;
      if (i % 200 === 0) {
        report(
          40 + (i / vertexCount) * 25,
          `Projecting vertex ${i}/${vertexCount}`,
        );
        await this.yieldToUI();
      }

      // Armor vertex in world space
      this._vertex.set(position.getX(i), position.getY(i), position.getZ(i));
      this._vertex.applyMatrix4(armorWorldMatrix);

      // Sample SDF at this point
      const sdfValue = this.sampleSDF(this._vertex);

      // Compute gradient (points outward from body surface)
      this.computeSDFGradient(this._vertex, this._gradient);
      if (this._gradient.lengthSq() < 1e-10) continue;

      // Displacement needed to reach the offset isosurface
      const displacement = effectiveOffset - sdfValue;

      // Boundary falloff + conform strength
      let strength = p.conformStrength;
      const bDist = distToBoundary[i];
      if (bDist < boundaryRadius) {
        const t = bDist / boundaryRadius;
        strength *= t * t * (3 - 2 * t); // smooth Hermite falloff
      }

      // Delta in world space: move along gradient to reach isosurface
      this._delta.copy(this._gradient).multiplyScalar(displacement * strength);

      // Transform delta to armor-local space (rotation+scale only)
      this._delta.applyMatrix4(invArmorRotScale);

      deltaX[i] = this._delta.x;
      deltaY[i] = this._delta.y;
      deltaZ[i] = this._delta.z;
      projectedCount++;
    }

    console.log(`SDF projected ${projectedCount}/${vertexCount} vertices`);
    await this.yieldToUI();

    // ── Phase 5: Laplacian smooth deltas ───────────────────────────────

    report(66, "Smoothing displacements...");
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

    // ── Phase 6: Apply deltas ──────────────────────────────────────────

    report(80, "Applying displacements...");
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

    // ── Phase 7: Push-out safety net ───────────────────────────────────

    report(85, "Checking penetrations...");
    const bvhResult = { point: new Vector3(), distance: 0, faceIndex: 0 };
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

    // ── Phase 8: Finalize ──────────────────────────────────────────────

    report(95, "Computing normals...");
    position.needsUpdate = true;
    armorGeo.computeVertexNormals();
    armorGeo.computeBoundingBox();
    armorGeo.computeBoundingSphere();

    const finalBounds = new Box3().setFromBufferAttribute(position);
    const finalSize = finalBounds.getSize(new Vector3());
    if (finalSize.length() < 0.001) {
      console.error("Mesh collapsed! Restoring original positions.");
      (position.array as Float32Array).set(originalPositions);
      position.needsUpdate = true;
      armorGeo.computeVertexNormals();
    }

    // Clean up SDF grid memory
    this.sdfGrid = null;

    report(100, "SDF fitting complete!");
  }

  // ── SDF Generation ───────────────────────────────────────────────────

  private async generateSDF(
    bodyBVH: MeshBVH,
    bodyGeo: BufferGeometry,
    bodyWorldMatrix: Matrix4,
    inverseBodyMatrix: Matrix4,
    resolution: number,
    onProgress: (progress: number) => void,
  ): Promise<void> {
    // Body bounding box in world space with padding
    const bodyPosAttr = bodyGeo.attributes.position as BufferAttribute;
    const bodyBounds = new Box3();
    for (let i = 0; i < bodyPosAttr.count; i++) {
      this._v0.fromBufferAttribute(bodyPosAttr, i);
      this._v0.applyMatrix4(bodyWorldMatrix);
      bodyBounds.expandByPoint(this._v0);
    }

    const size = bodyBounds.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const padding = maxDim * 0.25;
    bodyBounds.min.subScalar(padding);
    bodyBounds.max.addScalar(padding);

    this.gridMin.copy(bodyBounds.min);
    const gridSize = bodyBounds.getSize(new Vector3());
    const maxGridDim = Math.max(gridSize.x, gridSize.y, gridSize.z);
    this.cellSize = maxGridDim / resolution;

    this.gridResX = Math.ceil(gridSize.x / this.cellSize) + 1;
    this.gridResY = Math.ceil(gridSize.y / this.cellSize) + 1;
    this.gridResZ = Math.ceil(gridSize.z / this.cellSize) + 1;

    const totalCells = this.gridResX * this.gridResY * this.gridResZ;
    this.sdfGrid = new Float32Array(totalCells);

    console.log(
      `SDF grid: ${this.gridResX}x${this.gridResY}x${this.gridResZ} = ${totalCells} cells`,
    );

    const bodyIndexAttr = bodyGeo.index!;
    const bvhResult = { point: new Vector3(), distance: 0, faceIndex: 0 };
    const queryWorld = new Vector3();
    const queryLocal = new Vector3();
    const closestWorld = new Vector3();
    const toQuery = new Vector3();
    const faceNormal = new Vector3();
    const e1 = new Vector3();
    const e2 = new Vector3();
    const tv0 = new Vector3();
    const tv1 = new Vector3();
    const tv2 = new Vector3();

    let cellIndex = 0;
    for (let iz = 0; iz < this.gridResZ; iz++) {
      for (let iy = 0; iy < this.gridResY; iy++) {
        for (let ix = 0; ix < this.gridResX; ix++) {
          // Grid point in world space
          queryWorld.set(
            this.gridMin.x + ix * this.cellSize,
            this.gridMin.y + iy * this.cellSize,
            this.gridMin.z + iz * this.cellSize,
          );

          // Transform to body-local for BVH query
          queryLocal.copy(queryWorld).applyMatrix4(inverseBodyMatrix);

          bvhResult.point.set(0, 0, 0);
          bvhResult.distance = 0;
          bvhResult.faceIndex = 0;
          const hit = bodyBVH.closestPointToPoint(queryLocal, bvhResult);

          if (!hit) {
            this.sdfGrid[cellIndex] = maxDim;
            cellIndex++;
            continue;
          }

          // Unsigned distance in world space
          closestWorld.copy(hit.point).applyMatrix4(bodyWorldMatrix);
          const dist = queryWorld.distanceTo(closestWorld);

          // Inside/outside via face normal dot product
          const fi = hit.faceIndex;
          const i0 = bodyIndexAttr.getX(fi * 3);
          const i1 = bodyIndexAttr.getX(fi * 3 + 1);
          const i2 = bodyIndexAttr.getX(fi * 3 + 2);
          tv0.fromBufferAttribute(bodyPosAttr, i0);
          tv1.fromBufferAttribute(bodyPosAttr, i1);
          tv2.fromBufferAttribute(bodyPosAttr, i2);
          e1.subVectors(tv1, tv0);
          e2.subVectors(tv2, tv0);
          faceNormal.crossVectors(e1, e2);
          const fnLen = faceNormal.length();
          if (fnLen > 1e-10) {
            faceNormal.divideScalar(fnLen);
            faceNormal.transformDirection(bodyWorldMatrix);
          }

          toQuery.subVectors(queryWorld, closestWorld);
          const sign = toQuery.dot(faceNormal) >= 0 ? 1 : -1;

          this.sdfGrid[cellIndex] = sign * dist;
          cellIndex++;
        }
      }

      // Yield every few Z-slices
      if (iz % 4 === 0) {
        onProgress(iz / this.gridResZ);
        await this.yieldToUI();
      }
    }

    onProgress(1);
  }

  // ── SDF Sampling (trilinear interpolation) ───────────────────────────

  private sampleSDF(worldPoint: Vector3): number {
    if (!this.sdfGrid) return 0;

    // World → grid coordinates
    const gx = (worldPoint.x - this.gridMin.x) / this.cellSize;
    const gy = (worldPoint.y - this.gridMin.y) / this.cellSize;
    const gz = (worldPoint.z - this.gridMin.z) / this.cellSize;

    // Clamp to valid grid range
    const cx = Math.max(0, Math.min(this.gridResX - 2, Math.floor(gx)));
    const cy = Math.max(0, Math.min(this.gridResY - 2, Math.floor(gy)));
    const cz = Math.max(0, Math.min(this.gridResZ - 2, Math.floor(gz)));

    // Fractional position within cell
    const fx = Math.max(0, Math.min(1, gx - cx));
    const fy = Math.max(0, Math.min(1, gy - cy));
    const fz = Math.max(0, Math.min(1, gz - cz));

    // Index helper
    const idx = (x: number, y: number, z: number) =>
      x + y * this.gridResX + z * this.gridResX * this.gridResY;

    // Trilinear interpolation of 8 cube corners
    const c000 = this.sdfGrid[idx(cx, cy, cz)];
    const c100 = this.sdfGrid[idx(cx + 1, cy, cz)];
    const c010 = this.sdfGrid[idx(cx, cy + 1, cz)];
    const c110 = this.sdfGrid[idx(cx + 1, cy + 1, cz)];
    const c001 = this.sdfGrid[idx(cx, cy, cz + 1)];
    const c101 = this.sdfGrid[idx(cx + 1, cy, cz + 1)];
    const c011 = this.sdfGrid[idx(cx, cy + 1, cz + 1)];
    const c111 = this.sdfGrid[idx(cx + 1, cy + 1, cz + 1)];

    const c00 = c000 * (1 - fx) + c100 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;

    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    return c0 * (1 - fz) + c1 * fz;
  }

  private computeSDFGradient(worldPoint: Vector3, out: Vector3): Vector3 {
    const h = this.cellSize * 0.5;

    const px = this.sampleSDF(
      this._sampleTemp.set(worldPoint.x + h, worldPoint.y, worldPoint.z),
    );
    const nx = this.sampleSDF(
      this._sampleTemp.set(worldPoint.x - h, worldPoint.y, worldPoint.z),
    );
    const py = this.sampleSDF(
      this._sampleTemp.set(worldPoint.x, worldPoint.y + h, worldPoint.z),
    );
    const ny = this.sampleSDF(
      this._sampleTemp.set(worldPoint.x, worldPoint.y - h, worldPoint.z),
    );
    const pz = this.sampleSDF(
      this._sampleTemp.set(worldPoint.x, worldPoint.y, worldPoint.z + h),
    );
    const nz = this.sampleSDF(
      this._sampleTemp.set(worldPoint.x, worldPoint.y, worldPoint.z - h),
    );

    out.set(px - nx, py - ny, pz - nz);
    const len = out.length();
    if (len > 1e-8) out.divideScalar(len);
    return out;
  }

  // ── Push-out safety net ──────────────────────────────────────────────

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

  // ── Laplacian smoothing of deltas ────────────────────────────────────

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

  // ── Topology helpers ─────────────────────────────────────────────────

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
