import React, { useEffect, useState, useMemo, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useThemeStore, useMobileLayout, useWindowStore } from "@/ui";
import {
  getInteractiveTileStyle,
  getPanelInsetStyle,
  getPanelSurfaceStyle,
} from "@/ui/theme/themes";
import { EventType, getAvailableStyles, WeaponType } from "@hyperscape/shared";
import type {
  ClientWorld,
  PlayerStats,
  PlayerEquipmentItems,
  PlayerHealth,
} from "../../types";

/** SVG Icons for attack styles - clean vector icons */
const StyleIcon = ({
  style,
  size = 16,
  color = "currentColor",
}: {
  style: string;
  size?: number;
  color?: string;
}) => {
  switch (style) {
    case "accurate":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "aggressive":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.5 4l7.5 7.5-7.5 7.5" />
          <path d="M5.5 4l7.5 7.5-7.5 7.5" />
        </svg>
      );
    case "defensive":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "controlled":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="2" x2="12" y2="22" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "rapid":
      // Lightning bolt for rapid fire
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "longrange":
      // Telescope/distance icon for longrange
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12h-8" />
          <path d="m3 12 4-4v8l-4-4z" />
          <path d="M11 8h2" />
          <path d="M11 16h2" />
          <path d="M16 12v.01" />
        </svg>
      );
    case "autocast":
      // Magic wand/star icon for autocast
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        </svg>
      );
    default:
      return null;
  }
};

/** Stat icons as SVG */
const StatIcon = ({
  stat,
  size = 14,
  color = "currentColor",
}: {
  stat: "attack" | "strength" | "defense";
  size?: number;
  color?: string;
}) => {
  switch (stat) {
    case "attack":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8" />
          <path d="m16 16 6-6" />
          <path d="m8 8 6-6" />
          <path d="m9 7 8 8" />
          <path d="m21 11-8-8" />
        </svg>
      );
    case "strength":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18.36 2.64a9 9 0 0 1 3 3" />
          <path d="M15 6.5v11" />
          <path d="M9 6.5v11" />
          <path d="M4 11a9 9 0 0 1 3-3" />
          <path d="M2.64 18.36a9 9 0 0 0 3 3" />
          <path d="M20 13a9 9 0 0 1-3 3" />
          <path d="M21.36 5.64a9 9 0 0 0-3 3" />
          <path d="M4 13a9 9 0 0 0 3 3" />
        </svg>
      );
    case "defense":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
  }
};

/** Individual combat style info */
interface CombatStyleInfo {
  id: string;
  label: string;
  xp: string;
  color: string;
}

