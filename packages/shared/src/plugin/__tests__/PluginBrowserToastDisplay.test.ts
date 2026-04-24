import { describe, expect, it } from "vitest";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";
import type { PluginBrowserToastGroup } from "../PluginBrowserToastGrouping.js";
import type {
  PluginBrowserToastIntent,
  PluginBrowserToastKind,
} from "../PluginBrowserToastRouter.js";
import { formatPluginBrowserToastGroup } from "../PluginBrowserToastDisplay.js";

function row(
  pluginId: string,
  severity: PluginBrowserRowSummary["severity"],
  label: string = severity,
): PluginBrowserRowSummary {
  return {
    pluginId,
    severity,
    label,
    reasons: [],
    health: null,
    stability: null,
  };
}

function mkIntent(
  pluginId: string,
  kind: PluginBrowserToastKind,
  severity: PluginBrowserRowSummary["severity"],
  previous: PluginBrowserRowSummary | null = null,
  current: PluginBrowserRowSummary | null = null,
): PluginBrowserToastIntent {
  return {
    id: `${kind}:${pluginId}`,
    kind,
    severity,
    pluginId,
    previous,
    current,
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

describe("formatPluginBrowserToastGroup — titles per kind", () => {
  it("regressed → '<plugin> regressed to <severity>'", () => {
    const d = formatPluginBrowserToastGroup(
      mkGroup(mkIntent("com.x", "regressed", "error")),
    );
    expect(d.title).toBe("com.x regressed to error");
    expect(d.localization.titleKey).toBe("plugin.toast.regressed");
    expect(d.localization.titleParams).toEqual({
      pluginId: "com.x",
      severity: "error",
    });
  });

  it("recovered → '<plugin> recovered to <severity>'", () => {
    const d = formatPluginBrowserToastGroup(
      mkGroup(mkIntent("com.x", "recovered", "ok")),
    );
    expect(d.title).toBe("com.x recovered to ok");
    expect(d.localization.titleKey).toBe("plugin.toast.recovered");
  });

  it("added → '<plugin> installed'", () => {
    const d = formatPluginBrowserToastGroup(
      mkGroup(mkIntent("com.x", "added", "info")),
    );
    expect(d.title).toBe("com.x installed");
    expect(d.localization.titleKey).toBe("plugin.toast.added");
  });

  it("removed → '<plugin> uninstalled'", () => {
    const d = formatPluginBrowserToastGroup(
      mkGroup(mkIntent("com.x", "removed", "warning")),
    );
    expect(d.title).toBe("com.x uninstalled");
    expect(d.localization.titleKey).toBe("plugin.toast.removed");
  });

  it("label-changed shows before → after label", () => {
    const prev = row("com.x", "warning", "flaky");
    const cur = row("com.x", "warning", "degraded");
    const d = formatPluginBrowserToastGroup(
      mkGroup(mkIntent("com.x", "label-changed", "warning", prev, cur)),
    );
    expect(d.title).toBe("com.x: flaky → degraded");
    expect(d.localization.titleParams).toEqual({
      pluginId: "com.x",
      previousLabel: "flaky",
      currentLabel: "degraded",
    });
  });
});

describe("formatPluginBrowserToastGroup — subtitle", () => {
  it("null subtitle when group has no additionals", () => {
    const d = formatPluginBrowserToastGroup(
      mkGroup(mkIntent("com.x", "regressed", "error")),
    );
    expect(d.subtitle).toBeNull();
    expect(d.localization.subtitleKey).toBeNull();
  });

  it("'+1 more change' for a single additional", () => {
    const d = formatPluginBrowserToastGroup(
      mkGroup(mkIntent("com.x", "regressed", "error"), [
        mkIntent("com.x", "label-changed", "error"),
      ]),
    );
    expect(d.subtitle).toBe("+1 more change");
    expect(d.localization.subtitleKey).toBe("plugin.toast.moreChanges");
    expect(d.localization.subtitleParams).toEqual({ count: 1 });
  });

  it("'+N more changes' for multiple additionals", () => {
    const d = formatPluginBrowserToastGroup(
      mkGroup(mkIntent("com.x", "regressed", "error"), [
        mkIntent("com.x", "label-changed", "error"),
        mkIntent("com.x", "recovered", "warning"),
      ]),
    );
    expect(d.subtitle).toBe("+2 more changes");
    expect(d.localization.subtitleParams).toEqual({ count: 2 });
  });
});

describe("formatPluginBrowserToastGroup — badges", () => {
  it("always includes the kind badge", () => {
    const d = formatPluginBrowserToastGroup(
      mkGroup(mkIntent("com.x", "regressed", "error")),
    );
    expect(d.badges).toContain("regressed");
  });

  it("appends group severity when it differs from primary severity", () => {
    const group: PluginBrowserToastGroup = {
      pluginId: "com.x",
      primary: mkIntent("com.x", "label-changed", "info"),
      additional: [mkIntent("com.x", "regressed", "error")],
      severity: "error",
    };
    const d = formatPluginBrowserToastGroup(group);
    expect(d.badges).toEqual(["label", "error"]);
  });
});

describe("formatPluginBrowserToastGroup — aria", () => {
  it("ariaLabel equals title when no subtitle", () => {
    const d = formatPluginBrowserToastGroup(
      mkGroup(mkIntent("com.x", "added", "info")),
    );
    expect(d.ariaLabel).toBe("com.x installed");
  });

  it("ariaLabel appends subtitle when present", () => {
    const d = formatPluginBrowserToastGroup(
      mkGroup(mkIntent("com.x", "regressed", "error"), [
        mkIntent("com.x", "label-changed", "error"),
      ]),
    );
    expect(d.ariaLabel).toBe("com.x regressed to error. +1 more change.");
  });
});
