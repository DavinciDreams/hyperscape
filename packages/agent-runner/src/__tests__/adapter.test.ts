import { describe, expect, it } from "vitest";
import type { Action } from "@elizaos/core";
import { actionToAnthropicTool, actionsToAnthropicTools } from "../adapter.js";

const sampleAction: Action = {
  name: "DEMO_ACTION",
  description: "A demo action used for unit tests.",
  parameters: [
    {
      name: "category",
      description: "Optional filter.",
      required: false,
      schema: {
        type: "string",
        enum: ["panel", "hud", "overlay"],
      },
    },
    {
      name: "id",
      description: "Required widget id.",
      required: true,
      schema: { type: "string" },
    },
  ],
  validate: async () => true,
  handler: async () => ({ success: true }),
};

describe("actionToAnthropicTool", () => {
  it("maps name, description, and parameters into Tool shape", () => {
    const tool = actionToAnthropicTool(sampleAction);
    expect(tool.name).toBe("DEMO_ACTION");
    expect(tool.description).toBe("A demo action used for unit tests.");
    expect(tool.input_schema.type).toBe("object");
  });

  it("emits properties for each parameter", () => {
    const tool = actionToAnthropicTool(sampleAction);
    const props = tool.input_schema.properties as Record<string, unknown>;
    expect(props).toHaveProperty("category");
    expect(props).toHaveProperty("id");
  });

  it("emits required[] only for required params", () => {
    const tool = actionToAnthropicTool(sampleAction);
    const required = (tool.input_schema as { required?: string[] }).required;
    expect(required).toEqual(["id"]);
  });

  it("forwards enum values to JSON Schema", () => {
    const tool = actionToAnthropicTool(sampleAction);
    const props = tool.input_schema.properties as Record<
      string,
      { enum?: string[] }
    >;
    expect(props.category!.enum).toEqual(["panel", "hud", "overlay"]);
  });

  it("includes parameter description in property", () => {
    const tool = actionToAnthropicTool(sampleAction);
    const props = tool.input_schema.properties as Record<
      string,
      { description?: string }
    >;
    expect(props.id!.description).toBe("Required widget id.");
  });

  it("handles actions with no parameters", () => {
    const noParams: Action = {
      ...sampleAction,
      parameters: [],
    };
    const tool = actionToAnthropicTool(noParams);
    expect(tool.input_schema.properties).toEqual({});
    expect(
      (tool.input_schema as { required?: string[] }).required,
    ).toBeUndefined();
  });

  it("handles object-type schemas with nested properties", () => {
    const objectAction: Action = {
      name: "NESTED",
      description: "Has a nested object param.",
      parameters: [
        {
          name: "spec",
          description: "Nested object.",
          required: true,
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              count: { type: "number" },
            },
          },
        },
      ],
      validate: async () => true,
      handler: async () => ({ success: true }),
    };
    const tool = actionToAnthropicTool(objectAction);
    const spec = (
      tool.input_schema.properties as Record<
        string,
        { properties?: Record<string, { type: string }> }
      >
    ).spec;
    expect(spec.properties).toBeDefined();
    expect(spec.properties!.name!.type).toBe("string");
    expect(spec.properties!.count!.type).toBe("number");
  });
});

describe("actionsToAnthropicTools", () => {
  it("preserves order", () => {
    const a: Action = { ...sampleAction, name: "A" };
    const b: Action = { ...sampleAction, name: "B" };
    const c: Action = { ...sampleAction, name: "C" };
    const tools = actionsToAnthropicTools([a, b, c]);
    expect(tools.map((t) => t.name)).toEqual(["A", "B", "C"]);
  });

  it("returns empty array for empty input", () => {
    expect(actionsToAnthropicTools([])).toEqual([]);
  });
});
