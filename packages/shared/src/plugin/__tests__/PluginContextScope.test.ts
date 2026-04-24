import { describe, expect, it } from "vitest";
import { PluginContextScope } from "../PluginContextScope.js";

describe("PluginContextScope", () => {
  it("requires a non-empty pluginId", () => {
    expect(() => new PluginContextScope("")).toThrow();
  });

  it("starts empty and not disposed", () => {
    const scope = new PluginContextScope("com.a.one");
    expect(scope.size).toBe(0);
    expect(scope.disposed).toBe(false);
    expect(scope.pluginId).toBe("com.a.one");
  });

  it("records disposers without invoking them", () => {
    const scope = new PluginContextScope("com.a.one");
    const log: string[] = [];
    scope.register(() => void log.push("a"));
    scope.register(() => void log.push("b"));
    expect(scope.size).toBe(2);
    expect(log).toEqual([]);
  });

  it("dispose invokes disposers in LIFO order", async () => {
    const scope = new PluginContextScope("com.a.one");
    const log: string[] = [];
    scope.register(() => void log.push("a"));
    scope.register(() => void log.push("b"));
    scope.register(() => void log.push("c"));
    await scope.dispose();
    expect(log).toEqual(["c", "b", "a"]);
    expect(scope.disposed).toBe(true);
    expect(scope.size).toBe(0);
  });

  it("awaits async disposers", async () => {
    const scope = new PluginContextScope("com.a.one");
    const log: string[] = [];
    scope.register(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      log.push("late");
    });
    scope.register(() => void log.push("early"));
    await scope.dispose();
    expect(log).toEqual(["early", "late"]);
  });

  it("register throws after dispose", async () => {
    const scope = new PluginContextScope("com.a.one");
    await scope.dispose();
    expect(() => scope.register(() => {})).toThrow(/already disposed/);
  });

  it("dispose is idempotent — second call is a no-op", async () => {
    const scope = new PluginContextScope("com.a.one");
    let count = 0;
    scope.register(() => void count++);
    await scope.dispose();
    await scope.dispose();
    expect(count).toBe(1);
  });

  it("best-effort: runs every disposer even if one throws, surfaces first error", async () => {
    const scope = new PluginContextScope("com.a.one");
    const log: string[] = [];
    scope.register(() => void log.push("a"));
    scope.register(() => {
      log.push("b");
      throw new Error("b-failed");
    });
    scope.register(() => void log.push("c"));
    scope.register(() => {
      log.push("d");
      throw new Error("d-failed");
    });
    await expect(scope.dispose()).rejects.toThrow("d-failed");
    expect(log).toEqual(["d", "c", "b", "a"]);
    expect(scope.disposed).toBe(true);
  });

  it("wraps non-Error throws", async () => {
    const scope = new PluginContextScope("com.a.one");
    scope.register(() => {
      throw "string-error";
    });
    await expect(scope.dispose()).rejects.toThrow("string-error");
  });

  it("reopen() is a no-op when the scope is still live", () => {
    const scope = new PluginContextScope("com.a.one");
    scope.register(() => {});
    expect(() => scope.reopen()).not.toThrow();
    expect(scope.disposed).toBe(false);
    expect(scope.size).toBe(1);
  });

  it("reopen() after dispose restores the scope for fresh disposer registration", async () => {
    const scope = new PluginContextScope("com.a.one");
    let disposed = 0;
    scope.register(() => {
      disposed++;
    });
    await scope.dispose();
    expect(scope.disposed).toBe(true);
    expect(scope.size).toBe(0);

    scope.reopen();
    expect(scope.disposed).toBe(false);

    scope.register(() => {
      disposed++;
    });
    expect(scope.size).toBe(1);
    await scope.dispose();
    expect(disposed).toBe(2);
  });

  it("reopen() throws if internal state is corrupted with disposed=true + pending disposers", () => {
    // Belt-and-suspenders invariant guard — cannot be triggered by
    // normal public API use (register() rejects after dispose, and
    // dispose() clears the list before flipping the flag), but
    // protects against subclasses or future internal edits that
    // violate the invariant. Simulate corruption via a property cast.
    const scope = new PluginContextScope("com.a.two");
    scope.register(() => {});
    (scope as unknown as { _disposed: boolean })._disposed = true;
    expect(() => scope.reopen()).toThrowError(/pending disposer/);
  });
});
