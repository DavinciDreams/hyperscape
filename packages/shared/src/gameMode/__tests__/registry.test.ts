/**
 * GameModeRegistry unit tests — Phase 1.
 *
 * Covers:
 * - register / unregister / has / ids
 * - resolve happy path and UnknownGameModeError
 * - overwrite semantics
 * - factory receives the manifest it was resolved under
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GameModeRegistry, UnknownGameModeError } from "../GameModeRegistry";
import type { GameMode, GameModeContext, GameModeManifest } from "../GameMode";

const stubManifest: GameModeManifest = {
  playerController: "stub",
  camera: "stub-cam",
  inputContext: "stub-input",
  pawn: "stub-pawn",
};

const stubContext: GameModeContext = {
  // `world` is not touched by the registry itself; a typed stub is enough.
  world: {} as GameModeContext["world"],
  runtime: "pie",
};

function makeStubMode(id: string, manifest: GameModeManifest): GameMode {
  return {
    id,
    manifest,
    createPlayerController: () => {
      throw new Error("not used in registry tests");
    },
    createCameraController: () => {
      throw new Error("not used in registry tests");
    },
    createInputContext: () => {
      throw new Error("not used in registry tests");
    },
  };
}

describe("GameModeRegistry", () => {
  let registry: GameModeRegistry;

  beforeEach(() => {
    registry = new GameModeRegistry();
  });

  describe("register / has / ids", () => {
    it("starts empty", () => {
      expect(registry.ids()).toEqual([]);
      expect(registry.has("stub")).toBe(false);
    });

    it("registers and reports presence", () => {
      registry.register("stub", (m) => makeStubMode("stub", m));
      expect(registry.has("stub")).toBe(true);
      expect(registry.ids()).toEqual(["stub"]);
    });

    it("rejects empty ids", () => {
      expect(() => registry.register("", (m) => makeStubMode("x", m))).toThrow(
        /non-empty/,
      );
    });

    it("preserves insertion order in ids()", () => {
      registry.register("a", (m) => makeStubMode("a", m));
      registry.register("b", (m) => makeStubMode("b", m));
      registry.register("c", (m) => makeStubMode("c", m));
      expect(registry.ids()).toEqual(["a", "b", "c"]);
    });
  });

  describe("unregister / clear", () => {
    it("unregister removes a factory and returns true", () => {
      registry.register("stub", (m) => makeStubMode("stub", m));
      expect(registry.unregister("stub")).toBe(true);
      expect(registry.has("stub")).toBe(false);
    });

    it("unregister returns false for unknown id", () => {
      expect(registry.unregister("never-registered")).toBe(false);
    });

    it("clear drops every registration", () => {
      registry.register("a", (m) => makeStubMode("a", m));
      registry.register("b", (m) => makeStubMode("b", m));
      registry.clear();
      expect(registry.ids()).toEqual([]);
    });
  });

  describe("resolve", () => {
    it("invokes the registered factory with manifest + ctx", () => {
      let receivedManifest: GameModeManifest | null = null;
      let receivedCtx: GameModeContext | null = null;
      registry.register("stub", (m, c) => {
        receivedManifest = m;
        receivedCtx = c;
        return makeStubMode("stub", m);
      });

      const resolved = registry.resolve(stubManifest, stubContext);

      expect(resolved.id).toBe("stub");
      expect(resolved.manifest).toBe(stubManifest);
      expect(receivedManifest).toBe(stubManifest);
      expect(receivedCtx).toBe(stubContext);
    });

    it("throws UnknownGameModeError for unregistered ids", () => {
      expect(() => registry.resolve(stubManifest, stubContext)).toThrow(
        UnknownGameModeError,
      );
    });

    it("error message lists registered ids", () => {
      registry.register("a", (m) => makeStubMode("a", m));
      registry.register("b", (m) => makeStubMode("b", m));
      try {
        registry.resolve(stubManifest, stubContext);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(UnknownGameModeError);
        expect((err as Error).message).toContain("stub");
        expect((err as Error).message).toContain("a");
        expect((err as Error).message).toContain("b");
      }
    });

    it("error message shows (none) when empty", () => {
      try {
        registry.resolve(stubManifest, stubContext);
        throw new Error("should have thrown");
      } catch (err) {
        expect((err as Error).message).toContain("(none)");
      }
    });

    it("re-registering overrides the previous factory", () => {
      registry.register("stub", (m) => makeStubMode("v1", m));
      registry.register("stub", (m) => makeStubMode("v2", m));
      const resolved = registry.resolve(stubManifest, stubContext);
      expect(resolved.id).toBe("v2");
    });
  });
});
