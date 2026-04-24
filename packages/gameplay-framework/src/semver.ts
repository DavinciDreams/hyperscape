/**
 * Minimal SemVer range resolver for plugin dependency checks.
 *
 * Why this lives here (and not as a dep on `semver` npm):
 *   - `@hyperforge/gameplay-framework` is the stable public author
 *     surface. Every byte we add to its install footprint ships to
 *     every plugin repo that depends on it. A hand-rolled ~150 line
 *     resolver covering the realistic subset is cheaper than pulling
 *     in the full npm `semver` package (~50 KB, lots of edge-case
 *     handling plugin authors don't use).
 *   - The subset we actually need is small: exact, caret (`^`),
 *     tilde (`~`), comparators (`>`, `>=`, `<`, `<=`, `=`), wildcard
 *     (`*`), AND (space-separated), OR (`||`).
 *
 * What's NOT supported (deliberately — add if a real plugin needs it):
 *   - Pre-release identifiers in comparisons (e.g. `1.2.3-rc.1`). The
 *     manifest `versionSchema` ACCEPTS pre-release tags in a version
 *     string; range matching here treats versions as `[major, minor,
 *     patch]` triples and ignores pre-release tags entirely. This
 *     matches the conservative npm-semver default (`includePrerelease:
 *     false`) close enough for plugin gating.
 *   - Build metadata (`+build.7`) — stripped before parsing.
 *   - Hyphen ranges (`1.0.0 - 2.0.0`).
 *   - X-ranges (`1.2.x`, `1.X`) beyond bare `*`/`x` wildcards.
 *
 * Contract:
 *   - `satisfiesPluginVersionRange(version, range)` is pure and
 *     deterministic.
 *   - Invalid inputs throw loud typed errors so the host can surface
 *     actionable messages (never returns `false` silently).
 */

/** Parsed semantic version triple. Pre-release / build tags are discarded. */
interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/** A single comparator clause, e.g. `>=1.2.3`. */
interface Comparator {
  readonly op: "<" | "<=" | ">" | ">=" | "=";
  readonly version: ParsedVersion;
}

/** Error thrown when `version` is not a well-formed SemVer string. */
export class InvalidVersionError extends Error {
  constructor(
    public readonly value: string,
    reason?: string,
  ) {
    super(`Invalid SemVer version "${value}"${reason ? `: ${reason}` : ""}`);
    this.name = "InvalidVersionError";
  }
}

/** Error thrown when `range` is not a well-formed SemVer range string. */
export class InvalidVersionRangeError extends Error {
  constructor(
    public readonly value: string,
    reason?: string,
  ) {
    super(`Invalid SemVer range "${value}"${reason ? `: ${reason}` : ""}`);
    this.name = "InvalidVersionRangeError";
  }
}

/**
 * Return true iff `version` satisfies `range`. Both arguments are
 * required; pass `"*"` as range to match anything.
 */
export function satisfiesPluginVersionRange(
  version: string,
  range: string,
): boolean {
  const parsedVersion = parseVersion(version);
  const orGroups = splitOrGroups(range);
  return orGroups.some((group) => {
    const comparators = parseComparators(group, range);
    return comparators.every((c) => compareClause(parsedVersion, c));
  });
}

// ────────────────────────────────────────────────────────────────────────
// Parsing
// ────────────────────────────────────────────────────────────────────────

/** Strip pre-release + build metadata, return the x.y.z head. */
function stripPrereleaseAndBuild(version: string): string {
  // Order matters: build metadata can follow pre-release (`1.2.3-rc.1+build.7`).
  const noBuild = version.split("+", 1)[0] ?? version;
  const noPrerelease = noBuild.split("-", 1)[0] ?? noBuild;
  return noPrerelease;
}

