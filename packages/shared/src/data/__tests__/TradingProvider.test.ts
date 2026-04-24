/**
 * Tests for the TradingProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { tradingProvider } from "../TradingProvider";

beforeEach(() => {
  tradingProvider.unload();
});
afterEach(() => {
  tradingProvider.unload();
});

describe("TradingProvider", () => {
  it("starts unloaded", () => {
    expect(tradingProvider.isLoaded()).toBe(false);
    expect(tradingProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty blob and fills defaults", () => {
    const parsed = tradingProvider.loadRaw({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.session).toBeDefined();
    expect(parsed.items).toBeDefined();
    expect(parsed.currency).toBeDefined();
    expect(parsed.eligibility).toBeDefined();
    expect(parsed.rateLimit).toBeDefined();
    expect(parsed.antiRmt).toBeDefined();
    expect(tradingProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts {enabled:false} baseline", () => {
    const parsed = tradingProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
  });

  it("loadRaw() rejects confirmMode='none' + sessionTimeoutSec=0", () => {
    expect(() =>
      tradingProvider.loadRaw({
        session: { confirmMode: "none", sessionTimeoutSec: 0 },
      }),
    ).toThrow();
  });

  it("loadRaw() rejects rateLimit day < hour", () => {
    expect(() =>
      tradingProvider.loadRaw({
        rateLimit: { maxTradesPerDay: 3, maxTradesPerHour: 10 },
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = tradingProvider.loadRaw({});
    tradingProvider.unload();
    tradingProvider.load(parsed);
    expect(tradingProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    tradingProvider.loadRaw({});
    const parsed = tradingProvider.loadRaw({ enabled: false });
    tradingProvider.hotReload(parsed);
    expect(tradingProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    tradingProvider.loadRaw({});
    tradingProvider.hotReload(null);
    expect(tradingProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    tradingProvider.loadRaw({});
    tradingProvider.unload();
    expect(tradingProvider.isLoaded()).toBe(false);
  });
});
