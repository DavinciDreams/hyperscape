/**
 * CodeBlockWidget — preformatted text block with optional copy
 * button and language label.
 *
 * Phase D6.c slice 80 — fiftieth widget. A new foundational
 * primitive for displaying preformatted text (agent memories,
 * action logs, error stack traces, JSON dumps, command output,
 * etc.). Substrate-promote: zero theme-store dependency, all
 * colors as explicit props, optional clipboard copy callback.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <CodeBlock
 *     language="json"
 *     code={JSON.stringify(memory, null, 2)}
 *     showCopy
 *     onCopy={(text) => navigator.clipboard.writeText(text)}
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

/** Props the widget exposes through its Zod schema. */
export const codeBlockPropsSchema = z.object({
  /** Code/text content (preformatted). */
  code: z.string().default(""),
  /**
   * Optional language label rendered in the header (e.g., "ts",
   * "json", "sh"). Empty hides the label.
   */
  language: z.string().default(""),
  /** Render the copy button in the header. */
  showCopy: z.boolean().default(true),
  /** Render line numbers in the gutter. */
  showLineNumbers: z.boolean().default(false),
  /** Wrap long lines instead of horizontal-scrolling. */
  wrapLines: z.boolean().default(false),
  /** Max height in CSS px before vertical scroll kicks in. 0 = unlimited. */
  maxHeightPx: z.number().int().min(0).max(2_048).default(0),
  /** Copy button label (when not yet clicked). */
  copyLabel: z.string().default("Copy"),
  /** Copy button label after click (transient feedback). */
  copiedLabel: z.string().default("Copied!"),
  /** How long to show `copiedLabel` before reverting (ms). */
  copiedFeedbackMs: z.number().int().min(100).max(10_000).default(1_500),
  /** Container background. */
  backgroundColor: z.string().default("rgba(8, 10, 14, 0.85)"),
  /** Container border. */
  borderColor: z.string().default("#3a3f4d"),
  /** Container corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(32).default(6),
  /** Header background. */
  headerBackgroundColor: z.string().default("rgba(20, 24, 36, 0.95)"),
  /** Header border-bottom. */
  headerBorderColor: z.string().default("#3a3f4d"),
  /** Language label color. */
  languageLabelColor: z.string().default("#a8aec0"),
  /** Code text color. */
  codeColor: z.string().default("#e6e8ec"),
  /** Line-number gutter color. */
  lineNumberColor: z.string().default("#6e7585"),
  /** Copy button color (idle). */
  copyButtonColor: z.string().default("#a8aec0"),
  /** Copy button color (hover). */
  copyButtonHoverColor: z.string().default("#ffd84d"),
  /** Copy button color (after copy). */
  copyButtonSuccessColor: z.string().default("#4ade80"),
  /** Body font size (px). */
  fontSize: z.number().int().min(8).max(48).default(12),
  /** Header label font size (px). */
  headerFontSize: z.number().int().min(8).max(48).default(11),
  /** Body padding (px). */
  paddingPx: z.number().int().min(0).max(48).default(12),
});

export type CodeBlockProps = z.infer<typeof codeBlockPropsSchema>;

/** Extended runtime props — callback not modeled in the schema. */
export interface CodeBlockRuntimeProps extends CodeBlockProps {
  /**
   * Called with the code text when the user clicks Copy. The
   * widget handles its own "Copied!" feedback state internally;
   * the host's job is to push the text into clipboard.
   */
  readonly onCopy?: (code: string) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const codeBlockWidget: Widget<CodeBlockProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.code-block",
    name: "Code Block",
    category: "panel",
    defaultSize: { width: 48, height: 24 },
  },
  propsSchema: codeBlockPropsSchema,
  defaultProps: {
    code: "",
    language: "",
    showCopy: true,
    showLineNumbers: false,
    wrapLines: false,
    maxHeightPx: 0,
    copyLabel: "Copy",
    copiedLabel: "Copied!",
    copiedFeedbackMs: 1_500,
    backgroundColor: "rgba(8, 10, 14, 0.85)",
    borderColor: "#3a3f4d",
    borderRadiusPx: 6,
    headerBackgroundColor: "rgba(20, 24, 36, 0.95)",
    headerBorderColor: "#3a3f4d",
    languageLabelColor: "#a8aec0",
    codeColor: "#e6e8ec",
    lineNumberColor: "#6e7585",
    copyButtonColor: "#a8aec0",
    copyButtonHoverColor: "#ffd84d",
    copyButtonSuccessColor: "#4ade80",
    fontSize: 12,
    headerFontSize: 11,
    paddingPx: 12,
  },
});

