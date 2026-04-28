import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../parseArgs";
import { scaffoldWidgetCommand } from "./scaffoldWidget";

describe("scaffoldWidgetCommand", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), "cli-scaffold-"));
  });

  it("writes files inline-mode end-to-end", () => {
    const r = scaffoldWidgetCommand(
      parseArgs([
        "scaffold",
        "widget",
        "--name=DemoWidget",
        "--manifest-id=com.test.demo.demo",
        "--category=panel",
        "--width=4",
        "--height=3",
        "--widgets-dir=src/widgets",
        "--tests-dir=src/widgets/__tests__",
        "--index-file=src/index.ts",
        `--workspace-root=${workspaceRoot}`,
      ]),
    );
    expect(r.exitCode).toBe(0);
    expect("written" in r.data ? r.data.written.length : 0).toBe(2);
    expect(
      existsSync(join(workspaceRoot, "src/widgets/DemoWidgetWidget.tsx")),
    ).toBe(true);
  });

  it("--dry-run writes nothing but reports the plan", () => {
    const r = scaffoldWidgetCommand(
      parseArgs([
        "scaffold",
        "widget",
        "--name=DryWidget",
        "--manifest-id=com.test.demo.dry",
        "--category=panel",
        "--widgets-dir=src/widgets",
        "--tests-dir=src/widgets/__tests__",
        "--index-file=src/index.ts",
        `--workspace-root=${workspaceRoot}`,
        "--dry-run",
      ]),
    );
    expect(r.exitCode).toBe(0);
    expect(
      existsSync(join(workspaceRoot, "src/widgets/DryWidgetWidget.tsx")),
    ).toBe(false);
    expect(r.text).toContain("Dry run");
  });

  it("rejects invalid spec with exit 3", () => {
    const r = scaffoldWidgetCommand(
      parseArgs([
        "scaffold",
        "widget",
        "--name=lowercase",
        "--manifest-id=BadId",
        "--category=panel",
      ]),
    );
    expect(r.exitCode).toBe(3);
    expect(r.text).toContain("Spec is invalid");
  });

  it("returns exit 1 when required inline flags are missing", () => {
    const r = scaffoldWidgetCommand(parseArgs(["scaffold", "widget"]));
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("--name");
  });

  it("loads a spec from --spec-file", () => {
    const specPath = join(workspaceRoot, "spec.json");
    writeFileSync(
      specPath,
      JSON.stringify({
        name: "FromFile",
        manifestId: "com.test.demo.from-file",
        category: "panel",
        defaultSize: { width: 4, height: 3 },
        description: "From a JSON file.",
        props: [
          { name: "label", type: "string", defaultValue: "hi" },
          {
            name: "size",
            type: "enum",
            enumValues: ["s", "m", "l"],
            defaultValue: "m",
          },
        ],
      }),
      "utf8",
    );

    const r = scaffoldWidgetCommand(
      parseArgs([
        "scaffold",
        "widget",
        `--spec-file=${specPath}`,
        "--widgets-dir=src/widgets",
        "--tests-dir=src/widgets/__tests__",
        "--index-file=src/index.ts",
        `--workspace-root=${workspaceRoot}`,
      ]),
    );
    expect(r.exitCode).toBe(0);
    const sourcePath = join(workspaceRoot, "src/widgets/FromFileWidget.tsx");
    expect(existsSync(sourcePath)).toBe(true);
    const source = readFileSync(sourcePath, "utf8");
    expect(source).toContain('z.string().default("hi")');
    expect(source).toContain('z.enum(["s", "m", "l"]).default("m")');
  });

  it("returns exit 2 when --spec-file path is missing", () => {
    const r = scaffoldWidgetCommand(
      parseArgs(["scaffold", "widget", "--spec-file=does-not-exist.json"]),
    );
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("Spec file not found");
  });

  it("--format=json emits structured output", () => {
    const r = scaffoldWidgetCommand(
      parseArgs([
        "scaffold",
        "widget",
        "--name=JsonWidget",
        "--manifest-id=com.test.demo.json",
        "--category=panel",
        "--widgets-dir=src/widgets",
        "--tests-dir=src/widgets/__tests__",
        "--index-file=src/index.ts",
        `--workspace-root=${workspaceRoot}`,
        "--dry-run",
        "--format=json",
      ]),
    );
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.text) as { dryRun: boolean };
    expect(parsed.dryRun).toBe(true);
  });
});
