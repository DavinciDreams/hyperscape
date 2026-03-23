/**
 * RightPanel Component
 *
 * Right-side panel containing inventory grid and equipment paperdoll views.
 * RS3-style tab switcher between backpack and worn equipment.
 */

import React, { useCallback } from "react";
import { useThemeStore, useMobileLayout } from "@/ui";
import {
  getInteractiveTileStyle,
  getPanelHeaderStyle,
  getPanelInsetStyle,
  getPanelSurfaceStyle,
} from "@/ui/theme/themes";
import type { PlayerEquipmentItems } from "@hyperscape/shared";
import { INV_SLOTS_PER_ROW, INV_SLOT_SIZE } from "../constants";
import { formatItemName } from "../utils";
import { ItemIcon } from "@/ui/components/ItemIcon";
import type { InventorySlotViewItem, RightPanelMode } from "../types";
import { InventoryPanel } from "../../InventoryPanel";

export interface RightPanelProps {
  mode: RightPanelMode;
  onChangeMode: (mode: RightPanelMode) => void;

  // Inventory data
  inventory: InventorySlotViewItem[];
  coins: number;

  // Equipment data
  equipment?: PlayerEquipmentItems | null;

  // Inventory actions
  onDeposit: (itemId: string, quantity: number) => void;
  onDepositAll: () => void;
  onOpenCoinModal: (action: "deposit" | "withdraw") => void;
  onContextMenu: (
    e: React.MouseEvent,
    itemId: string,
    quantity: number,
    type: "bank" | "inventory",
    tabIndex?: number,
    slot?: number,
  ) => void;

  // Equipment actions
  onDepositEquipment: (slot: string) => void;
  onDepositAllEquipment: () => void;
}

