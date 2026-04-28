/**
 * Unit tests for the JSDoc summary extractor.
 */

import { describe, expect, it } from "vitest";

import { extractJsdocSummary } from "./extractJsdocSummary";

describe("extractJsdocSummary", () => {
  it("returns the first line as the summary", () => {
    const src = `/**
 * Single-line summary.
 */
export const x = 1;`;
    expect(extractJsdocSummary(src)).toBe("Single-line summary.");
  });

  it("joins a multi-line summary into one space-separated string", () => {
    const src = `/**
 * Summary spanning
 * multiple lines.
 *
 * Body paragraph that does not appear in the result.
 */
export const x = 1;`;
    expect(extractJsdocSummary(src)).toBe("Summary spanning multiple lines.");
  });

  it("stops at the first blank line", () => {
    const src = `/**
 * Lead line.
 *
 * Detail paragraph.
 */`;
    expect(extractJsdocSummary(src)).toBe("Lead line.");
  });

  it("stops at the first JSDoc tag", () => {
    const src = `/**
 * Lead line.
 * Continued.
 * @param x  Some param.
 */`;
    expect(extractJsdocSummary(src)).toBe("Lead line. Continued.");
  });

  it("handles asterisk-only lines as blank", () => {
    const src = `/**
 * Lead line.
 *
 * Detail.
 */`;
    expect(extractJsdocSummary(src)).toBe("Lead line.");
  });

  it("returns empty string when the file has no leading JSDoc", () => {
    expect(extractJsdocSummary(`export const x = 1;`)).toBe("");
    expect(extractJsdocSummary(`// just a single-line comment`)).toBe("");
    expect(extractJsdocSummary(``)).toBe("");
  });

  it("ignores non-leading JSDoc blocks", () => {
    const src = `import { z } from "zod";
/**
 * This is the second JSDoc block — should NOT be picked up.
 */
export const x = 1;`;
    expect(extractJsdocSummary(src)).toBe("");
  });

  it("tolerates leading whitespace before the comment", () => {
    const src = `\n  \n/**\n * Lead line.\n */`;
    expect(extractJsdocSummary(src)).toBe("Lead line.");
  });

  it("strips stars + spaces uniformly across lines", () => {
    const src = `/**
   * Indented A.
 * Indented B.
*Indented C.
 */`;
    expect(extractJsdocSummary(src)).toBe(
      "Indented A. Indented B. Indented C.",
    );
  });

  it("matches the shape used by the slice-31-80 widget files", () => {
    // Verbatim shape used by KickedOverlayWidget.tsx, etc.
    const src = `/**
 * KickedOverlayWidget — full-screen overlay shown when the player is
 * kicked from the server.
 *
 * Phase D6.c.2 (overlay HUDs) first cut. Pairs with the existing
 * hand-coded \`KickedOverlay\` in client/src/game/hud/overlays/ so
 * hosts that opt into the widget pipeline can drop the hand-coded
 * version once verified pixel-equivalent.
 */
import { defineWidget } from "@hyperforge/ui-framework";`;
    expect(extractJsdocSummary(src)).toBe(
      "KickedOverlayWidget — full-screen overlay shown when the player is kicked from the server.",
    );
  });
});
