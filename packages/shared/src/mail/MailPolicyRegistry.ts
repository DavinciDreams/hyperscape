/**
 * Mail policy registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `mail.ts`.
 * Pure logic: postage calculation, CoD fee math, retention/expiry
 * checks, rate-limit gates. Runtime `MailSystem` owns inbox state,
 * attachment escrow, notification, and persistence.
 *
 * Unlike the other registries, the mail manifest is a single policy
 * blob (not an array) — so this class is a "singleton driver" not an
 * id-keyed registry.
 */

import {
  type MailCategory,
  type MailManifest,
  MailManifestSchema,
} from "@hyperforge/manifest-schema";

export class MailPolicyNotLoadedError extends Error {
  constructor() {
    super("MailPolicyRegistry used before load()");
    this.name = "MailPolicyNotLoadedError";
  }
}

/** Cost breakdown for a send attempt. */
export interface PostageQuote {
  flat: number;
  itemFees: number;
  currencyFees: number;
  /** Total before any waivers. */
  subtotal: number;
  /** Total after category waivers (guild/system). */
  total: number;
  /** True if the category fully waived postage. */
  waived: boolean;
}

export interface PostageInput {
  category: MailCategory;
  itemAttachments: number;
  currencyAttachments: number;
}

export type SendCheckReason =
  | "allowed"
  | "disabled"
  | "category-disabled"
  | "exceeds-subject-length"
  | "exceeds-body-length"
  | "too-many-recipients"
  | "too-many-attachments"
  | "currency-over-cap"
  | "rate-limit-hour"
  | "rate-limit-day"
  | "rate-limit-interval";

export interface SendCheckResult {
  allowed: boolean;
  reason: SendCheckReason;
}

export interface SendCheckInput {
  category: MailCategory;
  recipients: number;
  subjectLength: number;
  bodyLength: number;
  itemAttachments: number;
  currencyAmount: number;
  sendsInLastHour: number;
  sendsInLastDay: number;
  secondsSinceLastSend: number;
}

export type CodCheckReason =
  | "allowed"
  | "cod-disabled"
  | "no-items"
  | "amount-over-cap"
  | "currency-attachment-forbidden";

export interface CodCheckResult {
  allowed: boolean;
  reason: CodCheckReason;
  /** Commission in absolute currency units (0 when !allowed). */
  commission: number;
  /** Amount the sender receives after commission (0 when !allowed). */
  sellerPayout: number;
}

export interface ExpiryInput {
  /** Epoch ms when the mail was created. */
  createdAtMs: number;
  /** Epoch ms when the mail was read. 0 = still unread. */
  readAtMs: number;
  hasAttachments: boolean;
  nowMs: number;
}

export type ExpiryState = "live" | "auto-returned" | "permanent-delete";

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type MailPolicyReloadListener = () => void;

export class MailPolicyRegistry {
  private _policy: MailManifest | null = null;
  private _reloadListeners = new Set<MailPolicyReloadListener>();

