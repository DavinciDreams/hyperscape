import { describe, expect, it } from "vitest";
import { createPluginBrowserHoverState } from "../PluginBrowserHoverState.js";

describe("createPluginBrowserHoverState — defaults", () => {
  it("starts closed", () => {
    const h = createPluginBrowserHoverState();
    expect(h.isHovering()).toBe(false);
    expect(h.target()).toBeUndefined();
    expect(h.enteredAtMs()).toBeUndefined();
    expect(h.hoveredForMs(100)).toBe(0);
  });
});

describe("createPluginBrowserHoverState — enter row", () => {
  it("opens on row target", () => {
    const h = createPluginBrowserHoverState();
    expect(h.enter({ kind: "row", pluginId: "a" }, 100)).toBe(true);
    expect(h.isHovering()).toBe(true);
    expect(h.target()).toEqual({ kind: "row", pluginId: "a" });
    expect(h.enteredAtMs()).toBe(100);
  });

  it("rejects empty pluginId", () => {
    const h = createPluginBrowserHoverState();
    expect(h.enter({ kind: "row", pluginId: "" }, 1)).toBe(false);
    expect(h.isHovering()).toBe(false);
  });
});

describe("createPluginBrowserHoverState — enter header", () => {
  it("opens on header target", () => {
    const h = createPluginBrowserHoverState();
    expect(h.enter({ kind: "header", columnId: "name" }, 42)).toBe(true);
    expect(h.target()).toEqual({ kind: "header", columnId: "name" });
  });

  it("rejects empty columnId", () => {
    const h = createPluginBrowserHoverState();
    expect(h.enter({ kind: "header", columnId: "" }, 1)).toBe(false);
  });
});

describe("createPluginBrowserHoverState — enter action", () => {
  it("opens on action target", () => {
    const h = createPluginBrowserHoverState();
    expect(
      h.enter({ kind: "action", pluginId: "a", actionId: "install" }, 7),
    ).toBe(true);
    expect(h.target()).toEqual({
      kind: "action",
      pluginId: "a",
      actionId: "install",
    });
  });

  it("rejects empty pluginId on action", () => {
    const h = createPluginBrowserHoverState();
    expect(
      h.enter({ kind: "action", pluginId: "", actionId: "install" }, 1),
    ).toBe(false);
  });

  it("rejects empty actionId on action", () => {
    const h = createPluginBrowserHoverState();
    expect(h.enter({ kind: "action", pluginId: "a", actionId: "" }, 1)).toBe(
      false,
    );
  });
});

describe("createPluginBrowserHoverState — invalid nowMs", () => {
  it("rejects NaN", () => {
    const h = createPluginBrowserHoverState();
    expect(h.enter({ kind: "row", pluginId: "a" }, Number.NaN)).toBe(false);
    expect(h.isHovering()).toBe(false);
  });

  it("rejects Infinity", () => {
    const h = createPluginBrowserHoverState();
    expect(
      h.enter({ kind: "row", pluginId: "a" }, Number.POSITIVE_INFINITY),
    ).toBe(false);
  });

  it("closes an open session on invalid replacement", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "row", pluginId: "a" }, 10);
    h.enter({ kind: "row", pluginId: "b" }, Number.NaN);
    expect(h.isHovering()).toBe(false);
  });
});

describe("createPluginBrowserHoverState — same target", () => {
  it("preserves enteredAtMs on repeat enter with same row", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "row", pluginId: "a" }, 10);
    expect(h.enter({ kind: "row", pluginId: "a" }, 500)).toBe(false);
    expect(h.enteredAtMs()).toBe(10);
  });

  it("preserves on repeat enter with same action", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "action", pluginId: "a", actionId: "install" }, 10);
    expect(
      h.enter({ kind: "action", pluginId: "a", actionId: "install" }, 500),
    ).toBe(false);
    expect(h.enteredAtMs()).toBe(10);
  });

  it("treats differing actionId as a different target", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "action", pluginId: "a", actionId: "install" }, 10);
    expect(
      h.enter({ kind: "action", pluginId: "a", actionId: "enable" }, 50),
    ).toBe(true);
    expect(h.enteredAtMs()).toBe(50);
  });
});

describe("createPluginBrowserHoverState — replace target", () => {
  it("resets timer on different row", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "row", pluginId: "a" }, 10);
    h.enter({ kind: "row", pluginId: "b" }, 100);
    expect(h.target()).toEqual({ kind: "row", pluginId: "b" });
    expect(h.enteredAtMs()).toBe(100);
  });

  it("resets timer across kinds", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "row", pluginId: "a" }, 10);
    h.enter({ kind: "header", columnId: "name" }, 77);
    expect(h.target()).toEqual({ kind: "header", columnId: "name" });
    expect(h.enteredAtMs()).toBe(77);
  });
});

describe("createPluginBrowserHoverState — leave", () => {
  it("closes open session and returns true", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "row", pluginId: "a" }, 10);
    expect(h.leave()).toBe(true);
    expect(h.isHovering()).toBe(false);
    expect(h.target()).toBeUndefined();
    expect(h.enteredAtMs()).toBeUndefined();
  });

  it("is a no-op on already-closed state, returns false", () => {
    const h = createPluginBrowserHoverState();
    expect(h.leave()).toBe(false);
  });
});

describe("createPluginBrowserHoverState — hoveredForMs", () => {
  it("returns 0 when no session is open", () => {
    const h = createPluginBrowserHoverState();
    expect(h.hoveredForMs(500)).toBe(0);
  });

  it("returns elapsed time", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "row", pluginId: "a" }, 100);
    expect(h.hoveredForMs(250)).toBe(150);
  });

  it("returns 0 when nowMs earlier than enteredAt (clock skew)", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "row", pluginId: "a" }, 100);
    expect(h.hoveredForMs(50)).toBe(0);
  });

  it("returns 0 on invalid nowMs", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "row", pluginId: "a" }, 100);
    expect(h.hoveredForMs(Number.NaN)).toBe(0);
  });
});

describe("createPluginBrowserHoverState — isHoveringTarget", () => {
  it("matches current row target", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "row", pluginId: "a" }, 1);
    expect(h.isHoveringTarget({ kind: "row", pluginId: "a" })).toBe(true);
    expect(h.isHoveringTarget({ kind: "row", pluginId: "b" })).toBe(false);
  });

  it("matches current action target by (pluginId, actionId)", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "action", pluginId: "a", actionId: "install" }, 1);
    expect(
      h.isHoveringTarget({
        kind: "action",
        pluginId: "a",
        actionId: "install",
      }),
    ).toBe(true);
    expect(
      h.isHoveringTarget({
        kind: "action",
        pluginId: "a",
        actionId: "enable",
      }),
    ).toBe(false);
  });

  it("returns false when no session is open", () => {
    const h = createPluginBrowserHoverState();
    expect(h.isHoveringTarget({ kind: "row", pluginId: "a" })).toBe(false);
  });

  it("returns false for invalid target query", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "row", pluginId: "a" }, 1);
    expect(h.isHoveringTarget({ kind: "row", pluginId: "" })).toBe(false);
  });
});

describe("createPluginBrowserHoverState — snapshot isolation", () => {
  it("target() returns a fresh object each call", () => {
    const h = createPluginBrowserHoverState();
    h.enter({ kind: "row", pluginId: "a" }, 1);
    const a = h.target();
    const b = h.target();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
