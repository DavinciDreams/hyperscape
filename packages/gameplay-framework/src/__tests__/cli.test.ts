/**
 * Tests for `runCli` — the pure-function CLI entry that the
 * `hyperforge-plugin` binary shells into.
 *
 * Every test captures stdout + stderr into strings and asserts on the
 * exit code + buffered output. No child_process, no real argv, no
 * real filesystem (the validator's `manifestLoader` seam would be
 * needed for real validation — but the CLI doesn't expose that seam
 * yet, so we cover argv parsing + usage errors here and rely on
 * `validate.test.ts` for the validator's own behavior).
 *
 * Covered:
 *   - No args → usage on stdout, exit 2
 *   - `--help` / `-h` → usage on stdout, exit 0
 *   - `--version` / `-v` → prints version, exit 0
 *   - Unknown subcommand → error + usage on stderr, exit 2
 *   - `validate` with no dir → error on stderr, exit 2
 *   - `validate <dir>` with missing flag value → error on stderr, exit 2
 *   - `validate <dir>` with unknown flag → error on stderr, exit 2
 *   - `validate <dir>` with extra positional → error on stderr, exit 2
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli, type CliIO } from "../cli.js";

function mkIO(opts?: {
  /** Pre-existing files (absolute path → contents). Writer rejects these. */
  existing?: Iterable<string>;
  /** Optional catalog-loader stub for `lint` tests. */
  catalogLoader?: CliIO["catalogLoader"];
  /** Optional fetch stub for `publish` tests. */
  fetch?: CliIO["fetch"];
}): {
  io: CliIO;
  stdout: () => string;
  stderr: () => string;
  writes: () => ReadonlyMap<string, string>;
  mkdirs: () => readonly string[];
} {
  let out = "";
  let err = "";
  const writes = new Map<string, string>();
  const mkdirs: string[] = [];
  const existing = new Set(opts?.existing ?? []);
  return {
    io: {
      stdout: (c) => {
        out += c;
      },
      stderr: (c) => {
        err += c;
      },
      cwd: () => "/workdir",
      writeFile: async (p, contents) => {
        if (existing.has(p) || writes.has(p)) {
          throw new Error(`refusing to overwrite existing file: ${p}`);
        }
        writes.set(p, contents);
      },
      mkdir: async (p) => {
        mkdirs.push(p);
      },
      catalogLoader: opts?.catalogLoader,
      fetch: opts?.fetch,
    },
    stdout: () => out,
    stderr: () => err,
    writes: () => writes,
    mkdirs: () => mkdirs,
  };
}

describe("runCli — argv handling", () => {
  it("no args → usage on stdout, exit 2", async () => {
    const { io, stdout, stderr } = mkIO();
    const code = await runCli([], io);
    expect(code).toBe(2);
    expect(stdout()).toContain("hyperforge-plugin");
    expect(stdout()).toContain("validate <dir>");
    expect(stderr()).toBe("");
  });

  it("--help → usage on stdout, exit 0", async () => {
    const { io, stdout } = mkIO();
    const code = await runCli(["--help"], io);
    expect(code).toBe(0);
    expect(stdout()).toContain("hyperforge-plugin");
  });

  it("-h → usage on stdout, exit 0", async () => {
    const { io, stdout } = mkIO();
    const code = await runCli(["-h"], io);
    expect(code).toBe(0);
    expect(stdout()).toContain("hyperforge-plugin");
  });

  it("--version → prints version, exit 0", async () => {
    const { io, stdout } = mkIO();
    const code = await runCli(["--version"], io);
    expect(code).toBe(0);
    expect(stdout()).toMatch(/hyperforge-plugin \d+\.\d+\.\d+/);
  });

  it("unknown subcommand → error + usage on stderr, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["bogus"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown subcommand: bogus");
    expect(stderr()).toContain("validate <dir>");
  });

  it("validate with no dir → error on stderr, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["validate"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing <dir> argument");
  });

  it("validate with --host-api but no value → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["validate", "./pkg", "--host-api"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("--host-api requires a value");
  });

  it("validate with unknown flag → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["validate", "./pkg", "--nope"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown flag: --nope");
  });

  it("validate with extra positional → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["validate", "./pkg", "./extra"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unexpected argument: ./extra");
  });
});

describe("runCli — graph subcommand", () => {
  function stubManifest(id: string) {
    return {
      id,
      name: id,
      version: "0.1.0",
      entry: "./dist/index.js",
      author: { name: "stub" },
      hyperforgeApi: "0.1.0",
      description: "stub",
      dependencies: [] as Array<{
        id: string;
        versionRange: string;
        optional?: boolean;
      }>,
      loadAfter: [] as string[],
    };
  }

  function stubCatalog(result: {
    loaded?: Array<{
      id: string;
      dependencies?: Array<{
        id: string;
        versionRange: string;
        optional?: boolean;
      }>;
      loadAfter?: string[];
    }>;
  }): CliIO["catalogLoader"] {
    return async () => {
      return {
        loaded: (result.loaded ?? []).map((entry) => {
          const manifest = stubManifest(entry.id);
          if (entry.dependencies) manifest.dependencies = entry.dependencies;
          if (entry.loadAfter) manifest.loadAfter = entry.loadAfter;
          return {
            manifest,
            factory: (() => ({})) as unknown as never,
          };
        }) as never,
        failed: [],
      } as never;
    };
  }

  it("graph with no dir → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["graph"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing <dir> argument");
  });

  it("graph with unknown flag → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["graph", "./plugins", "--nope"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown flag: --nope");
  });

  it("graph with invalid --format → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["graph", "./plugins", "--format", "xml"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("--format must be one of");
  });

  it("empty catalog → ascii '(no plugins in ...)', exit 0", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog({ loaded: [] }),
    });
    const code = await runCli(["graph", "/abs/plugins"], io);
    expect(code).toBe(0);
    expect(stdout()).toContain("(no plugins in /abs/plugins)");
  });

  it("ascii format renders deps + loadAfter", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [
          {
            id: "com.example.a",
            dependencies: [
              { id: "com.example.b", versionRange: "^1.0.0" },
              {
                id: "com.example.opt",
                versionRange: "^0.1.0",
                optional: true,
              },
            ],
            loadAfter: ["com.example.c"],
          },
          { id: "com.example.b" },
        ],
      }),
    });
    const code = await runCli(["graph", "/abs/plugins"], io);
    expect(code).toBe(0);
    const out = stdout();
    expect(out).toContain("com.example.a@0.1.0");
    expect(out).toContain("↳ com.example.b ^1.0.0");
    expect(out).toContain("↳ com.example.opt ^0.1.0 (optional)");
    expect(out).toContain("⇢ com.example.c (loadAfter)");
    expect(out).toContain("com.example.b@0.1.0");
    expect(out).toContain("(no dependencies)");
  });

  it("dot format emits a parseable digraph", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [
          {
            id: "com.example.a",
            dependencies: [{ id: "com.example.b", versionRange: "^1.0.0" }],
            loadAfter: ["com.example.c"],
          },
        ],
      }),
    });
    const code = await runCli(["graph", "/abs/plugins", "--format", "dot"], io);
    expect(code).toBe(0);
    const out = stdout();
    expect(out).toMatch(/^digraph plugins \{/);
    expect(out).toContain('"com.example.a" [label="com.example.a\\n0.1.0"];');
    expect(out).toContain(
      '"com.example.a" -> "com.example.b" [label="^1.0.0"];',
    );
    expect(out).toContain(
      '"com.example.a" -> "com.example.c" [style="dotted" label="loadAfter"];',
    );
    expect(out.trimEnd()).toMatch(/\}$/);
  });

  it("json format emits an adjacency list payload", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [
          {
            id: "com.example.a",
            dependencies: [{ id: "com.example.b", versionRange: "^1.0.0" }],
          },
        ],
      }),
    });
    const code = await runCli(
      ["graph", "/abs/plugins", "--format", "json"],
      io,
    );
    expect(code).toBe(0);
    const payload = JSON.parse(stdout());
    expect(payload.baseDir).toBe("/abs/plugins");
    expect(payload.nodes).toHaveLength(1);
    expect(payload.nodes[0].id).toBe("com.example.a");
    expect(payload.nodes[0].dependencies).toEqual([
      { id: "com.example.b", versionRange: "^1.0.0", optional: false },
    ]);
  });
});

