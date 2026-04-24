import { describe, expect, it } from "vitest";
import { hpBarWidget, minimapWidget, chatWidget } from "./builtins";
import type { UILayoutManifest } from "./layout";
import {
  DEFAULT_VIEWPORT_BREAKPOINTS,
  applyLayoutVariant,
  classifyViewport,
} from "./variant";

const base: UILayoutManifest = {
  id: "base",
  name: "Base",
  instances: [
    {
      instanceId: "hp",
      widgetId: hpBarWidget.manifest.id,
      position: {
        kind: "anchored",
        anchor: "top-left",
        offset: { x: 0, y: 0 },
      },
      props: {},
      visible: true,
    },
    {
      instanceId: "mini",
      widgetId: minimapWidget.manifest.id,
      position: {
        kind: "anchored",
        anchor: "top-right",
        offset: { x: 0, y: 0 },
      },
      props: {},
      visible: true,
    },
    {
      instanceId: "chat",
      widgetId: chatWidget.manifest.id,
      position: {
        kind: "anchored",
        anchor: "bottom-left",
        offset: { x: 0, y: 0 },
      },
      props: {},
      visible: true,
    },
  ],
};

describe("applyLayoutVariant", () => {
  it("returns base unchanged when viewport is null", () => {
    const out = applyLayoutVariant(base, null);
    expect(out.applied).toBe(false);
    expect(out.manifest).toBe(base);
  });

  it("returns base unchanged when no variants declared", () => {
    const out = applyLayoutVariant(base, "mobile");
    expect(out.applied).toBe(false);
    expect(out.manifest).toBe(base);
  });

  it("returns base unchanged when matching variant is empty", () => {
    const manifest: UILayoutManifest = {
      ...base,
      variants: { mobile: { overrides: [] } },
    };
    const out = applyLayoutVariant(manifest, "mobile");
    expect(out.applied).toBe(false);
    expect(out.manifest.instances).toEqual(base.instances);
  });

  it("applies position override on the selected variant only", () => {
    const manifest: UILayoutManifest = {
      ...base,
      variants: {
        mobile: {
          overrides: [
            {
              instanceId: "hp",
              position: { anchor: "top-center", offsetX: 10, offsetY: 20 },
            },
          ],
        },
        desktop: { overrides: [] },
      },
    };
    const mobile = applyLayoutVariant(manifest, "mobile");
    expect(mobile.applied).toBe(true);
    const hpMobile = mobile.manifest.instances.find(
      (i) => i.instanceId === "hp",
    );
    expect(hpMobile?.position).toMatchObject({
      anchor: "top-center",
      offset: { x: 10, y: 20 },
    });

    // Desktop left alone
    const desktop = applyLayoutVariant(manifest, "desktop");
    expect(desktop.applied).toBe(false);
    const hpDesktop = desktop.manifest.instances.find(
      (i) => i.instanceId === "hp",
    );
    expect(hpDesktop?.position).toMatchObject({
      anchor: "top-left",
      offset: { x: 0, y: 0 },
    });
  });

  it("drops instances when hidden: true", () => {
    const manifest: UILayoutManifest = {
      ...base,
      variants: {
        mobile: {
          overrides: [{ instanceId: "chat", hidden: true }],
        },
      },
    };
    const out = applyLayoutVariant(manifest, "mobile");
    expect(out.applied).toBe(true);
    expect(out.manifest.instances.map((i) => i.instanceId)).toEqual([
      "hp",
      "mini",
    ]);
  });

  it("collects droppedOverrides for unknown instanceIds", () => {
    const manifest: UILayoutManifest = {
      ...base,
      variants: {
        mobile: {
          overrides: [
            { instanceId: "ghost", hidden: true },
            { instanceId: "hp", position: { offsetX: 5 } },
          ],
        },
      },
    };
    const out = applyLayoutVariant(manifest, "mobile");
    expect(out.droppedOverrides).toEqual(["ghost"]);
    expect(out.applied).toBe(true);
  });

  it("overrides grid geometry at the variant level", () => {
    const manifest: UILayoutManifest = {
      ...base,
      grid: { columns: 24, rows: 16 },
      variants: {
        mobile: {
          overrides: [],
          grid: { columns: 8, rows: 12 },
        },
      },
    };
    const out = applyLayoutVariant(manifest, "mobile");
    expect(out.applied).toBe(true);
    expect(out.manifest.grid).toEqual({ columns: 8, rows: 12 });
  });

  it("overrides themeId at the variant level", () => {
    const manifest: UILayoutManifest = {
      ...base,
      themeId: "light",
      variants: {
        mobile: { overrides: [], themeId: "light-mobile" },
      },
    };
    const out = applyLayoutVariant(manifest, "mobile");
    expect(out.manifest.themeId).toBe("light-mobile");
    expect(out.applied).toBe(true);
  });

  it("flips visible on a widget when override.visible is set", () => {
    const manifest: UILayoutManifest = {
      ...base,
      variants: {
        mobile: {
          overrides: [{ instanceId: "mini", visible: false }],
        },
      },
    };
    const out = applyLayoutVariant(manifest, "mobile");
    const mini = out.manifest.instances.find((i) => i.instanceId === "mini");
    expect(mini?.visible).toBe(false);
  });

  it("does not mutate the base manifest", () => {
    const manifest: UILayoutManifest = {
      ...base,
      variants: {
        mobile: {
          overrides: [{ instanceId: "chat", hidden: true }],
        },
      },
    };
    const beforeLen = manifest.instances.length;
    applyLayoutVariant(manifest, "mobile");
    expect(manifest.instances.length).toBe(beforeLen);
  });
});

describe("classifyViewport", () => {
  const { mobileMax, tabletMax } = DEFAULT_VIEWPORT_BREAKPOINTS;

  it("classifies narrow widths as mobile", () => {
    expect(classifyViewport(320)).toBe("mobile");
    expect(classifyViewport(mobileMax)).toBe("mobile");
  });

  it("classifies mid widths as tablet", () => {
    expect(classifyViewport(mobileMax + 1)).toBe("tablet");
    expect(classifyViewport(tabletMax)).toBe("tablet");
  });

  it("classifies wide widths as desktop", () => {
    expect(classifyViewport(tabletMax + 1)).toBe("desktop");
    expect(classifyViewport(1920)).toBe("desktop");
  });

  it("honors custom breakpoints", () => {
    expect(classifyViewport(500, { mobileMax: 400 })).toBe("tablet");
  });
});
