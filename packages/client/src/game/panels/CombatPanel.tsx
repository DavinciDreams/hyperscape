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
  bgColor: string;
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
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) {
          onClick();
        }
      }}
      disabled={disabled}
      aria-pressed={isActive}
      className="style-btn focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/50"
      style={{
        minWidth: 0,
        minHeight: isMobile ? 64 : 58,
        padding: isMobile ? "8px 7px" : "7px 6px",
        cursor: disabled ? "not-allowed" : isDragging ? "grabbing" : "pointer",
        transition: "all 0.15s ease",
        fontSize: isMobile ? "10px" : "10px",
        fontWeight: isActive ? 600 : 500,
        ...getInteractiveTileStyle(theme, {
          active: isActive,
          disabled,
          dragging: isDragging,
          radius: 6,
          accentColor: styleInfo.color,
        }),
        borderRadius: "5px",
        color: isActive ? styleInfo.color : theme.colors.text.secondary,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "7px",
        touchAction: "manipulation",
        opacity: disabled ? 0.5 : isDragging ? 0.7 : 1,
        transform: isDragging ? "scale(1.01)" : "scale(1)",
        boxShadow: isActive
          ? `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px ${styleInfo.color}33`
          : "inset 0 1px 0 rgba(255,255,255,0.03)",
        textAlign: "left",
      }}
    >
      <StyleIcon
        style={styleInfo.id}
        size={isMobile ? 16 : 15}
        color={isActive ? styleInfo.color : theme.colors.text.muted}
      />
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          gap: "2px",
          flex: 1,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            lineHeight: 1.1,
            color: isActive
              ? theme.colors.text.primary
              : theme.colors.text.secondary,
          }}
        >
          {styleInfo.label}
        </span>
        <span
          style={{
            fontSize: isMobile ? "8px" : "7px",
            opacity: 0.78,
            color: theme.colors.text.muted,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            lineHeight: 1,
          }}
        >
          {styleInfo.xp}
        </span>
      </span>
    </button>
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
      className="flex items-center justify-center gap-2"
      style={{
        padding: isMobile ? "4px 6px" : "4px 6px",
        background:
          theme.name === "hyperscape"
            ? "linear-gradient(180deg, rgba(255, 255, 255, 0.045) 0%, rgba(0, 0, 0, 0.14) 100%)"
            : theme.colors.slot.filled,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.default}40`,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
      }}
    >
      {stats.map((stat, index) => (
        <React.Fragment key={stat.key}>
          <div className="flex items-center gap-1">
            <StatIcon
              stat={stat.key}
              size={isMobile ? 12 : 10}
              color={stat.color}
            />
            <span
              style={{
                fontSize: isMobile ? "12px" : "11px",
                color: stat.color,
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {stat.value}
            </span>
          </div>
          {index < stats.length - 1 && (
            <div
              style={{
                width: "1px",
                height: "12px",
                background: `${theme.colors.border.default}30`,
              }}
            />
          )}
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

export function CombatPanel({ world, stats, equipment }: CombatPanelProps) {
  const theme = useThemeStore((s) => s.theme);
  const { shouldUseMobileUI } = useMobileLayout();
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
    const playerId = world.entities?.player?.id;
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
  }, [world, targetName]);

  const changeStyle = (next: string) => {
    const playerId = world.entities?.player?.id;
    if (!playerId) return;

    const actions = world.getSystem("actions") as {
      actionMethods?: {
        changeAttackStyle?: (id: string, style: string) => void;
      };
    } | null;

    if (!actions?.actionMethods?.changeAttackStyle) return;

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

    actions.actionMethods.setAutoRetaliate(playerId, !autoRetaliate);
  };

  // All possible combat styles with their XP training info and colors
  // Includes melee, ranged, and magic styles (OSRS-accurate)
  const allStyles: Array<{
    id: string;
    label: string;
    xp: string;
    color: string;
    bgColor: string;
  }> = [
    // Melee styles
    {
      id: "accurate",
      label: "Accurate",
      xp: "Attack",
      color: "#ef4444",
      bgColor: "rgba(239, 68, 68, 0.12)",
    },
    {
      id: "aggressive",
      label: "Aggressive",
      xp: "Strength",
      color: "#22c55e",
      bgColor: "rgba(34, 197, 94, 0.12)",
    },
    {
      id: "defensive",
      label: "Defensive",
      xp: "Defense",
      color: "#3b82f6",
      bgColor: "rgba(59, 130, 246, 0.12)",
    },
    {
      id: "controlled",
      label: "Controlled",
      xp: "All",
      color: "#a855f7",
      bgColor: "rgba(168, 85, 247, 0.12)",
    },
    // Ranged styles
    {
      id: "rapid",
      label: "Rapid",
      xp: "Ranged",
      color: "#f59e0b",
      bgColor: "rgba(245, 158, 11, 0.12)",
    },
    {
      id: "longrange",
      label: "Longrange",
      xp: "Rng+Def",
      color: "#06b6d4",
      bgColor: "rgba(6, 182, 212, 0.12)",
    },
    // Magic styles
    {
      id: "autocast",
      label: "Autocast",
      xp: "Magic",
      color: "#8b5cf6",
      bgColor: "rgba(139, 92, 246, 0.12)",
    },
  ];

  // Filter styles based on equipped weapon (OSRS-accurate restrictions)
  const styles = useMemo(() => {
    const weaponType = equipment?.weapon?.weaponType
      ? (equipment.weapon.weaponType.toLowerCase() as WeaponType)
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

  // Responsive padding/sizing - compact for both mobile and desktop
  const p = shouldUseMobileUI
    ? { outer: 4, inner: 5, gap: 4 }
    : { outer: 4, inner: 6, gap: 4 };
  const styleColumns =
    styles.length >= 4
      ? 2
      : styles.length === 3
        ? 3
        : Math.min(2, styles.length || 1);

  return (
    <div
      className="flex flex-col h-full overflow-auto"
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

      {/* HP + Combat Level Row */}
      <div
        style={{
          background:
            theme.name === "hyperscape"
              ? "linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(0, 0, 0, 0.16) 100%)"
              : theme.colors.slot.filled,
          border: inCombat
            ? `1px solid ${theme.colors.state.danger}55`
            : `1px solid ${theme.colors.border.default}40`,
          borderRadius: theme.borderRadius.md,
          padding: `${p.inner}px`,
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
        }}
      >
        {/* HP Header Row */}
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: "4px" }}
        >
          <div className="flex items-center gap-1.5">
            <svg
              width={shouldUseMobileUI ? 14 : 12}
              height={shouldUseMobileUI ? 14 : 12}
              viewBox="0 0 24 24"
              fill="#ef4444"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span
              style={{
                fontSize: shouldUseMobileUI ? "11px" : "10px",
                color: theme.colors.text.secondary,
                fontWeight: 600,
              }}
            >
              HP
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
          </div>
          <span
            style={{
              fontSize: shouldUseMobileUI ? "12px" : "11px",
              color: theme.colors.text.primary,
              fontWeight: 700,
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {health.current}/{health.max}
          </span>
        </div>

        {/* HP Bar - Always red like OSRS */}
        <div
          style={{
            width: "100%",
            height: shouldUseMobileUI ? "6px" : "6px",
            background: theme.colors.background.panelPrimary,
            borderRadius: theme.borderRadius.sm,
            overflow: "hidden",
            border: `1px solid ${theme.colors.border.default}35`,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${healthPercent}%`,
              borderRadius: theme.borderRadius.sm,
              transition: "width 0.2s ease",
              background: "linear-gradient(180deg, #f87171, #dc2626)",
            }}
          />
        </div>

        {/* Combat Level - inline below HP */}
        <div
          className="flex items-center justify-between"
          style={{
            marginTop: "6px",
            paddingTop: "6px",
            borderTop: `1px solid ${theme.colors.border.default}20`,
          }}
        >
          <span
            style={{
              fontSize: shouldUseMobileUI ? "10px" : "9px",
              color: theme.colors.text.muted,
            }}
          >
            Combat Lvl
          </span>
          <span
            style={{
              fontSize: shouldUseMobileUI ? "13px" : "12px",
              color: "#f59e0b",
              fontWeight: 700,
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {combatLevel}
          </span>
        </div>
      </div>

      {/* Target (only when in combat) */}
      {targetName && targetHealth && (
        <div
          style={{
            background:
              theme.name === "hyperscape"
                ? "linear-gradient(180deg, rgba(127, 29, 29, 0.24) 0%, rgba(32, 12, 12, 0.32) 100%)"
                : `${theme.colors.state.danger}08`,
            border: `1px solid ${theme.colors.state.danger}35`,
            borderRadius: theme.borderRadius.lg,
            padding: `${p.inner}px`,
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: "4px" }}
          >
            <span
              style={{
                fontSize: shouldUseMobileUI ? "12px" : "11px",
                color: theme.colors.state.danger,
                fontWeight: 600,
              }}
            >
              🎯 {targetName}
            </span>
            <span
              style={{
                fontSize: shouldUseMobileUI ? "12px" : "11px",
                color: theme.colors.state.danger,
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {targetHealth.current}/{targetHealth.max}
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: shouldUseMobileUI ? "6px" : "6px",
              background: theme.colors.background.panelPrimary,
              borderRadius: theme.borderRadius.sm,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${targetHealthPercent}%`,
                borderRadius: theme.borderRadius.sm,
                background: "linear-gradient(180deg, #f87171, #dc2626)",
              }}
            />
          </div>
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
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <div>
            <div
              style={{
                fontSize: "9px",
                color: theme.colors.text.muted,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}
            >
              Stance
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {style === "autocast" && (
              <div
                style={{
                  ...getInteractiveTileStyle(theme, {
                    active: true,
                    radius: theme.borderRadius.sm,
                    accentColor: "#8b5cf6",
                  }),
                  padding: "2px 6px",
                  fontSize: "8px",
                  fontWeight: 700,
                  color: "#c4b5fd",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Autocast
              </div>
            )}
            <div
              style={{
                padding: "2px 7px",
                borderRadius: theme.borderRadius.sm,
                border: `1px solid ${theme.colors.border.default}45`,
                background: "rgba(255,255,255,0.03)",
                fontSize: shouldUseMobileUI ? "10px" : "9px",
                color: theme.colors.text.primary,
                fontWeight: 700,
              }}
            >
              {styles.find((entry) => entry.id === style)?.label ?? "Select"}
            </div>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${styleColumns}, minmax(0, 1fr))`,
            gap: shouldUseMobileUI ? "5px" : "4px",
            width: "100%",
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
            background:
              theme.name === "hyperscape"
                ? "linear-gradient(180deg, rgba(245, 158, 11, 0.16) 0%, rgba(51, 24, 8, 0.22) 100%)"
                : `${theme.colors.state.warning}10`,
            padding: "3px 6px",
            borderRadius: theme.borderRadius.sm,
            border: `1px solid ${theme.colors.state.warning}30`,
          }}
        >
          ⏱️ {Math.ceil(cooldown / 1000)}s
        </div>
      )}

      {/* Auto Retaliate */}
      <button
        onClick={toggleAutoRetaliate}
        aria-pressed={autoRetaliate}
        className="focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/50"
        style={{
          padding: shouldUseMobileUI ? "7px 9px" : "7px 9px",
          cursor: "pointer",
          transition: "all 0.1s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: shouldUseMobileUI ? "10px" : "9px",
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
        }}
      >
        <div className="flex items-center gap-2">
          <svg
            width={shouldUseMobileUI ? 12 : 10}
            height={shouldUseMobileUI ? 12 : 10}
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
          <div style={{ textAlign: "left" }}>
            <div
              style={{
                fontWeight: 700,
                color: theme.colors.text.primary,
              }}
            >
              Auto-retaliate
            </div>
            <div
              style={{
                fontSize: "8px",
                color: theme.colors.text.muted,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Counterattack
            </div>
          </div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            padding: shouldUseMobileUI ? "2px" : "2px",
            borderRadius: theme.borderRadius.sm,
            fontSize: shouldUseMobileUI ? "8px" : "8px",
            fontWeight: 700,
            background: "rgba(0,0,0,0.18)",
            border: `1px solid ${theme.colors.border.default}35`,
          }}
        >
          <span
            style={{
              padding: "1px 5px",
              borderRadius: "4px",
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
              padding: "1px 5px",
              borderRadius: "4px",
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
