import { describe, expect, it } from "vitest";
import type { PluginBrowserToastGroup } from "../PluginBrowserToastGrouping.js";
import type {
  PluginBrowserToastIntent,
  PluginBrowserToastKind,
} from "../PluginBrowserToastRouter.js";
import type { PluginBrowserToastOverflowSummary } from "../PluginBrowserToastRateLimit.js";
import { renderPluginBrowserToastDisplays } from "../PluginBrowserToastRender.js";

function mkIntent(
  pluginId: string,
  kind: PluginBrowserToastKind,
  severity: PluginBrowserToastIntent["severity"],
): PluginBrowserToastIntent {
  return {
    id: `${kind}:${pluginId}`,
    kind,
    severity,
    pluginId,
    previous: null,
    current: null,
  };
}

function mkGroup(
  primary: PluginBrowserToastIntent,
  additional: PluginBrowserToastIntent[] = [],
): PluginBrowserToastGroup {
  return {
    pluginId: primary.pluginId,
    primary,
    additional,
    severity: primary.severity,
  };
}

describe("renderPluginBrowserToastDisplays — groups", () => {
  it("returns an empty displays list when input is empty", () => {
    const r = renderPluginBrowserToastDisplays({ groups: [] });
    expect(r.displays).toEqual([]);
    expect(r.overflow).toBeNull();
  });

  it("formats each group into a display in input order", () => {
    const r = renderPluginBrowserToastDisplays({
      groups: [
        mkGroup(mkIntent("zeta", "regressed", "error")),
        mkGroup(mkIntent("alpha", "added", "info")),
      ],
    });
    expect(r.displays.map((d) => d.pluginId)).toEqual(["zeta", "alpha"]);
    expect(r.displays[0].title).toBe("zeta regressed to error");
  });
});

describe("renderPluginBrowserToastDisplays — overflow", () => {
  function mkOverflow(
    overrides: Partial<PluginBrowserToastOverflowSummary> = {},
  ): PluginBrowserToastOverflowSummary {
    return {
      overflowCount: 3,
      bySeverity: { ok: 0, info: 1, warning: 1, error: 1 },
      byKind: {
        regressed: 1,
        removed: 1,
        added: 1,
        recovered: 0,
        "label-changed": 0,
      },
      overflowIds: ["regressed:x", "removed:y", "added:z"],
      ...overrides,
    };
  }

  it("returns null overflow when no summary is supplied", () => {
    const r = renderPluginBrowserToastDisplays({ groups: [] });
    expect(r.overflow).toBeNull();
  });

  it("returns null overflow when summary is null", () => {
    const r = renderPluginBrowserToastDisplays({
      groups: [],
      overflow: null,
    });
    expect(r.overflow).toBeNull();
  });

  it("titles '1 more change' when count is 1", () => {
    const r = renderPluginBrowserToastDisplays({
      groups: [],
      overflow: mkOverflow({
        overflowCount: 1,
        bySeverity: { ok: 1, info: 0, warning: 0, error: 0 },
        byKind: {
          regressed: 0,
          removed: 0,
          added: 0,
          recovered: 1,
          "label-changed": 0,
        },
      }),
    });
    expect(r.overflow?.title).toBe("1 more change");
    expect(r.overflow?.localization.titleParams).toEqual({ count: 1 });
  });

  it("titles 'N more changes' when count > 1", () => {
    const r = renderPluginBrowserToastDisplays({
      groups: [],
      overflow: mkOverflow({ overflowCount: 5 }),
    });
    expect(r.overflow?.title).toBe("5 more changes");
  });

  it("severity = worst present in bySeverity", () => {
    const r = renderPluginBrowserToastDisplays({
      groups: [],
      overflow: mkOverflow(),
    });
    // overflow has error=1, so worst severity is error
    expect(r.overflow?.severity).toBe("error");
  });

  it("severity falls back through warning → info → ok", () => {
    const r1 = renderPluginBrowserToastDisplays({
      groups: [],
      overflow: mkOverflow({
        bySeverity: { ok: 1, info: 1, warning: 1, error: 0 },
      }),
    });
    expect(r1.overflow?.severity).toBe("warning");

    const r2 = renderPluginBrowserToastDisplays({
      groups: [],
      overflow: mkOverflow({
        bySeverity: { ok: 1, info: 1, warning: 0, error: 0 },
      }),
    });
    expect(r2.overflow?.severity).toBe("info");

    const r3 = renderPluginBrowserToastDisplays({
      groups: [],
      overflow: mkOverflow({
        bySeverity: { ok: 1, info: 0, warning: 0, error: 0 },
      }),
    });
    expect(r3.overflow?.severity).toBe("ok");
  });

  it("badges only include kinds with count > 0, in priority order", () => {
    const r = renderPluginBrowserToastDisplays({
      groups: [],
      overflow: mkOverflow({
        byKind: {
          regressed: 0,
          removed: 1,
          added: 0,
          recovered: 1,
          "label-changed": 1,
        },
      }),
    });
    expect(r.overflow?.badges).toEqual(["removed", "recovered", "label"]);
  });

  it("ariaLabel concatenates title with per-kind breakdown", () => {
    const r = renderPluginBrowserToastDisplays({
      groups: [],
      overflow: mkOverflow({
        overflowCount: 3,
        byKind: {
          regressed: 2,
          removed: 1,
          added: 0,
          recovered: 0,
          "label-changed": 0,
        },
      }),
    });
    expect(r.overflow?.ariaLabel).toBe(
      "3 more changes: 2 regressed, 1 removed",
    );
  });
});

describe("renderPluginBrowserToastDisplays — composition", () => {
  it("emits displays and overflow in the same call when both present", () => {
    const r = renderPluginBrowserToastDisplays({
      groups: [mkGroup(mkIntent("a", "regressed", "error"))],
      overflow: {
        overflowCount: 1,
        bySeverity: { ok: 0, info: 0, warning: 1, error: 0 },
        byKind: {
          regressed: 0,
          removed: 0,
          added: 1,
          recovered: 0,
          "label-changed": 0,
        },
        overflowIds: ["added:z"],
      },
    });
    expect(r.displays).toHaveLength(1);
    expect(r.overflow?.count).toBe(1);
    expect(r.overflow?.severity).toBe("warning");
  });
});
