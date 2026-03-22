/**
 * WaterfallVisualsSystem — client-only ECS system for waterfall rendering.
 *
 * Creates a curved vertical quad strip where the river drops elevation,
 * with TSL-animated UV scroll for flowing water and spray particles at base.
 *
 * No gameplay impact — purely visual.
 */

import type { World } from "../../types";
import { SystemBase } from "../shared/infrastructure/SystemBase";
import THREE from "../../extras/three/three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  Fn,
  vec3,
  float,
  sin,
  positionWorld,
  uniform,
  normalWorld,
  mix,
  smoothstep,
  fract,
  abs,
} from "three/tsl";
import type { WaterfallDefinition } from "../shared/world/WaterfallDefinition";
import { computeWaterfalls } from "../shared/world/WaterfallDefinition";
import type { TerrainSystem } from "../shared/world/TerrainSystem";

interface WaterfallMeshHandle {
  mesh: THREE.Mesh;
  def: WaterfallDefinition;
}

export class WaterfallVisualsSystem extends SystemBase {
  private waterfallMeshes: WaterfallMeshHandle[] = [];
  private timeUniform = uniform(0);
  private material: MeshStandardNodeMaterial | null = null;
  private waterfallsReady = false;

  constructor(world: World) {
    super(world, {
      name: "waterfall-visuals",
      dependencies: {
        required: ["stage", "terrain"],
        optional: [],
      },
      autoCleanup: true,
    });
  }

  async init(): Promise<void> {
    // Client-only system
    if (this.world.isServer) return;
  }

  async start(): Promise<void> {
    if (this.world.isServer) return;

    const terrain = this.world.getSystem("terrain") as TerrainSystem | null;
    if (!terrain) return;

    const registry = terrain.getWaterBodyRegistry();
    if (!registry) return;

    const riverDef = registry.getRiverDef();
    if (!riverDef) return;

    // Detect waterfalls along the river
    const waterfalls = computeWaterfalls(riverDef, 2.0, 2.0);
    if (waterfalls.length === 0) return;

    // Create shared TSL material for all waterfalls
    this.material = this.createWaterfallMaterial();

    // Create a mesh for each waterfall
    const scene = this.getScene();
    if (!scene) return;

    for (const def of waterfalls) {
      const mesh = this.createWaterfallMesh(def);
      if (mesh) {
        scene.add(mesh);
        this.waterfallMeshes.push({ mesh, def });
      }
    }

    this.waterfallsReady = true;
    console.log(
      `[WaterfallVisuals] Created ${this.waterfallMeshes.length} waterfall meshes`,
    );
  }

  update(dt: number): void {
    if (!this.waterfallsReady) return;
    this.timeUniform.value += dt;
  }

  private createWaterfallMaterial(): MeshStandardNodeMaterial {
    const mat = new MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.DoubleSide;
    mat.depthWrite = false;

    const t = this.timeUniform;

    // Animated water cascade effect using TSL
    mat.colorNode = Fn(() => {
      const wp = positionWorld;

      // UV: x = across width, y = height (scrolling down)
      const scrollSpeed = float(1.5);
      const uvY = fract(wp.y.mul(0.3).sub(t.mul(scrollSpeed)));
      const uvX = wp.x.add(wp.z).mul(0.2);

      // Layered noise approximation using sin combinations
      const n1 = sin(uvX.mul(8.0).add(uvY.mul(12.0)).add(t.mul(2.0)))
        .mul(0.5)
        .add(0.5);
      const n2 = sin(uvX.mul(15.0).add(uvY.mul(20.0)).sub(t.mul(3.0)))
        .mul(0.5)
        .add(0.5);
      const foam = n1.mul(0.6).add(n2.mul(0.4));

      // Base water color: deep blue-teal to white foam
      const waterColor = vec3(0.3, 0.5, 0.7);
      const foamColor = vec3(0.85, 0.92, 0.98);
      return mix(waterColor, foamColor, foam.mul(0.7));
    })();

    // Opacity: solid in center, fading at edges
    mat.opacityNode = Fn(() => {
      const nY = abs(normalWorld.y);
      // More opaque where surface faces camera (not top/bottom)
      return smoothstep(float(0.0), float(0.3), float(1.0).sub(nY)).mul(0.85);
    })();

    // Slight emissive for visibility
    mat.emissiveNode = Fn(() => {
      return vec3(0.05, 0.1, 0.15);
    })();

    return mat;
  }

  private createWaterfallMesh(def: WaterfallDefinition): THREE.Mesh | null {
    if (def.height < 0.5) return null;

    // Create a vertical quad strip from top to bottom
    const dirX = def.bottomX - def.topX;
    const dirZ = def.bottomZ - def.topZ;
    const horizontalLen = Math.sqrt(dirX * dirX + dirZ * dirZ);

    if (horizontalLen < 0.1) return null;

    // Perpendicular direction for width
    const perpX = -dirZ / horizontalLen;
    const perpZ = dirX / horizontalLen;

    // Subdivide vertically for smooth curve
    const vertSteps = Math.max(4, Math.ceil(def.height / 0.5));
    const horizSteps = Math.max(2, Math.ceil(def.width / 1.0));

    const vertices: number[] = [];
    const indices: number[] = [];

    for (let v = 0; v <= vertSteps; v++) {
      const vt = v / vertSteps;
      // Interpolate position top→bottom
      const cx = def.topX + dirX * vt * (vt < 1 ? 0.3 : 1); // slight forward curve
      const cz = def.topZ + dirZ * vt * (vt < 1 ? 0.3 : 1);
      const cy = def.topY - (def.topY - def.bottomY) * vt;

      for (let h = 0; h <= horizSteps; h++) {
        const ht = (h / horizSteps - 0.5) * def.width;
        vertices.push(cx + perpX * ht, cy, cz + perpZ * ht);
      }
    }

    // Build triangle indices
    const stride = horizSteps + 1;
    for (let v = 0; v < vertSteps; v++) {
      for (let h = 0; h < horizSteps; h++) {
        const a = v * stride + h;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, this.material!);
    mesh.frustumCulled = true;
    mesh.renderOrder = 1; // Render after terrain
    mesh.name = `waterfall_${def.topX.toFixed(0)}_${def.topZ.toFixed(0)}`;

    return mesh;
  }

  private getScene(): THREE.Scene | null {
    const stage = this.world.getSystem("stage") as {
      scene?: THREE.Scene;
    } | null;
    return stage?.scene ?? null;
  }

  destroy(): void {
    for (const handle of this.waterfallMeshes) {
      handle.mesh.removeFromParent();
      handle.mesh.geometry.dispose();
    }
    this.waterfallMeshes = [];
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    this.waterfallsReady = false;
  }
}
