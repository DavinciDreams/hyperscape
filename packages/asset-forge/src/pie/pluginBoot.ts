/**
 * PIE plugin-boot adapter.
 *
 * Asset-forge owns the game → plugin-module mapping for the editor's
 * PIE session. `PIEEditorSession` itself stays plugin-package-agnostic
 * (it just calls the `bootServerPlugins` / `bootClientPlugins` hooks on
 * start), so this module is where we reach into the concrete plugin
 * packages (combat, skills, hyperscape, plugin-shooter-demo) and build
 * contexts against the PIE worlds.
 *
 * Mirrors the patterns in `packages/server/src/startup/plugins.ts` and
 * `packages/client/src/startup/plugins.ts`. The three services
 * (combat, skills) are created ON-DEMAND per session — a fresh pair
 * per Play button press means ability/skill registrations from a
 * prior session don't leak into a new one.
 */

import {
  type LoadedPluginModule,
  type PluginContextBase,
  type PluginContextFactory,
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
import {
  manifest as shooterDemoManifest,
  shooterDemoPluginFactory,
} from "@hyperforge/plugin-shooter-demo";

import type { GamePluginSetId } from "../components/WorldStudio/toolbar/gamePluginResolver";

function getPluginModules(
  gameId: GamePluginSetId,
): ReadonlyArray<LoadedPluginModule<PluginContextBase>> {
  switch (gameId) {
    case "hyperscape":
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
    case "shooter-demo":
      return [
        {
          manifest: combatManifest,
          factory: combatPluginFactory([]),
        },
        {
          manifest: shooterDemoManifest,
          factory: shooterDemoPluginFactory(),
        },
      ];
  }
}

function buildContextFactory(
  world: World,
  combatService: CombatAbilityService,
  skillsService: SkillsService,
): PluginContextFactory<PluginContextBase> {
  return ({ pluginId, scope }) => {
    switch (pluginId) {
      case combatManifest.id:
      case shooterDemoManifest.id: {
        // Both share the combat-ability-service shape.
        const ctx: CombatContext = {
          pluginId,
          scope,
          registerAbility(ability) {
            combatService.registerAbility(ability);
            scope.register(() => combatService.unregisterAbility(ability.id));
          },
        };
        return ctx as PluginContextBase;
      }
      case skillsManifest.id: {
        const ctx: SkillsContext = {
          pluginId,
          scope,
          registerSkill(skill) {
            skillsService.registerSkill(skill);
            scope.register(() => skillsService.unregisterSkill(skill.id));
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
  };
}

async function bootPluginsFor(
  world: World,
  gameId: GamePluginSetId,
  label: "server" | "client",
): Promise<PluginSession<PluginContextBase>> {
  const modules = getPluginModules(gameId);
  const combatService = createCombatAbilityService();
  const skillsService = createSkillsService();
  console.log(
    `[pie-plugin-boot:${label}] game=${gameId} — ${modules.length} plugin(s) in set`,
  );
  const session = await startPluginSessionFromModules(modules, {
    contextFactory: buildContextFactory(world, combatService, skillsService),
  });
  if (session.unresolvable.length > 0) {
    for (const entry of session.unresolvable) {
      console.warn(
        `[pie-plugin-boot:${label}] unresolvable: "${entry.module.manifest.id}" — ${entry.reason}`,
      );
    }
  }
  if (session.records.length > 0) {
    const ids = session.records.map((r) => r.manifest.id).join(", ");
    console.log(
      `[pie-plugin-boot:${label}] started ${session.records.length} plugin(s): ${ids}`,
    );
  }
  return session;
}

/**
 * Build the `plugins` option for `PIEEditorSession.start({ plugins })`.
 * Both hooks share the same contextFactory template — the only
 * difference is which World instance (PIE server vs PIE client) they
 * bind against.
 *
 * Fresh services per `createPIEPluginHooks()` call so starting a new
 * Play session doesn't inherit ability/skill registrations from a
 * previous one.
 */
export function createPIEPluginHooks(gameId: GamePluginSetId): {
  bootServerPlugins: (
    serverWorld: World,
  ) => Promise<PluginSession<PluginContextBase>>;
  bootClientPlugins: (
    clientWorld: World,
  ) => Promise<PluginSession<PluginContextBase>>;
} {
  return {
    bootServerPlugins: (serverWorld) =>
      bootPluginsFor(serverWorld, gameId, "server"),
    bootClientPlugins: (clientWorld) =>
      bootPluginsFor(clientWorld, gameId, "client"),
  };
}
