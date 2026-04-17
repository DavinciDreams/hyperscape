/**
 * GameMode contract tests — Phase 7.1.
 *
 * Every GameMode registered in the shared registry must:
 * - Resolve through `GameModeRegistry.resolve(manifest, ctx)`.
 * - Produce non-null `PlayerController`, `CameraController`, and
 *   `InputContext` instances from its `create*` factories.
 * - Each controller's `id` must be a non-empty string (the registry
 *   and editor drift checks key off ids).
 * - The `InputContext` must expose a frozen `actions` binding map.
 *
 * This test registers BOTH the Hyperia default mode AND the Phase 5
 * alternate modes, then walks each registered id, resolves its mode
 * with a minimal World stub, and asserts the contract.
 */

import * as THREE from "three";
import { describe, it, expect, beforeEach } from "vitest";

import { GameModeRegistry } from "../GameModeRegistry";
import {
  HYPERIA_DEFAULT_MANIFEST,
  registerHyperiaGameMode,
} from "../HyperiaGameMode";
import {
  FPS_DEFAULT_MANIFEST,
  TOP_DOWN_DEFAULT_MANIFEST,
  WASD_DEFAULT_MANIFEST,
  registerAlternateGameModes,
} from "../AlternateGameModes";
import type { GameModeContext, GameModeManifest } from "../GameMode";
import type { World } from "../../core/World";
import type { Pawn } from "../pawns/Pawn";

function makeWorldStub(): World {
  return {
    camera: new THREE.PerspectiveCamera(70, 1, 0.1, 1000),
    emit: () => {},
    getSystem: () => null,
  } as unknown as World;
}

function makePawnStub(): Pawn {
  const object = new THREE.Object3D();
  return {
    id: "contract-pawn",
    object,
    position: object.position,
    possess: () => {},
    unpossess: () => {},
  };
}

describe("GameMode contract — registered modes", () => {
  let registry: GameModeRegistry;
  let ctx: GameModeContext;

  beforeEach(() => {
    registry = new GameModeRegistry();
    registerHyperiaGameMode(registry);
    registerAlternateGameModes(registry);
    ctx = {
      world: makeWorldStub(),
      runtime: "client",
    };
  });

  const cases: Array<{ name: string; manifest: GameModeManifest }> = [
    {
      name: "hyperia default (click-to-walk + orbit)",
      manifest: HYPERIA_DEFAULT_MANIFEST,
    },
    { name: "wasd + orbit", manifest: WASD_DEFAULT_MANIFEST },
    { name: "wasd + first-person (FPS)", manifest: FPS_DEFAULT_MANIFEST },
    { name: "top-down + fixed-angle", manifest: TOP_DOWN_DEFAULT_MANIFEST },
  ];

  for (const { name, manifest } of cases) {
    describe(name, () => {
      it("resolves via registry", () => {
        const mode = registry.resolve(manifest, ctx);
        expect(mode).toBeDefined();
        expect(mode.id).toBe(manifest.playerController);
      });

      it("createPlayerController returns a non-null controller with a non-empty id", () => {
        const mode = registry.resolve(manifest, ctx);
        const pc = mode.createPlayerController(ctx);
        expect(pc).toBeDefined();
        expect(typeof pc.id).toBe("string");
        expect(pc.id.length).toBeGreaterThan(0);
        expect(typeof pc.attach).toBe("function");
        expect(typeof pc.tick).toBe("function");
        expect(typeof pc.detach).toBe("function");
      });

      it("createCameraController returns a non-null camera controller with a non-empty id", () => {
        const mode = registry.resolve(manifest, ctx);
        const cc = mode.createCameraController(ctx);
        expect(cc).toBeDefined();
        expect(typeof cc.id).toBe("string");
        expect(cc.id.length).toBeGreaterThan(0);
        expect(typeof cc.attach).toBe("function");
        expect(typeof cc.tick).toBe("function");
        expect(typeof cc.detach).toBe("function");
        expect(typeof cc.getCamera).toBe("function");
        expect(cc.getCamera()).toBe(ctx.world.camera);
      });

      it("createInputContext returns a context with a frozen actions map", () => {
        const mode = registry.resolve(manifest, ctx);
        const ic = mode.createInputContext(ctx);
        expect(ic).toBeDefined();
        expect(typeof ic.id).toBe("string");
        expect(ic.id.length).toBeGreaterThan(0);
        expect(ic.actions).toBeDefined();
        expect(Object.isFrozen(ic.actions)).toBe(true);
        expect(typeof ic.activate).toBe("function");
        expect(typeof ic.deactivate).toBe("function");
      });
    });
  }

  it("every registered id resolves with its own id as the default manifest key", () => {
    for (const id of registry.ids()) {
      // Each controller id must at minimum resolve when paired with
      // *some* sane camera/context. We use the canonical manifests
      // above, keyed by playerController id.
      const manifest =
        id === "click-to-walk"
          ? HYPERIA_DEFAULT_MANIFEST
          : id === "wasd"
            ? WASD_DEFAULT_MANIFEST
            : id === "top-down"
              ? TOP_DOWN_DEFAULT_MANIFEST
              : null;
      expect(manifest, `no canonical manifest for id "${id}"`).not.toBeNull();
      const mode = registry.resolve(manifest!, ctx);
      expect(mode.id).toBe(id);
    }
  });
});

describe("GameMode contract — lifecycle", () => {
  it("alternate controller attach/detach does not throw and is idempotent", () => {
    const registry = new GameModeRegistry();
    registerAlternateGameModes(registry);
    const ctx: GameModeContext = {
      world: makeWorldStub(),
      runtime: "client",
    };
    const mode = registry.resolve(WASD_DEFAULT_MANIFEST, ctx);
    const pc = mode.createPlayerController(ctx);
    const ic = mode.createInputContext(ctx);
    const pawn = makePawnStub();

    expect(() => pc.attach(pawn, ic)).not.toThrow();
    // second attach is a no-op — idempotent.
    expect(() => pc.attach(pawn, ic)).not.toThrow();
    expect(() => pc.tick(0.016)).not.toThrow();
    expect(() => pc.detach()).not.toThrow();
    // second detach is a no-op.
    expect(() => pc.detach()).not.toThrow();
  });
});
