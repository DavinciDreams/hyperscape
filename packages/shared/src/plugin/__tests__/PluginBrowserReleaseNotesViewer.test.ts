import { describe, expect, it } from "vitest";
import { createPluginBrowserReleaseNotesViewer } from "../PluginBrowserReleaseNotesViewer.js";

describe("createPluginBrowserReleaseNotesViewer — defaults", () => {
  it("starts closed", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    expect(v.isOpen()).toBe(false);
    expect(v.getState()).toBeUndefined();
    expect(v.select("1.0.0")).toBe(false);
    expect(v.markRead("1.0.0")).toBe(false);
    expect(v.isRead("1.0.0")).toBe(false);
    expect(v.unreadVersions()).toEqual([]);
    expect(v.close()).toBe(false);
  });
});

describe("createPluginBrowserReleaseNotesViewer — open", () => {
  it("opens and activates the first version", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    const s = v.open("p", ["1.0.0", "1.1.0", "2.0.0"]);
    expect(s?.pluginId).toBe("p");
    expect(s?.activeVersion).toBe("1.0.0");
    expect(s?.versions).toEqual(["1.0.0", "1.1.0", "2.0.0"]);
    expect(v.isOpen()).toBe(true);
  });

  it("replaces a prior open state", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("a", ["1.0.0"]);
    const s2 = v.open("b", ["0.1.0", "0.2.0"]);
    expect(s2?.pluginId).toBe("b");
    expect(s2?.activeVersion).toBe("0.1.0");
  });

  it("rejects empty pluginId / empty or duplicate versions", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    expect(v.open("", ["1.0.0"])).toBeUndefined();
    expect(v.open("p", [])).toBeUndefined();
    expect(v.open("p", ["1.0.0", ""])).toBeUndefined();
    expect(v.open("p", ["1.0.0", "1.0.0"])).toBeUndefined();
    expect(v.isOpen()).toBe(false);
  });

  it("snapshot isolation of versions array", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    const versions = ["1.0.0", "1.1.0"];
    v.open("p", versions);
    versions.push("2.0.0");
    expect(v.getState()?.versions).toEqual(["1.0.0", "1.1.0"]);
  });
});

describe("createPluginBrowserReleaseNotesViewer — select", () => {
  it("activates another known version", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("p", ["1.0.0", "1.1.0"]);
    expect(v.select("1.1.0")).toBe(true);
    expect(v.getState()?.activeVersion).toBe("1.1.0");
  });

  it("rejects unknown version / empty version / already active", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("p", ["1.0.0", "1.1.0"]);
    expect(v.select("9.9.9")).toBe(false);
    expect(v.select("")).toBe(false);
    expect(v.select("1.0.0")).toBe(false);
    expect(v.getState()?.activeVersion).toBe("1.0.0");
  });

  it("returns false when no viewer open", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    expect(v.select("1.0.0")).toBe(false);
  });
});

describe("createPluginBrowserReleaseNotesViewer — markRead / isRead", () => {
  it("flips a version to read and reports it", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("p", ["1.0.0", "1.1.0"]);
    expect(v.markRead("1.0.0")).toBe(true);
    expect(v.isRead("1.0.0")).toBe(true);
    expect(v.isRead("1.1.0")).toBe(false);
  });

  it("idempotent on re-mark (returns false)", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("p", ["1.0.0"]);
    v.markRead("1.0.0");
    expect(v.markRead("1.0.0")).toBe(false);
  });

  it("rejects unknown version / empty version", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("p", ["1.0.0"]);
    expect(v.markRead("9.9.9")).toBe(false);
    expect(v.markRead("")).toBe(false);
  });

  it("returns false when no viewer open", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    expect(v.markRead("1.0.0")).toBe(false);
    expect(v.isRead("1.0.0")).toBe(false);
  });

  it("read state persists across close + re-open for same plugin", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("p", ["1.0.0", "1.1.0"]);
    v.markRead("1.0.0");
    v.close();
    v.open("p", ["1.0.0", "1.1.0", "2.0.0"]);
    expect(v.isRead("1.0.0")).toBe(true);
    expect(v.isRead("1.1.0")).toBe(false);
    expect(v.isRead("2.0.0")).toBe(false);
  });

  it("read state is scoped per-plugin", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("a", ["1.0.0"]);
    v.markRead("1.0.0");
    v.open("b", ["1.0.0"]);
    expect(v.isRead("1.0.0")).toBe(false);
  });
});

describe("createPluginBrowserReleaseNotesViewer — unreadVersions", () => {
  it("returns insertion order filtered to unread", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("p", ["1.0.0", "1.1.0", "2.0.0"]);
    v.markRead("1.1.0");
    expect(v.unreadVersions()).toEqual(["1.0.0", "2.0.0"]);
  });

  it("returns all versions when none read", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("p", ["1.0.0", "1.1.0"]);
    expect(v.unreadVersions()).toEqual(["1.0.0", "1.1.0"]);
  });

  it("returns empty when all read", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("p", ["1.0.0", "1.1.0"]);
    v.markRead("1.0.0");
    v.markRead("1.1.0");
    expect(v.unreadVersions()).toEqual([]);
  });

  it("returns empty when no viewer open", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    expect(v.unreadVersions()).toEqual([]);
  });
});

describe("createPluginBrowserReleaseNotesViewer — close / clearAllReadState", () => {
  it("close drops the viewer but keeps read state", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("p", ["1.0.0"]);
    v.markRead("1.0.0");
    expect(v.close()).toBe(true);
    expect(v.isOpen()).toBe(false);
    v.open("p", ["1.0.0"]);
    expect(v.isRead("1.0.0")).toBe(true);
  });

  it("clearAllReadState wipes read state across plugins without closing", () => {
    const v = createPluginBrowserReleaseNotesViewer();
    v.open("a", ["1.0.0"]);
    v.markRead("1.0.0");
    v.close();
    v.open("b", ["0.1.0"]);
    v.markRead("0.1.0");
    v.clearAllReadState();
    expect(v.isRead("0.1.0")).toBe(false);
    expect(v.isOpen()).toBe(true);
    v.close();
    v.open("a", ["1.0.0"]);
    expect(v.isRead("1.0.0")).toBe(false);
  });
});