function parseVersion(raw: string): ParsedVersion {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new InvalidVersionError(raw, "empty string");
  }
  const head = stripPrereleaseAndBuild(raw.trim());
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(head);
  if (!match) {
    throw new InvalidVersionError(raw, "expected 'major.minor.patch'");
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** Split `a || b || c` into ["a", "b", "c"] — OR groups. */
function splitOrGroups(range: string): string[] {
  if (typeof range !== "string") {
    throw new InvalidVersionRangeError(String(range), "not a string");
  }
  const trimmed = range.trim();
  if (trimmed.length === 0) {
    throw new InvalidVersionRangeError(range, "empty range");
  }
  return trimmed.split(/\s*\|\|\s*/g);
}

/**
 * Parse a single AND-group (e.g. `">=1.0.0 <2.0.0"` or `"^1.2.3"`)
 * into a list of bare comparators.
 */
function parseComparators(group: string, original: string): Comparator[] {
  const tokens = group
    .trim()
    .split(/\s+/g)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    throw new InvalidVersionRangeError(original, "empty AND-group");
  }
  const comparators: Comparator[] = [];
  for (const token of tokens) {
    for (const c of expandToken(token, original)) {
      comparators.push(c);
    }
  }
  return comparators;
}

/**
 * Expand a single token into one or more comparators:
 *   `*` / `x`        → []  (always satisfied — empty conjunction)
 *   `1.2.3`          → [=1.2.3]
 *   `=1.2.3`         → [=1.2.3]
 *   `>1.2.3`         → [>1.2.3]
 *   `^1.2.3`         → [>=1.2.3, <2.0.0]
 *   `^0.2.3`         → [>=0.2.3, <0.3.0]
 *   `^0.0.3`         → [>=0.0.3, <0.0.4]
 *   `~1.2.3`         → [>=1.2.3, <1.3.0]
 */
function expandToken(token: string, original: string): Comparator[] {
  if (token === "*" || token === "x" || token === "X") return [];

  // Order matters: check multi-char prefixes before single-char.
  if (token.startsWith(">=")) {
    return [{ op: ">=", version: parseTokenVersion(token.slice(2), original) }];
  }
  if (token.startsWith("<=")) {
    return [{ op: "<=", version: parseTokenVersion(token.slice(2), original) }];
  }
  if (token.startsWith(">")) {
    return [{ op: ">", version: parseTokenVersion(token.slice(1), original) }];
  }
  if (token.startsWith("<")) {
    return [{ op: "<", version: parseTokenVersion(token.slice(1), original) }];
  }
  if (token.startsWith("=")) {
    return [{ op: "=", version: parseTokenVersion(token.slice(1), original) }];
  }
  if (token.startsWith("^")) {
    const v = parseTokenVersion(token.slice(1), original);
    return [
      { op: ">=", version: v },
      { op: "<", version: caretUpperBound(v) },
    ];
  }
  if (token.startsWith("~")) {
    const v = parseTokenVersion(token.slice(1), original);
    return [
      { op: ">=", version: v },
      {
        op: "<",
        version: { major: v.major, minor: v.minor + 1, patch: 0 },
      },
    ];
  }
  // Bare version → exact match.
  return [{ op: "=", version: parseTokenVersion(token, original) }];
}

function parseTokenVersion(raw: string, originalRange: string): ParsedVersion {
  try {
    return parseVersion(raw);
  } catch {
    throw new InvalidVersionRangeError(
      originalRange,
      `token "${raw}" is not a valid version`,
    );
  }
}

/**
 * npm-style caret upper bound:
 *   ^1.2.3 → <2.0.0
 *   ^0.2.3 → <0.3.0
 *   ^0.0.3 → <0.0.4
 *
 * This matches `npm install ^x.y.z` behavior — lock to the left-most
 * non-zero segment.
 */
function caretUpperBound(v: ParsedVersion): ParsedVersion {
  if (v.major !== 0) return { major: v.major + 1, minor: 0, patch: 0 };
  if (v.minor !== 0) return { major: 0, minor: v.minor + 1, patch: 0 };
  return { major: 0, minor: 0, patch: v.patch + 1 };
}

// ────────────────────────────────────────────────────────────────────────
// Comparison
// ────────────────────────────────────────────────────────────────────────

/** -1 if a<b, 0 if equal, 1 if a>b. */
function compareVersions(a: ParsedVersion, b: ParsedVersion): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

function compareClause(v: ParsedVersion, c: Comparator): boolean {
  const cmp = compareVersions(v, c.version);
  switch (c.op) {
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    case "=":
      return cmp === 0;
  }
}
