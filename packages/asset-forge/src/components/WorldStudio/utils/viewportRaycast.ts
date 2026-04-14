/**
 * viewportRaycast — Shared viewport raycaster utility
 *
 * Pre-allocated Raycaster, mouse Vector2, and ground plane used by every
 * viewport interaction hook (brush, placement, water body, zone painting,
 * transform gizmo).  Centralises the NDC mouse calculation and the
 * terrain-mesh-then-ground-plane fallback pattern so each hook doesn't
 * duplicate its own module-level objects.
 */

import * as THREE from "three/webgpu";

// Pre-allocated objects — shared across all callers within a single frame.
// Safe because JS is single-threaded and no caller stores the returned
// Vector3 reference across async boundaries.
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _target = new THREE.Vector3();

/**
 * Convert a mouse event to NDC coordinates, set up the raycaster, and
 * intersect the Y = 0 ground plane.
 *
 * Returns the pre-allocated `_target` Vector3 on hit — callers that need
 * to persist the result must `.clone()` it before the next call.
 */
export function raycastToGround(
  event: MouseEvent,
  camera: THREE.Camera,
  container: HTMLElement,
): THREE.Vector3 | null {
  const rect = container.getBoundingClientRect();
  _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_mouse, camera);
  const hit = _raycaster.ray.intersectPlane(_groundPlane, _target);
  return hit ? _target : null;
}

/**
 * Convert a mouse event to NDC coordinates, set up the raycaster, and
 * intersect the provided meshes (non-recursive by default).
 *
 * Returns the closest `THREE.Intersection` or `null`.
 */
export function raycastToMeshes(
  event: MouseEvent,
  camera: THREE.Camera,
  container: HTMLElement,
  meshes: THREE.Object3D[],
  recursive = false,
): THREE.Intersection | null {
  const rect = container.getBoundingClientRect();
  _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_mouse, camera);
  const intersects = _raycaster.intersectObjects(meshes, recursive);
  return intersects.length > 0 ? intersects[0] : null;
}

/** Shared raycaster instance — exposed for hooks that need custom ray logic. */
export { _raycaster as sharedRaycaster, _mouse as sharedMouse };
