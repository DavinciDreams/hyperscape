/**
 * Chat router runtime.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `chat-channels.ts`. Given a channel manifest, routes inbound
 * messages through:
 *   1. channel lookup
 *   2. post-permission tier check
 *   3. length cap
 *   4. rate limit (per-minute ring buffer)
 *   5. cooldown (min-interval between messages)
 *   6. filter rules (block / censor / warn / flag)
 *
 * Scope: pure logic. No deps on networking, DB, or the world. The
 * transport layer (ServerNetwork) calls `router.send(...)` and
 * broadcasts only on `kind === "delivered"`.
 */

import {
  type ChatChannel,
  type ChatChannelsManifest,
  ChatChannelsManifestSchema,
  type ChatPostPermission,
} from "@hyperforge/manifest-schema";

/** Strict ordering of post-permission tiers — higher = more authority. */
const PERMISSION_TIER: Record<ChatPostPermission, number> = {
  anyone: 0,
  "verified-email": 1,
  moderator: 2,
  admin: 3,
  "system-only": 4,
};

export interface ChatMessageInput {
  channelId: string;
  senderId: string;
  senderPermission: ChatPostPermission;
  text: string;
}

export type FilterAction = "censor" | "warn" | "flag";
export interface FilterHit {
  ruleId: string;
  action: FilterAction;
}

export type ChatRejectReason =
  | "unknown-channel"
  | "permission-denied"
  | "over-length"
  | "rate-limit"
  | "cooldown"
  | "blocked-by-filter";

export type ChatRouteResult =
  | {
      kind: "delivered";
      channelId: string;
      senderId: string;
      text: string;
      flags: readonly FilterHit[];
    }
  | {
      kind: "rejected";
      reason: ChatRejectReason;
      /** Present when `reason === "blocked-by-filter"`. */
      filterRuleId?: string;
    };

