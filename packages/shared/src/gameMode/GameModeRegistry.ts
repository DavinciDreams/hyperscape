/**
 * GameModeRegistry — name → factory lookup for GameModes.
 *
 * Games don't import concrete GameMode classes; they declare the ids
 * they want in their `GameModeManifest` and the registry resolves them.
 * This is the indirection that lets PIE and the live client share one
 * code path while supporting multiple games.
 *
 * Usage:
 * ```ts
 * import { gameModeRegistry } from "@hyperforge/shared";
 *
 * gameModeRegistry.register("hyperia", (manifest, ctx) =>
 *   new HyperiaGameMode(manifest, ctx),
 * );
 *
 * const mode = gameModeRegistry.resolve(
 *   { playerController: "click-to-walk", camera: "orbit", ... },
 *   { world, runtime: "client" },
 * );
 * ```
 *
 * Phase 1 scope: pure lookup — the registry ships empty and nothing
 * registers into it yet.
 *
 * @public
 */

import type {
  GameMode,
  GameModeContext,
  GameModeFactory,
  GameModeManifest,
} from "./GameMode";

/**
 * Error thrown when a manifest references an id that was never registered.
 * Distinct class so callers can `instanceof` it rather than string-match.
 */
export class UnknownGameModeError extends Error {
  constructor(id: string, registered: string[]) {
    const list = registered.length > 0 ? registered.join(", ") : "(none)";
    super(`No GameMode registered under id "${id}". Registered ids: ${list}.`);
    this.name = "UnknownGameModeError";
  }
}

export class GameModeRegistry {
  private readonly factories = new Map<string, GameModeFactory>();

  /**
   * Register a factory under an id. Overwrites any previous registration
   * under the same id — callers can use this to swap implementations at
   * test time.
   */
  register(id: string, factory: GameModeFactory): void {
    if (!id) {
      throw new Error("GameModeRegistry.register: id must be non-empty");
    }
    this.factories.set(id, factory);
  }

  /**
   * Remove a registration. Returns `true` if one was removed.
   */
  unregister(id: string): boolean {
    return this.factories.delete(id);
  }

  /** Whether an id has a registered factory. */
  has(id: string): boolean {
    return this.factories.has(id);
  }

  /** All registered ids, in insertion order. */
  ids(): string[] {
    return [...this.factories.keys()];
  }

  /**
   * Resolve a manifest into a concrete GameMode. The manifest's
   * `playerController` field is used as the registry lookup key —
   * each game registers one factory that knows how to wire its
   * declared controller/camera/input-context combo together.
   *
   * Throws `UnknownGameModeError` if the id is not registered.
   */
  resolve(manifest: GameModeManifest, ctx: GameModeContext): GameMode {
    const id = manifest.playerController;
    const factory = this.factories.get(id);
    if (!factory) {
      throw new UnknownGameModeError(id, this.ids());
    }
    return factory(manifest, ctx);
  }

  /**
   * Test helper — drop every registration. Do not call in production code.
   */
  clear(): void {
    this.factories.clear();
  }
}

/**
 * Process-wide registry. The live client and PIE share this instance;
 * registration happens once at boot from `createClientWorld` /
 * `createPlayTestWorld` (Phase 2/3).
 */
export const gameModeRegistry = new GameModeRegistry();
