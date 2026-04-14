/**
 * geometryBuilders — Shared geometry creation utilities for WorldStudio overlays
 *
 * Consolidates duplicated geometry helpers from:
 * - useAudioZoneOverlay (polygon lines, circle lines, polygon fill, canvas labels)
 * - useWaterBodyEditor (polygon lines, polygon fill)
 * - useAreaBoundaryOverlay (circle lines, canvas labels)
 *
 * All functions produce raw THREE.BufferGeometry or THREE.CanvasTexture instances.
 * Callers are responsible for disposal.
 */

import * as THREE from "three/webgpu";

// ============== POLYGON LINE GEOMETRY ==============

/**
 * Create a line geometry from polygon points at a given Y height.
 *
 * When `closed` is true (default), the first point is appended to close the loop.
 * Uses a flat Float32Array internally to avoid per-vertex Vector3 allocation.
 */
export function createPolygonLineGeometry(
  points: ReadonlyArray<{ x: number; z: number }>,
  y: number,
  closed = true,
): THREE.BufferGeometry {
  if (points.length < 2) return new THREE.BufferGeometry();

  const count = closed ? points.length + 1 : points.length;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < points.length; i++) {
    const off = i * 3;
    positions[off] = points[i].x;
    positions[off + 1] = y;
    positions[off + 2] = points[i].z;
  }

  if (closed && points.length > 2) {
    const off = points.length * 3;
    positions[off] = points[0].x;
    positions[off + 1] = y;
    positions[off + 2] = points[0].z;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}

// ============== CIRCLE LINE GEOMETRY ==============

/**
 * Create a circle line geometry centered at (cx, cz) at the given Y height.
 *
 * Produces `segments + 1` vertices so the last vertex coincides with the first,
 * forming a closed loop suitable for THREE.Line.
 */
export function createCircleLineGeometry(
  cx: number,
  cz: number,
  y: number,
  radius: number,
  segments = 48,
): THREE.BufferGeometry {
  const vertCount = segments + 1;
  const positions = new Float32Array(vertCount * 3);

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const off = i * 3;
    positions[off] = cx + Math.cos(theta) * radius;
    positions[off + 1] = y;
    positions[off + 2] = cz + Math.sin(theta) * radius;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}

// ============== POLYGON FILL GEOMETRY ==============

/**
 * Create a filled polygon geometry (triangulated via THREE.ShapeGeometry) at
 * the given Y height.
 *
 * The polygon is defined in the XZ plane. Internally, a THREE.Shape is built
 * in XY space, triangulated by ShapeGeometry, then rotated to XZ and
 * translated to the target height.
 *
 * Returns `null` when fewer than 3 points are provided (no valid polygon).
 */
export function createPolygonFillGeometry(
  points: ReadonlyArray<{ x: number; z: number }>,
  y: number,
): THREE.BufferGeometry | null {
  if (points.length < 3) return null;

  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].z);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i].x, points[i].z);
  }
  shape.closePath();

  const geom = new THREE.ShapeGeometry(shape);
  // ShapeGeometry produces vertices in the XY plane — rotate to XZ
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, y, 0);
  return geom;
}

// ============== CANVAS LABEL TEXTURE ==============

/**
 * Create a canvas-based text label rendered as a THREE.CanvasTexture.
 *
 * Draws a rounded semi-transparent dark pill background with centered text
 * in the specified color. The resulting texture is suitable for
 * THREE.SpriteMaterial.
 *
 * @param text  - The label string to render.
 * @param color - CSS color string (e.g. "#d946ef") or hex number (e.g. 0xd946ef).
 * @param width - Canvas width in pixels (default 256).
 * @param height - Canvas height in pixels (default 64).
 */
export function createCanvasLabel(
  text: string,
  color: string | number,
  width = 256,
  height = 64,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);

  // Background pill
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  const pad = 8;
  ctx.beginPath();
  ctx.roundRect(pad, pad, width - pad * 2, height - pad * 2, 8);
  ctx.fill();

  // Text
  const colorStr =
    typeof color === "number"
      ? `#${color.toString(16).padStart(6, "0")}`
      : color;
  ctx.fillStyle = colorStr;
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
