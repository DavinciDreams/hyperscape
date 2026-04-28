/**
 * ArrayInputWidget — reusable list-of-strings editor with add /
 * remove / inline-edit support.
 *
 * Phase D6.c twentieth widget migration. Mirrors the legacy
 * hand-coded `ArrayInput` (used in character templates). Substrate-
 * promote: the legacy component imports `lucide-react` icons + uses
 * hardcoded hex theme colors. The widget replaces the icons with
 * plain unicode glyphs and exposes all colors as explicit props.
 *
 * Use cases beyond the legacy callsite:
 *   - tag editors
 *   - allow-list / block-list editors
 *   - any "enter N strings" form field
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <ArrayInput
 *     label="Bio"
 *     values={template.bio}
 *     onChange={(next) => setTemplate({ ...template, bio: next })}
 *     placeholder="Add a line"
 *     inputType="textarea"
 *     maxItems={5}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useState } from "react";
import { z } from "zod";

/** Accepted input types. */
export const ARRAY_INPUT_TYPES = ["text", "textarea"] as const;
export type ArrayInputType = (typeof ARRAY_INPUT_TYPES)[number];

/** Props the widget exposes through its Zod schema. */
export const arrayInputPropsSchema = z.object({
  /** Field label. */
  label: z.string().default(""),
  /** Optional sub-label / description. */
  description: z.string().default(""),
  /** Current array of values. */
  values: z.array(z.string()).default(() => []),
  /** Placeholder for the "add new" input. */
  placeholder: z.string().default("Enter value"),
  /** Whether the field is required (renders a `*` after the label). */
  required: z.boolean().default(false),
  /** Optional maximum items (0 = unlimited). */
  maxItems: z.number().int().min(0).max(1_000).default(0),
  /** Input flavor — `"text"` (Enter to add) or `"textarea"` (multi-line). */
  inputType: z.enum(ARRAY_INPUT_TYPES).default("text"),
  /** Glyph for the "add" button. */
  addGlyph: z.string().min(1).default("+"),
  /** Glyph for the "remove" button. */
  removeGlyph: z.string().min(1).default("✕"),
  /** Label text color. */
  labelColor: z.string().default("rgba(242, 208, 138, 0.8)"),
  /** Description text color. */
  descriptionColor: z.string().default("rgba(242, 208, 138, 0.4)"),
  /** Required-marker color. */
  requiredMarkerColor: z.string().default("#ef4444"),
  /** Input/textarea background. */
  inputBackgroundColor: z.string().default("#1a1005"),
  /** Input/textarea border color. */
  inputBorderColor: z.string().default("rgba(139, 69, 19, 0.3)"),
  /** Input focus border color. */
  inputFocusBorderColor: z.string().default("#f2d08a"),
  /** Input text color. */
  inputTextColor: z.string().default("#e8ebf4"),
  /** Add-button background. */
  addButtonBackgroundColor: z.string().default("rgba(242, 208, 138, 0.1)"),
  /** Add-button border color. */
  addButtonBorderColor: z.string().default("rgba(242, 208, 138, 0.3)"),
  /** Add-button text/glyph color. */
  addButtonTextColor: z.string().default("#f2d08a"),
  /** Remove-button border color. */
  removeButtonBorderColor: z.string().default("rgba(239, 68, 68, 0.3)"),
  /** Remove-button text/glyph color. */
  removeButtonTextColor: z.string().default("#f87171"),
  /** Counter text color (`N / max` under the input). */
  counterColor: z.string().default("rgba(242, 208, 138, 0.4)"),
});

export type ArrayInputProps = z.infer<typeof arrayInputPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface ArrayInputRuntimeProps extends ArrayInputProps {
  /** Called whenever the array changes (add, remove, update). */
  readonly onChange?: (values: string[]) => void;
  /** Called only on add (after `onChange`), with the added item. */
  readonly onAdd?: (item: string) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const arrayInputWidget: Widget<ArrayInputProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.array-input",
    name: "Array Input",
    category: "panel",
    defaultSize: { width: 48, height: 32 },
  },
  propsSchema: arrayInputPropsSchema,
  defaultProps: {
    label: "",
    description: "",
    values: [],
    placeholder: "Enter value",
    required: false,
    maxItems: 0,
    inputType: "text",
    addGlyph: "+",
    removeGlyph: "✕",
    labelColor: "rgba(242, 208, 138, 0.8)",
    descriptionColor: "rgba(242, 208, 138, 0.4)",
    requiredMarkerColor: "#ef4444",
    inputBackgroundColor: "#1a1005",
    inputBorderColor: "rgba(139, 69, 19, 0.3)",
    inputFocusBorderColor: "#f2d08a",
    inputTextColor: "#e8ebf4",
    addButtonBackgroundColor: "rgba(242, 208, 138, 0.1)",
    addButtonBorderColor: "rgba(242, 208, 138, 0.3)",
    addButtonTextColor: "#f2d08a",
    removeButtonBorderColor: "rgba(239, 68, 68, 0.3)",
    removeButtonTextColor: "#f87171",
    counterColor: "rgba(242, 208, 138, 0.4)",
  },
});

