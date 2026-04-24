/**
 * Tests for the MailProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mailProvider } from "../MailProvider";

beforeEach(() => {
  mailProvider.unload();
});
afterEach(() => {
  mailProvider.unload();
});

describe("MailProvider", () => {
  it("starts unloaded", () => {
    expect(mailProvider.isLoaded()).toBe(false);
    expect(mailProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts baseline {enabled:false}", () => {
    const parsed = mailProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(mailProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() fills in rule-group defaults", () => {
    const parsed = mailProvider.loadRaw({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.attachments).toBeDefined();
    expect(parsed.cod).toBeDefined();
    expect(parsed.postage).toBeDefined();
    expect(parsed.retention).toBeDefined();
    expect(parsed.rateLimit).toBeDefined();
  });

  it("loadRaw() rejects duplicate enabledCategories", () => {
    expect(() =>
      mailProvider.loadRaw({ enabledCategories: ["player", "player"] }),
    ).toThrow();
  });

  it("loadRaw() rejects CoD enabled with zero attachment slots", () => {
    expect(() =>
      mailProvider.loadRaw({
        cod: { enabled: true },
        attachments: { maxItemSlots: 0 },
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = mailProvider.loadRaw({ enabled: false });
    mailProvider.unload();
    mailProvider.load(parsed);
    expect(mailProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    mailProvider.loadRaw({ enabled: true });
    const parsed = mailProvider.loadRaw({ enabled: false });
    mailProvider.hotReload(parsed);
    expect(mailProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    mailProvider.loadRaw({ enabled: false });
    mailProvider.hotReload(null);
    expect(mailProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    mailProvider.loadRaw({ enabled: false });
    mailProvider.unload();
    expect(mailProvider.isLoaded()).toBe(false);
  });
});
