/**
 * Theme System for Hyperscape UI
 *
 * Two theme variants:
 * - base: Clean, minimal dark theme
 * - hyperscape: RS3-inspired dark theme with gold/bronze accents and glassmorphism
 *
 * Based on Runescape 3 visual design specifications.
 *
 * @packageDocumentation
 */

import type React from "react";

export type ShellControlButtonStyle = React.CSSProperties & {
  "--shell-button-hover-bg": string;
  "--shell-button-hover-fg": string;
};

/** Complete theme interface */
export interface Theme {
  /** Theme identifier */
  name: "base" | "hyperscape";

  /** Color palette */
  colors: {
    background: {
      primary: string;
      secondary: string;
      tertiary: string;
      overlay: string;
      glass: string;
      /** Semi-transparent panel background (primary) - use for panel containers */
      panelPrimary: string;
      /** Semi-transparent panel background (secondary) - use for panel sections */
      panelSecondary: string;
      /** Hover state background */
      hover: string;
    };
    text: {
      primary: string;
      secondary: string;
      muted: string;
      disabled: string;
      link: string;
      accent: string;
    };
    border: {
      default: string;
      hover: string;
      active: string;
      focus: string;
      decorative: string;
    };
    accent: {
      primary: string;
      secondary: string;
      hover: string;
      active: string;
      /** Gold accent color */
      gold: string;
    };
    state: {
      success: string;
      warning: string;
      danger: string;
      info: string;
    };
    status: {
      hp: string;
      hpBackground: string;
      prayer: string;
      prayerBackground: string;
      adrenaline: string;
      adrenalineBackground: string;
      energy: string;
      energyBackground: string;
    };
    slot: {
      empty: string;
      filled: string;
      hover: string;
      selected: string;
      disabled: string;
    };
  };

  /** Spacing scale (8px grid) */
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    grid: number;
  };

  /** Typography */
  typography: {
    fontFamily: {
      body: string;
      heading: string;
      mono: string;
    };
    fontSize: {
      xs: string;
      sm: string;
      base: string;
      lg: string;
      xl: string;
      xxl: string;
    };
    fontWeight: {
      normal: number;
      medium: number;
      semibold: number;
      bold: number;
    };
    lineHeight: {
      tight: number;
      normal: number;
      relaxed: number;
    };
  };

  /** Border radius */
  borderRadius: {
    none: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: string;
  };

  /** Box shadows */
  shadows: {
    none: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    window: string;
    glow: string;
  };

  /** Z-index layers */
  zIndex: {
    base: number;
    dropdown: number;
    sticky: number;
    window: number;
    overlay: number;
    modal: number;
    popover: number;
    tooltip: number;
  };

  /** Transitions */
  transitions: {
    fast: string;
    normal: string;
    slow: string;
  };

  /** Glassmorphism settings */
  glass: {
    blur: number;
    opacity: number;
    borderOpacity: number;
  };

  /** Panel/window specific styles */
  panel: {
    headerHeight: number;
    borderWidth: number;
    minWidth: number;
    minHeight: number;
  };

  /** Slot grid specific styles (inventory, action bar) */
  slot: {
    size: number;
    gap: number;
    borderRadius: number;
    iconSize: number;
  };

  /** Window system configuration */
  window: {
    /** Resize handle size in pixels */
    resizeHandleSize: number;
    /** Corner resize handle size in pixels */
    resizeCornerSize: number;
    /** Edge snap threshold in pixels */
    edgeSnapThreshold: number;
    /** Alignment guide snap threshold in pixels */
    guideSnapThreshold: number;
  };
}

/**
 * Base Theme
 * Clean, minimal dark theme with modern aesthetics
 */
