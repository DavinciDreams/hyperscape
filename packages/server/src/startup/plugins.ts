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
 * Test fallback when `bootServerPlugins()` is called without a real
 * world (the smoke test does this). Records every `register`/
 * `unregister` call so tests can assert the plugin actually attempted
 * to attach the system, without depending on the full world ECS.
 */
interface WorldStub {
  readonly registered: string[];
  readonly unregistered: string[];
}
function createNoopWorldStub(): World {
  const registered: string[] = [];
  const unregistered: string[] = [];
  const stub = {
    registered,
    unregistered,
    register(name: string, _ctor: unknown) {
      registered.push(name);
    },
    unregister(name: string) {
      unregistered.push(name);
    },
  };
  // World is a large interface — only the bits the plugin's onEnable
  // touches matter. Cast through unknown to keep the stub minimal.
  return stub as unknown as World;
}

/** Test-only accessor for the noop world stub created on stub-mode boot. */
export function _peekStubWorld(world: unknown): WorldStub | null {
  if (
    world &&
    typeof world === "object" &&
    "registered" in world &&
    "unregistered" in world
  ) {
    return world as WorldStub;
  }
  return null;
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
export async function bootServerPlugins(
  world?: World,
): Promise<PluginSession<PluginContextBase>> {
  const modules = getServerPluginModules();
  const session = await startPluginSessionFromModules(modules, {
    // Context factory dispatches by manifest id. Each plugin receives
    // its declared context shape (CombatContext / SkillsContext /
    // HyperscapeContext) wired to a real per-server service or to the
    // host's world. Disposers attached to the scope inside the
    // factory's helper methods unregister on stop.
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
          // Meta-plugin's onEnable calls `ctx.world.register(...)` to
          // attach migrated systems (first cut: MobDeathSystem).
          // Tests that don't supply a world fall back to a tiny stub
          // — `register` is a no-op there so the plugin's registration
          // call doesn't blow up.
          const ctx: HyperscapeContext = {
            pluginId,
            scope,
            world: world ?? createNoopWorldStub(),
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
