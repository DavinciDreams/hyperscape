/**
 * bindings.ts — binds concrete React widget implementations to their
 * `@hyperforge/ui-framework` widget IDs.
 *
 * Consumers (the game client, the UI Layout Editor preview) call
 * `bindAllWidgets(registry)` once during bootstrap. After that the
 * registry can resolve any builtin widget id to a renderable component.
 *
 * The registry type is parameterized on the component slot because
 * different consumers may declare different component-type contracts.
 * The canonical "render anything with a prop bag" slot is exported as
 * `UIWidgetComponent`.
 */

import type { ComponentType } from "react";
import { BUILTIN_WIDGETS, WidgetRegistry } from "@hyperforge/ui-framework";

import { ActionBarWidget } from "./widgets/ActionBarWidget";
import { BankWidget } from "./widgets/BankWidget";
import { ChatWidget } from "./widgets/ChatWidget";
import { EquipmentWidget } from "./widgets/EquipmentWidget";
import { FriendsWidget } from "./widgets/FriendsWidget";
import { HpBarWidget } from "./widgets/HpBarWidget";
import { InventoryWidget } from "./widgets/InventoryWidget";
import { MinimapWidget } from "./widgets/MinimapWidget";
import { PrayerWidget } from "./widgets/PrayerWidget";
import { QuestsWidget } from "./widgets/QuestsWidget";
import { SettingsWidget } from "./widgets/SettingsWidget";
import { SkillsWidget } from "./widgets/SkillsWidget";
import { SpellsWidget } from "./widgets/SpellsWidget";
import { StatsWidget } from "./widgets/StatsWidget";
import { TooltipWidget } from "./widgets/TooltipWidget";

/**
 * The widget component slot used by both the live client renderer and
 * the editor preview. Props vary per widget id — Zod validates the
 * concrete prop shape at render time — so we intentionally use `any`
 * here rather than inventing a lowest-common-denominator interface.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UIWidgetComponent = ComponentType<any>;

/**
 * Create a fresh registry preloaded with every builtin widget schema.
 * Components stay unbound until `bindAllWidgets` runs.
 */
export function createUIWidgetRegistry(): WidgetRegistry<UIWidgetComponent> {
  const registry = new WidgetRegistry<UIWidgetComponent>();
  registry.defineBuiltins(BUILTIN_WIDGETS);
  return registry;
}

/**
 * Bind every shipped widget component to its matching builtin id.
 * Idempotent per-registry: skips any id that already has a component.
 */
export function bindAllWidgets(
  registry: WidgetRegistry<UIWidgetComponent>,
): void {
  const bindings: Array<[string, UIWidgetComponent]> = [
    ["hyperforge.hud.hp-bar", HpBarWidget],
    ["hyperforge.hud.action-bar", ActionBarWidget],
    ["hyperforge.hud.minimap", MinimapWidget],
    ["hyperforge.overlay.tooltip", TooltipWidget],
    ["hyperforge.panel.inventory", InventoryWidget],
    ["hyperforge.panel.chat", ChatWidget],
    ["hyperforge.panel.skills", SkillsWidget],
    ["hyperforge.panel.equipment", EquipmentWidget],
    ["hyperforge.panel.stats", StatsWidget],
    ["hyperforge.panel.prayer", PrayerWidget],
    ["hyperforge.panel.spells", SpellsWidget],
    ["hyperforge.panel.quests", QuestsWidget],
    ["hyperforge.panel.bank", BankWidget],
    ["hyperforge.panel.friends", FriendsWidget],
    ["hyperforge.panel.settings", SettingsWidget],
  ];
  for (const [id, component] of bindings) {
    if (!registry.hasComponent(id)) {
      registry.bindComponent(id, component);
    }
  }
}

/**
 * Return true when every builtin widget has a component bound on the
 * given registry. Useful for bootstrap/debug sanity checks.
 */
export function allBuiltinsBound(
  registry: WidgetRegistry<UIWidgetComponent>,
): boolean {
  for (const { manifest } of BUILTIN_WIDGETS) {
    if (!registry.hasComponent(manifest.id)) return false;
  }
  return true;
}
