/**
 * Tests for `composeObservers` — fan-out helper that stacks multiple
 * `PluginSessionObserver`s into a single observer.
 *
 * Coverage:
 *   - Empty compose → every hook present, every call is a no-op
 *   - Single observer → pass-through, each hook forwards args 1:1
 *   - Multiple observers → every hook dispatches to all in declared order
 *   - Missing hooks on individual observers are skipped (no error)
 *   - Hook-level throws are isolated: one throwing observer does NOT
 *     block later observers
 *   - Per-hook dispatch is independent: composing at construction time
 *     doesn't silently drop hooks across the set
 */

import { describe, expect, it, vi } from "vitest";

import {
  composeObservers,
  type PluginInstanceRecord,
  type PluginManifest,
  type PluginSessionObserver,
  type UnresolvableReason,
} from "../index.js";

// ────────────────────────────────────────────────────────────────────────
// Shared fixtures — minimal structural stand-ins, no schema parsing.
// composeObservers treats args as opaque pass-throughs so we never need
// real PluginManifestSchema.parse output.
// ────────────────────────────────────────────────────────────────────────

const mockManifest = { id: "mock.plugin" } as unknown as PluginManifest;
const mockReason: UnresolvableReason = {
  kind: "missing-dependency",
  dependencyId: "mock.dep",
};

interface Ctx {
  readonly pluginId: string;
  readonly scope: { pluginId: string };
}
const mockRecord = {
  manifest: mockManifest,
  ctx: {
    pluginId: "mock.plugin",
    scope: { pluginId: "mock.plugin" },
  },
} as unknown as PluginInstanceRecord<Ctx>;

describe("composeObservers", () => {
  it("empty compose: every hook present and a no-op", () => {
    const composed = composeObservers<Ctx>();

    // All five hooks must be defined — hosts rely on a consistent shape.
    expect(typeof composed.onPackageLoaded).toBe("function");
    expect(typeof composed.onPackageFailed).toBe("function");
    expect(typeof composed.onUnresolvable).toBe("function");
    expect(typeof composed.onPluginStarted).toBe("function");
    expect(typeof composed.onPluginStopped).toBe("function");

    // Calling them with empty compose list must not throw.
    expect(() => {
      composed.onPackageLoaded!(mockManifest);
      composed.onPackageFailed!("/some/dir", new Error("boom"));
      composed.onUnresolvable!(mockManifest, mockReason);
      composed.onPluginStarted!(mockRecord);
      composed.onPluginStopped!(mockRecord);
    }).not.toThrow();
  });

  it("single observer: pass-through dispatch", () => {
    const spy: PluginSessionObserver<Ctx> = {
      onPackageLoaded: vi.fn(),
      onPackageFailed: vi.fn(),
      onUnresolvable: vi.fn(),
      onPluginStarted: vi.fn(),
      onPluginStopped: vi.fn(),
    };

    const composed = composeObservers(spy);

    const err = new Error("bad package");
    composed.onPackageLoaded!(mockManifest);
    composed.onPackageFailed!("/some/dir", err);
    composed.onUnresolvable!(mockManifest, mockReason);
    composed.onPluginStarted!(mockRecord);
    composed.onPluginStopped!(mockRecord);

    expect(spy.onPackageLoaded).toHaveBeenCalledWith(mockManifest);
    expect(spy.onPackageFailed).toHaveBeenCalledWith("/some/dir", err);
    expect(spy.onUnresolvable).toHaveBeenCalledWith(mockManifest, mockReason);
    expect(spy.onPluginStarted).toHaveBeenCalledWith(mockRecord);
    expect(spy.onPluginStopped).toHaveBeenCalledWith(mockRecord);
  });

  it("multiple observers: every hook dispatches to all in order", () => {
    const calls: string[] = [];
    const a: PluginSessionObserver<Ctx> = {
      onPackageLoaded: () => calls.push("a:loaded"),
      onPluginStarted: () => calls.push("a:started"),
    };
    const b: PluginSessionObserver<Ctx> = {
      onPackageLoaded: () => calls.push("b:loaded"),
      onPluginStarted: () => calls.push("b:started"),
    };
    const c: PluginSessionObserver<Ctx> = {
      onPackageLoaded: () => calls.push("c:loaded"),
      onPluginStarted: () => calls.push("c:started"),
    };

    const composed = composeObservers(a, b, c);

    composed.onPackageLoaded!(mockManifest);
    composed.onPluginStarted!(mockRecord);

    expect(calls).toEqual([
      "a:loaded",
      "b:loaded",
      "c:loaded",
      "a:started",
      "b:started",
      "c:started",
    ]);
  });

  it("observers with missing hooks are skipped without error", () => {
    const calls: string[] = [];
    const partialA: PluginSessionObserver<Ctx> = {
      onPackageLoaded: () => calls.push("a"),
      // no onPluginStarted
    };
    const partialB: PluginSessionObserver<Ctx> = {
      // no onPackageLoaded
      onPluginStarted: () => calls.push("b"),
    };
    const full: PluginSessionObserver<Ctx> = {
      onPackageLoaded: () => calls.push("c-loaded"),
      onPluginStarted: () => calls.push("c-started"),
    };

    const composed = composeObservers(partialA, partialB, full);

    composed.onPackageLoaded!(mockManifest);
    composed.onPluginStarted!(mockRecord);

    expect(calls).toEqual(["a", "c-loaded", "b", "c-started"]);
  });

  it("throwing observer does not block later observers", () => {
    const calls: string[] = [];
    const a: PluginSessionObserver<Ctx> = {
      onPackageLoaded: () => {
        calls.push("a");
      },
    };
    const thrower: PluginSessionObserver<Ctx> = {
      onPackageLoaded: () => {
        calls.push("thrower");
        throw new Error("observer blew up");
      },
    };
    const c: PluginSessionObserver<Ctx> = {
      onPackageLoaded: () => {
        calls.push("c");
      },
    };

    const composed = composeObservers(a, thrower, c);

    expect(() => composed.onPackageLoaded!(mockManifest)).not.toThrow();
    expect(calls).toEqual(["a", "thrower", "c"]);
  });

  it("throws are isolated per-observer per-hook", () => {
    const calls: string[] = [];
    const mixed: PluginSessionObserver<Ctx> = {
      onPackageLoaded: () => {
        throw new Error("first hook throws");
      },
      onPluginStarted: () => {
        calls.push("mixed:started");
      },
    };
    const observer: PluginSessionObserver<Ctx> = {
      onPackageLoaded: () => {
        calls.push("observer:loaded");
      },
      onPluginStarted: () => {
        calls.push("observer:started");
      },
    };

    const composed = composeObservers(mixed, observer);

    composed.onPackageLoaded!(mockManifest);
    composed.onPluginStarted!(mockRecord);

    // mixed.onPackageLoaded threw and was swallowed; observer.onPackageLoaded
    // still ran; the next hook (onPluginStarted) is unaffected on both sides.
    expect(calls).toEqual([
      "observer:loaded",
      "mixed:started",
      "observer:started",
    ]);
  });
});
