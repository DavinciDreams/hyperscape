/**
 * useAudioZoneOverlay — Renders audio zone visualizations in the 3D viewport
 *
 * Displays:
 * - Music zones: polygon outlines (magenta/fuchsia)
 * - Ambient zones: polygon outlines (teal)
 * - SFX triggers: circle outlines for radius (amber)
 *
 * Pattern follows useAreaBoundaryOverlay: a single THREE.Group attached to
 * sceneRefs.scene, rebuilt when relevant state changes.
 */

import * as THREE from "three/webgpu";
import { useEffect, useRef } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import { useWorldStudio } from "../WorldStudioContext";
import type { MusicZone, AmbientZone, SFXTrigger } from "../types";
import {
  deferredDisposeGroup,
  stageAddition,
  cancelStagedAdditions,
} from "../utils/deferredGpuDisposal";

// ============== CONSTANTS ==============

const MUSIC_ZONE_COLOR = 0xd946ef; // fuchsia-500
const AMBIENT_ZONE_COLOR = 0x14b8a6; // teal-500
const SFX_TRIGGER_COLOR = 0xf59e0b; // amber-500

const LINE_Y = 1.0; // Slightly above terrain
const FILL_OPACITY = 0.08;

// ============== GEOMETRY HELPERS ==============

function createPolygonLineGeometry(
  points: ReadonlyArray<{ x: number; z: number }>,
): THREE.BufferGeometry {
  if (points.length < 2) return new THREE.BufferGeometry();
  const verts: THREE.Vector3[] = [];
  for (const pt of points) {
    verts.push(new THREE.Vector3(pt.x, LINE_Y, pt.z));
  }
  // Close the loop
  verts.push(new THREE.Vector3(points[0].x, LINE_Y, points[0].z));
  return new THREE.BufferGeometry().setFromPoints(verts);
}

function createCircleLineGeometry(
  cx: number,
  cz: number,
  radius: number,
  segments = 48,
): THREE.BufferGeometry {
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    verts.push(
      new THREE.Vector3(
        cx + Math.cos(theta) * radius,
        LINE_Y,
        cz + Math.sin(theta) * radius,
      ),
    );
  }
  return new THREE.BufferGeometry().setFromPoints(verts);
}

function createPolygonFillGeometry(
  points: ReadonlyArray<{ x: number; z: number }>,
): THREE.BufferGeometry | null {
  if (points.length < 3) return null;
  // Create a shape from the polygon points
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].z);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i].x, points[i].z);
  }
  shape.closePath();

  const geom = new THREE.ShapeGeometry(shape);
  // Rotate from XY to XZ plane
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, LINE_Y - 0.1, 0);
  return geom;
}

// ============== LABEL SPRITE ==============

function createZoneLabel(text: string, color: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = 256;
  canvas.height = 64;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  const pad = 8;
  ctx.beginPath();
  ctx.roundRect(pad, pad, canvas.width - pad * 2, canvas.height - pad * 2, 8);
  ctx.fill();

  const hexStr = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = hexStr;
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(10, 2.5, 1);
  sprite.renderOrder = 998;
  return sprite;
}

// ============== BUILD FUNCTIONS ==============

/** Shared builder for polygon-based audio zones (music + ambient). */
function buildPolygonZoneOverlay(
  group: THREE.Group,
  polygon: ReadonlyArray<{ x: number; z: number }>,
  color: number,
  labelText: string,
  lineOpacity = 0.8,
): void {
  // Outline
  const lineGeom = createPolygonLineGeometry(polygon);
  const lineMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: lineOpacity,
    depthWrite: false,
  });
  const line = new THREE.Line(lineGeom, lineMat);
  line.renderOrder = 998;
  group.add(line);

  // Fill
  const fillGeom = createPolygonFillGeometry(polygon);
  if (fillGeom) {
    const fillMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: FILL_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fill = new THREE.Mesh(fillGeom, fillMat);
    fill.renderOrder = 997;
    group.add(fill);
  }

  // Label at centroid
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cz = polygon.reduce((s, p) => s + p.z, 0) / polygon.length;
  const label = createZoneLabel(labelText, color);
  label.position.set(cx, LINE_Y + 5, cz);
  group.add(label);
}

function buildMusicZoneOverlay(
  group: THREE.Group,
  zones: ReadonlyArray<MusicZone>,
): void {
  for (const zone of zones) {
    if (!zone.polygon || zone.polygon.length < 3) continue;
    buildPolygonZoneOverlay(
      group,
      zone.polygon,
      MUSIC_ZONE_COLOR,
      zone.name || "Music Zone",
      0.8,
    );
  }
}

