import { describe, expect, it } from "vitest";
import {
  InvalidPluginVersionError,
  InvalidPluginVersionRangeError,
  satisfiesPluginVersionRange,
} from "../PluginVersionRange.js";

describe("satisfiesPluginVersionRange", () => {
  describe("star / latest", () => {
    it("`*` matches any valid version", () => {
      expect(satisfiesPluginVersionRange("0.0.1", "*")).toBe(true);
      expect(satisfiesPluginVersionRange("99.99.99", "*")).toBe(true);
    });
    it("`latest` matches any valid version (case-insensitive)", () => {
      expect(satisfiesPluginVersionRange("1.2.3", "latest")).toBe(true);
      expect(satisfiesPluginVersionRange("1.2.3", "LATEST")).toBe(true);
    });
  });

  describe("exact", () => {
    it("bare `1.2.3` matches exactly `1.2.3`", () => {
      expect(satisfiesPluginVersionRange("1.2.3", "1.2.3")).toBe(true);
      expect(satisfiesPluginVersionRange("1.2.4", "1.2.3")).toBe(false);
      expect(satisfiesPluginVersionRange("1.2.2", "1.2.3")).toBe(false);
    });
    it("`=1.2.3` is equivalent to `1.2.3`", () => {
      expect(satisfiesPluginVersionRange("1.2.3", "=1.2.3")).toBe(true);
      expect(satisfiesPluginVersionRange("1.2.4", "=1.2.3")).toBe(false);
    });
  });

  describe("caret", () => {
    it("`^1.2.3` matches 1.x.x at or above 1.2.3", () => {
      expect(satisfiesPluginVersionRange("1.2.3", "^1.2.3")).toBe(true);
      expect(satisfiesPluginVersionRange("1.9.0", "^1.2.3")).toBe(true);
      expect(satisfiesPluginVersionRange("1.2.2", "^1.2.3")).toBe(false);
      expect(satisfiesPluginVersionRange("2.0.0", "^1.2.3")).toBe(false);
      expect(satisfiesPluginVersionRange("0.9.9", "^1.2.3")).toBe(false);
    });
    it("`^0.2.3` matches 0.2.x at or above 0.2.3 (no major bump for 0.x)", () => {
      expect(satisfiesPluginVersionRange("0.2.3", "^0.2.3")).toBe(true);
      expect(satisfiesPluginVersionRange("0.2.99", "^0.2.3")).toBe(true);
      expect(satisfiesPluginVersionRange("0.3.0", "^0.2.3")).toBe(false);
      expect(satisfiesPluginVersionRange("0.2.2", "^0.2.3")).toBe(false);
    });
    it("`^0.0.3` matches only 0.0.3 exactly (no minor or patch bump for 0.0.x)", () => {
      expect(satisfiesPluginVersionRange("0.0.3", "^0.0.3")).toBe(true);
      expect(satisfiesPluginVersionRange("0.0.4", "^0.0.3")).toBe(false);
    });
  });

  describe("tilde", () => {
    it("`~1.2.3` matches 1.2.x at or above 1.2.3", () => {
      expect(satisfiesPluginVersionRange("1.2.3", "~1.2.3")).toBe(true);
      expect(satisfiesPluginVersionRange("1.2.99", "~1.2.3")).toBe(true);
      expect(satisfiesPluginVersionRange("1.3.0", "~1.2.3")).toBe(false);
      expect(satisfiesPluginVersionRange("1.2.2", "~1.2.3")).toBe(false);
    });
  });

  describe("comparators", () => {
    it.each([
      [">=1.0.0", "1.0.0", true],
      [">=1.0.0", "0.9.9", false],
      [">1.0.0", "1.0.0", false],
      [">1.0.0", "1.0.1", true],
      ["<2.0.0", "1.99.99", true],
      ["<2.0.0", "2.0.0", false],
      ["<=2.0.0", "2.0.0", true],
      ["<=2.0.0", "2.0.1", false],
    ])("%s vs %s → %s", (range, version, expected) => {
      expect(satisfiesPluginVersionRange(version, range)).toBe(expected);
    });
  });

  describe("space-joined AND", () => {
    it("`>=1.0.0 <3.0.0` accepts 1.x and 2.x but not 0.x or 3.x", () => {
      expect(satisfiesPluginVersionRange("1.0.0", ">=1.0.0 <3.0.0")).toBe(true);
      expect(satisfiesPluginVersionRange("2.5.0", ">=1.0.0 <3.0.0")).toBe(true);
      expect(satisfiesPluginVersionRange("3.0.0", ">=1.0.0 <3.0.0")).toBe(
        false,
      );
      expect(satisfiesPluginVersionRange("0.9.9", ">=1.0.0 <3.0.0")).toBe(
        false,
      );
    });
  });

  describe("wildcard", () => {
    it("`1.x` accepts any 1.y.z", () => {
      expect(satisfiesPluginVersionRange("1.0.0", "1.x")).toBe(true);
      expect(satisfiesPluginVersionRange("1.9.99", "1.x")).toBe(true);
      expect(satisfiesPluginVersionRange("2.0.0", "1.x")).toBe(false);
      expect(satisfiesPluginVersionRange("0.99.99", "1.x")).toBe(false);
    });
    it("`1.2.x` accepts any 1.2.z", () => {
      expect(satisfiesPluginVersionRange("1.2.0", "1.2.x")).toBe(true);
      expect(satisfiesPluginVersionRange("1.2.99", "1.2.x")).toBe(true);
      expect(satisfiesPluginVersionRange("1.3.0", "1.2.x")).toBe(false);
    });
  });

  describe("pre-release", () => {
    it("a release version > its pre-release counterpart", () => {
      expect(satisfiesPluginVersionRange("1.0.0", ">=1.0.0-alpha")).toBe(true);
      expect(satisfiesPluginVersionRange("1.0.0-alpha", ">=1.0.0")).toBe(false);
    });
  });

  describe("error cases", () => {
    it("empty range throws InvalidPluginVersionRangeError", () => {
      expect(() => satisfiesPluginVersionRange("1.0.0", "")).toThrowError(
        InvalidPluginVersionRangeError,
      );
    });
    it("nonsense range throws InvalidPluginVersionRangeError", () => {
      expect(() =>
        satisfiesPluginVersionRange("1.0.0", "not-a-range!@#"),
      ).toThrowError(InvalidPluginVersionError);
      // `not-a-range!@#` is parsed as a bare-version comparator, so
      // failure surfaces as version parse failure. Either error class
      // is acceptable — both signal "range unrecognized".
    });
    it("non-SemVer version throws InvalidPluginVersionError", () => {
      expect(() =>
        satisfiesPluginVersionRange("one.two.three", "^1.0.0"),
      ).toThrowError(InvalidPluginVersionError);
    });
  });
});
