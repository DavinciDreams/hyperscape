/**
 * @vitest-environment jsdom
 *
 * PIE roundtrip test — Phase 7.2.
 *
 * Mirrors the `usePIESession` flow end-to-end at the unit level:
 *
 *   manifest → GameModeRegistry.resolve → createPlayerController
 *   → attach(pawn, inputCtx) → dispatch a real input event → tick(dt)
 *   → pawn position advances
 *
 * The full Playwright harness is integration-test territory (needs the
 * asset-forge viewport container, Three.js+PhysX, a real server, etc.).
 * This test proves the *contract boundary* PIE cares about: given a
 * persisted manifest, the resolved controller actually drives the pawn
 * when driven by its input source. If the registry, factory, or
 * controller wiring regresses, this catches it in milliseconds.
 *
 * Covers:
 * - WASD manifest: keyboard → pawn position delta.
 * - Top-down manifest: viewport pointerdown → pawn walks toward hit.
 * - Hyperia (click-to-walk) manifest: tick is a facade no-op (the
 *   real `InteractionRouter` owns routing), so position stays put —
 *   this asserts the facade doesn't accidentally gain behavior.
 */

import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";

import { GameModeRegistry } from "../GameModeRegistry";
import {
  HYPERIA_DEFAULT_MANIFEST,
  registerHyperiaGameMode,
} from "../HyperiaGameMode";
import {
  TOP_DOWN_DEFAULT_MANIFEST,
  WASD_DEFAULT_MANIFEST,
  registerAlternateGameModes,
} from "../AlternateGameModes";
import type { GameModeContext } from "../GameMode";
import type { World } from "../../core/World";
import type { Pawn } from "../pawns/Pawn";
import { PIEInteractionRouterShim } from "../../runtime/pieShims/PIEInteractionRouterShim";

interface RoundtripWorld extends World {
  viewport?: HTMLElement;
}

function makeWorldStub(viewport?: HTMLElement): RoundtripWorld {
  const world = {
    camera: new THREE.PerspectiveCamera(70, 1, 0.1, 1000),
    emit: () => {},
    getSystem: () => null,
  } as unknown as RoundtripWorld;
  if (viewport) {
    world.viewport = viewport;
  }
  // Position the camera a couple units above origin so a ground-plane
  // raycast through viewport center actually hits near origin.
  world.camera.position.set(0, 10, 0.0001);
  world.camera.lookAt(0, 0, 0);
  world.camera.updateMatrixWorld();
  return world;
}

function makePawnStub(): Pawn {
  const object = new THREE.Object3D();
  return {
    id: "pie-pawn",
    object,
    position: object.position,
    possess: () => {},
    unpossess: () => {},
  };
}