describe("runCli — show subcommand", () => {
  it("show with no dir → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["show"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing <dir> argument");
  });

  it("show with unknown flag → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["show", "./pkg", "--nope"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown flag: --nope");
  });

  it("show with --manifest-filename no value → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["show", "./pkg", "--manifest-filename"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("--manifest-filename requires a value");
  });

  it("show with extra positional → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["show", "./pkg", "./extra"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unexpected argument: ./extra");
  });

  it("show on nonexistent dir → exit 1 with validate-style error", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["show", "/nonexistent/plugin"], io);
    expect(code).toBe(1);
    expect(stderr()).toContain("/nonexistent/plugin/plugin.json");
  });

  it("show --json on nonexistent dir → exit 1, {ok: false, issues[]}", async () => {
    const { io, stdout } = mkIO();
    const code = await runCli(["show", "/nonexistent/plugin", "--json"], io);
    expect(code).toBe(1);
    const payload = JSON.parse(stdout());
    expect(payload.ok).toBe(false);
    expect(Array.isArray(payload.issues)).toBe(true);
  });
});

describe("runCli — validate --json", () => {
  // These tests use the real `validatePluginDirectory` path against a
  // directory we don't actually create — the failure case is enough to
  // exercise the JSON shape on the error branch. The happy path is
  // covered by the `validate.test.ts` unit tests + the init→validate
  // roundtrip smoke check.
  it("failure case emits a parseable {ok: false, issues[]} payload", async () => {
    const { io, stdout } = mkIO();
    const code = await runCli(
      ["validate", "/nonexistent/plugin", "--json"],
      io,
    );
    expect(code).toBe(1);
    const payload = JSON.parse(stdout());
    expect(payload.ok).toBe(false);
    expect(payload.manifestPath).toContain("/nonexistent/plugin");
    expect(Array.isArray(payload.issues)).toBe(true);
    expect(payload.issues.length).toBeGreaterThan(0);
  });
});

describe("runCli — init subcommand", () => {
  it("scaffolds plugin.json + src/index.ts with the given --id", async () => {
    const { io, stdout, writes, mkdirs } = mkIO();
    const code = await runCli(
      ["init", "my-plugin", "--id", "com.example.foo"],
      io,
    );
    expect(code).toBe(0);
    expect(stdout()).toContain("Scaffolded plugin com.example.foo");

    // mkdir was called for both the package root and the src/ child.
    expect(mkdirs()).toEqual(["/workdir/my-plugin", "/workdir/my-plugin/src"]);

    const manifestRaw = writes().get("/workdir/my-plugin/plugin.json");
    expect(manifestRaw).toBeDefined();
    const manifest = JSON.parse(manifestRaw!);
    expect(manifest.id).toBe("com.example.foo");
    expect(manifest.name).toBe("com.example.foo"); // defaulted to id
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.entry).toBe("./dist/index.js");
    expect(manifest.hyperforgeApi).toBe("0.1.0");

    const indexRaw = writes().get("/workdir/my-plugin/src/index.ts");
    expect(indexRaw).toBeDefined();
    expect(indexRaw).toContain("@hyperforge/gameplay-framework");
    expect(indexRaw).toContain("PluginFactory<MyPluginContext>");
    expect(indexRaw).toContain("export default factory");
  });

  it("--name overrides the default (id → name fallback)", async () => {
    const { io, writes } = mkIO();
    const code = await runCli(
      ["init", "my-plugin", "--id", "com.example.foo", "--name", "Pretty Name"],
      io,
    );
    expect(code).toBe(0);
    const manifest = JSON.parse(
      writes().get("/workdir/my-plugin/plugin.json")!,
    );
    expect(manifest.name).toBe("Pretty Name");
  });

  it("rejects a non-reverse-domain --id before touching disk", async () => {
    const { io, stderr, writes, mkdirs } = mkIO();
    const code = await runCli(
      ["init", "my-plugin", "--id", "NotReverseDomain"],
      io,
    );
    expect(code).toBe(2);
    expect(stderr()).toContain("failed schema validation");
    expect(writes().size).toBe(0);
    expect(mkdirs()).toEqual([]);
  });

  it("refuses to overwrite an existing plugin.json", async () => {
    const { io, stderr } = mkIO({
      existing: ["/workdir/my-plugin/plugin.json"],
    });
    const code = await runCli(
      ["init", "my-plugin", "--id", "com.example.foo"],
      io,
    );
    expect(code).toBe(1);
    expect(stderr()).toContain("refusing to overwrite existing file");
  });

  it("init with no dir → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["init", "--id", "com.example.foo"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing <dir> argument");
  });

  it("init without --id → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["init", "my-plugin"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("--id is required");
  });

  it("init --id without value → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["init", "my-plugin", "--id"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("--id requires a value");
  });

  it("init with unknown flag → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(
      ["init", "my-plugin", "--id", "com.example.foo", "--nope"],
      io,
    );
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown flag: --nope");
  });
});

