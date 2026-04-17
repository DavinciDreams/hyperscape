/**
 * HyperscapeGameMode integration tests — Phase 2.
 *
 * Validates the opt-in registration path, the composition
 * (ClickToWalk + Orbit + hyperscape-default), and the lifecycle
 * semantics (idempotent attach/detach, emit target event on attach,
 * clear target on detach).
 *
 * The tests use a minimal World stub: `emit`, `getSystem`, `camera`.
 * That's all the Phase 2 facades touch.
 */

import * as THREE from "three";
import { describe, it, expect, beforeEach } from "vitest";

import { GameModeRegistry } from "../GameModeRegistry";
import {
  HYPERSCAPE_DEFAULT_MANIFEST,
  registerHyperscapeGameMode,
} from "../HyperscapeGameMode";
import {
  CLICK_TO_WALK_CONTROLLER_ID,
  ClickToWalkPlayerController,
} from "../controllers/ClickToWalkPlayerController";
import {
  ORBIT_CAMERA_CONTROLLER_ID,
  OrbitCameraController,
} from "../cameras/OrbitCameraController";
import { HYPERSCAPE_DEFAULT_CONTEXT_ID } from "../input/defaultContexts";
import type { GameModeContext } from "../GameMode";
import type { World } from "../../core/World";
import type { Pawn } from "../pawns/Pawn";

// Minimal world stub — only the surface the Phase 2 facades touch.
interface EmittedEvent {
  type: string;
  data: unknown;
}

function makeWorldStub(): {
  world: World;
  emitted: EmittedEvent[];
  camera: THREE.PerspectiveCamera;
} {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
  const emitted: EmittedEvent[] = [];
  const world = {
    camera,
    emit: (type: string, data: unknown) => {
      emitted.push({ type, data });
    },
    getSystem: () => null,
  } as unknown as World;
  return { world, emitted, camera };
}

function makePawnStub(id = "pawn-1"): Pawn & {
  possessCount: number;
  unpossessCount: number;
} {
  const object = new THREE.Object3D();
  object.position.set(1, 2, 3);
  let possessCount = 0;
  let unpossessCount = 0;
  const pawn = {
    id,
    object,
    position: object.position,
    possess: () => {
      possessCount++;
    },
    unpossess: () => {
      unpossessCount++;
    },
    get possessCount() {
      return possessCount;
    },
    get unpossessCount() {
      return unpossessCount;
    },
  };
  return pawn as Pawn & { possessCount: number; unpossessCount: number };
}

describe("HyperscapeGameMode", () => {
  let registry: GameModeRegistry;

  beforeEach(() => {
    registry = new GameModeRegistry();
    registerHyperscapeGameMode(registry);
  });

  it("registers under 'click-to-walk'", () => {
    expect(registry.has(CLICK_TO_WALK_CONTROLLER_ID)).toBe(true);
  });

  it("default manifest points at every canonical id", () => {
    expect(HYPERSCAPE_DEFAULT_MANIFEST.playerController).toBe(
      CLICK_TO_WALK_CONTROLLER_ID,
    );
    expect(HYPERSCAPE_DEFAULT_MANIFEST.camera).toBe(ORBIT_CAMERA_CONTROLLER_ID);
    expect(HYPERSCAPE_DEFAULT_MANIFEST.inputContext).toBe(
      HYPERSCAPE_DEFAULT_CONTEXT_ID,
    );
    expect(HYPERSCAPE_DEFAULT_MANIFEST.pawn).toBe("humanoid-rpg");
  });

  it("resolves to a mode that composes all three controllers", () => {
    const { world } = makeWorldStub();
    const ctx: GameModeContext = { world, runtime: "client" };
    const mode = registry.resolve(HYPERSCAPE_DEFAULT_MANIFEST, ctx);

    expect(mode.id).toBe(CLICK_TO_WALK_CONTROLLER_ID);
    expect(mode.manifest).toBe(HYPERSCAPE_DEFAULT_MANIFEST);

    const player = mode.createPlayerController(ctx);
    const camera = mode.createCameraController(ctx);
    const input = mode.createInputContext(ctx);

    expect(player).toBeInstanceOf(ClickToWalkPlayerController);
    expect(camera).toBeInstanceOf(OrbitCameraController);
    expect(player.id).toBe(CLICK_TO_WALK_CONTROLLER_ID);
    expect(camera.id).toBe(ORBIT_CAMERA_CONTROLLER_ID);
    expect(input.id).toBe(HYPERSCAPE_DEFAULT_CONTEXT_ID);
  });

  it("input context exposes Move/Look/Interact/Run/Jump", () => {
    const { world } = makeWorldStub();
    const ctx: GameModeContext = { world, runtime: "client" };
    const mode = registry.resolve(HYPERSCAPE_DEFAULT_MANIFEST, ctx);
    const input = mode.createInputContext(ctx);

    for (const action of ["Move", "Look", "Interact", "Run", "Jump"]) {
      expect(Array.isArray(input.actions[action])).toBe(true);
      expect(input.actions[action].length).toBeGreaterThan(0);
    }
  });

  it("activate/deactivate are no-op and idempotent", () => {
    const { world, emitted } = makeWorldStub();
    const ctx: GameModeContext = { world, runtime: "client" };
    const mode = registry.resolve(HYPERSCAPE_DEFAULT_MANIFEST, ctx);
    const input = mode.createInputContext(ctx);

    input.activate(world);
    input.activate(world);
    input.deactivate(world);
    input.deactivate(world);
    // Default context intentionally does not emit; ClientInput
    // already owns Hyperscape's native bindings.
    expect(emitted).toEqual([]);
  });
});

