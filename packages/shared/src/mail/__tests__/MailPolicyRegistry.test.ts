import { MailManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import { MailPolicyRegistry } from "../MailPolicyRegistry.js";

function policy() {
  return MailManifestSchema.parse({
    enabledCategories: ["player", "auction", "system", "guild"],
    postage: { flatFee: 30, perItemFee: 5, perCurrencyFee: 10 },
    cod: { enabled: true, commission: 0.05, maxCodAmount: 1_000_000 },
    attachments: { maxItemSlots: 6, maxCurrencyAmount: 500_000 },
    retention: {
      readNoAttachmentsRetentionHours: 72,
      withAttachmentsRetentionHours: 720,
      unreadAutoReturnHours: 100,
      senderReclaimGraceHours: 24,
    },
    rateLimit: {
      maxPerHour: 10,
      maxPerDay: 50,
      minSendIntervalSec: 2,
      maxRecipientsPerMail: 1,
    },
    maxSubjectLength: 64,
    maxBodyLength: 2000,
  });
}

describe("MailPolicyRegistry — postage", () => {
  it("computes flat + per-item + currency", () => {
    const r = new MailPolicyRegistry(policy());
    const q = r.quotePostage({
      category: "player",
      itemAttachments: 3,
      currencyAttachments: 1,
    });
    expect(q.subtotal).toBe(30 + 5 * 3 + 10);
    expect(q.total).toBe(55);
    expect(q.waived).toBe(false);
  });

  it("waives postage for guild mail", () => {
    const r = new MailPolicyRegistry(policy());
    const q = r.quotePostage({
      category: "guild",
      itemAttachments: 5,
      currencyAttachments: 0,
    });
    expect(q.waived).toBe(true);
    expect(q.total).toBe(0);
  });

  it("no currency fee when zero currency attached", () => {
    const r = new MailPolicyRegistry(policy());
    const q = r.quotePostage({
      category: "player",
      itemAttachments: 0,
      currencyAttachments: 0,
    });
    expect(q.subtotal).toBe(30);
  });
});

describe("MailPolicyRegistry — checkSend", () => {
  const valid = {
    category: "player" as const,
    recipients: 1,
    subjectLength: 10,
    bodyLength: 100,
    itemAttachments: 1,
    currencyAmount: 0,
    sendsInLastHour: 0,
    sendsInLastDay: 0,
    secondsSinceLastSend: 100,
  };

  it("allows valid send", () => {
    const r = new MailPolicyRegistry(policy());
    expect(r.checkSend(valid).allowed).toBe(true);
  });

  it("rejects disabled category", () => {
    const r = new MailPolicyRegistry(policy());
    expect(r.checkSend({ ...valid, category: "gmTeam" }).reason).toBe(
      "category-disabled",
    );
  });

  it("rejects oversized subject", () => {
    const r = new MailPolicyRegistry(policy());
    expect(r.checkSend({ ...valid, subjectLength: 1000 }).reason).toBe(
      "exceeds-subject-length",
    );
  });

  it("rejects over-attachment", () => {
    const r = new MailPolicyRegistry(policy());
    expect(r.checkSend({ ...valid, itemAttachments: 99 }).reason).toBe(
      "too-many-attachments",
    );
  });

  it("rejects hourly rate limit", () => {
    const r = new MailPolicyRegistry(policy());
    expect(r.checkSend({ ...valid, sendsInLastHour: 10 }).reason).toBe(
      "rate-limit-hour",
    );
  });

  it("rejects min-interval rate limit", () => {
    const r = new MailPolicyRegistry(policy());
    expect(r.checkSend({ ...valid, secondsSinceLastSend: 1 }).reason).toBe(
      "rate-limit-interval",
    );
  });
});

describe("MailPolicyRegistry — checkCod", () => {
  it("allows and computes commission", () => {
    const r = new MailPolicyRegistry(policy());
    const out = r.checkCod({
      codAmount: 10_000,
      itemAttachments: 1,
      currencyAttachments: 0,
    });
    expect(out.allowed).toBe(true);
    expect(out.commission).toBe(500);
    expect(out.sellerPayout).toBe(9500);
  });

  it("rejects no items", () => {
    const r = new MailPolicyRegistry(policy());
    const out = r.checkCod({
      codAmount: 100,
      itemAttachments: 0,
      currencyAttachments: 0,
    });
    expect(out.reason).toBe("no-items");
  });

  it("rejects over cap", () => {
    const r = new MailPolicyRegistry(policy());
    const out = r.checkCod({
      codAmount: 99_999_999,
      itemAttachments: 1,
      currencyAttachments: 0,
    });
    expect(out.reason).toBe("amount-over-cap");
  });

  it("rejects currency + CoD when disallowed", () => {
    const r = new MailPolicyRegistry(policy());
    const out = r.checkCod({
      codAmount: 100,
      itemAttachments: 1,
      currencyAttachments: 1,
    });
    expect(out.reason).toBe("currency-attachment-forbidden");
  });
});

describe("MailPolicyRegistry — classifyExpiry", () => {
  const hours = (n: number) => n * 3_600_000;

  it("fresh unread is live", () => {
    const r = new MailPolicyRegistry(policy());
    const s = r.classifyExpiry({
      createdAtMs: 0,
      readAtMs: 0,
      hasAttachments: false,
      nowMs: hours(1),
    });
    expect(s).toBe("live");
  });

  it("unread past auto-return threshold", () => {
    const r = new MailPolicyRegistry(policy());
    const s = r.classifyExpiry({
      createdAtMs: 0,
      readAtMs: 0,
      hasAttachments: true,
      nowMs: hours(101),
    });
    expect(s).toBe("auto-returned");
  });

  it("unread past auto-return + grace = permanent delete", () => {
    const r = new MailPolicyRegistry(policy());
    const s = r.classifyExpiry({
      createdAtMs: 0,
      readAtMs: 0,
      hasAttachments: true,
      nowMs: hours(200),
    });
    expect(s).toBe("permanent-delete");
  });

  it("read mail expires by no-attachment retention", () => {
    const r = new MailPolicyRegistry(policy());
    const s = r.classifyExpiry({
      createdAtMs: 0,
      readAtMs: hours(1),
      hasAttachments: false,
      nowMs: hours(100),
    });
    expect(s).toBe("permanent-delete");
  });

  it("read mail with attachments has longer retention", () => {
    const r = new MailPolicyRegistry(policy());
    const s = r.classifyExpiry({
      createdAtMs: 0,
      readAtMs: hours(1),
      hasAttachments: true,
      nowMs: hours(100),
    });
    expect(s).toBe("live");
  });
});

describe("MailPolicyRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new MailPolicyRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(policy());
    r.load(policy());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new MailPolicyRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(policy());
    off();
    r.load(policy());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new MailPolicyRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(policy());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
