/**
 * `actionsToAnthropicTools` — adapter that converts ElizaOS
 * `Action[]` into Anthropic SDK `Tool[]` definitions.
 *
 * The mapping is straightforward:
 *
 *   Action.name              → Tool.name
 *   Action.description       → Tool.description
 *   Action.parameters[]      → Tool.input_schema (JSON Schema object)
 *
 * Each parameter's `schema` field is already JSON-Schema-shaped
 * (the shape ElizaOS itself uses), so we mostly compose them into
 * a single `{ type: "object", properties: {...}, required: [...] }`
 * envelope that Anthropic's tool-use API expects.
 *
 * This is the single point of vocabulary conversion. Everything
 * downstream (tool dispatch, result formatting) speaks Anthropic's
 * vocabulary; everything upstream (action handlers, parameter
 * extraction) speaks ElizaOS's vocabulary.
 */

import type {
  Action,
  ActionParameter,
  ActionParameterSchema,
} from "@elizaos/core";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";

/**
 * Convert one action to one Anthropic Tool. Pure: no runtime,
 * no LLM call, just shape conversion.
 */
export function actionToAnthropicTool(action: Action): Tool {
  const parameters = action.parameters ?? [];
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of parameters) {
    properties[param.name] = paramToJsonSchema(param);
    if (param.required) required.push(param.name);
  }

  return {
    name: action.name,
    description: action.description,
    input_schema: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    } as Tool.InputSchema,
  };
}

/**
 * Convert an array of actions to an array of Anthropic Tools.
 * Order preserved.
 */
export function actionsToAnthropicTools(
  actions: ReadonlyArray<Action>,
): Tool[] {
  return actions.map(actionToAnthropicTool);
}

function paramToJsonSchema(param: ActionParameter): Record<string, unknown> {
  const schema = param.schema;
  const out: Record<string, unknown> = { ...flattenSchema(schema) };
  if (param.description) out.description = param.description;
  return out;
}

/**
 * Flatten an ElizaOS `ActionParameterSchema` into a plain JSON
 * Schema object. The shapes overlap heavily — we mostly forward
 * fields and recurse into nested objects/arrays.
 */
function flattenSchema(schema: ActionParameterSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: schema.type,
  };
  if (schema.enum && schema.enum.length > 0) out.enum = schema.enum;
  // JSON Schema spec uses `default`; ElizaOS allows either name.
  if (schema.default !== undefined) out.default = schema.default;
  if (schema.properties) {
    const nested: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      nested[k] = flattenSchema(v);
    }
    out.properties = nested;
  }
  if (schema.items) out.items = flattenSchema(schema.items);
  return out;
}
