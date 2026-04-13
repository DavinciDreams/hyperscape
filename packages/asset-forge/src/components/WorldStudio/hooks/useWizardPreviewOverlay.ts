/**
 * useWizardPreviewOverlay — 3D ghost overlay for the generation wizard
 *
 * Renders translucent preview markers in the viewport as each wizard stage
 * generates content: town cones, road lines, zone boundaries, entity dots.
 *
 * Pattern follows useAreaBoundaryOverlay: a single THREE.Group managed via
 * useEffect, rebuilt when wizard preview data changes, disposed on unmount.
 */

import * as THREE from "three/webgpu";
import { useEffect, useRef } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import type { WizardPreviewData } from "../WorldStudioContext";
import { useWorldStudio } from "../WorldStudioContext";
import { DEFAULT_TIERS } from "./useZoneAutoGen";
import {
  deferredDisposeGroup,
  stageAddition,
  cancelStagedAdditions,
} from "../utils/deferredGpuDisposal";

// ============== CONSTANTS ==============

const LINE_Y = 1.0;
const GHOST_RENDER_ORDER = 998;

/** Tier colors — matches DEFAULT_TIERS color hex strings */
const TIER_COLORS = DEFAULT_TIERS.map((t) => parseInt(t.color.slice(1), 16));

const TOWN_CONE_COLOR = 0xfbbf24;
const SAFE_ZONE_COLOR = 0x22c55e;
const ROAD_COLOR = 0xd4a574;
const MOB_DOT_COLOR = 0xef4444;
const RESOURCE_DOT_COLOR = 0x22c55e;
const SPAWN_POINT_COLOR = 0x3b82f6;
const TELEPORT_COLOR = 0xa855f7;
const MINE_FILL_COLOR = 0x8b6914;
const MINE_OUTLINE_COLOR = 0xb8860b;

// ============== GEOMETRY HELPERS ==============

