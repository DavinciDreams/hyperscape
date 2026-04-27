import { MainMenuManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  MainMenuNotLoadedError,
  MainMenuRegistry,
  UnknownMenuScreenError,
} from "../MainMenuRegistry.js";

function manifest() {
  return MainMenuManifestSchema.parse({
    enabled: true,
    rootMenuId: "root",
    menus: [
      {
        id: "root",
        titleLocalizationKey: "menu.root.title",
        showBackButton: false,
        entries: [
          {
            id: "play",
            labelLocalizationKey: "menu.play",
            action: "startNewGame",
            displayOrder: 10,
            visibility: { kind: "noSave" },
          },
          {
            id: "continue",
            labelLocalizationKey: "menu.continue",
            action: "continueGame",
            displayOrder: 5,
            visibility: { kind: "hasSave" },
          },
          {
            id: "options",
            labelLocalizationKey: "menu.options",
            action: "openSubmenu",
            submenuId: "options",
            displayOrder: 20,
          },
          {
            id: "credits",
            labelLocalizationKey: "menu.credits",
            action: "openCredits",
            displayOrder: 30,
            visibility: { kind: "featureFlag", argKey: "creditsEnabled" },
            greyWhenHidden: true,
          },
          {
            id: "dlcBonus",
            labelLocalizationKey: "menu.dlc",
            action: "openScreen",
            actionKey: "dlcScreen",
            displayOrder: 40,
            visibility: { kind: "hasDlc", argKey: "expansion1" },
          },
          {
            id: "iosOnly",
            labelLocalizationKey: "menu.ios",
            action: "custom",
            actionKey: "iosThing",
            displayOrder: 50,
            visibility: { kind: "platform", argKey: "ios" },
          },
          {
            id: "quit",
            labelLocalizationKey: "menu.quit",
            action: "quitGame",
            displayOrder: 100,
          },
        ],
      },
      {
        id: "options",
        titleLocalizationKey: "menu.options.title",
        entries: [
          {
            id: "back",
            labelLocalizationKey: "menu.back",
            action: "custom",
            actionKey: "back",
            displayOrder: 0,
          },
        ],
      },
    ],
  });
}

const baseViewer = {
  hasSave: false,
  platform: "web",
  ownedDlcIds: new Set<string>(),
  enabledFlagIds: new Set<string>(),
};

describe("MainMenuRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new MainMenuRegistry().manifest).toThrow(
      MainMenuNotLoadedError,
    );
  });
});

describe("MainMenuRegistry — lookup", () => {
  it("indexes menus by id", () => {
    const r = new MainMenuRegistry(manifest());
    expect(r.has("root")).toBe(true);
    expect(r.has("options")).toBe(true);
    expect(r.has("ghost")).toBe(false);
    expect(r.get("root").entries.length).toBe(7);
  });

  it("throws UnknownMenuScreenError with availableIds", () => {
    const r = new MainMenuRegistry(manifest());
    try {
      r.get("ghost");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownMenuScreenError);
      expect((err as UnknownMenuScreenError).availableIds).toContain("root");
    }
  });

  it("resolves the root menu", () => {
    const r = new MainMenuRegistry(manifest());
    expect(r.rootMenu().id).toBe("root");
  });

  it("returns submenu for openSubmenu entry", () => {
    const r = new MainMenuRegistry(manifest());
    const entry = r.get("root").entries.find((e) => e.id === "options")!;
    expect(r.submenuFor(entry).id).toBe("options");
  });

  it("throws when submenuFor called on non-openSubmenu entry", () => {
    const r = new MainMenuRegistry(manifest());
    const quit = r.get("root").entries.find((e) => e.id === "quit")!;
    expect(() => r.submenuFor(quit)).toThrow();
  });
});

