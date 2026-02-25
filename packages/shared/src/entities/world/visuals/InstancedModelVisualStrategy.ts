/**
 * InstancedModelVisualStrategy — GLBModelInstancer integration for any
 * non-tree, non-fishing-spot resource that has a GLB model (rocks, herbs, etc.).
 *
 * Works identically to TreeGLBVisualStrategy but uses a generic box collision
 * proxy sized from the model's bounding box instead of a hardcoded tree cylinder.
 */

import THREE from "../../../extras/three/three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  addInstance,
  removeInstance,
  setDepleted,
  updateGLBModelInstancer,
  getModelYOffset,
} from "../../../systems/shared/world/GLBModelInstancer";
import type {
  ResourceVisualContext,
  ResourceVisualStrategy,
} from "./ResourceVisualStrategy";

function createCollisionProxy(ctx: ResourceVisualContext, scale: number): void {
  const halfW = 0.6 * scale;
  const height = 1.5 * scale;
  const geometry = new THREE.BoxGeometry(halfW * 2, height, halfW * 2);
  const material = new MeshBasicNodeMaterial();
  material.visible = false;

  const proxy = new THREE.Mesh(geometry, material);
  proxy.position.y = height / 2;
  proxy.name = `InstancedProxy_${ctx.id}`;
  proxy.userData = {
    type: "resource",
    entityId: ctx.id,
    name: ctx.config.name,
    interactable: true,
    resourceType: ctx.config.resourceType,
  };
  proxy.layers.set(1);

  ctx.node.add(proxy);
  ctx.setMesh(proxy);
}

export class InstancedModelVisualStrategy implements ResourceVisualStrategy {
  async createVisual(ctx: ResourceVisualContext): Promise<void> {
    const { config, id, position } = ctx;
    if (!config.model) return;

    const baseScale = config.modelScale ?? 1.0;
    const worldPos = new THREE.Vector3();
    ctx.node.getWorldPosition(worldPos);

    const rotHash = ctx.hashString(
      `${id}_${position.x.toFixed(1)}_${position.z.toFixed(1)}`,
    );
    const rotation = ((rotHash % 1000) / 1000) * Math.PI * 2;

    const success = await addInstance(
      config.model,
      id,
      worldPos,
      rotation,
      baseScale,
    );

    if (success) {
      createCollisionProxy(ctx, baseScale);
    }
  }

  async onDepleted(ctx: ResourceVisualContext): Promise<void> {
    setDepleted(ctx.id, true);
  }

  async onRespawn(ctx: ResourceVisualContext): Promise<void> {
    setDepleted(ctx.id, false);
    const mesh = ctx.getMesh();
    if (mesh) {
      ctx.node.remove(mesh);
      ctx.setMesh(null);
    }
    const baseScale = ctx.config.modelScale ?? 1.0;
    createCollisionProxy(ctx, baseScale);
  }

  update(): void {
    updateGLBModelInstancer();
  }

  destroy(ctx: ResourceVisualContext): void {
    removeInstance(ctx.id);
  }
}