function createCircleGeometry(
  radius: number,
  segments: number = 48,
): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    points.push(
      new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius),
    );
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createRectGeometry(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): THREE.BufferGeometry {
  const points = [
    new THREE.Vector3(minX, 0, minZ),
    new THREE.Vector3(maxX, 0, minZ),
    new THREE.Vector3(maxX, 0, maxZ),
    new THREE.Vector3(minX, 0, maxZ),
    new THREE.Vector3(minX, 0, minZ),
  ];
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createLabelSprite(text: string, color: number): THREE.Sprite {
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
  ctx.font = "bold 24px sans-serif";
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
  sprite.renderOrder = GHOST_RENDER_ORDER + 1;
  sprite.raycast = () => {}; // Prevent interaction
  return sprite;
}

// ============== BUILD FUNCTIONS ==============

function buildTownOverlay(
  group: THREE.Group,
  data: NonNullable<WizardPreviewData["towns"]>,
  offset: number,
  queryBiome?: (x: number, z: number) => { height: number; biome: string },
): void {
  for (const town of data.generatedTowns) {
    const sx = town.position.x + offset;
    const sz = town.position.z + offset;
    const sy = queryBiome
      ? queryBiome(town.position.x, town.position.z).height + 2
      : town.position.y + 2;

    // Translucent cone marker
    const coneGeo = new THREE.ConeGeometry(4, 12, 8);
    const coneMat = new THREE.MeshBasicMaterial({
      color: TOWN_CONE_COLOR,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(sx, sy + 6, sz);
    cone.renderOrder = GHOST_RENDER_ORDER;
    group.add(cone);

    // Safe zone circle
    const safeRadius = town.safeZoneRadius ?? 50;
    const circleGeo = createCircleGeometry(safeRadius);
    const circleMat = new THREE.LineBasicMaterial({
      color: SAFE_ZONE_COLOR,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const circle = new THREE.Line(circleGeo, circleMat);
    circle.position.set(sx, LINE_Y, sz);
    circle.renderOrder = GHOST_RENDER_ORDER;
    group.add(circle);

    // Town name label
    const label = createLabelSprite(town.name, TOWN_CONE_COLOR);
    label.position.set(sx, sy + 16, sz);
    group.add(label);

    // Building footprint outlines
    for (const b of town.buildings) {
      const bx = b.position.x + offset;
      const bz = b.position.z + offset;
      const w = (b.size?.width ?? 10) / 2;
      const d = (b.size?.depth ?? 10) / 2;
      const rectGeo = createRectGeometry(bx - w, bx + w, bz - d, bz + d);
      const rectMat = new THREE.LineBasicMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      });
      const rect = new THREE.Line(rectGeo, rectMat);
      rect.position.y = LINE_Y;
      rect.renderOrder = GHOST_RENDER_ORDER;
      group.add(rect);
    }
  }
}

function buildRoadZoneOverlay(
  group: THREE.Group,
  data: NonNullable<WizardPreviewData["roadsZones"]>,
  offset: number,
  queryBiome?: (x: number, z: number) => { height: number; biome: string },
): void {
  // Road path lines
  for (const road of data.roads) {
    if (road.path.length < 2) continue;
    const points = road.path.map((p) => {
      const y = queryBiome ? queryBiome(p.x, p.z).height + 0.5 : p.y + 0.5;
      return new THREE.Vector3(p.x + offset, y, p.z + offset);
    });
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: ROAD_COLOR,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      linewidth: 2,
    });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = GHOST_RENDER_ORDER;
    group.add(line);
  }

  // Zone boundary rectangles
  for (const zone of data.zones) {
    const color = TIER_COLORS[zone.tierIndex] ?? 0x888888;
    const { minX, maxX, minZ, maxZ } = zone.bounds;
    const rectGeo = createRectGeometry(
      minX + offset,
      maxX + offset,
      minZ + offset,
      maxZ + offset,
    );
    const rectMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const rect = new THREE.Line(rectGeo, rectMat);
    rect.position.y = LINE_Y;
    rect.renderOrder = GHOST_RENDER_ORDER;
    group.add(rect);

    // Zone name label at centroid
    const label = createLabelSprite(zone.name, color);
    const cy = queryBiome
      ? queryBiome(zone.centroid.x, zone.centroid.z).height + 8
      : 8;
    label.position.set(zone.centroid.x + offset, cy, zone.centroid.z + offset);
    group.add(label);
  }

  // Spawn point markers
  for (const sp of data.spawnPoints) {
    const sx = sp.position.x + offset;
    const sz = sp.position.z + offset;
    const sy = queryBiome
      ? queryBiome(sp.position.x, sp.position.z).height + 1
      : 1;
    const geo = new THREE.SphereGeometry(2, 8, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: SPAWN_POINT_COLOR,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(sx, sy, sz);
    mesh.renderOrder = GHOST_RENDER_ORDER;
    group.add(mesh);
  }

  // Teleport markers
  for (const tp of data.teleports) {
    const tx = tp.position.x + offset;
    const tz = tp.position.z + offset;
    const ty = queryBiome
      ? queryBiome(tp.position.x, tp.position.z).height + 1
      : 1;
    const geo = new THREE.OctahedronGeometry(2, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: TELEPORT_COLOR,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(tx, ty, tz);
    mesh.renderOrder = GHOST_RENDER_ORDER;
    group.add(mesh);
  }
}

function buildPopulationOverlay(
  group: THREE.Group,
  data: NonNullable<WizardPreviewData["population"]>,
  offset: number,
  queryBiome?: (x: number, z: number) => { height: number; biome: string },
): void {
  // Use InstancedMesh for performance with hundreds of entities
  const mobCount = data.mobSpawns.length;
  const resCount = data.resources.length;

  if (mobCount > 0) {
    const geo = new THREE.SphereGeometry(1, 6, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: MOB_DOT_COLOR,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, mobCount);
    mesh.renderOrder = GHOST_RENDER_ORDER;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < mobCount; i++) {
      const m = data.mobSpawns[i];
      const y = queryBiome
        ? queryBiome(m.position.x, m.position.z).height + 1
        : m.position.y + 1;
      dummy.position.set(m.position.x + offset, y, m.position.z + offset);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  if (resCount > 0) {
    const geo = new THREE.SphereGeometry(0.8, 6, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: RESOURCE_DOT_COLOR,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, resCount);
    mesh.renderOrder = GHOST_RENDER_ORDER;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < resCount; i++) {
      const r = data.resources[i];
      const y = queryBiome
        ? queryBiome(r.position.x, r.position.z).height + 0.8
        : r.position.y + 0.8;
      dummy.position.set(r.position.x + offset, y, r.position.z + offset);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // Mine area previews — organic shaped discs + outline + name labels
  if (data.mines && data.mines.length > 0) {
    for (const mine of data.mines) {
      const mx = mine.position.x + offset;
      const mz = mine.position.z + offset;
      const my = queryBiome
        ? queryBiome(mine.position.x, mine.position.z).height + 0.3
        : mine.position.y + 0.3;

      const offsets = mine.radialOffsets;
      const segments = 48;

      // Build organic outline points
      const outlinePoints: THREE.Vector3[] = [];
      for (let si = 0; si <= segments; si++) {
        const theta = (si / segments) * Math.PI * 2;
        let r = mine.radius;
        if (offsets && offsets.length > 0) {
          const n = offsets.length;
          const seg = (theta / (Math.PI * 2)) * n;
          const idx = Math.floor(seg);
          const f = seg - idx;
          const v0 = offsets[idx % n];
          const v1 = offsets[(idx + 1) % n];
          const t = 0.5 * (1 - Math.cos(Math.PI * f));
          r = mine.radius * (v0 + (v1 - v0) * t);
        }
        outlinePoints.push(
          new THREE.Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r),
        );
      }

      // Translucent filled shape (fan triangulation from center)
      const fillVerts = new Float32Array((segments + 2) * 3);
      // Center vertex
      fillVerts[0] = 0;
      fillVerts[1] = 0;
      fillVerts[2] = 0;
      for (let si = 0; si <= segments; si++) {
        const vi = (si + 1) * 3;
        fillVerts[vi] = outlinePoints[Math.min(si, outlinePoints.length - 1)].x;
        fillVerts[vi + 1] = 0;
        fillVerts[vi + 2] =
          outlinePoints[Math.min(si, outlinePoints.length - 1)].z;
      }
      const fillIndices: number[] = [];
      for (let si = 0; si < segments; si++) {
        fillIndices.push(0, si + 1, si + 2);
      }
      const fillGeo = new THREE.BufferGeometry();
      fillGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(fillVerts, 3),
      );
      fillGeo.setIndex(fillIndices);

      const discMat = new THREE.MeshBasicMaterial({
        color: MINE_FILL_COLOR,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(fillGeo, discMat);
      disc.position.set(mx, my, mz);
      disc.renderOrder = GHOST_RENDER_ORDER;
      group.add(disc);

      // Organic outline
      const outlineGeo = new THREE.BufferGeometry().setFromPoints(
        outlinePoints,
      );
      const circleMat = new THREE.LineBasicMaterial({
        color: MINE_OUTLINE_COLOR,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      });
      const circle = new THREE.Line(outlineGeo, circleMat);
      circle.position.set(mx, my + 0.1, mz);
      circle.renderOrder = GHOST_RENDER_ORDER;
      group.add(circle);

      // Entry direction arrow — shows where the C-shape opening faces
      if (mine.entryAngle !== undefined) {
        const ea = mine.entryAngle;
        const arrowLen = mine.radius * 0.6;
        const arrowTip = new THREE.Vector3(
          Math.cos(ea) * arrowLen,
          0,
          Math.sin(ea) * arrowLen,
        );
        const arrowBase = new THREE.Vector3(
          Math.cos(ea) * mine.radius * 0.3,
          0,
          Math.sin(ea) * mine.radius * 0.3,
        );
        // Arrow shaft
        const arrowGeo = new THREE.BufferGeometry().setFromPoints([
          arrowBase,
          arrowTip,
        ]);
        const arrowMat = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        });
        const arrow = new THREE.Line(arrowGeo, arrowMat);
        arrow.position.set(mx, my + 0.2, mz);
        arrow.renderOrder = GHOST_RENDER_ORDER;
        group.add(arrow);
      }

      // Mine name label
      const label = createLabelSprite(mine.name, MINE_OUTLINE_COLOR);
      label.position.set(mx, my + 6, mz);
      group.add(label);
    }
  }
}

// ============== HOOK ==============

export function useWizardPreviewOverlay(
  sceneRefs: TerrainSceneRefs | null,
): void {
  const { state } = useWorldStudio();
  const overlayGroup = useRef<THREE.Group | null>(null);
  const sceneRefsRef = useRef(sceneRefs);
  sceneRefsRef.current = sceneRefs;

  const wizardPreview = state.wizardPreview;

  useEffect(() => {
    if (!sceneRefs) return;

    // Tear down previous group — cancel staged additions, remove from scene,
    // defer GPU resource disposal
    if (overlayGroup.current) {
      cancelStagedAdditions(overlayGroup.current);
      sceneRefs.scene.remove(overlayGroup.current);
      deferredDisposeGroup(overlayGroup.current);
      overlayGroup.current = null;
    }

    // Nothing to render if no preview data
    if (!wizardPreview) return;

    // Build children into a temporary group, then stage them in batches
    const tmpGroup = new THREE.Group();
    const offset = wizardPreview.worldCenterOffset;
    const queryBiome = sceneRefs.queryBiome;

    // Town stage preview
    if (wizardPreview.towns) {
      buildTownOverlay(tmpGroup, wizardPreview.towns, offset, queryBiome);
    }

    // Roads + Zones stage preview
    if (wizardPreview.roadsZones) {
      buildRoadZoneOverlay(
        tmpGroup,
        wizardPreview.roadsZones,
        offset,
        queryBiome,
      );
    }

    // Population stage preview
    if (wizardPreview.population) {
      buildPopulationOverlay(
        tmpGroup,
        wizardPreview.population,
        offset,
        queryBiome,
      );
    }

    // Add empty group to scene, stage children in batches
    const group = new THREE.Group();
    group.name = "wizard-preview-overlay";
    group.renderOrder = GHOST_RENDER_ORDER;
    sceneRefs.scene.add(group);
    overlayGroup.current = group;

    const children = [...tmpGroup.children];
    tmpGroup.clear();
    for (const child of children) {
      stageAddition(child, group);
    }
  }, [sceneRefs, wizardPreview]);

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