describe("MainMenuRegistry — evaluatePredicate", () => {
  it("always matches", () => {
    const r = new MainMenuRegistry(manifest());
    expect(
      r.evaluatePredicate({ kind: "always", argKey: "" }, baseViewer),
    ).toBe(true);
  });

  it("hasSave respects viewer", () => {
    const r = new MainMenuRegistry(manifest());
    expect(
      r.evaluatePredicate({ kind: "hasSave", argKey: "" }, baseViewer),
    ).toBe(false);
    expect(
      r.evaluatePredicate(
        { kind: "hasSave", argKey: "" },
        { ...baseViewer, hasSave: true },
      ),
    ).toBe(true);
  });

  it("noSave is inverse of hasSave", () => {
    const r = new MainMenuRegistry(manifest());
    expect(
      r.evaluatePredicate({ kind: "noSave", argKey: "" }, baseViewer),
    ).toBe(true);
  });

  it("hasDlc checks ownedDlcIds", () => {
    const r = new MainMenuRegistry(manifest());
    expect(
      r.evaluatePredicate(
        { kind: "hasDlc", argKey: "expansion1" },
        { ...baseViewer, ownedDlcIds: new Set(["expansion1"]) },
      ),
    ).toBe(true);
    expect(
      r.evaluatePredicate({ kind: "hasDlc", argKey: "expansion1" }, baseViewer),
    ).toBe(false);
  });

  it("platform matches exact id", () => {
    const r = new MainMenuRegistry(manifest());
    expect(
      r.evaluatePredicate({ kind: "platform", argKey: "ios" }, baseViewer),
    ).toBe(false);
    expect(
      r.evaluatePredicate({ kind: "platform", argKey: "web" }, baseViewer),
    ).toBe(true);
  });

  it("featureFlag checks enabledFlagIds", () => {
    const r = new MainMenuRegistry(manifest());
    expect(
      r.evaluatePredicate(
        { kind: "featureFlag", argKey: "beta" },
        { ...baseViewer, enabledFlagIds: new Set(["beta"]) },
      ),
    ).toBe(true);
    expect(
      r.evaluatePredicate({ kind: "featureFlag", argKey: "beta" }, baseViewer),
    ).toBe(false);
  });

  it("custom uses customPredicate resolver (defaults false)", () => {
    const r = new MainMenuRegistry(manifest());
    expect(
      r.evaluatePredicate({ kind: "custom", argKey: "x" }, baseViewer),
    ).toBe(false);
    expect(
      r.evaluatePredicate(
        { kind: "custom", argKey: "x" },
        { ...baseViewer, customPredicate: (k) => k === "x" },
      ),
    ).toBe(true);
  });
});

describe("MainMenuRegistry — visibleEntries", () => {
  it("filters by visibility predicate and sorts by displayOrder", () => {
    const r = new MainMenuRegistry(manifest());
    const entries = r.visibleEntries("root", baseViewer);
    // hasSave 'continue' hidden; hasDlc 'dlcBonus' hidden; platform ios 'iosOnly'
    // hidden; 'credits' greyed kept. 'play' shown.
    expect(entries.map((e) => e.id)).toEqual([
      "play",
      "options",
      "credits",
      "quit",
    ]);
  });

  it("keeps greyWhenHidden entries even when predicate fails", () => {
    const r = new MainMenuRegistry(manifest());
    const entries = r.visibleEntries("root", baseViewer);
    expect(entries.map((e) => e.id)).toContain("credits");
  });

  it("swaps play↔continue when save is present", () => {
    const r = new MainMenuRegistry(manifest());
    const entries = r.visibleEntries("root", {
      ...baseViewer,
      hasSave: true,
    });
    expect(entries.map((e) => e.id)).toEqual([
      "continue",
      "options",
      "credits",
      "quit",
    ]);
  });

  it("includes dlc entry when viewer owns dlc", () => {
    const r = new MainMenuRegistry(manifest());
    const entries = r.visibleEntries("root", {
      ...baseViewer,
      ownedDlcIds: new Set(["expansion1"]),
    });
    expect(entries.map((e) => e.id)).toContain("dlcBonus");
  });

  it("returns ascending-ordered entries", () => {
    const r = new MainMenuRegistry(manifest());
    const entries = r.visibleEntries("root", baseViewer);
    const orders = entries.map((e) => e.displayOrder);
    expect([...orders]).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe("MainMenuRegistry — isEntryVisible", () => {
  it("true for visible entry", () => {
    const r = new MainMenuRegistry(manifest());
    expect(r.isEntryVisible("root", "play", baseViewer)).toBe(true);
  });

  it("false for hidden non-grey entry", () => {
    const r = new MainMenuRegistry(manifest());
    expect(r.isEntryVisible("root", "continue", baseViewer)).toBe(false);
  });

  it("true for greyed hidden entry", () => {
    const r = new MainMenuRegistry(manifest());
    expect(r.isEntryVisible("root", "credits", baseViewer)).toBe(true);
  });

  it("false for unknown entry id", () => {
    const r = new MainMenuRegistry(manifest());
    expect(r.isEntryVisible("root", "ghost", baseViewer)).toBe(false);
  });
});

describe("MainMenuRegistry — loadFromJson", () => {
  it("parses and installs manifest", () => {
    const r = new MainMenuRegistry();
    r.loadFromJson({
      enabled: true,
      rootMenuId: "only",
      menus: [
        {
          id: "only",
          entries: [
            {
              id: "play",
              labelLocalizationKey: "menu.play",
              action: "startNewGame",
            },
          ],
        },
      ],
    });
    expect(r.rootMenu().id).toBe("only");
  });
});

describe("MainMenuRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new MainMenuRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new MainMenuRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new MainMenuRegistry();
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
