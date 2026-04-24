import { PluginManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import { PluginCatalog } from "../PluginCatalog.js";
import {
  disablePluginSubset,
  enablePluginSubset,
  reloadPluginSubset,
} from "../PluginBulkOperations.js";
import { PluginContextScope } from "../PluginContextScope.js";
import { PluginHost, type PluginContextBase } from "../PluginHost.js";

function plugin(id: string, deps: { id: string; optional?: boolean }[] = []) {
  return PluginManifestSchema.parse({
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
    dependencies: deps.map((d) => ({
      id: d.id,
      versionRange: "^1.0.0",
      optional: d.optional ?? false,
    })),
    loadAfter: [],
  });
}

interface TestCtx extends PluginContextBase {
  readonly pluginId: string;
  readonly scope: PluginContextScope;
}

function buildHost(manifests: ReturnType<typeof plugin>[]) {
  const cat = new PluginCatalog(manifests);
  return new PluginHost<TestCtx>(cat, (manifest, scope) => ({
    pluginId: manifest.id,
    scope,
  }));
}

describe("enablePluginSubset", () => {
  it("enables in forward topological order", async () => {
    const host = buildHost([
      plugin("com.a"),
      plugin("com.b", [{ id: "com.a" }]),
      plugin("com.c", [{ id: "com.b" }]),
    ]);
    const order: string[] = [];
    host.registerPlugin("com.a", () => ({
      onEnable: () => {
        order.push("a");
      },
    }));
    host.registerPlugin("com.b", () => ({
      onEnable: () => {
        order.push("b");
      },
    }));
    host.registerPlugin("com.c", () => ({
      onEnable: () => {
        order.push("c");
      },
    }));
    await host.loadAll();
    // Supply ids out of order — bulk should re-order by catalog topo
    const res = await enablePluginSubset(host, ["com.c", "com.a", "com.b"]);
    expect(order).toEqual(["a", "b", "c"]);
    expect(res.items.every((i) => i.kind === "applied")).toBe(true);
  });

  it("captures individual failures, continues by default", async () => {
    const host = buildHost([plugin("com.a"), plugin("com.b")]);
    host.registerPlugin("com.a", () => ({
      onEnable: () => {
        throw new Error("boom");
      },
    }));
    const onEnableB = vi.fn();
    host.registerPlugin("com.b", () => ({ onEnable: onEnableB }));
    await host.loadAll();
    const res = await enablePluginSubset(host, ["com.a", "com.b"]);
    expect(res.items[0].kind).toBe("failed");
    expect(res.items[1].kind).toBe("applied");
    expect(onEnableB).toHaveBeenCalled();
  });

  it("short-circuits remaining with abortOnError=true", async () => {
    const host = buildHost([plugin("com.a"), plugin("com.b")]);
    host.registerPlugin("com.a", () => ({
      onEnable: () => {
        throw new Error("boom");
      },
    }));
    const onEnableB = vi.fn();
    host.registerPlugin("com.b", () => ({ onEnable: onEnableB }));
    await host.loadAll();
    const res = await enablePluginSubset(host, ["com.a", "com.b"], {
      abortOnError: true,
    });
    expect(res.items[0].kind).toBe("failed");
    expect(res.items[1]).toMatchObject({
      kind: "skipped",
      reason: "batch-aborted",
    });
    expect(onEnableB).not.toHaveBeenCalled();
  });
});

describe("disablePluginSubset", () => {
  it("disables in REVERSE topological order", async () => {
    const host = buildHost([
      plugin("com.a"),
      plugin("com.b", [{ id: "com.a" }]),
      plugin("com.c", [{ id: "com.b" }]),
    ]);
    const order: string[] = [];
    host.registerPlugin("com.a", () => ({
      onDisable: () => {
        order.push("a");
      },
    }));
    host.registerPlugin("com.b", () => ({
      onDisable: () => {
        order.push("b");
      },
    }));
    host.registerPlugin("com.c", () => ({
      onDisable: () => {
        order.push("c");
      },
    }));
    await host.loadAndEnable();
    const res = await disablePluginSubset(host, ["com.a", "com.c", "com.b"]);
    expect(order).toEqual(["c", "b", "a"]);
    expect(res.items.every((i) => i.kind === "applied")).toBe(true);
  });

  it("threads force=true to disablePlugin", async () => {
    const host = buildHost([
      plugin("com.dep"),
      plugin("com.a", [{ id: "com.dep" }]),
    ]);
    host.registerPlugin("com.dep", () => ({}));
    host.registerPlugin("com.a", () => ({}));
    await host.loadAndEnable();
    // Disabling only com.dep would fail without force (com.a still enabled).
    const res = await disablePluginSubset(host, ["com.dep"], {
      force: true,
    });
    expect(res.items[0].kind).toBe("applied");
    expect(host.getRecord("com.dep").state).toBe("disabled");
  });
});

describe("reloadPluginSubset", () => {
  it("reloads each plugin, preserves prior state", async () => {
    const host = buildHost([plugin("com.a"), plugin("com.b")]);
    let builtA = 0;
    let builtB = 0;
    host.registerPlugin("com.a", () => {
      builtA++;
      return {};
    });
    host.registerPlugin("com.b", () => {
      builtB++;
      return {};
    });
    await host.loadAndEnable();
    const res = await reloadPluginSubset(host, ["com.a", "com.b"]);
    expect(res.items.every((i) => i.kind === "applied")).toBe(true);
    expect(builtA).toBe(2);
    expect(builtB).toBe(2);
    expect(host.getRecord("com.a").state).toBe("enabled");
    expect(host.getRecord("com.b").state).toBe("enabled");
  });

  it("captures reload failures", async () => {
    const host = buildHost([plugin("com.a")]);
    let calls = 0;
    host.registerPlugin("com.a", () => {
      calls++;
      if (calls === 2) {
        return {
          onLoad: () => {
            throw new Error("boom");
          },
        };
      }
      return {};
    });
    await host.loadAndEnable();
    const res = await reloadPluginSubset(host, ["com.a"]);
    expect(res.items[0].kind).toBe("failed");
  });
});

describe("bulk ordering — ids outside catalog", () => {
  it("enable subset silently drops unknown ids (not in catalog load order)", async () => {
    const host = buildHost([plugin("com.a")]);
    host.registerPlugin("com.a", () => ({}));
    await host.loadAll();
    const res = await enablePluginSubset(host, ["com.a", "com.unknown"]);
    // Only com.a processed (unknown filtered out during ordering)
    expect(res.items).toHaveLength(1);
    expect(res.items[0].pluginId).toBe("com.a");
    expect(res.items[0].kind).toBe("applied");
  });

  it("empty subset produces empty result", async () => {
    const host = buildHost([plugin("com.a")]);
    const res = await enablePluginSubset(host, []);
    expect(res.items).toEqual([]);
  });
});
