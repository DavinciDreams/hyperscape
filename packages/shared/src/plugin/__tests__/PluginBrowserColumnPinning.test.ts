import { describe, expect, it } from "vitest";
import {
  createPluginBrowserColumnPinning,
  type PluginBrowserColumnPinDefinition,
} from "../PluginBrowserColumnPinning.js";

const COLUMNS: readonly PluginBrowserColumnPinDefinition[] = [
  { id: "pluginId", defaultPin: "left" },
  { id: "severity" },
  { id: "label" },
  { id: "version" },
  { id: "actions", defaultPin: "right" },
];

describe("createPluginBrowserColumnPinning — initial state", () => {
  it("records every column and exposes size", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    expect(p.size()).toBe(5);
    for (const c of COLUMNS) expect(p.hasColumn(c.id)).toBe(true);
  });

  it("applies defaultPin", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    expect(p.pinOf("pluginId")).toBe("left");
    expect(p.pinOf("actions")).toBe("right");
    expect(p.pinOf("severity")).toBe("none");
  });

  it("pinOf() returns 'none' for unknown id", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    expect(p.pinOf("zzz")).toBe("none");
  });

  it("snapshot marks all as isDefault initially", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    for (const s of p.snapshot()) expect(s.isDefault).toBe(true);
  });

  it("orderedIds: left-pinned first, unpinned next, right-pinned last", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    expect(p.orderedIds()).toEqual([
      "pluginId",
      "severity",
      "label",
      "version",
      "actions",
    ]);
  });
});

describe("createPluginBrowserColumnPinning — setPin", () => {
  it("moves a column to left", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.setPin("severity", "left");
    expect(p.pinOf("severity")).toBe("left");
    expect(p.pinnedLeft()).toEqual(["pluginId", "severity"]);
  });

  it("moves a column to right", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.setPin("label", "right");
    expect(p.pinnedRight()).toEqual(["label", "actions"]);
  });

  it("moves a column back to none", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.setPin("pluginId", "none");
    expect(p.pinOf("pluginId")).toBe("none");
    expect(p.pinnedLeft()).toEqual([]);
  });

  it("silently ignores unknown ids", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    expect(() => p.setPin("zzz", "left")).not.toThrow();
    expect(p.hasColumn("zzz")).toBe(false);
  });

  it("silently ignores invalid side values", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    const before = p.pinOf("severity");
    p.setPin("severity", "middle" as unknown as "left");
    expect(p.pinOf("severity")).toBe(before);
  });

  it("flags a changed column as non-default in snapshot", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.setPin("severity", "left");
    const snap = p.snapshot().find((s) => s.id === "severity")!;
    expect(snap.isDefault).toBe(false);
    expect(snap.side).toBe("left");
  });
});

describe("createPluginBrowserColumnPinning — unpin / togglePin", () => {
  it("unpin moves to none", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.unpin("pluginId");
    expect(p.pinOf("pluginId")).toBe("none");
  });

  it("togglePin toggles between side and none", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.togglePin("severity", "left");
    expect(p.pinOf("severity")).toBe("left");
    p.togglePin("severity", "left");
    expect(p.pinOf("severity")).toBe("none");
  });

  it("togglePin from opposite side switches side (not unpin)", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.setPin("severity", "left");
    p.togglePin("severity", "right");
    expect(p.pinOf("severity")).toBe("right");
  });

  it("togglePin unknown id is no-op", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    expect(() => p.togglePin("zzz", "left")).not.toThrow();
  });
});

describe("createPluginBrowserColumnPinning — groups preserve authored order", () => {
  it("left group follows authored order", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.setPin("version", "left");
    p.setPin("severity", "left");
    // authored: pluginId, severity, label, version, actions
    expect(p.pinnedLeft()).toEqual(["pluginId", "severity", "version"]);
  });

  it("right group follows authored order", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.setPin("label", "right");
    p.setPin("severity", "right");
    expect(p.pinnedRight()).toEqual(["severity", "label", "actions"]);
  });

  it("orderedIds reflects group changes", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.setPin("severity", "right");
    expect(p.orderedIds()).toEqual([
      "pluginId",
      "label",
      "version",
      "severity",
      "actions",
    ]);
  });
});

describe("createPluginBrowserColumnPinning — reset", () => {
  it("resetColumn restores default", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.setPin("pluginId", "none");
    p.resetColumn("pluginId");
    expect(p.pinOf("pluginId")).toBe("left");
  });

  it("resetAll restores every default", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.setPin("pluginId", "none");
    p.setPin("severity", "right");
    p.resetAll();
    expect(p.pinOf("pluginId")).toBe("left");
    expect(p.pinOf("severity")).toBe("none");
  });

  it("resetColumn unknown id is no-op", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    expect(() => p.resetColumn("zzz")).not.toThrow();
  });
});

describe("createPluginBrowserColumnPinning — dedup + defaults", () => {
  it("dedupes duplicate ids (first wins)", () => {
    const p = createPluginBrowserColumnPinning([
      { id: "a", defaultPin: "left" },
      { id: "b" },
      { id: "a", defaultPin: "right" },
    ]);
    expect(p.size()).toBe(2);
    expect(p.pinOf("a")).toBe("left");
  });

  it("invalid defaultPin falls back to 'none'", () => {
    const p = createPluginBrowserColumnPinning([
      {
        id: "a",
        defaultPin: "middle" as unknown as "left",
      },
    ]);
    expect(p.pinOf("a")).toBe("none");
  });

  it("missing defaultPin defaults to 'none'", () => {
    const p = createPluginBrowserColumnPinning([{ id: "a" }]);
    expect(p.pinOf("a")).toBe("none");
  });
});

describe("createPluginBrowserColumnPinning — integration", () => {
  it("pinnedLeft + unpinned + pinnedRight = orderedIds", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.setPin("label", "right");
    const composed = [...p.pinnedLeft(), ...p.unpinned(), ...p.pinnedRight()];
    expect(p.orderedIds()).toEqual(composed);
  });

  it("orderedIds length always equals size()", () => {
    const p = createPluginBrowserColumnPinning(COLUMNS);
    p.setPin("severity", "left");
    p.setPin("version", "right");
    expect(p.orderedIds().length).toBe(p.size());
  });
});
