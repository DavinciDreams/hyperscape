import React, { useEffect, useMemo, useState } from "react";
import {
  useDroppable,
  useDragStore,
  useThemeStore,
  useMobileLayout,
} from "@/ui";
import { getPanelSurfaceStyle } from "@/ui/theme/themes";
import { MOBILE_EQUIPMENT } from "../../constants";
import { useContextMenuState } from "../../hooks";
import {
  EquipmentSlotName,
  EventType,
  getItem,
  uuid,
  CONTEXT_MENU_COLORS,
} from "@hyperscape/shared";
import type { PlayerEquipmentItems, ClientWorld } from "../../types";
import {
  HelmetIcon,
  WeaponIcon,
  BodyIcon,
  ShieldIcon,
  LegsIcon,
  ArrowsIcon,
  BootsIcon,
  GlovesIcon,
  CapeIcon,
  AmuletIcon,
  RingIcon,
  StatsIcon,
  DeathIcon,
} from "./equipment/EquipmentIcons";
import {
  EquipmentTooltip,
  type EquipmentSlotData,
  type EquipmentHoverState,
} from "./equipment/EquipmentTooltip";
import { ItemIcon } from "../../ui/components/ItemIcon";
import { EquipmentPaperdollPortrait } from "./equipment/EquipmentPaperdollPortrait";

interface EquipmentPanelProps {
  equipment: PlayerEquipmentItems | null;
  world?: ClientWorld;
}

type EquipmentSlot = EquipmentSlotData;

// ============================================================================
// Utility Button Component
// ============================================================================

