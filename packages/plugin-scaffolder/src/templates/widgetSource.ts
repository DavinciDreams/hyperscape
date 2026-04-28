/**
 * Widget source template. Mirrors the established
 * `*Widget.tsx` shape used by `packages/hyperscape-plugin/src/widgets/`
 * and `packages/ui-widgets/src/widgets/`:
 *
 *   1. JSDoc header
 *   2. `import` block — `defineWidget`/`Widget`/`WidgetRegistration`,
 *      React, `z`
 *   3. `*PropsSchema` zod object
 *   4. `Props` type alias from `z.infer`
 *   5. `*Widget` `defineWidget(...)` block
 *   6. React component function
 *   7. `*Registration` bundling the two
 */

import {
  camelize,
  emitDefaultPropsBody,
  emitDestructureList,
  emitPropsSchemaBody,
} from "../emit.js";
import type { WidgetSpec } from "../types.js";

export function renderWidgetSource(spec: WidgetSpec): string {
  const camel = camelize(spec.name);
  const propsType = `${spec.name}Props`;
  const propsSchemaName = `${camel}PropsSchema`;
  const widgetName = `${camel}Widget`;
  const registrationName = `${camel}Registration`;
  const displayName = spec.displayName ?? spec.name;
  const description = spec.description ?? `Scaffolded ${spec.name} widget.`;

  const schemaBody = emitPropsSchemaBody(spec);
  const defaultPropsBody = emitDefaultPropsBody(spec);
  const destructure = emitDestructureList(spec);

  // The schema body is intentionally injected without surrounding
  // braces so the empty-props case collapses cleanly.
  const schemaBlock =
    schemaBody.length > 0
      ? `export const ${propsSchemaName} = z.object({\n${schemaBody}\n});`
      : `export const ${propsSchemaName} = z.object({});`;

  const defaultPropsBlock =
    defaultPropsBody.length > 0
      ? `  defaultProps: {\n${defaultPropsBody}\n  },`
      : `  defaultProps: {},`;

  const propsParam =
    spec.props.length > 0 ? `props: ${propsType}` : `_props: ${propsType}`;

  const destructureLine =
    spec.props.length > 0 ? `  const ${destructure} = props;\n` : "";

  return `/**
 * ${spec.name}Widget — ${description}
 *
 * Scaffolded by \`@hyperforge/plugin-scaffolder\`. Replace this
 * placeholder render body with the real component implementation.
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

${schemaBlock}

export type ${propsType} = z.infer<typeof ${propsSchemaName}>;

export const ${widgetName}: Widget<${propsType}> = defineWidget({
  manifest: {
    id: ${JSON.stringify(spec.manifestId)},
    name: ${JSON.stringify(displayName)},
    category: ${JSON.stringify(spec.category)},
    defaultSize: { width: ${spec.defaultSize.width}, height: ${spec.defaultSize.height} },
  },
  propsSchema: ${propsSchemaName},
${defaultPropsBlock}
});

export function ${spec.name}(${propsParam}): React.ReactElement {
${destructureLine}  return React.createElement("span", null, ${JSON.stringify(displayName)});
}

export const ${registrationName}: WidgetRegistration<
  ${propsType},
  React.ComponentType<${propsType}>
> = {
  widget: ${widgetName},
  Component: ${spec.name},
};
`;
}
