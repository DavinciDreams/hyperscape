/**
 * Tests for `createPluginContextScope`.
 *
 * Coverage:
 *   - handle carries pluginId
 *   - register + dispose happy path (LIFO order)
 *   - sync + async disposers interleaved
 *   - single disposer failure rethrows the original error unchanged
 *   - multiple disposer failures wrap in PluginScopeDrainError
 *   - other disposers still run after one fails (best-effort drain)
 *   - dispose is idempotent — second call is a no-op
 *   - register after dispose throws PluginScopeUseAfterDisposeError
 *   - reopen re-arms the scope
 *   - dispose of empty scope succeeds
 */

import { describe, expect, it } from "vitest";

import {
  PluginScopeDrainError,
  PluginScopeUseAfterDisposeError,
  createPluginContextScope,
} from "../index.js";

describe("createPluginContextScope — identity", () => {
  it("exposes the pluginId on the handle", () => {
    const scope = createPluginContextScope("com.example.a");
    expect(scope.pluginId).toBe("com.example.a");
  });
});

describe("createPluginContextScope — happy path", () => {
  it("runs disposers in LIFO order on dispose", async () => {
    const trace: string[] = [];
    const scope = createPluginContextScope("com.example.lifo");
    scope.register(() => trace.push("first"));
    scope.register(() => trace.push("second"));
    scope.register(() => trace.push("third"));
    await scope.dispose();
    expect(trace).toEqual(["third", "second", "first"]);
  });

  it("interleaves sync and async disposers, awaiting each before the next", async () => {
    const trace: string[] = [];
    const scope = createPluginContextScope("com.example.mix");
    scope.register(() => trace.push("sync-1"));
    scope.register(async () => {
      await Promise.resolve();
      trace.push("async-2");
    });
    scope.register(() => trace.push("sync-3"));
    await scope.dispose();
    expect(trace).toEqual(["sync-3", "async-2", "sync-1"]);
  });

  it("disposes an empty scope without error", async () => {
    const scope = createPluginContextScope("com.example.empty");
    await expect(scope.dispose()).resolves.toBeUndefined();
  });
});

describe("createPluginContextScope — error handling", () => {
  it("rethrows a single disposer error unchanged (no wrapping)", async () => {
    const boom = new Error("broke");
    const scope = createPluginContextScope("com.example.single-fail");
    scope.register(() => {
      throw boom;
    });
    await expect(scope.dispose()).rejects.toBe(boom);
  });

  it("wraps multiple disposer errors in PluginScopeDrainError", async () => {
    const errA = new Error("a-fail");
    const errB = new Error("b-fail");
    const scope = createPluginContextScope("com.example.multi-fail");
    scope.register(() => {
      throw errA;
    });
    scope.register(() => {
      throw errB;
    });
    let caught: unknown;
    try {
      await scope.dispose();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PluginScopeDrainError);
    const asDrainErr = caught as PluginScopeDrainError;
    expect(asDrainErr.pluginId).toBe("com.example.multi-fail");
    expect(asDrainErr.errors).toHaveLength(2);
    // LIFO: errB ran first, so it appears first in the errors list.
    expect(asDrainErr.errors[0]).toBe(errB);
    expect(asDrainErr.errors[1]).toBe(errA);
  });

  it("still runs later disposers after one fails (best-effort drain)", async () => {
    const trace: string[] = [];
    const scope = createPluginContextScope("com.example.continue");
    scope.register(() => trace.push("bottom"));
    scope.register(() => {
      throw new Error("middle-boom");
    });
    scope.register(() => trace.push("top"));
    try {
      await scope.dispose();
    } catch {
      /* expected */
    }
    // "top" ran first (LIFO), middle threw, "bottom" still ran.
    expect(trace).toEqual(["top", "bottom"]);
  });
});

describe("createPluginContextScope — lifecycle", () => {
  it("dispose is idempotent — second call is a no-op", async () => {
    let count = 0;
    const scope = createPluginContextScope("com.example.idempotent");
    scope.register(() => {
      count++;
    });
    await scope.dispose();
    await scope.dispose();
    expect(count).toBe(1);
  });

  it("register after dispose throws PluginScopeUseAfterDisposeError", async () => {
    const scope = createPluginContextScope("com.example.use-after-dispose");
    await scope.dispose();
    expect(() => scope.register(() => {})).toThrow(
      PluginScopeUseAfterDisposeError,
    );
  });

  it("reopen re-arms the scope so register works again", async () => {
    const trace: string[] = [];
    const scope = createPluginContextScope("com.example.reopen");
    scope.register(() => trace.push("cycle-1"));
    await scope.dispose();

    scope.reopen();
    scope.register(() => trace.push("cycle-2"));
    await scope.dispose();

    expect(trace).toEqual(["cycle-1", "cycle-2"]);
  });

  it("reopen clears any pre-existing disposers (defensive)", async () => {
    const trace: string[] = [];
    const scope = createPluginContextScope("com.example.reopen-defensive");
    scope.register(() => trace.push("pre-reopen"));
    // Call reopen without disposing — any lingering disposers are discarded.
    scope.reopen();
    scope.register(() => trace.push("post-reopen"));
    await scope.dispose();
    expect(trace).toEqual(["post-reopen"]);
  });
});