describe("runCli — lint subcommand", () => {
  /**
   * Minimal manifest helper — only the fields the resolver walks.
   * `dependencies` + `loadAfter` default to `[]` so resolver iteration
   * is safe (the real Zod schema does this via `.default([])`, but the
   * stub bypasses schema parsing).
   */
  function stubManifest(id: string) {
    return {
      id,
      name: id,
      version: "0.1.0",
      entry: "./dist/index.js",
      author: { name: "stub" },
      hyperforgeApi: "0.1.0",
      description: "stub",
      dependencies: [] as Array<{ id: string; versionRange: string }>,
      loadAfter: [] as string[],
    };
  }

  /** Stub loader factory — returns a catalog-loader seam with preset loaded/failed. */
  function stubCatalog(result: {
    loaded?: Array<{
      id: string;
      dependencies?: Array<{ id: string; versionRange: string }>;
    }>;
    failed?: Array<{ baseDir: string; message: string }>;
  }): CliIO["catalogLoader"] {
    return async () => {
      return {
        loaded: (result.loaded ?? []).map((entry) => {
          const manifest = stubManifest(entry.id);
          if (entry.dependencies) manifest.dependencies = entry.dependencies;
          return {
            manifest,
            // Factory shape isn't checked by the resolver — a noop is fine.
            factory: (() => ({})) as unknown as never,
          };
        }) as never,
        failed: (result.failed ?? []).map((f) => ({
          baseDir: f.baseDir,
          error: new Error(f.message),
        })),
      } as never;
    };
  }

  it("lint with no dir → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["lint"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing <dir> argument");
  });

  it("lint with --host-api but no value → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["lint", "./plugins", "--host-api"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("--host-api requires a value");
  });

  it("lint with unknown flag → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["lint", "./plugins", "--nope"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown flag: --nope");
  });

  it("lint with extra positional → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["lint", "./plugins", "./extra"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unexpected argument: ./extra");
  });

  it("clean catalog → exit 0 with ok summary", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [{ id: "com.example.a" }, { id: "com.example.b" }],
      }),
    });
    const code = await runCli(["lint", "./plugins"], io);
    expect(code).toBe(0);
    expect(stdout()).toContain("2 plugin(s) clean");
  });

  it("catalog with per-package failure → exit 1 + ✗ baseDir", async () => {
    const { io, stderr } = mkIO({
      catalogLoader: stubCatalog({
        failed: [
          { baseDir: "/plugins/broken", message: "plugin.json missing" },
        ],
      }),
    });
    const code = await runCli(["lint", "./plugins"], io);
    expect(code).toBe(1);
    expect(stderr()).toContain("✗ /plugins/broken");
    expect(stderr()).toContain("plugin.json missing");
    expect(stderr()).toContain("1 failed to load");
  });

  it("catalog with missing-dependency → exit 1 + formatted reason", async () => {
    const { io, stderr } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [
          {
            id: "com.example.needy",
            dependencies: [
              { id: "com.example.missing", versionRange: "^1.0.0" },
            ],
          },
        ],
      }),
    });
    const code = await runCli(["lint", "./plugins"], io);
    expect(code).toBe(1);
    expect(stderr()).toContain("✗ com.example.needy");
    expect(stderr()).toContain("missing dependency: com.example.missing");
    expect(stderr()).toContain("1 unresolvable");
  });

  it("catalog with dependency-version-mismatch → exit 1 + formatted reason", async () => {
    const { io, stderr } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [
          {
            id: "com.example.needy",
            dependencies: [
              { id: "com.example.provider", versionRange: "^2.0.0" },
            ],
          },
          { id: "com.example.provider" }, // version: "0.1.0" — mismatch
        ],
      }),
    });
    const code = await runCli(["lint", "./plugins"], io);
    expect(code).toBe(1);
    expect(stderr()).toContain("✗ com.example.needy");
    expect(stderr()).toContain("dependency version mismatch");
    expect(stderr()).toContain("com.example.provider");
    expect(stderr()).toContain("requires ^2.0.0");
    expect(stderr()).toContain("found 0.1.0");
  });

  it("catalog with dependency cycle → exit 1 + formatted cycle", async () => {
    const { io, stderr } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [
          {
            id: "com.example.a",
            dependencies: [{ id: "com.example.b", versionRange: "^0.1.0" }],
          },
          {
            id: "com.example.b",
            dependencies: [{ id: "com.example.a", versionRange: "^0.1.0" }],
          },
        ],
      }),
    });
    const code = await runCli(["lint", "./plugins"], io);
    expect(code).toBe(1);
    expect(stderr()).toContain("cycle member");
    expect(stderr()).toContain("2 unresolvable");
  });

  it("--json on clean catalog → exit 0, {ok: true, cleanCount: N}", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [{ id: "com.example.a" }, { id: "com.example.b" }],
      }),
    });
    const code = await runCli(["lint", "/abs/plugins", "--json"], io);
    expect(code).toBe(0);
    const payload = JSON.parse(stdout());
    expect(payload.ok).toBe(true);
    expect(payload.cleanCount).toBe(2);
    expect(payload.failed).toEqual([]);
    expect(payload.unresolvable).toEqual([]);
    expect(payload.baseDir).toBe("/abs/plugins");
  });

  it("--json on dirty catalog → exit 1, structured failure + unresolvable", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [
          {
            id: "com.example.needy",
            dependencies: [
              { id: "com.example.missing", versionRange: "^1.0.0" },
            ],
          },
          { id: "com.example.clean" },
        ],
        failed: [{ baseDir: "/plugins/broken", message: "bad manifest" }],
      }),
    });
    const code = await runCli(["lint", "/abs/plugins", "--json"], io);
    expect(code).toBe(1);
    const payload = JSON.parse(stdout());
    expect(payload.ok).toBe(false);
    expect(payload.cleanCount).toBe(1);
    expect(payload.failed).toEqual([
      { baseDir: "/plugins/broken", error: "bad manifest" },
    ]);
    expect(payload.unresolvable).toHaveLength(1);
    expect(payload.unresolvable[0].id).toBe("com.example.needy");
    expect(payload.unresolvable[0].reason).toContain("missing dependency");
  });
});

describe("runCli — list subcommand", () => {
  /**
   * Reuse the same stub-catalog pattern from the lint tests.
   * Declared locally so each subcommand block is self-contained.
   */
  function stubManifest(id: string) {
    return {
      id,
      name: id,
      version: "0.1.0",
      entry: "./dist/index.js",
      author: { name: "stub" },
      hyperforgeApi: "0.1.0",
      description: "stub",
      dependencies: [] as Array<{ id: string; versionRange: string }>,
      loadAfter: [] as string[],
    };
  }

  function stubCatalog(result: {
    loaded?: Array<{
      id: string;
      dependencies?: Array<{ id: string; versionRange: string }>;
    }>;
    failed?: Array<{ baseDir: string; message: string }>;
  }): CliIO["catalogLoader"] {
    return async () => {
      return {
        loaded: (result.loaded ?? []).map((entry) => {
          const manifest = stubManifest(entry.id);
          if (entry.dependencies) manifest.dependencies = entry.dependencies;
          return {
            manifest,
            factory: (() => ({})) as unknown as never,
          };
        }) as never,
        failed: (result.failed ?? []).map((f) => ({
          baseDir: f.baseDir,
          error: new Error(f.message),
        })),
      } as never;
    };
  }

  it("list with no dir → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["list"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing <dir> argument");
  });

  it("list with --host-api but no value → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["list", "./plugins", "--host-api"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("--host-api requires a value");
  });

  it("list with unknown flag → error, exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["list", "./plugins", "--nope"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown flag: --nope");
  });

  it("empty catalog → exit 0, no stdout rows", async () => {
    const { io, stdout, stderr } = mkIO({
      catalogLoader: stubCatalog({}),
    });
    const code = await runCli(["list", "./plugins"], io);
    expect(code).toBe(0);
    expect(stdout()).toBe("");
    expect(stderr()).toBe("");
  });

  it("loaded plugins print TSV rows on stdout, exit 0", async () => {
    const { io, stdout, stderr } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [{ id: "com.example.a" }, { id: "com.example.b" }],
      }),
    });
    const code = await runCli(["list", "/abs/plugins"], io);
    expect(code).toBe(0);
    expect(stdout()).toContain("com.example.a\t0.1.0\t/abs/plugins");
    expect(stdout()).toContain("com.example.b\t0.1.0\t/abs/plugins");
    expect(stderr()).toBe("");
  });

  it("failed + unresolvable surface on stderr but exit stays 0", async () => {
    const { io, stdout, stderr } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [
          {
            id: "com.example.needy",
            dependencies: [
              { id: "com.example.missing", versionRange: "^1.0.0" },
            ],
          },
          { id: "com.example.clean" },
        ],
        failed: [{ baseDir: "/plugins/broken", message: "bad manifest" }],
      }),
    });
    const code = await runCli(["list", "/abs/plugins"], io);
    expect(code).toBe(0);
    // Clean plugin appears on stdout; unresolvable one does not.
    expect(stdout()).toContain("com.example.clean\t0.1.0");
    expect(stdout()).not.toContain("com.example.needy\t");
    // Unresolvable + failed show up on stderr as notices.
    expect(stderr()).toContain("! com.example.needy@0.1.0");
    expect(stderr()).toContain("missing dependency: com.example.missing");
    expect(stderr()).toContain("! /plugins/broken");
    expect(stderr()).toContain("bad manifest");
  });

  it("--json mode emits a single parseable payload", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [
          {
            id: "com.example.needy",
            dependencies: [
              { id: "com.example.missing", versionRange: "^1.0.0" },
            ],
          },
          { id: "com.example.clean" },
        ],
        failed: [{ baseDir: "/plugins/broken", message: "bad manifest" }],
      }),
    });
    const code = await runCli(["list", "/abs/plugins", "--json"], io);
    expect(code).toBe(0);
    const payload = JSON.parse(stdout());
    expect(payload.baseDir).toBe("/abs/plugins");
    expect(payload.loaded).toEqual([
      {
        id: "com.example.clean",
        version: "0.1.0",
        name: "com.example.clean",
      },
    ]);
    expect(payload.failed).toEqual([
      { baseDir: "/plugins/broken", error: "bad manifest" },
    ]);
    expect(payload.unresolvable).toHaveLength(1);
    expect(payload.unresolvable[0].id).toBe("com.example.needy");
    expect(payload.unresolvable[0].reason).toContain("missing dependency");
  });
});

