import { describe, expect, it } from "vitest";
import {
  NoPluginBrowserDetailsTabsError,
  createPluginBrowserDetailsTab,
} from "../PluginBrowserDetailsTab.js";

const TABS = [
  { id: "overview" },
  { id: "contributions" },
  { id: "health" },
  { id: "changelog" },
] as const;

describe("createPluginBrowserDetailsTab — authored tabs", () => {
  it("defaults to first tab", () => {
    const t = createPluginBrowserDetailsTab({ tabs: TABS });
    expect(t.activeId()).toBe("overview");
    expect(t.activeIndex()).toBe(0);
  });

  it("exposes tab ids in authored order", () => {
    const t = createPluginBrowserDetailsTab({ tabs: TABS });
    expect(t.tabIds()).toEqual([
      "overview",
      "contributions",
      "health",
      "changelog",
    ]);
    expect(t.tabCount()).toBe(4);
  });

  it("dedupes duplicates (first wins)", () => {
    const t = createPluginBrowserDetailsTab({
      tabs: [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }],
    });
    expect(t.tabIds()).toEqual(["a", "b", "c"]);
  });

  it("drops empty id entries", () => {
    const t = createPluginBrowserDetailsTab({
      tabs: [{ id: "a" }, { id: "" }, { id: "b" }],
    });
    expect(t.tabIds()).toEqual(["a", "b"]);
  });

  it("throws when no valid tabs remain", () => {
    expect(() => createPluginBrowserDetailsTab({ tabs: [] })).toThrow(
      NoPluginBrowserDetailsTabsError,
    );
    expect(() =>
      createPluginBrowserDetailsTab({
        tabs: [{ id: "" }],
      }),
    ).toThrow(NoPluginBrowserDetailsTabsError);
  });
});

describe("createPluginBrowserDetailsTab — initialActiveId", () => {
  it("honors a known initial id", () => {
    const t = createPluginBrowserDetailsTab({
      tabs: TABS,
      initialActiveId: "health",
    });
    expect(t.activeId()).toBe("health");
    expect(t.activeIndex()).toBe(2);
  });

  it("falls back to first tab when unknown", () => {
    const t = createPluginBrowserDetailsTab({
      tabs: TABS,
      initialActiveId: "gallery",
    });
    expect(t.activeId()).toBe("overview");
  });

  it("falls back to first tab when empty", () => {
    const t = createPluginBrowserDetailsTab({
      tabs: TABS,
      initialActiveId: "",
    });
    expect(t.activeId()).toBe("overview");
  });
});

describe("createPluginBrowserDetailsTab — setActive", () => {
  it("changes tab and returns true", () => {
    const t = createPluginBrowserDetailsTab({ tabs: TABS });
    expect(t.setActive("contributions")).toBe(true);
    expect(t.activeId()).toBe("contributions");
  });

  it("returns false on already-active tab", () => {
    const t = createPluginBrowserDetailsTab({ tabs: TABS });
    expect(t.setActive("overview")).toBe(false);
  });

  it("returns false on unknown id", () => {
    const t = createPluginBrowserDetailsTab({ tabs: TABS });
    expect(t.setActive("gallery")).toBe(false);
    expect(t.activeId()).toBe("overview");
  });

  it("returns false on empty id", () => {
    const t = createPluginBrowserDetailsTab({ tabs: TABS });
    expect(t.setActive("")).toBe(false);
    expect(t.activeId()).toBe("overview");
  });
});

describe("createPluginBrowserDetailsTab — next / previous", () => {
  it("next advances one tab", () => {
    const t = createPluginBrowserDetailsTab({ tabs: TABS });
    t.next();
    expect(t.activeId()).toBe("contributions");
    t.next();
    expect(t.activeId()).toBe("health");
  });

  it("next wraps past end", () => {
    const t = createPluginBrowserDetailsTab({
      tabs: TABS,
      initialActiveId: "changelog",
    });
    t.next();
    expect(t.activeId()).toBe("overview");
  });

  it("previous steps back one tab", () => {
    const t = createPluginBrowserDetailsTab({
      tabs: TABS,
      initialActiveId: "health",
    });
    t.previous();
    expect(t.activeId()).toBe("contributions");
  });

  it("previous wraps before start", () => {
    const t = createPluginBrowserDetailsTab({ tabs: TABS });
    t.previous();
    expect(t.activeId()).toBe("changelog");
  });

  it("next is a no-op when only one tab exists", () => {
    const t = createPluginBrowserDetailsTab({
      tabs: [{ id: "only" }],
    });
    t.next();
    expect(t.activeId()).toBe("only");
    t.previous();
    expect(t.activeId()).toBe("only");
  });
});

describe("createPluginBrowserDetailsTab — reset", () => {
  it("restores to the first authored tab", () => {
    const t = createPluginBrowserDetailsTab({
      tabs: TABS,
      initialActiveId: "health",
    });
    t.reset();
    expect(t.activeId()).toBe("overview");
  });
});

describe("createPluginBrowserDetailsTab — isKnown", () => {
  it("true for authored tabs", () => {
    const t = createPluginBrowserDetailsTab({ tabs: TABS });
    expect(t.isKnown("health")).toBe(true);
  });

  it("false for unknown id", () => {
    const t = createPluginBrowserDetailsTab({ tabs: TABS });
    expect(t.isKnown("gallery")).toBe(false);
  });

  it("false for empty id", () => {
    const t = createPluginBrowserDetailsTab({ tabs: TABS });
    expect(t.isKnown("")).toBe(false);
  });
});

describe("createPluginBrowserDetailsTab — tabIds isolation", () => {
  it("returned slice does not mutate internal state", () => {
    const t = createPluginBrowserDetailsTab({ tabs: TABS });
    const ids = t.tabIds() as string[];
    ids.length = 0;
    expect(t.tabIds()).toHaveLength(4);
  });
});
