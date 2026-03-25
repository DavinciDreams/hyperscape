/**
 * Panel Layout Constants
 *
 * Single source of truth for icon-grid panel dimensions used by:
 *   - InventoryPanel   (4px outer padding, 4px grid gap, 3px mobile)
 *   - EquipmentPanel   (4px outer padding, 6px grid gap, 3px mobile)
 *   - PrayerPanel
 *   - SpellsPanel
 *   - SkillsPanel
 *
 * Values are derived from what InventoryPanel and EquipmentPanel already use.
 * All other panels should defer to these.
 *
 * Desktop reference (EquipmentPanel renderEquipmentGrid):
 *   gap = 6, padding = 3 (inner), outer = 4
 * Desktop reference (InventoryPanel):
 *   outer padding = theme.spacing.xs = 4px
 *   inner grid gap = clamp(2px, 0.5cqw, 3px) ≈ 3px
 *   inner grid padding = clamp(2px, 0.5cqw, 3px) ≈ 3px
 *
 * We unify on:
 *   PANEL_PADDING = 4   (outer panel wrapper, matches theme.spacing.xs)
 *   PANEL_GRID_GAP = 4  (gap between icons — matches equipment desktop gap)
 *   PANEL_GRID_PADDING = 4  (inner grid inset)
 *   PANEL_ICON_SIZE = 36  (matches equipment slot height on desktop)
 */

// ─── Desktop ───────────────────────────────────────────────────────────────

/**
 * Outer padding for every panel container.
 * Matches InventoryPanel's `theme.spacing.xs` = 4px.
 */
export const PANEL_PADDING = 4;

/**
 * Gap between icons/slots in every grid panel.
 * EquipmentPanel uses 6px for its slot grid; InventoryPanel uses ~3px.
 * We align Prayer/Spells/Skills to 4px — a clean midpoint.
 */
export const PANEL_GRID_GAP = 4;

/**
 * Inner padding inside the scrollable grid inset area.
 * Matches InventoryPanel's inner grid padding (~3–4px).
 */
export const PANEL_GRID_PADDING = 4;

/**
 * Shared icon/slot size for icon-grid panels (Prayer, Spells).
 * Matches EquipmentPanel's desktop slot height (36px).
 */
export const PANEL_ICON_SIZE = 36;

// ─── Mobile ────────────────────────────────────────────────────────────────

/**
 * Mobile outer/grid padding.
 * InventoryPanel uses 3px mobile, EquipmentPanel uses 2–3px.
 */
export const PANEL_MOBILE_PADDING = 3;

/**
 * Mobile icon/slot size — matches MOBILE_TOUCH_TARGET (48px).
 */
export const PANEL_MOBILE_ICON_SIZE = 48;

/**
 * Mobile gap between icons — matches EquipmentPanel mobile gap.
 */
export const PANEL_MOBILE_GRID_GAP = 4;

// ─── Border radius ──────────────────────────────────────────────────────────

/** Square aesthetic radius for all panel slots/icons. */
export const PANEL_SLOT_RADIUS = 4;
