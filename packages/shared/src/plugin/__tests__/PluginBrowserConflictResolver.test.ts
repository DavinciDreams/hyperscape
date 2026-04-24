import { describe, expect, it } from "vitest";
import {
  createPluginBrowserConflictResolver,
  type PluginBrowserConflict,
} from "../PluginBrowserConflictResolver.js";

const oneMissing: readonly PluginBrowserConflict[] = [
  { requiredPluginId: "dep-a", kind: "missing" },
];

const multi: readonly PluginBrowserConflict[] = [
  { requiredPluginId: "dep-a", kind: "missing" },
  { requiredPluginId: "dep-b", kind: "disabled" },
  {
    requiredPluginId: "dep-c",
    kind: "version-mismatch",
    currentVersion: "1.0.0",
    requiredVersion: "2.0.0",
  },
];

describe("createPluginBrowserConflictResolver — defaults", () => {
  it("starts closed", () => {
    const r = createPluginBrowserConflictResolver();
    expect(r.hasOpen()).toBe(false);
    expect(r.getOpen()).toBeUndefined();
    expect(r.accept()).toBeUndefined();
    expect(r.cancel()).toBeUndefined();
    expect(r.close()).toBe(false);
  });
});

describe("createPluginBrowserConflictResolver — open", () => {
  it("opens a session with monotonic ids", () => {
    const r = createPluginBrowserConflictResolver();
    const s1 = r.open("plugin-a", oneMissing);
    expect(s1?.id).toBe(1);
    expect(s1?.pluginId).toBe("plugin-a");
    expect(s1?.conflicts).toHaveLength(1);
    expect(r.hasOpen()).toBe(true);
  });

  it("silently replaces a prior open session", () => {
    const r = createPluginBrowserConflictResolver();
    r.open("plugin-a", oneMissing);
    const s2 = r.open("plugin-b", oneMissing);
    expect(s2?.id).toBe(2);
    expect(r.getOpen()?.pluginId).toBe("plugin-b");
  });

  it("preserves version fields when provided", () => {
    const r = createPluginBrowserConflictResolver();
    const s = r.open("plugin-a", multi);
    const vc = s?.conflicts.find((c) => c.kind === "version-mismatch");
    expect(vc?.currentVersion).toBe("1.0.0");
    expect(vc?.requiredVersion).toBe("2.0.0");
  });

  it("drops empty version fields", () => {
    const r = createPluginBrowserConflictResolver();
    const s = r.open("plugin-a", [
      {
        requiredPluginId: "dep",
        kind: "version-mismatch",
        currentVersion: "",
        requiredVersion: "",
      },
    ]);
    expect(s?.conflicts[0].currentVersion).toBeUndefined();
    expect(s?.conflicts[0].requiredVersion).toBeUndefined();
  });

  it("rejects empty pluginId", () => {
    const r = createPluginBrowserConflictResolver();
    expect(r.open("", oneMissing)).toBeUndefined();
    expect(r.hasOpen()).toBe(false);
  });

  it("rejects empty conflicts array", () => {
    const r = createPluginBrowserConflictResolver();
    expect(r.open("plugin-a", [])).toBeUndefined();
  });

  it("rejects invalid conflict entry", () => {
    const r = createPluginBrowserConflictResolver();
    expect(
      r.open("plugin-a", [{ requiredPluginId: "", kind: "missing" }]),
    ).toBeUndefined();
    expect(
      r.open("plugin-a", [
        {
          requiredPluginId: "x",
          kind: "bogus" as unknown as "missing",
        },
      ]),
    ).toBeUndefined();
    expect(r.hasOpen()).toBe(false);
  });
});

describe("createPluginBrowserConflictResolver — accept", () => {
  it("returns closed session with outcome='accepted'", () => {
    const r = createPluginBrowserConflictResolver();
    r.open("plugin-a", multi);
    const closed = r.accept();
    expect(closed?.outcome).toBe("accepted");
    expect(closed?.pluginId).toBe("plugin-a");
    expect(closed?.conflicts).toHaveLength(3);
    expect(r.hasOpen()).toBe(false);
  });

  it("returns undefined when no session open", () => {
    const r = createPluginBrowserConflictResolver();
    expect(r.accept()).toBeUndefined();
  });
});

describe("createPluginBrowserConflictResolver — cancel", () => {
  it("returns closed session with outcome='canceled'", () => {
    const r = createPluginBrowserConflictResolver();
    r.open("plugin-a", oneMissing);
    const closed = r.cancel();
    expect(closed?.outcome).toBe("canceled");
    expect(r.hasOpen()).toBe(false);
  });

  it("returns undefined when no session open", () => {
    const r = createPluginBrowserConflictResolver();
    expect(r.cancel()).toBeUndefined();
  });
});

describe("createPluginBrowserConflictResolver — close", () => {
  it("force-closes without outcome", () => {
    const r = createPluginBrowserConflictResolver();
    r.open("plugin-a", oneMissing);
    expect(r.close()).toBe(true);
    expect(r.hasOpen()).toBe(false);
  });

  it("returns false when no session open", () => {
    const r = createPluginBrowserConflictResolver();
    expect(r.close()).toBe(false);
  });
});

describe("createPluginBrowserConflictResolver — monotonic ids", () => {
  it("increments across open cycles", () => {
    const r = createPluginBrowserConflictResolver();
    const s1 = r.open("a", oneMissing)!;
    r.accept();
    const s2 = r.open("b", oneMissing)!;
    r.cancel();
    const s3 = r.open("c", oneMissing)!;
    r.close();
    const s4 = r.open("d", oneMissing)!;
    expect(s1.id).toBe(1);
    expect(s2.id).toBe(2);
    expect(s3.id).toBe(3);
    expect(s4.id).toBe(4);
  });

  it("increments across silent replacements", () => {
    const r = createPluginBrowserConflictResolver();
    const s1 = r.open("a", oneMissing)!;
    const s2 = r.open("b", oneMissing)!;
    expect(s2.id).toBe(s1.id + 1);
  });
});