export function RightPanel({
  mode,
  onChangeMode,
  inventory,
  coins,
  equipment,
  onDeposit,
  onDepositAll,
  onOpenCoinModal,
  onContextMenu,
  onDepositEquipment,
  onDepositAllEquipment,
}: RightPanelProps) {
  const theme = useThemeStore((s) => s.theme);
  const { shouldUseMobileUI } = useMobileLayout();

  // Responsive sizing
  const responsiveSlotSize = shouldUseMobileUI ? 34 : INV_SLOT_SIZE;

  /**
   * Render a single equipment slot for the paperdoll layout
   */
  const renderEquipmentSlot = useCallback(
    (key: string, label: string, icon: string) => {
      const item = equipment?.[key as keyof PlayerEquipmentItems] ?? null;
      const hasItem = !!item;

      return (
        <button
          key={key}
          onClick={() => hasItem && onDepositEquipment(key)}
          className="w-full h-full rounded transition-all duration-200 cursor-pointer group relative"
          style={{
            ...getInteractiveTileStyle(theme, {
              active: hasItem,
              radius: theme.borderRadius.md,
              accentColor: theme.colors.state.success,
            }),
            boxShadow: hasItem
              ? `0 4px 12px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 248, 236, 0.06), inset 0 -8px 14px rgba(0, 0, 0, 0.14)`
              : "inset 0 1px 0 rgba(255, 248, 236, 0.04), inset 0 -8px 12px rgba(0, 0, 0, 0.12)",
          }}
          onMouseEnter={(e) => {
            if (hasItem) {
              e.currentTarget.style.borderColor = theme.colors.state.success;
              e.currentTarget.style.background = `linear-gradient(180deg, rgba(245, 252, 246, 0.08) 0%, ${theme.colors.state.success}22 18%, rgba(38, 31, 25, 0.98) 100%)`;
            }
          }}
          onMouseLeave={(e) => {
            if (hasItem) {
              e.currentTarget.style.borderColor = theme.colors.border.hover;
              e.currentTarget.style.background = `linear-gradient(180deg, rgba(255, 248, 236, 0.03) 0%, rgba(255, 244, 229, 0.012) 18%, rgba(35, 29, 24, 0.99) 100%)`;
            }
          }}
          title={
            hasItem
              ? `${formatItemName(item.id)} - Click to deposit`
              : `${label} (empty)`
          }
        >
          {/* Slot Label */}
          <div
            className="absolute top-0.5 left-1 text-[8px] font-medium uppercase tracking-wider"
            style={{
              color: theme.colors.text.secondary,
              textShadow: "0 1px 2px rgba(0, 0, 0, 0.8)",
            }}
          >
            {label}
          </div>

          {/* Slot Content */}
          <div className="flex flex-col items-center justify-center h-full pt-2">
            {!hasItem ? (
              <span
                className="transition-transform duration-200 group-hover:scale-110"
                style={{
                  fontSize: "1.25rem",
                  filter: "grayscale(100%) opacity(0.3)",
                }}
              >
                {icon}
              </span>
            ) : (
              <>
                <span
                  className="transition-transform duration-200 group-hover:scale-110"
                  style={{
                    filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))",
                  }}
                >
                  <ItemIcon itemId={item.id} size={32} />
                </span>
                <div
                  className="text-center px-0.5 mt-0.5"
                  style={{
                    fontSize: "8px",
                    color: theme.colors.text.secondary,
                    lineHeight: "1.1",
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatItemName(item.id).slice(0, 10)}
                </div>
              </>
            )}
          </div>
        </button>
      );
    },
    [equipment, onDepositEquipment, theme],
  );

  return (
    <div
      className="flex flex-col rounded-lg"
      style={{
        ...getPanelSurfaceStyle(theme, { emphasis: "strong" }),
        boxShadow: `${theme.shadows.xl}, inset 0 1px 0 rgba(255,248,236,0.06), inset 0 -14px 22px rgba(0,0,0,0.1)`,
        width: shouldUseMobileUI
          ? "100%"
          : `${INV_SLOTS_PER_ROW * (responsiveSlotSize + 4) + 24}px`,
        minWidth: shouldUseMobileUI ? undefined : "180px",
      }}
    >
      {/* RS3-style Tab Header with view switcher */}
      <div
        className="flex justify-between items-center px-2 py-1.5 rounded-t-lg"
        style={{
          ...getPanelHeaderStyle(theme),
          borderBottom: `1px solid ${theme.colors.border.decorative}`,
        }}
      >
        {/* Tab Buttons */}
        <div className="flex gap-1">
          <button
            onClick={() => onChangeMode("inventory")}
            className="px-2 py-1 rounded text-xs font-bold transition-all"
            style={{
              background:
                mode === "inventory"
                  ? String(
                      getInteractiveTileStyle(theme, {
                        active: true,
                        radius: theme.borderRadius.sm,
                      }).background,
                    )
                  : String(
                      getPanelInsetStyle(theme, {
                        radius: theme.borderRadius.sm,
                      }).background,
                    ),
              color:
                mode === "inventory"
                  ? theme.colors.accent.primary
                  : theme.colors.text.secondary,
              border:
                mode === "inventory"
                  ? `1px solid ${theme.colors.accent.primary}50`
                  : `1px solid ${theme.colors.border.default}50`,
            }}
            title="View Backpack"
          >
            🎒
          </button>
          <button
            onClick={() => onChangeMode("equipment")}
            className="px-2 py-1 rounded text-xs font-bold transition-all"
            style={{
              background:
                mode === "equipment"
                  ? String(
                      getInteractiveTileStyle(theme, {
                        active: true,
                        radius: theme.borderRadius.sm,
                      }).background,
                    )
                  : String(
                      getPanelInsetStyle(theme, {
                        radius: theme.borderRadius.sm,
                      }).background,
                    ),
              color:
                mode === "equipment"
                  ? theme.colors.accent.primary
                  : theme.colors.text.secondary,
              border:
                mode === "equipment"
                  ? `1px solid ${theme.colors.accent.primary}50`
                  : `1px solid ${theme.colors.border.default}50`,
            }}
            title="View Worn Equipment"
          >
            ⚔️
          </button>
        </div>
        <span
          className="text-xs font-bold"
          style={{ color: theme.colors.accent.primary }}
        >
          {mode === "inventory" ? "Inventory" : "Equipment"}
        </span>
      </div>

      {/* Content Area - switches between inventory and equipment */}
      {mode === "inventory" ? (
        <>
          {/* Modern Inventory Panel in bank mode */}
          <div
            className="flex-1"
            style={{ minHeight: shouldUseMobileUI ? "200px" : "280px" }}
          >
            <InventoryPanel
              items={inventory}
              coins={coins}
              embeddedMode="bank"
              onEmbeddedClick={(item) => onDeposit(item.itemId, 1)}
              onEmbeddedContextMenu={(e, item) =>
                onContextMenu(e, item.itemId, item.quantity || 1, "inventory")
              }
              showCoinPouch={false}
              footerHint="Left: Deposit 1 | Right: Options"
            />
          </div>

          {/* Coin Pouch Section */}
          <div
            className="mx-2 mb-2 p-2 rounded flex items-center justify-between"
            style={{
              ...getPanelInsetStyle(theme, {
                emphasis: "normal",
                radius: theme.borderRadius.md,
                padding: 0,
              }),
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">💰</span>
              <span
                className="text-sm font-bold"
                style={{ color: theme.colors.accent.primary }}
              >
                {coins.toLocaleString()}
              </span>
            </div>
            <button
              onClick={() => onOpenCoinModal("deposit")}
              disabled={coins <= 0}
              className="px-2 py-1 rounded text-xs font-bold transition-colors disabled:opacity-30"
              style={{
                ...getInteractiveTileStyle(theme, {
                  active: true,
                  accentColor: theme.colors.state.success,
                  radius: theme.borderRadius.sm,
                }),
                color: theme.colors.text.primary,
              }}
              onMouseEnter={(e) => {
                if (coins > 0)
                  e.currentTarget.style.background = `linear-gradient(180deg, rgba(245, 252, 246, 0.08) 0%, ${theme.colors.state.success}26 22%, rgba(20, 42, 24, 0.98) 100%)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `linear-gradient(180deg, rgba(245, 252, 246, 0.06) 0%, ${theme.colors.state.success}1c 20%, rgba(22, 36, 25, 0.98) 100%)`;
              }}
            >
              Deposit
            </button>
          </div>

          {/* Deposit All Button */}
          <div className="px-2 pb-2">
            <button
              onClick={onDepositAll}
              className="w-full py-2 rounded text-sm font-bold transition-colors"
              style={{
                ...getInteractiveTileStyle(theme, {
                  active: true,
                  accentColor: theme.colors.accent.primary,
                  radius: theme.borderRadius.md,
                }),
                color: theme.colors.accent.primary,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `linear-gradient(180deg, rgba(255, 249, 239, 0.07) 0%, ${theme.colors.accent.primary}20 20%, rgba(51, 39, 28, 0.98) 100%)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `linear-gradient(180deg, rgba(255, 250, 241, 0.06) 0%, ${theme.colors.accent.primary}18 20%, rgba(39, 33, 27, 0.98) 100%)`;
              }}
            >
              Deposit Inventory
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Equipment View - Paperdoll layout matching EquipmentPanel */}
          <div
            className="p-2 flex-1"
            style={{
              ...getPanelInsetStyle(theme, {
                emphasis: "strong",
                radius: theme.borderRadius.md,
                padding: 0,
              }),
              borderRadius: "4px",
              margin: "4px",
            }}
          >
            {/* Paperdoll Grid: 3 columns x 3 rows (melee-only MVP) */}
            <div
              className="grid gap-1 h-full"
              style={{
                gridTemplateColumns: "repeat(3, 1fr)",
                gridTemplateRows: "repeat(3, 1fr)",
              }}
            >
              {/* Row 1: empty, helmet, empty */}
              <div />
              {renderEquipmentSlot("helmet", "Head", "⛑️")}
              <div />

              {/* Row 2: weapon, body, shield */}
              {renderEquipmentSlot("weapon", "Weapon", "⚔️")}
              {renderEquipmentSlot("body", "Body", "🎽")}
              {renderEquipmentSlot("shield", "Shield", "🛡️")}

              {/* Row 3: empty, legs, empty */}
              <div />
              {renderEquipmentSlot("legs", "Legs", "👖")}
              <div />
              {/* Row 4: Arrows slot hidden for melee-only MVP */}
            </div>
          </div>

          {/* Deposit All Equipment Button */}
          <div className="px-2 pb-2">
            <button
              onClick={onDepositAllEquipment}
              disabled={
                !equipment || Object.values(equipment).every((item) => !item)
              }
              className="w-full py-2 rounded text-sm font-bold transition-colors disabled:opacity-30"
              style={{
                ...getInteractiveTileStyle(theme, {
                  active: true,
                  accentColor: theme.colors.accent.primary,
                  radius: theme.borderRadius.md,
                }),
                color: theme.colors.accent.primary,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `linear-gradient(180deg, rgba(255, 249, 239, 0.07) 0%, ${theme.colors.accent.primary}20 20%, rgba(51, 39, 28, 0.98) 100%)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `linear-gradient(180deg, rgba(255, 250, 241, 0.06) 0%, ${theme.colors.accent.primary}18 20%, rgba(39, 33, 27, 0.98) 100%)`;
              }}
            >
              Deposit Worn Items
            </button>
          </div>
        </>
      )}
    </div>
  );
}
