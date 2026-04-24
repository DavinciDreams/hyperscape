import { describe, expect, it } from "vitest";
import { createPluginBrowserPermissionGrants } from "../PluginBrowserPermissionGrants.js";

describe("createPluginBrowserPermissionGrants — defaults", () => {
  it("starts empty", () => {
    const g = createPluginBrowserPermissionGrants();
    expect(g.isGranted("a", "network")).toBe(false);
    expect(g.isDenied("a", "network")).toBe(false);
    expect(g.getState("a", "network")).toBeUndefined();
    expect(g.grantedPermissions("a")).toEqual([]);
    expect(g.deniedPermissions("a")).toEqual([]);
    expect(g.pluginsWithRecords()).toEqual([]);
    expect(g.totalRecordCount()).toBe(0);
    expect(g.entries()).toEqual([]);
  });
});

describe("createPluginBrowserPermissionGrants — grant", () => {
  it("records grant", () => {
    const g = createPluginBrowserPermissionGrants();
    expect(g.grant("a", "network")).toBe(true);
    expect(g.isGranted("a", "network")).toBe(true);
    expect(g.getState("a", "network")).toBe("granted");
  });

  it("is idempotent when already granted", () => {
    const g = createPluginBrowserPermissionGrants();
    g.grant("a", "network");
    expect(g.grant("a", "network")).toBe(false);
  });

  it("flips a denied record to granted", () => {
    const g = createPluginBrowserPermissionGrants();
    g.deny("a", "network");
    expect(g.grant("a", "network")).toBe(true);
    expect(g.isGranted("a", "network")).toBe(true);
    expect(g.isDenied("a", "network")).toBe(false);
  });

  it("rejects empty ids", () => {
    const g = createPluginBrowserPermissionGrants();
    expect(g.grant("", "network")).toBe(false);
    expect(g.grant("a", "")).toBe(false);
    expect(g.pluginsWithRecords()).toEqual([]);
  });
});

describe("createPluginBrowserPermissionGrants — deny", () => {
  it("records denial", () => {
    const g = createPluginBrowserPermissionGrants();
    expect(g.deny("a", "network")).toBe(true);
    expect(g.isDenied("a", "network")).toBe(true);
    expect(g.getState("a", "network")).toBe("denied");
  });

  it("is idempotent when already denied", () => {
    const g = createPluginBrowserPermissionGrants();
    g.deny("a", "network");
    expect(g.deny("a", "network")).toBe(false);
  });

  it("flips a granted record to denied", () => {
    const g = createPluginBrowserPermissionGrants();
    g.grant("a", "network");
    expect(g.deny("a", "network")).toBe(true);
    expect(g.isDenied("a", "network")).toBe(true);
    expect(g.isGranted("a", "network")).toBe(false);
  });
});

describe("createPluginBrowserPermissionGrants — reset", () => {
  it("removes a recorded grant", () => {
    const g = createPluginBrowserPermissionGrants();
    g.grant("a", "network");
    expect(g.reset("a", "network")).toBe(true);
    expect(g.getState("a", "network")).toBeUndefined();
  });

  it("removes a recorded denial", () => {
    const g = createPluginBrowserPermissionGrants();
    g.deny("a", "network");
    expect(g.reset("a", "network")).toBe(true);
    expect(g.getState("a", "network")).toBeUndefined();
  });

  it("returns false on unknown record", () => {
    const g = createPluginBrowserPermissionGrants();
    expect(g.reset("a", "network")).toBe(false);
  });

  it("drops plugin entry when last record reset", () => {
    const g = createPluginBrowserPermissionGrants();
    g.grant("a", "network");
    g.reset("a", "network");
    expect(g.pluginsWithRecords()).toEqual([]);
  });

  it("rejects empty ids", () => {
    const g = createPluginBrowserPermissionGrants();
    expect(g.reset("", "network")).toBe(false);
    expect(g.reset("a", "")).toBe(false);
  });
});

describe("createPluginBrowserPermissionGrants — clearForPlugin", () => {
  it("drops every record for a plugin", () => {
    const g = createPluginBrowserPermissionGrants();
    g.grant("a", "network");
    g.deny("a", "filesystem");
    expect(g.clearForPlugin("a")).toBe(true);
    expect(g.pluginsWithRecords()).toEqual([]);
  });

  it("returns false when plugin had no records", () => {
    const g = createPluginBrowserPermissionGrants();
    expect(g.clearForPlugin("nope")).toBe(false);
  });

  it("rejects empty id", () => {
    const g = createPluginBrowserPermissionGrants();
    expect(g.clearForPlugin("")).toBe(false);
  });
});

describe("createPluginBrowserPermissionGrants — listings", () => {
  it("grantedPermissions returns only granted", () => {
    const g = createPluginBrowserPermissionGrants();
    g.grant("a", "network");
    g.deny("a", "filesystem");
    g.grant("a", "clipboard");
    expect(g.grantedPermissions("a")).toEqual(["network", "clipboard"]);
    expect(g.deniedPermissions("a")).toEqual(["filesystem"]);
  });

  it("preserves insertion order", () => {
    const g = createPluginBrowserPermissionGrants();
    g.grant("a", "one");
    g.grant("a", "two");
    g.grant("a", "three");
    expect(g.grantedPermissions("a")).toEqual(["one", "two", "three"]);
  });

  it("unknown plugin returns empty", () => {
    const g = createPluginBrowserPermissionGrants();
    expect(g.grantedPermissions("nope")).toEqual([]);
    expect(g.deniedPermissions("nope")).toEqual([]);
  });
});

describe("createPluginBrowserPermissionGrants — cross-plugin", () => {
  it("tracks multiple plugins", () => {
    const g = createPluginBrowserPermissionGrants();
    g.grant("a", "network");
    g.deny("b", "filesystem");
    g.grant("c", "clipboard");
    expect(g.pluginsWithRecords()).toEqual(["a", "b", "c"]);
    expect(g.totalRecordCount()).toBe(3);
  });

  it("clearing one plugin preserves others", () => {
    const g = createPluginBrowserPermissionGrants();
    g.grant("a", "x");
    g.grant("b", "y");
    g.clearForPlugin("a");
    expect(g.pluginsWithRecords()).toEqual(["b"]);
  });
});

describe("createPluginBrowserPermissionGrants — clear + entries", () => {
  it("clear wipes everything", () => {
    const g = createPluginBrowserPermissionGrants();
    g.grant("a", "x");
    g.deny("b", "y");
    g.clear();
    expect(g.totalRecordCount()).toBe(0);
  });

  it("entries snapshots all records in insertion order", () => {
    const g = createPluginBrowserPermissionGrants();
    g.grant("a", "network");
    g.deny("a", "filesystem");
    g.grant("b", "clipboard");
    expect(g.entries()).toEqual([
      { pluginId: "a", permission: "network", state: "granted" },
      { pluginId: "a", permission: "filesystem", state: "denied" },
      { pluginId: "b", permission: "clipboard", state: "granted" },
    ]);
  });
});
