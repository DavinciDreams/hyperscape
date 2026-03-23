import React, { memo } from "react";
import {
  // Combat & Action
  Swords,
  Zap,
  // Skills & Magic
  Wand2,
  Sparkles,
  // Inventory & Equipment
  Package,
  Gem,
  // Stats & Info
  Activity,
  // Navigation
  Radar,
  Globe2,
  // Social
  MessageCircle,
  Users2,
  // Account & Settings
  CircleUserRound,
  SlidersHorizontal,
  // Quests & Other
  ScrollText,
  LayoutGrid,
  Landmark,
  Menu,
  type LucideIcon,
} from "lucide-react";
import { useDrag } from "../core/drag/useDrag";
import { useEditMode } from "../core/edit/useEditMode";
import { useTheme } from "../stores/themeStore";
import { getShellControlButtonStyle, getTabStyle } from "../theme/themes";
import type { TabProps } from "../types";

/** Map icon identifiers to Lucide components */
const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  // Panel icons
  inventory: Package,
  equipment: Gem,
  stats: Activity,
  skills: Wand2,
  prayer: Sparkles,
  combat: Swords,
  chat: MessageCircle,
  account: CircleUserRound,
  settings: SlidersHorizontal,
  minimap: Radar,
  map: Globe2,
  friends: Users2,
  quests: ScrollText,
  dashboard: LayoutGrid,
  action: Zap,
  "actionbar-0": Zap,
  "actionbar-1": Zap,
  "actionbar-2": Zap,
  "actionbar-3": Zap,
  "actionbar-4": Zap,
  menubar: Menu,
  bank: Landmark,
  presets: LayoutGrid,
};

/**
 * Single tab component
 *
 * @example
 * ```tsx
 * <Tab
 *   tab={tab}
 *   isActive={true}
 *   onActivate={() => setActiveTab(index)}
 *   onClose={() => removeTab(tab.id)}
 * />
 * ```
 */
export const Tab = memo(function Tab({
  tab,
  isActive,
  onActivate,
  onClose,
  className,
  style,
}: TabProps): React.ReactElement {
  const theme = useTheme();
  const { isUnlocked } = useEditMode();

  const { isDragging, dragHandleProps } = useDrag({
    id: tab.id,
    type: "tab",
    sourceId: tab.windowId,
    disabled: !isUnlocked,
  });

  // Icon-only mode: show icon instead of text for compact tabs
  const hasIcon = Boolean(tab.icon);

  // Get Lucide icon component if available (check by tab content ID or tab ID)
  const contentId = typeof tab.content === "string" ? tab.content : "";
  const LucideIcon =
    LUCIDE_ICON_MAP[contentId] || LUCIDE_ICON_MAP[tab.id] || null;
  const hasVisualIcon = hasIcon || Boolean(LucideIcon);

  // Merge styles properly to avoid overwriting
  const containerStyle: React.CSSProperties = {
    ...getTabStyle(theme, { active: isActive, dragging: isDragging }),
    justifyContent: hasVisualIcon ? "flex-start" : "center",
    minWidth: hasVisualIcon ? 44 : 72,
    maxWidth: 160,
    ...style,
    ...(isUnlocked ? dragHandleProps.style : { cursor: "pointer" }),
  };

  const iconStyle: React.CSSProperties = {
    fontSize: 16,
    lineHeight: 1,
    filter: isActive ? "none" : "grayscale(18%)",
    opacity: isActive ? 1 : 0.85,
    color: isActive ? theme.colors.accent.primary : theme.colors.text.secondary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };

  const labelStyle: React.CSSProperties = {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: isActive ? theme.colors.text.primary : theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: isActive
      ? theme.typography.fontWeight.semibold
      : theme.typography.fontWeight.medium,
  };

  const closeButtonStyle: React.CSSProperties = {
    ...getShellControlButtonStyle(theme, "danger"),
    width: 18,
    height: 18,
    fontSize: theme.typography.fontSize.sm,
    padding: 0,
    opacity: isActive ? 1 : 0,
    transition: `opacity ${theme.transitions.fast}`,
    flexShrink: 0,
  };

  const applyInactiveHighlight = (element: HTMLDivElement) => {
    if (isActive) return;
    element.style.background = `linear-gradient(180deg, ${theme.colors.background.secondary} 0%, ${theme.colors.background.tertiary} 100%)`;
    element.style.borderBottomColor = theme.colors.border.hover;
  };

  const clearInactiveHighlight = (element: HTMLDivElement) => {
    if (isActive) return;
    element.style.background = "transparent";
    element.style.borderBottomColor = "transparent";
  };

  return (
    <div
      className={className}
      style={containerStyle}
      data-tab={tab.id}
      onClick={onActivate}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
        applyInactiveHighlight(e.currentTarget);
        const closeBtn = e.currentTarget.querySelector(
          "[data-close-btn]",
        ) as HTMLElement;
        if (closeBtn) closeBtn.style.opacity = "1";
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
        clearInactiveHighlight(e.currentTarget);
        const closeBtn = e.currentTarget.querySelector(
          "[data-close-btn]",
        ) as HTMLElement;
        if (closeBtn && !isActive) closeBtn.style.opacity = "0";
      }}
      onFocus={(e: React.FocusEvent<HTMLDivElement>) => {
        applyInactiveHighlight(e.currentTarget);
        e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${theme.colors.border.focus}`;
      }}
      onBlur={(e: React.FocusEvent<HTMLDivElement>) => {
        clearInactiveHighlight(e.currentTarget);
        e.currentTarget.style.boxShadow = isActive
          ? "inset 0 1px 0 rgba(255, 255, 255, 0.08)"
          : "none";
      }}
      {...(isUnlocked ? { onPointerDown: dragHandleProps.onPointerDown } : {})}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
      aria-label={tab.label}
      title={tab.label}
    >
      {hasVisualIcon && (
        <span style={iconStyle}>
          {LucideIcon ? <LucideIcon size={16} strokeWidth={1.75} /> : tab.icon}
        </span>
      )}
      <span style={labelStyle}>{tab.label}</span>
      {/* Only show close button when in edit mode (isUnlocked) */}
      {onClose && isActive && isUnlocked && (
        <button
          data-close-btn
          style={closeButtonStyle}
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            onClose();
          }}
          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.backgroundColor = String(
              e.currentTarget.style.getPropertyValue("--shell-button-hover-bg"),
            );
            e.currentTarget.style.color = String(
              e.currentTarget.style.getPropertyValue("--shell-button-hover-fg"),
            );
          }}
          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = theme.colors.text.muted;
          }}
        >
          ×
        </button>
      )}
    </div>
  );
});
