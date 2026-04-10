import { describe, it, expect } from "vitest";

/**
 * Tests for pagination parameter parsing logic.
 * Mirrors the logic in world-projects route handler.
 */

function parsePaginationParams(query: { limit?: string; offset?: string }) {
  const limit = query.limit
    ? Math.min(Math.max(parseInt(query.limit) || 50, 1), 100)
    : 50;
  const offset = query.offset ? Math.max(parseInt(query.offset) || 0, 0) : 0;
  return { limit, offset };
}

describe("pagination parameter parsing", () => {
  it("defaults to limit=50, offset=0", () => {
    expect(parsePaginationParams({})).toEqual({ limit: 50, offset: 0 });
  });

  it("parses valid limit and offset", () => {
    expect(parsePaginationParams({ limit: "10", offset: "20" })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it("clamps limit to minimum of 1", () => {
    expect(parsePaginationParams({ limit: "0" })).toEqual({
      limit: 50,
      offset: 0,
    });
    expect(parsePaginationParams({ limit: "-5" })).toEqual({
      limit: 1,
      offset: 0,
    });
  });

  it("clamps limit to maximum of 100", () => {
    expect(parsePaginationParams({ limit: "200" })).toEqual({
      limit: 100,
      offset: 0,
    });
    expect(parsePaginationParams({ limit: "1000" })).toEqual({
      limit: 100,
      offset: 0,
    });
  });

  it("clamps offset to minimum of 0", () => {
    expect(parsePaginationParams({ offset: "-10" })).toEqual({
      limit: 50,
      offset: 0,
    });
  });

  it("handles non-numeric limit gracefully", () => {
    expect(parsePaginationParams({ limit: "abc" })).toEqual({
      limit: 50,
      offset: 0,
    });
  });

  it("handles non-numeric offset gracefully", () => {
    expect(parsePaginationParams({ offset: "xyz" })).toEqual({
      limit: 50,
      offset: 0,
    });
  });

  it("handles float strings (parseInt truncates)", () => {
    expect(parsePaginationParams({ limit: "25.7" })).toEqual({
      limit: 25,
      offset: 0,
    });
  });
});
