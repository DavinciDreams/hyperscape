/**
 * tinyThirdPartyPack.test.tsx — DIAGNOSTIC EXPERIMENT.
 *
 * Question: if a third party with no Hyperia knowledge tried to ship
 * a tiny game on top of HyperForge using only the public surface
 * (`UIPackManifest` + `loadUIPackOnClient` + `ManifestRenderer`),
 * how far do they actually get?
 *
 * This test authors the smallest plausible third-party pack — one
 * that uses *only* the framework's `BUILTIN_WIDGETS` (no
 * `@hyperforge/hyperscape` plugin dep) — and runs it through the
 * full production pipeline. The pack-as-author would write looks
 * like a JSON file; we use a TypeScript literal so the schema
 * mismatches surface as type errors instead of runtime errors.
 *
 * What this test proves (or fails to prove):
 *   1. `UIPackManifestSchema` accepts a hand-written pack.
 *   2. `loadUIPackOnClient` validates + registers + activates.
 *   3. `bindAllWidgets` populates the registry so the layout's
 *      `widgetId` references can be resolved.
 *   4. `ManifestRenderer` produces React elements from the loaded
 *      layout against a stub data context.
 *   5. Author-time `bindings` resolve through the `DataContext`
 *      (this is the "live data flow" half of the architecture).
 *
 * Each assertion is a checkpoint; a failure shows exactly where the
 * "ship a game from JSON" claim breaks for outside builders.
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  HYPERSCAPE_DARK_THEME,
  UIPackManifestSchema,
  type UIPackManifest,
} from "@hyperforge/ui-framework";
import {
  ClientUIWidgetProvider,
  bindAllWidgets,
  uiRegistry,
} from "@/ui-framework/bindings";
import { loadUIPackOnClient } from "@/ui-framework/uiPackLoader";
import { ManifestRenderer } from "@hyperforge/ui-widgets";

/**
 * The smallest plausible third-party pack — pinned to the
 * framework's `BUILTIN_WIDGETS` so this test stays independent of
 * `@hyperforge/hyperscape`. An outside builder would write something
 * like this in `ui-pack.json`.
 */
const TINY_PACK: UIPackManifest = UIPackManifestSchema.parse({
  version: 1,
  id: "tiny.third-party-game",
  name: "Tiny Third-Party Game",
  author: "no-hyperia-knowledge-required",
  description:
    "Diagnostic pack — proves a third party can ship a game UI from JSON.",
  widgets: [
    // Catalog: which widgets this pack uses. Empty defaults are
    // fine; the layout is what actually drives the renderer.
    { id: "hyperforge.hud.hp-bar" },
    { id: "hyperforge.overlay.tooltip" },
  ],
  theme: HYPERSCAPE_DARK_THEME,
  layouts: {
    default: {
      id: "tiny.layout.default",
      name: "Default",
      description: "One HP bar in the top-left corner.",
      instances: [
        {
          instanceId: "tiny-hp-main",
          widgetId: "hyperforge.hud.hp-bar",
          position: {
            kind: "anchored",
            anchor: "top-left",
            offset: { x: 24, y: 24 },
          },
          // Static fallbacks — used when bindings can't resolve.
          props: {
            orientation: "horizontal",
            current: 75,
            max: 100,
            showNumeric: true,
          },
          // Live bindings — `$player.hp` resolves from the
          // DataContext threaded into ManifestRenderer below.
          bindings: {
            current: "$player.hp",
            max: "$player.maxHp",
          },
          label: "HP",
        },
      ],
    },
  },
});

describe("Tiny third-party pack — diagnostic E2E", () => {
  it("Step 1: schema accepts a hand-written third-party pack", () => {
    // The TINY_PACK is constructed via UIPackManifestSchema.parse at
    // module load above, so reaching this assertion already means
    // the schema accepted the manifest. Reassert here for clarity.
    expect(TINY_PACK.id).toBe("tiny.third-party-game");
    expect(Object.keys(TINY_PACK.layouts)).toEqual(["default"]);
  });

  it("Step 2: loadUIPackOnClient validates + registers + activates", () => {
    const result = loadUIPackOnClient(TINY_PACK, {
      register: true,
      setActive: false, // don't disturb the global active pack
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error("loadUIPackOnClient failed:", result.error.issues);
      return;
    }
    expect(result.loaded.id).toBe("tiny.third-party-game");
    expect(result.loaded.layouts.default.instances).toHaveLength(1);
  });

  it("Step 3: registry has every layout widgetId bound to a component", () => {
    bindAllWidgets();
    const layout = TINY_PACK.layouts.default;
    for (const inst of layout.instances) {
      expect(
        uiRegistry.hasComponent(inst.widgetId),
        `expected widgetId "${inst.widgetId}" to be bound — is the binding ` +
          `in @hyperforge/ui-widgets/bindings.ts up to date?`,
      ).toBe(true);
    }
  });

  it("Step 4: ManifestRenderer renders the layout without throwing", () => {
    bindAllWidgets();
    // Stub a DataContext that mimics what `buildPlayerDataContext`
    // produces in `ManifestHud`. Real client uses live player state.
    const dataContext = {
      player: {
        hp: 42,
        maxHp: 100,
      },
    };

    const result = render(
      <ClientUIWidgetProvider>
        <ManifestRenderer
          layout={TINY_PACK.layouts.default}
          registry={uiRegistry}
          dataContext={dataContext}
        />
      </ClientUIWidgetProvider>,
    );

    // Smoke-test: at least one DOM node from the layout's HP bar
    // instance must mount. Specific assertions about the HP bar's
    // visible numbers are deferred to widget-level tests; this
    // check just confirms the manifest → registry → component
    // pipeline produces *something*.
    expect(result.container.firstChild).not.toBeNull();
    result.unmount();
  });

  it("Step 5: bindings resolve from DataContext", () => {
    // We can't easily assert the rendered HP bar's interior from
    // here without a custom widget probe — but we can at least
    // confirm the data-context shape the manifest expected works
    // by exercising the binding parser directly. The actual visual
    // rendering proof was Step 4.
    bindAllWidgets();
    const result = render(
      <ClientUIWidgetProvider>
        <ManifestRenderer
          layout={TINY_PACK.layouts.default}
          registry={uiRegistry}
          dataContext={{ player: { hp: 7, maxHp: 10 } }}
        />
      </ClientUIWidgetProvider>,
    );
    // The HP bar's static fallback is current=75 — if bindings did
    // NOT resolve, "75" would appear in the DOM. With bindings, the
    // resolved value (7) should appear instead. Check both
    // possibilities to surface the gap diagnostically.
    const html = result.container.innerHTML;
    // The HP bar's static fallback is current=75 (set in TINY_PACK).
    // The DataContext supplies player.hp=7. If bindings resolve, "7"
    // appears and "75" does not. If bindings are silently ignored,
    // "75" appears instead. This assertion enforces resolution.
    expect(
      html.includes("7") && !html.includes("75"),
      "Bindings did NOT resolve — DataContext was ignored. The HP bar " +
        "rendered with the static fallback (75) instead of the bound " +
        "value (7). This means ManifestRenderer's binding evaluation " +
        "is not pulling from the dataContext prop. Diagnostic raw HTML " +
        "follows below:\n" +
        html.slice(0, 800),
    ).toBe(true);
    result.unmount();
  });
});
