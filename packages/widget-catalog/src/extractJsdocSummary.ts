/**
 * Pure JSDoc summary extractor.
 *
 * Given the text of a TypeScript file, return the **summary
 * paragraph** of the leading file-level JSDoc block — the lines
 * before the first blank line inside the comment.
 *
 * Why a regex helper instead of the TypeScript compiler API:
 *   - The build artifact only needs the *first paragraph* of the
 *     file-level docstring as a one-line-ish summary. Full AST
 *     parsing is overkill.
 *   - This helper has zero runtime deps so it can ship in
 *     `@hyperforge/widget-catalog` (a leaf package) without pulling
 *     in `typescript`.
 *   - The format is stable across the codebase: every widget file
 *     starts with a `/**` block whose first line is the widget's
 *     summary. The 50-widget arc in slices 31-80 follows this
 *     convention exactly.
 */

/**
 * Extract the summary paragraph of the leading file-level JSDoc
 * block. Returns `""` when no leading block exists.
 *
 *   /** First line.                                  →  "First line."
 *    * Second line.
 *    *
 *    * Body paragraph.
 *    *\/
 *
 *   /** Summary spanning                              →  "Summary spanning multiple lines."
 *    * multiple lines.
 *    *
 *    * Detail paragraph.
 *    *\/
 *
 * Behavior:
 *   - Whitespace before the comment is allowed.
 *   - The summary ends at the first **blank** line inside the
 *     block (a line whose stripped contents are empty).
 *   - Each comment line's leading `* ` (or `*` alone) is stripped.
 *   - Multiple non-blank lines are joined with a single space.
 *   - Leading/trailing whitespace on the result is trimmed.
 */
export function extractJsdocSummary(source: string): string {
  // Match the first `/**` ... `*\/` block at the top of the file
  // (allowing leading whitespace / newlines). Single-line `/* ... */`
  // and `//` comments are intentionally not picked up.
  const match = source.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (!match) return "";
  const body = match[1] ?? "";
  const lines = body.split(/\r?\n/);
  const summary: string[] = [];
  for (const rawLine of lines) {
    const stripped = stripJsdocLine(rawLine);
    // The first JSDoc line often starts as `/** First line.` —
    // after splitting on newline, the source's leading "/**" is
    // already consumed by the outer regex, so this branch is
    // mostly defensive.
    if (stripped.startsWith("/**")) {
      const remainder = stripped.slice(3).trim();
      if (remainder.length > 0) summary.push(remainder);
      continue;
    }
    if (stripped.length === 0) {
      // Blank line inside the block ends the summary paragraph.
      // Skip leading blanks (the line right after `/**`).
      if (summary.length > 0) break;
      continue;
    }
    // Stop when we hit a JSDoc tag — the summary doesn't extend
    // into `@param` / `@returns` / etc.
    if (stripped.startsWith("@")) break;
    summary.push(stripped);
  }
  return summary.join(" ").trim();
}

/**
 * Strip a single line's leading `*` (with optional spaces around)
 * so the helper can read the comment body without the column of
 * asterisks.
 *
 *   "   * hello world"  →  "hello world"
 *   "*   bullet"        →  "bullet"
 *   ""                  →  ""
 */
function stripJsdocLine(line: string): string {
  // Leading whitespace is unconditional. After that we may have a
  // single `*` followed by an optional space; preserve everything
  // after.
  const trimmedLeading = line.replace(/^\s+/, "");
  if (trimmedLeading.startsWith("* ")) return trimmedLeading.slice(2).trim();
  if (trimmedLeading === "*") return "";
  if (trimmedLeading.startsWith("*")) return trimmedLeading.slice(1).trim();
  return trimmedLeading.trim();
}