export const baseTheme: Theme = {
  name: "base",

  colors: {
    background: {
      primary: "#1c1c20", // Slightly lighter base
      secondary: "#32323a", // Much lighter for contrast
      tertiary: "#4e4e58", // Significantly lighter for clear separation
      overlay: "rgba(0, 0, 0, 0.7)",
      glass: "rgba(28, 28, 32, 0.78)",
      panelPrimary: "rgba(35, 35, 42, 0.75)", // Lighter panel background
      panelSecondary: "rgba(58, 58, 68, 0.75)", // Much more visible panel section
      hover: "#2a2a32", // Hover state background
    },
    text: {
      primary: "#fafafa", // Zinc-50
      secondary: "#b8b8c0", // Brighter secondary
      muted: "#8888a0", // Lighter muted
      disabled: "#606068", // Lighter disabled
      link: "#70b0ff", // Brighter blue
      accent: "#70b0ff",
    },
    border: {
      default: "#606068", // Much lighter for visibility
      hover: "#808090", // Lighter
      active: "#a0a0b0", // Lighter
      focus: "#70b0ff", // Brighter blue
      decorative: "#606068", // Lighter for visibility
    },
    accent: {
      primary: "#3b82f6", // Blue-500
      secondary: "#60a5fa", // Blue-400
      hover: "#2563eb", // Blue-600
      active: "#1d4ed8", // Blue-700
      gold: "#f59e0b", // Amber-500
    },
    state: {
      success: "#22c55e", // Green-500
      warning: "#f59e0b", // Amber-500
      danger: "#ef4444", // Red-500
      info: "#3b82f6", // Blue-500
    },
    status: {
      hp: "#ef4444",
      hpBackground: "#450a0a",
      prayer: "#3b82f6",
      prayerBackground: "#172554",
      adrenaline: "#f59e0b",
      adrenalineBackground: "#451a03",
      energy: "#22c55e",
      energyBackground: "#14532d",
    },
    slot: {
      empty: "#24242a", // Lighter for visibility
      filled: "#38383e", // Much lighter for contrast
      hover: "#50505a", // Lighter hover state
      selected: "#686870", // Lighter selected state
      disabled: "#18181c", // Slightly lighter disabled
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    grid: 8,
  },

  typography: {
    fontFamily: {
      body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      heading:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: '"SF Mono", "Fira Code", "Fira Mono", Menlo, monospace',
    },
    fontSize: {
      xs: "10px",
      sm: "12px",
      base: "14px",
      lg: "16px",
      xl: "20px",
      xxl: "24px",
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },

  borderRadius: {
    none: 0,
    sm: 2,
    md: 4,
    lg: 8,
    xl: 12,
    full: "9999px",
  },

  shadows: {
    none: "none",
    sm: "0 1px 2px rgba(0, 0, 0, 0.3)",
    md: "0 4px 6px rgba(0, 0, 0, 0.4)",
    lg: "0 10px 15px rgba(0, 0, 0, 0.5)",
    xl: "0 20px 25px rgba(0, 0, 0, 0.6)",
    window: "0 8px 32px rgba(0, 0, 0, 0.5)",
    glow: "0 0 20px rgba(74, 158, 255, 0.3)",
  },

  zIndex: {
    base: 0,
    dropdown: 100,
    sticky: 200,
    window: 1000,
    overlay: 2000,
    modal: 3000,
    popover: 4000,
    tooltip: 9999,
  },

  transitions: {
    fast: "100ms ease",
    normal: "200ms ease",
    slow: "300ms ease",
  },

  glass: {
    blur: 12,
    opacity: 0.85,
    borderOpacity: 0.3,
  },

  panel: {
    headerHeight: 32,
    borderWidth: 1,
    minWidth: 260,
    minHeight: 195,
  },

  slot: {
    size: 36,
    gap: 4,
    borderRadius: 4,
    iconSize: 32,
  },

  window: {
    resizeHandleSize: 8,
    resizeCornerSize: 12,
    edgeSnapThreshold: 15,
    guideSnapThreshold: 10,
  },
};

/**
 * Hyperscape Theme
 * RS3-inspired dark theme with gold/bronze accents and enhanced glassmorphism
 * Updated with more polished color palette for modern game UI
 */
export const hyperscapeTheme: Theme = {
  name: "hyperscape",

  colors: {
    background: {
      primary: "#0f0f12", // Slightly lighter base
      secondary: "#22222a", // Much lighter for contrast
      tertiary: "#363640", // Significantly lighter for clear separation
      overlay: "rgba(0, 0, 0, 0.75)",
      glass: "rgba(18, 18, 22, 0.82)", // Lighter glass
      panelPrimary: "rgba(25, 25, 32, 0.78)", // Lighter panel background
      panelSecondary: "rgba(45, 45, 56, 0.82)", // Much more visible panel section
      hover: "#2a2a32", // Hover state background
    },
    text: {
      primary: "#f8f4ec", // Brighter warm white
      secondary: "#d4c8a6", // Brighter muted gold
      muted: "#9a8d78", // Lighter subtle brown
      disabled: "#555555",
      link: "#f0d060", // Brighter gold link
      accent: "#ffe080", // Brighter vibrant gold accent
    },
    border: {
      default: "#4d4540", // Much lighter for visibility
      hover: "#6a5f50", // Lighter hover
      active: "#8b7a60", // Lighter active state
      focus: "#f0d060", // Brighter gold focus ring
      decorative: "#b88828", // Much brighter bronze decorative
    },
    accent: {
      primary: "#d4a84b", // Rich classic gold
      secondary: "#ffd866", // Bright gold highlight
      hover: "#e8be5a", // Lighter on hover
      active: "#c49530", // Deeper on press
      gold: "#d4a84b", // Gold accent
    },
    state: {
      success: "#4ade80", // Modern green
      warning: "#fbbf24", // Bright amber
      danger: "#f87171", // Soft red
      info: "#60a5fa", // Soft blue
    },
    status: {
      hp: "#dc2626", // Vibrant red
      hpBackground: "#2d0a0a",
      prayer: "#3b82f6", // Bright blue
      prayerBackground: "#0d1a2d",
      adrenaline: "#d4a84b", // Gold
      adrenalineBackground: "#2d2000",
      energy: "#22c55e", // Bright green
      energyBackground: "#0d2d0d",
    },
    slot: {
      empty: "#1a1a20", // Lighter for visibility
      filled: "#2a2a32", // Much lighter for contrast
      hover: "#3a3844", // Lighter hover state
      selected: "#5a5248", // Lighter selected state
      disabled: "#101012", // Darker disabled
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    grid: 8,
  },

  typography: {
    fontFamily: {
      body: '"Rubik", -apple-system, BlinkMacSystemFont, sans-serif',
      heading: '"Rubik", -apple-system, BlinkMacSystemFont, sans-serif',
      mono: '"SF Mono", "Fira Code", monospace',
    },
    fontSize: {
      xs: "10px",
      sm: "12px",
      base: "14px",
      lg: "16px",
      xl: "20px",
      xxl: "24px",
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },

  borderRadius: {
    none: 0,
    sm: 2,
    md: 4,
    lg: 6,
    xl: 8,
    full: "9999px",
  },

  shadows: {
    none: "none",
    sm: "0 1px 2px rgba(0, 0, 0, 0.4)",
    md: "0 4px 8px rgba(0, 0, 0, 0.5)",
    lg: "0 8px 16px rgba(0, 0, 0, 0.6)",
    xl: "0 16px 32px rgba(0, 0, 0, 0.7)",
    window: "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(139, 90, 43, 0.3)",
    glow: "0 0 20px rgba(201, 165, 74, 0.4)",
  },

  zIndex: {
    base: 0,
    dropdown: 100,
    sticky: 200,
    window: 1000,
    overlay: 2000,
    modal: 3000,
    popover: 4000,
    tooltip: 9999,
  },

  transitions: {
    fast: "100ms ease",
    normal: "200ms ease",
    slow: "300ms ease",
  },

  glass: {
    blur: 16,
    opacity: 0.8,
    borderOpacity: 0.4,
  },

  panel: {
    headerHeight: 28,
    borderWidth: 1,
    minWidth: 260,
    minHeight: 195,
  },

  slot: {
    size: 36,
    gap: 2,
    borderRadius: 2,
    iconSize: 32,
  },

  window: {
    resizeHandleSize: 8,
    resizeCornerSize: 12,
    edgeSnapThreshold: 15,
    guideSnapThreshold: 10,
  },
};

/** All available themes */
export const themes = {
  base: baseTheme,
  hyperscape: hyperscapeTheme,
  // Legacy aliases
  dark: baseTheme,
  light: baseTheme, // No light theme in game context
} as const;

/** Theme name type */
export type ThemeName = "base" | "hyperscape";

// Legacy exports for backwards compatibility
export const darkTheme = baseTheme;
export const lightTheme = baseTheme;

/**
 * Get glassmorphism style for a theme
 */
export function getThemedGlassmorphismStyle(
  theme: Theme,
  transparency: number = 0,
): React.CSSProperties {
  const baseOpacity = theme.glass.opacity;
  const alpha = baseOpacity * (1 - transparency / 100);

  return {
    // Use specific pattern to avoid ReDoS: match decimal number before closing paren
    // Pattern: digits, optionally followed by decimal point and more digits, then )
    backgroundColor: theme.colors.background.glass.replace(
      /(\d+(?:\.\d+)?)\)$/,
      `${alpha})`,
    ),
    backdropFilter: `blur(${theme.glass.blur}px)`,
    WebkitBackdropFilter: `blur(${theme.glass.blur}px)`,
    borderColor: theme.colors.border.default,
  };
}

/**
 * Get window shadow for a theme
 */
export function getThemedWindowShadow(
  theme: Theme,
  state: "normal" | "focused" | "dragging" = "normal",
): string {
  switch (state) {
    case "focused":
      return `${theme.shadows.lg}, 0 0 0 1px ${theme.colors.border.focus}`;
    case "dragging":
      return theme.shadows.xl;
    default:
      return theme.shadows.window;
  }
}

/**
 * Shared elevated surface style for premium HUD panels and windows.
 * Keeps panel treatments consistent across the live game UI.
 */
export function getPanelSurfaceStyle(
  theme: Theme,
  options?: {
    transparency?: number;
    emphasis?: "normal" | "strong";
    interactive?: boolean;
  },
): React.CSSProperties {
  const transparency = options?.transparency ?? 0;
  const emphasis = options?.emphasis ?? "normal";
  const interactive = options?.interactive ?? false;
  const glassStyle = getThemedGlassmorphismStyle(theme, transparency);
  const borderColor =
    emphasis === "strong"
      ? theme.colors.border.decorative
      : theme.colors.border.default;

  return {
    ...glassStyle,
    position: "relative",
    border: `1px solid ${borderColor}`,
    borderRadius: theme.borderRadius.lg,
    backgroundImage:
      theme.name === "hyperscape"
        ? `linear-gradient(180deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.018) 18%, rgba(0, 0, 0, 0.08) 100%),
           radial-gradient(circle at top right, rgba(240, 208, 96, 0.14), transparent 34%),
           linear-gradient(180deg, ${theme.colors.background.panelSecondary}e6 0%, ${theme.colors.background.panelPrimary}f5 100%)`
        : `linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.015) 24%, rgba(0, 0, 0, 0.06) 100%),
           linear-gradient(180deg, ${theme.colors.background.panelSecondary}d9 0%, ${theme.colors.background.panelPrimary}f2 100%)`,
    boxShadow:
      emphasis === "strong"
        ? `${theme.shadows.window}, inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.035), inset 0 -20px 32px rgba(0, 0, 0, 0.12)`
        : `${theme.shadows.md}, inset 0 1px 0 rgba(255, 255, 255, 0.07), inset 0 -10px 18px rgba(0, 0, 0, 0.08)`,
    transition: interactive ? theme.transitions.fast : undefined,
  };
}

/**
 * Shared header chrome used by tabs and modal/window shells.
 */
export function getPanelHeaderStyle(theme: Theme): React.CSSProperties {
  return {
    background:
      theme.name === "hyperscape"
        ? `linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, transparent 58%),
           radial-gradient(circle at top right, rgba(240, 208, 96, 0.18), transparent 36%),
           linear-gradient(180deg, ${theme.colors.background.secondary} 0%, ${theme.colors.background.tertiary} 100%)`
        : `linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, transparent 56%),
           linear-gradient(180deg, ${theme.colors.background.secondary} 0%, ${theme.colors.background.primary} 100%)`,
    borderBottom: `1px solid ${theme.colors.border.default}`,
    boxShadow:
      "inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.32)",
  };
}

/**
 * Shared tab style to keep window tabs readable and consistent.
 */
export function getTabStyle(
  theme: Theme,
  options: {
    active: boolean;
    dragging?: boolean;
  },
): React.CSSProperties {
  const active = options.active;
  const dragging = options.dragging ?? false;

  return {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing.xs,
    minHeight: 34,
    padding: `0 ${theme.spacing.sm + 1}px`,
    ...getTabChromeStyle(theme, {
      isActive: active,
      isDragging: dragging,
    }),
    color: active ? theme.colors.text.primary : theme.colors.text.secondary,
    transition: theme.transitions.fast,
    userSelect: "none",
  };
}

export interface WindowSurfaceOptions {
  transparency?: number;
  state?: "normal" | "focused" | "dragging";
}

export interface TabBarChromeOptions {
  isDropTarget?: boolean;
  isPotentialDropTarget?: boolean;
  isSourceDragging?: boolean;
}

export interface TabChromeOptions {
  isActive: boolean;
  isDragging?: boolean;
}

type ShellButtonVariant = "neutral" | "danger" | "accent";

/**
 * Get the premium window surface style used by desktop shell windows.
 */
export function getWindowSurfaceStyle(
  theme: Theme,
  options: WindowSurfaceOptions = {},
): React.CSSProperties {
  const transparency = options.transparency ?? 0;
  const state = options.state ?? "normal";
  const baseOpacity = theme.glass.opacity;
  const alpha = baseOpacity * (1 - transparency / 100);
  const borderColor =
    state === "focused"
      ? theme.colors.border.focus
      : theme.colors.border.default;
  const shadow = getThemedWindowShadow(theme, state);
  const accentGlow =
    theme.name === "hyperscape"
      ? `0 0 0 1px rgba(240, 208, 96, ${state === "dragging" ? 0.16 : 0.1})`
      : "none";

  return {
    backgroundColor: theme.colors.background.glass.replace(
      /(\d+(?:\.\d+)?)\)$/,
      `${alpha})`,
    ),
    backgroundImage:
      theme.name === "hyperscape"
        ? `linear-gradient(180deg, rgba(255, 255, 255, 0.075) 0%, rgba(255, 255, 255, 0.02) 28%, rgba(0, 0, 0, 0.11) 100%),
           radial-gradient(circle at top right, rgba(240, 208, 96, 0.14), transparent 36%),
           radial-gradient(circle at bottom left, rgba(36, 92, 132, 0.12), transparent 34%)`
        : "linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.015) 42%, rgba(0, 0, 0, 0.08) 100%)",
    backdropFilter: `blur(${theme.glass.blur}px) saturate(1.08)`,
    WebkitBackdropFilter: `blur(${theme.glass.blur}px) saturate(1.08)`,
    border: `1px solid ${borderColor}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: `${shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.09), inset 0 -18px 32px rgba(0, 0, 0, 0.12), ${accentGlow}`,
  };
}

/**
 * Get the desktop tab bar chrome style used across the premium shell.
 */
export function getTabBarChromeStyle(
  theme: Theme,
  options: TabBarChromeOptions = {},
): React.CSSProperties {
  const {
    isDropTarget = false,
    isPotentialDropTarget = false,
    isSourceDragging = false,
  } = options;

  let borderBottomColor = theme.colors.border.default;
  let shadow = "inset 0 -1px 0 rgba(0, 0, 0, 0.18)";

  if (isDropTarget) {
    borderBottomColor = theme.colors.accent.primary;
    shadow = `inset 0 -1px 0 ${theme.colors.accent.primary}, inset 0 1px 0 rgba(255, 255, 255, 0.08)`;
  } else if (isPotentialDropTarget) {
    borderBottomColor = theme.colors.border.hover;
  }

  return {
    backgroundColor: theme.colors.background.secondary,
    backgroundImage:
      theme.name === "hyperscape"
        ? "linear-gradient(180deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 22%, rgba(0, 0, 0, 0.1) 100%), radial-gradient(circle at top right, rgba(240, 208, 96, 0.14), transparent 32%)"
        : "linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.015) 100%)",
    borderBottom: `1px solid ${borderBottomColor}`,
    boxShadow: `${shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.06)`,
    minHeight: 36,
    opacity: isSourceDragging ? 0.72 : 1,
  };
}

/**
 * Get the chrome style for an individual tab.
 */
export function getTabChromeStyle(
  theme: Theme,
  options: TabChromeOptions,
): React.CSSProperties {
  const { isActive, isDragging = false } = options;

  return {
    backgroundColor: isActive
      ? theme.colors.background.secondary
      : "rgba(255, 255, 255, 0.01)",
    backgroundImage: isActive
      ? "linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.025) 38%, rgba(0, 0, 0, 0.08) 100%)"
      : "linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.008) 100%)",
    borderRight: `1px solid ${isActive ? theme.colors.border.hover : theme.colors.border.default}`,
    borderBottom: isActive
      ? `1px solid ${theme.colors.accent.primary}`
      : "1px solid transparent",
    borderTop: `1px solid ${isActive ? "rgba(255, 255, 255, 0.14)" : "transparent"}`,
    borderTopLeftRadius: theme.borderRadius.sm,
    borderTopRightRadius: theme.borderRadius.sm,
    boxShadow: isActive
      ? "inset 0 1px 0 rgba(255, 255, 255, 0.09), 0 -1px 0 rgba(0, 0, 0, 0.08)"
      : "inset 0 1px 0 rgba(255, 255, 255, 0.025)",
    opacity: isDragging ? 0.5 : 1,
  };
}

/**
 * Get shell button style for tab bars and other window controls.
 */
export function getShellControlButtonStyle(
  theme: Theme,
  variant: ShellButtonVariant = "neutral",
): ShellControlButtonStyle {
  const palette =
    variant === "danger"
      ? {
          fg: theme.colors.text.muted,
          bg: "transparent",
          hoverBg: theme.colors.state.danger,
          hoverFg: theme.colors.text.primary,
        }
      : variant === "accent"
        ? {
            fg: theme.colors.text.secondary,
            bg: "transparent",
            hoverBg: theme.colors.background.tertiary,
            hoverFg: theme.colors.accent.primary,
          }
        : {
            fg: theme.colors.text.muted,
            bg: "transparent",
            hoverBg: theme.colors.background.tertiary,
            hoverFg: theme.colors.text.primary,
          };

  return {
    width: 24,
    height: 24,
    border: `1px solid rgba(255, 255, 255, 0.04)`,
    background: palette.bg,
    color: palette.fg,
    cursor: "pointer",
    borderRadius: theme.borderRadius.sm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    flexShrink: 0,
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
    transition: `color ${theme.transitions.fast}, background-color ${theme.transitions.fast}, border-color ${theme.transitions.fast}, transform ${theme.transitions.fast}`,
    "--shell-button-hover-bg": palette.hoverBg,
    "--shell-button-hover-fg": palette.hoverFg,
  };
}

/**
 * Get slot style for inventory/action bar items
 */
export function getSlotStyle(
  theme: Theme,
  state: "empty" | "filled" | "hover" | "selected" | "disabled" = "empty",
): React.CSSProperties {
  return {
    width: theme.slot.size,
    height: theme.slot.size,
    borderRadius: theme.slot.borderRadius,
    backgroundColor: theme.colors.slot[state],
    border: `1px solid ${theme.colors.border.default}`,
    transition: theme.transitions.fast,
  };
}

/**
 * Get status bar gradient for HP, prayer, etc.
 */
export function getStatusBarGradient(
  theme: Theme,
  type: "hp" | "prayer" | "adrenaline" | "energy",
  fillPercent: number = 100,
): string {
  const color = theme.colors.status[type];
  const bgColor =
    theme.colors.status[
      `${type}Background` as keyof typeof theme.colors.status
    ];

  return `linear-gradient(to right, ${color} 0%, ${color} ${fillPercent}%, ${bgColor} ${fillPercent}%, ${bgColor} 100%)`;
}

/**
 * Get decorative panel border style (RS3-style bronze border)
 */
export function getDecorativeBorderStyle(theme: Theme): React.CSSProperties {
  if (theme.name === "hyperscape") {
    return {
      border: `1px solid ${theme.colors.border.decorative}`,
      boxShadow: `inset 0 0 0 1px rgba(139, 90, 43, 0.2), ${theme.shadows.window}`,
    };
  }
  return {
    border: `1px solid ${theme.colors.border.default}`,
    boxShadow: theme.shadows.window,
  };
}
