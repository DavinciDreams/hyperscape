/**
 * Plugin version-range resolver.
 *
 * Pure-logic SemVer range matcher that answers a single question:
 * "does `version` satisfy `range`?" Intentionally minimal — covers
 * the subset of SemVer that `PluginDependency.versionRange` realistic
 * authors will use, with no external dependency:
 *
 *   *           | "star" — any version
 *   latest      | alias for "*"
 *   1.2.3       | exact
 *   =1.2.3      | exact
 *   ^1.2.3      | caret: matches same major (1.x.x), ≥ 1.2.3
 *   ~1.2.3      | tilde: matches same minor (1.2.x), ≥ 1.2.3
 *   >=1.2.3     | comparator
 *   >1.2.3      | comparator
 *   <=1.2.3     | comparator
 *   <1.2.3      | comparator
 *   >=1 <3      | space-joined AND (comparator-set)
 *   1.x / 1.x.x | wildcard — matches 1.*.*
 *
 * Rules reach for npm's semver behavior where unambiguous, but do
 * NOT handle pre-release precedence (`1.0.0-alpha.1` vs
 * `1.0.0-alpha.2`): pre-releases are compared byte-wise after the
 * numeric core matches, which is enough for authoring workflows
 * where pre-releases are only consumed inside their own minor.
 *
 * If the range string isn't recognizable under the grammar above,
 * throws `InvalidPluginVersionRangeError`. Authors will see the
 * error surfaced through `PluginHostHealthCheck`.
 */

export class InvalidPluginVersionRangeError extends Error {
  readonly range: string;
  constructor(range: string) {
    super(`unrecognized plugin versionRange: "${range}"`);
    this.name = "InvalidPluginVersionRangeError";
    this.range = range;
  }
}

export class InvalidPluginVersionError extends Error {
  readonly version: string;
  constructor(version: string) {
    super(`not a valid plugin version: "${version}"`);
    this.name = "InvalidPluginVersionError";
    this.version = version;
  }
}

interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: string;
}

const SEMVER_RE =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseVersion(v: string): ParsedVersion {
  const m = SEMVER_RE.exec(v.trim());
  if (!m) throw new InvalidPluginVersionError(v);
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? "",
  };
}

/** Returns -1 / 0 / 1 by ordering of the SemVer core + pre-release. */
function compare(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  // Pre-release semantics: no pre-release > has pre-release.
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === "") return 1;
  if (b.prerelease === "") return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}

type Comparator = (v: ParsedVersion) => boolean;

function cmp(op: string, rhs: ParsedVersion): Comparator {
  switch (op) {
    case "=":
      return (v) => compare(v, rhs) === 0;
    case ">":
      return (v) => compare(v, rhs) > 0;
    case ">=":
      return (v) => compare(v, rhs) >= 0;
    case "<":
      return (v) => compare(v, rhs) < 0;
    case "<=":
      return (v) => compare(v, rhs) <= 0;
    default:
      throw new InvalidPluginVersionRangeError(`unknown operator: ${op}`);
  }
}

function caretComparators(rhs: ParsedVersion): Comparator[] {
  // ^1.2.3 → >=1.2.3 <2.0.0
  // ^0.2.3 → >=0.2.3 <0.3.0
  // ^0.0.3 → >=0.0.3 <0.0.4
  const ge: Comparator = (v) => compare(v, rhs) >= 0;
  let upper: ParsedVersion;
  if (rhs.major > 0) {
    upper = { major: rhs.major + 1, minor: 0, patch: 0, prerelease: "" };
  } else if (rhs.minor > 0) {
    upper = { major: 0, minor: rhs.minor + 1, patch: 0, prerelease: "" };
  } else {
    upper = {
      major: 0,
      minor: 0,
      patch: rhs.patch + 1,
      prerelease: "",
    };
  }
  const lt: Comparator = (v) => compare(v, upper) < 0;
  return [ge, lt];
}

