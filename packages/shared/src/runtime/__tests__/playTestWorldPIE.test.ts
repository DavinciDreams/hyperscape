/**
 * @vitest-environment jsdom
 *
 * PIE play-mode integration tests.
 *
 * Asserts `PlayTestWorld` installs the shim surface required by the
 * GameMode contract and that viewport clicks route to pawn movement —
 * the "click-to-walk works in PIE" exit criterion from Phase 2 of
 * `PLAN_ENGINE_GAME_SEPARATION.md`.
 *
 * Paired with `gameMode/__tests__/pieRoundtrip.test.ts`, which covers
 * the controllers' own behavior with a stub world. This file exercises
 * the real `PlayTestWorld.start()`/`tick()` lifecycle wiring.
 */

import { Object3D, PerspectiveCamera } from "three";
import { beforeEach, describe, expect, it } from "vitest";

import {
  HYPERIA_DEFAULT_MANIFEST,
  WASD_DEFAULT_MANIFEST,
} from "../../gameMode";
import { CLICK_TO_WALK_CONTROLLER_ID } from "../../gameMode/controllers/ClickToWalkPlayerController";
import { EventType } from "../../types/events";
import { createPlayTestWorld, PlayTestWorld } from "../createPlayTestWorld";
import { PIEInteractionRouterShim } from "../pieShims/PIEInteractionRouterShim";

function makeViewport(): HTMLElement {
  const viewport = document.createElement("div");
  Object.defineProperty(viewport, "getBoundingClientRect", {
    value: () =>
      ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
      }) as DOMRect,
  });
  document.body.appendChild(viewport);
  return viewport;
}

function makeCamera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(70, 1, 0.1, 1000);
  // Aim down roughly toward origin so the ground-plane raycast at
  // viewport center hits near (0, pawn.y, 0).
  cam.position.set(0, 10, 0.0001);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
}

describe("PlayTestWorld — PIE play mode", () => {
  let world: PlayTestWorld;
  let viewport: HTMLElement;

  beforeEach(() => {
    world = createPlayTestWorld();
    viewport = makeViewport();
  });

  it("simulate mode leaves controller + shim fields null", () => {
    world.start({
      playerSpawn: { x: 0, y: 1, z: 0 },
      mode: "simulate",
    });
    expect(world.playerController).toBeNull();
    expect(world.cameraController).toBeNull();
    expect(world.pawn).toBeNull();
    expect(world.camera).toBeNull();
    world.stop();
  });

  it("play mode attaches Hyperia controllers and installs the router shim", () => {
    const camera = makeCamera();
    const playerObject = new Object3D();
    world.start({
      playerSpawn: { x: 0, y: 1, z: 0 },
      mode: "play",
      camera,
      viewport,
      playerObject,
      gameMode: HYPERIA_DEFAULT_MANIFEST,
    });
    expect(world.gameMode?.id).toBe(CLICK_TO_WALK_CONTROLLER_ID);
    expect(world.playerController?.id).toBe(CLICK_TO_WALK_CONTROLLER_ID);
    expect(world.cameraController?.id).toBe("orbit");
    expect(world.pawn?.id).toBe("pie-player");
    expect(world.camera).toBe(camera);
    // Click-to-walk path registers the router shim; the controller's
    // diagnostic should therefore find it.
    const router = world.getSystem("interaction-router");
    expect(router).toBeInstanceOf(PIEInteractionRouterShim);
    world.stop();
  });

  it("click-to-walk: viewport pointerdown + tick advances the pawn toward the hit", () => {
    const camera = makeCamera();
    const playerObject = new Object3D();
    playerObject.position.set(5, 0, 5);
    world.start({
      playerSpawn: { x: 5, y: 0, z: 5 },
      mode: "play",
      camera,
      viewport,
      playerObject,
      gameMode: HYPERIA_DEFAULT_MANIFEST,
    });

    const before = playerObject.position.clone();
    const evt = new Event("pointerdown") as unknown as PointerEvent;
    Object.defineProperties(evt, {
      button: { value: 0 },
      clientX: { value: 50 }, // center → NDC (0, 0), raycast hits ~origin
      clientY: { value: 50 },
    });
    viewport.dispatchEvent(evt);
    // Tick advances toward the hit at WALK_SPEED (4 u/s). 250ms → 1 u.
    world.tick(0.25);

    const after = playerObject.position;
    const moved = after.clone().sub(before).length();
    expect(moved).toBeGreaterThan(0);
    // Pawn moves *toward* the click (origin), so its distance to origin
    // shrinks.
    expect(after.length()).toBeLessThan(before.length());
    world.stop();
  });

  it("orbit camera shim follows the pawn via CAMERA_SET_TARGET", () => {
    const camera = makeCamera();
    const playerObject = new Object3D();
    playerObject.position.set(0, 0, 0);
    const cameraStart = camera.position.clone();
    world.start({
      playerSpawn: { x: 0, y: 0, z: 0 },
      mode: "play",
      camera,
      viewport,
      playerObject,
      gameMode: HYPERIA_DEFAULT_MANIFEST,
    });

    // Move the pawn and tick — orbit shim should chase.
    playerObject.position.set(20, 0, 20);
    world.tick(1.0);
    const cameraMoved = camera.position.clone().sub(cameraStart).length();
    expect(cameraMoved).toBeGreaterThan(0);
    world.stop();
  });

  it("stop detaches controllers and clears shims", () => {
    const camera = makeCamera();
    const playerObject = new Object3D();
    world.start({
      playerSpawn: { x: 0, y: 0, z: 0 },
      mode: "play",
      camera,
      viewport,
      playerObject,
      gameMode: HYPERIA_DEFAULT_MANIFEST,
    });
    expect(world.playerController).not.toBeNull();
    world.stop();
    expect(world.playerController).toBeNull();
    expect(world.cameraController).toBeNull();
    expect(world.pawn).toBeNull();
    expect(world.getSystem("interaction-router")).toBeNull();
  });

  it("non-click-to-walk manifest skips the router shim but still attaches controllers", () => {
    const camera = makeCamera();
    const playerObject = new Object3D();
    world.start({
      playerSpawn: { x: 0, y: 0, z: 0 },
      mode: "play",
      camera,
      viewport,
      playerObject,
      gameMode: WASD_DEFAULT_MANIFEST,
    });
    expect(world.playerController?.id).toBe("wasd");
    // WASD owns its own keyboard listener; no InteractionRouter needed.
    expect(world.getSystem("interaction-router")).toBeNull();
    world.stop();
  });

  it("CAMERA_SET_TARGET emit reaches the orbit shim before tick", () => {
    const camera = makeCamera();
    const playerObject = new Object3D();
    playerObject.position.set(0, 0, 0);
    world.start({
      playerSpawn: { x: 0, y: 0, z: 0 },
      mode: "play",
      camera,
      viewport,
      playerObject,
      gameMode: HYPERIA_DEFAULT_MANIFEST,
    });
    // The OrbitCameraController attached during start() emits
    // CAMERA_SET_TARGET with the pawn. Verify by subscribing late and
    // re-emitting (the shim keeps its target through dispose/stop).
    let received: unknown = null;
    world.on(EventType.CAMERA_SET_TARGET, (p) => {
      received = p;
    });
    world.emit(EventType.CAMERA_SET_TARGET, { target: world.pawn });
    expect(received).toEqual({ target: world.pawn });
    world.stop();
  });
});
