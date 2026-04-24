/**
 * defaultLayout.ts — the manifest used by the client when no
 * user-authored layout has been loaded yet.
 *
 * Placements here mirror the current hand-coded HUD so Phase D6
 * migration can be flipped on piecewise: once an existing component
 * has an adapter bound in `bindings.tsx`, remove it from the
 * hand-coded tree and rely on this layout instead.
 *
 * Coordinate system mirrors the editor preview (VIEWPORT_W = 1280,
 * VIEWPORT_H = 720). Real runtime rendering scales the same
 * anchored/offset tuple to whatever viewport the client is on.
 */

import type { UILayoutManifest } from "@hyperforge/ui-framework";
import { UILayoutManifestSchema } from "@hyperforge/ui-framework";

export const DEFAULT_UI_LAYOUT_ID = "hyperscape.default";

/**
 * The default layout. Parsed through `UILayoutManifestSchema` at
 * module load so any schema drift surfaces immediately.
 */
export const DEFAULT_UI_LAYOUT: UILayoutManifest = UILayoutManifestSchema.parse(
  {
    id: DEFAULT_UI_LAYOUT_ID,
    name: "Hyperscape Default UI",
    description:
      "Out-of-the-box HUD mirroring the hand-authored game client. Replaced per-widget as D6 adapters land.",
    instances: [
      {
        instanceId: "hp-bar-main",
        widgetId: "hyperforge.hud.hp-bar",
        customization: { movable: true },
        // Mirrors the hand-coded `StatusBars` top-left anchor inside
        // `HUD_FRAME`: safe-area inset + 16px HUD margin + a small
        // nudge so the bar sits just right of the (eventual) HP orb.
        position: {
          kind: "anchored",
          anchor: "top-left",
          offset: { x: 60, y: 20 },
        },
        props: {
          orientation: "horizontal",
          showNumeric: true,
          // Static fallbacks used when the player-data namespace is
          // not yet populated (pre-spawn / pre-first-stats event).
          current: 10,
          max: 10,
        },
        bindings: {
          current: "$player.hp",
          max: "$player.maxHp",
        },
        label: "HP",
      },
      {
        instanceId: "action-bar-main",
        widgetId: "hyperforge.hud.action-bar",
        customization: { movable: true },
        // Hand-coded `ActionBarPanel` defaults to 7 slots @ 36px
        // anchored to the bottom-center of the HUD safe area.
        position: {
          kind: "anchored",
          anchor: "bottom-center",
          offset: { x: 0, y: -24 },
        },
        props: {
          slotCount: 7,
          slotSize: 36,
          showKeybindings: true,
          showGcd: true,
        },
        label: "Action Bar",
      },
      {
        instanceId: "tooltip-hover",
        widgetId: "hyperforge.overlay.tooltip",
        position: {
          kind: "anchored",
          anchor: "top-left",
          offset: { x: 12, y: 12 },
        },
        props: {
          anchor: "cursor",
          delayMs: 300,
          maxWidth: 320,
        },
        label: "Tooltip",
        visible: false,
      },
      {
        instanceId: "minimap-main",
        widgetId: "hyperforge.hud.minimap",
        customization: { movable: true },
        position: {
          kind: "anchored",
          anchor: "top-right",
          offset: { x: -24, y: 24 },
        },
        props: {
          size: 220,
          baseRadius: 48,
          showCompass: true,
          showPlayerPips: true,
          showEntityPips: true,
        },
        label: "Minimap",
      },
      {
        instanceId: "chat-main",
        widgetId: "hyperforge.panel.chat",
        position: {
          kind: "anchored",
          anchor: "bottom-left",
          offset: { x: 24, y: -120 },
        },
        props: {
          bufferSize: 200,
          showChannels: true,
          autoHide: false,
          autoHideDelaySeconds: 10,
        },
        label: "Chat",
      },
      {
        instanceId: "inventory-main",
        widgetId: "hyperforge.panel.inventory",
        position: {
          kind: "anchored",
          anchor: "bottom-right",
          offset: { x: -24, y: -24 },
        },
        props: {
          columns: 4,
          rows: 7,
          showQuantities: true,
          allowDragToActionBar: true,
        },
        bindings: {
          items: "$inventory.items",
        },
        label: "Inventory",
        visible: false,
      },
      {
        instanceId: "skills-main",
        widgetId: "hyperforge.panel.skills",
        // Stacks above the inventory on the right rail, leaving a
        // breathing gap for the future minimap-anchored stamina/orbs.
        position: {
          kind: "anchored",
          anchor: "bottom-right",
          offset: { x: -24, y: -320 },
        },
        props: {
          columns: 3,
          showHeader: true,
          total: 15,
          combatLevel: 3,
        },
        bindings: {
          items: "$skills.items",
          total: "$skills.total",
          combatLevel: "$skills.combatLevel",
        },
        label: "Skills",
        visible: false,
      },
      {
        instanceId: "equipment-main",
        widgetId: "hyperforge.panel.equipment",
        position: {
          kind: "anchored",
          anchor: "bottom-right",
          offset: { x: -270, y: -24 },
        },
        props: {
          showAvatar: true,
          showCombatSummary: true,
        },
        bindings: {
          items: "$equipment.items",
        },
        label: "Equipment",
        visible: false,
      },
      {
        instanceId: "stats-main",
        widgetId: "hyperforge.panel.stats",
        position: {
          kind: "anchored",
          anchor: "top-left",
          offset: { x: 20, y: 60 },
        },
        props: {
          playerName: "Player",
          combatLevel: 3,
          hp: 10,
          maxHp: 10,
          prayer: 1,
          maxPrayer: 1,
          totalLevel: 15,
        },
        bindings: {
          combatLevel: "$player.combatLevel",
          hp: "$player.hp",
          maxHp: "$player.maxHp",
          prayer: "$player.prayer",
          maxPrayer: "$player.maxPrayer",
          totalLevel: "$skills.total",
        },
        label: "Stats",
        visible: false,
      },
      {
        instanceId: "prayer-main",
        widgetId: "hyperforge.panel.prayer",
        position: {
          kind: "anchored",
          anchor: "bottom-right",
          offset: { x: -24, y: -600 },
        },
        props: {
          points: 1,
          maxPoints: 1,
          columns: 5,
        },
        bindings: {
          points: "$player.prayer",
          maxPoints: "$player.maxPrayer",
        },
        label: "Prayer",
        visible: false,
      },
      {
        instanceId: "spells-main",
        widgetId: "hyperforge.panel.spells",
        position: {
          kind: "anchored",
          anchor: "bottom-right",
          offset: { x: -24, y: -900 },
        },
        props: {
          magicLevel: 1,
          spellbook: "standard",
          columns: 5,
        },
        label: "Spells",
        visible: false,
      },
      {
        instanceId: "quests-main",
        widgetId: "hyperforge.panel.quests",
        position: {
          kind: "anchored",
          anchor: "center",
          offset: { x: -200, y: 0 },
        },
        props: {
          questPoints: 0,
          maxQuestPoints: 0,
        },
        label: "Quests",
        visible: false,
      },
      {
        instanceId: "bank-main",
        widgetId: "hyperforge.panel.bank",
        position: {
          kind: "anchored",
          anchor: "center",
          offset: { x: 0, y: 0 },
        },
        props: {
          columns: 8,
          showSearch: true,
          showCoins: true,
          coins: 0,
        },
        bindings: {
          coins: "$inventory.coins",
        },
        label: "Bank",
        visible: false,
      },
      {
        instanceId: "friends-main",
        widgetId: "hyperforge.panel.friends",
        position: {
          kind: "anchored",
          anchor: "top-right",
          offset: { x: -24, y: 260 },
        },
        props: {
          showAddInput: true,
        },
        label: "Friends",
        visible: false,
      },
      {
        instanceId: "settings-main",
        widgetId: "hyperforge.panel.settings",
        position: {
          kind: "anchored",
          anchor: "center",
          offset: { x: 200, y: 0 },
        },
        props: {
          showAudio: true,
          showGraphics: true,
          showKeybindings: true,
        },
        label: "Settings",
        visible: false,
      },
    ],
  },
);

