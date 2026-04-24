import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BindingExpressionSchema,
  BindingParseError,
  evaluateBinding,
  evaluateParsedBinding,
  parseBindingExpression,
  resolveWidgetProps,
} from "./bindings";

describe("parseBindingExpression", () => {
  it("parses a bare namespace", () => {
    expect(parseBindingExpression("$player")).toEqual({
      namespace: "player",
      steps: [],
    });
  });

  it("parses a dotted chain", () => {
    expect(parseBindingExpression("$player.stats.hp")).toEqual({
      namespace: "player",
      steps: [
        { kind: "prop", key: "stats" },
        { kind: "prop", key: "hp" },
      ],
    });
  });

  it("parses an indexed step", () => {
    expect(parseBindingExpression("$inventory.items[3]")).toEqual({
      namespace: "inventory",
      steps: [
        { kind: "prop", key: "items" },
        { kind: "index", index: 3 },
      ],
    });
  });

  it("parses mixed chains", () => {
    expect(parseBindingExpression("$inventory.items[0].name")).toEqual({
      namespace: "inventory",
      steps: [
        { kind: "prop", key: "items" },
        { kind: "index", index: 0 },
        { kind: "prop", key: "name" },
      ],
    });
  });

  it("allows underscored idents", () => {
    expect(parseBindingExpression("$_ns.prop_1.weird_name")).toEqual({
      namespace: "_ns",
      steps: [
        { kind: "prop", key: "prop_1" },
        { kind: "prop", key: "weird_name" },
      ],
    });
  });

  it("throws on missing leading $", () => {
    expect(() => parseBindingExpression("player.hp")).toThrow(
      BindingParseError,
    );
  });

  it("throws on arithmetic", () => {
    expect(() => parseBindingExpression("$player.hp + 1")).toThrow(
      BindingParseError,
    );
  });

  it("throws on function-call syntax", () => {
    expect(() => parseBindingExpression("$player.items()")).toThrow(
      BindingParseError,
    );
  });

  it("throws on negative indices", () => {
    expect(() => parseBindingExpression("$inventory.items[-1]")).toThrow(
      BindingParseError,
    );
  });

  it("throws on string indices", () => {
    expect(() => parseBindingExpression('$player["hp"]')).toThrow(
      BindingParseError,
    );
  });

  it("throws on an empty expression", () => {
    expect(() => parseBindingExpression("")).toThrow(BindingParseError);
  });
});

describe("BindingExpressionSchema", () => {
  it("accepts valid expressions", () => {
    expect(BindingExpressionSchema.safeParse("$player.hp").success).toBe(true);
    expect(
      BindingExpressionSchema.safeParse("$inventory.items[0].count").success,
    ).toBe(true);
  });

  it("rejects invalid expressions", () => {
    expect(BindingExpressionSchema.safeParse("player.hp").success).toBe(false);
    expect(BindingExpressionSchema.safeParse(42).success).toBe(false);
  });
});

describe("evaluateParsedBinding", () => {
  const ctx = {
    player: {
      hp: 7,
      maxHp: 10,
      stats: { atk: 50 },
    },
    inventory: {
      items: [
        { id: "sword", count: 1 },
        { id: "shield", count: 2 },
      ],
    },
  };

  it("resolves a bare namespace", () => {
    expect(evaluateParsedBinding(parseBindingExpression("$player"), ctx)).toBe(
      ctx.player,
    );
  });

  it("resolves a dotted chain", () => {
    expect(
      evaluateParsedBinding(parseBindingExpression("$player.stats.atk"), ctx),
    ).toBe(50);
  });

  it("resolves an indexed + dotted chain", () => {
    expect(
      evaluateParsedBinding(
        parseBindingExpression("$inventory.items[1].id"),
        ctx,
      ),
    ).toBe("shield");
  });

  it("returns undefined when the namespace is missing", () => {
    expect(
      evaluateParsedBinding(parseBindingExpression("$ghost.anything"), ctx),
    ).toBeUndefined();
  });

  it("returns undefined when a prop step hits a non-object", () => {
    expect(
      evaluateParsedBinding(parseBindingExpression("$player.hp.nope"), ctx),
    ).toBeUndefined();
  });

  it("returns undefined when an index step hits a non-array", () => {
    expect(
      evaluateParsedBinding(parseBindingExpression("$player[0]"), ctx),
    ).toBeUndefined();
  });

  it("returns undefined when an index is out of bounds", () => {
    expect(
      evaluateParsedBinding(
        parseBindingExpression("$inventory.items[99].id"),
        ctx,
      ),
    ).toBeUndefined();
  });

  it("short-circuits cleanly through null", () => {
    expect(
      evaluateParsedBinding(parseBindingExpression("$nil.deep.path"), {
        nil: null,
      }),
    ).toBeUndefined();
  });
});

describe("evaluateBinding (convenience wrapper)", () => {
  it("parses and evaluates in one call", () => {
    expect(evaluateBinding("$x.y", { x: { y: 42 } })).toBe(42);
  });

  it("throws BindingParseError on malformed input", () => {
    expect(() => evaluateBinding("nope", {})).toThrow(BindingParseError);
  });
});

// ── resolveWidgetProps ─────────────────────────────────────────────

const HpProps = z.object({
  current: z.number().int().nonnegative(),
  max: z.number().int().positive(),
  label: z.string().optional(),
});
type HpProps = z.infer<typeof HpProps>;

describe("resolveWidgetProps", () => {
  it("returns ok for a purely static, valid props object", () => {
    const result = resolveWidgetProps<HpProps>(
      { current: 5, max: 10, label: "HP" },
      undefined,
      HpProps,
      {},
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.props).toEqual({ current: 5, max: 10, label: "HP" });
      expect(result.issues).toEqual([]);
    }
  });

  it("merges bound values on top of static props", () => {
    const result = resolveWidgetProps<HpProps>(
      { current: 0, max: 10 },
      { current: "$player.hp" },
      HpProps,
      { player: { hp: 7 } },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.props.current).toBe(7);
      expect(result.props.max).toBe(10);
      expect(result.issues).toEqual([]);
    }
  });

  it("reports invalid binding expressions without blowing up", () => {
    const result = resolveWidgetProps<HpProps>(
      { current: 5, max: 10 },
      { current: "totally bogus" },
      HpProps,
      {},
    );
    // Static fallback satisfies the schema, so the overall resolution succeeds
    // with a non-fatal warning.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.props.current).toBe(5);
      expect(result.issues.some((i) => i.code === "invalid-expression")).toBe(
        true,
      );
    }
  });

  it("reports binding-failed when an expression resolves to undefined", () => {
    const result = resolveWidgetProps<HpProps>(
      { current: 5, max: 10 },
      { current: "$player.missing" },
      HpProps,
      { player: {} },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.props.current).toBe(5); // static fallback
      expect(result.issues.some((i) => i.code === "binding-failed")).toBe(true);
    }
  });

  it("fails when the final merged object violates the Zod schema", () => {
    const result = resolveWidgetProps<HpProps>(
      { max: 10 }, // `current` missing
      {},
      HpProps,
      {},
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) => i.code === "props-validation-failed"),
      ).toBe(true);
    }
  });

  it("fails when a bound expression overwrites a valid static value with the wrong type", () => {
    const result = resolveWidgetProps<HpProps>(
      { current: 5, max: 10 },
      { current: "$player.name" },
      HpProps,
      { player: { name: "Alice" } }, // string, not a number
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) => i.code === "props-validation-failed"),
      ).toBe(true);
    }
  });
});