export class UnknownChatChannelError extends Error {
  readonly channelId: string;
  readonly availableIds: readonly string[];
  constructor(channelId: string, availableIds: readonly string[]) {
    super(
      `chat channel "${channelId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownChatChannelError";
    this.channelId = channelId;
    this.availableIds = availableIds;
  }
}

/**
 * Stateless registry + lookup. Pre-resolves each channel's filter
 * rules into compiled regex lists for hot-path routing.
 */
export class ChatChannelRegistry {
  private _byId = new Map<string, ChatChannel>();
  private _filtersByChannel = new Map<
    string,
    Array<{
      ruleId: string;
      pattern: RegExp;
      action: "block" | "censor" | "warn" | "flag";
      severity: number;
    }>
  >();

  constructor(manifest?: ChatChannelsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ChatChannelsManifest): void {
    this._byId.clear();
    this._filtersByChannel.clear();

    const rulesById = new Map<string, (typeof manifest.filterRules)[number]>();
    for (const r of manifest.filterRules) rulesById.set(r.id, r);

    for (const c of manifest.channels) {
      this._byId.set(c.id, c);
      const compiled: Array<{
        ruleId: string;
        pattern: RegExp;
        action: "block" | "censor" | "warn" | "flag";
        severity: number;
      }> = [];
      for (const ruleId of c.filterRuleIds) {
        const rule = rulesById.get(ruleId);
        if (!rule) continue; // schema refinement already guarantees presence
        compiled.push({
          ruleId: rule.id,
          pattern: new RegExp(rule.pattern, "g"),
          action: rule.action,
          severity: rule.severity,
        });
      }
      this._filtersByChannel.set(c.id, compiled);
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(ChatChannelsManifestSchema.parse(raw));
  }

  get size(): number {
    return this._byId.size;
  }

  isLoaded(): boolean {
    return this._byId.size > 0;
  }

  get ids(): readonly string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): ChatChannel {
    const c = this._byId.get(id);
    if (!c) {
      throw new UnknownChatChannelError(id, Array.from(this._byId.keys()));
    }
    return c;
  }

  defaultVisibleChannelIds(): readonly string[] {
    return Array.from(this._byId.values())
      .filter((c) => c.defaultVisible)
      .map((c) => c.id);
  }

  /** @internal used by ChatRouter for hot-path filter iteration. */
  _compiledFilters(channelId: string): readonly {
    ruleId: string;
    pattern: RegExp;
    action: "block" | "censor" | "warn" | "flag";
    severity: number;
  }[] {
    return this._filtersByChannel.get(channelId) ?? [];
  }
}

/**
 * Stateful router. Retains per-(channel, sender) rate + cooldown
 * state; `send()` returns a discriminated routing result.
 */
export class ChatRouter {
  readonly registry: ChatChannelRegistry;
  private readonly _clock: () => number;
  private readonly _recent = new Map<string, number[]>();
  private readonly _lastSend = new Map<string, number>();

  constructor(registry: ChatChannelRegistry, clock?: () => number) {
    this.registry = registry;
    this._clock = clock ?? (() => Date.now());
  }

  /** Clear all per-sender rate + cooldown state. */
  reset(): void {
    this._recent.clear();
    this._lastSend.clear();
  }

  /** Drop rate + cooldown state for a single sender across all channels. */
  resetSender(senderId: string): void {
    const suffix = `|${senderId}`;
    for (const key of Array.from(this._recent.keys())) {
      if (key.endsWith(suffix)) this._recent.delete(key);
    }
    for (const key of Array.from(this._lastSend.keys())) {
      if (key.endsWith(suffix)) this._lastSend.delete(key);
    }
  }

  send(input: ChatMessageInput): ChatRouteResult {
    const channel = this.registry.has(input.channelId)
      ? this.registry.get(input.channelId)
      : null;
    if (!channel) return { kind: "rejected", reason: "unknown-channel" };

    // 1. Permission tier
    const required = PERMISSION_TIER[channel.postPermission];
    const actual = PERMISSION_TIER[input.senderPermission];
    if (actual < required) {
      return { kind: "rejected", reason: "permission-denied" };
    }

    // 2. Length cap (count code-points via `...string`)
    if ([...input.text].length > channel.maxMessageLength) {
      return { kind: "rejected", reason: "over-length" };
    }

    const now = this._clock();
    const key = `${channel.id}|${input.senderId}`;

    // 3. Cooldown (skip for system senders / 0-cooldown)
    if (channel.cooldownSec > 0) {
      const last = this._lastSend.get(key);
      if (last !== undefined && now - last < channel.cooldownSec * 1000) {
        return { kind: "rejected", reason: "cooldown" };
      }
    }

    // 4. Rate limit peek — count timestamps in last 60s, reject if
    // already at cap. Do NOT commit yet; only push on delivery so
    // filter-rejected messages don't consume a slot.
    let prunedRateBucket: number[] | null = null;
    if (channel.rateLimitPerMinute > 0) {
      const bucket = this._recent.get(key) ?? [];
      const cutoff = now - 60_000;
      let i = 0;
      while (i < bucket.length && bucket[i] < cutoff) i++;
      const pruned = i > 0 ? bucket.slice(i) : bucket;
      if (pruned.length >= channel.rateLimitPerMinute) {
        this._recent.set(key, pruned);
        return { kind: "rejected", reason: "rate-limit" };
      }
      prunedRateBucket = pruned;
    }

    // 5. Filter rules — walk in manifest order
    const compiled = this.registry._compiledFilters(channel.id);
    let text = input.text;
    const flags: FilterHit[] = [];
    for (const rule of compiled) {
      // Reset regex lastIndex because `g` flag is stateful.
      rule.pattern.lastIndex = 0;
      if (rule.action === "block") {
        if (rule.pattern.test(text)) {
          return {
            kind: "rejected",
            reason: "blocked-by-filter",
            filterRuleId: rule.ruleId,
          };
        }
      } else if (rule.action === "censor") {
        rule.pattern.lastIndex = 0;
        let hadHit = false;
        text = text.replace(rule.pattern, (match) => {
          hadHit = true;
          return "*".repeat([...match].length);
        });
        if (hadHit) flags.push({ ruleId: rule.ruleId, action: "censor" });
      } else {
        // warn | flag
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(text)) {
          flags.push({ ruleId: rule.ruleId, action: rule.action });
        }
      }
    }

    // 6. Commit rate + cooldown — only now that the message is
    // guaranteed to deliver. Filter-rejected messages leave both
    // buckets untouched so they don't push honest players over.
    if (prunedRateBucket !== null) {
      prunedRateBucket.push(now);
      this._recent.set(key, prunedRateBucket);
    }
    if (channel.cooldownSec > 0) {
      this._lastSend.set(key, now);
    }

    return {
      kind: "delivered",
      channelId: channel.id,
      senderId: input.senderId,
      text,
      flags,
    };
  }
}