/** Draggable combat style button component */
const DraggableCombatStyleButton = ({
  style: styleInfo,
  isActive,
  disabled,
  isMobile,
  onClick,
  theme,
}: {
  style: CombatStyleInfo;
  isActive: boolean;
  disabled: boolean;
  isMobile: boolean;
  onClick: () => void;
  theme: ReturnType<typeof useThemeStore.getState>["theme"];
}) => {
  // Make combat style draggable for action bar
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `combatstyle-${styleInfo.id}`,
    data: {
      combatStyle: {
        id: styleInfo.id,
        label: styleInfo.label,
        color: styleInfo.color,
      },
      source: "combatstyle",
    },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: 0,
        padding: isMobile ? "5px 6px" : "4px 6px",
        transition: "all 0.12s ease",
        ...getInteractiveTileStyle(theme, {
          active: isActive,
          disabled,
          dragging: isDragging,
          radius: 5,
          accentColor: styleInfo.color,
        }),
        display: "flex",
        alignItems: "center",
        gap: "6px",
        opacity: disabled ? 0.5 : isDragging ? 0.7 : 1,
        transform: isDragging ? "scale(1.01)" : "scale(1)",
        width: "100%",
        position: "relative",
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onClick();
        }}
        disabled={disabled}
        aria-pressed={isActive}
        className="style-btn focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/50"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: disabled ? "not-allowed" : "pointer",
          color: isActive ? styleInfo.color : theme.colors.text.secondary,
          textAlign: "left",
          touchAction: "manipulation",
        }}
      >
        <StyleIcon
          style={styleInfo.id}
          size={isMobile ? 14 : 13}
          color={isActive ? styleInfo.color : theme.colors.text.muted}
        />
        <span
          style={{
            fontWeight: 600,
            lineHeight: 1,
            fontSize: isMobile ? "11px" : "10px",
            color: isActive
              ? theme.colors.text.primary
              : theme.colors.text.secondary,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
          }}
        >
          {styleInfo.label}
        </span>
        <span
          style={{
            fontSize: isMobile ? "9px" : "8px",
            color: isActive ? styleInfo.color : theme.colors.text.muted,
            fontWeight: 600,
            opacity: 0.8,
            whiteSpace: "nowrap",
          }}
        >
          {styleInfo.xp}
        </span>
      </button>
      {/* Separate drag handle so dnd-kit doesn't intercept clicks */}
      <div
        {...attributes}
        {...listeners}
        aria-label={`Drag ${styleInfo.label} style to action bar`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "14px",
          height: "14px",
          cursor: disabled ? "not-allowed" : isDragging ? "grabbing" : "grab",
          color: theme.colors.text.muted,
          opacity: disabled ? 0.35 : 0.5,
          flexShrink: 0,
          touchAction: "none",
        }}
      >
        <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
          <circle cx="3" cy="3" r="0.9" />
          <circle cx="7" cy="3" r="0.9" />
          <circle cx="3" cy="7" r="0.9" />
          <circle cx="7" cy="7" r="0.9" />
        </svg>
      </div>
    </div>
  );
};

