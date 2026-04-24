import { describe, expect, it } from "vitest";
import { createPluginBrowserInstallQueue } from "../PluginBrowserInstallQueue.js";

type Op = { kind: "install" | "uninstall" | "update"; version?: string };

describe("createPluginBrowserInstallQueue — defaults", () => {
  it("starts empty", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    expect(q.hasActive()).toBe(false);
    expect(q.activeEntry()).toBeUndefined();
    expect(q.queuedCount()).toBe(0);
    expect(q.entries()).toEqual([]);
    expect(q.entryById(1)).toBeUndefined();
  });
});

describe("createPluginBrowserInstallQueue — enqueue", () => {
  it("returns positive ids and enqueues entries", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    const a = q.enqueue("a", { kind: "install" });
    const b = q.enqueue("b", { kind: "install" });
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(q.queuedCount()).toBe(2);
  });

  it("rejects empty pluginId", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    expect(q.enqueue("", { kind: "install" })).toBe(-1);
    expect(q.queuedCount()).toBe(0);
  });

  it("preserves insertion order", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    q.enqueue("a", { kind: "install" });
    q.enqueue("b", { kind: "install" });
    q.enqueue("c", { kind: "install" });
    expect(q.entries().map((e) => e.pluginId)).toEqual(["a", "b", "c"]);
  });
});

describe("createPluginBrowserInstallQueue — startNext", () => {
  it("moves the head queued to active", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    const a = q.enqueue("a", { kind: "install" });
    q.enqueue("b", { kind: "install" });
    const active = q.startNext();
    expect(active).toBeDefined();
    expect(active?.id).toBe(a);
    expect(active?.status).toBe("active");
    expect(q.hasActive()).toBe(true);
    expect(q.queuedCount()).toBe(1);
  });

  it("returns undefined when another entry is already active", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    q.enqueue("a", { kind: "install" });
    q.enqueue("b", { kind: "install" });
    q.startNext();
    expect(q.startNext()).toBeUndefined();
  });

  it("returns undefined when empty", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    expect(q.startNext()).toBeUndefined();
  });

  it("skips past terminal entries", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    const a = q.enqueue("a", { kind: "install" });
    const b = q.enqueue("b", { kind: "install" });
    q.cancelEntry(a);
    const next = q.startNext();
    expect(next?.id).toBe(b);
  });
});

describe("createPluginBrowserInstallQueue — completeActiveSuccess", () => {
  it("moves active → succeeded and clears active", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    q.enqueue("a", { kind: "install" });
    q.startNext();
    const done = q.completeActiveSuccess();
    expect(done?.status).toBe("succeeded");
    expect(q.hasActive()).toBe(false);
  });

  it("returns undefined when no active entry", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    expect(q.completeActiveSuccess()).toBeUndefined();
  });

  it("after success, next startNext pulls the next queued", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    q.enqueue("a", { kind: "install" });
    q.enqueue("b", { kind: "install" });
    q.startNext();
    q.completeActiveSuccess();
    const next = q.startNext();
    expect(next?.pluginId).toBe("b");
  });
});

describe("createPluginBrowserInstallQueue — completeActiveFailure", () => {
  it("moves active → failed with reason and clears active", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    q.enqueue("a", { kind: "install" });
    q.startNext();
    const failed = q.completeActiveFailure("checksum mismatch");
    expect(failed?.status).toBe("failed");
    expect(failed?.failureReason).toBe("checksum mismatch");
    expect(q.hasActive()).toBe(false);
  });

  it("accepts empty reason", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    q.enqueue("a", { kind: "install" });
    q.startNext();
    const failed = q.completeActiveFailure("");
    expect(failed?.failureReason).toBe("");
  });

  it("returns undefined when no active entry", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    expect(q.completeActiveFailure("x")).toBeUndefined();
  });
});

describe("createPluginBrowserInstallQueue — cancelEntry", () => {
  it("cancels a queued entry", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    const a = q.enqueue("a", { kind: "install" });
    const canceled = q.cancelEntry(a);
    expect(canceled?.status).toBe("canceled");
    expect(q.queuedCount()).toBe(0);
  });

  it("cancels the active entry and clears active slot", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    q.enqueue("a", { kind: "install" });
    const started = q.startNext();
    const canceled = q.cancelEntry(started!.id);
    expect(canceled?.status).toBe("canceled");
    expect(q.hasActive()).toBe(false);
  });

  it("refuses to cancel terminal entries", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    q.enqueue("a", { kind: "install" });
    q.startNext();
    const succeeded = q.completeActiveSuccess();
    expect(q.cancelEntry(succeeded!.id)).toBeUndefined();
  });

  it("returns undefined for unknown id", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    expect(q.cancelEntry(999)).toBeUndefined();
  });
});

describe("createPluginBrowserInstallQueue — remove", () => {
  it("removes terminal entries", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    q.enqueue("a", { kind: "install" });
    q.startNext();
    const done = q.completeActiveSuccess();
    expect(q.remove(done!.id)).toBe(true);
    expect(q.entries()).toEqual([]);
  });

  it("refuses to remove queued entries", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    const a = q.enqueue("a", { kind: "install" });
    expect(q.remove(a)).toBe(false);
  });

  it("refuses to remove active entries", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    q.enqueue("a", { kind: "install" });
    const active = q.startNext();
    expect(q.remove(active!.id)).toBe(false);
  });

  it("returns false for unknown id", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    expect(q.remove(999)).toBe(false);
  });
});

describe("createPluginBrowserInstallQueue — clear", () => {
  it("drops everything regardless of status", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    q.enqueue("a", { kind: "install" });
    q.enqueue("b", { kind: "install" });
    q.startNext();
    q.clear();
    expect(q.entries()).toEqual([]);
    expect(q.hasActive()).toBe(false);
    expect(q.queuedCount()).toBe(0);
  });
});

describe("createPluginBrowserInstallQueue — queuedCount + entryById", () => {
  it("queuedCount counts only queued entries", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    q.enqueue("a", { kind: "install" });
    q.enqueue("b", { kind: "install" });
    q.enqueue("c", { kind: "install" });
    q.startNext();
    // a is active, b + c are queued
    expect(q.queuedCount()).toBe(2);
  });

  it("entryById finds entries across statuses", () => {
    const q = createPluginBrowserInstallQueue<Op>();
    const a = q.enqueue("a", { kind: "install" });
    q.startNext();
    q.completeActiveSuccess();
    const found = q.entryById(a);
    expect(found?.status).toBe("succeeded");
  });
});
