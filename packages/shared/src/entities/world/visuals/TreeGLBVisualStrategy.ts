/**
 * TreeGLBVisualStrategy — GLBTreeInstancer integration for woodcutting trees.
 *
 * Thin wrapper: the instancer owns BatchedMeshes and LOD switching.
 * This strategy just calls addInstance / removeInstance / setDepleted.
 */

import THREE from "../../../extras/three/three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  addInstance as addGLBTreeInstance,
  removeInstance as removeGLBTreeInstance,
  setDepleted as setGLBTreeDepleted,
  hasDepleted as hasGLBTreeDepleted,
  setHighlight as setGLBTreeHighlight,
  getModelDimensions as getGLBModelDimensions,
  updateGLBTreeInstancer,
} from "../../../systems/shared/world/GLBTreeInstancer";
import type {
  ResourceVisualContext,
  ResourceVisualStrategy,
} from "./ResourceVisualStrategy";

function createCollisionProxy(ctx: ResourceVisualContext, scale: number): void {
  const dims = getGLBModelDimensions(ctx.id);
  const height = (dims?.height ?? 8) * scale;
  const radius = (dims?.radius ?? 1) * scale;
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 6);
  const material = new MeshBasicNodeMaterial();
  material.visible = false;

  const proxy = new THREE.Mesh(geometry, material);
  proxy.position.y = height / 2;
  proxy.name = `TreeProxy_${ctx.id}`;
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

export class TreeGLBVisualStrategy implements ResourceVisualStrategy {
  async createVisual(ctx: ResourceVisualContext): Promise<void> {
    const { config, id, position } = ctx;

    const treeType = config.resourceId.replace(/^tree_/, "");
    const variants =
      config.modelVariants ?? (config.model ? [config.model] : []);
    if (variants.length === 0) return;

    const hash = ctx.hashString(id) >>> 0;
    const variantIndex = hash % variants.length;

    const baseScale = config.modelScale ?? 3.0;
    const worldPos = new THREE.Vector3();
    ctx.node.getWorldPosition(worldPos);

    const rotHash = ctx.hashString(
      `${id}_${position.x.toFixed(1)}_${position.z.toFixed(1)}`,
    );
    const rotation = ((rotHash % 1000) / 1000) * Math.PI * 2;

    const success = await addGLBTreeInstance(
      treeType,
      variants,
      variantIndex,
      id,
      worldPos,
      rotation,
      baseScale,
      config.depletedModelPath ?? null,
      config.depletedModelScale ?? 0.3,
    );

    if (success) {
      createCollisionProxy(ctx, baseScale);
    }
  }

  async onDepleted(ctx: ResourceVisualContext): Promise<boolean> {
    setGLBTreeDepleted(ctx.id, true);
    const proxy = ctx.getMesh();
    if (proxy) {
      proxy.userData.depleted = true;
      proxy.userData.interactable = false;
    }
    return hasGLBTreeDepleted(ctx.id);
  }

  setShaderHighlight(ctx: ResourceVisualContext, on: boolean): void {
    setGLBTreeHighlight(ctx.id, on);
  }

  async onRespawn(ctx: ResourceVisualContext): Promise<void> {
    setGLBTreeDepleted(ctx.id, false);
    const proxy = ctx.getMesh();
    if (proxy) {
      proxy.userData.depleted = false;
      proxy.userData.interactable = true;
    }
  }

  update(): void {
    updateGLBTreeInstancer();
  }

  destroy(ctx: ResourceVisualContext): void {
    removeGLBTreeInstance(ctx.id);
  }
}