describe("PIE roundtrip — manifest drives pawn", () => {
  let registry: GameModeRegistry;

  beforeEach(() => {
    registry = new GameModeRegistry();
    registerHyperiaGameMode(registry);
    registerAlternateGameModes(registry);
  });

  it("WASD manifest: KeyW keydown + tick advances the pawn along its forward", () => {
    const world = makeWorldStub();
    const ctx: GameModeContext = { world, runtime: "pie" };
    const mode = registry.resolve(WASD_DEFAULT_MANIFEST, ctx);
    const pc = mode.createPlayerController(ctx);
    const ic = mode.createInputContext(ctx);
    const pawn = makePawnStub();

    pc.attach(pawn, ic);

    const before = pawn.object.position.clone();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    pc.tick(0.1); // 100ms
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));

    // WASD_SPEED is 4 u/s, so a 100ms tick should move ~0.4 units. We
    // assert "moved at all" to stay robust to constant tweaks; the
    // contract tests already cover the exact factory shape.
    const moved = pawn.object.position.clone().sub(before).length();
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(1); // sanity — not a runaway tick

    pc.detach();
  });

  it("WASD manifest: with no keys held, tick does not move the pawn", () => {
    const world = makeWorldStub();
    const ctx: GameModeContext = { world, runtime: "pie" };
    const mode = registry.resolve(WASD_DEFAULT_MANIFEST, ctx);
    const pc = mode.createPlayerController(ctx);
    const ic = mode.createInputContext(ctx);
    const pawn = makePawnStub();

    pc.attach(pawn, ic);
    const before = pawn.object.position.clone();
    pc.tick(0.1);
    const delta = pawn.object.position.clone().sub(before).length();
    expect(delta).toBe(0);

    pc.detach();
  });

  it("top-down manifest: viewport pointerdown + tick walks toward hit", () => {
    // The jsdom viewport needs non-zero bounds; width/height = 100 gives
    // us a center at (50, 50) which maps cleanly to NDC (0, 0).
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

    const world = makeWorldStub(viewport);
    const ctx: GameModeContext = { world, runtime: "pie" };
    const mode = registry.resolve(TOP_DOWN_DEFAULT_MANIFEST, ctx);
    const pc = mode.createPlayerController(ctx);
    const ic = mode.createInputContext(ctx);
    const pawn = makePawnStub();
    // Start the pawn offset so a raycast to origin gives us a direction
    // to measure against.
    pawn.object.position.set(5, 0, 5);

    pc.attach(pawn, ic);

    const before = pawn.object.position.clone();
    const evt = new Event("pointerdown") as unknown as PointerEvent;
    Object.defineProperties(evt, {
      button: { value: 0 },
      clientX: { value: 50 }, // viewport center → NDC (0, 0)
      clientY: { value: 50 },
    });
    viewport.dispatchEvent(evt);
    pc.tick(0.1);

    const after = pawn.object.position;
    const moved = after.clone().sub(before).length();
    expect(moved).toBeGreaterThan(0);
    // The click targets origin, so the pawn should have moved TOWARD origin.
    expect(after.clone().length()).toBeLessThan(before.clone().length());

    pc.detach();
    document.body.removeChild(viewport);
  });

  it("click-to-walk manifest: viewport click + router-shim tick advances pawn", () => {
    // Phase 2 wiring: PlayTestWorld registers `PIEInteractionRouterShim`
    // under the `"interaction-router"` system id. The controller itself
    // stays a facade — all the routing logic lives in the shim. Here
    // we build the same topology the PIE world does and assert that a
    // viewport click → shim tick moves the pawn, matching the
    // "click-to-walk works in PIE" exit criterion.
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

    const world = makeWorldStub(viewport);
    const systems = new Map<string, unknown>();
    const shim = new PIEInteractionRouterShim({
      viewport,
      camera: world.camera,
      bus: { emit: () => {} },
    });
    systems.set("interaction-router", shim);
    // Override getSystem so the click-to-walk controller's diagnostic
    // chain resolves to the shim (mirrors PlayTestWorld.getSystem).
    (world as unknown as { getSystem: (id: string) => unknown }).getSystem = (
      id: string,
    ) => systems.get(id) ?? null;

    const ctx: GameModeContext = { world, runtime: "pie" };
    const mode = registry.resolve(HYPERIA_DEFAULT_MANIFEST, ctx);
    const pc = mode.createPlayerController(ctx);
    const ic = mode.createInputContext(ctx);
    const pawn = makePawnStub();
    pawn.object.position.set(5, 0, 5);
    shim.setPawn(pawn);

    pc.attach(pawn, ic);
    const before = pawn.object.position.clone();

    const evt = new Event("pointerdown") as unknown as PointerEvent;
    Object.defineProperties(evt, {
      button: { value: 0 },
      clientX: { value: 50 }, // center → NDC (0, 0), ray hits near origin
      clientY: { value: 50 },
    });
    viewport.dispatchEvent(evt);

    // The controller's own tick stays a facade; the shim owns
    // per-frame movement.
    pc.tick(0.25);
    shim.tick(0.25);

    const moved = pawn.object.position.clone().sub(before).length();
    expect(moved).toBeGreaterThan(0);
    // Click target is near origin, so the pawn's distance to origin
    // should shrink.
    expect(pawn.object.position.clone().length()).toBeLessThan(before.length());

    pc.detach();
    shim.dispose();
    document.body.removeChild(viewport);
  });

  it("switching manifests mid-harness produces controllers with different ids", () => {
    // Mirrors the PIE flow where a game record's manifest changes
    // between sessions. Each resolve yields a fresh controller keyed to
    // its manifest — no caching-induced drift.
    const world = makeWorldStub();
    const ctx: GameModeContext = { world, runtime: "pie" };

    const hyperiaMode = registry.resolve(HYPERIA_DEFAULT_MANIFEST, ctx);
    const wasdMode = registry.resolve(WASD_DEFAULT_MANIFEST, ctx);
    const topDownMode = registry.resolve(TOP_DOWN_DEFAULT_MANIFEST, ctx);

    expect(hyperiaMode.createPlayerController(ctx).id).toBe("click-to-walk");
    expect(wasdMode.createPlayerController(ctx).id).toBe("wasd");
    expect(topDownMode.createPlayerController(ctx).id).toBe("top-down");
  });
});
