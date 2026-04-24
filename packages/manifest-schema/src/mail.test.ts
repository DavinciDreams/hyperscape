/**
 * Faithfulness + defensiveness tests for `MailManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { MailManifestSchema, type MailManifest } from "./mail.js";

const reference: MailManifest = {
  enabled: true,
  enabledCategories: ["player", "auction", "system", "guild"],
  attachments: {
    maxItemSlots: 12,
    maxTotalWeight: 0,
    maxCurrencyAmount: 100_000_000,
    currencyId: "gold",
    allowSoulboundBetweenSameAccount: true,
    allowQuestItems: false,
  },
  cod: {
    enabled: true,
    commission: 0.05,
    maxCodAmount: 50_000_000,
    disallowCurrencyAttachment: true,
  },
  postage: {
    flatFee: 30,
    perItemFee: 0,
    perCurrencyFee: 0,
    freeGuildMail: true,
    freeSystemMail: true,
  },
  retention: {
    readNoAttachmentsRetentionHours: 72,
    withAttachmentsRetentionHours: 720,
    unreadAutoReturnHours: 720,
    senderReclaimGraceHours: 168,
    maxInboxPerPlayer: 100,
  },
  rateLimit: {
    maxPerHour: 30,
    maxPerDay: 200,
    minSendIntervalSec: 1,
    maxRecipientsPerMail: 1,
  },
  maxSubjectLength: 64,
  maxBodyLength: 2000,
  blockListEnabled: true,
  gmMailBypassesAllLimits: true,
};

describe("MailManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = MailManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on empty manifest", () => {
    const parsed = MailManifestSchema.parse({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.enabledCategories).toEqual(["player", "auction", "system"]);
    expect(parsed.attachments.maxItemSlots).toBe(6);
    expect(parsed.attachments.currencyId).toBe("gold");
    expect(parsed.cod.enabled).toBe(true);
    expect(parsed.cod.commission).toBeCloseTo(0.05);
    expect(parsed.postage.flatFee).toBe(30);
    expect(parsed.retention.readNoAttachmentsRetentionHours).toBe(72);
    expect(parsed.rateLimit.maxPerHour).toBe(30);
    expect(parsed.rateLimit.maxPerDay).toBe(200);
    expect(parsed.maxSubjectLength).toBe(64);
    expect(parsed.maxBodyLength).toBe(2000);
  });

  it("rejects empty enabledCategories", () => {
    const bad = { enabledCategories: [] };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate enabledCategories", () => {
    const bad = { enabledCategories: ["player", "player"] };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown category", () => {
    const bad = { enabledCategories: ["player", "bulletin"] };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects attachments.maxItemSlots > 24", () => {
    const bad = { attachments: { maxItemSlots: 99 } };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cod.commission > 1", () => {
    const bad = { cod: { commission: 1.5 } };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cod enabled with 0 item slots", () => {
    const bad = {
      attachments: { maxItemSlots: 0 },
      cod: { enabled: true },
    };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts cod disabled with 0 item slots", () => {
    const ok = {
      attachments: { maxItemSlots: 0 },
      cod: { enabled: false },
    };
    expect(MailManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects retention with attachments expiring faster than empty mail", () => {
    const bad = {
      retention: {
        readNoAttachmentsRetentionHours: 720,
        withAttachmentsRetentionHours: 72,
        unreadAutoReturnHours: 72,
        senderReclaimGraceHours: 0,
        maxInboxPerPlayer: 100,
      },
    };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects retention hours = 0", () => {
    const bad = {
      retention: {
        readNoAttachmentsRetentionHours: 0,
        withAttachmentsRetentionHours: 720,
        unreadAutoReturnHours: 720,
        senderReclaimGraceHours: 0,
        maxInboxPerPlayer: 100,
      },
    };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects retention hours > 8760 (1 year)", () => {
    const bad = {
      retention: {
        readNoAttachmentsRetentionHours: 72,
        withAttachmentsRetentionHours: 99999,
        unreadAutoReturnHours: 720,
        senderReclaimGraceHours: 0,
        maxInboxPerPlayer: 100,
      },
    };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects inbox cap > 10000", () => {
    const bad = {
      retention: {
        readNoAttachmentsRetentionHours: 72,
        withAttachmentsRetentionHours: 720,
        unreadAutoReturnHours: 720,
        senderReclaimGraceHours: 0,
        maxInboxPerPlayer: 999_999,
      },
    };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects rateLimit maxPerDay < maxPerHour", () => {
    const bad = {
      rateLimit: {
        maxPerHour: 100,
        maxPerDay: 50,
        minSendIntervalSec: 1,
        maxRecipientsPerMail: 1,
      },
    };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects rateLimit maxPerHour = 0", () => {
    const bad = {
      rateLimit: {
        maxPerHour: 0,
        maxPerDay: 1,
        minSendIntervalSec: 1,
        maxRecipientsPerMail: 1,
      },
    };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects subject length > 256", () => {
    const bad = { maxSubjectLength: 500 };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects body length > 65536", () => {
    const bad = { maxBodyLength: 1_000_000 };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid currencyId format", () => {
    const bad = {
      attachments: { currencyId: "Has Spaces" },
    };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown field on attachments (strict mode)", () => {
    const bad = {
      attachments: { maxItemSlots: 6, extraField: "nope" },
    };
    expect(MailManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts mail-disabled manifest", () => {
    const ok = { enabled: false };
    expect(MailManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts non-default currency", () => {
    const ok = {
      attachments: { currencyId: "galacticCredits" },
    };
    expect(MailManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts broadcast system mail (maxRecipientsPerMail = 500)", () => {
    const ok = {
      rateLimit: {
        maxPerHour: 30,
        maxPerDay: 200,
        minSendIntervalSec: 1,
        maxRecipientsPerMail: 500,
      },
    };
    expect(MailManifestSchema.safeParse(ok).success).toBe(true);
  });
});
