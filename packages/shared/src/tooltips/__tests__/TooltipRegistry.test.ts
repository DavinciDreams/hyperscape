import { TooltipsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { TooltipRegistry, UnknownTooltipError } from "../TooltipRegistry.js";

function manifest(
  overrides: Partial<{
    enabled: boolean;
    respectReducedMotionPreference: boolean;
    defaultShowDelayMs: number;
  }> = {},
) {
  return TooltipsManifestSchema.parse({
    enabled: overrides.enabled ?? true,
    respectReducedMotionPreference:
      overrides.respectReducedMotionPreference ?? true,
    defaultShowDelayMs: overrides.defaultShowDelayMs ?? 250,
    entries: [
      {
        id: "inv.iron.sword",
        bodyLocalizationKey: "tooltip.inv.iron.sword.body",
      },
      {
        id: "hotbar.attack",
        titleLocalizationKey: "tooltip.hotbar.attack.title",
        bodyLocalizationKey: "tooltip.hotbar.attack.body",
        trigger: "focus",
        showDelayMs: 50,
        maxShowsPerPlayer: 3,
      },
      {
        id: "reduced-motion-test",
        bodyLocalizationKey: "t.rm",
        trigger: "hover",
      },
      {
        id: "focus-kind",
        bodyLocalizationKey: "t.focus",
        trigger: "focus",
      },
    ],
  });
}

describe("TooltipRegistry", () => {
  it("indexes entries by id", () => {
    const reg = new TooltipRegistry(manifest());
    expect(reg.size).toBe(4);
    expect(reg.has("inv.iron.sword")).toBe(true);
    expect(reg.ids).toContain("hotbar.attack");
  });

  it("get throws UnknownTooltipError on miss", () => {
    const reg = new TooltipRegistry(manifest());
    expect(() => reg.get("ghost")).toThrow(UnknownTooltipError);
  });

  it("loadFromJson validates", () => {
    const reg = new TooltipRegistry();
    reg.loadFromJson({ entries: [] });
    expect(reg.size).toBe(0);
  });
});

describe("TooltipRegistry — resolve", () => {
  it("falls back to manifest defaults for author-unchanged fields", () => {
    const reg = new TooltipRegistry(manifest({ defaultShowDelayMs: 250 }));
    const r = reg.resolve("inv.iron.sword");
    expect(r).not.toBeNull();
    // schema default for showDelayMs is 400; author didn't override →
    // manifest default (250) applies
    expect(r!.showDelayMs).toBe(250);
  });

  it("entry-level override wins over manifest default", () => {
    const reg = new TooltipRegistry(manifest({ defaultShowDelayMs: 250 }));
    const r = reg.resolve("hotbar.attack");
    expect(r!.showDelayMs).toBe(50);
  });

  it("returns null when manifest.enabled is false", () => {
    const reg = new TooltipRegistry(manifest({ enabled: false }));
    expect(reg.resolve("inv.iron.sword")).toBeNull();
  });

  it("returns null when seenCount >= maxShowsPerPlayer", () => {
    const reg = new TooltipRegistry(manifest());
    expect(reg.resolve("hotbar.attack", { seenCount: 3 })).toBeNull();
    expect(reg.resolve("hotbar.attack", { seenCount: 2 })).not.toBeNull();
  });

  it("ignores seenCount when maxShowsPerPlayer=0 (unlimited)", () => {
    const reg = new TooltipRegistry(manifest());
    expect(
      reg.resolve("inv.iron.sword", { seenCount: 1_000_000 }),
    ).not.toBeNull();
  });

  it("suppresses hover tooltip on reduced-motion when manifest respects it", () => {
    const reg = new TooltipRegistry(manifest());
    expect(
      reg.resolve("reduced-motion-test", { reducedMotion: true }),
    ).toBeNull();
  });

  it("still shows focus tooltip on reduced-motion", () => {
    const reg = new TooltipRegistry(manifest());
    expect(reg.resolve("focus-kind", { reducedMotion: true })).not.toBeNull();
  });

  it("ignores reduced-motion when manifest doesn't respect it", () => {
    const reg = new TooltipRegistry(
      manifest({ respectReducedMotionPreference: false }),
    );
    expect(
      reg.resolve("reduced-motion-test", { reducedMotion: true }),
    ).not.toBeNull();
  });

  it("rejects negative/NaN seenCount", () => {
    const reg = new TooltipRegistry(manifest());
    expect(() => reg.resolve("inv.iron.sword", { seenCount: -1 })).toThrow(
      TypeError,
    );
    expect(() =>
      reg.resolve("inv.iron.sword", { seenCount: Number.NaN }),
    ).toThrow(TypeError);
  });

  it("throws UnknownTooltipError on miss via resolve", () => {
    const reg = new TooltipRegistry(manifest());
    expect(() => reg.resolve("ghost")).toThrow(UnknownTooltipError);
  });

  it("throws when resolve called before load", () => {
    const reg = new TooltipRegistry();
    expect(() => reg.resolve("anything")).toThrow(UnknownTooltipError);
  });
});
