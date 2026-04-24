/**
 * Phase U6 — player layout override helpers.
 *
 * The pair `readPlayerLayoutOverride` / `setPlayerLayoutOverride` is the
 * persistence layer for the player-facing layout switcher. Tests cover:
 *   - storage round-trip keyed by `gameId`
 *   - `null` clears the override
 *   - isolation between games
 *   - defensive behaviour when `gameId` is missing
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  readPlayerLayoutOverride,
  setPlayerLayoutOverride,
} from "@/ui-framework/useActiveUILayout";

describe("player layout override helpers (U6)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    expect(readPlayerLayoutOverride("game-a")).toBeNull();
  });

  it("round-trips a layout id for a given game", () => {
    setPlayerLayoutOverride("game-a", "layout.hud-a");
    expect(readPlayerLayoutOverride("game-a")).toBe("layout.hud-a");
  });

  it("clears override when passed null", () => {
    setPlayerLayoutOverride("game-a", "layout.hud-a");
    setPlayerLayoutOverride("game-a", null);
    expect(readPlayerLayoutOverride("game-a")).toBeNull();
  });

  it("isolates overrides between different games", () => {
    setPlayerLayoutOverride("game-a", "layout.hud-a");
    setPlayerLayoutOverride("game-b", "layout.hud-b");
    expect(readPlayerLayoutOverride("game-a")).toBe("layout.hud-a");
    expect(readPlayerLayoutOverride("game-b")).toBe("layout.hud-b");
  });

  it("no-ops when gameId is empty", () => {
    setPlayerLayoutOverride("", "layout.hud-a");
    expect(readPlayerLayoutOverride("")).toBeNull();
  });

  it("last write wins for the same game", () => {
    setPlayerLayoutOverride("game-a", "layout.hud-1");
    setPlayerLayoutOverride("game-a", "layout.hud-2");
    expect(readPlayerLayoutOverride("game-a")).toBe("layout.hud-2");
  });
});
