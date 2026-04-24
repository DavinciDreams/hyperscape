/**
 * Plugin boot — runs the @hyperforge/gameplay-framework plugin
 * pipeline against the in-binary plugin set at server startup.
 *
 * Today the set is the @hyperforge/hyperscape meta-plugin and its
 * two declared dependencies (@hyperforge/combat, @hyperforge/skills).
 * All three currently ship no-op `onLoad` / `onEnable` hooks, so this
 * call is a *behavior no-op* — its purpose is to prove the plugin
 * runtime actually executes inside the production server boot path
 * (not just in unit tests) and to give every future
 * `Hyperscape → meta-plugin` migration a real attachment point.
 *
 * Per-plugin contributions (systems, widgets, manifests, commands)
 * are not consumed yet — that's the next slice. This is the
 * smallest possible PR that takes Phase I from "framework exists in
 * isolation" to "framework runs in production".
 *
 * Order matters: the resolver does its own toposort by manifest
 * `dependencies`, so we just hand the modules in any order. We use
 * `startPluginSessionFromModules` (not the catalog-based variant)
 * because the modules are compiled into the server binary — there
 * is no on-disk catalog to walk.
 */

import {
  type LoadedPluginModule,
  type PluginContextBase,
  type PluginSession,
  startPluginSessionFromModules,
} from "@hyperforge/gameplay-framework";

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
import hyperscapeFactory from "@hyperforge/hyperscape";
import { manifest as hyperscapeManifest } from "@hyperforge/hyperscape";

/**
 * Per-plugin services live for the lifetime of the server. They get
 * captured into per-plugin contexts so plugin `onEnable` hooks can
 * register against them. Currently no other code reads from these
 * services — Hyperscape→meta-plugin migrations are how they wire
 * into actual gameplay (e.g. combat resolution reads through the
 * `CombatAbilityService` to look up registered abilities).
 */
let _combatService: CombatAbilityService | null = null;
let _skillsService: SkillsService | null = null;

/** Test-only reset so each test starts from clean services. */
export function _resetServerPluginServicesForTests(): void {
  _combatService = null;
  _skillsService = null;
}

function getCombatService(): CombatAbilityService {
  if (!_combatService) _combatService = createCombatAbilityService();
  return _combatService;
}

function getSkillsService(): SkillsService {
  if (!_skillsService) _skillsService = createSkillsService();
  return _skillsService;
}

/** Test-only readers so the smoke test can verify registrations. */
export function _peekCombatService(): CombatAbilityService | null {
  return _combatService;
}
export function _peekSkillsService(): SkillsService | null {
  return _skillsService;
}

/**
 * Build the in-binary plugin set. Exported separately so tests can
 * boot the same set through `startPluginSessionFromModules` without
 * needing the rest of the server bootstrap.
 */
export function getServerPluginModules(): ReadonlyArray<
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
 * Boot the in-binary plugin set. Called from `initializeWorld` after
 * world systems are registered but before `world.init()`. Returns the
 * session so callers can `session.stop()` on shutdown for clean
 * disposer teardown.
 *
 * The framework manages each plugin's scope internally — the
 * context factory just returns the base shape. Richer contexts
 * (world reference, system registry, etc.) get layered on when the
 * first plugin actually needs them.
 */
export async function bootServerPlugins(): Promise<
  PluginSession<PluginContextBase>
> {
  const modules = getServerPluginModules();
  const session = await startPluginSessionFromModules(modules, {
    // Context factory dispatches by manifest id. Each plugin receives
    // its declared context shape (CombatContext / SkillsContext / …)
    // wired to a real per-server service. Disposers attached to the
    // scope inside the factory's helper methods unregister on stop.
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
        default:
          // hyperscape meta-plugin + any future plugin with no extra
          // surface beyond PluginContextBase falls through here.
          return { pluginId, scope };
      }
    },
  });

  if (session.unresolvable.length > 0) {
    for (const entry of session.unresolvable) {
      console.warn(
        `[plugin-boot] unresolvable: "${entry.module.manifest.id}" — ${entry.reason}`,
      );
    }
  }

  if (session.records.length > 0) {
    const ids = session.records.map((r) => r.manifest.id).join(", ");
    console.log(
      `[plugin-boot] started ${session.records.length} plugin(s): ${ids}`,
    );
  }

  return session;
}
