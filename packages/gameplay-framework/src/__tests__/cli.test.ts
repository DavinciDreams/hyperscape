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