describe("runCli — snapshot subcommand", () => {
  function stubManifest(id: string) {
    return {
      id,
      name: id,
      version: "0.1.0",
      entry: "./dist/index.js",
      author: { name: "stub" },
      hyperforgeApi: "0.1.0",
      description: "stub",
      dependencies: [] as Array<{ id: string; versionRange: string }>,
      loadAfter: [] as string[],
      enabledByDefault: true,
      tags: [] as string[],
      contributions: {
        systems: [] as string[],
        entities: [] as string[],
        widgets: [] as string[],
        manifestSchemas: [] as string[],
        paletteCategories: [] as string[],
        toolbarTools: [] as string[],
        commands: [] as string[],
      },
    };
  }

  function stubCatalog(result: {
    loaded?: Array<{
      id: string;
      dependencies?: Array<{ id: string; versionRange: string }>;
    }>;
    failed?: Array<{ baseDir: string; message: string; name?: string }>;
  }): CliIO["catalogLoader"] {
    return async () =>
      ({
        loaded: (result.loaded ?? []).map((entry) => {
          const manifest = stubManifest(entry.id);
          if (entry.dependencies) manifest.dependencies = entry.dependencies;
          return {
            manifest,
            factory: (() => ({})) as unknown as never,
          };
        }) as never,
        failed: (result.failed ?? []).map((f) => {
          const err = new Error(f.message);
          if (f.name) err.name = f.name;
          return { baseDir: f.baseDir, error: err };
        }),
      }) as never;
  }

  it("snapshot with no dir → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["snapshot"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing <dir> argument");
  });

  it("snapshot with unknown flag → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["snapshot", "./x", "--nope"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown flag: --nope");
  });

  it("snapshot with extra positional → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["snapshot", "./x", "./y"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unexpected argument: ./y");
  });

  it("empty catalog → JSON snapshot with zeroed summary, exit 0", async () => {
    const { io, stdout, stderr } = mkIO({
      catalogLoader: stubCatalog({}),
    });
    const code = await runCli(["snapshot", "/abs/plugins"], io);
    expect(code).toBe(0);
    expect(stderr()).toBe("");
    const payload = JSON.parse(stdout());
    expect(payload.running).toEqual([]);
    expect(payload.failedPackages).toEqual([]);
    expect(payload.unresolvable).toEqual([]);
    expect(payload.summary).toEqual({
      runningCount: 0,
      failedCount: 0,
      unresolvableCount: 0,
    });
  });

  it("populated catalog → JSON includes all three buckets", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [
          {
            id: "com.example.needy",
            dependencies: [
              { id: "com.example.missing", versionRange: "^1.0.0" },
            ],
          },
          { id: "com.example.clean" },
        ],
        failed: [
          {
            baseDir: "/plugins/broken",
            message: "bad manifest",
            name: "TypeError",
          },
        ],
      }),
    });
    const code = await runCli(["snapshot", "/abs/plugins"], io);
    expect(code).toBe(0);
    const payload = JSON.parse(stdout());

    expect(payload.summary).toEqual({
      runningCount: 1,
      failedCount: 1,
      unresolvableCount: 1,
    });
    expect(payload.running[0].manifest.id).toBe("com.example.clean");
    expect(payload.failedPackages[0]).toEqual({
      baseDir: "/plugins/broken",
      errorName: "TypeError",
      errorMessage: "bad manifest",
    });
    expect(payload.unresolvable[0].manifest.id).toBe("com.example.needy");
    expect(payload.unresolvable[0].reason).toEqual({
      kind: "missing-dependency",
      dependencyId: "com.example.missing",
    });
  });

  it("--human → readable report on stdout, exit 0", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog({
        loaded: [{ id: "com.example.clean" }],
      }),
    });
    const code = await runCli(["snapshot", "/abs/plugins", "--human"], io);
    expect(code).toBe(0);
    expect(stdout()).toContain("Plugin session:");
    expect(stdout()).toContain("Running (1):");
    expect(stdout()).toContain("• com.example.clean (0.1.0)");
  });

  it("catalog loader throwing → exit 1 with stderr message", async () => {
    const { io, stderr } = mkIO({
      catalogLoader: async () => {
        throw new Error("ENOENT /abs/plugins");
      },
    });
    const code = await runCli(["snapshot", "/abs/plugins"], io);
    expect(code).toBe(1);
    expect(stderr()).toContain("snapshot: ENOENT /abs/plugins");
  });
});

describe("runCli — diff subcommand", () => {
  // Diff reads files via fs directly (no IO injection seam yet — CI
  // gate use-case calls for the CLI to read real on-disk JSON). Tests
  // write to a tmp dir + clean up after each case.
  let tmpDir: string;

  beforeEach(async () => {
    const os = await import("node:os");
    const fs = await import("node:fs/promises");
    const pathMod = await import("node:path");
    tmpDir = await fs.mkdtemp(
      pathMod.join(os.tmpdir(), "hyperforge-diff-test-"),
    );
  });

  afterEach(async () => {
    const fs = await import("node:fs/promises");
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function emptySnap() {
    return {
      running: [],
      unresolvable: [],
      failedPackages: [],
      summary: {
        runningCount: 0,
        unresolvableCount: 0,
        failedCount: 0,
      },
    };
  }

  function snapWithRunning(...ids: string[]) {
    const running = ids.map((id) => ({
      manifest: {
        id,
        name: id,
        version: "1.0.0",
        description: "",
        hyperforgeApi: "0.1.0",
        enabledByDefault: true,
        tags: [],
      },
      dependencies: [],
      loadAfter: [],
      contributions: {
        systems: 0,
        entities: 0,
        widgets: 0,
        manifestSchemas: 0,
        paletteCategories: 0,
        toolbarTools: 0,
        commands: 0,
      },
    }));
    return {
      running,
      unresolvable: [],
      failedPackages: [],
      summary: {
        runningCount: running.length,
        unresolvableCount: 0,
        failedCount: 0,
      },
    };
  }

  async function writeSnap(name: string, value: unknown): Promise<string> {
    const fs = await import("node:fs/promises");
    const pathMod = await import("node:path");
    const p = pathMod.join(tmpDir, name);
    await fs.writeFile(p, JSON.stringify(value, null, 2));
    return p;
  }

  it("diff with no args → exit 2 + usage on stderr", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["diff"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing required path arguments");
  });

  it("diff with one path arg → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["diff", "/some/file.json"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing required path arguments");
  });

  it("diff with unknown flag → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["diff", "--gibberish"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown flag: --gibberish");
  });

  it("identical snapshots → empty diff JSON, exit 0", async () => {
    const a = await writeSnap("a.json", emptySnap());
    const b = await writeSnap("b.json", emptySnap());
    const { io, stdout } = mkIO();
    const code = await runCli(["diff", a, b], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout()) as ReturnType<typeof emptySnap> & {
      reclassified: unknown[];
      summary: { runningDelta: number };
    };
    expect(parsed.running).toEqual({ added: [], removed: [], changed: [] });
    expect(parsed.reclassified).toEqual([]);
    expect(parsed.summary.runningDelta).toBe(0);
  });

  it("snapshots with diff → emits added/removed in JSON output", async () => {
    const a = await writeSnap("a.json", snapWithRunning("com.test.a"));
    const b = await writeSnap("b.json", snapWithRunning("com.test.b"));
    const { io, stdout } = mkIO();
    const code = await runCli(["diff", a, b], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout()) as {
      running: {
        added: { manifest: { id: string } }[];
        removed: { manifest: { id: string } }[];
      };
    };
    expect(parsed.running.added).toHaveLength(1);
    expect(parsed.running.added[0]!.manifest.id).toBe("com.test.b");
    expect(parsed.running.removed).toHaveLength(1);
    expect(parsed.running.removed[0]!.manifest.id).toBe("com.test.a");
  });

  it("--compact emits single-line JSON", async () => {
    const a = await writeSnap("a.json", snapWithRunning("com.test.a"));
    const b = await writeSnap(
      "b.json",
      snapWithRunning("com.test.a", "com.test.b"),
    );
    const { io, stdout } = mkIO();
    const code = await runCli(["diff", a, b, "--compact"], io);
    expect(code).toBe(0);
    // Compact JSON has no leading whitespace + a single line of content
    // before the trailing newline.
    const out = stdout().trim();
    expect(out.includes("\n")).toBe(false);
    expect(out.startsWith("{")).toBe(true);
    expect(out.endsWith("}")).toBe(true);
  });

  it("--human emits ASCII summary including added id", async () => {
    const a = await writeSnap("a.json", emptySnap());
    const b = await writeSnap("b.json", snapWithRunning("com.test.added"));
    const { io, stdout } = mkIO();
    const code = await runCli(["diff", a, b, "--human"], io);
    expect(code).toBe(0);
    expect(stdout()).toContain("Plugin session diff:");
    expect(stdout()).toContain("Running added (1)");
    expect(stdout()).toContain("com.test.added");
  });

  it("--human with no changes prints '(no changes)'", async () => {
    const a = await writeSnap("a.json", emptySnap());
    const b = await writeSnap("b.json", emptySnap());
    const { io, stdout } = mkIO();
    const code = await runCli(["diff", a, b, "--human"], io);
    expect(code).toBe(0);
    expect(stdout()).toContain("(no changes)");
  });

  it("missing baseline file → exit 1 with stderr message", async () => {
    const b = await writeSnap("b.json", emptySnap());
    const { io, stderr } = mkIO();
    const code = await runCli(["diff", "/nonexistent/baseline.json", b], io);
    expect(code).toBe(1);
    expect(stderr()).toContain("diff:");
  });

  it("malformed JSON → exit 1 with stderr message", async () => {
    const fs = await import("node:fs/promises");
    const pathMod = await import("node:path");
    const a = pathMod.join(tmpDir, "bad.json");
    await fs.writeFile(a, "{not valid json");
    const b = await writeSnap("b.json", emptySnap());
    const { io, stderr } = mkIO();
    const code = await runCli(["diff", a, b], io);
    expect(code).toBe(1);
    expect(stderr()).toContain("diff:");
  });
});