function buildAmbientZoneOverlay(
  group: THREE.Group,
  zones: ReadonlyArray<AmbientZone>,
): void {
  for (const zone of zones) {
    if (!zone.polygon || zone.polygon.length < 3) continue;
    buildPolygonZoneOverlay(
      group,
      zone.polygon,
      AMBIENT_ZONE_COLOR,
      zone.name || zone.ambientType || "Ambient",
      0.7,
    );
  }
}

function buildSFXTriggerOverlay(
  group: THREE.Group,
  triggers: ReadonlyArray<SFXTrigger>,
): void {
  for (const sfx of triggers) {
    // Radius circle
    const circleGeom = createCircleLineGeometry(
      sfx.position.x,
      sfx.position.z,
      sfx.radius,
    );
    const circleMat = new THREE.LineBasicMaterial({
      color: SFX_TRIGGER_COLOR,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const circle = new THREE.Line(circleGeom, circleMat);
    circle.renderOrder = 998;
    group.add(circle);

    // Center marker (small cross)
    const crossSize = 1.5;
    const crossVerts = [
      new THREE.Vector3(sfx.position.x - crossSize, LINE_Y, sfx.position.z),
      new THREE.Vector3(sfx.position.x + crossSize, LINE_Y, sfx.position.z),
      new THREE.Vector3(sfx.position.x, LINE_Y, sfx.position.z - crossSize),
      new THREE.Vector3(sfx.position.x, LINE_Y, sfx.position.z + crossSize),
    ];
    const crossGeom = new THREE.BufferGeometry().setFromPoints(crossVerts);
    const crossMat = new THREE.LineBasicMaterial({
      color: SFX_TRIGGER_COLOR,
      depthWrite: false,
    });
    const cross = new THREE.LineSegments(crossGeom, crossMat);
    cross.renderOrder = 999;
    group.add(cross);

    // Label
    const label = createZoneLabel(sfx.name || "SFX", SFX_TRIGGER_COLOR);
    label.position.set(sfx.position.x, LINE_Y + 4, sfx.position.z);
    group.add(label);
  }
}

// ============== HOOK ==============

export function useAudioZoneOverlay(sceneRefs: TerrainSceneRefs | null): void {
  const { state } = useWorldStudio();
  const overlayGroup = useRef<THREE.Group | null>(null);
  const sceneRefsRef = useRef(sceneRefs);
  sceneRefsRef.current = sceneRefs;

  const musicZones = state.audioLayers.musicZones;
  const ambientZones = state.audioLayers.ambientZones;
  const sfxTriggers = state.audioLayers.sfxTriggers;

  // Check if there's any audio data to visualize
  const hasAudioData =
    musicZones.length > 0 || ambientZones.length > 0 || sfxTriggers.length > 0;

  useEffect(() => {
    if (!sceneRefs) return;

    // Tear down previous group
    if (overlayGroup.current) {
      cancelStagedAdditions(overlayGroup.current);
      sceneRefs.scene.remove(overlayGroup.current);
      deferredDisposeGroup(overlayGroup.current);
      overlayGroup.current = null;
    }

    if (!hasAudioData) return;

    // Build into a temporary group
    const tmpGroup = new THREE.Group();

    if (musicZones.length > 0) {
      buildMusicZoneOverlay(tmpGroup, musicZones);
    }
    if (ambientZones.length > 0) {
      buildAmbientZoneOverlay(tmpGroup, ambientZones);
    }
    if (sfxTriggers.length > 0) {
      buildSFXTriggerOverlay(tmpGroup, sfxTriggers);
    }

    // Add empty group to scene, then stage children in batches
    const group = new THREE.Group();
    group.name = "audio-zone-overlay";
    group.renderOrder = 998;
    sceneRefs.scene.add(group);
    overlayGroup.current = group;

    const children = [...tmpGroup.children];
    tmpGroup.clear();
    for (const child of children) {
      stageAddition(child, group);
    }
  }, [sceneRefs, hasAudioData, musicZones, ambientZones, sfxTriggers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const refs = sceneRefsRef.current;
      const group = overlayGroup.current;
      if (refs && group) {
        refs.scene.remove(group);
        deferredDisposeGroup(group);
      }
    };
  }, []);
}
