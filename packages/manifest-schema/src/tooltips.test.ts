import { describe, expect, it } from "vitest";
import { TooltipEntrySchema, TooltipsManifestSchema } from "./tooltips.js";

describe("TooltipEntrySchema", () => {
  it("accepts a minimal entry", () => {
    const e = TooltipEntrySchema.parse({
      id: "combat.attack",
      bodyLocalizationKey: "tooltip.attack.body",
    });
    expect(e.trigger).toBe("hover");
    expect(e.placement).toBe("auto");
  });

  it("requires bodyLocalizationKey", () => {
    expect(() =>
      TooltipEntrySchema.parse({
        id: "x",
        bodyLocalizationKey: "",
      }),
    ).toThrow();
  });

  it("rejects invalid id casing", () => {
    expect(() =>
      TooltipEntrySchema.parse({
        id: "Combat.Attack",
        bodyLocalizationKey: "k",
      }),
    ).toThrow(/tooltip id/);
  });

  it("accepts dotted ids", () => {
    const e = TooltipEntrySchema.parse({
      id: "combat.attack.primary",
      bodyLocalizationKey: "k",
    });
    expect(e.id).toBe("combat.attack.primary");
  });

  it("rejects showDelayMs above cap", () => {
    expect(() =>
      TooltipEntrySchema.parse({
        id: "x",
        bodyLocalizationKey: "k",
        showDelayMs: 99999,
      }),
    ).toThrow();
  });
});

describe("TooltipsManifestSchema", () => {
  const entry = {
    id: "x",
    bodyLocalizationKey: "k",
  };

  it("accepts empty enabled=false manifest", () => {
    const m = TooltipsManifestSchema.parse({ enabled: false });
    expect(m.entries).toEqual([]);
  });

  it("accepts entries", () => {
    const m = TooltipsManifestSchema.parse({ entries: [entry] });
    expect(m.entries).toHaveLength(1);
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      TooltipsManifestSchema.parse({ entries: [entry, entry] }),
    ).toThrow(/unique/);
  });
});
