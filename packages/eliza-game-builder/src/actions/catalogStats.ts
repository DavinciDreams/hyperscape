/**
 * `GET_CATALOG_STATS` — single-line "there are N widgets across M
 * categories" summary. Useful as a session-opener so the agent has
 * a sense of scale before listing or searching.
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  ActionResult,
} from "@elizaos/core";
import { GameBuilderService } from "../services/GameBuilderService.js";
import { formatCatalogStats } from "../promptHelpers.js";

export const catalogStatsAction: Action = {
  name: "GET_CATALOG_STATS",
  similes: ["CATALOG_STATS", "CATALOG_SUMMARY", "HOW_MANY_WIDGETS"],
  description:
    "Return a one-line summary of the widget catalog: total count, per-category counts, and build timestamp. Run this once at the start of a session.",

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
    _options?: unknown,
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

    const formatted = formatCatalogStats(service.getCatalog());
    await callback?.({ text: formatted.text, action: "GET_CATALOG_STATS" });
    return {
      success: true,
      text: formatted.text,
      values: { total: formatted.data.total },
      data: formatted.data,
    };
  },

  examples: [
    [
      { name: "user", content: { text: "How many widgets do we have?" } },
      {
        name: "agent",
        content: {
          text: "52 widgets across categories: debug: 1, hud: 11, menu: 1, modal: 4, overlay: 7, panel: 28",
          action: "GET_CATALOG_STATS",
        },
      },
    ],
  ],
};