/**
 * Shooter-demo's default HUD — deliberately minimal. Proves that
 * selecting a different game plugin set changes the USER-VISIBLE
 * layout, not just the in-memory ability service.
 *
 * Just a crosshair, centered. The widget itself is contributed by
 * `@hyperforge/plugin-shooter-demo` via `ctx.widgets.register(...)`
 * during the plugin's `onEnable`; this layout simply places an
 * instance of it.
 */
export const SHOOTER_DEMO_UI_LAYOUT_ID = "shooter-demo.default";
export const SHOOTER_DEMO_UI_LAYOUT: UILayoutManifest =
  UILayoutManifestSchema.parse({
    id: SHOOTER_DEMO_UI_LAYOUT_ID,
    name: "Shooter Demo HUD",
    description:
      "Minimal shooter HUD. Crosshair centered on screen. Plugin-contributed widget from @hyperforge/plugin-shooter-demo.",
    instances: [
      {
        instanceId: "crosshair-center",
        widgetId: "com.hyperforge.shooter-demo.crosshair",
        position: {
          kind: "anchored",
          anchor: "center",
          offset: { x: 0, y: 0 },
        },
        props: {
          size: 32,
          color: "#7ef7b3",
          thickness: 2,
        },
        label: "Crosshair",
      },
    ],
  });

/**
 * Pick the default UI layout for a given game plugin set id.
 * Consumers (useActiveUILayout's fallback path, PIE session, tests)
 * call this instead of importing `DEFAULT_UI_LAYOUT` directly so
 * the choice flows through the plugin game id.
 */
export function getDefaultUILayoutForGame(gameId: string): UILayoutManifest {
  switch (gameId) {
    case "shooter-demo":
      return SHOOTER_DEMO_UI_LAYOUT;
    default:
      return DEFAULT_UI_LAYOUT;
  }
}
