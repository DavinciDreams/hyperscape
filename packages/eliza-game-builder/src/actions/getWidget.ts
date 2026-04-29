/**
 * `GET_GAME_WIDGET` — fetch the full catalog entry for one widget,
 * including manifest id, default size, every prop with its Zod
 * type, default value, optional flag, JSDoc summary, and source
 * path. Use after `LIST_GAME_WIDGETS` once the agent has narrowed
 * down a candidate.
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
import { formatWidgetEntry } from "../promptHelpers.js";
import { extractIdFromOptions } from "./shared.js";

export const getWidgetAction: Action = {
  name: "GET_GAME_WIDGET",
  similes: ["DESCRIBE_WIDGET", "WIDGET_DETAIL", "INSPECT_WIDGET"],
  description:
    "Fetch the full catalog entry for one widget by manifest id (eg `com.hyperforge.hyperscape.hp-bar`). Returns its props schema, default size, JSDoc summary, and source path.",

  parameters: [
    {
      name: "id",
      description:
        "The widget's stable manifest id, eg 'com.hyperforge.hyperscape.hp-bar'.",
      required: true,
      schema: { type: "string" },
    },
  ],

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
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

    const id = extractIdFromOptions(options);
    if (!id) {
      const error = new Error(
        "GET_GAME_WIDGET requires `id` parameter — the widget's manifest id.",
      );
      await callback?.({ text: error.message, error: true });
      return { success: false, error };
    }

    const entry = service.getWidget(id);
    if (!entry) {
      const text = `Widget not found: ${id}`;
      await callback?.({ text, error: true });
      return { success: false, text };
    }

    const formatted = formatWidgetEntry(entry);
    await callback?.({ text: formatted.text, action: "GET_GAME_WIDGET" });
    return {
      success: true,
      text: formatted.text,
      values: { id: entry.id, propCount: entry.props.length },
      data: formatted.data as unknown as ProviderDataRecord,
    };
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "Tell me about the avatar widget" },
      },
      {
        name: "agent",
        content: {
          text: "Avatar (com.hyperforge.hyperscape.avatar) — category: panel, defaultSize: 6 x 6, props: name: string, imageUrl: string, sizePx: number, …",
          action: "GET_GAME_WIDGET",
        },
      },
    ],
  ],
};
