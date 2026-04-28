import { describe, expect, it } from "vitest";
import {
  camelize,
  emitDefaultPropsBody,
  emitDestructureList,
  emitLiteral,
  emitPropsSchemaBody,
  emitZodField,
} from "./emit";
import type { WidgetSpec } from "./types";

describe("camelize", () => {
  it("lowercases the first letter", () => {
    expect(camelize("FooBar")).toBe("fooBar");
    expect(camelize("Avatar")).toBe("avatar");
  });

  it("returns empty string for empty input", () => {
    expect(camelize("")).toBe("");
  });
});

describe("emitLiteral", () => {
  it("encodes strings as JSON", () => {
    expect(emitLiteral("hello")).toBe('"hello"');
    expect(emitLiteral('quote " in')).toBe('"quote \\" in"');
  });

  it("encodes numbers as bare digits", () => {
    expect(emitLiteral(42)).toBe("42");
    expect(emitLiteral(3.14)).toBe("3.14");
  });

  it("encodes booleans as keywords", () => {
    expect(emitLiteral(true)).toBe("true");
    expect(emitLiteral(false)).toBe("false");
  });
});

describe("emitZodField", () => {
  it("emits string with default", () => {
    expect(
      emitZodField({ name: "label", type: "string", defaultValue: "hi" }),
    ).toBe('z.string().default("hi")');
  });

  it("emits number with default", () => {
    expect(
      emitZodField({ name: "count", type: "number", defaultValue: 7 }),
    ).toBe("z.number().default(7)");
  });

  it("emits boolean with default", () => {
    expect(
      emitZodField({ name: "active", type: "boolean", defaultValue: true }),
    ).toBe("z.boolean().default(true)");
  });

  it("emits enum with literal array + default", () => {
    expect(
      emitZodField({
        name: "size",
        type: "enum",
        enumValues: ["small", "medium", "large"],
        defaultValue: "medium",
      }),
    ).toBe('z.enum(["small", "medium", "large"]).default("medium")');
  });

  it("appends .describe(...) when description is present", () => {
    expect(
      emitZodField({
        name: "label",
        type: "string",
        defaultValue: "",
        description: "Plain text",
      }),
    ).toBe('z.string().default("").describe("Plain text")');
  });

  it("omits .describe when description is empty string", () => {
    expect(
      emitZodField({
        name: "label",
        type: "string",
        defaultValue: "",
        description: "",
      }),
    ).toBe('z.string().default("")');
  });
});

const fixture: WidgetSpec = {
  name: "FooBar",
  manifestId: "com.acme.demo.foo-bar",
  category: "panel",
  defaultSize: { width: 4, height: 3 },
  props: [
    { name: "label", type: "string", defaultValue: "Hi" },
    { name: "count", type: "number", defaultValue: 0 },
    { name: "active", type: "boolean", defaultValue: false },
  ],
};

describe("emitPropsSchemaBody", () => {
  it("emits one line per prop, indented two spaces", () => {
    const body = emitPropsSchemaBody(fixture);
    expect(body).toContain('  label: z.string().default("Hi"),');
    expect(body).toContain("  count: z.number().default(0),");
    expect(body).toContain("  active: z.boolean().default(false),");
  });

  it("emits JSDoc above props with description", () => {
    const body = emitPropsSchemaBody({
      ...fixture,
      props: [
        {
          name: "label",
          type: "string",
          defaultValue: "",
          description: "Visible text",
        },
      ],
    });
    expect(body.split("\n")[0]).toBe("  /** Visible text */");
    expect(body.split("\n")[1]).toContain("label: z.string()");
  });

  it("returns empty string for zero props", () => {
    expect(emitPropsSchemaBody({ ...fixture, props: [] })).toBe("");
  });
});

describe("emitDefaultPropsBody", () => {
  it("emits indented entries one per prop", () => {
    const body = emitDefaultPropsBody(fixture);
    expect(body).toContain('    label: "Hi",');
    expect(body).toContain("    count: 0,");
    expect(body).toContain("    active: false,");
  });

  it("returns empty string for zero props", () => {
    expect(emitDefaultPropsBody({ ...fixture, props: [] })).toBe("");
  });
});

describe("emitDestructureList", () => {
  it("emits { name, ... } for non-empty props", () => {
    expect(emitDestructureList(fixture)).toBe("{ label, count, active }");
  });

  it("emits {} for empty props", () => {
    expect(emitDestructureList({ ...fixture, props: [] })).toBe("{}");
  });
});
