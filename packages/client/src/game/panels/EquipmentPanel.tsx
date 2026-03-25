import React, { useEffect, useMemo, useState } from "react";
import {
  useDroppable,
  useDragStore,
  useThemeStore,
  useMobileLayout,
} from "@/ui";
import {
  getInteractiveTileStyle,
  getPanelInsetStyle,
  getPanelSurfaceStyle,
} from "@/ui/theme/themes";
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
  compact = false,
}: UtilityButtonProps & { compact?: boolean }) {
  const theme = useThemeStore((s) => s.theme);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center transition-all duration-150 hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none"
      title={label}
      style={{
        width: compact ? 32 : 36,
        height: compact ? 32 : 36,
        ...getInteractiveTileStyle(theme, {
          radius: compact ? 9 : 10,
        }),
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: compact ? 17 : 20,
          height: compact ? 17 : 20,
          color: theme.colors.accent.primary,
        }}
      >
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
  const [isHovered, setIsHovered] = useState(false);
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
  const invalidDrop = isOver && !isValidDrop;
  const validDrop = isOver && isValidDrop;
  const baseTileStyle = getInteractiveTileStyle(theme, {
    hovered: isHovered && !validDrop && !invalidDrop,
    dropTarget: validDrop,
    radius: shouldUseMobileUI ? 10 : 12,
    accentColor: theme.colors.accent.primary,
  });

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
        setIsHovered(true);
        if (slot.item) {
          onHoverStart(slot, { x: e.clientX, y: e.clientY });
        }
      }}
      onMouseMove={(e) => {
        if (slot.item) {
          onHoverMove({ x: e.clientX, y: e.clientY });
        }
      }}
      onBlur={() => setIsHovered(false)}
      onMouseLeave={() => {
        setIsHovered(false);
        onHoverEnd();
      }}
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
        ...baseTileStyle,
        background: invalidDrop
          ? `linear-gradient(180deg, ${theme.colors.state.danger}20 0%, rgba(22, 26, 31, 0.98) 100%)`
          : validDrop
            ? baseTileStyle.background
            : isDraggingInventoryItem && isValidDrop
              ? `linear-gradient(180deg, ${theme.colors.accent.primary}14 0%, rgba(22, 26, 31, 0.99) 100%)`
              : isEmpty
                ? "linear-gradient(180deg, rgba(255,255,255,0.022) 0%, rgba(22,26,31,0.99) 100%)"
                : "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(26,30,36,0.99) 100%)",
        borderWidth: "1px",
        borderStyle:
          validDrop || invalidDrop
            ? "solid"
            : isDraggingInventoryItem && isValidDrop
              ? "dashed"
              : "solid",
        borderColor: invalidDrop
          ? `${theme.colors.state.danger}99`
          : validDrop
            ? theme.colors.border.hover
            : isDraggingInventoryItem && isValidDrop
              ? `${theme.colors.accent.primary}7a`
              : isEmpty
                ? `${theme.colors.border.default}55`
                : `${theme.colors.border.default}80`,
        boxShadow: invalidDrop
          ? `inset 0 0 8px ${theme.colors.state.danger}26`
          : validDrop
            ? `0 0 10px ${theme.colors.accent.primary}12, inset 0 1px 0 rgba(255,255,255,0.05)`
            : isEmpty
              ? "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -8px 12px rgba(0,0,0,0.14)"
              : "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -10px 14px rgba(0,0,0,0.16)",
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
        className="absolute inset-x-[14%] top-[10%] bottom-[24%] rounded-[12px] pointer-events-none"
        style={{
          border: `1px solid ${isEmpty ? `${theme.colors.border.default}2e` : `${theme.colors.border.hover}44`}`,
          opacity: isEmpty ? 0.3 : 0.55,
        }}
      />

      <div
        className="flex h-full w-full flex-col items-center justify-between"
        style={{
          paddingTop: shouldUseMobileUI ? 5 : 6,
          paddingBottom: shouldUseMobileUI ? 4 : 5,
        }}
      >
        <div
          className="flex flex-1 items-center justify-center"
          style={{
            minHeight: 0,
          }}
        >
          {isEmpty ? (
            <div
              className="transition-all duration-150 group-hover:scale-105 group-hover:opacity-40"
              style={{
                width: shouldUseMobileUI ? "14px" : "16px",
                height: shouldUseMobileUI ? "14px" : "16px",
                color: `${theme.colors.text.muted}aa`,
              }}
            >
              {slot.icon}
            </div>
          ) : (
            <div
              className="transition-transform duration-150 group-hover:scale-105"
              style={{
                width: shouldUseMobileUI ? "18px" : "20px",
                height: shouldUseMobileUI ? "18px" : "20px",
                filter: "drop-shadow(0 3px 6px rgba(0, 0, 0, 0.55))",
              }}
            >
              <ItemIcon
                itemId={slot.item!.id}
                size={shouldUseMobileUI ? 18 : 20}
              />
            </div>
          )}
        </div>

        <div
          className="w-full truncate text-center font-semibold uppercase tracking-[0.14em]"
          style={{
            fontSize: shouldUseMobileUI ? "6px" : "7px",
            lineHeight: 1.1,
            color: isEmpty
              ? `${theme.colors.text.muted}bf`
              : theme.colors.text.secondary,
            textShadow: "0 1px 1px rgba(0,0,0,0.7)",
            paddingInline: shouldUseMobileUI ? 3 : 4,
          }}
        >
          {slot.label}
        </div>
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
            color: theme.colors.text.primary,
            background: "rgba(17, 20, 25, 0.86)",
            border: `1px solid ${theme.colors.border.hover}`,
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
    slotSize: number,
    area?: string,
  ) => (
    <div
      key={slotName}
      className={isMobile ? undefined : "w-full h-full"}
      style={{
        gridArea: area,
        height: isMobile ? slotSize : undefined,
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
    const slotWidth = isMobile ? 34 : 38;
    const slotHeight = isMobile ? 34 : 38;
    const portraitWidth = isMobile ? 66 : 78;
    const gap = isMobile ? 2 : 3;
    const padding = isMobile ? 2 : 3;

    return (
      <div
        data-equipment-grid="paperdoll"
        className="grid h-full"
        style={{
          gridTemplateColumns: `${slotWidth}px ${isMobile ? 4 : 6}px minmax(${portraitWidth}px, 1fr) ${isMobile ? 4 : 6}px ${slotWidth}px`,
          gridTemplateRows: `repeat(5, ${slotHeight}px) ${slotHeight}px`,
          gridTemplateAreas: `
          "cape . portrait . ammo"
          "head . portrait . amulet"
          "body . portrait . ring"
          "legs . portrait . gloves"
          "boots . portrait . empty"
          ". weapon . shield ."
        `,
          gap,
          padding,
          alignItems: "stretch",
          justifyItems: "stretch",
        }}
      >
        <div
          data-equipment-center="portrait"
          style={{
            gridArea: "portrait",
            minWidth: 0,
            minHeight: slotHeight * 5 + gap * 4,
          }}
        >
          <EquipmentPaperdollPortrait
            world={world}
            equipment={equipment}
            equipmentSignature={equipmentSignature}
            compact={isMobile}
            className="h-full w-full"
          />
        </div>

        {PAPERDOLL_PLACEMENTS.map((placement) =>
          renderSlotCell(placement.key, isMobile, slotHeight, placement.area),
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
          padding: shouldUseMobileUI ? "3px" : "4px",
          gap: shouldUseMobileUI ? "3px" : "4px",
          border: "none",
          borderRadius: 0,
          boxShadow: "none",
        }}
      >
        <div
          className="flex-1 relative overflow-hidden"
          style={{
            ...getPanelInsetStyle(theme, {
              emphasis: "strong",
              radius: theme.borderRadius.lg,
            }),
            padding: shouldUseMobileUI ? 0 : "3px",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -18px 26px rgba(0,0,0,0.18)",
          }}
        >
          {renderEquipmentGrid(shouldUseMobileUI)}
        </div>

        <div
          className="flex justify-center gap-3"
          style={{
            ...getPanelInsetStyle(theme, {
              emphasis: "normal",
              radius: theme.borderRadius.md,
            }),
            padding: shouldUseMobileUI ? "2px 6px" : "4px 8px",
            fontSize: shouldUseMobileUI ? "8px" : "10px",
            lineHeight: 1,
          }}
        >
          <span style={{ color: theme.colors.status.hp }}>
            {totalBonuses.attack}
          </span>
          <span style={{ color: theme.colors.status.energy }}>
            {totalBonuses.defense}
          </span>
          <span style={{ color: theme.colors.status.prayer }}>
            {totalBonuses.strength}
          </span>
        </div>

        <div
          className="flex items-center gap-1.5 px-0.5"
          style={{
            minHeight: shouldUseMobileUI ? 28 : 32,
          }}
        >
          <UtilityButton
            icon={<StatsIcon className="w-full h-full" />}
            label="Stats"
            onClick={handleOpenStats}
            compact={shouldUseMobileUI}
          />
          <UtilityButton
            icon={<DeathIcon className="w-full h-full" />}
            label="Death"
            onClick={handleOpenDeath}
            compact={shouldUseMobileUI}
          />
        </div>
      </div>

      {/* Enhanced hover tooltip - rendered via portal */}
      <EquipmentTooltip hoverState={hoverState} />
    </>
  );
});
