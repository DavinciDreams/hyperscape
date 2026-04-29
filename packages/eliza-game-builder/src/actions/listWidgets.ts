/**
 * `LIST_GAME_WIDGETS` — list every widget the catalog knows about,
 * optionally filtered by category.
 *
 * Reads the optional `category` parameter from
 * `options.parameters.category` (the slot ElizaOS fills via
 * action-parameter extraction); falls back to scanning the message
 * text for `category="..."` if the runtime didn't pre-extract.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  ActionResult,
  HandlerOptions,
  ProviderDataRecord,
} from "@elizaos/core";
import { GameBuilderService } from "../services/GameBuilderService.js";
import { formatWidgetList } from "../promptHelpers.js";
import { extractCategoryFromOptions } from "./shared.js";

export const listWidgetsAction: Action = {
  name: "LIST_GAME_WIDGETS",
  similes: ["SHOW_WIDGETS", "AVAILABLE_WIDGETS", "WHAT_WIDGETS"],
  description:
    "List every widget the HyperForge catalog knows about. Optionally filter by category (panel | hud | overlay | modal | menu | debug). Use this first when designing a UI to see what's already shippable without writing new code.",

  parameters: [
    {
      name: "category",
      description:
        "Optional category filter. One of: panel | hud | overlay | modal | menu | debug. Omit to list every widget.",
      required: false,
      schema: {
        type: "string",
        enum: ["panel", "hud", "overlay", "modal", "menu", "debug"],
      },
    },
  ],

  validate: async (runtime: IAgentRuntime) => {
    return (
      runtime.getService<GameBuilderService>(GameBuilderService.serviceType) !==
      null
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    options?: HandlerOptions | Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const service = runtime.getService<GameBuilderService>(
      GameBuilderService.serviceType,
    );
    if (!service) {
      const error = new Error("GameBuilderService not available");
      await callback?.({ text: error.message, error: true });
      return { success: false, error };
    }

    const category = extractCategoryFromOptions(options);
    const widgets = service.listWidgets(category ? { category } : {});
    const formatted = formatWidgetList(widgets, category ? { category } : {});

    await callback?.({
      text: formatted.text,
      action: "LIST_GAME_WIDGETS",
    });

    return {
      success: true,
      text: formatted.text,
      values: { count: formatted.data.count },
      data: formatted.data as unknown as ProviderDataRecord,
    };
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "What widgets do I have to work with?" },
      },
      {
        name: "agent",
        content: {
          text: "Found 52 widgets across 6 categories. Here are the first 30…",
          action: "LIST_GAME_WIDGETS",
        },
      },
    ],
    [
      { name: "user", content: { text: "List the HUD widgets" } },
      {
        name: "agent",
        content: {
          text: "11 HUD widgets:\ncom.hyperforge.hyperscape.hp-bar  [hud]  HP Bar — …",
          action: "LIST_GAME_WIDGETS",
        },
      },
    ],
  ],
};
