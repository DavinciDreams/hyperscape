/**
 * @hyperforge/ui-widgets — React implementations of the widget
 * schemas shipped by @hyperforge/ui-framework.
 *
 * Two consumers:
 *   - The game client's manifest-driven HUD pipeline
 *   - The World Studio UI Layout Editor preview
 *
 * Neither consumer needs to know which concrete components back each
 * widget — they just call `bindAllWidgets(registry)` and then use the
 * registry the same way.
 */

export {
  allBuiltinsBound,
  bindAllWidgets,
  createUIWidgetRegistry,
  type UIWidgetComponent,
} from "./bindings";

export {
  ItemIconProvider,
  useItemIcon,
  type ItemIconProviderProps,
  type ItemIconRenderProps,
  type ItemIconRenderer,
} from "./ItemIconContext";

export {
  ManifestRenderer,
  type ManifestRendererProps,
  type ManifestWidgetShell,
  type ManifestWidgetShellProps,
} from "./ManifestRenderer";

// Re-export individual widget components + their prop interfaces so
// test harnesses and Storybook-ish previews can mount them directly.
export { ActionBarWidget } from "./widgets/ActionBarWidget";
export { BankWidget } from "./widgets/BankWidget";
export { ChatWidget } from "./widgets/ChatWidget";
export { EquipmentWidget } from "./widgets/EquipmentWidget";
export { FriendsWidget } from "./widgets/FriendsWidget";
export { HpBarWidget } from "./widgets/HpBarWidget";
export { InventoryWidget } from "./widgets/InventoryWidget";
export { MinimapWidget } from "./widgets/MinimapWidget";
export { PrayerWidget } from "./widgets/PrayerWidget";
export { QuestsWidget } from "./widgets/QuestsWidget";
export { SettingsWidget } from "./widgets/SettingsWidget";
export { SkillsWidget } from "./widgets/SkillsWidget";
export { SpellsWidget } from "./widgets/SpellsWidget";
export { StatsWidget } from "./widgets/StatsWidget";
export { TooltipWidget } from "./widgets/TooltipWidget";
