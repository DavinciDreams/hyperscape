/**
 * `scaffoldWidget` — turn a `WidgetSpec` into a list of files +
 * registration sites the caller needs to wire up.
 *
 * Pure function. No filesystem, no shell, no network. The caller
 * (CLI, agent, test) decides what to do with the result.
 */

import { renderWidgetSource } from "./templates/widgetSource.js";
import { renderWidgetTest } from "./templates/widgetTest.js";
import type {
  ScaffoldResult,
  ScaffoldWidgetOptions,
  ScaffoldedFile,
  RegistrationSite,
  WidgetSpec,
} from "./types.js";
import { assertWidgetSpec } from "./validate.js";

const DEFAULT_WIDGETS_DIR = "packages/hyperscape-plugin/src/widgets";
const DEFAULT_INDEX_FILE = "packages/hyperscape-plugin/src/index.ts";

export function scaffoldWidget(
  spec: WidgetSpec,
  options: ScaffoldWidgetOptions = {},
): ScaffoldResult {
  assertWidgetSpec(spec);

  const widgetsDir = options.widgetsDir ?? DEFAULT_WIDGETS_DIR;
  const testsDir = options.testsDir ?? `${widgetsDir}/__tests__`;
  const indexFile = options.indexFile ?? DEFAULT_INDEX_FILE;

  const sourcePath = `${widgetsDir}/${spec.name}Widget.tsx`;
  const testPath = `${testsDir}/${spec.name}Widget.test.ts`;

  const files: ScaffoldedFile[] = [
    {
      path: sourcePath,
      content: renderWidgetSource(spec),
    },
  ];

  if (!options.skipTest) {
    files.push({
      path: testPath,
      content: renderWidgetTest(spec, {
        importPath: `../${spec.name}Widget.js`,
      }),
    });
  }

  const registrationSites: RegistrationSite[] = [
    {
      path: indexFile,
      hint: `Re-export ${spec.name}Widget + register ${spec.name}Registration alongside the existing widget contributions.`,
    },
  ];

  return { files, registrationSites };
}
