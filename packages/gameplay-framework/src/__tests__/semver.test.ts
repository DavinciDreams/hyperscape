/**
 * Tests for the minimal SemVer range resolver.
 *
 * Coverage matrix:
 *   - Exact / bare version
 *   - Comparators: =, >, >=, <, <=
 *   - Caret (^) with major>0, major=0 minor>0, major=0 minor=0
 *   - Tilde (~)
 *   - Wildcards: *, x, X
 *   - AND combinations (space-separated within a group)
 *   - OR combinations (|| between groups)
 *   - Pre-release / build metadata stripping
 *   - Invalid version + invalid range error types
 */

import { describe, expect, it } from "vitest";

import {
  InvalidVersionError,
  InvalidVersionRangeError,
  satisfiesPluginVersionRange,
} from "../index.js";

describe("satisfiesPluginVersionRange — exact + comparators", () => {
  it("matches a bare exact version", () => {
    expect(satisfiesPluginVersionRange("1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("1.2.4", "1.2.3")).toBe(false);
  });

  it("matches =1.2.3 equivalent to bare", () => {
    expect(satisfiesPluginVersionRange("1.2.3", "=1.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("1.2.4", "=1.2.3")).toBe(false);
  });

  it("handles > and >=", () => {
    expect(satisfiesPluginVersionRange("1.2.4", ">1.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("1.2.3", ">1.2.3")).toBe(false);
    expect(satisfiesPluginVersionRange("1.2.3", ">=1.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("1.2.2", ">=1.2.3")).toBe(false);
  });

  it("handles < and <=", () => {
    expect(satisfiesPluginVersionRange("1.2.2", "<1.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("1.2.3", "<1.2.3")).toBe(false);
    expect(satisfiesPluginVersionRange("1.2.3", "<=1.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("1.2.4", "<=1.2.3")).toBe(false);
  });
});

describe("satisfiesPluginVersionRange — caret", () => {
  it("^1.2.3 matches 1.2.3 and anything up to but not 2.0.0", () => {
    expect(satisfiesPluginVersionRange("1.2.3", "^1.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("1.2.4", "^1.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("1.9.0", "^1.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("2.0.0", "^1.2.3")).toBe(false);
    expect(satisfiesPluginVersionRange("1.2.2", "^1.2.3")).toBe(false);
  });

  it("^0.2.3 locks minor (npm-style)", () => {
    expect(satisfiesPluginVersionRange("0.2.3", "^0.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("0.2.9", "^0.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("0.3.0", "^0.2.3")).toBe(false);
    expect(satisfiesPluginVersionRange("0.2.2", "^0.2.3")).toBe(false);
  });

  it("^0.0.3 locks patch (npm-style)", () => {
    expect(satisfiesPluginVersionRange("0.0.3", "^0.0.3")).toBe(true);
    expect(satisfiesPluginVersionRange("0.0.4", "^0.0.3")).toBe(false);
    expect(satisfiesPluginVersionRange("0.0.2", "^0.0.3")).toBe(false);
  });
});

describe("satisfiesPluginVersionRange — tilde", () => {
  it("~1.2.3 matches 1.2.3 and up to but not 1.3.0", () => {
    expect(satisfiesPluginVersionRange("1.2.3", "~1.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("1.2.9", "~1.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("1.3.0", "~1.2.3")).toBe(false);
    expect(satisfiesPluginVersionRange("1.2.2", "~1.2.3")).toBe(false);
  });
});

describe("satisfiesPluginVersionRange — wildcards", () => {
  it("matches anything for *, x, X", () => {
    for (const range of ["*", "x", "X"]) {
      expect(satisfiesPluginVersionRange("0.0.1", range)).toBe(true);
      expect(satisfiesPluginVersionRange("99.99.99", range)).toBe(true);
    }
  });
});

describe("satisfiesPluginVersionRange — AND / OR", () => {
  it("AND: >=1.0.0 <2.0.0 matches only 1.x.x", () => {
    const r = ">=1.0.0 <2.0.0";
    expect(satisfiesPluginVersionRange("0.9.9", r)).toBe(false);
    expect(satisfiesPluginVersionRange("1.0.0", r)).toBe(true);
    expect(satisfiesPluginVersionRange("1.9.9", r)).toBe(true);
    expect(satisfiesPluginVersionRange("2.0.0", r)).toBe(false);
  });

  it("OR: ^1.0.0 || ^3.0.0 matches 1.x.x and 3.x.x but not 2.x.x", () => {
    const r = "^1.0.0 || ^3.0.0";
    expect(satisfiesPluginVersionRange("1.5.2", r)).toBe(true);
    expect(satisfiesPluginVersionRange("3.0.1", r)).toBe(true);
    expect(satisfiesPluginVersionRange("2.0.0", r)).toBe(false);
    expect(satisfiesPluginVersionRange("4.0.0", r)).toBe(false);
  });

  it("OR+AND mixed: '>=1.0.0 <2.0.0 || >=3.0.0 <4.0.0'", () => {
    const r = ">=1.0.0 <2.0.0 || >=3.0.0 <4.0.0";
    expect(satisfiesPluginVersionRange("1.5.0", r)).toBe(true);
    expect(satisfiesPluginVersionRange("3.5.0", r)).toBe(true);
    expect(satisfiesPluginVersionRange("2.5.0", r)).toBe(false);
    expect(satisfiesPluginVersionRange("4.0.0", r)).toBe(false);
  });
});

describe("satisfiesPluginVersionRange — pre-release + build metadata", () => {
  it("strips pre-release tags from the candidate version", () => {
    // Versions ignore pre-release tags for range comparison (see semver.ts docs).
    expect(satisfiesPluginVersionRange("1.2.3-rc.1", "^1.2.3")).toBe(true);
    expect(satisfiesPluginVersionRange("1.2.3-beta", "=1.2.3")).toBe(true);
  });

  it("strips build metadata from the candidate version", () => {
    expect(satisfiesPluginVersionRange("1.2.3+build.7", "^1.2.3")).toBe(true);
  });

  it("strips pre-release + build from range tokens", () => {
    expect(satisfiesPluginVersionRange("1.2.3", "^1.2.3-rc.1")).toBe(true);
    expect(satisfiesPluginVersionRange("1.2.4", "^1.2.3+build.1")).toBe(true);
  });
});

describe("satisfiesPluginVersionRange — error handling", () => {
  it("throws InvalidVersionError on malformed candidate version", () => {
    expect(() => satisfiesPluginVersionRange("not-a-version", "*")).toThrow(
      InvalidVersionError,
    );
    expect(() => satisfiesPluginVersionRange("", "*")).toThrow(
      InvalidVersionError,
    );
    expect(() => satisfiesPluginVersionRange("1.2", "*")).toThrow(
      InvalidVersionError,
    );
  });

  it("throws InvalidVersionRangeError on malformed range", () => {
    expect(() => satisfiesPluginVersionRange("1.2.3", "")).toThrow(
      InvalidVersionRangeError,
    );
    expect(() =>
      satisfiesPluginVersionRange("1.2.3", "^not-a-version"),
    ).toThrow(InvalidVersionRangeError);
    expect(() => satisfiesPluginVersionRange("1.2.3", ">=abc")).toThrow(
      InvalidVersionRangeError,
    );
  });
});
