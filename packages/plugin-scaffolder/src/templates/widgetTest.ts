/**
 * Widget test-companion template. Mirrors the
 * `__tests__/*Widget.test.ts` shape used by the meta-plugin.
 *
 * The generated test asserts:
 *   1. Manifest id, category, defaultSize match the spec.
 *   2. `propsSchema.safeParse(defaultProps)` succeeds.
 *   3. `Registration` object pairs the widget with the component.
 *
 * The path the test uses to import the widget is up to the caller —
 * the template assumes a peer-of-peer layout (`__tests__/Foo.test.ts`
 * imports from `../FooWidget.js`) that matches the meta-plugin's
 * existing tests.
 */

import { camelize } from "../emit";
import type { WidgetSpec } from "../types";

export interface WidgetTestRenderOptions {
  /**
   * Path the test file imports the widget source from. Conventionally
   * `../FooWidget.js` (peer of peer in `__tests__/`). Caller passes
   * a different path if the layout differs.
   */
  readonly importPath: string;
}

export function renderWidgetTest(
  spec: WidgetSpec,
  options: WidgetTestRenderOptions,
): string {
  const camel = camelize(spec.name);
  const propsSchemaName = `${camel}PropsSchema`;
  const widgetName = `${camel}Widget`;
  const registrationName = `${camel}Registration`;

  return `import { describe, expect, it } from "vitest";
import {
  ${widgetName},
  ${propsSchemaName},
  ${registrationName},
  ${spec.name},
} from ${JSON.stringify(options.importPath)};

describe("${spec.name}Widget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(${widgetName}.manifest.id).toBe(${JSON.stringify(spec.manifestId)});
    expect(${widgetName}.manifest.category).toBe(${JSON.stringify(spec.category)});
    expect(${widgetName}.manifest.defaultSize).toEqual({
      width: ${spec.defaultSize.width},
      height: ${spec.defaultSize.height},
    });
  });

  it("default props parse cleanly through the schema", () => {
    const parsed = ${propsSchemaName}.safeParse(${widgetName}.defaultProps);
    expect(parsed.success).toBe(true);
  });

  it("registration pairs the widget with the React component", () => {
    expect(${registrationName}.widget).toBe(${widgetName});
    expect(${registrationName}.Component).toBe(${spec.name});
  });
});
`;
}
