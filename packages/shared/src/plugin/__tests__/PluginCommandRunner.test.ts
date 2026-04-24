import { PluginManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginCatalog } from "../PluginCatalog.js";
import type { PluginBrowserRow } from "../PluginBrowserSnapshot.js";
import { PluginCommandParseError } from "../PluginCommandParser.js";
import {
  journalPluginExecutionResult,
  runPluginCommandLine,
} from "../PluginCommandRunner.js";
import { PluginHost, type PluginContextBase } from "../PluginHost.js";
import { PluginContextScope } from "../PluginContextScope.js";
import { PluginLifecycleJournal } from "../PluginLifecycleJournal.js";

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

function mkRow(partial: Partial<PluginBrowserRow>): PluginBrowserRow {
  return {
    id: "com.example",
    name: "Example",
    version: "1.0.0",
    description: "",
    author: "Acme",
    license: "MIT",
    state: "loaded",
    enabledByDefault: true,
    hasFactory: true,
    dependencyIds: [],
    tags: [],
    contributions: {
      systems: 0,
      entities: 0,
      widgets: 0,
      manifestSchemas: 0,
      paletteCategories: 0,
      toolbarTools: 0,
      commands: 0,
    },
    errorMessage: null,
    healthIssues: [],
    ...partial,
  } as PluginBrowserRow;
}

describe("runPluginCommandLine — parse errors", () => {
  it("returns parse-error for invalid input", async () => {
    const host = buildHost([]);
    const res = await runPluginCommandLine("not a command", {
      host,
      rows: [],
    });
    expect(res.kind).toBe("parse-error");
    if (res.kind !== "parse-error") throw new Error();
    expect(res.error).toBeInstanceOf(PluginCommandParseError);
  });
});

describe("runPluginCommandLine — read passthrough", () => {
  it("executes list against rows", async () => {
    const host = buildHost([]);
    const rows = [mkRow({ id: "com.a", state: "enabled" })];
    const res = await runPluginCommandLine("plugin list", { host, rows });
    expect(res.kind).toBe("executed");
    if (res.kind !== "executed") throw new Error();
    expect(res.result.kind).toBe("read");
  });

  it("executes info and returns unknown-plugin-id for missing row", async () => {
    const host = buildHost([]);
    const res = await runPluginCommandLine("plugin info com.missing", {
      host,
      rows: [],
    });
    if (res.kind !== "executed" || res.result.kind !== "read")
      throw new Error();
    expect(res.result.outcome).toEqual({
      kind: "unknown-plugin-id",
      pluginId: "com.missing",
    });
  });
});

describe("runPluginCommandLine — lifecycle end-to-end", () => {
  it("parses + resolves + executes enable", async () => {
    const host = buildHost(["com.a"]);
    host.registerPlugin("com.a", () => ({}));
    await host.loadAll();
    const rows = [mkRow({ id: "com.a", state: "loaded" })];
    const res = await runPluginCommandLine("plugin enable com.a", {
      host,
      rows,
    });
    if (res.kind !== "executed") throw new Error();
    expect(res.result.kind).toBe("applied");
    expect(host.getRecord("com.a").state).toBe("enabled");
  });

  it("carries disable --force through to host", async () => {
    const host = buildHost(["com.a"]);
    host.registerPlugin("com.a", () => ({}));
    await host.loadAndEnable();
    const rows = [mkRow({ id: "com.a", state: "enabled" })];
    const res = await runPluginCommandLine("plugin disable com.a --force", {
      host,
      rows,
    });
    if (res.kind !== "executed") throw new Error();
    expect(res.result.kind).toBe("applied");
  });

  it("short-circuits noop when resolver flags already-enabled", async () => {
    const host = buildHost(["com.a"]);
    const rows = [mkRow({ id: "com.a", state: "enabled" })];
    const res = await runPluginCommandLine("plugin enable com.a", {
      host,
      rows,
    });
    if (res.kind !== "executed" || res.result.kind !== "noop")
      throw new Error();
    expect(res.result.reason).toBe("already-enabled");
  });
});

describe("runPluginCommandLine — journal integration", () => {
  it("records applied mutations with provided clock", async () => {
    const host = buildHost(["com.a"]);
    host.registerPlugin("com.a", () => ({}));
    await host.loadAll();
    const rows = [mkRow({ id: "com.a", state: "loaded" })];
    const journal = new PluginLifecycleJournal();
    let t = 1000;
    await runPluginCommandLine("plugin enable com.a", {
      host,
      rows,
      journal,
      now: () => t++,
    });
    const events = journal.all();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      at: 1000,
      pluginId: "com.a",
      phase: "enable",
      outcome: "success",
    });
  });

  it("records failed mutations with error message", async () => {
    const host = buildHost(["com.a"]);
    host.registerPlugin("com.a", () => ({
      onEnable: () => {
        throw new Error("boom");
      },
    }));
    await host.loadAll();
    const rows = [mkRow({ id: "com.a", state: "loaded" })];
    const journal = new PluginLifecycleJournal();
    await runPluginCommandLine("plugin enable com.a", {
      host,
      rows,
      journal,
      now: () => 42,
    });
    const events = journal.all();
    expect(events).toHaveLength(1);
    expect(events[0].outcome).toBe("failed");
    expect(events[0].errorMessage).toMatch(/boom/);
  });

  it("does NOT record noop mutations", async () => {
    const host = buildHost(["com.a"]);
    const rows = [mkRow({ id: "com.a", state: "enabled" })];
    const journal = new PluginLifecycleJournal();
    await runPluginCommandLine("plugin enable com.a", {
      host,
      rows,
      journal,
      now: () => 1,
    });
    expect(journal.size).toBe(0);
  });

  it("does NOT record read outcomes", async () => {
    const host = buildHost([]);
    const journal = new PluginLifecycleJournal();
    await runPluginCommandLine("plugin list", {
      host,
      rows: [],
      journal,
      now: () => 1,
    });
    expect(journal.size).toBe(0);
  });

  it("reload mutation journals as enable phase on success", async () => {
    const host = buildHost(["com.a"]);
    host.registerPlugin("com.a", () => ({}));
    await host.loadAndEnable();
    const rows = [mkRow({ id: "com.a", state: "enabled" })];
    const journal = new PluginLifecycleJournal();
    await runPluginCommandLine("plugin reload com.a", {
      host,
      rows,
      journal,
      now: () => 123,
    });
    const events = journal.all();
    expect(events).toHaveLength(1);
    expect(events[0].phase).toBe("enable");
    expect(events[0].outcome).toBe("success");
  });
});

describe("journalPluginExecutionResult — direct use", () => {
  it("records applied result", () => {
    const journal = new PluginLifecycleJournal();
    journalPluginExecutionResult(
      journal,
      { kind: "applied", pluginId: "com.a", mutation: "enable" },
      () => 10,
    );
    expect(journal.size).toBe(1);
  });

  it("skips read results", () => {
    const journal = new PluginLifecycleJournal();
    journalPluginExecutionResult(
      journal,
      { kind: "read", outcome: { kind: "list", rows: [] } },
      () => 10,
    );
    expect(journal.size).toBe(0);
  });

  it("skips noop results", () => {
    const journal = new PluginLifecycleJournal();
    journalPluginExecutionResult(
      journal,
      {
        kind: "noop",
        pluginId: "com.a",
        mutation: "enable",
        reason: "already-enabled",
      },
      () => 10,
    );
    expect(journal.size).toBe(0);
  });
});
