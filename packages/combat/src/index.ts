/**
 * @hyperforge/combat
 *
 * Reference combat plugin. Proves the
 * `@hyperforge/gameplay-framework` author surface works end-to-end
 * across all three lifecycle hooks (`onLoad`, `onEnable`, `onDisable`),
 * not just the `onEnable`-only data shape covered by
 * `@hyperforge/plugin-hello-reference`.
 *
 * Shape:
 *   - `CombatAbility` — pure data record describing an attack ability
 *     (id, displayName, kind, baseDamage, accuracy).
 *   - `CombatAbilityService` — caller-supplied registry the plugin
 *     writes into. Mirrors the hello plugin's `HelloService` shape.
 *   - `combatPluginFactory(abilities)` — produces a `PluginFactory<CombatContext>`
 *     parameterized by the ability list, so tests / downstream
 *     integrations can ship different starter packs without
 *     rebuilding the package.
 *   - `default` export — bakes in a 3-ability starter pack
 *     (slash, stab, fire bolt) so the plugin loads end-to-end
 *     without caller configuration.
 *
 * Lifecycle (all three hooks exercised):
 *   - `onLoad(ctx)`  — duplicate-id pre-check across the configured
 *     ability list. Throws synchronously before any registration if
 *     the configuration is malformed. No side effects on success.
 *   - `onEnable(ctx)` — registers each ability via
 *     `ctx.registerAbility(ability)`, which both mutates the service
 *     and attaches the inverse `unregisterAbility` to `ctx.scope`.
 *     Scope drain on disable handles teardown automatically.
 *   - `onDisable(ctx)` — explicit no-op. Present to demonstrate
 *     the contract: scope drains AFTER `onDisable`, so anything
 *     registered via `ctx.scope.register` runs automatically.
 */

import type {
  HyperforgePlugin,
  PluginContextBase,
  PluginFactory,
} from "@hyperforge/gameplay-framework";

/** Attack-ability classification. Extend as the combat domain grows. */
export type CombatAbilityKind = "melee" | "ranged" | "magic";

/**
 * Pure data record for a single attack ability. No behavior — handlers
 * (damage formula, target resolution, animation hooks) live on
 * downstream systems that consume the registry.
 */
export interface CombatAbility {
  readonly id: string;
  readonly displayName: string;
  readonly kind: CombatAbilityKind;
  /** Base damage before stat / equipment modifiers. Must be ≥ 0. */
  readonly baseDamage: number;
  /** Hit chance as a 0–1 fraction. */
  readonly accuracy: number;
}

/** Registry the plugin writes into. Callers supply an implementation. */
export interface CombatAbilityService {
  registerAbility(ability: CombatAbility): void;
  unregisterAbility(id: string): void;
  getAbility(id: string): CombatAbility | undefined;
  list(): ReadonlyMap<string, CombatAbility>;
}

export function createCombatAbilityService(): CombatAbilityService {
  const entries = new Map<string, CombatAbility>();
  return {
    registerAbility(ability) {
      if (entries.has(ability.id)) {
        throw new Error(`combat ability "${ability.id}" already registered`);
      }
      entries.set(ability.id, ability);
    },
    unregisterAbility(id) {
      entries.delete(id);
    },
    getAbility(id) {
      return entries.get(id);
    },
    list() {
      return entries;
    },
  };
}

/** Per-plugin context handed to the combat reference plugin's hooks. */
export interface CombatContext extends PluginContextBase {
  /** Register an ability and track cleanup on the scope. */
  registerAbility(ability: CombatAbility): void;
}

/**
 * Default starter pack — three abilities covering each `CombatAbilityKind`.
 * Exported so callers can extend or replace it without rebuilding.
 */
export const DEFAULT_COMBAT_ABILITIES: readonly CombatAbility[] = Object.freeze(
  [
    {
      id: "com.hyperforge.combat.slash",
      displayName: "Slash",
      kind: "melee",
      baseDamage: 6,
      accuracy: 0.85,
    },
    {
      id: "com.hyperforge.combat.stab",
      displayName: "Stab",
      kind: "melee",
      baseDamage: 5,
      accuracy: 0.9,
    },
    {
      id: "com.hyperforge.combat.fire_bolt",
      displayName: "Fire Bolt",
      kind: "magic",
      baseDamage: 8,
      accuracy: 0.75,
    },
  ],
);

/**
 * Factory that creates a combat-plugin instance bound to a specific
 * ability list. Parameterized so tests / downstream integrations can
 * ship different starter packs without rebuilding the package.
 */
export function combatPluginFactory(
  abilities: readonly CombatAbility[],
): PluginFactory<CombatContext> {
  return () => {
    const plugin: HyperforgePlugin<CombatContext> = {
      onLoad(_ctx) {
        // Duplicate-id pre-check — fail loud BEFORE any registration
        // so a malformed configuration never half-registers and leaks
        // into the service.
        const seen = new Set<string>();
        for (const ability of abilities) {
          if (seen.has(ability.id)) {
            throw new Error(
              `combat plugin load failed: duplicate ability id "${ability.id}"`,
            );
          }
          seen.add(ability.id);
        }
      },

      onEnable(ctx) {
        for (const ability of abilities) {
          ctx.registerAbility(ability);
        }
      },

      onDisable(_ctx) {
        // Explicit no-op. Scope drain runs AFTER this hook, so the
        // unregister disposers attached during onEnable fire then.
        // Present to document the contract for plugin authors.
      },
    };
    return plugin;
  };
}

export { manifest } from "./manifest.js";

/**
 * Default plugin factory — the shape a host loader expects when it
 * calls `import(manifest.entry)`. Bakes in the default starter pack
 * so the plugin is usable end-to-end without caller configuration.
 *
 * Downstream code that wants a different ability list can still
 * import the named `combatPluginFactory` directly.
 */
const defaultFactory: PluginFactory<CombatContext> = combatPluginFactory(
  DEFAULT_COMBAT_ABILITIES,
);

export default defaultFactory;
