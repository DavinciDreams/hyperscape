/**
 * StepIndicatorWidget — multi-step progress indicator with
 * numbered/checked step circles and connecting lines.
 *
 * Phase D6.c forty-ninth widget migration. New foundational
 * primitive — used wherever a multi-step flow shows progress
 * (character creation wizards, tutorials, onboarding, checkout
 * flows, agent setup steps, etc.). Substrate-promote: zero theme-
 * store dependency, all colors as explicit props, exported
 * `STEP_STATES` enum so hosts can drive each step's visual.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <StepIndicator
 *     steps={[
 *       { id: "name",     label: "Name",     state: "complete" },
 *       { id: "appearance",label: "Appearance",state: "current"  },
 *       { id: "review",   label: "Review",   state: "pending"  },
 *     ]}
 *     onStepClick={(id) => jumpToStep(id)}
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

/** Per-step visual state. */
export const STEP_STATES = ["pending", "current", "complete", "error"] as const;
export type StepState = (typeof STEP_STATES)[number];

/** A single step entry. */
export const stepIndicatorItemSchema = z.object({
  /** Stable id for the React key + onStepClick payload. */
  id: z.string().min(1),
  /** Visible label rendered below the step circle. */
  label: z.string().default(""),
  /** Optional sub-label / description below the label. */
  description: z.string().default(""),
  /** Visual state. */
  state: z.enum(STEP_STATES).default("pending"),
});

export type StepIndicatorItem = z.infer<typeof stepIndicatorItemSchema>;

/** Layout direction. */
export const STEP_INDICATOR_ORIENTATIONS = ["horizontal", "vertical"] as const;
export type StepIndicatorOrientation =
  (typeof STEP_INDICATOR_ORIENTATIONS)[number];

/** Props the widget exposes through its Zod schema. */
export const stepIndicatorPropsSchema = z.object({
  /** Step list. */
  steps: z.array(stepIndicatorItemSchema).default(() => []),
  /** Layout direction. */
  orientation: z.enum(STEP_INDICATOR_ORIENTATIONS).default("horizontal"),
  /** Diameter of each step circle (px). */
  circleSizePx: z.number().int().min(12).max(64).default(28),
  /** Connecting-line thickness (px). */
  lineThicknessPx: z.number().int().min(1).max(8).default(2),
  /** Pending state colors. */
  pendingBackgroundColor: z.string().default("rgba(20, 24, 36, 0.85)"),
  pendingBorderColor: z.string().default("#3a3f4d"),
  pendingTextColor: z.string().default("#6e7585"),
  /** Current state colors. */
  currentBackgroundColor: z.string().default("rgba(255, 216, 77, 0.15)"),
  currentBorderColor: z.string().default("#ffd84d"),
  currentTextColor: z.string().default("#ffd84d"),
  /** Complete state colors. */
  completeBackgroundColor: z.string().default("#4ade80"),
  completeBorderColor: z.string().default("#4ade80"),
  completeTextColor: z.string().default("#0f1119"),
  /** Error state colors. */
  errorBackgroundColor: z.string().default("rgba(232, 69, 69, 0.15)"),
  errorBorderColor: z.string().default("#e84545"),
  errorTextColor: z.string().default("#e84545"),
  /** Connector-line color (incomplete). */
  lineColor: z.string().default("#3a3f4d"),
  /** Connector-line color (between two complete steps). */
  lineCompleteColor: z.string().default("#4ade80"),
  /** Label color (current step). */
  labelCurrentColor: z.string().default("#e6e8ec"),
  /** Label color (other states). */
  labelColor: z.string().default("#a8aec0"),
  /** Description color. */
  descriptionColor: z.string().default("#6e7585"),
  /** Label font size (px). */
  labelFontSize: z.number().int().min(8).max(48).default(12),
  /** Description font size (px). */
  descriptionFontSize: z.number().int().min(8).max(48).default(10),
  /** Step-circle font size (px). */
  circleFontSize: z.number().int().min(8).max(48).default(13),
});

export type StepIndicatorProps = z.infer<typeof stepIndicatorPropsSchema>;

/** Extended runtime props — callback not modeled in the schema. */
export interface StepIndicatorRuntimeProps extends StepIndicatorProps {
  /**
   * Called with the step id when the user clicks a step. Only
   * fires for `complete` and `current` steps when set.
   */
  readonly onStepClick?: (id: string) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const stepIndicatorWidget: Widget<StepIndicatorProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.step-indicator",
    name: "Step Indicator",
    category: "panel",
    defaultSize: { width: 48, height: 12 },
  },
  propsSchema: stepIndicatorPropsSchema,
  defaultProps: {
    steps: [],
    orientation: "horizontal",
    circleSizePx: 28,
    lineThicknessPx: 2,
    pendingBackgroundColor: "rgba(20, 24, 36, 0.85)",
    pendingBorderColor: "#3a3f4d",
    pendingTextColor: "#6e7585",
    currentBackgroundColor: "rgba(255, 216, 77, 0.15)",
    currentBorderColor: "#ffd84d",
    currentTextColor: "#ffd84d",
    completeBackgroundColor: "#4ade80",
    completeBorderColor: "#4ade80",
    completeTextColor: "#0f1119",
    errorBackgroundColor: "rgba(232, 69, 69, 0.15)",
    errorBorderColor: "#e84545",
    errorTextColor: "#e84545",
    lineColor: "#3a3f4d",
    lineCompleteColor: "#4ade80",
    labelCurrentColor: "#e6e8ec",
    labelColor: "#a8aec0",
    descriptionColor: "#6e7585",
    labelFontSize: 12,
    descriptionFontSize: 10,
    circleFontSize: 13,
  },
});

