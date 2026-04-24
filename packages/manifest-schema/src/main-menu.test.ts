import { describe, expect, it } from "vitest";
import {
  MainMenuManifestSchema,
  MenuEntrySchema,
  MenuScreenSchema,
  VisibilityPredicateSchema,
} from "./main-menu.js";

describe("VisibilityPredicateSchema", () => {
  it("accepts 'always' with no argKey", () => {
    const p = VisibilityPredicateSchema.parse({ kind: "always" });
    expect(p.kind).toBe("always");
  });

  it("accepts hasSave / noSave with no argKey", () => {
    expect(VisibilityPredicateSchema.parse({ kind: "hasSave" }).kind).toBe(
      "hasSave",
    );
    expect(VisibilityPredicateSchema.parse({ kind: "noSave" }).kind).toBe(
      "noSave",
    );
  });

  it("requires argKey for platform/featureFlag/hasDlc/custom", () => {
    for (const kind of [
      "platform",
      "featureFlag",
      "hasDlc",
      "custom",
    ] as const) {
      expect(() => VisibilityPredicateSchema.parse({ kind })).toThrow(/argKey/);
    }
  });
});

describe("MenuEntrySchema", () => {
  it("accepts startNewGame without submenuId", () => {
    const e = MenuEntrySchema.parse({
      id: "new",
      labelLocalizationKey: "menu.new",
    });
    expect(e.action).toBe("startNewGame");
  });

  it("rejects openSubmenu without submenuId", () => {
    expect(() =>
      MenuEntrySchema.parse({
        id: "opts",
        labelLocalizationKey: "menu.opts",
        action: "openSubmenu",
      }),
    ).toThrow(/submenuId/);
  });

  it("rejects openUrl without actionKey", () => {
    expect(() =>
      MenuEntrySchema.parse({
        id: "url",
        labelLocalizationKey: "menu.url",
        action: "openUrl",
      }),
    ).toThrow(/actionKey/);
  });

  it("accepts openUrl with actionKey", () => {
    const e = MenuEntrySchema.parse({
      id: "url",
      labelLocalizationKey: "menu.url",
      action: "openUrl",
      actionKey: "socialTwitter",
    });
    expect(e.actionKey).toBe("socialTwitter");
  });
});

describe("MenuScreenSchema", () => {
  it("accepts empty menu", () => {
    const s = MenuScreenSchema.parse({ id: "root" });
    expect(s.entries).toEqual([]);
  });

  it("rejects duplicate entry ids in a menu", () => {
    const e = { id: "x", labelLocalizationKey: "l" };
    expect(() =>
      MenuScreenSchema.parse({ id: "root", entries: [e, e] }),
    ).toThrow(/unique/);
  });
});

describe("MainMenuManifestSchema", () => {
  const menu = { id: "root", entries: [] };

  it("accepts disabled empty manifest", () => {
    const m = MainMenuManifestSchema.parse({ enabled: false });
    expect(m.menus).toEqual([]);
  });

  it("requires rootMenuId when enabled", () => {
    expect(() =>
      MainMenuManifestSchema.parse({ enabled: true, menus: [menu] }),
    ).toThrow(/rootMenuId/);
  });

  it("requires menus when enabled", () => {
    expect(() =>
      MainMenuManifestSchema.parse({ enabled: true, rootMenuId: "root" }),
    ).toThrow();
  });

  it("rejects rootMenuId pointing at undefined menu", () => {
    expect(() =>
      MainMenuManifestSchema.parse({
        menus: [menu],
        rootMenuId: "missing",
      }),
    ).toThrow(/rootMenuId/);
  });

  it("rejects duplicate menu ids", () => {
    expect(() => MainMenuManifestSchema.parse({ menus: [menu, menu] })).toThrow(
      /unique/,
    );
  });

  it("rejects openSubmenu entry pointing at undefined menu", () => {
    expect(() =>
      MainMenuManifestSchema.parse({
        menus: [
          {
            id: "root",
            entries: [
              {
                id: "opts",
                labelLocalizationKey: "menu.opts",
                action: "openSubmenu",
                submenuId: "missing",
              },
            ],
          },
        ],
        rootMenuId: "root",
      }),
    ).toThrow(/openSubmenu/);
  });

  it("accepts valid openSubmenu wiring", () => {
    const m = MainMenuManifestSchema.parse({
      menus: [
        {
          id: "root",
          entries: [
            {
              id: "opts",
              labelLocalizationKey: "menu.opts",
              action: "openSubmenu",
              submenuId: "options",
            },
          ],
        },
        { id: "options", entries: [] },
      ],
      rootMenuId: "root",
    });
    expect(m.menus).toHaveLength(2);
  });
});
