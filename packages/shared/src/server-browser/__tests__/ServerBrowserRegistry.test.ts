import { ServerBrowserManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  ServerBrowserNotLoadedError,
  ServerBrowserRegistry,
  UnknownFilterFacetError,
} from "../ServerBrowserRegistry.js";

function manifest() {
  return ServerBrowserManifestSchema.parse({
    enabled: true,
    filters: [
      {
        id: "search",
        kind: "textSearch",
        labelLocalizationKey: "filter.search",
        enabledByDefault: true,
        displayOrder: 0,
      },
      {
        id: "region",
        kind: "region",
        labelLocalizationKey: "filter.region",
        enabledByDefault: true,
        displayOrder: 10,
      },
      {
        id: "gameMode",
        kind: "gameMode",
        labelLocalizationKey: "filter.gameMode",
        displayOrder: 20,
      },
    ],
    columns: [
      {
        column: "name",
        labelLocalizationKey: "col.name",
        displayOrder: 0,
      },
      {
        column: "ping",
        labelLocalizationKey: "col.ping",
        widthPx: 80,
        displayOrder: 10,
      },
      {
        column: "region",
        labelLocalizationKey: "col.region",
        visibleByDefault: false,
        displayOrder: 20,
      },
    ],
    list: {
      maxResults: 100,
      autoRefreshIntervalSec: 30,
      maxFavorites: 10,
      maxHistoryEntries: 20,
      pingGoodMs: 80,
      pingOkMs: 150,
    },
    defaultSortColumn: "ping",
    defaultSortDirection: "ascending",
    allowPasswordProtected: true,
    allowDirectConnect: false,
  });
}

describe("ServerBrowserRegistry — not loaded", () => {
  it("throws when accessed pre-load", () => {
    const r = new ServerBrowserRegistry();
    expect(() => r.manifest).toThrow(ServerBrowserNotLoadedError);
  });

  it("loadFromJson accepts raw input", () => {
    const r = new ServerBrowserRegistry();
    r.loadFromJson({ enabled: true, filters: [], columns: [] });
    expect(r.enabled).toBe(true);
  });
});

describe("ServerBrowserRegistry — filters", () => {
  it("indexes by id", () => {
    const r = new ServerBrowserRegistry(manifest());
    expect(r.hasFilter("region")).toBe(true);
    expect(r.filter("region").kind).toBe("region");
  });

  it("throws on unknown filter", () => {
    const r = new ServerBrowserRegistry(manifest());
    expect(() => r.filter("ghost")).toThrow(UnknownFilterFacetError);
  });

  it("sorts by displayOrder", () => {
    const r = new ServerBrowserRegistry(manifest());
    expect(r.filtersByDisplayOrder().map((f) => f.id)).toEqual([
      "search",
      "region",
      "gameMode",
    ]);
  });

  it("filters to default-on", () => {
    const r = new ServerBrowserRegistry(manifest());
    expect(r.defaultOnFilters().map((f) => f.id)).toEqual(["search", "region"]);
  });
});

describe("ServerBrowserRegistry — columns", () => {
  it("has column by kind", () => {
    const r = new ServerBrowserRegistry(manifest());
    expect(r.hasColumn("ping")).toBe(true);
    expect(r.column("ping")?.widthPx).toBe(80);
    expect(r.column("playerCount")).toBeNull();
  });

  it("sorts by displayOrder", () => {
    const r = new ServerBrowserRegistry(manifest());
    expect(r.columnsByDisplayOrder().map((c) => c.column)).toEqual([
      "name",
      "ping",
      "region",
    ]);
  });

  it("filters visible columns", () => {
    const r = new ServerBrowserRegistry(manifest());
    expect(r.visibleColumns().map((c) => c.column)).toEqual(["name", "ping"]);
  });
});

describe("ServerBrowserRegistry — ping bucket", () => {
  it("classifies good / ok / poor", () => {
    const r = new ServerBrowserRegistry(manifest());
    expect(r.classifyPing(50)).toBe("good");
    expect(r.classifyPing(80)).toBe("good");
    expect(r.classifyPing(100)).toBe("ok");
    expect(r.classifyPing(150)).toBe("ok");
    expect(r.classifyPing(200)).toBe("poor");
  });
});

describe("ServerBrowserRegistry — caps + refresh", () => {
  it("enforces favorites cap", () => {
    const r = new ServerBrowserRegistry(manifest());
    expect(r.canAddFavorite(9)).toBe(true);
    expect(r.canAddFavorite(10)).toBe(false);
  });

  it("enforces history cap", () => {
    const r = new ServerBrowserRegistry(manifest());
    expect(r.canAddHistoryEntry(19)).toBe(true);
    expect(r.canAddHistoryEntry(20)).toBe(false);
  });

  it("auto-refreshes after the interval elapses", () => {
    const r = new ServerBrowserRegistry(manifest());
    expect(r.autoRefreshEnabled).toBe(true);
    expect(r.shouldAutoRefresh(10)).toBe(false);
    expect(r.shouldAutoRefresh(30)).toBe(true);
    expect(r.shouldAutoRefresh(120)).toBe(true);
  });

  it("respects disabled auto-refresh", () => {
    const r = new ServerBrowserRegistry();
    r.loadFromJson({
      enabled: true,
      filters: [],
      columns: [],
      list: {
        autoRefreshIntervalSec: 0,
      },
    });
    expect(r.autoRefreshEnabled).toBe(false);
    expect(r.shouldAutoRefresh(9999)).toBe(false);
  });
});

describe("ServerBrowserRegistry — policy", () => {
  it("exposes defaults", () => {
    const r = new ServerBrowserRegistry(manifest());
    expect(r.defaultSort.column).toBe("ping");
    expect(r.defaultSort.direction).toBe("ascending");
    expect(r.allowsPasswordProtected).toBe(true);
    expect(r.allowsDirectConnect).toBe(false);
  });
});