interface StepCircleColors {
  readonly background: string;
  readonly border: string;
  readonly text: string;
}

function colorsForState(
  state: StepState,
  props: StepIndicatorProps,
): StepCircleColors {
  switch (state) {
    case "current":
      return {
        background: props.currentBackgroundColor,
        border: props.currentBorderColor,
        text: props.currentTextColor,
      };
    case "complete":
      return {
        background: props.completeBackgroundColor,
        border: props.completeBorderColor,
        text: props.completeTextColor,
      };
    case "error":
      return {
        background: props.errorBackgroundColor,
        border: props.errorBorderColor,
        text: props.errorTextColor,
      };
    case "pending":
    default:
      return {
        background: props.pendingBackgroundColor,
        border: props.pendingBorderColor,
        text: props.pendingTextColor,
      };
  }
}

/**
 * React component. Renders a numbered circle per step (or a check
 * mark for complete steps). Connecting line tints to
 * `lineCompleteColor` between two consecutive complete steps.
 */
export function StepIndicator(
  props: StepIndicatorRuntimeProps,
): React.ReactElement {
  const {
    steps,
    orientation,
    circleSizePx,
    lineThicknessPx,
    lineColor,
    lineCompleteColor,
    labelCurrentColor,
    labelColor,
    descriptionColor,
    labelFontSize,
    descriptionFontSize,
    circleFontSize,
    onStepClick,
  } = props;

  const isHorizontal = orientation === "horizontal";

  return (
    <div
      role="list"
      aria-label="Steps"
      style={{
        display: "flex",
        flexDirection: isHorizontal ? "row" : "column",
        alignItems: isHorizontal ? "flex-start" : "stretch",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {steps.map((step, i) => {
        const colors = colorsForState(step.state, props);
        const isClickable =
          (step.state === "complete" || step.state === "current") &&
          onStepClick != null;
        const labelTextColor =
          step.state === "current" ? labelCurrentColor : labelColor;
        const isLast = i === steps.length - 1;
        const nextStep = !isLast ? steps[i + 1] : null;
        const lineIsComplete =
          step.state === "complete" && nextStep?.state === "complete";

        return (
          <React.Fragment key={step.id}>
            <div
              role="listitem"
              aria-current={step.state === "current" ? "step" : undefined}
              style={{
                display: "flex",
                flexDirection: isHorizontal ? "column" : "row",
                alignItems: isHorizontal ? "center" : "flex-start",
                gap: 6,
                flex: isHorizontal ? "0 0 auto" : "0 0 auto",
              }}
            >
              <button
                type="button"
                disabled={!isClickable}
                aria-label={`Step ${i + 1}${step.label ? `: ${step.label}` : ""}`}
                onClick={() => isClickable && onStepClick?.(step.id)}
                style={{
                  width: circleSizePx,
                  height: circleSizePx,
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: colors.background,
                  border: `${lineThicknessPx}px solid ${colors.border}`,
                  color: colors.text,
                  fontSize: circleFontSize,
                  fontWeight: 700,
                  cursor: isClickable ? "pointer" : "default",
                  padding: 0,
                  transition: "background 120ms ease, border-color 120ms ease",
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                {step.state === "complete" ? (
                  <svg
                    width={Math.floor(circleSizePx * 0.55)}
                    height={Math.floor(circleSizePx * 0.55)}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke={colors.text}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="3,8 7,12 13,4" />
                  </svg>
                ) : step.state === "error" ? (
                  "!"
                ) : (
                  i + 1
                )}
              </button>
              {(step.label || step.description) && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isHorizontal ? "center" : "flex-start",
                    gap: 1,
                    minWidth: 0,
                    paddingTop: isHorizontal ? 0 : 2,
                  }}
                >
                  {step.label && (
                    <span
                      style={{
                        color: labelTextColor,
                        fontSize: labelFontSize,
                        fontWeight: step.state === "current" ? 600 : 500,
                        textAlign: isHorizontal ? "center" : "left",
                      }}
                    >
                      {step.label}
                    </span>
                  )}
                  {step.description && (
                    <span
                      style={{
                        color: descriptionColor,
                        fontSize: descriptionFontSize,
                        textAlign: isHorizontal ? "center" : "left",
                      }}
                    >
                      {step.description}
                    </span>
                  )}
                </div>
              )}
            </div>
            {!isLast && (
              <div
                aria-hidden="true"
                style={{
                  flex: 1,
                  alignSelf: "stretch",
                  ...(isHorizontal
                    ? {
                        height: lineThicknessPx,
                        marginTop: circleSizePx / 2 - lineThicknessPx / 2,
                        background: lineIsComplete
                          ? lineCompleteColor
                          : lineColor,
                      }
                    : {
                        width: lineThicknessPx,
                        marginLeft: circleSizePx / 2 - lineThicknessPx / 2,
                        minHeight: 16,
                        background: lineIsComplete
                          ? lineCompleteColor
                          : lineColor,
                      }),
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const stepIndicatorRegistration: WidgetRegistration<
  StepIndicatorProps,
  React.ComponentType<StepIndicatorProps>
> = {
  widget: stepIndicatorWidget,
  Component: StepIndicator as React.ComponentType<StepIndicatorProps>,
};
