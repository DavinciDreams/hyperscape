/**
 * agentCapturedPack.test.tsx — RENDER PROOF.
 *
 * The natural follow-up to `tinyThirdPartyPack.test.tsx`. That
 * test proved a hand-crafted third-party pack survives the
 * production pipeline. This test takes the *exact* JSON a real
 * Anthropic Claude agent emitted (preserved at
 * `fixtures/agentCapturedPack.json`) and proves the same pipeline
 * accepts it without modification.
 *
 * What this answers:
 *   - Does the pack a live LLM produced parse cleanly through
 *     `loadUIPackOnClient`?       (validation seam)
 *   - Do the widget IDs the LLM picked resolve in the registry?
 *                                 (catalog → registry seam)
 *   - Does `ManifestRenderer` mount the layout end-to-end?
 *                                 (render seam)
 *
 * If any of those three fail, the failure tells us *exactly which
 * seam* breaks when an agent's output meets the runtime client.
 *
 * Stub widgets vs. real ones: this test stubs two widgets under
 * the agent's chosen IDs (`com.hyperforge.hyperscape.progress-bar`,
 * `com.hyperforge.hyperscape.notification-toast-list`) rather than
 * importing the real plugin renderers. The plugin barrel has a
 * known boot-time side effect (`DuelArenaVisualsSystem` references
 * `getDuelArenaConfig` during module init) that pollutes the test
 * runtime. The seams under test (validate → resolve → mount) are
 * the same regardless of whose Component renders the layout
 * instances; the production widgets' visual fidelity is covered by
 * their own per-widget tests in `hyperscape-plugin/src/widgets/__tests__/`.
 *
 * Source: the captured pack came from
 *   `bun run packages/agent-runner/examples/live-agent.ts`
 * with the prompt "Design a minimal HUD … HP bar (top-left) and a
 * chat log (bottom-left)" using `claude-sonnet-4-5`. The agent
 * walked the catalog with 7 search/list/get calls, picked
 * `progress-bar` and `notification-toast-list`, and emitted the
 * fixture JSON.
 */

import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { z } from "zod";
import {
  defineWidget,
  type UIPackManifest,
  UIPackManifestSchema,
} from "@hyperforge/ui-framework";
import { ClientUIWidgetProvider, uiRegistry } from "@/ui-framework/bindings";
import { loadUIPackOnClient } from "@/ui-framework/uiPackLoader";
import { ManifestRenderer } from "@hyperforge/ui-widgets";

import capturedPackRaw from "./fixtures/agentCapturedPack.json";

const CAPTURED_PACK: UIPackManifest =
  UIPackManifestSchema.parse(capturedPackRaw);

const PROGRESS_BAR_ID = "com.hyperforge.hyperscape.progress-bar";
const TOAST_LIST_ID = "com.hyperforge.hyperscape.notification-toast-list";

/**
 * Permissive prop schemas — accept whatever the agent emitted. The
 * point of this test is not to assert specific prop validation
 * (production schemas already do that); it's to assert the *pipeline*
 * accepts the agent's output.
 */
const stubProgressBarSchema = z.object({
  label: z.string().default(""),
  showPercent: z.boolean().default(false),
  lengthPx: z.number().default(100),
  thicknessPx: z.number().default(8),
  fillColor: z.string().default("#000"),
  trackColor: z.string().default("#fff"),
  borderColor: z.string().default("#000"),
  borderRadiusPx: z.number().default(0),
});

const stubToastListSchema = z.object({
  anchor: z.string().default("top-right"),
});

interface StubProgressBarProps extends z.infer<typeof stubProgressBarSchema> {}
interface StubToastListProps extends z.infer<typeof stubToastListSchema> {}

const StubProgressBar: React.FC<StubProgressBarProps> = ({
  label,
  fillColor,
}) => (
  <div data-testid="stub-progress-bar" data-fill={fillColor}>
    {label}
  </div>
);

const StubToastList: React.FC<StubToastListProps> = ({ anchor }) => (
  <div data-testid="stub-toast-list" data-anchor={anchor}>
    (chat log)
  </div>
);

