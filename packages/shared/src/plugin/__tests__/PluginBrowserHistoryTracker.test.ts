import { describe, expect, it } from "vitest";
import { createPluginBrowserHistoryTracker } from "../PluginBrowserHistoryTracker.js";

describe("createPluginBrowserHistoryTracker — empty state", () => {
  it("starts empty", () => {
    const h = createPluginBrowserHistoryTracker();
    expect(h.current()).toBeNull();
    expect(h.canBack()).toBe(false);
    expect(h.canForward()).toBe(false);
    expect(h.backStack).toEqual([]);
    expect(h.forwardStack).toEqual([]);
  });

  it("back/forward on empty tracker return null", () => {
    const h = createPluginBrowserHistoryTracker();
    expect(h.back()).toBeNull();
    expect(h.forward()).toBeNull();
  });
});

describe("createPluginBrowserHistoryTracker — visit semantics", () => {
  it("single visit makes it current but not canBack", () => {
    const h = createPluginBrowserHistoryTracker();
    h.visit("a");
    expect(h.current()).toBe("a");
    expect(h.canBack()).toBe(false);
    expect(h.canForward()).toBe(false);
  });

  it("two visits enable canBack, disable canForward", () => {
    const h = createPluginBrowserHistoryTracker();
    h.visit("a");
    h.visit("b");
    expect(h.current()).toBe("b");
    expect(h.canBack()).toBe(true);
    expect(h.canForward()).toBe(false);
  });

  it("revisiting the current entry is a no-op", () => {
    const h = createPluginBrowserHistoryTracker();
    h.visit("a");
    h.visit("a");
    h.visit("a");
    expect(h.backStack).toEqual(["a"]);
    expect(h.canBack()).toBe(false);
  });

  it("revisiting a non-current entry is NOT collapsed", () => {
    const h = createPluginBrowserHistoryTracker();
    h.visit("a");
    h.visit("b");
    h.visit("a");
    // Three distinct entries: ["a","b","a"]
    expect(h.backStack).toEqual(["a", "b", "a"]);
  });
});

describe("createPluginBrowserHistoryTracker — back / forward", () => {
  it("back moves one step", () => {
    const h = createPluginBrowserHistoryTracker();
    h.visit("a");
    h.visit("b");
    h.visit("c");
    expect(h.back()).toBe("b");
    expect(h.current()).toBe("b");
    expect(h.canForward()).toBe(true);
    expect(h.back()).toBe("a");
    expect(h.current()).toBe("a");
    expect(h.canBack()).toBe(false);
  });

  it("back at the oldest entry stays put", () => {
    const h = createPluginBrowserHistoryTracker();
    h.visit("a");
    expect(h.back()).toBe("a");
    expect(h.current()).toBe("a");
  });

  it("forward undoes back", () => {
    const h = createPluginBrowserHistoryTracker();
    h.visit("a");
    h.visit("b");
    h.visit("c");
    h.back(); // -> b
    h.back(); // -> a
    expect(h.forward()).toBe("b");
    expect(h.forward()).toBe("c");
    expect(h.canForward()).toBe(false);
  });

  it("forward at the newest entry is a no-op", () => {
    const h = createPluginBrowserHistoryTracker();
    h.visit("a");
    h.visit("b");
    expect(h.forward()).toBe("b");
    expect(h.current()).toBe("b");
  });

  it("visit after back clears the forward stack", () => {
    const h = createPluginBrowserHistoryTracker();
    h.visit("a");
    h.visit("b");
    h.visit("c");
    h.back(); // -> b; forward = [c]
    h.visit("d");
    expect(h.current()).toBe("d");
    expect(h.canForward()).toBe(false);
    expect(h.forwardStack).toEqual([]);
    // Back stack is ["a","b","d"] — "c" is gone.
    expect(h.backStack).toEqual(["a", "b", "d"]);
  });
});

describe("createPluginBrowserHistoryTracker — capacity", () => {
  it("clamps maxEntries to >= 1", () => {
    const h0 = createPluginBrowserHistoryTracker({ maxEntries: 0 });
    h0.visit("a");
    h0.visit("b");
    expect(h0.backStack).toEqual(["b"]);

    const hNeg = createPluginBrowserHistoryTracker({ maxEntries: -5 });
    hNeg.visit("x");
    hNeg.visit("y");
    expect(hNeg.backStack).toEqual(["y"]);
  });

  it("drops oldest back entries beyond capacity", () => {
    const h = createPluginBrowserHistoryTracker({ maxEntries: 3 });
    h.visit("a");
    h.visit("b");
    h.visit("c");
    h.visit("d");
    expect(h.backStack).toEqual(["b", "c", "d"]);
    h.visit("e");
    expect(h.backStack).toEqual(["c", "d", "e"]);
  });

  it("capacity drop keeps canBack wired to remaining entries", () => {
    const h = createPluginBrowserHistoryTracker({ maxEntries: 2 });
    h.visit("a");
    h.visit("b");
    h.visit("c");
    // Back stack is now ["b","c"].
    expect(h.back()).toBe("b");
    expect(h.canBack()).toBe(false);
  });

  it("floors fractional maxEntries", () => {
    const h = createPluginBrowserHistoryTracker({ maxEntries: 2.9 });
    h.visit("a");
    h.visit("b");
    h.visit("c");
    expect(h.backStack).toEqual(["b", "c"]);
  });
});

describe("createPluginBrowserHistoryTracker — clear", () => {
  it("wipes both stacks", () => {
    const h = createPluginBrowserHistoryTracker();
    h.visit("a");
    h.visit("b");
    h.visit("c");
    h.back();
    h.clear();
    expect(h.current()).toBeNull();
    expect(h.canBack()).toBe(false);
    expect(h.canForward()).toBe(false);
    expect(h.backStack).toEqual([]);
    expect(h.forwardStack).toEqual([]);
  });

  it("is idempotent on an empty tracker", () => {
    const h = createPluginBrowserHistoryTracker();
    h.clear();
    h.clear();
    expect(h.current()).toBeNull();
  });
});

describe("createPluginBrowserHistoryTracker — realistic navigation", () => {
  it("records a typical browse-and-backtrack session", () => {
    const h = createPluginBrowserHistoryTracker();
    h.visit("com.hyperia.combat");
    h.visit("com.hyperia.skills");
    h.visit("com.hyperia.quests");
    expect(h.current()).toBe("com.hyperia.quests");

    expect(h.back()).toBe("com.hyperia.skills");
    expect(h.back()).toBe("com.hyperia.combat");

    expect(h.forward()).toBe("com.hyperia.skills");

    // Branching off the middle: forward to "quests" is cut.
    h.visit("com.hyperia.banking");
    expect(h.backStack).toEqual([
      "com.hyperia.combat",
      "com.hyperia.skills",
      "com.hyperia.banking",
    ]);
    expect(h.canForward()).toBe(false);
  });
});
