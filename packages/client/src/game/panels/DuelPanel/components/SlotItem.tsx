/**
 * SlotItem — Shared slot renderer for stake grids and inventory
 *
 * Renders a single item slot with:
 * - Item name (truncated to 8 chars)
 * - Quantity badge for stackable items
 * - Click/right-click handlers
 * - Visual staked indicator
 */

import { useState, type CSSProperties } from "react";
import { CursorTooltip, type Theme } from "@/ui";
import { getTooltipTitleStyle } from "@/ui/core/tooltip/tooltipStyles";
import { ItemIcon } from "@/ui/components/ItemIcon";
import { formatQuantity } from "../utils";

// ============================================================================
// Types
// ============================================================================

interface SlotItemProps {
  theme: Theme;
  hasItem: boolean;
  itemId?: string;
  displayName?: string;
  quantity?: number;
  isStaked?: boolean;
  title?: string;
  quantityStyle: CSSProperties;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function getSlotStyle(
  theme: Theme,
  hasItem: boolean,
  isStaked?: boolean,
): CSSProperties {
  return {
    aspectRatio: "1",
    minWidth: 0,
    minHeight: 0,
    background: hasItem
      ? theme.colors.background.secondary
      : theme.colors.background.primary,
    border: `1px solid ${isStaked ? theme.colors.accent.primary : theme.colors.border.default}`,
    borderRadius: theme.borderRadius.sm,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: hasItem ? "pointer" : "default",
    position: "relative",
    fontSize: theme.typography.fontSize.xs,
    padding: 2,
    overflow: "hidden",
  };
}

// ============================================================================
// Component
// ============================================================================

export function SlotItem({
  theme,
  hasItem,
  itemId,
  displayName,
  quantity,
  isStaked,
  title,
  quantityStyle,
  onClick,
  onContextMenu,
}: SlotItemProps) {
  const [hoverState, setHoverState] = useState<{ x: number; y: number } | null>(
    null,
  );

  if (!hasItem) {
    return <div style={getSlotStyle(theme, false)} />;
  }

  return (
    <>
      <div
        style={{
          ...getSlotStyle(theme, true, isStaked),
          opacity: isStaked ? 0.4 : 1,
        }}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseEnter={(e) => {
          if (title) {
            setHoverState({ x: e.clientX, y: e.clientY });
          }
        }}
        onMouseMove={(e) => {
          if (title) {
            setHoverState({ x: e.clientX, y: e.clientY });
          }
        }}
        onMouseLeave={() => setHoverState(null)}
      >
        {itemId ? (
          <ItemIcon itemId={itemId} size={32} />
        ) : (
          <span
            style={{
              fontSize: "10px",
              textAlign: "center",
              overflow: "hidden",
            }}
          >
            {displayName?.substring(0, 8)}
          </span>
        )}
        {quantity !== undefined && quantity > 1 && (
          <span style={quantityStyle}>{formatQuantity(quantity)}</span>
        )}
      </div>

      {title && hoverState && (
        <CursorTooltip
          visible={true}
          position={hoverState}
          estimatedSize={{ width: 180, height: 48 }}
          style={{
            zIndex: theme.zIndex.tooltip,
            minWidth: "140px",
            maxWidth: "240px",
          }}
        >
          <div
            style={{
              ...getTooltipTitleStyle(theme),
            }}
          >
            {title}
          </div>
        </CursorTooltip>
      )}
    </>
  );
}
