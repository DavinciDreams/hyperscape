/**
 * Respawn policy resolver.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `respawn.ts`.
 * Indexes bind points + exposes pure resolvers for death + spawn
 * outcomes:
 *
 *   - `selectableBindPointsFor(player)` — which bind points may a
 *     player set as their home (level + faction + allowBindHere).
 *   - `selectDefaultBindPoint(player)` — the bind point a player
 *     respawns at when they haven't set one (kind-priority ladder).
 *   - `resolveDeathOutcome(player, carriedGold, corpseItems)` —
 *     how much XP/gold/durability is lost, how many items drop,
 *     drop policy. Pure math over the manifest's DeathPenaltyRules.
 *   - `resolveResurrectionOutcome(player, source)` — whether rez
 *     sickness applies and for how long, with player-level floor.
 *
 * Scope: pure logic. No ECS, no teleport calls, no corpse entity
 * lifecycle. Just the rule math — caller decides what to do with
 * it.
 */

import {
  type CorpseRunRules,
  type DeathPenaltyRules,
  type RespawnBindKind,
  type RespawnBindPoint,
  type RespawnManifest,
  RespawnManifestSchema,
  type ResurrectionRules,
} from "@hyperforge/manifest-schema";

export interface RespawnPrincipal {
  characterLevel: number;
  factionId?: string;
  /** XP within current level (0..1 as a fraction) — used for xp-loss math. */
  xpIntoLevelFraction?: number;
}

export interface DeathOutcome {
  xpLost: number;
  levelDropped: boolean;
  goldLost: number;
  durabilityLossFraction: number;
  itemsDroppedCount: number;
  dropPolicy: DeathPenaltyRules["dropPolicy"];
  dropGraceSec: number;
}

export interface ResurrectionOutcome {
  appliesSickness: boolean;
  sicknessMinutes: number;
  sicknessStatReductionFraction: number;
  autoResAtBindAfterSec: number;
}

