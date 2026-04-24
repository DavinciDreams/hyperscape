/**
 * End-to-end smoke test for the client ui-framework scaffold.
 *
 * Proves:
 *   - every builtin schema is defined in `uiRegistry`
 *   - bound adapters resolve via `getComponent`
 *   - `allBuiltinsBound()` reflects partial vs full binding
 *   - `DEFAULT_UI_LAYOUT` validates against the registry (so any
 *     manifest drift here surfaces at unit-test time, not runtime)
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  BUILTIN_WIDGETS,
  resolveWidgetProps,
  validateLayout,
} from "@hyperforge/ui-framework";
import {
  allBuiltinsBound,
  bindAllWidgets,
  uiRegistry,
} from "@/ui-framework/bindings";
import { buildPlayerDataContext } from "@/ui-framework/dataContext";
import { DEFAULT_UI_LAYOUT } from "@/ui-framework/defaultLayout";
import { isManifestHudEnabled } from "@/ui-framework/featureFlag";

describe("client ui-framework bindings", () => {
  it("defines every builtin widget at module load", () => {
    for (const { manifest } of BUILTIN_WIDGETS) {
      expect(uiRegistry.hasWidget(manifest.id)).toBe(true);
    }
  });

  it("bindAllWidgets binds every builtin adapter", () => {
    bindAllWidgets();

    for (const { manifest } of BUILTIN_WIDGETS) {
      expect(uiRegistry.hasComponent(manifest.id)).toBe(true);
    }

    // allBuiltinsBound is the exit-criterion gate for D6 completion.
    expect(allBuiltinsBound()).toBe(true);
  });

  it("resolves every bound adapter as a React component", () => {
    for (const { manifest } of BUILTIN_WIDGETS) {
      const Component = uiRegistry.getComponent(manifest.id);
      // React.memo returns an object; plain function components are functions.
      expect(["object", "function"]).toContain(typeof Component);
    }
  });

  it("throws a descriptive error when rendering an unknown widget id", () => {
    expect(() => uiRegistry.getComponent("does.not.exist")).toThrow(
      /unknown widget id/,
    );
  });

  it("DEFAULT_UI_LAYOUT validates against the registry", () => {
    const result = validateLayout(DEFAULT_UI_LAYOUT, uiRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      // Surface issue details if the test fails so the diff is useful.
      throw new Error(
        `DEFAULT_UI_LAYOUT failed validation:\n${result.issues
          .map(
            (i) => `  ${i.code} @${i.instanceId ?? "manifest"}: ${i.message}`,
          )
          .join("\n")}`,
      );
    }
  });

  it("DEFAULT_UI_LAYOUT only references widget ids the registry knows about", () => {
    for (const inst of DEFAULT_UI_LAYOUT.instances) {
      expect(uiRegistry.hasWidget(inst.widgetId)).toBe(true);
    }
  });

  it("buildPlayerDataContext projects nullable PlayerData into a DataContext with the expected namespaces", () => {
    const ctx = buildPlayerDataContext({
      inventory: [],
      equipment: null,
      playerStats: null,
      coins: 0,
    });
    expect(ctx.player).toBeDefined();
    expect(ctx.inventory).toBeDefined();
    expect(ctx.equipment).toBeDefined();
    // Pre-spawn: player fields are omitted so bindings short-circuit
    // and the widget's static fallback takes over.
    expect((ctx.player as { hp?: number }).hp).toBeUndefined();
    expect((ctx.player as { maxHp?: number }).maxHp).toBeUndefined();
  });

  it("HP bar resolves $player.hp bindings from a live DataContext", () => {
    const ctx = buildPlayerDataContext({
      inventory: [],
      equipment: null,
      playerStats: {
        health: { current: 7, max: 10 },
        prayerPoints: { current: 1, max: 1 },
        skills: {},
        equipment: null,
        combatLevel: 3,
        level: 3,
        inCombat: false,
      } as never,
      coins: 0,
    });

    const hpBarInstance = DEFAULT_UI_LAYOUT.instances.find(
      (i) => i.widgetId === "hyperforge.hud.hp-bar",
    );
    expect(hpBarInstance).toBeDefined();

    const widget = uiRegistry.getWidget(hpBarInstance!.widgetId);
    expect(widget).toBeDefined();

    const resolved = resolveWidgetProps(
      hpBarInstance!.props,
      hpBarInstance!.bindings,
      widget!.propsSchema,
      ctx,
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect((resolved.props as { current: number }).current).toBe(7);
      expect((resolved.props as { max: number }).max).toBe(10);
    }
  });

  it("isManifestHudEnabled is true by default (U11 graduated to default-on)", () => {
    try {
      localStorage.removeItem("hyperscape.manifestHud");
    } catch {
      // ignore
    }
    expect(isManifestHudEnabled()).toBe(true);
  });

  it("isManifestHudEnabled flips to false when localStorage opt-out flag is set", () => {
    localStorage.setItem("hyperscape.manifestHud", "0");
    try {
      expect(isManifestHudEnabled()).toBe(false);
    } finally {
      localStorage.removeItem("hyperscape.manifestHud");
    }
  });

  it("HP bar falls back to static props in the pre-spawn state (bindings short-circuit)", () => {
    const ctx = buildPlayerDataContext({
      inventory: [],
      equipment: null,
      playerStats: null,
      coins: 0,
    });

    const hpBarInstance = DEFAULT_UI_LAYOUT.instances.find(
      (i) => i.widgetId === "hyperforge.hud.hp-bar",
    );
    const widget = uiRegistry.getWidget(hpBarInstance!.widgetId);

    const resolved = resolveWidgetProps(
      hpBarInstance!.props,
      hpBarInstance!.bindings,
      widget!.propsSchema,
      ctx,
    );
    // Pre-spawn: DataContext has no player.hp / player.maxHp fields,
    // so bindings resolve to `undefined` and the instance's static
    // fallback values (`current: 10`, `max: 10`) are what reach Zod.
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect((resolved.props as { current: number }).current).toBe(10);
      expect((resolved.props as { max: number }).max).toBe(10);
      // The two non-fatal binding-failed warnings are surfaced but
      // don't block the render.
      expect(resolved.issues.length).toBe(2);
      expect(resolved.issues.every((i) => i.code === "binding-failed")).toBe(
        true,
      );
    }
  });
});