  constructor(manifest?: MailManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: MailManifest): void {
    this._policy = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(MailManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: MailPolicyReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[mailPolicyRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get policy(): MailManifest {
    if (!this._policy) throw new MailPolicyNotLoadedError();
    return this._policy;
  }

  get loaded(): boolean {
    return this._policy !== null;
  }

  isLoaded(): boolean {
    return this._policy !== null;
  }

  /** Is the given category enabled for this deployment? */
  isCategoryEnabled(category: MailCategory): boolean {
    return this.policy.enabledCategories.includes(category);
  }

  /** Calculate postage fee for a send. */
  quotePostage(input: PostageInput): PostageQuote {
    const p = this.policy.postage;
    const flat = p.flatFee;
    const itemFees = p.perItemFee * input.itemAttachments;
    const currencyFees =
      p.perCurrencyFee * (input.currencyAttachments > 0 ? 1 : 0);
    const subtotal = flat + itemFees + currencyFees;
    const waived =
      (input.category === "guild" && p.freeGuildMail) ||
      (input.category === "system" && p.freeSystemMail);
    return {
      flat,
      itemFees,
      currencyFees,
      subtotal,
      total: waived ? 0 : subtotal,
      waived,
    };
  }

  /** Up-front checks before accepting a send. */
  checkSend(input: SendCheckInput): SendCheckResult {
    const p = this.policy;
    if (!p.enabled) return { allowed: false, reason: "disabled" };
    if (!this.isCategoryEnabled(input.category)) {
      return { allowed: false, reason: "category-disabled" };
    }
    if (input.subjectLength > p.maxSubjectLength) {
      return { allowed: false, reason: "exceeds-subject-length" };
    }
    if (input.bodyLength > p.maxBodyLength) {
      return { allowed: false, reason: "exceeds-body-length" };
    }
    if (input.recipients > p.rateLimit.maxRecipientsPerMail) {
      return { allowed: false, reason: "too-many-recipients" };
    }
    if (input.itemAttachments > p.attachments.maxItemSlots) {
      return { allowed: false, reason: "too-many-attachments" };
    }
    if (input.currencyAmount > p.attachments.maxCurrencyAmount) {
      return { allowed: false, reason: "currency-over-cap" };
    }
    if (input.sendsInLastHour >= p.rateLimit.maxPerHour) {
      return { allowed: false, reason: "rate-limit-hour" };
    }
    if (input.sendsInLastDay >= p.rateLimit.maxPerDay) {
      return { allowed: false, reason: "rate-limit-day" };
    }
    if (input.secondsSinceLastSend < p.rateLimit.minSendIntervalSec) {
      return { allowed: false, reason: "rate-limit-interval" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /**
   * Check whether a CoD mail is acceptable + compute commission.
   */
  checkCod(opts: {
    codAmount: number;
    itemAttachments: number;
    currencyAttachments: number;
  }): CodCheckResult {
    const p = this.policy.cod;
    if (!p.enabled) {
      return {
        allowed: false,
        reason: "cod-disabled",
        commission: 0,
        sellerPayout: 0,
      };
    }
    if (opts.itemAttachments <= 0) {
      return {
        allowed: false,
        reason: "no-items",
        commission: 0,
        sellerPayout: 0,
      };
    }
    if (opts.codAmount > p.maxCodAmount) {
      return {
        allowed: false,
        reason: "amount-over-cap",
        commission: 0,
        sellerPayout: 0,
      };
    }
    if (p.disallowCurrencyAttachment && opts.currencyAttachments > 0) {
      return {
        allowed: false,
        reason: "currency-attachment-forbidden",
        commission: 0,
        sellerPayout: 0,
      };
    }
    const commission = Math.round(opts.codAmount * p.commission);
    return {
      allowed: true,
      reason: "allowed",
      commission,
      sellerPayout: opts.codAmount - commission,
    };
  }

  /**
   * Classify a mail instance's retention state. `auto-returned` = the
   * unread mail has exceeded unreadAutoReturnHours; `permanent-delete`
   * = past the full retention window; `live` otherwise.
   */
  classifyExpiry(input: ExpiryInput): ExpiryState {
    const p = this.policy.retention;
    const ageMs = Math.max(0, input.nowMs - input.createdAtMs);
    const ageHours = ageMs / 3_600_000;
    const unread = input.readAtMs <= 0;
    if (unread && ageHours >= p.unreadAutoReturnHours) {
      // Once past unreadAutoReturnHours + senderReclaimGraceHours we fully delete
      if (ageHours >= p.unreadAutoReturnHours + p.senderReclaimGraceHours) {
        return "permanent-delete";
      }
      return "auto-returned";
    }
    const retentionLimitHours = input.hasAttachments
      ? p.withAttachmentsRetentionHours
      : p.readNoAttachmentsRetentionHours;
    if (ageHours >= retentionLimitHours) return "permanent-delete";
    return "live";
  }
}
