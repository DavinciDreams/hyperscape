/**
 * KeyboardShortcutHintWidget — `[Key] Action` hint for HUD prompts.
 *
 * Phase D6.c forty-fourth widget migration. New foundational
 * primitive (no single legacy callsite — the codebase inlines
 * keyboard-hint markup per use site, often inside interaction
 * prompts ("[E] Interact"), help banners ("[Tab] Toggle UI"),
 * combat hints ("[Space] Jump"), etc.). Substrate-promote: zero
 * theme-store dependency, all colors as explicit props,
 * key-cap pill rendered as styled `<kbd>` for screen readers.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <KeyboardShortcutHint
 *     keys={["E"]}
 *     action="Interact"
 *   />
 *
 *   <KeyboardShortcutHint
 *     keys={["Ctrl", "Shift", "P"]}
 *     action="Open command palette"
 *     joiner="+"
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/** Layout direction — affects the keys-to-action ordering. */
export const HINT_ORIENTATIONS = ["row", "column"] as const;
export type HintOrientation = (typeof HINT_ORIENTATIONS)[number];

/** Props the widget exposes through its Zod schema. */
export const keyboardShortcutHintPropsSchema = z.object({
  /** Key labels rendered as styled key-cap pills. */
  keys: z.array(z.string().min(1)).default(() => []),
  /**
   * Joiner glyph rendered between keys (e.g., `"+"` for chord,
   * `","` for sequence, `""` to render keys flush together).
   */
  joiner: z.string().default("+"),
  /** Action description (e.g., "Interact"). Empty hides it. */
  action: z.string().default(""),
  /** Layout direction. */
  orientation: z.enum(HINT_ORIENTATIONS).default("row"),
  /** Key-cap background. */
  keyBackgroundColor: z.string().default("rgba(40, 45, 60, 0.95)"),
  /** Key-cap border color. */
  keyBorderColor: z.string().default("#3a3f4d"),
  /** Key-cap text color. */
  keyTextColor: z.string().default("#e6e8ec"),
  /** Action text color. */
  actionColor: z.string().default("#a8aec0"),
  /** Joiner glyph color. */
  joinerColor: z.string().default("#6e7585"),
  /** Key-cap font size (px). */
  keyFontSize: z.number().int().min(8).max(48).default(11),
  /** Action font size (px). */
  actionFontSize: z.number().int().min(8).max(48).default(12),
  /** Vertical padding inside each key cap (px). */
  keyPaddingYPx: z.number().int().min(0).max(16).default(2),
  /** Horizontal padding inside each key cap (px). */
  keyPaddingXPx: z.number().int().min(0).max(16).default(6),
  /** Min width of each key cap (px). */
  keyMinWidthPx: z.number().int().min(8).max(64).default(16),
  /** Corner radius of each key cap (px). */
  keyBorderRadiusPx: z.number().int().min(0).max(16).default(3),
  /** Gap between keys, joiner, and action (px). */
  gapPx: z.number().int().min(0).max(16).default(4),
  /** Use a monospace font for the keys (default true for clarity). */
  monospace: z.boolean().default(true),
});

export type KeyboardShortcutHintProps = z.infer<
  typeof keyboardShortcutHintPropsSchema
>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const keyboardShortcutHintWidget: Widget<KeyboardShortcutHintProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.keyboard-shortcut-hint",
      name: "Keyboard Shortcut Hint",
      category: "hud",
      defaultSize: { width: 12, height: 4 },
    },
    propsSchema: keyboardShortcutHintPropsSchema,
    defaultProps: {
      keys: [],
      joiner: "+",
      action: "",
      orientation: "row",
      keyBackgroundColor: "rgba(40, 45, 60, 0.95)",
      keyBorderColor: "#3a3f4d",
      keyTextColor: "#e6e8ec",
      actionColor: "#a8aec0",
      joinerColor: "#6e7585",
      keyFontSize: 11,
      actionFontSize: 12,
      keyPaddingYPx: 2,
      keyPaddingXPx: 6,
      keyMinWidthPx: 16,
      keyBorderRadiusPx: 3,
      gapPx: 4,
      monospace: true,
    },
  });

const SANS_FONT_FAMILY =
  "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
const MONO_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/**
 * Format a keyboard hint as a plain string — used for the
 * `aria-label` and any host-side logging.
 *
 *   formatHintLabel(["E"], "+", "Interact")            → "E: Interact"
 *   formatHintLabel(["Ctrl", "Shift", "P"], "+", "Pal") → "Ctrl + Shift + P: Pal"
 *   formatHintLabel(["A"], "+", "")                    → "A"
 */
export function formatHintLabel(
  keys: ReadonlyArray<string>,
  joiner: string,
  action: string,
): string {
  const sep = joiner.trim().length === 0 ? joiner : ` ${joiner.trim()} `;
  const keyPart = keys.join(sep);
  if (!action) return keyPart;
  if (!keyPart) return action;
  return `${keyPart}: ${action}`;
}

/**
 * React component. Renders each key as a `<kbd>` pill, with the
 * `joiner` glyph between them, and the `action` text after.
 */
export function KeyboardShortcutHint(
  props: KeyboardShortcutHintProps,
): React.ReactElement {
  const {
    keys,
    joiner,
    action,
    orientation,
    keyBackgroundColor,
    keyBorderColor,
    keyTextColor,
    actionColor,
    joinerColor,
    keyFontSize,
    actionFontSize,
    keyPaddingYPx,
    keyPaddingXPx,
    keyMinWidthPx,
    keyBorderRadiusPx,
    gapPx,
    monospace,
  } = props;

  const keyFontFamily = monospace ? MONO_FONT_FAMILY : SANS_FONT_FAMILY;
  const ariaLabel = formatHintLabel(keys, joiner, action);

  const keyPills = keys.map((key, i) => (
    <React.Fragment key={`${i}-${key}`}>
      <kbd
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: keyMinWidthPx,
          padding: `${keyPaddingYPx}px ${keyPaddingXPx}px`,
          background: keyBackgroundColor,
          border: `1px solid ${keyBorderColor}`,
          borderRadius: keyBorderRadiusPx,
          color: keyTextColor,
          fontFamily: keyFontFamily,
          fontSize: keyFontSize,
          fontWeight: 600,
          lineHeight: 1,
          boxShadow: "0 1px 0 rgba(0, 0, 0, 0.3)",
        }}
      >
        {key}
      </kbd>
      {i < keys.length - 1 && joiner && (
        <span
          aria-hidden="true"
          style={{
            color: joinerColor,
            fontSize: keyFontSize,
            userSelect: "none",
          }}
        >
          {joiner}
        </span>
      )}
    </React.Fragment>
  ));

  return (
    <span
      role="note"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        flexDirection: orientation === "row" ? "row" : "column",
        alignItems: orientation === "row" ? "center" : "flex-start",
        gap: gapPx,
        fontFamily: SANS_FONT_FAMILY,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: gapPx,
        }}
      >
        {keyPills}
      </span>
      {action && (
        <span style={{ color: actionColor, fontSize: actionFontSize }}>
          {action}
        </span>
      )}
    </span>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const keyboardShortcutHintRegistration: WidgetRegistration<
  KeyboardShortcutHintProps,
  React.ComponentType<KeyboardShortcutHintProps>
> = {
  widget: keyboardShortcutHintWidget,
  Component: KeyboardShortcutHint,
};