/**
 * React component. Renders the existing values as inline-editable
 * inputs with a remove button, and an "add new" row beneath. In
 * `text` mode, Enter adds the new entry; in `textarea` mode, only
 * the explicit add button does.
 */
export function ArrayInput(props: ArrayInputRuntimeProps): React.ReactElement {
  const {
    label,
    description,
    values,
    placeholder,
    required,
    maxItems,
    inputType,
    addGlyph,
    removeGlyph,
    labelColor,
    descriptionColor,
    requiredMarkerColor,
    inputBackgroundColor,
    inputBorderColor,
    inputTextColor,
    addButtonBackgroundColor,
    addButtonBorderColor,
    addButtonTextColor,
    removeButtonBorderColor,
    removeButtonTextColor,
    counterColor,
    onChange,
    onAdd,
  } = props;

  const [newItem, setNewItem] = useState("");

  const isAtCap = maxItems > 0 && values.length >= maxItems;

  const handleAdd = (): void => {
    if (!newItem.trim()) return;
    if (isAtCap) return;
    const trimmed = newItem.trim();
    onChange?.([...values, trimmed]);
    onAdd?.(trimmed);
    setNewItem("");
  };

  const handleRemove = (index: number): void => {
    onChange?.(values.filter((_, i) => i !== index));
  };

  const handleUpdate = (index: number, next: string): void => {
    const updated = [...values];
    updated[index] = next;
    onChange?.(updated);
  };

  const handleKey = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey && inputType === "text") {
      e.preventDefault();
      handleAdd();
    }
  };

  const inputBaseStyle: React.CSSProperties = {
    flex: 1,
    background: inputBackgroundColor,
    border: `1px solid ${inputBorderColor}`,
    borderRadius: 8,
    padding: 12,
    color: inputTextColor,
    outline: "none",
    fontSize: 13,
    resize: "none",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
  };

  const removeButtonStyle: React.CSSProperties = {
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${removeButtonBorderColor}`,
    color: removeButtonTextColor,
    background: "transparent",
    cursor: "pointer",
    fontSize: 14,
    transition: "background 150ms ease",
  };

  const addButtonStyle: React.CSSProperties = {
    padding: "0 16px",
    borderRadius: 8,
    background: addButtonBackgroundColor,
    border: `1px solid ${addButtonBorderColor}`,
    color: addButtonTextColor,
    cursor: !newItem.trim() || isAtCap ? "not-allowed" : "pointer",
    opacity: !newItem.trim() || isAtCap ? 0.5 : 1,
    fontSize: 14,
    fontWeight: 700,
    transition: "background 150ms ease",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {label && (
        <label
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 500,
            color: labelColor,
          }}
        >
          {label}
          {required && (
            <span style={{ color: requiredMarkerColor, marginLeft: 4 }}>*</span>
          )}
        </label>
      )}

      {description && (
        <p
          style={{
            fontSize: 11,
            color: descriptionColor,
            margin: 0,
          }}
        >
          {description}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {values.map((item, index) => (
          <div key={index} style={{ display: "flex", gap: 8 }}>
            {inputType === "textarea" ? (
              <textarea
                value={item}
                onChange={(e) => handleUpdate(index, e.target.value)}
                rows={2}
                style={inputBaseStyle}
              />
            ) : (
              <input
                type="text"
                value={item}
                onChange={(e) => handleUpdate(index, e.target.value)}
                style={inputBaseStyle}
              />
            )}
            <button
              type="button"
              onClick={() => handleRemove(index)}
              style={removeButtonStyle}
              aria-label={`Remove item ${index + 1}`}
              title="Remove"
            >
              {removeGlyph}
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {inputType === "textarea" ? (
          <textarea
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            rows={2}
            disabled={isAtCap}
            style={inputBaseStyle}
          />
        ) : (
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            disabled={isAtCap}
            style={inputBaseStyle}
          />
        )}
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newItem.trim() || isAtCap}
          style={addButtonStyle}
          aria-label="Add item"
          title="Add"
        >
          {addGlyph}
        </button>
      </div>

      {maxItems > 0 && (
        <p
          style={{
            fontSize: 11,
            color: counterColor,
            margin: 0,
          }}
        >
          {values.length} / {maxItems} items
        </p>
      )}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const arrayInputRegistration: WidgetRegistration<
  ArrayInputProps,
  React.ComponentType<ArrayInputProps>
> = {
  widget: arrayInputWidget,
  Component: ArrayInput as React.ComponentType<ArrayInputProps>,
};
