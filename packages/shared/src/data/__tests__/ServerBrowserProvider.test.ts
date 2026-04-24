/**
 * Tests for the ServerBrowserProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { serverBrowserProvider } from "../ServerBrowserProvider";

beforeEach(() => {
  serverBrowserProvider.unload();
});
afterEach(() => {
  serverBrowserProvider.unload();
});

describe("ServerBrowserProvider", () => {
  it("starts unloaded", () => {
    expect(serverBrowserProvider.isLoaded()).toBe(false);
    expect(serverBrowserProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts {} baseline — all fields default", () => {
    const parsed = serverBrowserProvider.loadRaw({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.filters).toEqual([]);
    expect(parsed.columns).toEqual([]);
    expect(parsed.defaultSortColumn).toBe("ping");
  });

  it("loadRaw() rejects unknown top-level keys (.strict)", () => {
    expect(() => serverBrowserProvider.loadRaw({ unknownKey: 1 })).toThrow();
  });

  it("loadRaw() rejects duplicate filter ids", () => {
    expect(() =>
      serverBrowserProvider.loadRaw({
        filters: [
          {
            id: "region",
            kind: "region" as const,
            labelLocalizationKey: "region",
          },
          {
            id: "region",
            kind: "region" as const,
            labelLocalizationKey: "region2",
          },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() accepts a valid filter entry", () => {
    const parsed = serverBrowserProvider.loadRaw({
      filters: [
        {
          id: "pingFilter",
          kind: "pingRange" as const,
          labelLocalizationKey: "serverBrowser.filter.ping",
        },
      ],
    });
    expect(parsed.filters[0].id).toBe("pingFilter");
  });

  it("loadRaw() accepts allowDirectConnect toggle", () => {
    const parsed = serverBrowserProvider.loadRaw({
      allowDirectConnect: true,
    });
    expect(parsed.allowDirectConnect).toBe(true);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = serverBrowserProvider.loadRaw({});
    serverBrowserProvider.unload();
    serverBrowserProvider.load(parsed);
    expect(serverBrowserProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    serverBrowserProvider.loadRaw({});
    serverBrowserProvider.hotReload(null);
    expect(serverBrowserProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(serverBrowserProvider).toBe(serverBrowserProvider);
  });
});