describe("runCli — contributions subcommand", () => {
  function stubManifest(
    id: string,
    contributions?: Partial<{
      systems: string[];
      entities: string[];
      widgets: string[];
      manifestSchemas: string[];
      paletteCategories: string[];
      toolbarTools: string[];
      commands: string[];
    }>,
  ) {
    return {
      id,
      name: id,
      version: "0.1.0",
      entry: "./dist/index.js",
      author: { name: "stub" },
      hyperforgeApi: "0.1.0",
      description: "stub",
      dependencies: [] as Array<{ id: string; versionRange: string }>,
      loadAfter: [] as string[],
      enabledByDefault: true,
      tags: [] as string[],
      contributions: {
        systems: contributions?.systems ?? [],
        entities: contributions?.entities ?? [],
        widgets: contributions?.widgets ?? [],
        manifestSchemas: contributions?.manifestSchemas ?? [],
        paletteCategories: contributions?.paletteCategories ?? [],
        toolbarTools: contributions?.toolbarTools ?? [],
        commands: contributions?.commands ?? [],
      },
    };
  }

  function stubCatalog(
    plugins: Array<{
      id: string;
      contributions?: Parameters<typeof stubManifest>[1];
    }>,
  ): CliIO["catalogLoader"] {
    return async () =>
      ({
        loaded: plugins.map((entry) => ({
          manifest: stubManifest(entry.id, entry.contributions),
          factory: (() => ({})) as unknown as never,
        })) as never,
        failed: [],
      }) as never;
  }

  it("contributions with no dir → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["contributions"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing <dir> argument");
  });

  it("contributions with unknown flag → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(
      ["contributions", "/abs/plugins", "--gibberish"],
      io,
    );
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown flag: --gibberish");
  });

  it("empty catalog → all buckets [] in JSON, exit 0", async () => {
    const { io, stdout } = mkIO({ catalogLoader: stubCatalog([]) });
    const code = await runCli(["contributions", "/abs/plugins"], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout()) as {
      aggregated: { systems: string[]; widgets: string[] };
    };
    expect(parsed.aggregated.systems).toEqual([]);
    expect(parsed.aggregated.widgets).toEqual([]);
  });

  it("aggregates contributions across plugins (default JSON output)", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog([
        {
          id: "com.example.alpha",
          contributions: {
            systems: ["sys.shared", "sys.alpha"],
            widgets: ["w.alpha"],
          },
        },
        {
          id: "com.example.beta",
          contributions: {
            systems: ["sys.shared", "sys.beta"],
            widgets: ["w.beta"],
          },
        },
      ]),
    });
    const code = await runCli(["contributions", "/abs/plugins"], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout()) as {
      aggregated: { systems: string[]; widgets: string[] };
    };
    expect(parsed.aggregated.systems).toEqual([
      "sys.shared",
      "sys.alpha",
      "sys.beta",
    ]);
    expect(parsed.aggregated.widgets).toEqual(["w.alpha", "w.beta"]);
  });

  it("--with-origins surfaces declarer arrays in JSON output", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog([
        {
          id: "com.example.alpha",
          contributions: { systems: ["sys.shared"] },
        },
        {
          id: "com.example.beta",
          contributions: { systems: ["sys.shared"] },
        },
      ]),
    });
    const code = await runCli(
      ["contributions", "/abs/plugins", "--with-origins"],
      io,
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout()) as {
      aggregated: { systems: string[] };
      origins: { systems: Record<string, string[]> };
    };
    expect(parsed.aggregated.systems).toEqual(["sys.shared"]);
    expect(parsed.origins.systems["sys.shared"]).toEqual([
      "com.example.alpha",
      "com.example.beta",
    ]);
  });

  it("--human emits ASCII summary with bucket counts + ids", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog([
        {
          id: "com.example.alpha",
          contributions: {
            widgets: ["w.cool"],
            commands: ["cmd.do-thing"],
          },
        },
      ]),
    });
    const code = await runCli(["contributions", "/abs/plugins", "--human"], io);
    expect(code).toBe(0);
    expect(stdout()).toContain("Aggregated contributions across 1 plugin(s):");
    expect(stdout()).toContain("widgets (1):");
    expect(stdout()).toContain("• w.cool");
    expect(stdout()).toContain("commands (1):");
    expect(stdout()).toContain("• cmd.do-thing");
    // Empty buckets render as (none) so the reader sees the full surface.
    expect(stdout()).toContain("systems: (none)");
  });

  it("--human --with-origins flags multi-declarer conflicts", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog([
        { id: "com.a", contributions: { widgets: ["w.shared"] } },
        { id: "com.b", contributions: { widgets: ["w.shared"] } },
      ]),
    });
    const code = await runCli(
      ["contributions", "/abs/plugins", "--human", "--with-origins"],
      io,
    );
    expect(code).toBe(0);
    expect(stdout()).toContain("w.shared");
    expect(stdout()).toContain("com.a, com.b");
    expect(stdout()).toContain("⚠ conflict");
  });

  it("--compact emits single-line JSON", async () => {
    const { io, stdout } = mkIO({
      catalogLoader: stubCatalog([
        { id: "com.example.alpha", contributions: { systems: ["sys.x"] } },
      ]),
    });
    const code = await runCli(
      ["contributions", "/abs/plugins", "--compact"],
      io,
    );
    expect(code).toBe(0);
    const out = stdout().trim();
    expect(out.includes("\n")).toBe(false);
    expect(out.startsWith("{")).toBe(true);
  });

  it("catalog loader throwing → exit 1 with stderr message", async () => {
    const { io, stderr } = mkIO({
      catalogLoader: async () => {
        throw new Error("ENOENT /abs/plugins");
      },
    });
    const code = await runCli(["contributions", "/abs/plugins"], io);
    expect(code).toBe(1);
    expect(stderr()).toContain("contributions: ENOENT /abs/plugins");
  });
});

