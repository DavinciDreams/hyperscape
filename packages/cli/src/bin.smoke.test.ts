/**
 * End-to-end smoke test. Runs the built `bin.js` as a subprocess
 * against a fixture catalog written to a temp dir. Proves that the
 * compiled output actually executes under Node — catches the kind
 * of ESM-resolution failure that unit tests miss because vitest
 * uses its own resolver.
 *
 * Skipped when `dist/bin.js` doesn't exist (test:watch on a clean
 * checkout). Run `bun run build` first.
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const binPath = resolve(here, "../dist/bin.js");

const fixture = {
  version: 1,
  builtAt: "2026-04-28T19:00:00.000Z",
  widgets: [
    {
      id: "com.test.smoke.alpha",
      name: "Alpha",
      description: "Smoke test widget",
      category: "panel",
      defaultSize: { width: 4, height: 3 },
      icon: "",
      props: [],
      defaultProps: {},
      jsdocSummary: "",
      sourcePath: "",
    },
  ],
  stats: { total: 1, byCategory: { panel: 1 } },
};

function runBin(
  args: ReadonlyArray<string>,
  catalogPath: string,
): {
  status: number;
  stdout: string;
  stderr: string;
} {
  try {
    const stdout = execFileSync(
      "node",
      [binPath, ...args, `--catalog=${catalogPath}`],
      { encoding: "utf8" },
    );
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: err.status ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

const skipUnlessBuilt = existsSync(binPath) ? describe : describe.skip;

skipUnlessBuilt("bin.js — subprocess smoke", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cli-smoke-"));
  const catalogPath = join(tmp, "catalog.json");
  mkdirSync(dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, JSON.stringify(fixture), "utf8");

  it("exit 0 with help text on `help`", () => {
    const r = runBin(["help"], catalogPath);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("HyperForge CLI");
  });

  it("widgets list returns 1 widget for the fixture", () => {
    const r = runBin(["widgets", "list"], catalogPath);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("com.test.smoke.alpha");
  });

  it("widgets get unknown id exits 3", () => {
    const r = runBin(["widgets", "get", "com.does.not.exist"], catalogPath);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("not found");
  });

  it("--format=json emits parseable JSON", () => {
    const r = runBin(["widgets", "list", "--format=json"], catalogPath);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as { count: number };
    expect(parsed.count).toBe(1);
  });

  it("missing catalog exits 2", () => {
    const r = runBin(["widgets", "list"], join(tmp, "does-not-exist.json"));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("not found");
  });
});