const MONO_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/**
 * React component. Renders an optional header (language + copy
 * button) followed by a `<pre><code>` block. Internal state tracks
 * the transient "Copied!" feedback after the user clicks Copy.
 */
export function CodeBlock(props: CodeBlockRuntimeProps): React.ReactElement {
  const {
    code,
    language,
    showCopy,
    showLineNumbers,
    wrapLines,
    maxHeightPx,
    copyLabel,
    copiedLabel,
    copiedFeedbackMs,
    backgroundColor,
    borderColor,
    borderRadiusPx,
    headerBackgroundColor,
    headerBorderColor,
    languageLabelColor,
    codeColor,
    lineNumberColor,
    copyButtonColor,
    copyButtonHoverColor,
    copyButtonSuccessColor,
    fontSize,
    headerFontSize,
    paddingPx,
    onCopy,
  } = props;

  const [copied, setCopied] = React.useState(false);
  const [hover, setHover] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), copiedFeedbackMs);
    return () => clearTimeout(timer);
  }, [copied, copiedFeedbackMs]);

  const handleCopy = (): void => {
    onCopy?.(code);
    setCopied(true);
  };

  const showHeader = language.length > 0 || showCopy;
  const lines = showLineNumbers ? code.split("\n") : null;
  const lineNumberWidth = lines ? String(lines.length).length : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: backgroundColor,
        border: `1px solid ${borderColor}`,
        borderRadius: borderRadiusPx,
        overflow: "hidden",
        fontFamily: MONO_FONT_FAMILY,
      }}
    >
      {showHeader && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `6px ${paddingPx}px`,
            background: headerBackgroundColor,
            borderBottom: `1px solid ${headerBorderColor}`,
          }}
        >
          {language ? (
            <span
              style={{
                fontSize: headerFontSize,
                color: languageLabelColor,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                fontWeight: 600,
              }}
            >
              {language}
            </span>
          ) : (
            <span />
          )}
          {showCopy && (
            <button
              type="button"
              onClick={handleCopy}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              style={{
                background: "transparent",
                border: "none",
                padding: "2px 6px",
                fontSize: headerFontSize,
                fontWeight: 600,
                cursor: "pointer",
                color: copied
                  ? copyButtonSuccessColor
                  : hover
                    ? copyButtonHoverColor
                    : copyButtonColor,
                transition: "color 120ms ease",
                fontFamily: "inherit",
              }}
            >
              {copied ? copiedLabel : copyLabel}
            </button>
          )}
        </div>
      )}
      <pre
        style={{
          margin: 0,
          padding: paddingPx,
          color: codeColor,
          fontSize,
          lineHeight: 1.5,
          maxHeight: maxHeightPx > 0 ? maxHeightPx : undefined,
          overflow: maxHeightPx > 0 ? "auto" : undefined,
          whiteSpace: wrapLines ? "pre-wrap" : "pre",
          wordBreak: wrapLines ? "break-word" : undefined,
        }}
      >
        {lines ? (
          <code style={{ display: "block" }}>
            {lines.map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 12 }}>
                <span
                  aria-hidden="true"
                  style={{
                    color: lineNumberColor,
                    userSelect: "none",
                    minWidth: lineNumberWidth * (fontSize * 0.6),
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ flex: 1 }}>{line || " "}</span>
              </div>
            ))}
          </code>
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const codeBlockRegistration: WidgetRegistration<
  CodeBlockProps,
  React.ComponentType<CodeBlockProps>
> = {
  widget: codeBlockWidget,
  Component: CodeBlock as React.ComponentType<CodeBlockProps>,
};
