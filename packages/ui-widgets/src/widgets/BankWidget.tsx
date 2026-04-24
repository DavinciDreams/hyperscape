/**
 * BankWidget — bank grid panel adapter.
 *
 * Matches `hyperforge.panel.bank`. A larger version of the inventory
 * grid with optional search field and coin strip. Deposit/withdraw,
 * drag-drop, and tabs stay in the hand-coded `BankPanel.tsx`.
 */

import { memo, useMemo } from "react";
import { useItemIcon } from "../ItemIconContext";
import {
  FONT_STACK,
  INSET_BG,
  INSET_BG_SOFT,
  INSET_SHADOW,
  INSET_SHADOW_SOFT,
  PANEL_BG,
  PANEL_BORDER,
  SLOT_EMPTY_BG,
  SLOT_EMPTY_BORDER,
  SLOT_FILLED_BG,
  SLOT_FILLED_BORDER,
  SLOT_INSET_SHADOW,
  TEXT_ACCENT,
  TEXT_MUTED,
  TEXT_SECONDARY,
} from "./widgetStyles";

export interface BankSlot {
  slot: number;
  itemId: string;
  quantity: number;
}

export interface BankProps {
  columns: number;
  showSearch: boolean;
  showCoins: boolean;
  coins: number;
  items?: ReadonlyArray<BankSlot>;
}

const SLOT_SIZE = 36;
const QUANTITY_COLOR = TEXT_ACCENT;

function formatQuantity(qty: number): string {
  if (qty >= 10_000_000) return `${Math.floor(qty / 1_000_000)}M`;
  if (qty >= 10_000) return `${Math.floor(qty / 1_000)}K`;
  return String(qty);
}

function formatCoins(n: number): string {
  return n.toLocaleString();
}

export const BankWidget = memo(function BankWidget({
  columns,
  showSearch,
  showCoins,
  coins,
  items,
}: BankProps) {
  const ItemIcon = useItemIcon();
  const cols = Math.max(1, columns);
  const bySlot = useMemo(() => {
    const map = new Map<number, BankSlot>();
    if (items) for (const i of items) map.set(i.slot, i);
    return map;
  }, [items]);
  // Display at least one page — sparse slots fill in empty cells.
  const maxSlotIdx =
    items && items.length > 0
      ? Math.max(...items.map((i) => i.slot))
      : cols * 5 - 1;
  const slotCount = Math.max(cols * 5, maxSlotIdx + 1);

  return (
    <div
      role="region"
      aria-label="Bank"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minWidth: 280,
        minHeight: 240,
        padding: 4,
        background: PANEL_BG,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 6,
        fontFamily: FONT_STACK,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          padding: "4px 6px",
          marginBottom: 4,
          background: INSET_BG_SOFT,
          borderRadius: 4,
          boxShadow: INSET_SHADOW_SOFT,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>🏦</span>
          <span
            style={{
              color: TEXT_MUTED,
              fontSize: 8,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Bank
          </span>
        </div>
        {showCoins && (
          <span
            style={{
              color: QUANTITY_COLOR,
              fontSize: 10,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatCoins(coins)} gp
          </span>
        )}
      </div>
      {showSearch && (
        <div
          style={{
            padding: "4px 6px",
            marginBottom: 4,
            background: INSET_BG_SOFT,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 4,
            color: TEXT_MUTED,
            fontSize: 10,
            boxShadow: INSET_SHADOW_SOFT,
          }}
        >
          Search items…
        </div>
      )}
      <div
        style={{
          flex: 1,
          padding: 4,
          background: INSET_BG,
          borderRadius: 4,
          boxShadow: INSET_SHADOW,
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, ${SLOT_SIZE}px)`,
            gridAutoRows: `${SLOT_SIZE}px`,
            gap: 2,
          }}
        >
          {Array.from({ length: slotCount }, (_, i) => {
            const item = bySlot.get(i);
            const filled = !!item;
            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  width: SLOT_SIZE,
                  height: SLOT_SIZE,
                  background: filled ? SLOT_FILLED_BG : SLOT_EMPTY_BG,
                  border: `1px solid ${filled ? SLOT_FILLED_BORDER : SLOT_EMPTY_BORDER}`,
                  borderRadius: 3,
                  boxShadow: SLOT_INSET_SHADOW,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {item && (
                  <>
                    <ItemIcon
                      itemId={item.itemId}
                      size={Math.max(18, SLOT_SIZE - 10)}
                    />
                    {item.quantity > 1 && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: 1,
                          right: 2,
                          fontSize: 9,
                          fontWeight: 700,
                          color: QUANTITY_COLOR,
                          textShadow:
                            "0 0 2px rgba(0, 0, 0, 0.95), 1px 1px 0 #000",
                          lineHeight: 1,
                          pointerEvents: "none",
                        }}
                      >
                        {formatQuantity(item.quantity)}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div
        style={{
          padding: "3px 6px",
          marginTop: 4,
          color: TEXT_SECONDARY,
          fontSize: 9,
          textAlign: "right",
          letterSpacing: 0.3,
        }}
      >
        {bySlot.size} / {slotCount} slots used
      </div>
    </div>
  );
});