describe("runCli — pack subcommand", () => {
  // Pack reads the plugin.json + walks dist/ from a real on-disk
  // directory. Tests build a tmp plugin package per case and clean up.
  let tmpDir: string;

  beforeEach(async () => {
    const os = await import("node:os");
    const fs = await import("node:fs/promises");
    const pathMod = await import("node:path");
    tmpDir = await fs.mkdtemp(
      pathMod.join(os.tmpdir(), "hyperforge-pack-test-"),
    );
  });

  afterEach(async () => {
    const fs = await import("node:fs/promises");
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function validPluginJson(id: string) {
    return JSON.stringify(
      {
        id,
        name: id,
        version: "0.1.0",
        description: "test plugin",
        entry: "./dist/index.js",
        author: { name: "test" },
        hyperforgeApi: "0.1.0",
        dependencies: [],
        loadAfter: [],
        enabledByDefault: false,
        contributions: {
          systems: [],
          entities: [],
          widgets: [],
          manifestSchemas: [],
          paletteCategories: [],
          toolbarTools: [],
          commands: [],
        },
        tags: [],
      },
      null,
      2,
    );
  }

  async function writePluginPackage(opts: {
    id?: string;
    distFiles?: Record<string, string>;
    pluginJson?: string;
  }): Promise<string> {
    const fs = await import("node:fs/promises");
    const pathMod = await import("node:path");
    const id = opts.id ?? "com.test.example";
    await fs.writeFile(
      pathMod.join(tmpDir, "plugin.json"),
      opts.pluginJson ?? validPluginJson(id),
    );
    if (opts.distFiles !== undefined) {
      const distDir = pathMod.join(tmpDir, "dist");
      await fs.mkdir(distDir, { recursive: true });
      for (const [name, contents] of Object.entries(opts.distFiles)) {
        const filePath = pathMod.join(distDir, name);
        await fs.mkdir(pathMod.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, contents);
      }
    }
    return tmpDir;
  }

  it("pack with no dir → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["pack"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing <dir> argument");
  });

  it("pack with unknown flag → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["pack", "/abs", "--gibberish"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown flag: --gibberish");
  });

  it("pack with invalid manifest → exit 1 with issues on stderr", async () => {
    await writePluginPackage({
      pluginJson: '{ "id": "bad", "version": "x" }', // not schema-valid
    });
    const { io, stderr } = mkIO();
    const code = await runCli(["pack", tmpDir], io);
    expect(code).toBe(1);
    expect(stderr()).toContain("pack:");
  });

  it("pack with valid manifest + no dist → bundle with empty files + warning", async () => {
    await writePluginPackage({});
    const { io, stdout, stderr } = mkIO();
    const code = await runCli(["pack", tmpDir], io);
    expect(code).toBe(0);
    expect(stderr()).toContain("warning");
    expect(stderr()).toContain("does not exist");
    const parsed = JSON.parse(stdout()) as {
      manifest: { id: string };
      manifestHash: string;
      files: Array<unknown>;
      totalSize: number;
      bundleHash: string;
    };
    expect(parsed.manifest.id).toBe("com.test.example");
    expect(parsed.files).toEqual([]);
    expect(parsed.totalSize).toBe(0);
    expect(parsed.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.bundleHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("pack with dist files → bundle includes per-file path/size/sha256", async () => {
    await writePluginPackage({
      distFiles: {
        "index.js": "console.log('hi');\n",
        "manifest.js": "export const manifest = {};\n",
      },
    });
    const { io, stdout } = mkIO();
    const code = await runCli(["pack", tmpDir], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout()) as {
      files: Array<{ path: string; size: number; sha256: string }>;
      totalSize: number;
    };
    expect(parsed.files).toHaveLength(2);
    expect(parsed.files.map((f) => f.path).sort()).toEqual([
      "index.js",
      "manifest.js",
    ]);
    for (const f of parsed.files) {
      expect(f.size).toBeGreaterThan(0);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(parsed.totalSize).toBe(
      "console.log('hi');\n".length + "export const manifest = {};\n".length,
    );
  });

  it("pack walks nested dist/ subdirectories", async () => {
    await writePluginPackage({
      distFiles: {
        "index.js": "x",
        "sub/nested.js": "y",
        "sub/deeper/leaf.js": "z",
      },
    });
    const { io, stdout } = mkIO();
    const code = await runCli(["pack", tmpDir], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout()) as {
      files: Array<{ path: string }>;
    };
    const paths = parsed.files.map((f) => f.path).sort();
    expect(paths).toEqual(["index.js", "sub/deeper/leaf.js", "sub/nested.js"]);
  });

  it("bundleHash is deterministic — identical input → identical bundle", async () => {
    await writePluginPackage({
      distFiles: { "index.js": "stable\n" },
    });
    const { io: io1, stdout: stdout1 } = mkIO();
    const { io: io2, stdout: stdout2 } = mkIO();
    await runCli(["pack", tmpDir], io1);
    await runCli(["pack", tmpDir], io2);
    expect(stdout1()).toBe(stdout2());
  });

  it("bundleHash changes when dist content changes", async () => {
    await writePluginPackage({
      distFiles: { "index.js": "version 1\n" },
    });
    const { io: io1, stdout: stdout1 } = mkIO();
    await runCli(["pack", tmpDir], io1);
    const v1 = JSON.parse(stdout1()) as { bundleHash: string };

    // Update content + repack
    const fs = await import("node:fs/promises");
    const pathMod = await import("node:path");
    await fs.writeFile(pathMod.join(tmpDir, "dist", "index.js"), "version 2\n");
    const { io: io2, stdout: stdout2 } = mkIO();
    await runCli(["pack", tmpDir], io2);
    const v2 = JSON.parse(stdout2()) as { bundleHash: string };

    expect(v1.bundleHash).not.toBe(v2.bundleHash);
  });

  it("--out writes via the IO seam + prints summary to stdout", async () => {
    await writePluginPackage({
      distFiles: { "index.js": "x" },
    });
    const pathMod = await import("node:path");
    const outPath = pathMod.join(tmpDir, "bundle.json");
    const { io, stdout, writes } = mkIO();
    const code = await runCli(["pack", tmpDir, "--out", outPath], io);
    expect(code).toBe(0);
    expect(stdout()).toContain("✓ Wrote bundle descriptor to");
    expect(stdout()).toContain("manifestHash:");
    expect(stdout()).toContain("bundleHash:");
    // Bundle was written through the injected writeFile seam (mkIO
    // captures writes in-memory rather than touching real disk).
    const captured = writes().get(outPath);
    expect(captured).toBeDefined();
    const parsed = JSON.parse(captured!) as { manifest: { id: string } };
    expect(parsed.manifest.id).toBe("com.test.example");
  });

  it("--compact emits single-line JSON", async () => {
    await writePluginPackage({});
    const { io, stdout, stderr: _stderr } = mkIO();
    const code = await runCli(["pack", tmpDir, "--compact"], io);
    expect(code).toBe(0);
    // Compact output is one JSON line + the empty-dist warning on stderr
    // (which doesn't affect stdout). Stdout is exactly one trimmed line.
    const out = stdout().trim();
    expect(out.includes("\n")).toBe(false);
    expect(out.startsWith("{")).toBe(true);
    expect(out.endsWith("}")).toBe(true);
  });
});

describe("runCli — publish subcommand", () => {
  // Publish reuses the same on-disk plugin-package fixture pattern
  // as pack. Tests with --registry inject a `fetch` stub that
  // captures the request + returns a canned response; tests with
  // --dry-run don't need a network seam.
  let tmpDir: string;

  beforeEach(async () => {
    const os = await import("node:os");
    const fs = await import("node:fs/promises");
    const pathMod = await import("node:path");
    tmpDir = await fs.mkdtemp(
      pathMod.join(os.tmpdir(), "hyperforge-publish-test-"),
    );
  });

  afterEach(async () => {
    const fs = await import("node:fs/promises");
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function validPluginJson(id: string) {
    return JSON.stringify(
      {
        id,
        name: id,
        version: "0.1.0",
        description: "test plugin",
        entry: "./dist/index.js",
        author: { name: "test" },
        hyperforgeApi: "0.1.0",
        dependencies: [],
        loadAfter: [],
        enabledByDefault: false,
        contributions: {
          systems: [],
          entities: [],
          widgets: [],
          manifestSchemas: [],
          paletteCategories: [],
          toolbarTools: [],
          commands: [],
        },
        tags: [],
      },
      null,
      2,
    );
  }

  async function writePluginPackage(opts: {
    id?: string;
    distFiles?: Record<string, string>;
    pluginJson?: string;
  }): Promise<string> {
    const fs = await import("node:fs/promises");
    const pathMod = await import("node:path");
    const id = opts.id ?? "com.test.publish";
    await fs.writeFile(
      pathMod.join(tmpDir, "plugin.json"),
      opts.pluginJson ?? validPluginJson(id),
    );
    if (opts.distFiles !== undefined) {
      const distDir = pathMod.join(tmpDir, "dist");
      await fs.mkdir(distDir, { recursive: true });
      for (const [name, contents] of Object.entries(opts.distFiles)) {
        const filePath = pathMod.join(distDir, name);
        await fs.mkdir(pathMod.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, contents);
      }
    }
    return tmpDir;
  }

  it("publish with no dir → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["publish"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing <dir> argument");
  });

  it("publish with unknown flag → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["publish", "/abs", "--gibberish"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown flag: --gibberish");
  });

  it("--registry without value → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["publish", "/abs", "--registry"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("--registry requires a value");
  });

  it("--token without value → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["publish", "/abs", "--token"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("--token requires a value");
  });

  it("publish with invalid manifest → exit 1", async () => {
    await writePluginPackage({ pluginJson: '{ "id": "bad" }' });
    const { io, stderr } = mkIO();
    const code = await runCli(["publish", tmpDir, "--dry-run"], io);
    expect(code).toBe(1);
    expect(stderr()).toContain("publish:");
  });

  it("dry-run (no --registry) → emits would-be POST as JSON, exit 0", async () => {
    await writePluginPackage({
      distFiles: { "index.js": "x" },
    });
    const { io, stdout } = mkIO();
    const code = await runCli(["publish", tmpDir], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout()) as {
      mode: string;
      request: {
        method: string;
        url: string | null;
        headers: Record<string, string>;
        body: { manifest: { id: string }; bundleHash: string };
      };
    };
    expect(parsed.mode).toBe("dry-run");
    expect(parsed.request.method).toBe("POST");
    expect(parsed.request.url).toBeNull();
    expect(parsed.request.headers["content-type"]).toBe("application/json");
    expect(parsed.request.body.manifest.id).toBe("com.test.publish");
    expect(parsed.request.body.bundleHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("--dry-run with --registry → URL appears in dry-run payload", async () => {
    await writePluginPackage({});
    const { io, stdout } = mkIO();
    const code = await runCli(
      [
        "publish",
        tmpDir,
        "--registry",
        "https://registry.example.com",
        "--dry-run",
      ],
      io,
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout()) as {
      request: { url: string };
    };
    expect(parsed.request.url).toBe("https://registry.example.com/api/plugins");
  });

  it("--token redacted in dry-run output (no leaking secrets)", async () => {
    await writePluginPackage({});
    const { io, stdout } = mkIO();
    await runCli(
      [
        "publish",
        tmpDir,
        "--registry",
        "https://r.example.com",
        "--token",
        "secret-token-xyz",
        "--dry-run",
      ],
      io,
    );
    const out = stdout();
    expect(out).toContain("Bearer ***redacted***");
    expect(out).not.toContain("secret-token-xyz");
  });

  it("--registry with successful 200 response → POSTs + prints success", async () => {
    await writePluginPackage({
      distFiles: { "index.js": "x" },
    });
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const { io, stdout } = mkIO({
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response('{"id":"published-id-1"}', {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        });
      },
    });
    const code = await runCli(
      [
        "publish",
        tmpDir,
        "--registry",
        "https://registry.example.com",
        "--token",
        "tok-xyz",
      ],
      io,
    );
    expect(code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("https://registry.example.com/api/plugins");
    expect(requests[0]!.init?.method).toBe("POST");
    const headers = requests[0]!.init?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers.authorization).toBe("Bearer tok-xyz");
    expect(stdout()).toContain(
      "✓ Published com.test.publish@0.1.0 to https://registry.example.com/api/plugins",
    );
    expect(stdout()).toContain("manifestHash:");
    expect(stdout()).toContain("bundleHash:");
    expect(stdout()).toContain('"id":"published-id-1"');
  });

  it("trailing slash on --registry is normalized", async () => {
    await writePluginPackage({});
    const requests: Array<{ url: string }> = [];
    const { io } = mkIO({
      fetch: async (input) => {
        requests.push({ url: String(input) });
        return new Response("ok", { status: 200, statusText: "OK" });
      },
    });
    await runCli(
      ["publish", tmpDir, "--registry", "https://r.example.com/"],
      io,
    );
    expect(requests[0]!.url).toBe("https://r.example.com/api/plugins");
  });

  it("--registry with 4xx response → exit 1, prints error + body", async () => {
    await writePluginPackage({});
    const { io, stderr } = mkIO({
      fetch: async () =>
        new Response('{"error":"version already published"}', {
          status: 409,
          statusText: "Conflict",
          headers: { "content-type": "application/json" },
        }),
    });
    const code = await runCli(
      ["publish", tmpDir, "--registry", "https://r.example.com"],
      io,
    );
    expect(code).toBe(1);
    expect(stderr()).toContain("returned 409 Conflict");
    expect(stderr()).toContain("version already published");
  });

  it("--registry with network error → exit 1 with stderr message", async () => {
    await writePluginPackage({});
    const { io, stderr } = mkIO({
      fetch: async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:9999");
      },
    });
    const code = await runCli(
      ["publish", tmpDir, "--registry", "https://r.example.com"],
      io,
    );
    expect(code).toBe(1);
    expect(stderr()).toContain("network error");
    expect(stderr()).toContain("ECONNREFUSED");
  });

  it("--compact emits single-line dry-run JSON", async () => {
    await writePluginPackage({});
    const { io, stdout } = mkIO();
    const code = await runCli(
      ["publish", tmpDir, "--dry-run", "--compact"],
      io,
    );
    expect(code).toBe(0);
    const out = stdout().trim();
    expect(out.includes("\n")).toBe(false);
    expect(out.startsWith("{")).toBe(true);
  });
});

