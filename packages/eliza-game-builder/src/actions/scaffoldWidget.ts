/**
 * `SCAFFOLD_WIDGET` — programmatically create a new widget package
 * file pair (`*Widget.tsx` + `__tests__/*Widget.test.ts`) when the
 * catalog doesn't have what the agent needs.
 *
 * Reads a `spec` parameter — a JSON object matching `WidgetSpec`
 * (validated by `@hyperforge/plugin-scaffolder`'s
 * `validateWidgetSpec`). Honors `dryRun` (return the plan without
 * writing) and `force` (overwrite existing files). Skipped files
 * are surfaced separately so the agent can react.
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
import type { WidgetSpec } from "@hyperforge/plugin-scaffolder";
import { GameBuilderService } from "../services/GameBuilderService.js";
import {
  extractBooleanFromOptions,
  readObjectField,
  readStringField,
} from "./shared.js";

export const scaffoldWidgetAction: Action = {
  name: "SCAFFOLD_WIDGET",
  similes: ["CREATE_WIDGET", "GENERATE_WIDGET", "NEW_WIDGET"],
  description:
    "Scaffold a new widget into the workspace. Pass a `spec` parameter — a JSON object with name (PascalCase), manifestId (eg com.org.plugin.name), category (panel|hud|overlay|modal|menu|debug), defaultSize { width, height }, and props[]. Use after LIST_GAME_WIDGETS / SEARCH_GAME_WIDGETS confirm the widget doesn't already exist. Use dryRun=true to preview without writing.",

  parameters: [
    {
      name: "spec",
      description:
        "WidgetSpec JSON: { name: PascalCase, manifestId: 'com.org.plugin.name', category: panel|hud|overlay|modal|menu|debug, defaultSize: {width, height}, props: PropSpec[] }",
      required: true,
      schema: { type: "object" },
    },
    {
      name: "dryRun",
      description:
        "When true, scaffolds and validates but writes nothing. Use to preview.",
      required: false,
      schema: { type: "boolean" },
    },
    {
      name: "force",
      description: "Overwrite existing files. Default false.",
      required: false,
      schema: { type: "boolean" },
    },
    {
      name: "widgetsDir",
      description:
        "Workspace-relative dir for the source file. Defaults to packages/hyperscape-plugin/src/widgets.",
      required: false,
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

    const specRaw = readObjectField(options, "spec");
    if (!specRaw) {
      const error = new Error(
        "SCAFFOLD_WIDGET requires a `spec` parameter — a WidgetSpec JSON object.",
      );
      await callback?.({ text: error.message, error: true });
      return { success: false, error };
    }
    const spec = specRaw as unknown as WidgetSpec;

    const dryRun = extractBooleanFromOptions(options, "dryRun", false);
    const force = extractBooleanFromOptions(options, "force", false);
    const widgetsDir = readStringField(options, "widgetsDir");
    const testsDir = readStringField(options, "testsDir");
    const indexFile = readStringField(options, "indexFile");
    const skipTest = extractBooleanFromOptions(options, "skipTest", false);

    const outcome = service.scaffold(spec, {
      dryRun,
      force,
      widgetsDir,
      testsDir,
      indexFile,
      skipTest,
    });

    if (!outcome.validation.ok) {
      const lines = outcome.validation.issues.map(
        (i) => `  ${i.path}: ${i.message}`,
      );
      const text = `Spec invalid:\n${lines.join("\n")}`;
      await callback?.({ text, error: true });
      return {
        success: false,
        text,
        data: { issues: outcome.validation.issues },
      };
    }

    const result = outcome.result!;
    const applied = outcome.applied!;

    const summaryLines: string[] = [];
    if (dryRun) {
      summaryLines.push(`Dry run — no files written.`);
      summaryLines.push(`Would have created:`);
      for (const f of result.files) summaryLines.push(`  ${f.path}`);
    } else {
      if (applied.written.length > 0) {
        summaryLines.push(`Wrote ${applied.written.length} file(s):`);
        for (const p of applied.written) summaryLines.push(`  ${p}`);
      }
      if (applied.skipped.length > 0) {
        summaryLines.push(
          `Skipped ${applied.skipped.length} existing file(s) (use force=true to overwrite):`,
        );
        for (const p of applied.skipped) summaryLines.push(`  ${p}`);
      }
    }
    if (applied.registrationSites.length > 0) {
      summaryLines.push("");
      summaryLines.push("Next steps (manual edits needed):");
      for (const s of applied.registrationSites) {
        summaryLines.push(`  ${s.path}: ${s.hint}`);
      }
    }

    const text = summaryLines.join("\n");
    await callback?.({ text, action: "SCAFFOLD_WIDGET" });

    return {
      success: true,
      text,
      values: {
        written: applied.written.length,
        skipped: applied.skipped.length,
        dryRun,
      },
      data: {
        spec,
        files: result.files.map((f) => f.path),
        written: applied.written,
        skipped: applied.skipped,
        registrationSites: applied.registrationSites,
      },
    };
  },

  examples: [
    [
      {
        name: "user",
        content: {
          text: "Create a new widget called FishingProgressBar with a numeric percent prop.",
        },
      },
      {
        name: "agent",
        content: {
          text: "Wrote 2 file(s):\n  packages/hyperscape-plugin/src/widgets/FishingProgressBarWidget.tsx\n  packages/hyperscape-plugin/src/widgets/__tests__/FishingProgressBarWidget.test.ts\n\nNext steps:\n  packages/hyperscape-plugin/src/index.ts: Re-export FishingProgressBarWidget + register fishingProgressBarRegistration.",
          action: "SCAFFOLD_WIDGET",
        },
      },
    ],
  ],
};
