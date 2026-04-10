import { describe, it, expect } from "vitest";
import { assertNever } from "@/utils/assertNever";

describe("assertNever", () => {
  it("throws with default message containing the value", () => {
    expect(() => assertNever("bad" as never)).toThrow(
      'Unexpected value: "bad"',
    );
  });

  it("throws with custom message when provided", () => {
    expect(() => assertNever("bad" as never, "Unhandled case")).toThrow(
      "Unhandled case",
    );
  });

  it("handles numeric values", () => {
    expect(() => assertNever(42 as never)).toThrow("Unexpected value: 42");
  });

  it("handles null values", () => {
    expect(() => assertNever(null as never)).toThrow("Unexpected value: null");
  });

  it("handles object values", () => {
    expect(() => assertNever({ x: 1 } as never)).toThrow(
      'Unexpected value: {"x":1}',
    );
  });
});
