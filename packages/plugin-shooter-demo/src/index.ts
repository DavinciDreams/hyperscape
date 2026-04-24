/**
 * @hyperforge/plugin-shooter-demo
 *
 * Minimal NON-Hyperscape game plugin. Shipped 2026-04-24 as the
 * "second game proof" — demonstrates that the engine-layer
 * infrastructure built this session (gameplay-framework + combat
 * plugin + server/client plugin boot) can compose a different game
 * than Hyperscape without modifying `@hyperforge/shared`.
 *
 * What this plugin is NOT:
 *   - A real game. No content, no art, no widgets, no manifests.
 *   - A replacement for `@hyperforge/hyperscape`. It's a separate
 *     plugin with a different identity and a different dependency
 *     graph (depends on `combat` but NOT on `skills`).
 *
 * What this plugin IS:
 *   - Acceptance evidence for master-plan criterion #4 ("a new game
 *     can be built in World Studio by loading plugins").
 *   - A template for authoring future game plugins — anyone building
 *     a new game today follows this exact file shape: plugin.json
 *     declares dependencies + contributions, `manifest.ts` validates
 *     at module load, `index.ts` exports a `PluginFactory` that
 *     contributes abilities/widgets/systems on `onEnable`.
 *
 * Contribution surface (v1):
 *   - One `CombatAbility`: "shoot" (ranged, Space key).
 *   - That's it. Every future expansion (crosshair widget,
 *     projectile SFX, score HUD) adds to this list. Each addition
 *     is ~10 lines of diff.
 *
 * Lifecycle:
 *   - `onEnable(ctx)` registers the shoot ability via
 *     `ctx.registerAbility` (same API @hyperforge/combat already
 *     exposes — no new contract).
 *   - `ctx.scope` disposer unregisters it on plugin stop — host
 *     tooling calls this during `session.stop()`.
 */

import type {
  HyperforgePlugin,
  PluginFactory,
} from "@hyperforge/gameplay-framework";
import { type CombatAbility, type CombatContext } from "@hyperforge/combat";

/**
 * The minimal ability this demo plugin contributes. Chosen
 * specifically to have NO overlap with the Hyperscape starter pack
 * so the acceptance test can prove both plugins' abilities coexist
 * in separate `CombatAbilityService` instances — not just "same
 * abilities registered twice."
 */
export const SHOOT_ABILITY: CombatAbility = Object.freeze({
  id: "demo-shoot",
  displayName: "Shoot",
  kind: "ranged",
  baseDamage: 5,
  accuracy: 0.75,
});

/**
 * Factory — mirrors `combatPluginFactory` / `skillsPluginFactory`
 * shape for consistency. Parameterized so tests can ship a different
 * ability set without rebuilding the package.
 */
export function shooterDemoPluginFactory(
  abilities: readonly CombatAbility[] = [SHOOT_ABILITY],
): PluginFactory<CombatContext> {
  return () => {
    const plugin: HyperforgePlugin<CombatContext> = {
      onLoad(_ctx) {
        const seen = new Set<string>();
        for (const ability of abilities) {
          if (seen.has(ability.id)) {
            throw new Error(
              `shooter-demo plugin load failed: duplicate ability id "${ability.id}"`,
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
        // Scope disposers fire after onDisable — they unregister
        // everything registerAbility added. Nothing to do here.
      },
    };
    return plugin;
  };
}

export { manifest } from "./manifest.js";

/**
 * Default factory — the shape a host loader expects when it calls
 * `import(manifest.entry)`. Bakes in the demo ability pack.
 */
const defaultFactory: PluginFactory<CombatContext> = shooterDemoPluginFactory();
export default defaultFactory;
