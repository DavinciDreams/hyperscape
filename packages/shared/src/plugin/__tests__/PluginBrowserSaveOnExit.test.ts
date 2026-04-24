import { describe, expect, it } from "vitest";
import { createPluginBrowserSaveOnExit } from "../PluginBrowserSaveOnExit.js";

describe("createPluginBrowserSaveOnExit — defaults", () => {
  it("starts empty", () => {
    const g = createPluginBrowserSaveOnExit();
    expect(g.hasBlockers()).toBe(false);
    expect(g.blockerCount()).toBe(0);
    expect(g.blockers()).toEqual([]);
    expect(g.isPromptOpen()).toBe(false);
  });
});

describe("createPluginBrowserSaveOnExit — blockers", () => {
  it("adds a blocker", () => {
    const g = createPluginBrowserSaveOnExit();
    expect(g.addBlocker("editor", "unsaved changes")).toBe(true);
    expect(g.hasBlockers()).toBe(true);
    expect(g.blockerCount()).toBe(1);
    expect(g.getBlocker("editor")).toEqual({
      id: "editor",
      reason: "unsaved changes",
    });
  });

  it("duplicate id returns false", () => {
    const g = createPluginBrowserSaveOnExit();
    g.addBlocker("editor", "x");
    expect(g.addBlocker("editor", "other")).toBe(false);
    expect(g.getBlocker("editor")?.reason).toBe("x");
  });

  it("removes a blocker", () => {
    const g = createPluginBrowserSaveOnExit();
    g.addBlocker("editor", "x");
    expect(g.removeBlocker("editor")).toBe(true);
    expect(g.hasBlockers()).toBe(false);
  });

  it("remove unknown returns false", () => {
    const g = createPluginBrowserSaveOnExit();
    expect(g.removeBlocker("editor")).toBe(false);
  });

  it("rejects empty ids / reasons", () => {
    const g = createPluginBrowserSaveOnExit();
    expect(g.addBlocker("", "x")).toBe(false);
    expect(g.addBlocker("editor", "")).toBe(false);
    expect(g.removeBlocker("")).toBe(false);
    expect(g.hasBlockers()).toBe(false);
  });

  it("blockers() preserves insertion order", () => {
    const g = createPluginBrowserSaveOnExit();
    g.addBlocker("c", "c");
    g.addBlocker("a", "a");
    g.addBlocker("b", "b");
    expect(g.blockers().map((b) => b.id)).toEqual(["c", "a", "b"]);
  });

  it("getBlocker on empty id returns undefined", () => {
    const g = createPluginBrowserSaveOnExit();
    expect(g.getBlocker("")).toBeUndefined();
  });
});

describe("createPluginBrowserSaveOnExit — requestExit", () => {
  it("returns 'allowed' with no blockers", () => {
    const g = createPluginBrowserSaveOnExit();
    expect(g.requestExit()).toBe("allowed");
    expect(g.isPromptOpen()).toBe(false);
  });

  it("returns 'blocked' and opens prompt when blockers present", () => {
    const g = createPluginBrowserSaveOnExit();
    g.addBlocker("editor", "x");
    expect(g.requestExit()).toBe("blocked");
    expect(g.isPromptOpen()).toBe(true);
  });

  it("subsequent requestExit stays blocked / prompt-open", () => {
    const g = createPluginBrowserSaveOnExit();
    g.addBlocker("editor", "x");
    g.requestExit();
    expect(g.requestExit()).toBe("blocked");
    expect(g.isPromptOpen()).toBe(true);
  });
});

describe("createPluginBrowserSaveOnExit — confirmExit", () => {
  it("clears prompt and every blocker", () => {
    const g = createPluginBrowserSaveOnExit();
    g.addBlocker("a", "x");
    g.addBlocker("b", "y");
    g.requestExit();
    expect(g.confirmExit()).toBe(true);
    expect(g.isPromptOpen()).toBe(false);
    expect(g.hasBlockers()).toBe(false);
  });

  it("returns false when prompt not open", () => {
    const g = createPluginBrowserSaveOnExit();
    g.addBlocker("a", "x");
    expect(g.confirmExit()).toBe(false);
    expect(g.hasBlockers()).toBe(true);
  });
});

describe("createPluginBrowserSaveOnExit — cancelExit", () => {
  it("clears prompt but keeps blockers", () => {
    const g = createPluginBrowserSaveOnExit();
    g.addBlocker("a", "x");
    g.requestExit();
    expect(g.cancelExit()).toBe(true);
    expect(g.isPromptOpen()).toBe(false);
    expect(g.hasBlockers()).toBe(true);
  });

  it("returns false when prompt not open", () => {
    const g = createPluginBrowserSaveOnExit();
    expect(g.cancelExit()).toBe(false);
  });
});

describe("createPluginBrowserSaveOnExit — auto-close", () => {
  it("removing the last blocker while prompt open closes the prompt", () => {
    const g = createPluginBrowserSaveOnExit();
    g.addBlocker("a", "x");
    g.requestExit();
    expect(g.isPromptOpen()).toBe(true);
    g.removeBlocker("a");
    expect(g.isPromptOpen()).toBe(false);
  });

  it("removing non-last blocker keeps prompt open", () => {
    const g = createPluginBrowserSaveOnExit();
    g.addBlocker("a", "x");
    g.addBlocker("b", "y");
    g.requestExit();
    g.removeBlocker("a");
    expect(g.isPromptOpen()).toBe(true);
  });
});

describe("createPluginBrowserSaveOnExit — clear", () => {
  it("resets all state", () => {
    const g = createPluginBrowserSaveOnExit();
    g.addBlocker("a", "x");
    g.requestExit();
    g.clear();
    expect(g.isPromptOpen()).toBe(false);
    expect(g.hasBlockers()).toBe(false);
  });
});
