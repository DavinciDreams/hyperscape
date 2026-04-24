/**
 * Plugin boot — runs the @hyperforge/gameplay-framework plugin
 * pipeline against the in-binary plugin set at client startup.
 *
 * Mirrors `packages/server/src/startup/plugins.ts`. Same plugin
 * set (combat + skills + hyperscape meta-plugin), same per-plugin
 * context dispatch, same scope-disposer semantics. The difference
 * is the host: this version runs inside the browser ClientWorld
 * and `world.isServer === false`, so `HealthRegenSystem` (server-
 * gated in the meta-plugin's onEnable) is not registered here.
 *
 * The bilateral systems (mob-death, gravestone-loot, all six OSRS
 * skill processing systems) DO register on the client world. They
 * self-gate their `init()` on `world.isServer` so the no-op happens
 * at init-time rather than register-time.
 *
 * Why this matters now: client-only systems
 * (EquipmentVisualSystem, ZoneVisualsSystem, WaterfallVisualsSystem)
 * still live in `packages/shared/src/systems/client/` and are
 * registered by `createClientWorld.ts`. Once we have plugin boot on
 * the client side, those visual systems can migrate too — the
 * plugin's onEnable can register them when `world.isServer === false`.
 */

import {
  type LoadedPluginModule,
  type PluginContextBase,
  type PluginSession,
  startPluginSessionFromModules,
} from "@hyperforge/gameplay-framework";
import type { World } from "@hyperforge/shared";

import {
  combatPluginFactory,
  createCombatAbilityService,
  DEFAULT_COMBAT_ABILITIES,
  manifest as combatManifest,
  type CombatAbilityService,
  type CombatContext,
} from "@hyperforge/combat";
import {
  createSkillsService,
  DEFAULT_SKILLS,
  skillsPluginFactory,
  manifest as skillsManifest,
  type SkillsContext,
  type SkillsService,
} from "@hyperforge/skills";
import hyperscapeFactory, {
  type HyperscapeContext,
} from "@hyperforge/hyperscape";
import { manifest as hyperscapeManifest } from "@hyperforge/hyperscape";

let _combatService: CombatAbilityService | null = null;
let _skillsService: SkillsService | null = null;

function getCombatService(): CombatAbilityService {
  if (!_combatService) _combatService = createCombatAbilityService();
  return _combatService;
}

function getSkillsService(): SkillsService {
  if (!_skillsService) _skillsService = createSkillsService();
  return _skillsService;
}

function getServerPluginModules(): ReadonlyArray<
  LoadedPluginModule<PluginContextBase>
> {
  return [
    {
      manifest: combatManifest,
      factory: combatPluginFactory(DEFAULT_COMBAT_ABILITIES),
    },
    {
      manifest: skillsManifest,
      factory: skillsPluginFactory(DEFAULT_SKILLS),
    },
    {
      manifest: hyperscapeManifest,
      factory: hyperscapeFactory,
    },
  ];
}

/**
 * Boot the in-binary plugin set on the client. Called from the
 * `GameClient` mount path after `world.systemsLoadedPromise` and
 * before `world.init(config)` so the plugin's `world.register(...)`
 * calls land in the same window the rest of the systems do.
 *
 * Returns the session so callers can `session.stop()` on unmount
 * for clean disposer teardown.
 */
export async function bootClientPlugins(
  world: World,
): Promise<PluginSession<PluginContextBase>> {
  const modules = getServerPluginModules();
  const session = await startPluginSessionFromModules(modules, {
    contextFactory: ({ pluginId, scope }) => {
      switch (pluginId) {
        case combatManifest.id: {
          const service = getCombatService();
          const ctx: CombatContext = {
            pluginId,
            scope,
            registerAbility(ability) {
              service.registerAbility(ability);
              scope.register(() => service.unregisterAbility(ability.id));
            },
          };
          return ctx as PluginContextBase;
        }
        case skillsManifest.id: {
          const service = getSkillsService();
          const ctx: SkillsContext = {
            pluginId,
            scope,
            registerSkill(skill) {
              service.registerSkill(skill);
              scope.register(() => service.unregisterSkill(skill.id));
            },
          };
          return ctx as PluginContextBase;
        }
        case hyperscapeManifest.id: {
          const ctx: HyperscapeContext = {
            pluginId,
            scope,
            world,
          };
          return ctx as PluginContextBase;
        }
        default:
          return { pluginId, scope };
      }
    },
  });

  if (session.unresolvable.length > 0) {
    for (const entry of session.unresolvable) {
      console.warn(
        `[client-plugin-boot] unresolvable: "${entry.module.manifest.id}" — ${entry.reason}`,
      );
    }
  }

  if (session.records.length > 0) {
    const ids = session.records.map((r) => r.manifest.id).join(", ");
    console.log(
      `[client-plugin-boot] started ${session.records.length} plugin(s): ${ids}`,
    );
  }

  return session;
}
