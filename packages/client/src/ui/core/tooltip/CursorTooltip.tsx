import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { useTooltipSize } from "../../../hooks/useTooltipSize";
import {
  calculateCursorTooltipPosition,
  type TooltipPositionOptions,
} from "./useTooltipPosition";
import { useThemeStore } from "@/ui";

export interface CursorTooltipProps extends React.HTMLAttributes<HTMLDivElement> {
  /** If false, the tooltip is not rendered */
  visible: boolean;
  /** Current mouse position { x, y } */
  position: { x: number; y: number };
  /** Fallback size to use before actual measurement */
  estimatedSize?: { width: number; height: number };
  /** Offset from the cursor (default: 4) */
  cursorOffset?: number;
  /** Content to render */
  children: React.ReactNode;
}

/**
 * Reusable portal-based mouse-following tooltip.
 * Automatically measures its own dimensions and flips orientation
 * if it would clip off the edge of the screen.
 * Standardizes the dark gradient theme across the game.
 */
export const CursorTooltip = React.memo(function CursorTooltip({
  visible,
  position,
  estimatedSize = { width: 140, height: 60 },
  cursorOffset = 4,
  children,
  className = "",
  style,
  ...props
}: CursorTooltipProps) {
  const theme = useThemeStore((s) => s.theme);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Measure the actual rendered dimension for precise alignment
  const actualSize = useTooltipSize(visible, tooltipRef, estimatedSize);

  if (!visible) return null;

  // Calculate safe bounding-box positioning
  const { left, top } = calculateCursorTooltipPosition(
    position,
    actualSize,
    cursorOffset,
  );

  return createPortal(
    <div
      ref={tooltipRef}
      className={`fixed pointer-events-none z-[100000] animate-in fade-in zoom-in-95 duration-100 ${className}`}
      style={{
        left,
        top,
        background: `linear-gradient(180deg, ${theme.colors.background.primary} 0%, ${theme.colors.background.secondary} 100%)`,
        border: `1px solid ${theme.colors.border.hover}`,
        borderRadius: `4px`, // Squared off look matching the design rules
        padding: "8px 10px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
});
