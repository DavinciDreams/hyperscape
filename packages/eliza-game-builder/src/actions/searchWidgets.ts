/**
 * `SEARCH_GAME_WIDGETS` — case-insensitive substring search across
 * id, name, description, and JSDoc summary. The agent uses this
 * when it has a fuzzy intent ("find me something for showing
 * inventory") rather than a category.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  ActionResult,
  HandlerOptions,
} from "@elizaos/core";
import { GameBuilderService } from "../services/GameBuilderService.js";
import { formatWidgetList, searchCatalog } from "../promptHelpers.js";
import { extractQueryFromOptions } from "./shared.js";

export const searchWidgetsAction: Action = {
  name: "SEARCH_GAME_WIDGETS",
  similes: ["FIND_WIDGETS", "WIDGET_SEARCH"],
  description:
    "Case-insensitive substring search across widget id, name, description, and JSDoc summary. Use when the agent has a rough intent rather than a known id or category.",

  parameters: [
    {
      name: "query",
      description: "Free-form search string. Eg 'inventory', 'hp', 'minimap'.",
      required: true,
      schema: { type: "string" },
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

    const query = extractQueryFromOptions(options);
    if (!query) {
      const error = new Error(
        "SEARCH_GAME_WIDGETS requires a `query` parameter.",
      );
      await callback?.({ text: error.message, error: true });
      return { success: false, error };
    }

    const hits = searchCatalog(service.getCatalog(), query);
    const formatted = formatWidgetList(hits);
    const text =
      hits.length === 0
        ? `No widgets match "${query}".`
        : `Search "${query}" — ${formatted.text}`;
    await callback?.({ text, action: "SEARCH_GAME_WIDGETS" });

    return {
      success: true,
      text,
      values: { query, count: hits.length },
      data: { query, ...formatted.data },
    };
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "Find me anything related to inventory" },
      },
      {
        name: "agent",
        content: {
          text: "Search 'inventory' — 3 widgets:\ncom.hyperforge.hyperscape.inventory  [hud]  Inventory — …",
          action: "SEARCH_GAME_WIDGETS",
        },
      },
    ],
  ],
};