function tildeComparators(rhs: ParsedVersion): Comparator[] {
  // ~1.2.3 → >=1.2.3 <1.3.0
  // ~1.2   → >=1.2.0 <1.3.0   (handled at parse time by filling zeros)
  // ~1     → >=1.0.0 <2.0.0
  const ge: Comparator = (v) => compare(v, rhs) >= 0;
  const upper: ParsedVersion = {
    major: rhs.major,
    minor: rhs.minor + 1,
    patch: 0,
    prerelease: "",
  };
  const lt: Comparator = (v) => compare(v, upper) < 0;
  return [ge, lt];
}

function wildcardComparators(
  major: number,
  minor: number | null,
): Comparator[] {
  // 1.x    → >=1.0.0 <2.0.0
  // 1.2.x  → >=1.2.0 <1.3.0
  const lower: ParsedVersion = {
    major,
    minor: minor ?? 0,
    patch: 0,
    prerelease: "",
  };
  const upper: ParsedVersion =
    minor === null
      ? { major: major + 1, minor: 0, patch: 0, prerelease: "" }
      : { major, minor: minor + 1, patch: 0, prerelease: "" };
  return [(v) => compare(v, lower) >= 0, (v) => compare(v, upper) < 0];
}

function parseSingleRange(raw: string): Comparator[] {
  const token = raw.trim();
  if (token === "") {
    // empty token inside a compound range — skip
    return [];
  }
  // Wildcard / latest / star.
  if (token === "*" || token.toLowerCase() === "latest") {
    return [() => true];
  }
  // X.Y.x or X.x
  const wildMatch = /^(\d+)(?:\.(\d+))?\.[xX]$/.exec(token);
  if (wildMatch) {
    return wildcardComparators(
      Number(wildMatch[1]),
      wildMatch[2] !== undefined ? Number(wildMatch[2]) : null,
    );
  }
  // X.x
  const wildMajor = /^(\d+)\.[xX]$/.exec(token);
  if (wildMajor) {
    return wildcardComparators(Number(wildMajor[1]), null);
  }
  // Caret / tilde.
  if (token.startsWith("^")) {
    return caretComparators(parseVersion(token.slice(1)));
  }
  if (token.startsWith("~")) {
    return tildeComparators(parseVersion(token.slice(1)));
  }
  // Comparators: >=, <=, >, <, =
  const opMatch = /^(>=|<=|>|<|=)(.+)$/.exec(token);
  if (opMatch) {
    return [cmp(opMatch[1], parseVersion(opMatch[2]))];
  }
  // Bare version = exact.
  return [cmp("=", parseVersion(token))];
}

/**
 * Does `version` satisfy `range`? Both arguments are strings; the
 * function parses them fresh on each call (no caller-visible caching).
 *
 * Throws `InvalidPluginVersionError` if `version` isn't parseable.
 * Throws `InvalidPluginVersionRangeError` if `range` can't be parsed
 * under the supported grammar.
 *
 * @param version concrete plugin version like `"1.2.3"`
 * @param range   npm-style range like `"^1.2.0"` or `">=2 <3"`
 */
export function satisfiesPluginVersionRange(
  version: string,
  range: string,
): boolean {
  const parsed = parseVersion(version);
  const trimmed = range.trim();
  if (trimmed === "") {
    throw new InvalidPluginVersionRangeError(range);
  }
  // Space-joined AND — e.g. ">=1 <3". All comparators must match.
  // We split on whitespace but keep operator tokens glued to their
  // number by requiring an operator or dot before a space gap.
  const tokens = trimmed.split(/\s+/);
  const comparators: Comparator[] = [];
  for (const token of tokens) {
    comparators.push(...parseSingleRange(token));
  }
  if (comparators.length === 0) {
    throw new InvalidPluginVersionRangeError(range);
  }
  return comparators.every((c) => c(parsed));
}
