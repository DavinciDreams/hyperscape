/**
 * Tests for the diagnostic formatters in `diagnostics.ts`.
 *
 * Coverage:
 *   - formatUnresolvableReason: all 3 reason kinds
 *   - fixHintForReason: all 3 reason kinds
 *   - formatUnresolvable: composes id + reason + fix
 *   - formatFailedPackage: Error name + message join
 *   - formatSnapshotErrors: aggregation shape + hasErrors flag
 *   - formatSnapshotHuman: full report shape, each bucket populated /
 *     empty / combined
 */

import { describe, expect, it } from "vitest";

import {
  fixHintForReason,
  formatFailedPackage,
  formatSnapshotErrors,
  formatSnapshotHuman,
  formatUnresolvable,
  formatUnresolvableReason,
  type SerializedUnresolvableReason,
  type SessionSnapshot,
  type SnapshotFailedPackage,
  type SnapshotRunningPlugin,
  type SnapshotUnresolvablePlugin,
} from "../index.js";

// ────────────────────────────────────────────────────────────────────────
// Fixture helpers — hand-built snapshot fragments (no schema parsing).
// ────────────────────────────────────────────────────────────────────────

function mkRunning(id: string, version = "1.0.0"): SnapshotRunningPlugin {
  return {
    manifest: {
      id,
      name: id,
      version,
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
  };
}

function mkUnresolvable(
  id: string,
  reason: SerializedUnresolvableReason,
): SnapshotUnresolvablePlugin {
  return { manifest: mkRunning(id).manifest, reason };
}

function mkFailed(
  baseDir: string,
  name = "Error",
  message = "boom",
): SnapshotFailedPackage {
  return { baseDir, errorName: name, errorMessage: message };
}

function mkSnapshot(
  running: SnapshotRunningPlugin[] = [],
  failedPackages: SnapshotFailedPackage[] = [],
  unresolvable: SnapshotUnresolvablePlugin[] = [],
): SessionSnapshot {
  return {
    running,
    failedPackages,
    unresolvable,
    summary: {
      runningCount: running.length,
      failedCount: failedPackages.length,
      unresolvableCount: unresolvable.length,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe("formatUnresolvableReason", () => {
  it("missing-dependency", () => {
    expect(
      formatUnresolvableReason({
        kind: "missing-dependency",
        dependencyId: "com.test.x",
      }),
    ).toBe("missing dependency: com.test.x");
  });

  it("dependency-version-mismatch", () => {
    expect(
      formatUnresolvableReason({
        kind: "dependency-version-mismatch",
        dependencyId: "com.test.x",
        required: "^2.0.0",
        available: "1.0.0",
      }),
    ).toBe(
      "dependency version mismatch: com.test.x (requires ^2.0.0, found 1.0.0)",
    );
  });

  it("cycle", () => {
    expect(
      formatUnresolvableReason({
        kind: "cycle",
        cycleMemberIds: ["com.test.a", "com.test.b", "com.test.c"],
      }),
    ).toBe("cycle member: com.test.a → com.test.b → com.test.c");
  });
});

describe("fixHintForReason", () => {
  it("missing-dependency → install or optional", () => {
    expect(
      fixHintForReason({
        kind: "missing-dependency",
        dependencyId: "com.test.x",
      }),
    ).toBe("Install com.test.x or mark the dependency as optional");
  });

  it("dependency-version-mismatch → upgrade", () => {
    expect(
      fixHintForReason({
        kind: "dependency-version-mismatch",
        dependencyId: "com.test.x",
        required: "^2.0.0",
        available: "1.0.0",
      }),
    ).toBe("Upgrade com.test.x to a version matching ^2.0.0");
  });

  it("cycle → break the cycle", () => {
    expect(
      fixHintForReason({
        kind: "cycle",
        cycleMemberIds: ["a", "b"],
      }),
    ).toBe("Break the cycle by removing one dependency edge among: a, b");
  });
});

describe("formatUnresolvable", () => {
  it("composes id + reason + fix hint", () => {
    const entry = mkUnresolvable("com.test.alpha", {
      kind: "missing-dependency",
      dependencyId: "com.test.missing",
    });
    expect(formatUnresolvable(entry)).toBe(
      "com.test.alpha: missing dependency: com.test.missing. Fix: Install com.test.missing or mark the dependency as optional",
    );
  });
});

describe("formatFailedPackage", () => {
  it("joins baseDir + error name + message", () => {
    expect(
      formatFailedPackage(mkFailed("/x/y", "TypeError", "plugin.json missing")),
    ).toBe("/x/y: TypeError: plugin.json missing");
  });
});

describe("formatSnapshotErrors", () => {
  it("clean snapshot: empty arrays, hasErrors false", () => {
    const diag = formatSnapshotErrors(mkSnapshot([mkRunning("a")]));
    expect(diag.failedMessages).toEqual([]);
    expect(diag.unresolvableMessages).toEqual([]);
    expect(diag.hasErrors).toBe(false);
  });

  it("one failure → hasErrors true, failed populated", () => {
    const diag = formatSnapshotErrors(
      mkSnapshot([], [mkFailed("/x", "TypeError", "boom")]),
    );
    expect(diag.failedMessages).toEqual(["/x: TypeError: boom"]);
    expect(diag.unresolvableMessages).toEqual([]);
    expect(diag.hasErrors).toBe(true);
  });

  it("one unresolvable → hasErrors true, unresolvable populated", () => {
    const diag = formatSnapshotErrors(
      mkSnapshot(
        [],
        [],
        [
          mkUnresolvable("com.test.a", {
            kind: "missing-dependency",
            dependencyId: "com.test.b",
          }),
        ],
      ),
    );
    expect(diag.failedMessages).toEqual([]);
    expect(diag.unresolvableMessages).toEqual([
      "com.test.a: missing dependency: com.test.b. Fix: Install com.test.b or mark the dependency as optional",
    ]);
    expect(diag.hasErrors).toBe(true);
  });

  it("both buckets populated → both arrays populated", () => {
    const diag = formatSnapshotErrors(
      mkSnapshot(
        [mkRunning("com.test.good")],
        [mkFailed("/bad")],
        [
          mkUnresolvable("com.test.a", {
            kind: "cycle",
            cycleMemberIds: ["com.test.a", "com.test.b"],
          }),
        ],
      ),
    );
    expect(diag.failedMessages).toHaveLength(1);
    expect(diag.unresolvableMessages).toHaveLength(1);
    expect(diag.hasErrors).toBe(true);
  });
});

describe("formatSnapshotHuman", () => {
  it("empty snapshot → one-line 'no plugins'", () => {
    expect(formatSnapshotHuman(mkSnapshot())).toBe(
      "Plugin session: no plugins.",
    );
  });

  it("only running: header + running block", () => {
    const report = formatSnapshotHuman(
      mkSnapshot([mkRunning("com.test.a", "1.2.3"), mkRunning("com.test.b")]),
    );
    expect(report).toBe(
      [
        "Plugin session:",
        "  Running (2):",
        "    • com.test.a (1.2.3)",
        "    • com.test.b (1.0.0)",
      ].join("\n"),
    );
  });

  it("only failures: no running block", () => {
    const report = formatSnapshotHuman(
      mkSnapshot([], [mkFailed("/x", "TypeError", "bad")]),
    );
    expect(report).toBe(
      [
        "Plugin session:",
        "  Failed packages (1):",
        "    • /x: TypeError: bad",
      ].join("\n"),
    );
  });

  it("combined buckets: all three sections in order", () => {
    const report = formatSnapshotHuman(
      mkSnapshot(
        [mkRunning("com.test.good")],
        [mkFailed("/bad")],
        [
          mkUnresolvable("com.test.a", {
            kind: "missing-dependency",
            dependencyId: "com.test.b",
          }),
        ],
      ),
    );
    expect(report).toContain("Running (1):");
    expect(report).toContain("• com.test.good (1.0.0)");
    expect(report).toContain("Failed packages (1):");
    expect(report).toContain("• /bad: Error: boom");
    expect(report).toContain("Unresolvable (1):");
    expect(report).toContain(
      "• com.test.a: missing dependency: com.test.b. Fix: Install com.test.b or mark the dependency as optional",
    );
  });
});
