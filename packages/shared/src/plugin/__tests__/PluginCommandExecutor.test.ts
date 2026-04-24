import { PluginManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginCatalog } from "../PluginCatalog.js";
import { executePluginCommand } from "../PluginCommandExecutor.js";
import type { PluginBrowserRow } from "../PluginBrowserSnapshot.js";
import { PluginContextScope } from "../PluginContextScope.js";
import { PluginHost, type PluginContextBase } from "../PluginHost.js";

function plugin(id: string) {
  return PluginManifestSchema.parse({
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
    dependencies: [],
    loadAfter: [],
  });
}

interface TestCtx extends PluginContextBase {
  readonly pluginId: string;
  readonly scope: PluginContextScope;
}

function buildHost(ids: string[]) {
  const cat = new PluginCatalog(ids.map(plugin));
  return new PluginHost<TestCtx>(cat, (manifest, scope) => ({
    pluginId: manifest.id,
    scope,
  }));
}

describe("executePluginCommand — read outcomes", () => {
  it("passes list through unchanged", async () => {
    const host = buildHost(["com.a"]);
    const res = await executePluginCommand({ kind: "list", rows: [] }, host);
    expect(res).toEqual({
      kind: "read",
      outcome: { kind: "list", rows: [] },
    });
  });

  it("passes info through unchanged", async () => {
    const host = buildHost(["com.a"]);
    const row = {
      id: "com.a",
      name: "A",
      version: "1.0.0",
      state: "enabled",
    } as PluginBrowserRow;
    const res = await executePluginCommand({ kind: "info", row }, host);
    expect(res).toEqual({ kind: "read", outcome: { kind: "info", row } });
  });

  it("passes unknown-plugin-id through unchanged", async () => {
    const host = buildHost([]);
    const res = await executePluginCommand(
      { kind: "unknown-plugin-id", pluginId: "com.missing" },
      host,
    );
    expect(res).toEqual({
      kind: "read",
      outcome: { kind: "unknown-plugin-id", pluginId: "com.missing" },
    });
  });
});

describe("executePluginCommand — pending-enable", () => {
  it("returns noop when resolver flagged noop=true", async () => {
    const host = buildHost(["com.a"]);
    const res = await executePluginCommand(
      {
        kind: "pending-enable",
        pluginId: "com.a",
        currentState: "enabled",
        noop: true,
      },
      host,
    );
    expect(res).toEqual({
      kind: "noop",
      pluginId: "com.a",
      mutation: "enable",
      reason: "already-enabled",
    });
  });

  it("applies enable via host when noop=false", async () => {
    const host = buildHost(["com.a"]);
    host.registerPlugin("com.a", () => ({}));
    await host.loadAll();
    const res = await executePluginCommand(
      {
        kind: "pending-enable",
        pluginId: "com.a",
        currentState: "loaded",
        noop: false,
      },
      host,
    );
    expect(res).toEqual({
      kind: "applied",
      pluginId: "com.a",
      mutation: "enable",
    });
    expect(host.getRecord("com.a").state).toBe("enabled");
  });

  it("captures host errors as failed result", async () => {
    const host = buildHost(["com.a"]);
    host.registerPlugin("com.a", () => ({
      onEnable: () => {
        throw new Error("boom");
      },
    }));
    await host.loadAll();
    const res = await executePluginCommand(
      {
        kind: "pending-enable",
        pluginId: "com.a",
        currentState: "loaded",
        noop: false,
      },
      host,
    );
    expect(res.kind).toBe("failed");
    if (res.kind !== "failed") throw new Error();
    expect(res.mutation).toBe("enable");
    expect(res.error.message).toMatch(/boom/);
  });
});

describe("executePluginCommand — pending-disable", () => {
  it("returns noop with reason=already-<state>", async () => {
    const host = buildHost(["com.a"]);
    const res = await executePluginCommand(
      {
        kind: "pending-disable",
        pluginId: "com.a",
        force: false,
        currentState: "disabled",
        impact: [],
        noop: true,
      },
      host,
    );
    expect(res).toEqual({
      kind: "noop",
      pluginId: "com.a",
      mutation: "disable",
      reason: "already-disabled",
    });
  });

  it("applies disable via host", async () => {
    const host = buildHost(["com.a"]);
    host.registerPlugin("com.a", () => ({}));
    await host.loadAndEnable();
    const res = await executePluginCommand(
      {
        kind: "pending-disable",
        pluginId: "com.a",
        force: false,
        currentState: "enabled",
        impact: [],
        noop: false,
      },
      host,
    );
    expect(res.kind).toBe("applied");
    expect(host.getRecord("com.a").state).toBe("disabled");
  });

  it("threads force=true to host", async () => {
    const host = buildHost(["com.a"]);
    host.registerPlugin("com.a", () => ({}));
    await host.loadAndEnable();
    // No dependents, so force is immaterial — we just assert the
    // applied result and state transition. Coverage of the force
    // branch sits in PluginLoaderPerPlugin.test.ts.
    const res = await executePluginCommand(
      {
        kind: "pending-disable",
        pluginId: "com.a",
        force: true,
        currentState: "enabled",
        impact: [],
        noop: false,
      },
      host,
    );
    expect(res.kind).toBe("applied");
  });
});

describe("executePluginCommand — pending-reload", () => {
  it("applies reload via host", async () => {
    const host = buildHost(["com.a"]);
    let built = 0;
    host.registerPlugin("com.a", () => {
      built++;
      return {};
    });
    await host.loadAndEnable();
    const res = await executePluginCommand(
      {
        kind: "pending-reload",
        pluginId: "com.a",
        currentState: "enabled",
      },
      host,
    );
    expect(res.kind).toBe("applied");
    expect(built).toBe(2);
    expect(host.getRecord("com.a").state).toBe("enabled");
  });

  it("captures host errors as failed result", async () => {
    const host = buildHost(["com.a"]);
    let callCount = 0;
    host.registerPlugin("com.a", () => {
      callCount++;
      if (callCount === 2) {
        return {
          onLoad: () => {
            throw new Error("boom");
          },
        };
      }
      return {};
    });
    await host.loadAll();
    const res = await executePluginCommand(
      {
        kind: "pending-reload",
        pluginId: "com.a",
        currentState: "loaded",
      },
      host,
    );
    expect(res.kind).toBe("failed");
    if (res.kind !== "failed") throw new Error();
    expect(res.mutation).toBe("reload");
    expect(res.error.message).toMatch(/boom/);
  });
});
