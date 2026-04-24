import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BUILTIN_WIDGETS,
  actionBarWidget,
  chatWidget,
  hpBarWidget,
  inventoryWidget,
  minimapWidget,
  tooltipWidget,
} from "./builtins";
import {
  inspectWidgetProps,
  introspectPropsSchema,
  type UIPropField,
} from "./inspect";

const fieldByKey = (fields: UIPropField[], key: string): UIPropField => {
  const f = fields.find((f) => f.key === key);
  if (!f) throw new Error(`No field for key ${key}`);
  return f;
};

describe("introspectPropsSchema", () => {
  it("emits boolean / number / text / enum fields", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean(),
      color: z.enum(["red", "green", "blue"]),
    });
    const fields = introspectPropsSchema(schema);
    expect(fieldByKey(fields, "name").type).toBe("text");
    expect(fieldByKey(fields, "age").type).toBe("number");
    expect(fieldByKey(fields, "active").type).toBe("boolean");
    expect(fieldByKey(fields, "color").type).toBe("enum");
    expect(fieldByKey(fields, "color").options).toEqual([
      "red",
      "green",
      "blue",
    ]);
  });

  it("promotes bounded numbers to sliders by default", () => {
    const schema = z.object({
      volume: z.number().min(0).max(100),
    });
    const fields = introspectPropsSchema(schema);
    expect(fieldByKey(fields, "volume").type).toBe("slider");
    expect(fieldByKey(fields, "volume").min).toBe(0);
    expect(fieldByKey(fields, "volume").max).toBe(100);
  });

  it("keeps bounded numbers as number when useSliderWhenBounded=false", () => {
    const schema = z.object({ volume: z.number().min(0).max(100) });
    const fields = introspectPropsSchema(schema, {
      useSliderWhenBounded: false,
    });
    expect(fieldByKey(fields, "volume").type).toBe("number");
  });

  it("marks integer numbers", () => {
    const schema = z.object({
      count: z.number().int(),
    });
    const fields = introspectPropsSchema(schema);
    const f = fieldByKey(fields, "count");
    expect(f.type).toBe("integer");
    expect(f.integer).toBe(true);
  });

  it("includes required flag based on schema.required", () => {
    const schema = z.object({
      a: z.string(),
      b: z.string().optional(),
    });
    const fields = introspectPropsSchema(schema);
    expect(fieldByKey(fields, "a").required).toBe(true);
    expect(fieldByKey(fields, "b").required).toBe(false);
  });

  it("humanizes camelCase and snake_case keys", () => {
    const schema = z.object({
      showNumeric: z.boolean(),
      base_radius: z.number(),
    });
    const fields = introspectPropsSchema(schema);
    expect(fieldByKey(fields, "showNumeric").label).toBe("Show Numeric");
    expect(fieldByKey(fields, "base_radius").label).toBe("Base Radius");
  });

  it("honors labelOverrides", () => {
    const schema = z.object({ x: z.string() });
    const fields = introspectPropsSchema(schema, {
      labelOverrides: { x: "Custom Label" },
    });
    expect(fieldByKey(fields, "x").label).toBe("Custom Label");
  });

  it("returns an empty array for non-object root schemas", () => {
    // Cast because introspectPropsSchema's signature enforces record
    // shape; this probes the runtime fallback.
    const fields = introspectPropsSchema(
      z.number() as unknown as z.ZodType<Record<string, unknown>>,
    );
    expect(fields).toEqual([]);
  });

  it("emits json-fallback for nested objects", () => {
    const schema = z.object({
      nested: z.object({ a: z.number() }),
    });
    const fields = introspectPropsSchema(schema);
    expect(fieldByKey(fields, "nested").type).toBe("json");
  });

  it("emits json-fallback for array props", () => {
    const schema = z.object({
      tags: z.array(z.string()),
    });
    const fields = introspectPropsSchema(schema);
    expect(fieldByKey(fields, "tags").type).toBe("json");
  });

  it("propagates Zod describe() text as the field description", () => {
    const schema = z.object({
      volume: z.number().describe("Master volume, 0..1"),
    });
    const fields = introspectPropsSchema(schema);
    expect(fieldByKey(fields, "volume").description).toBe(
      "Master volume, 0..1",
    );
  });
});

describe("inspectWidgetProps on every builtin", () => {
  it("returns fields for each widget without throwing", () => {
    for (const w of BUILTIN_WIDGETS) {
      const fields = inspectWidgetProps(w);
      expect(Array.isArray(fields)).toBe(true);
      expect(fields.length).toBeGreaterThan(0);
    }
  });

  it("hpBar: orientation is enum, current is number", () => {
    const fields = inspectWidgetProps(hpBarWidget);
    expect(fieldByKey(fields, "orientation").type).toBe("enum");
    expect(fieldByKey(fields, "orientation").options).toEqual([
      "horizontal",
      "vertical",
    ]);
    expect(fieldByKey(fields, "current").type).toBe("number");
  });

  it("minimap: showCompass is boolean, size is number", () => {
    const fields = inspectWidgetProps(minimapWidget);
    expect(fieldByKey(fields, "showCompass").type).toBe("boolean");
    expect(fieldByKey(fields, "size").type).toBe("number");
    expect(fieldByKey(fields, "size").min).toBeUndefined();
  });

  it("inventory: columns and rows are integers", () => {
    const fields = inspectWidgetProps(inventoryWidget);
    expect(fieldByKey(fields, "columns").type).toBe("integer");
    expect(fieldByKey(fields, "rows").type).toBe("integer");
  });

  it("chat: every prop round-trips a stable type", () => {
    const fields = inspectWidgetProps(chatWidget);
    expect(fieldByKey(fields, "bufferSize").type).toBe("integer");
    expect(fieldByKey(fields, "showChannels").type).toBe("boolean");
    expect(fieldByKey(fields, "autoHide").type).toBe("boolean");
    expect(fieldByKey(fields, "autoHideDelaySeconds").type).toBe("number");
  });

  it("tooltip: anchor is enum with two options", () => {
    const fields = inspectWidgetProps(tooltipWidget);
    const anchor = fieldByKey(fields, "anchor");
    expect(anchor.type).toBe("enum");
    expect(anchor.options).toEqual(["cursor", "element"]);
  });

  it("actionBar: slotCount and slotSize are numeric", () => {
    const fields = inspectWidgetProps(actionBarWidget);
    expect(fieldByKey(fields, "slotCount").type).toBe("integer");
    expect(fieldByKey(fields, "slotSize").type).toBe("number");
    expect(fieldByKey(fields, "showKeybindings").type).toBe("boolean");
  });
});
