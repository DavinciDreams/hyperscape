/**
 * Worked example — end-to-end PoC of the agent-authoring loop.
 *
 * This test simulates a "scripted agent": no live LLM, but a
 * deterministic sequence of action calls that an LLM *would*
 * produce when handed a prompt like "build me a minimal HUD with
 * HP and chat." It proves that every foundational service we
 * shipped (catalog → action dispatch → UI pack validation →
 * `loadUIPack` → renderable `LoadedUIPack`) actually composes
 * end-to-end without any glue we haven't built yet.
 *
 * Sequence:
 *
 *   1. Agent: GET_CATALOG_STATS
 *   2. Agent: LIST_GAME_WIDGETS (filter category=hud)
 *   3. Agent: GET_GAME_WIDGET (com.test.demo.alpha)
 *   4. Agent: PROPOSE_UI_PACK (composed manifest)
 *   5. Test:  loadUIPack(returned pack) → success
 *   6. Test:  asserts the loaded pack's default layout references
 *             both widgets the agent picked
 *
 * If a future change breaks any of these wirings, this test fails
 * — and that failure tells us *exactly which step* of the
 * authoring loop regressed.
 */

import { describe, expect, it } from "vitest";
import { loadUIPack, type UIPackManifest } from "@hyperforge/ui-framework";
import { GameBuilderService } from "../services/GameBuilderService.js";
import { catalogStatsAction } from "../actions/catalogStats.js";
import { listWidgetsAction } from "../actions/listWidgets.js";
import { getWidgetAction } from "../actions/getWidget.js";
import { proposeUIPackAction } from "../actions/proposeUIPack.js";
import { fixtureCatalog } from "./fixtures.js";
import { makeMessage, makeStubRuntime } from "./testRuntime.js";

function makeService(): GameBuilderService {
  return GameBuilderService.create({ catalog: fixtureCatalog });
}

describe("worked example — agent composes a UI pack end-to-end", () => {
  it("walks a scripted agent through the full authoring loop", async () => {
    const { runtime, callback, calls } = makeStubRuntime({
      service: makeService(),
    });

    // ── Step 1: agent gets a sense of scale ──────────────────────────
    const stats = await catalogStatsAction.handler(
      runtime,
      makeMessage("How many widgets do we have?"),
      undefined,
      undefined,
      callback,
    );
    expect(stats?.success).toBe(true);
    expect(stats?.values?.total).toBe(2);

    // ── Step 2: agent lists HUD widgets ──────────────────────────────
    const list = await listWidgetsAction.handler(
      runtime,
      makeMessage("What HUD widgets do I have?"),
      undefined,
      { parameters: { category: "hud" } },
      callback,
    );
    expect(list?.success).toBe(true);
    expect(list?.values?.count).toBe(1);

    // ── Step 3: agent inspects one widget's schema ───────────────────
    const detail = await getWidgetAction.handler(
      runtime,
      makeMessage("Tell me about com.test.demo.alpha"),
      undefined,
      { parameters: { id: "com.test.demo.alpha" } },
      callback,
    );
    expect(detail?.success).toBe(true);
    expect(detail?.values?.id).toBe("com.test.demo.alpha");

    // ── Step 4: agent composes and proposes a UI pack ────────────────
    // This is the agent's actual *output* — what an LLM would emit
    // after the research phase. We hand-construct it here, but the
    // shape and field names exactly mirror what the agent's tool
    // call would carry.
    const proposedPack: UIPackManifest = {
      version: 1,
      id: "minimal-hud",
      name: "Minimal HUD",
      description:
        "Two-widget HUD composed from the test catalog by a scripted agent.",
      widgets: [{ id: "com.test.demo.alpha" }, { id: "com.test.demo.beta" }],
      layouts: {
        default: {
          id: "minimal-hud-default",
          name: "Minimal HUD — default",
          revision: 1,
          grid: { columns: 12, rows: 8 },
          instances: [
            {
              instanceId: "alpha-instance",
              widgetId: "com.test.demo.alpha",
              position: {
                kind: "anchored",
                anchor: "top-left",
                offset: { x: 0, y: 0 },
              },
              props: {},
            },
            {
              instanceId: "beta-instance",
              widgetId: "com.test.demo.beta",
              position: {
                kind: "anchored",
                anchor: "bottom-right",
                offset: { x: 0, y: 0 },
              },
              props: {},
            },
          ],
        },
      },
    } as unknown as UIPackManifest;

    const proposed = await proposeUIPackAction.handler(
      runtime,
      makeMessage("Here's my pack."),
      undefined,
      { parameters: { pack: proposedPack } },
      callback,
    );
    expect(proposed?.success).toBe(true);
    expect(proposed?.values?.id).toBe("minimal-hud");
    expect(proposed?.values?.widgetCount).toBe(2);

    // ── Step 5: host loads the validated pack ────────────────────────
    // This is exactly what the running client would do when picking
    // up `proposed.data.pack` off the action result.
    const proposedData = proposed?.data as unknown as { pack: UIPackManifest };
    expect(proposedData.pack).toBeDefined();
    const loaded = loadUIPack(proposedData.pack);
    expect(loaded.ok).toBe(true);

    if (!loaded.ok) throw new Error("Should not happen — typeguard");

    // ── Step 6: rendered surface references both widgets ─────────────
    const layout = loaded.loaded.defaultLayout;
    expect(layout).toBeDefined();
    const widgetIds = layout!.instances.map((w) => w.widgetId).sort();
    expect(widgetIds).toEqual(["com.test.demo.alpha", "com.test.demo.beta"]);

    // ── Sanity: the agent talked four times during the loop ──────────
    const actions = calls.map((c) => c.action).filter(Boolean);
    expect(actions).toEqual([
      "GET_CATALOG_STATS",
      "LIST_GAME_WIDGETS",
      "GET_GAME_WIDGET",
      "PROPOSE_UI_PACK",
    ]);
  });

  it("agent recovers from an invalid pack proposal", async () => {
    const { runtime, callback } = makeStubRuntime({ service: makeService() });

    // Agent's first attempt is missing a required field (no `id`).
    const badPack = {
      version: 1,
      name: "Broken HUD",
      widgets: [],
      layouts: {
        default: {
          id: "x",
          name: "y",
          revision: 1,
          instances: [],
        },
      },
    };
    const firstTry = await proposeUIPackAction.handler(
      runtime,
      makeMessage("Here's my pack."),
      undefined,
      { parameters: { pack: badPack } },
      callback,
    );
    expect(firstTry?.success).toBe(false);
    expect(firstTry?.text).toContain("invalid");

    // Issues are surfaced so the agent can fix and retry.
    const issues = (
      firstTry?.data as unknown as {
        issues: ReadonlyArray<{ path: string; message: string }>;
      }
    ).issues;
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.path === "id")).toBe(true);

    // Agent fixes the pack and retries.
    const fixedPack = { ...badPack, id: "broken-hud-fixed" };
    const secondTry = await proposeUIPackAction.handler(
      runtime,
      makeMessage("Fixed."),
      undefined,
      { parameters: { pack: fixedPack } },
      callback,
    );
    expect(secondTry?.success).toBe(true);
    expect(secondTry?.values?.id).toBe("broken-hud-fixed");
  });
});