/** Combat stats row with SVG icons - compact */
const CombatStatsRow = React.memo(function CombatStatsRow({
  attackLevel,
  strengthLevel,
  defenseLevel,
  isMobile,
}: {
  attackLevel: number;
  strengthLevel: number;
  defenseLevel: number;
  isMobile: boolean;
}) {
  const theme = useThemeStore((s) => s.theme);
  const stats: Array<{
    key: "attack" | "strength" | "defense";
    value: number;
    color: string;
  }> = [
    { key: "attack", value: attackLevel, color: "#ef4444" },
    { key: "strength", value: strengthLevel, color: "#22c55e" },
    { key: "defense", value: defenseLevel, color: "#3b82f6" },
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        padding: "2px 0",
      }}
    >
      {stats.map((stat, index) => (
        <React.Fragment key={stat.key}>
          {index > 0 && (
            <div
              style={{
                width: "1px",
                height: "10px",
                background: `${theme.colors.border.default}25`,
              }}
            />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            <StatIcon
              stat={stat.key}
              size={isMobile ? 11 : 10}
              color={stat.color}
            />
            <span
              style={{
                fontSize: isMobile ? "11px" : "10px",
                color: stat.color,
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {stat.value}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
});

// Event data interfaces for type-safe event handling
interface StyleUpdateEvent {
  playerId: string;
  currentStyle: { id: string };
}

interface TargetChangedEvent {
  targetId: string | null;
  targetName?: string;
  targetHealth?: PlayerHealth;
}

interface TargetHealthEvent {
  targetId: string;
  health: PlayerHealth;
}

interface AutoRetaliateEvent {
  playerId: string;
  enabled: boolean;
}

// Type guards for runtime validation
function isStyleUpdateEvent(data: unknown): data is StyleUpdateEvent {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.playerId === "string" &&
    typeof d.currentStyle === "object" &&
    d.currentStyle !== null &&
    typeof (d.currentStyle as Record<string, unknown>).id === "string"
  );
}

function isTargetChangedEvent(data: unknown): data is TargetChangedEvent {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return d.targetId === null || typeof d.targetId === "string";
}

function isTargetHealthEvent(data: unknown): data is TargetHealthEvent {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.targetId === "string" &&
    typeof d.health === "object" &&
    d.health !== null
  );
}

function isAutoRetaliateEvent(data: unknown): data is AutoRetaliateEvent {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.playerId === "string" && typeof d.enabled === "boolean";
}

interface CombatPanelProps {
  world: ClientWorld;
  stats: PlayerStats | null;
  equipment: PlayerEquipmentItems | null;
}

// Client-side cache for combat style state (persists across panel opens/closes)
// This enables instant display when reopening panel (RuneScape pattern)
const combatStyleCache = new Map<string, string>();
const autoRetaliateCache = new Map<string, boolean>();
const VALID_WEAPON_TYPES = new Set<string>(Object.values(WeaponType));

export function CombatPanel({ world, stats, equipment }: CombatPanelProps) {
  const theme = useThemeStore((s) => s.theme);
  const { shouldUseMobileUI } = useMobileLayout();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelSize, setPanelSize] = useState({ width: 280, height: 360 });
  // Initialize from cache if available, otherwise default to "accurate"
  // Check order: module cache > network cache > default
  const [style, setStyle] = useState<string>(() => {
    const playerId = world.entities?.player?.id;
    // 1. Check module cache (for instant display on panel reopen)
    if (playerId && combatStyleCache.has(playerId)) {
      return combatStyleCache.get(playerId)!;
    }
    // 2. Check network cache (for fresh page loads - packet arrived before UI mounted)
    const networkCache =
      world.network?.lastAttackStyleByPlayerId?.[playerId || ""];
    if (networkCache?.currentStyle?.id) {
      // Also update module cache for future panel reopens
      if (playerId) {
        combatStyleCache.set(playerId, networkCache.currentStyle.id);
      }
      return networkCache.currentStyle.id;
    }
    return "accurate";
  });
  const [cooldown, setCooldown] = useState<number>(0);
  const [targetName, setTargetName] = useState<string | null>(null);
  const [targetHealth, setTargetHealth] = useState<PlayerHealth | null>(null);
  // Auto-retaliate state (OSRS default is ON)
  const [autoRetaliate, setAutoRetaliate] = useState<boolean>(() => {
    const player = world.entities?.player;
    const playerId = player?.id;
    // First check cache (for instant display on panel reopen)
    if (playerId && autoRetaliateCache.has(playerId)) {
      return autoRetaliateCache.get(playerId)!;
    }
    // Read directly from player entity (set from server data during entity creation)
    const playerCombat = (player as { combat?: { autoRetaliate?: boolean } })
      ?.combat;
    if (typeof playerCombat?.autoRetaliate === "boolean") {
      return playerCombat.autoRetaliate;
    }
    return true; // OSRS default: ON
  });
  const playerId = world.entities?.player?.id ?? null;
  const previousPlayerIdRef = useRef<string | null>(null);

  // Calculate combat level using OSRS formula (melee-only MVP)
  const combatLevel = stats?.skills
    ? (() => {
        const s = stats.skills;
        const base =
          0.25 * ((s.defense?.level || 1) + (s.constitution?.level || 10));
        const melee =
          0.325 * ((s.attack?.level || 1) + (s.strength?.level || 1));
        return Math.floor(base + melee);
      })()
    : 1;
  const inCombat = stats?.inCombat || false;
  const health = stats?.health || { current: 100, max: 100 };
  const attackLevel = stats?.skills?.attack?.level || 1;
  const strengthLevel = stats?.skills?.strength?.level || 1;
  const defenseLevel = stats?.skills?.defense?.level || 1;

  useEffect(() => {
    if (!playerId) return;

    // Immediately sync from network cache (handles fresh page loads)
    // The packet may have arrived before this component mounted
    const networkCache = world.network?.lastAttackStyleByPlayerId?.[playerId];
    if (networkCache?.currentStyle?.id) {
      combatStyleCache.set(playerId, networkCache.currentStyle.id);
      setStyle(networkCache.currentStyle.id);
    }

    const actions = world.getSystem("actions") as {
      actionMethods?: {
        getAttackStyleInfo?: (
          id: string,
          cb: (info: { style: string; cooldown?: number }) => void,
        ) => void;
        changeAttackStyle?: (id: string, style: string) => void;
        getAutoRetaliate?: (id: string, cb: (enabled: boolean) => void) => void;
        setAutoRetaliate?: (id: string, enabled: boolean) => void;
      };
    } | null;

    actions?.actionMethods?.getAttackStyleInfo?.(
      playerId,
      (info: { style: string; cooldown?: number }) => {
        if (info) {
          // Update cache for instant display on panel reopen
          combatStyleCache.set(playerId, info.style);
          setStyle(info.style);
          setCooldown(info.cooldown || 0);
        }
      },
    );

    // Initialize auto-retaliate state from server
    actions?.actionMethods?.getAutoRetaliate?.(playerId, (enabled: boolean) => {
      autoRetaliateCache.set(playerId, enabled);
      setAutoRetaliate(enabled);
    });

    // Direct fallback: read from player entity if callback doesn't fire
    // This ensures we get the correct value even if the event system has issues
    const player = world.entities?.player;
    if (player) {
      const playerCombat = (player as { combat?: { autoRetaliate?: boolean } })
        ?.combat;
      if (typeof playerCombat?.autoRetaliate === "boolean") {
        autoRetaliateCache.set(playerId, playerCombat.autoRetaliate);
        setAutoRetaliate(playerCombat.autoRetaliate);
      }
    }

    const onUpdate = (data: unknown) => {
      if (!isStyleUpdateEvent(data)) return;
      if (data.playerId !== playerId) return;
      // Update cache for instant display on panel reopen
      combatStyleCache.set(playerId, data.currentStyle.id);
      setStyle(data.currentStyle.id);
    };
    const onChanged = (data: unknown) => {
      if (!isStyleUpdateEvent(data)) return;
      if (data.playerId !== playerId) return;
      // Update cache for instant display on panel reopen
      combatStyleCache.set(playerId, data.currentStyle.id);
      setStyle(data.currentStyle.id);
    };

    // Listen for combat target updates
    const onTargetChanged = (data: unknown) => {
      if (!isTargetChangedEvent(data)) return;
      if (data.targetId) {
        setTargetName(data.targetName || data.targetId);
        setTargetHealth(data.targetHealth || null);
      } else {
        setTargetName(null);
        setTargetHealth(null);
      }
    };

    const onTargetHealthUpdate = (data: unknown) => {
      if (!isTargetHealthEvent(data)) return;
      if (data.targetId && targetName) {
        setTargetHealth(data.health);
      }
    };

    // Listen for auto-retaliate changes from server
    const onAutoRetaliateChanged = (data: unknown) => {
      if (!isAutoRetaliateEvent(data)) return;
      if (data.playerId !== playerId) return;
      autoRetaliateCache.set(playerId, data.enabled);
      setAutoRetaliate(data.enabled);
    };

    world.on(EventType.UI_ATTACK_STYLE_UPDATE, onUpdate, undefined);
    world.on(EventType.UI_ATTACK_STYLE_CHANGED, onChanged, undefined);
    world.on(
      EventType.UI_AUTO_RETALIATE_CHANGED,
      onAutoRetaliateChanged,
      undefined,
    );
    world.on(EventType.UI_COMBAT_TARGET_CHANGED, onTargetChanged, undefined);
    world.on(
      EventType.UI_COMBAT_TARGET_HEALTH,
      onTargetHealthUpdate,
      undefined,
    );

    return () => {
      world.off(
        EventType.UI_ATTACK_STYLE_UPDATE,
        onUpdate,
        undefined,
        undefined,
      );
      world.off(
        EventType.UI_ATTACK_STYLE_CHANGED,
        onChanged,
        undefined,
        undefined,
      );
      world.off(
        EventType.UI_AUTO_RETALIATE_CHANGED,
        onAutoRetaliateChanged,
        undefined,
        undefined,
      );
      world.off(
        EventType.UI_COMBAT_TARGET_CHANGED,
        onTargetChanged,
        undefined,
        undefined,
      );
      world.off(
        EventType.UI_COMBAT_TARGET_HEALTH,
        onTargetHealthUpdate,
        undefined,
        undefined,
      );
    };
  }, [playerId, targetName, world]);

  useEffect(() => {
    const previousPlayerId = previousPlayerIdRef.current;
    if (previousPlayerId && previousPlayerId !== playerId) {
      combatStyleCache.delete(previousPlayerId);
      autoRetaliateCache.delete(previousPlayerId);
    }
    previousPlayerIdRef.current = playerId;
  }, [playerId]);

  const changeStyle = (next: string) => {
    const playerId = world.entities?.player?.id;
    if (!playerId) return;

    const actions = world.getSystem("actions") as {
      actionMethods?: {
        changeAttackStyle?: (id: string, style: string) => void;
      };
    } | null;

    if (!actions?.actionMethods?.changeAttackStyle) return;

    // Optimistic: update UI instantly (OSRS has zero visible delay)
    combatStyleCache.set(playerId, next);
    setStyle(next);

    // Send to server — server confirms via attackStyleChanged packet,
    // which will overwrite our optimistic value with the authoritative one
    actions.actionMethods.changeAttackStyle(playerId, next);

    // OSRS-accurate: selecting autocast opens the spells panel for spell selection
    if (next === "autocast") {
      const store = useWindowStore.getState();
      const windows = Array.from(store.windows.values());
      const existing = windows.find((w) =>
        w.tabs.some((t) => t.content === "spells"),
      );
      if (existing) {
        const tabIndex = existing.tabs.findIndex((t) => t.content === "spells");
        if (tabIndex >= 0) {
          store.updateWindow(existing.id, {
            activeTabIndex: tabIndex,
            visible: true,
          });
          store.bringToFront(existing.id);
        }
      } else {
        store.createWindow({
          id: `panel-spells-${Date.now()}`,
          position: {
            x: Math.max(100, window.innerWidth / 2 - 200),
            y: Math.max(100, window.innerHeight / 2 - 150),
          },
          size: { width: 400, height: 350 },
          minSize: { width: 250, height: 200 },
          tabs: [
            {
              id: "spells",
              label: "Spells",
              content: "spells",
              closeable: true,
            },
          ],
        });
      }
    }
  };

  const toggleAutoRetaliate = () => {
    const playerId = world.entities?.player?.id;
    if (!playerId) return;

    const actions = world.getSystem("actions") as {
      actionMethods?: {
        setAutoRetaliate?: (id: string, enabled: boolean) => void;
      };
    } | null;

    if (!actions?.actionMethods?.setAutoRetaliate) return;

    const newValue = !autoRetaliate;

    // Optimistic: update UI instantly (OSRS has zero visible delay)
    autoRetaliateCache.set(playerId, newValue);
    setAutoRetaliate(newValue);

    // Send to server — server confirms via autoRetaliateChanged packet,
    // which will overwrite our optimistic value with the authoritative one
    actions.actionMethods.setAutoRetaliate(playerId, newValue);
  };

  // All possible combat styles with their XP training info and colors
  // Includes melee, ranged, and magic styles (OSRS-accurate)
  const allStyles: Array<{
    id: string;
    label: string;
    xp: string;
    color: string;
  }> = [
    // Melee styles
    {
      id: "accurate",
      label: "Accurate",
      xp: "Attack",
      color: "#ef4444",
    },
    {
      id: "aggressive",
      label: "Aggressive",
      xp: "Strength",
      color: "#22c55e",
    },
    {
      id: "defensive",
      label: "Defensive",
      xp: "Defense",
      color: "#3b82f6",
    },
    {
      id: "controlled",
      label: "Controlled",
      xp: "All",
      color: "#a855f7",
    },
    // Ranged styles
    {
      id: "rapid",
      label: "Rapid",
      xp: "Ranged",
      color: "#f59e0b",
    },
    {
      id: "longrange",
      label: "Longrange",
      xp: "Rng+Def",
      color: "#06b6d4",
    },
    // Magic styles
    {
      id: "autocast",
      label: "Autocast",
      xp: "Magic",
      color: "#8b5cf6",
    },
  ];

  // Filter styles based on equipped weapon (OSRS-accurate restrictions)
  const styles = useMemo(() => {
    const normalizedWeaponType = equipment?.weapon?.weaponType?.toLowerCase();
    const weaponType = normalizedWeaponType
      ? VALID_WEAPON_TYPES.has(normalizedWeaponType)
        ? (normalizedWeaponType as WeaponType)
        : WeaponType.NONE
      : WeaponType.NONE;
    const availableStyleIds = getAvailableStyles(weaponType);
    return allStyles.filter((s) =>
      (availableStyleIds as readonly string[]).includes(s.id),
    );
  }, [equipment?.weapon?.weaponType]);

  const healthPercent = Math.round((health.current / health.max) * 100);
  const targetHealthPercent = targetHealth
    ? Math.round((targetHealth.current / targetHealth.max) * 100)
    : 0;

  useEffect(() => {
    const element = panelRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const updateSize = () => {
      setPanelSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Responsive padding/sizing - compact for both mobile and desktop
  const compactPanel =
    shouldUseMobileUI || panelSize.height < 330 || panelSize.width < 250;
  const ultraCompactPanel = panelSize.height < 290 || panelSize.width < 220;
  const p = compactPanel
    ? { outer: 3, inner: 4, gap: 3 }
    : { outer: 4, inner: 6, gap: 4 };
  return (
    <div
      ref={panelRef}
      className="flex flex-col h-full overflow-hidden"
      style={{
        ...getPanelSurfaceStyle(theme, { emphasis: "normal" }),
        padding: `${p.outer}px`,
        gap: `${p.gap}px`,
      }}
    >
      {/* Inline CSS animations */}
      <style>{`
        @keyframes combat-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .combat-pulse { animation: combat-pulse 1.5s ease-in-out infinite; }
        .style-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .style-btn:active:not(:disabled) { transform: translateY(0); }
      `}</style>

      {/* HP + Combat Level — single compact row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: `${p.inner}px`,
          background:
            theme.name === "hyperscape"
              ? "linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(0, 0, 0, 0.12) 100%)"
              : theme.colors.slot.filled,
          border: inCombat
            ? `1px solid ${theme.colors.state.danger}50`
            : `1px solid ${theme.colors.border.default}35`,
          borderRadius: theme.borderRadius.md,
          flexShrink: 0,
        }}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="#ef4444">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        {/* HP bar inline */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: "100%",
              height: "5px",
              background: theme.colors.background.panelPrimary,
              borderRadius: 3,
              overflow: "hidden",
              border: `1px solid ${theme.colors.border.default}30`,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${healthPercent}%`,
                borderRadius: 3,
                transition: "width 0.2s ease",
                background: "linear-gradient(180deg, #f87171, #dc2626)",
              }}
            />
          </div>
        </div>
        <span
          style={{
            fontSize: "11px",
            color: theme.colors.text.primary,
            fontWeight: 700,
            fontFamily: "var(--font-mono, monospace)",
            whiteSpace: "nowrap",
          }}
        >
          {health.current}/{health.max}
        </span>
        {inCombat && (
          <span
            className="combat-pulse"
            style={{
              fontSize: "9px",
              color: theme.colors.state.danger,
              fontWeight: 600,
            }}
          >
            ⚔
          </span>
        )}
        <span
          style={{
            borderLeft: `1px solid ${theme.colors.border.default}25`,
            paddingLeft: "6px",
            fontSize: "10px",
            color: theme.colors.text.muted,
            whiteSpace: "nowrap",
          }}
        >
          Lvl{" "}
          <span
            style={{
              color: "#f59e0b",
              fontWeight: 700,
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "12px",
            }}
          >
            {combatLevel}
          </span>
        </span>
      </div>

      {/* Target health — only when in combat */}
      {targetName && targetHealth && !ultraCompactPanel && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: `${p.inner - 1}px ${p.inner}px`,
            background: `${theme.colors.state.danger}08`,
            border: `1px solid ${theme.colors.state.danger}30`,
            borderRadius: theme.borderRadius.sm,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: "10px",
              color: theme.colors.state.danger,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "80px",
            }}
          >
            🎯 {targetName}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                width: "100%",
                height: "4px",
                background: theme.colors.background.panelPrimary,
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${targetHealthPercent}%`,
                  borderRadius: 2,
                  background: "linear-gradient(180deg, #f87171, #dc2626)",
                }}
              />
            </div>
          </div>
          <span
            style={{
              fontSize: "10px",
              color: theme.colors.state.danger,
              fontWeight: 700,
              fontFamily: "var(--font-mono, monospace)",
              whiteSpace: "nowrap",
            }}
          >
            {targetHealth.current}/{targetHealth.max}
          </span>
        </div>
      )}

      {/* Stats Row */}
      <CombatStatsRow
        attackLevel={attackLevel}
        strengthLevel={strengthLevel}
        defenseLevel={defenseLevel}
        isMobile={shouldUseMobileUI}
      />

      {/* Attack Styles */}
      <div
        style={{
          ...getPanelInsetStyle(theme, {
            emphasis: "strong",
            radius: theme.borderRadius.md,
            padding: `${p.inner}px`,
          }),
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 2,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: "9px",
              lineHeight: 1,
              color: theme.colors.text.muted,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 700,
            }}
          >
            Combat Styles
          </span>
          {style === "autocast" && (
            <span
              style={{
                padding: "2px 5px",
                borderRadius: theme.borderRadius.sm,
                background: "#8b5cf618",
                border: "1px solid #8b5cf633",
                fontSize: "8px",
                fontWeight: 700,
                color: "#c4b5fd",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Autocast
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            width: "100%",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
          }}
        >
          {styles.map((s) => (
            <DraggableCombatStyleButton
              key={s.id}
              style={s}
              isActive={style === s.id}
              disabled={cooldown > 0}
              isMobile={shouldUseMobileUI}
              onClick={() => changeStyle(s.id)}
              theme={theme}
            />
          ))}
        </div>
      </div>

      {cooldown > 0 && (
        <div
          style={{
            textAlign: "center",
            fontSize: "9px",
            color: theme.colors.state.warning,
            background: `${theme.colors.state.warning}10`,
            padding: "2px 5px",
            borderRadius: theme.borderRadius.sm,
            border: `1px solid ${theme.colors.state.warning}25`,
            flexShrink: 0,
          }}
        >
          Style change in {Math.ceil(cooldown / 1000)}s
        </div>
      )}

      {/* Auto Retaliate — compact single row */}
      <button
        onClick={toggleAutoRetaliate}
        aria-pressed={autoRetaliate}
        className="focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/50"
        style={{
          padding: "4px 6px",
          cursor: "pointer",
          transition: "all 0.1s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          touchAction: "manipulation",
          borderRadius: theme.borderRadius.sm,
          ...getInteractiveTileStyle(theme, {
            active: autoRetaliate,
            radius: theme.borderRadius.sm,
            accentColor: autoRetaliate
              ? theme.colors.state.success
              : theme.colors.accent.secondary,
          }),
          color: autoRetaliate
            ? theme.colors.state.success
            : theme.colors.text.muted,
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-2">
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke={autoRetaliate ? "#22c55e" : theme.colors.text.muted}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {autoRetaliate ? (
              <>
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </>
            )}
          </svg>
          <span
            style={{
              fontWeight: 600,
              color: theme.colors.text.primary,
              fontSize: "10px",
              lineHeight: 1,
            }}
          >
            Auto-retaliate
          </span>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "1px",
            padding: "1px",
            borderRadius: "4px",
            fontSize: "9px",
            fontWeight: 700,
            background: "rgba(0,0,0,0.18)",
            border: `1px solid ${theme.colors.border.default}30`,
          }}
        >
          <span
            style={{
              padding: "2px 6px",
              borderRadius: "3px",
              background: autoRetaliate
                ? "rgba(34, 197, 94, 0.18)"
                : "transparent",
              color: autoRetaliate ? "#22c55e" : theme.colors.text.muted,
            }}
          >
            On
          </span>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: "3px",
              background: !autoRetaliate
                ? "rgba(239, 68, 68, 0.12)"
                : "transparent",
              color: !autoRetaliate ? "#ef4444" : theme.colors.text.muted,
            }}
          >
            Off
          </span>
        </span>
      </button>
    </div>
  );
}