const stubProgressBarWidget = defineWidget({
  manifest: {
    id: PROGRESS_BAR_ID,
    name: "Progress Bar",
    category: "hud",
    defaultSize: { width: 200, height: 24 },
  },
  propsSchema: stubProgressBarSchema,
  defaultProps: stubProgressBarSchema.parse({}),
});

const stubToastListWidget = defineWidget({
  manifest: {
    id: TOAST_LIST_ID,
    name: "Notification Toast List",
    category: "hud",
    defaultSize: { width: 320, height: 400 },
  },
  propsSchema: stubToastListSchema,
  defaultProps: stubToastListSchema.parse({}),
});

function ensureCapturedWidgetsBound(): void {
  if (!uiRegistry.hasComponent(PROGRESS_BAR_ID)) {
    uiRegistry.register({
      widget: stubProgressBarWidget,
      Component: StubProgressBar as unknown as Parameters<
        typeof uiRegistry.register
      >[0]["Component"],
    });
  }
  if (!uiRegistry.hasComponent(TOAST_LIST_ID)) {
    uiRegistry.register({
      widget: stubToastListWidget,
      Component: StubToastList as unknown as Parameters<
        typeof uiRegistry.register
      >[0]["Component"],
    });
  }
}

describe("agent-captured pack — end-to-end render proof", () => {
  it("Step 1: UIPackManifestSchema accepts the agent's output", () => {
    const result = UIPackManifestSchema.safeParse(capturedPackRaw);
    expect(result.success).toBe(true);
  });

  it("Step 2: loadUIPackOnClient validates + registers + activates the pack", () => {
    const result = loadUIPackOnClient(capturedPackRaw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loaded.id).toBe("com.hyperforge.minimal-hud");
    expect(result.loaded.layouts.default.instances).toHaveLength(2);
    // Both the agent's chosen widget IDs are surfaced on the loaded
    // pack's catalog so the host knows which widgets the layout uses.
    const ids = result.loaded.widgets.map((w) => w.id).sort();
    expect(ids).toEqual([
      "com.hyperforge.hyperscape.notification-toast-list",
      "com.hyperforge.hyperscape.progress-bar",
    ]);
  });

  it("Step 3: every widgetId on the captured pack resolves in the registry", () => {
    ensureCapturedWidgetsBound();
    const layout = CAPTURED_PACK.layouts.default;
    for (const inst of layout.instances) {
      expect(
        uiRegistry.hasComponent(inst.widgetId),
        `Agent picked widgetId "${inst.widgetId}" but no component is registered`,
      ).toBe(true);
    }
  });

  it("Step 4: ManifestRenderer mounts both instances end-to-end", () => {
    ensureCapturedWidgetsBound();

    const result = render(
      <ClientUIWidgetProvider>
        <ManifestRenderer
          layout={CAPTURED_PACK.layouts.default}
          registry={uiRegistry}
          dataContext={{ player: { hp: 75, maxHp: 100 } }}
        />
      </ClientUIWidgetProvider>,
    );

    expect(result.container.firstChild).not.toBeNull();
    // Both stub widgets must mount.
    expect(
      result.container.querySelector('[data-testid="stub-progress-bar"]'),
    ).not.toBeNull();
    expect(
      result.container.querySelector('[data-testid="stub-toast-list"]'),
    ).not.toBeNull();

    result.unmount();
  });

  it("Step 5: agent's authored props flow to the rendered DOM", () => {
    ensureCapturedWidgetsBound();

    const result = render(
      <ClientUIWidgetProvider>
        <ManifestRenderer
          layout={CAPTURED_PACK.layouts.default}
          registry={uiRegistry}
          dataContext={{}}
        />
      </ClientUIWidgetProvider>,
    );

    // The agent picked label="HP" and fillColor="#22c55e" — those
    // values must reach the rendered widget unchanged.
    const bar = result.container.querySelector(
      '[data-testid="stub-progress-bar"]',
    );
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute("data-fill")).toBe("#22c55e");
    expect(bar!.textContent).toBe("HP");

    // Same for the chat log's anchor.
    const toast = result.container.querySelector(
      '[data-testid="stub-toast-list"]',
    );
    expect(toast!.getAttribute("data-anchor")).toBe("bottom-left");

    result.unmount();
  });
});
