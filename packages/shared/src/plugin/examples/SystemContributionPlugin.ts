/**
 * SystemContributionPlugin (I3 reference, sixth in the series).
 *
 * Sixth reference plugin over `PluginContributionRegistry<TItem>`,
 * covering the *long-running tick system* surface — the most
 * fundamental contribution kind, since runtime systems are how
 * plugins inject persistent behavior into the world (movement,
 * AI ticks, network reconciliation, …).
 *
 *   - Palette   → asset-browser categories
 *   - Toolbar   → top-bar tools
 *   - Commands  → keybindable actions
 *   - Widgets   → HUD elements
 *   - Entities  → authorable entity types
 *   - Systems   → long-running tick systems
 *
 * A system contribution entry pairs an authorable id with a
 * tick rate (Hz) and a tick phase. This is metadata only — the
 * registry doesn't run anything; it tells the editor "this
 * plugin contributes a `Pathfinding` system that ticks at 30 Hz
 * in the `physics` phase". The actual tick callback lives in
 * the plugin's data and is wired up by the runtime
 * `gameplay-framework`.
 *
 * Validation policy:
 *   - `id` must be lowerCamelCase or reverse-domain (mirrors
 *     EntitySchema and PluginCommand id regexes)
 *   - `tickRateHz` must be a finite positive number ≤ 240 (the
 *     editor enforces an upper bound to surface obvious
 *     mis-configurations like 9999 Hz; the framework can
 *     subdivide further if needed)
 *   - `phase` must be one of the four canonical phases
 *   - `description`, when present, must be non-empty after trim
 */

import type { PluginContextScope } from "../PluginContextScope.js";
import type { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import type { HyperforgePlugin } from "../PluginLoader.js";

export type SystemTickPhase = "input" | "physics" | "logic" | "render";

const SYSTEM_TICK_PHASES: ReadonlySet<SystemTickPhase> = new Set([
  "input",
  "physics",
  "logic",
  "render",
]);

export interface SystemContribution {
  readonly id: string;
  readonly tickRateHz: number;
  readonly phase: SystemTickPhase;
  readonly description?: string;
}

export interface SystemContributionContext {
  readonly pluginId: string;
  readonly scope: PluginContextScope;
  readonly systems: PluginContributionRegistry<SystemContribution>;
}

const SYSTEM_ID_REGEX =
  /^(?:[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+|[a-z][a-zA-Z0-9]*)$/;

const MAX_TICK_RATE_HZ = 240;

export class InvalidSystemIdError extends Error {
  readonly systemId: string;

  constructor(systemId: string) {
    super(
      `System id "${systemId}" must be lowerCamelCase ` +
        `(e.g. "pathfinding") or reverse-domain ` +
        `(e.g. "com.studio.combat.aggro")`,
    );
    this.name = "InvalidSystemIdError";
    this.systemId = systemId;
  }
}

export class InvalidSystemTickRateError extends Error {
  readonly systemId: string;
  readonly tickRateHz: number;

  constructor(systemId: string, tickRateHz: number) {
    super(
      `System "${systemId}" tickRateHz=${tickRateHz} is invalid; ` +
        `must be a finite positive number ≤ ${MAX_TICK_RATE_HZ}`,
    );
    this.name = "InvalidSystemTickRateError";
    this.systemId = systemId;
    this.tickRateHz = tickRateHz;
  }
}

export class InvalidSystemPhaseError extends Error {
  readonly systemId: string;
  readonly phase: string;

  constructor(systemId: string, phase: string) {
    super(
      `System "${systemId}" phase "${phase}" is invalid; ` +
        `must be one of input | physics | logic | render`,
    );
    this.name = "InvalidSystemPhaseError";
    this.systemId = systemId;
    this.phase = phase;
  }
}

export class InvalidSystemFieldError extends Error {
  readonly systemId: string;
  readonly field: string;

  constructor(systemId: string, field: string, reason: string) {
    super(`System "${systemId}" field "${field}" is invalid: ${reason}`);
    this.name = "InvalidSystemFieldError";
    this.systemId = systemId;
    this.field = field;
  }
}

function validateSystemContribution(s: SystemContribution): void {
  if (!SYSTEM_ID_REGEX.test(s.id)) {
    throw new InvalidSystemIdError(s.id);
  }
  if (
    !Number.isFinite(s.tickRateHz) ||
    s.tickRateHz <= 0 ||
    s.tickRateHz > MAX_TICK_RATE_HZ
  ) {
    throw new InvalidSystemTickRateError(s.id, s.tickRateHz);
  }
  if (!SYSTEM_TICK_PHASES.has(s.phase)) {
    throw new InvalidSystemPhaseError(s.id, s.phase);
  }
  if (s.description !== undefined && s.description.trim().length === 0) {
    throw new InvalidSystemFieldError(
      s.id,
      "description",
      "must be non-empty when set",
    );
  }
}

export function systemContributionPlugin(
  systems: readonly SystemContribution[],
): HyperforgePlugin<SystemContributionContext> {
  return {
    onEnable(ctx) {
      for (const s of systems) validateSystemContribution(s);
      ctx.systems.registerAll(ctx.pluginId, systems);
      ctx.scope.register(() =>
        ctx.systems.unregisterAllForPlugin(ctx.pluginId),
      );
    },
  };
}