interface UtilityButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function UtilityButton({
  icon,
  label,
  onClick,
  disabled,
}: UtilityButtonProps & { compact?: boolean }) {
  const theme = useThemeStore((s) => s.theme);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center rounded transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 focus-visible:outline-none"
      title={label}
      style={{
        background: `${theme.colors.background.tertiary}80`,
        border: `1px solid ${theme.colors.border.default}60`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <div className="w-5 h-5" style={{ color: theme.colors.accent.primary }}>
        {icon}
      </div>
    </button>
  );
}

interface DroppableEquipmentSlotProps {
  slot: EquipmentSlot;
  onSlotClick: (slot: EquipmentSlot) => void;
  onHoverStart: (
    slot: EquipmentSlot,
    position: { x: number; y: number },
  ) => void;
  onHoverMove: (position: { x: number; y: number }) => void;
  onHoverEnd: () => void;
  onContextMenuOpen: () => void;
}

function DroppableEquipmentSlot({
  slot,
  onSlotClick,
  onHoverStart,
  onHoverMove,
  onHoverEnd,
  onContextMenuOpen,
}: DroppableEquipmentSlotProps) {
  const theme = useThemeStore((s) => s.theme);
  const { shouldUseMobileUI } = useMobileLayout();
  const { isOver, setNodeRef } = useDroppable({
    id: `equipment-${slot.key}`,
    data: { slot: slot.key },
  });

  // Check if the currently dragged item can be equipped in this slot
  const dragItem = useDragStore((state) => state.item);
  const isDragging = useDragStore((state) => state.isDragging);

  // Determine if the dragged item is valid for this slot
  const isValidDrop = useMemo(() => {
    if (!isDragging || !dragItem?.id?.toString().startsWith("inventory-")) {
      return false; // Not dragging an inventory item
    }

    // Get item data from drag context
    const dragData = dragItem.data as { item?: { itemId: string } } | undefined;
    if (!dragData?.item?.itemId) return true; // No data, assume valid (server will validate)

    const itemData = getItem(dragData.item.itemId);
    if (!itemData) return true; // Unknown item, assume valid

    const itemEquipSlot = itemData.equipSlot;
    // Map 2h weapons to weapon slot
    const normalizedSlot = itemEquipSlot === "2h" ? "weapon" : itemEquipSlot;

    // Check if item matches this slot
    return !normalizedSlot || normalizedSlot === slot.key;
  }, [isDragging, dragItem?.id, dragItem?.data, slot.key]);

  // Is there an inventory item being dragged?
  const isDraggingInventoryItem =
    isDragging && dragItem?.id?.toString().startsWith("inventory-");

  const isEmpty = !slot.item;
  const slotTitle = slot.item
    ? `${slot.item.name} (${slot.label})`
    : `${slot.label} (empty)`;

  return (
    <button
      ref={setNodeRef}
      type="button"
      title={slotTitle}
      data-equipment-slot={slot.key}
      data-slot-empty={isEmpty ? "true" : "false"}
      aria-label={
        slot.item
          ? `${slot.item.name} equipped in ${slot.label} slot`
          : `Empty ${slot.label} slot`
      }
      onClick={() => onSlotClick(slot)}
      onMouseEnter={(e) => {
        if (slot.item) {
          onHoverStart(slot, { x: e.clientX, y: e.clientY });
        }
      }}
      onMouseMove={(e) => {
        if (slot.item) {
          onHoverMove({ x: e.clientX, y: e.clientY });
        }
      }}
      onMouseLeave={() => onHoverEnd()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();

        // Hide hover tooltip and mark context menu as open
        onHoverEnd();
        onContextMenuOpen();

        if (!slot.item) return;

        // OSRS uses orange for item names in context menus
        const itemName = slot.item.name;

        const items = [
          {
            id: "unequip",
            label: `Remove ${itemName}`,
            styledLabel: [
              { text: "Remove " },
              { text: itemName, color: CONTEXT_MENU_COLORS.ITEM },
            ],
            enabled: true,
          },
          {
            id: "examine",
            label: `Examine ${itemName}`,
            styledLabel: [
              { text: "Examine " },
              { text: itemName, color: CONTEXT_MENU_COLORS.ITEM },
            ],
            enabled: true,
          },
        ];

        const evt = new CustomEvent("contextmenu", {
          detail: {
            target: {
              id: `equipment_slot_${slot.key}`,
              type: "equipment",
              name: itemName,
            },
            mousePosition: { x: e.clientX, y: e.clientY },
            items,
          },
        });
        window.dispatchEvent(evt);
      }}
      className="w-full h-full rounded-[14px] transition-all duration-150 cursor-pointer group relative overflow-hidden focus-visible:outline-none"
      style={{
        background:
          isOver && isValidDrop
            ? "rgba(242, 208, 138, 0.18)"
            : isOver && !isValidDrop
              ? "rgba(220, 80, 80, 0.18)"
              : isDraggingInventoryItem && isValidDrop
                ? "rgba(242, 208, 138, 0.1)"
                : isEmpty
                  ? "linear-gradient(180deg, rgba(21, 19, 21, 0.96) 0%, rgba(12, 11, 13, 0.98) 100%)"
                  : "linear-gradient(180deg, rgba(29, 25, 23, 0.98) 0%, rgba(17, 15, 16, 0.98) 100%)",
        borderWidth: "1px",
        borderStyle: isOver
          ? "solid"
          : isDraggingInventoryItem && isValidDrop
            ? "dashed"
            : "solid",
        borderColor:
          isOver && isValidDrop
            ? "rgba(100, 180, 100, 0.7)"
            : isOver && !isValidDrop
              ? "rgba(180, 80, 80, 0.7)"
              : isDraggingInventoryItem && isValidDrop
                ? "rgba(180, 160, 100, 0.5)"
                : "rgba(112, 88, 56, 0.34)",
        boxShadow:
          isOver && isValidDrop
            ? "inset 0 0 8px rgba(100, 180, 100, 0.3)"
            : isOver && !isValidDrop
              ? "inset 0 0 8px rgba(180, 80, 80, 0.3)"
              : isEmpty
                ? "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -10px 18px rgba(0,0,0,0.25), 0 6px 12px rgba(0,0,0,0.14)"
                : "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -10px 18px rgba(0,0,0,0.2), 0 8px 14px rgba(0,0,0,0.18)",
        outline: "none",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 26%, rgba(0,0,0,0.1) 100%)",
        }}
      />

      <div
        className="absolute inset-x-[16%] top-[10%] bottom-[12%] rounded-[12px] pointer-events-none"
        style={{
          border: `1px solid ${isEmpty ? "rgba(152, 124, 78, 0.18)" : "rgba(202, 168, 108, 0.22)"}`,
          opacity: isEmpty ? 0.45 : 0.82,
        }}
      />

      <div
        className="flex h-full w-full items-center justify-center"
        style={{
          paddingTop: shouldUseMobileUI ? 4 : 6,
          paddingBottom: shouldUseMobileUI ? 4 : 6,
        }}
      >
        {isEmpty ? (
          <div
            className="transition-all duration-150 group-hover:scale-105 group-hover:opacity-40"
            style={{
              width: shouldUseMobileUI ? "22px" : "28px",
              height: shouldUseMobileUI ? "22px" : "28px",
              color: "rgba(190, 164, 111, 0.34)",
            }}
          >
            {slot.icon}
          </div>
        ) : (
          <div
            className="transition-transform duration-150 group-hover:scale-105"
            style={{
              width: shouldUseMobileUI ? "24px" : "32px",
              height: shouldUseMobileUI ? "24px" : "32px",
              filter: "drop-shadow(0 3px 6px rgba(0, 0, 0, 0.55))",
            }}
          >
            <ItemIcon
              itemId={slot.item!.id}
              size={shouldUseMobileUI ? 24 : 32}
            />
          </div>
        )}
      </div>

      {!isEmpty && (
        <div
          className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, ${theme.colors.accent.primary}15 0%, transparent 70%)`,
          }}
        />
      )}

      {(slot.item?.quantity ?? 1) > 1 && (
        <div
          className="absolute bottom-1.5 right-1.5 min-w-[18px] rounded-full px-1 text-center font-bold"
          style={{
            fontSize: shouldUseMobileUI ? "8px" : "9px",
            color: "#f2d08a",
            background: "rgba(15, 12, 11, 0.78)",
            border: "1px solid rgba(181, 145, 85, 0.4)",
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.9)",
            lineHeight: shouldUseMobileUI ? "14px" : "15px",
          }}
        >
          {slot.item!.quantity ?? 1}
        </div>
      )}

      <div
        className="absolute inset-[2px] rounded-[12px] pointer-events-none opacity-0 group-focus-visible:opacity-100 transition-opacity duration-150"
        style={{
          border: `1px solid ${theme.colors.accent.primary}aa`,
          boxShadow: `0 0 0 1px ${theme.colors.accent.primary}22`,
        }}
      />
    </button>
  );
}

interface PaperdollSlotPlacement {
  area: string;
  key: string;
}

const PAPERDOLL_PLACEMENTS: PaperdollSlotPlacement[] = [
  { area: "cape", key: EquipmentSlotName.CAPE },
  { area: "head", key: EquipmentSlotName.HELMET },
  { area: "body", key: EquipmentSlotName.BODY },
  { area: "legs", key: EquipmentSlotName.LEGS },
  { area: "boots", key: EquipmentSlotName.BOOTS },
  { area: "ammo", key: EquipmentSlotName.ARROWS },
  { area: "amulet", key: EquipmentSlotName.AMULET },
  { area: "ring", key: EquipmentSlotName.RING },
  { area: "gloves", key: EquipmentSlotName.GLOVES },
  { area: "weapon", key: EquipmentSlotName.WEAPON },
  { area: "shield", key: EquipmentSlotName.SHIELD },
];

export const EquipmentPanel = React.memo(function EquipmentPanel({
  equipment,
  world,
}: EquipmentPanelProps) {
  const theme = useThemeStore((s) => s.theme);
  const { shouldUseMobileUI } = useMobileLayout();
  // RS3-style hover tooltip state
  const [hoverState, setHoverState] = useState<EquipmentHoverState | null>(
    null,
  );

  // Track if context menu is open (suppress hover tooltips while open)
  const { isContextMenuOpen, setContextMenuOpen } = useContextMenuState();

  // Equipment slots with SVG icons for paperdoll layout
  const slots: EquipmentSlot[] = [
    {
      key: EquipmentSlotName.HELMET,
      label: "Head",
      icon: <HelmetIcon className="w-full h-full" />,
      item: equipment?.helmet || null,
    },
    {
      key: EquipmentSlotName.BODY,
      label: "Body",
      icon: <BodyIcon className="w-full h-full" />,
      item: equipment?.body || null,
    },
    {
      key: EquipmentSlotName.LEGS,
      label: "Legs",
      icon: <LegsIcon className="w-full h-full" />,
      item: equipment?.legs || null,
    },
    {
      key: EquipmentSlotName.WEAPON,
      label: "Weapon",
      icon: <WeaponIcon className="w-full h-full" />,
      item: equipment?.weapon || null,
    },
    {
      key: EquipmentSlotName.SHIELD,
      label: "Shield",
      icon: <ShieldIcon className="w-full h-full" />,
      item: equipment?.shield || null,
    },
    {
      key: EquipmentSlotName.BOOTS,
      label: "Boots",
      icon: <BootsIcon className="w-full h-full" />,
      item: equipment?.boots || null,
    },
    {
      key: EquipmentSlotName.GLOVES,
      label: "Gloves",
      icon: <GlovesIcon className="w-full h-full" />,
      item: equipment?.gloves || null,
    },
    {
      key: EquipmentSlotName.CAPE,
      label: "Cape",
      icon: <CapeIcon className="w-full h-full" />,
      item: equipment?.cape || null,
    },
    {
      key: EquipmentSlotName.AMULET,
      label: "Amulet",
      icon: <AmuletIcon className="w-full h-full" />,
      item: equipment?.amulet || null,
    },
    {
      key: EquipmentSlotName.RING,
      label: "Ring",
      icon: <RingIcon className="w-full h-full" />,
      item: equipment?.ring || null,
    },
    {
      key: EquipmentSlotName.ARROWS,
      label: "Ammo",
      icon: <ArrowsIcon className="w-full h-full" />,
      item: equipment?.arrows || null,
    },
  ];

  // Calculate total equipment bonuses for stats display
  const totalBonuses = useMemo(() => {
    let attack = 0;
    let defense = 0;
    let strength = 0;

    slots.forEach((slot) => {
      if (slot.item?.bonuses) {
        attack += slot.item.bonuses.attack || 0;
        defense += slot.item.bonuses.defense || 0;
        strength += slot.item.bonuses.strength || 0;
      }
    });

    return { attack, defense, strength };
  }, [equipment]);

  // Utility button handlers
  const handleOpenStats = () => {
    // Open the character stats panel via UI event
    if (world) {
      world.emit(EventType.UI_OPEN_PANE, { pane: "stats" });
    }
  };

  const handleOpenDeath = () => {
    // Open the items kept on death panel via UI event
    if (world) {
      world.emit(EventType.UI_OPEN_PANE, { pane: "death" });
    }
  };

  // Send unequip request to server for a given slot key
  const sendUnequip = (slotKey: string) => {
    const localPlayer = world?.getPlayer();
    if (localPlayer && world?.network?.send) {
      world.network.send("unequipItem", {
        playerId: localPlayer.id,
        slot: slotKey,
      });
    }
  };

  // RS3-style: Click immediately unequips
  const handleSlotClick = (slot: EquipmentSlot) => {
    if (!slot.item) return;
    sendUnequip(slot.key);
  };

  // Hover handlers for tooltip
  const handleHoverStart = (
    slot: EquipmentSlot,
    position: { x: number; y: number },
  ) => {
    // Don't show hover tooltip if context menu is open
    if (isContextMenuOpen) return;
    setHoverState({ slot, position });
  };

  const handleHoverMove = (position: { x: number; y: number }) => {
    // Don't update hover tooltip if context menu is open
    if (isContextMenuOpen) return;
    setHoverState((prev) => (prev ? { ...prev, position } : null));
  };

  const handleHoverEnd = () => {
    setHoverState(null);
  };

  const handleContextMenuOpen = () => {
    setContextMenuOpen(true);
  };

  useEffect(() => {
    const onCtxSelect = (evt: Event) => {
      const ce = evt as CustomEvent<{
        actionId: string;
        targetId: string;
        position?: { x: number; y: number };
      }>;
      const target = ce.detail?.targetId || "";
      if (!target.startsWith("equipment_slot_")) return;

      const slotKey = target.replace("equipment_slot_", "");
      const slot = slots.find((s) => s.key === slotKey);

      if (!slot || !slot.item) return;

      if (ce.detail.actionId === "unequip") {
        sendUnequip(slotKey);
      }

      if (ce.detail.actionId === "examine") {
        const itemData = getItem(slot.item.id);
        const examineText = itemData?.examine || `It's a ${slot.item.name}.`;
        world?.emit(EventType.UI_TOAST, {
          message: examineText,
          type: "info",
          position: ce.detail.position,
        });
        // Also add to chat (OSRS-style game message)
        if (world?.chat?.add) {
          world.chat.add({
            id: uuid(),
            from: "",
            body: examineText,
            createdAt: new Date().toISOString(),
            timestamp: Date.now(),
          });
        }
      }
    };
    window.addEventListener("contextmenu:select", onCtxSelect as EventListener);
    return () =>
      window.removeEventListener(
        "contextmenu:select",
        onCtxSelect as EventListener,
      );
  }, [equipment, world]);

  // Helper to find slot by key
  const getSlot = (key: string) => slots.find((s) => s.key === key) || null;

  const equipmentSignature = useMemo(
    () =>
      slots
        .map((slot) =>
          slot.item
            ? `${slot.key}:${slot.item.id}:${slot.item.quantity ?? 1}`
            : `${slot.key}:empty`,
        )
        .join("|"),
    [slots],
  );

  const renderSlotCell = (
    slotName: string,
    isMobile: boolean,
    area?: string,
  ) => (
    <div
      key={slotName}
      className={isMobile ? undefined : "w-full h-full"}
      style={{
        gridArea: area,
        height: isMobile ? MOBILE_EQUIPMENT.slotHeight : undefined,
        containerType: "size",
      }}
    >
      <DroppableEquipmentSlot
        slot={getSlot(slotName)!}
        onSlotClick={handleSlotClick}
        onHoverStart={handleHoverStart}
        onHoverMove={handleHoverMove}
        onHoverEnd={handleHoverEnd}
        onContextMenuOpen={handleContextMenuOpen}
      />
    </div>
  );

  const renderEquipmentGrid = (isMobile: boolean) => {
    const slotSize = isMobile ? MOBILE_EQUIPMENT.slotHeight : 72;
    const gap = isMobile ? MOBILE_EQUIPMENT.gap : 8;
    const padding = isMobile ? MOBILE_EQUIPMENT.padding : 10;
    const portraitMin = isMobile ? 96 : 128;

    return (
      <div
        data-equipment-grid="paperdoll"
        className="grid h-full"
        style={{
          gridTemplateColumns: `${slotSize}px minmax(0, 1fr) minmax(0, 1fr) ${slotSize}px`,
          gridTemplateRows: `repeat(5, ${slotSize}px)`,
          gridTemplateAreas: `
          "cape portrait portrait ammo"
          "head portrait portrait amulet"
          "body portrait portrait ring"
          "legs portrait portrait gloves"
          "boots weapon shield empty"
        `,
          gap,
          padding,
          alignItems: "stretch",
        }}
      >
        <div
          data-equipment-center="portrait"
          style={{
            gridArea: "portrait",
            minWidth: 0,
            minHeight: isMobile
              ? slotSize * 4 + gap * 3
              : slotSize * 4 + gap * 3,
          }}
        >
          <EquipmentPaperdollPortrait
            world={world}
            equipmentSignature={equipmentSignature}
            compact={isMobile}
            className="h-full w-full"
          />
        </div>

        {PAPERDOLL_PLACEMENTS.map((placement) =>
          renderSlotCell(placement.key, isMobile, placement.area),
        )}

        <div style={{ gridArea: "empty" }} />
      </div>
    );
  };

  return (
    <>
      <div
        className="flex flex-col h-full overflow-hidden"
        style={{
          ...getPanelSurfaceStyle(theme, { emphasis: "normal" }),
          padding: shouldUseMobileUI ? "6px" : `${theme.spacing.xs}px`,
          gap: shouldUseMobileUI ? "6px" : `${theme.spacing.xs}px`,
          border: "none",
          borderRadius: 0,
          boxShadow: "none",
        }}
      >
        <div
          className="flex-1 relative overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, rgba(38, 31, 29, 0.98) 0%, rgba(20, 17, 18, 0.99) 100%)",
            border: `1px solid ${theme.colors.border.default}70`,
            borderRadius: `${theme.borderRadius.lg}px`,
            padding: shouldUseMobileUI ? 0 : `${theme.spacing.sm}px`,
            boxShadow:
              "0 12px 30px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -18px 26px rgba(0,0,0,0.24)",
          }}
        >
          {renderEquipmentGrid(shouldUseMobileUI)}
        </div>

        {shouldUseMobileUI ? (
          <>
            <div
              className="flex justify-center gap-4 py-1.5"
              style={{
                background:
                  "linear-gradient(180deg, rgba(46, 39, 37, 0.98) 0%, rgba(24, 20, 21, 0.98) 100%)",
                borderRadius: `${theme.borderRadius.md}px`,
                border: `1px solid ${theme.colors.border.default}66`,
                fontSize: "11px",
                boxShadow: theme.shadows.sm,
              }}
            >
              <span style={{ color: theme.colors.state.danger }}>
                ⚔️ {totalBonuses.attack}
              </span>
              <span style={{ color: theme.colors.state.success }}>
                🛡️ {totalBonuses.defense}
              </span>
              <span style={{ color: theme.colors.state.warning }}>
                💪 {totalBonuses.strength}
              </span>
            </div>

            <div
              className="flex items-center justify-center gap-2 px-3 py-1.5"
              style={{
                background:
                  "linear-gradient(180deg, rgba(46, 39, 37, 0.98) 0%, rgba(24, 20, 21, 0.98) 100%)",
                borderRadius: `${theme.borderRadius.sm}px`,
                border: `1px solid ${theme.colors.border.default}66`,
                boxShadow: `${theme.shadows.sm}, inset 1px 1px 3px rgba(0, 0, 0, 0.3)`,
              }}
            >
              <UtilityButton
                icon={<StatsIcon className="w-full h-full" />}
                label="Stats"
                onClick={handleOpenStats}
              />
              <UtilityButton
                icon={<DeathIcon className="w-full h-full" />}
                label="Death"
                onClick={handleOpenDeath}
              />
            </div>
          </>
        ) : (
          <>
            <div
              className="flex justify-center gap-4 py-1"
              style={{
                background:
                  "linear-gradient(180deg, rgba(46, 39, 37, 0.98) 0%, rgba(24, 20, 21, 0.98) 100%)",
                borderRadius: `${theme.borderRadius.md}px`,
                border: `1px solid ${theme.colors.border.default}66`,
                fontSize: "11px",
                boxShadow: theme.shadows.sm,
              }}
            >
              <span style={{ color: theme.colors.state.danger }}>
                ⚔️ {totalBonuses.attack}
              </span>
              <span style={{ color: theme.colors.state.success }}>
                🛡️ {totalBonuses.defense}
              </span>
              <span style={{ color: theme.colors.state.warning }}>
                💪 {totalBonuses.strength}
              </span>
            </div>

            <div
              className="flex justify-between px-1 py-1.5"
              style={{
                background:
                  "linear-gradient(180deg, rgba(46, 39, 37, 0.98) 0%, rgba(24, 20, 21, 0.98) 100%)",
                borderRadius: `${theme.borderRadius.md}px`,
                border: `1px solid ${theme.colors.border.default}66`,
                boxShadow: theme.shadows.sm,
              }}
            >
              <UtilityButton
                icon={<StatsIcon className="w-full h-full" />}
                label="Stats"
                onClick={handleOpenStats}
              />
              <UtilityButton
                icon={<DeathIcon className="w-full h-full" />}
                label="Death"
                onClick={handleOpenDeath}
              />
            </div>
          </>
        )}
      </div>

      {/* Enhanced hover tooltip - rendered via portal */}
      <EquipmentTooltip hoverState={hoverState} />
    </>
  );
});
