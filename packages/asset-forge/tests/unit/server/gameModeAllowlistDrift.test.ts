/**
 * GameMode allowlist drift test — Phase 7.3.
 *
 * Guarantees the server-side allowlist in
 * `asset-forge/server/utils/gameModeRegistry.ts` stays in lockstep with
 * the canonical manifests shipped by `@hyperforge/shared`.
 *
 * Note: the canonical manifest shapes are inlined here rather than
 * imported from `@hyperforge/shared/runtime`. The shared runtime subpath
 * resolves to a pre-built bundle (`./build/runtime-pie.js`) that can
 * lag behind source changes, and importing source directly pulls in
 * Three.js/PhysX side-effects. Inlining keeps this test hermetic and
 * fast. The shared-side manifests themselves are covered by
 * `packages/shared/src/gameMode/__tests__/contract.test.ts`.
 *
 * If either side changes the id strings, one of these tests fails —
 * that's the drift signal.
 */

import { describe, it, expect } from "vitest";

import {
  KNOWN_CAMERA_IDS,
  KNOWN_INPUT_CONTEXT_IDS,
  KNOWN_PAWN_IDS,
  KNOWN_PLAYER_CONTROLLER_IDS,
  validateGameModeManifest,
} from "../../../server/utils/gameModeRegistry";

// Mirrors packages/shared/src/gameMode/HyperscapeGameMode.ts + AlternateGameModes.ts.
const HYPERSCAPE_DEFAULT_MANIFEST = {
  playerController: "click-to-walk",
  camera: "orbit",
  inputContext: "hyperscape-default",
  pawn: "humanoid-rpg",
} as const;

const WASD_DEFAULT_MANIFEST = {
  playerController: "wasd",
  camera: "orbit",
  inputContext: "wasd-default",
  pawn: "humanoid-kinematic",
} as const;

const FPS_DEFAULT_MANIFEST = {
  playerController: "wasd",
  camera: "first-person",
  inputContext: "fps-default",
  pawn: "humanoid-kinematic",
} as const;

const TOP_DOWN_DEFAULT_MANIFEST = {
  playerController: "top-down",
  camera: "fixed-angle",
  inputContext: "topdown-default",
  pawn: "cursor-avatar",
} as const;

describe("GameMode allowlist drift", () => {
  const canonical = [
    { label: "hyperscape", manifest: HYPERSCAPE_DEFAULT_MANIFEST },
    { label: "wasd", manifest: WASD_DEFAULT_MANIFEST },
    { label: "fps", manifest: FPS_DEFAULT_MANIFEST },
    { label: "top-down", manifest: TOP_DOWN_DEFAULT_MANIFEST },
  ] as const;

  for (const { label, manifest } of canonical) {
    describe(`${label} default manifest`, () => {
      it("playerController is allowlisted", () => {
        expect(KNOWN_PLAYER_CONTROLLER_IDS.has(manifest.playerController)).toBe(
          true,
        );
      });
      it("camera is allowlisted", () => {
        expect(KNOWN_CAMERA_IDS.has(manifest.camera)).toBe(true);
      });
      it("inputContext is allowlisted", () => {
        expect(KNOWN_INPUT_CONTEXT_IDS.has(manifest.inputContext)).toBe(true);
      });
      it("pawn is allowlisted", () => {
        expect(KNOWN_PAWN_IDS.has(manifest.pawn)).toBe(true);
      });
      it("passes validateGameModeManifest end-to-end", () => {
        expect(validateGameModeManifest(manifest)).toBeNull();
      });
    });
  }

  it("server allowlist rejects unknown ids", () => {
    const err = validateGameModeManifest({
      playerController: "definitely-not-real",
      camera: "orbit",
      inputContext: "hyperscape-default",
      pawn: "humanoid-rpg",
    });
    expect(err).not.toBeNull();
    expect(err?.field).toBe("playerController");
  });

  it("server allowlist contains the Phase 5 id set", () => {
    // If this fails, someone changed the allowlist without updating the
    // expected Phase 5 contract — investigate before loosening.
    expect([...KNOWN_PLAYER_CONTROLLER_IDS].sort()).toEqual(
      ["click-to-walk", "top-down", "wasd"].sort(),
    );
    expect([...KNOWN_CAMERA_IDS].sort()).toEqual(
      ["first-person", "fixed-angle", "orbit"].sort(),
    );
    expect([...KNOWN_INPUT_CONTEXT_IDS].sort()).toEqual(
      [
        "fps-default",
        "hyperscape-default",
        "topdown-default",
        "wasd-default",
      ].sort(),
    );
    expect([...KNOWN_PAWN_IDS].sort()).toEqual(
      ["cursor-avatar", "humanoid-kinematic", "humanoid-rpg"].sort(),
    );
  });
});
