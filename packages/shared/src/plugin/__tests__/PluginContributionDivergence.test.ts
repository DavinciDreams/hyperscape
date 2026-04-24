import { describe, expect, it } from "vitest";
import {
  diffContributionCounts,
  hasContributionDivergence,
} from "../PluginContributionDivergence.js";

describe("diffContributionCounts", () => {
  it("returns [] when records are empty", () => {
    expect(diffContributionCounts({}, {})).toEqual([]);
  });

  it("returns [] when all counts match (includeMatching omitted)", () => {
    expect(
      diffContributionCounts(
        { palette: 2, toolbarTool: 1 },
        { palette: 2, toolbarTool: 1 },
      ),
    ).toEqual([]);
  });

  it("reports kinds advertised but not live (negative delta)", () => {
    expect(diffContributionCounts({ palette: 3 }, {})).toEqual([
      { kind: "palette", advertised: 3, live: 0, delta: -3 },
    ]);
  });

  it("reports kinds live but not advertised (positive delta)", () => {
    expect(diffContributionCounts({}, { toolbarTool: 2 })).toEqual([
      { kind: "toolbarTool", advertised: 0, live: 2, delta: 2 },
    ]);
  });

  it("sorts entries alphabetically by kind", () => {
    const result = diffContributionCounts(
      { zeta: 1, alpha: 2, mu: 0 },
      { zeta: 0, alpha: 0, mu: 1 },
    );
    expect(result.map((r) => r.kind)).toEqual(["alpha", "mu", "zeta"]);
  });

  it("includes matching entries when includeMatching=true", () => {
    const result = diffContributionCounts(
      { palette: 2, toolbarTool: 1 },
      { palette: 2, toolbarTool: 0 },
      { includeMatching: true },
    );
    expect(result).toEqual([
      { kind: "palette", advertised: 2, live: 2, delta: 0 },
      { kind: "toolbarTool", advertised: 1, live: 0, delta: -1 },
    ]);
  });

  it("computes delta as live minus advertised", () => {
    const [entry] = diffContributionCounts({ palette: 2 }, { palette: 5 });
    expect(entry).toEqual({
      kind: "palette",
      advertised: 2,
      live: 5,
      delta: 3,
    });
  });
});

describe("hasContributionDivergence", () => {
  it("is false for empty records", () => {
    expect(hasContributionDivergence({}, {})).toBe(false);
  });

  it("is false when all counts match", () => {
    expect(
      hasContributionDivergence(
        { palette: 2, toolbarTool: 1 },
        { palette: 2, toolbarTool: 1 },
      ),
    ).toBe(false);
  });

  it("is true when advertised differs from live", () => {
    expect(hasContributionDivergence({ palette: 2 }, { palette: 1 })).toBe(
      true,
    );
  });

  it("is true when a kind is live-only (undeclared contribution)", () => {
    expect(hasContributionDivergence({}, { toolbarTool: 1 })).toBe(true);
  });

  it("is false when a live-only kind has count 0", () => {
    expect(hasContributionDivergence({}, { toolbarTool: 0 })).toBe(false);
  });

  it("is true when a kind is advertised-only with non-zero count", () => {
    expect(hasContributionDivergence({ palette: 3 }, {})).toBe(true);
  });
});
