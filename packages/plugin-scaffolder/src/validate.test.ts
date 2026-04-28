import { describe, expect, it } from "vitest";
import { assertWidgetSpec, validateWidgetSpec } from "./validate";
import type { WidgetSpec } from "./types";

const baseSpec: WidgetSpec = {
  name: "FooBar",
  manifestId: "com.acme.demo.foo-bar",
  category: "panel",
  defaultSize: { width: 4, height: 3 },
  props: [
    { name: "label", type: "string", defaultValue: "" },
    { name: "count", type: "number", defaultValue: 0 },
  ],
};

describe("validateWidgetSpec", () => {
  it("accepts a well-formed spec", () => {
    const r = validateWidgetSpec(baseSpec);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("rejects non-PascalCase name", () => {
    const r = validateWidgetSpec({ ...baseSpec, name: "fooBar" });
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.path === "name")).toBeTruthy();
  });

  it("rejects bad manifest id", () => {
    const r = validateWidgetSpec({ ...baseSpec, manifestId: "FooBar" });
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.path === "manifestId")).toBeTruthy();
  });

  it("rejects non-positive dimensions", () => {
    const r = validateWidgetSpec({
      ...baseSpec,
      defaultSize: { width: 0, height: -1 },
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.path === "defaultSize.width")).toBe(true);
    expect(r.issues.some((i) => i.path === "defaultSize.height")).toBe(true);
  });

  it("rejects mismatched default value type — string prop, number default", () => {
    const r = validateWidgetSpec({
      ...baseSpec,
      props: [
        { name: "label", type: "string", defaultValue: 5 as unknown as string },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.path === "props[0].defaultValue")).toBe(true);
  });

  it("rejects enum prop with default not in values", () => {
    const r = validateWidgetSpec({
      ...baseSpec,
      props: [
        {
          name: "size",
          type: "enum",
          enumValues: ["small", "medium", "large"],
          defaultValue: "huge",
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.path === "props[0].defaultValue")).toBe(true);
  });

  it("rejects enum prop with empty values", () => {
    const r = validateWidgetSpec({
      ...baseSpec,
      props: [
        {
          name: "size",
          type: "enum",
          enumValues: [],
          defaultValue: "small",
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.path === "props[0].enumValues")).toBe(true);
  });

  it("rejects duplicate prop names", () => {
    const r = validateWidgetSpec({
      ...baseSpec,
      props: [
        { name: "x", type: "number", defaultValue: 1 },
        { name: "x", type: "number", defaultValue: 2 },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.path === "props[1].name")).toBe(true);
  });

  it("accepts zero props", () => {
    const r = validateWidgetSpec({ ...baseSpec, props: [] });
    expect(r.ok).toBe(true);
  });

  it("collects multiple issues at once", () => {
    const r = validateWidgetSpec({
      name: "lower",
      manifestId: "BadId",
      category: "panel",
      defaultSize: { width: 4, height: 4 },
      props: [],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThanOrEqual(2);
  });
});

describe("assertWidgetSpec", () => {
  it("returns silently for a valid spec", () => {
    expect(() => assertWidgetSpec(baseSpec)).not.toThrow();
  });

  it("throws with all issues bundled in the message", () => {
    expect(() =>
      assertWidgetSpec({ ...baseSpec, name: "lower", manifestId: "Bad" }),
    ).toThrow(/Invalid WidgetSpec/);
  });
});