describe("ClickToWalkPlayerController lifecycle", () => {
  it("attach possesses pawn and activates input exactly once", () => {
    const { world } = makeWorldStub();
    const ctx: GameModeContext = { world, runtime: "client" };
    const registry = new GameModeRegistry();
    registerHyperscapeGameMode(registry);
    const mode = registry.resolve(HYPERSCAPE_DEFAULT_MANIFEST, ctx);
    const player = mode.createPlayerController(ctx);
    const pawn = makePawnStub();
    const input = mode.createInputContext(ctx);

    let activateCalls = 0;
    let deactivateCalls = 0;
    const trackingInput = {
      ...input,
      activate: () => {
        activateCalls++;
      },
      deactivate: () => {
        deactivateCalls++;
      },
    };

    player.attach(pawn, trackingInput);
    player.attach(pawn, trackingInput); // idempotent

    expect(pawn.possessCount).toBe(1);
    expect(activateCalls).toBe(1);

    player.detach();
    player.detach(); // idempotent

    expect(pawn.unpossessCount).toBe(1);
    expect(deactivateCalls).toBe(1);
  });

  it("tick is a no-op (InteractionRouter owns its own lifecycle)", () => {
    const { world } = makeWorldStub();
    const player = new ClickToWalkPlayerController(world);
    // Should not throw even without attach.
    expect(() => player.tick(0.016)).not.toThrow();
  });
});

describe("OrbitCameraController lifecycle", () => {
  it("attach emits camera:set_target with the pawn", () => {
    const { world, emitted } = makeWorldStub();
    const camera = new OrbitCameraController(world);
    const pawn = makePawnStub("orbit-target");

    camera.attach(pawn);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe("camera:set_target");
    expect((emitted[0].data as { target: unknown }).target).toBe(pawn);
  });

  it("detach does not clear camera target (matches legacy teardown)", () => {
    const { world, emitted } = makeWorldStub();
    const camera = new OrbitCameraController(world);
    const pawn = makePawnStub();
    camera.attach(pawn);
    camera.detach();
    // Only the attach emit — the detach intentionally doesn't clear
    // target because CAMERA_SET_TARGET's payload doesn't accept null
    // and ClientCameraSystem retains its last target until re-attached.
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe("camera:set_target");
  });

  it("attach / detach are idempotent", () => {
    const { world, emitted } = makeWorldStub();
    const camera = new OrbitCameraController(world);
    const pawn = makePawnStub();
    camera.attach(pawn);
    camera.attach(pawn);
    camera.detach();
    camera.detach();
    // only one attach emit, no detach emit
    expect(emitted).toHaveLength(1);
  });

  it("getCamera returns world.camera", () => {
    const { world, camera: sceneCamera } = makeWorldStub();
    const controller = new OrbitCameraController(world);
    expect(controller.getCamera()).toBe(sceneCamera);
  });
});
