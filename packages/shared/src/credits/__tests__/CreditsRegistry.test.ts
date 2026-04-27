import { CreditsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  CreditsNotLoadedError,
  CreditsRegistry,
  UnknownCreditSectionError,
} from "../CreditsRegistry.js";

function manifest() {
  return CreditsManifestSchema.parse({
    enabled: true,
    sections: [
      {
        id: "engineering",
        titleLocalizationKey: "credits.engineering",
        displayOrder: 10,
        entries: [
          {
            id: "lead",
            kind: "person",
            primaryLocalizationKey: "credits.alice.name",
            secondaryLocalizationKey: "credits.alice.role",
            verticalSpacingMultiplier: 1,
          },
          {
            id: "specialThanks",
            kind: "thanks",
            primaryLocalizationKey: "credits.thanks",
            verticalSpacingMultiplier: 2,
          },
        ],
      },
      {
        id: "art",
        titleLocalizationKey: "credits.art",
        displayOrder: 20,
        entries: [
          {
            id: "director",
            kind: "person",
            primaryLocalizationKey: "credits.bob.name",
            secondaryLocalizationKey: "credits.bob.role",
          },
        ],
      },
    ],
    scroll: { scrollSpeedPxPerSec: 100 },
  });
}

describe("CreditsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new CreditsRegistry().manifest).toThrow(CreditsNotLoadedError);
  });
});

describe("CreditsRegistry — lookup", () => {
  it("indexes sections", () => {
    const r = new CreditsRegistry(manifest());
    expect(r.has("art")).toBe(true);
    expect(r.section("engineering").entries.length).toBe(2);
  });

  it("throws on unknown section", () => {
    const r = new CreditsRegistry(manifest());
    expect(() => r.section("ghost")).toThrow(UnknownCreditSectionError);
  });

  it("orderedSections sorts by displayOrder", () => {
    const r = new CreditsRegistry(manifest());
    expect(r.orderedSections().map((s) => s.id)).toEqual([
      "engineering",
      "art",
    ]);
  });
});

describe("CreditsRegistry — timeline", () => {
  it("flattens entries with owning section id", () => {
    const r = new CreditsRegistry(manifest());
    expect(r.timeline().map((t) => t.entry.id)).toEqual([
      "lead",
      "specialThanks",
      "director",
    ]);
  });

  it("estimated duration scales with spacing", () => {
    const r = new CreditsRegistry(manifest());
    // 40 * (1 + 2 + 1) = 160px; 160 / 100 = 1.6s
    expect(r.estimatedDurationSec()).toBeCloseTo(1.6, 5);
  });
});

describe("CreditsRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new CreditsRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new CreditsRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new CreditsRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