describe("runCli — install subcommand", () => {
  function validBundle(id: string, version: string) {
    return {
      manifest: {
        id,
        name: id,
        version,
        description: "test plugin",
        entry: "./dist/index.js",
        author: { name: "test" },
        hyperforgeApi: "0.1.0",
        dependencies: [],
        loadAfter: [],
        enabledByDefault: false,
        contributions: {
          systems: [],
          entities: [],
          widgets: [],
          manifestSchemas: [],
          paletteCategories: [],
          toolbarTools: [],
          commands: [],
        },
        tags: [],
      },
      manifestHash: "a".repeat(64),
      files: [{ path: "index.js", size: 10, sha256: "b".repeat(64) }],
      totalSize: 10,
      bundleHash: "c".repeat(64),
    };
  }

  function registryResponse(opts: {
    id: string;
    version: string;
    bundleOverrides?: Partial<ReturnType<typeof validBundle>>;
  }) {
    return new Response(
      JSON.stringify({
        ok: true,
        registryId: "reg_x",
        id: opts.id,
        version: opts.version,
        publishedAt: "2026-04-24T10:00:00.000Z",
        bundle: {
          ...validBundle(opts.id, opts.version),
          ...opts.bundleOverrides,
        },
      }),
      {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      },
    );
  }

  it("install with no spec → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["install"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("missing <id>@<version> argument");
  });

  it("install with spec missing @ → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(
      ["install", "no-at-here", "--registry", "http://r"],
      io,
    );
    expect(code).toBe(2);
    expect(stderr()).toContain("must be <id>@<version>");
  });

  it("install with no --registry → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(["install", "com.x@1.0.0"], io);
    expect(code).toBe(2);
    expect(stderr()).toContain("--registry <url> is required");
  });

  it("install with unknown flag → exit 2", async () => {
    const { io, stderr } = mkIO();
    const code = await runCli(
      ["install", "com.x@1.0.0", "--registry", "http://r", "--gibberish"],
      io,
    );
    expect(code).toBe(2);
    expect(stderr()).toContain("Unknown flag: --gibberish");
  });

  it("install fetches the right URL with optional auth", async () => {
    const requests: Array<{ url: string; headers: Record<string, string> }> =
      [];
    const { io } = mkIO({
      fetch: async (input, init) => {
        requests.push({
          url: String(input),
          headers: (init?.headers as Record<string, string>) ?? {},
        });
        return registryResponse({ id: "com.test.x", version: "1.0.0" });
      },
    });
    const code = await runCli(
      [
        "install",
        "com.test.x@1.0.0",
        "--registry",
        "https://r.example.com",
        "--token",
        "tok-abc",
      ],
      io,
    );
    expect(code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(
      "https://r.example.com/api/plugins/registry/com.test.x/1.0.0",
    );
    expect(requests[0]!.headers.authorization).toBe("Bearer tok-abc");
  });

  it("install with successful 200 → prints verified bundle as JSON", async () => {
    const { io, stdout } = mkIO({
      fetch: async () =>
        registryResponse({ id: "com.test.x", version: "1.0.0" }),
    });
    const code = await runCli(
      ["install", "com.test.x@1.0.0", "--registry", "http://r"],
      io,
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout()) as {
      manifest: { id: string };
      manifestHash: string;
      bundleHash: string;
    };
    expect(parsed.manifest.id).toBe("com.test.x");
    expect(parsed.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.bundleHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("install with --out writes plugin.json + bundle.json to <out>/<id>-<version>/", async () => {
    const { io, stdout, writes, mkdirs } = mkIO({
      fetch: async () =>
        registryResponse({ id: "com.test.x", version: "1.0.0" }),
    });
    const code = await runCli(
      [
        "install",
        "com.test.x@1.0.0",
        "--registry",
        "http://r",
        "--out",
        "/installed",
      ],
      io,
    );
    expect(code).toBe(0);
    expect(stdout()).toContain("✓ Installed com.test.x@1.0.0");
    expect(stdout()).toContain("manifestHash:");
    expect(stdout()).toContain("bundleHash:");
    expect(stdout()).toContain("File bytes NOT downloaded");
    expect(mkdirs()).toContain("/installed/com.test.x-1.0.0");
    const pluginJsonContent = writes().get(
      "/installed/com.test.x-1.0.0/plugin.json",
    );
    expect(pluginJsonContent).toBeDefined();
    const parsedManifest = JSON.parse(pluginJsonContent!) as { id: string };
    expect(parsedManifest.id).toBe("com.test.x");
    const bundleJsonContent = writes().get(
      "/installed/com.test.x-1.0.0/bundle.json",
    );
    expect(bundleJsonContent).toBeDefined();
  });

  it("install rejects registry returning the wrong record (id mismatch)", async () => {
    const { io, stderr } = mkIO({
      fetch: async () =>
        registryResponse({ id: "com.evil.swapped", version: "1.0.0" }),
    });
    const code = await runCli(
      ["install", "com.test.x@1.0.0", "--registry", "http://r"],
      io,
    );
    expect(code).toBe(1);
    expect(stderr()).toContain(
      "registry returned com.evil.swapped@1.0.0, requested com.test.x@1.0.0",
    );
  });

  it("install rejects bundle missing required fields", async () => {
    const { io, stderr } = mkIO({
      fetch: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            registryId: "reg",
            bundle: { manifest: { id: "x" } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });
    const code = await runCli(
      ["install", "x@1.0.0", "--registry", "http://r"],
      io,
    );
    expect(code).toBe(1);
    expect(stderr()).toContain("missing required field");
  });

  it("install rejects bundle with manifest that fails schema validation", async () => {
    const { io, stderr } = mkIO({
      fetch: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            bundle: {
              manifest: { id: "no-version" },
              manifestHash: "x",
              files: [],
              totalSize: 0,
              bundleHash: "y",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });
    const code = await runCli(
      ["install", "no-version@1.0.0", "--registry", "http://r"],
      io,
    );
    expect(code).toBe(1);
    expect(stderr()).toContain("failed PluginManifestSchema validation");
  });

  it("install with 404 → exit 1 with helpful stderr", async () => {
    const { io, stderr } = mkIO({
      fetch: async () =>
        new Response(JSON.stringify({ ok: false, error: "not in registry" }), {
          status: 404,
          statusText: "Not Found",
        }),
    });
    const code = await runCli(
      ["install", "com.test.x@1.0.0", "--registry", "http://r"],
      io,
    );
    expect(code).toBe(1);
    expect(stderr()).toContain("returned 404");
  });

  it("install with network error → exit 1 with stderr", async () => {
    const { io, stderr } = mkIO({
      fetch: async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:9999");
      },
    });
    const code = await runCli(
      ["install", "com.test.x@1.0.0", "--registry", "http://r"],
      io,
    );
    expect(code).toBe(1);
    expect(stderr()).toContain("network error");
    expect(stderr()).toContain("ECONNREFUSED");
  });

  it("install with non-JSON response → exit 1", async () => {
    const { io, stderr } = mkIO({
      fetch: async () =>
        new Response("not json", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    });
    const code = await runCli(
      ["install", "com.test.x@1.0.0", "--registry", "http://r"],
      io,
    );
    expect(code).toBe(1);
    expect(stderr()).toContain("not valid JSON");
  });

  it("trailing slash on --registry is normalized", async () => {
    const requests: Array<{ url: string }> = [];
    const { io } = mkIO({
      fetch: async (input) => {
        requests.push({ url: String(input) });
        return registryResponse({ id: "com.test.x", version: "1.0.0" });
      },
    });
    await runCli(
      ["install", "com.test.x@1.0.0", "--registry", "http://r.example.com/"],
      io,
    );
    expect(requests[0]!.url).toBe(
      "http://r.example.com/api/plugins/registry/com.test.x/1.0.0",
    );
  });
});
