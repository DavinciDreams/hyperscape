import { PluginManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import { PluginCatalog } from "../PluginCatalog.js";
import {
  computeEnableImpact,
  enablePluginChain,
} from "../PluginChainEnable.js";
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

describe("computeEnableImpact", () => {
  it("returns target alone when it has no deps and is loaded", async () => {
    const host = buildHost([plugin("com.a")]);
    host.registerPlugin("com.a", () => ({}));
    await host.loadAll();
    const impact = computeEnableImpact(host.catalog, host, "com.a");
    expect(impact).toEqual([
      { pluginId: "com.a", currentState: "loaded", isTarget: true },
    ]);
  });

  it("returns deps-first order with target last", async () => {
    const host = buildHost([
      plugin("com.a"),
      plugin("com.b", [{ id: "com.a" }]),
      plugin("com.c", [{ id: "com.b" }]),
    ]);
    host.registerPlugin("com.a", () => ({}));
    host.registerPlugin("com.b", () => ({}));
    host.registerPlugin("com.c", () => ({}));
    await host.loadAll();
    const impact = computeEnableImpact(host.catalog, host, "com.c");
    expect(impact.map((e) => e.pluginId)).toEqual(["com.a", "com.b", "com.c"]);
    expect(impact.map((e) => e.isTarget)).toEqual([false, false, true]);
  });

  it("filters out deps that are already enabled", async () => {
    const host = buildHost([
      plugin("com.a"),
      plugin("com.b", [{ id: "com.a" }]),
      plugin("com.c", [{ id: "com.b" }]),
    ]);
    host.registerPlugin("com.a", () => ({}));
    host.registerPlugin("com.b", () => ({}));
    host.registerPlugin("com.c", () => ({}));
    await host.loadAll();
    await host.enablePlugin("com.a");
    const impact = computeEnableImpact(host.catalog, host, "com.c");
    expect(impact.map((e) => e.pluginId)).toEqual(["com.b", "com.c"]);
  });

  it("excludes target when target itself is already enabled", async () => {
    const host = buildHost([plugin("com.a")]);
    host.registerPlugin("com.a", () => ({}));
    await host.loadAndEnable();
    const impact = computeEnableImpact(host.catalog, host, "com.a");
    expect(impact).toEqual([]);
  });

  it("returns empty for unknown id", () => {
    const host = buildHost([plugin("com.a")]);
    const impact = computeEnableImpact(host.catalog, host, "com.unknown");
    expect(impact).toEqual([]);
  });

  it("includes ancestor in failed state so editor can warn pre-dispatch", async () => {
    const host = buildHost([
      plugin("com.a"),
      plugin("com.b", [{ id: "com.a" }]),
    ]);
    host.registerPlugin("com.a", () => ({
      onLoad: () => {
        throw new Error("boom");
      },
    }));
    host.registerPlugin("com.b", () => ({}));
    // com.a transitions to failed during loadAll; com.b stays registered
    // since its manifest dep can't load.
    await expect(host.loadAll()).rejects.toThrow();
    const impact = computeEnableImpact(host.catalog, host, "com.b");
    const a = impact.find((e) => e.pluginId === "com.a");
    expect(a?.currentState).toBe("failed");
  });
});

describe("enablePluginChain", () => {
  it("enables a no-dep target", async () => {
    const host = buildHost([plugin("com.a")]);
    host.registerPlugin("com.a", () => ({}));
    await host.loadAll();
    const res = await enablePluginChain(host, "com.a");
    expect(res.targetId).toBe("com.a");
    expect(res.items).toEqual([
      { kind: "applied", pluginId: "com.a", isTarget: true },
    ]);
    expect(host.getRecord("com.a").state).toBe("enabled");
  });

  it("chains through hard deps in forward order", async () => {
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
    const res = await enablePluginChain(host, "com.c");
    expect(order).toEqual(["a", "b", "c"]);
    expect(res.items.map((i) => i.kind)).toEqual([
      "applied",
      "applied",
      "applied",
    ]);
    expect(res.items.find((i) => i.isTarget)?.pluginId).toBe("com.c");
  });

  it("skips deps already enabled — only pulls in the missing ones", async () => {
    const host = buildHost([
      plugin("com.a"),
      plugin("com.b", [{ id: "com.a" }]),
      plugin("com.c", [{ id: "com.b" }]),
    ]);
    const onEnableA = vi.fn();
    host.registerPlugin("com.a", () => ({ onEnable: onEnableA }));
    host.registerPlugin("com.b", () => ({}));
    host.registerPlugin("com.c", () => ({}));
    await host.loadAll();
    await host.enablePlugin("com.a");
    onEnableA.mockClear();
    const res = await enablePluginChain(host, "com.c");
    expect(res.items.map((i) => i.pluginId)).toEqual(["com.b", "com.c"]);
    expect(onEnableA).not.toHaveBeenCalled();
  });

  it("short-circuits on dep failure and marks remaining chain-aborted", async () => {
    const host = buildHost([
      plugin("com.a"),
      plugin("com.b", [{ id: "com.a" }]),
    ]);
    host.registerPlugin("com.a", () => ({
      onEnable: () => {
        throw new Error("dep-boom");
      },
    }));
    const onEnableB = vi.fn();
    host.registerPlugin("com.b", () => ({ onEnable: onEnableB }));
    await host.loadAll();
    const res = await enablePluginChain(host, "com.b");
    expect(res.items[0]).toMatchObject({ kind: "failed", pluginId: "com.a" });
    expect(res.items[1]).toMatchObject({
      kind: "skipped",
      pluginId: "com.b",
      isTarget: true,
      reason: "chain-aborted",
    });
    expect(onEnableB).not.toHaveBeenCalled();
  });

  it("captures target failure as failed item", async () => {
    const host = buildHost([plugin("com.a")]);
    host.registerPlugin("com.a", () => ({
      onEnable: () => {
        throw new Error("target-boom");
      },
    }));
    await host.loadAll();
    const res = await enablePluginChain(host, "com.a");
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      kind: "failed",
      pluginId: "com.a",
      isTarget: true,
    });
  });

  it("empty chain when target is already enabled", async () => {
    const host = buildHost([plugin("com.a")]);
    host.registerPlugin("com.a", () => ({}));
    await host.loadAndEnable();
    const res = await enablePluginChain(host, "com.a");
    expect(res.items).toEqual([]);
  });
});
