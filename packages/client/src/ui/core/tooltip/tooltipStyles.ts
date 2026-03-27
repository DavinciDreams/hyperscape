import type React from "react";
import type { Theme } from "@/ui";

type TooltipTone = "default" | "success" | "danger" | "warning";

function getToneColors(theme: Theme, tone: TooltipTone) {
  switch (tone) {
    case "success":
      return {
        text: theme.colors.state.success,
        background: `${theme.colors.state.success}22`,
        border: `${theme.colors.state.success}4d`,
      };
    case "danger":
      return {
        text: theme.colors.state.danger,
        background: `${theme.colors.state.danger}22`,
        border: `${theme.colors.state.danger}4d`,
      };
    case "warning":
      return {
        text: theme.colors.state.warning,
        background: `${theme.colors.state.warning}22`,
        border: `${theme.colors.state.warning}4d`,
      };
    default:
      return {
        text: theme.colors.accent.secondary,
        background: `${theme.colors.accent.secondary}18`,
        border: `${theme.colors.accent.secondary}33`,
      };
  }
}

export function getTooltipTitleStyle(
  theme: Theme,
  accentColor = theme.colors.accent.secondary,
): React.CSSProperties {
  return {
    color: accentColor,
    fontWeight: 700,
    fontSize: "13px",
    lineHeight: 1.2,
  };
}

export function getTooltipMetaStyle(theme: Theme): React.CSSProperties {
  return {
    color: theme.colors.text.muted,
    fontSize: "11px",
    lineHeight: 1.3,
  };
}

export function getTooltipBodyStyle(theme: Theme): React.CSSProperties {
  return {
    color: theme.colors.text.secondary,
    fontSize: "11px",
    lineHeight: 1.45,
  };
}

export function getTooltipDividerStyle(
  theme: Theme,
  accentColor = theme.colors.border.default,
): React.CSSProperties {
  return {
    borderTop: `1px solid ${accentColor}33`,
    marginTop: "8px",
    paddingTop: "8px",
  };
}

export function getTooltipTagStyle(theme: Theme): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 6px",
    borderRadius: theme.borderRadius.sm,
    background: `${theme.colors.background.tertiary}cc`,
    border: `1px solid ${theme.colors.border.default}33`,
    color: theme.colors.text.secondary,
    fontSize: "10px",
    lineHeight: 1.2,
  };
}

export function getTooltipStatusStyle(
  theme: Theme,
  tone: TooltipTone,
): React.CSSProperties {
  const colors = getToneColors(theme, tone);
  return {
    marginTop: "8px",
    padding: "5px 8px",
    borderRadius: theme.borderRadius.sm,
    background: colors.background,
    border: `1px solid ${colors.border}`,
    color: colors.text,
    fontSize: "10px",
    lineHeight: 1.3,
    textAlign: "center",
    fontWeight: 600,
  };
}
