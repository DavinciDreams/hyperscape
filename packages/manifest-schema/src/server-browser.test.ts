import { describe, expect, it } from "vitest";
import {
  ColumnDefinitionSchema,
  FilterFacetSchema,
  ListRulesSchema,
  ServerBrowserManifestSchema,
} from "./server-browser.js";

describe("FilterFacetSchema", () => {
  it("accepts non-custom facet with no customKey", () => {
    const f = FilterFacetSchema.parse({
      id: "reg",
      kind: "region",
      labelLocalizationKey: "filter.region",
    });
    expect(f.enabledByDefault).toBe(false);
  });

  it("rejects custom facet without customKey", () => {
    expect(() =>
      FilterFacetSchema.parse({
        id: "x",
        kind: "custom",
        labelLocalizationKey: "filter.x",
      }),
    ).toThrow(/customKey/);
  });

  it("accepts custom with customKey", () => {
    const f = FilterFacetSchema.parse({
      id: "hardcore",
      kind: "custom",
      labelLocalizationKey: "filter.hardcore",
      customKey: "hardcore",
    });
    expect(f.customKey).toBe("hardcore");
  });
});

describe("ColumnDefinitionSchema", () => {
  it("accepts minimal column", () => {
    const c = ColumnDefinitionSchema.parse({
      column: "name",
      labelLocalizationKey: "col.name",
    });
    expect(c.visibleByDefault).toBe(true);
  });
});

describe("ListRulesSchema", () => {
  it("accepts defaults", () => {
    const r = ListRulesSchema.parse({});
    expect(r.pingGoodMs).toBe(80);
    expect(r.pingOkMs).toBe(200);
  });

  it("rejects pingOkMs <= pingGoodMs", () => {
    expect(() =>
      ListRulesSchema.parse({ pingGoodMs: 100, pingOkMs: 100 }),
    ).toThrow(/pingOkMs/);
  });
});

describe("ServerBrowserManifestSchema", () => {
  it("accepts disabled empty manifest", () => {
    const m = ServerBrowserManifestSchema.parse({ enabled: false });
    expect(m.filters).toEqual([]);
  });

  it("accepts minimal enabled manifest", () => {
    const m = ServerBrowserManifestSchema.parse({ enabled: true });
    expect(m.defaultSortColumn).toBe("ping");
  });

  it("rejects duplicate filter ids", () => {
    const f = {
      id: "reg",
      kind: "region",
      labelLocalizationKey: "l",
    };
    expect(() =>
      ServerBrowserManifestSchema.parse({ filters: [f, f] }),
    ).toThrow(/unique/);
  });

  it("rejects duplicate column kinds", () => {
    const c = { column: "name", labelLocalizationKey: "l" };
    expect(() =>
      ServerBrowserManifestSchema.parse({ columns: [c, c] }),
    ).toThrow(/unique/);
  });

  it("accepts full manifest", () => {
    const m = ServerBrowserManifestSchema.parse({
      filters: [
        {
          id: "reg",
          kind: "region",
          labelLocalizationKey: "filter.region",
        },
      ],
      columns: [
        { column: "name", labelLocalizationKey: "col.name" },
        { column: "ping", labelLocalizationKey: "col.ping" },
      ],
    });
    expect(m.filters).toHaveLength(1);
    expect(m.columns).toHaveLength(2);
  });
});