export class UnknownBindPointError extends Error {
  readonly bindPointId: string;
  readonly availableIds: readonly string[];
  constructor(bindPointId: string, availableIds: readonly string[]) {
    super(
      `respawn bind point "${bindPointId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownBindPointError";
    this.bindPointId = bindPointId;
    this.availableIds = availableIds;
  }
}

const KIND_PRIORITY: RespawnBindKind[] = [
  "playerHousing",
  "innkeeper",
  "capitalSpawn",
  "graveyard",
  "dungeonEntrance",
  "raidEntrance",
  "custom",
];

export class RespawnPolicyResolver {
  private _manifest: RespawnManifest | null = null;
  private _bindsById = new Map<string, RespawnBindPoint>();

  constructor(manifest?: RespawnManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: RespawnManifest): void {
    this._manifest = manifest;
    this._bindsById.clear();
    for (const b of manifest.bindPoints) this._bindsById.set(b.id, b);
  }

  loadFromJson(raw: unknown): void {
    this.load(RespawnManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get isEnabled(): boolean {
    return this._manifest?.enabled ?? false;
  }

  get size(): number {
    return this._bindsById.size;
  }

  has(id: string): boolean {
    return this._bindsById.has(id);
  }

  get(id: string): RespawnBindPoint {
    const b = this._bindsById.get(id);
    if (!b) {
      throw new UnknownBindPointError(id, Array.from(this._bindsById.keys()));
    }
    return b;
  }

  /** Bind points the player is permitted to set as home. */
  selectableBindPointsFor(
    player: RespawnPrincipal,
  ): readonly RespawnBindPoint[] {
    if (!this._manifest?.enabled) return [];
    return this._manifest.bindPoints.filter((b) =>
      this._playerMayBindAt(b, player),
    );
  }

  /**
   * Fallback bind point — used when the player has no explicit bind
   * set. Walks `KIND_PRIORITY` and returns the first bindable point
   * of that kind that the player qualifies for.
   */
  selectDefaultBindPoint(player: RespawnPrincipal): RespawnBindPoint | null {
    if (!this._manifest?.enabled) return null;
    for (const kind of KIND_PRIORITY) {
      const b = this._manifest.bindPoints.find(
        (p) => p.kind === kind && this._playerMayBindAt(p, player),
      );
      if (b) return b;
    }
    return null;
  }

  /** Pure death-penalty math. */
  resolveDeathOutcome(
    player: RespawnPrincipal,
    carriedGold: number,
    corpseItemCount: number,
  ): DeathOutcome {
    const rules = this._requireManifest().deathPenalty;
    if (carriedGold < 0 || !Number.isFinite(carriedGold)) {
      throw new TypeError(
        `carriedGold must be a non-negative finite number (got ${String(carriedGold)})`,
      );
    }
    if (corpseItemCount < 0 || !Number.isFinite(corpseItemCount)) {
      throw new TypeError(
        `corpseItemCount must be a non-negative finite number (got ${String(corpseItemCount)})`,
      );
    }

    // XP loss — fraction of current-level XP band. We don't have
    // level-band sizes here, so we report the *fraction* owed and let
    // a progression system translate it into absolute XP.
    const xpFrac = player.xpIntoLevelFraction ?? 0;
    const xpLostFrac = rules.xpLossFractionOfLevel;
    const xpLost = xpLostFrac; // normalized [0..1] fraction of level
    const levelDropped =
      rules.xpLossCanDelevel && xpLostFrac > 0 && xpLostFrac > xpFrac;

    // Gold loss — fraction of carried, capped if declared.
    let goldLost = carriedGold * rules.goldLossFraction;
    if (rules.goldLossMaxCurrency > 0) {
      goldLost = Math.min(goldLost, rules.goldLossMaxCurrency);
    }
    goldLost = Math.floor(goldLost);

    // Item drop count: 0 if dropPolicy=none or dropItemsOnDeath=false.
    let itemsDropped = 0;
    if (rules.dropItemsOnDeath && rules.dropPolicy !== "none") {
      itemsDropped = Math.min(rules.maxItemsDropped, corpseItemCount);
    }

    return {
      xpLost,
      levelDropped,
      goldLost,
      durabilityLossFraction: rules.durabilityLossFraction,
      itemsDroppedCount: itemsDropped,
      dropPolicy: rules.dropPolicy,
      dropGraceSec: rules.dropGraceSec,
    };
  }

  /**
   * Resurrection math — whether sickness applies and for how long.
   * `source` is the bind point the player is respawning AT, or
   * `"abilityInstant"` when a medic/priest cast an instant-rez.
   */
  resolveResurrectionOutcome(
    player: RespawnPrincipal,
    source: RespawnBindPoint | "abilityInstant",
  ): ResurrectionOutcome {
    const rules = this._requireManifest().resurrection;
    const lvlFloor = rules.sicknessMinCharacterLevel;
    if (player.characterLevel < lvlFloor) {
      return noSickness(rules);
    }
    if (source === "abilityInstant") {
      if (!rules.allowInstantResByAbility) {
        // Instant rez is disabled — upstream should never send this,
        // but be defensive: treat as normal bind-point rez.
        return {
          appliesSickness: rules.sicknessMinutes > 0,
          sicknessMinutes: rules.sicknessMinutes,
          sicknessStatReductionFraction: rules.sicknessStatReductionFraction,
          autoResAtBindAfterSec: rules.autoResAtBindAfterSec,
        };
      }
      return noSickness(rules);
    }
    if (!source.applyResurrectionSickness) {
      return noSickness(rules);
    }
    return {
      appliesSickness: rules.sicknessMinutes > 0,
      sicknessMinutes: rules.sicknessMinutes,
      sicknessStatReductionFraction: rules.sicknessStatReductionFraction,
      autoResAtBindAfterSec: rules.autoResAtBindAfterSec,
    };
  }

  /** Convenience accessor for the compiled corpse-run rules. */
  get corpseRun(): CorpseRunRules | null {
    return this._manifest?.corpseRun ?? null;
  }

  private _playerMayBindAt(
    b: RespawnBindPoint,
    player: RespawnPrincipal,
  ): boolean {
    if (!b.allowBindHere) return false;
    if (b.minCharacterLevel > 0) {
      if (player.characterLevel < b.minCharacterLevel) return false;
    }
    if (b.factionAllowList.length > 0) {
      if (!player.factionId || !b.factionAllowList.includes(player.factionId)) {
        return false;
      }
    }
    return true;
  }

  private _requireManifest(): RespawnManifest {
    if (!this._manifest) {
      throw new Error("RespawnPolicyResolver.load not called");
    }
    return this._manifest;
  }
}

function noSickness(rules: ResurrectionRules): ResurrectionOutcome {
  return {
    appliesSickness: false,
    sicknessMinutes: 0,
    sicknessStatReductionFraction: 0,
    autoResAtBindAfterSec: rules.autoResAtBindAfterSec,
  };
}
