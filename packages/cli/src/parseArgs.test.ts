import { describe, expect, it } from "vitest";
import { boolFlag, parseArgs, stringFlag } from "./parseArgs";

describe("parseArgs", () => {
  it("returns empty for no args", () => {
    const r = parseArgs([]);
    expect(r.positional).toEqual([]);
    expect(r.flags).toEqual({});
  });

  it("collects positional args in order", () => {
    const r = parseArgs(["widgets", "list"]);
    expect(r.positional).toEqual(["widgets", "list"]);
  });

  it("parses --flag as true", () => {
    const r = parseArgs(["--dry-run"]);
    expect(r.flags.dryRun).toBe(true);
  });

  it("parses --no-flag as false", () => {
    const r = parseArgs(["--no-color"]);
    expect(r.flags.color).toBe(false);
  });

  it("parses --key=value", () => {
    const r = parseArgs(["--format=json"]);
    expect(r.flags.format).toBe("json");
  });

  it("parses --key value pairs", () => {
    const r = parseArgs(["--format", "json"]);
    expect(r.flags.format).toBe("json");
  });

  it("treats next-flag as boolean", () => {
    const r = parseArgs(["--quiet", "--format=text"]);
    expect(r.flags.quiet).toBe(true);
    expect(r.flags.format).toBe("text");
  });

  it("normalizes kebab-case to camelCase", () => {
    const r = parseArgs(["--spec-file", "x.json"]);
    expect(r.flags.specFile).toBe("x.json");
  });

  it("stops parsing flags after --", () => {
    const r = parseArgs(["widgets", "--", "--not-a-flag"]);
    expect(r.positional).toEqual(["widgets", "--not-a-flag"]);
    expect(r.flags).toEqual({});
  });

  it("mixes positional and flags freely", () => {
    const r = parseArgs([
      "widgets",
      "list",
      "--category",
      "panel",
      "--format=json",
    ]);
    expect(r.positional).toEqual(["widgets", "list"]);
    expect(r.flags.category).toBe("panel");
    expect(r.flags.format).toBe("json");
  });
});

describe("stringFlag", () => {
  it("returns the string value", () => {
    const r = parseArgs(["--format=json"]);
    expect(stringFlag(r, "format")).toBe("json");
  });

  it("returns undefined when absent", () => {
    const r = parseArgs([]);
    expect(stringFlag(r, "format")).toBeUndefined();
  });

  it("returns undefined for boolean flags", () => {
    const r = parseArgs(["--quiet"]);
    expect(stringFlag(r, "quiet")).toBeUndefined();
  });
});

describe("boolFlag", () => {
  it("returns true for --flag", () => {
    const r = parseArgs(["--quiet"]);
    expect(boolFlag(r, "quiet")).toBe(true);
  });

  it("returns false for --no-flag", () => {
    const r = parseArgs(["--no-quiet"]);
    expect(boolFlag(r, "quiet")).toBe(false);
  });

  it("returns defaultValue when absent", () => {
    const r = parseArgs([]);
    expect(boolFlag(r, "quiet", false)).toBe(false);
    expect(boolFlag(r, "quiet", true)).toBe(true);
  });

  it("returns false for the strings 'false' and '0'", () => {
    const r = parseArgs(["--quiet=false"]);
    expect(boolFlag(r, "quiet")).toBe(false);
    const r2 = parseArgs(["--quiet=0"]);
    expect(boolFlag(r2, "quiet")).toBe(false);
  });

  it("returns true for non-empty string values", () => {
    const r = parseArgs(["--quiet=yes"]);
    expect(boolFlag(r, "quiet")).toBe(true);
  });
});
