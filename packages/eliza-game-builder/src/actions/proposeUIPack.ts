/**
 * `PROPOSE_UI_PACK` — the agent's primary output action.
 *
 * After narrowing the catalog with `LIST_GAME_WIDGETS` /
 * `SEARCH_GAME_WIDGETS` / `GET_GAME_WIDGET`, the agent emits a
 * full `UIPackManifest` as the `pack` parameter of this action.
 * The handler validates it through
 * `@hyperforge/ui-framework`'s `validateUIPackManifest` (the same
 * Zod-based path the runtime client uses) and either returns the
 * validated pack (`success: true, data.pack`) for the host to
 * apply, or surfaces every Zod issue back to the agent so it can
 * fix and retry.
 *
 * This is the action that closes the authoring loop. Without it
 * the agent's output is just chat text. With it the host code
 * picks `data.pack` off the action result and feeds it to
 * `loadUIPackOnClient`.
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
import { validateUIPackManifest } from "@hyperforge/ui-framework";
import { GameBuilderService } from "../services/GameBuilderService.js";
import { readObjectField } from "./shared.js";

export const proposeUIPackAction: Action = {
  name: "PROPOSE_UI_PACK",
  similes: ["EMIT_UI_PACK", "BUILD_UI_PACK", "SUBMIT_UI_PACK"],
  description:
    "Submit a complete UIPackManifest the agent has composed. Pass `pack` — a JSON object matching `UIPackManifestSchema` (version: 1, id, name, widgets[], theme?, layouts?). The handler validates the pack against the canonical schema; if invalid, every Zod issue is returned so the agent can fix and resubmit. The validated pack is surfaced on `data.pack` for the host to apply via `loadUIPackOnClient`.",

  parameters: [
    {
      name: "pack",
      description:
        "The UIPackManifest JSON. Required fields: version (must be 1), id, name, widgets (catalog of widget refs the pack uses). Optional: author, description, theme, layouts, customization defaults.",
      required: true,
      schema: { type: "object" },
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

    const packRaw = readObjectField(options, "pack");
    if (!packRaw) {
      const error = new Error(
        "PROPOSE_UI_PACK requires a `pack` parameter — a UIPackManifest JSON object.",
      );
      await callback?.({ text: error.message, error: true });
      return { success: false, error };
    }

    const result = validateUIPackManifest(packRaw);
    if (!result.ok) {
      const issues = result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
        code: i.code,
      }));
      const lines = issues.map((i) => `  ${i.path || "(root)"}: ${i.message}`);
      const text = `Pack invalid — ${issues.length} issue${issues.length === 1 ? "" : "s"}:\n${lines.join("\n")}`;
      await callback?.({ text, error: true });
      return {
        success: false,
        text,
        data: { issues } as unknown as ProviderDataRecord,
      };
    }

    const pack = result.data;
    const widgetCount = pack.widgets.length;
    const summaryLines: string[] = [];
    summaryLines.push(`UIPack accepted: ${pack.id}`);
    summaryLines.push(`  name:    ${pack.name}`);
    if (pack.author) summaryLines.push(`  author:  ${pack.author}`);
    summaryLines.push(`  widgets: ${widgetCount}`);
    if (pack.layouts) {
      const layoutKeys = Object.keys(pack.layouts);
      if (layoutKeys.length > 0) {
        summaryLines.push(`  layouts: ${layoutKeys.join(", ")}`);
      }
    }
    if (pack.theme) summaryLines.push(`  theme:   ${pack.theme.name}`);
    const text = summaryLines.join("\n");

    await callback?.({ text, action: "PROPOSE_UI_PACK" });

    return {
      success: true,
      text,
      values: { id: pack.id, widgetCount },
      data: { pack } as unknown as ProviderDataRecord,
    };
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "Build me a minimal HUD with HP and chat." },
      },
      {
        name: "agent",
        content: {
          text: "UIPack accepted: minimal-hud\n  name: Minimal HUD\n  widgets: 2",
          action: "PROPOSE_UI_PACK",
        },
      },
    ],
  ],
};
