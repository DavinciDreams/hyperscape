import { LoadingScreensManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  LoadingScreensNotLoadedError,
  LoadingScreensRegistry,
  UnknownLoadingSlateError,
} from "../LoadingScreensRegistry.js";

function slate(
  id: string,
  extra: {
    zoneIds?: string[];
    triggers?: Array<
      | "initialLoad"
      | "zoneTransition"
      | "levelStream"
      | "reconnect"
      | "instanceEnter"
      | "cinematicCover"
    >;
    selectionWeight?: number;
  } = {},
) {
  return {
    id,
    backgroundAssetRef: "bgDefault",
    zoneIds: extra.zoneIds ?? [],
    triggers: extra.triggers ?? [],
    selectionWeight: extra.selectionWeight ?? 1,
  };
}

function manifest() {
  return LoadingScreensManifestSchema.parse({
    enabled: true,
    slates: [
      slate("fallback", { selectionWeight: 1 }),
      slate("varrockA", {
        zoneIds: ["varrock"],
        triggers: ["zoneTransition"],
        selectionWeight: 3,
      }),
      slate("varrockB", {
        zoneIds: ["varrock"],
        triggers: ["zoneTransition"],
        selectionWeight: 1,
      }),
      slate("reconnectOnly", {
        triggers: ["reconnect"],
        selectionWeight: 2,
      }),
    ],
    defaultSlateId: "fallback",
  });
}

describe("LoadingScreensRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new LoadingScreensRegistry().manifest).toThrow(
      LoadingScreensNotLoadedError,
    );
  });
});

describe("LoadingScreensRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new LoadingScreensRegistry(manifest());
    expect(r.has("varrockA")).toBe(true);
    expect(r.slate("fallback").backgroundAssetRef).toBe("bgDefault");
  });

  it("throws on unknown", () => {
    const r = new LoadingScreensRegistry(manifest());
    expect(() => r.slate("ghost")).toThrow(UnknownLoadingSlateError);
  });
});

describe("LoadingScreensRegistry — candidates", () => {
  it("empty context returns all slates", () => {
    const r = new LoadingScreensRegistry(manifest());
    expect(r.candidates({}).map((s) => s.id)).toEqual([
      "fallback",
      "varrockA",
      "varrockB",
      "reconnectOnly",
    ]);
  });

  it("zone filter excludes non-matching slates but keeps unfiltered", () => {
    const r = new LoadingScreensRegistry(manifest());
    const ids = r.candidates({ zoneId: "varrock" }).map((s) => s.id);
    expect(ids).toEqual(["fallback", "varrockA", "varrockB", "reconnectOnly"]);
  });

  it("trigger filter narrows pool", () => {
    const r = new LoadingScreensRegistry(manifest());
    const ids = r.candidates({ trigger: "reconnect" }).map((s) => s.id);
    expect(ids).toEqual(["fallback", "reconnectOnly"]);
  });

  it("zone + trigger combine filters", () => {
    const r = new LoadingScreensRegistry(manifest());
    const ids = r
      .candidates({ zoneId: "varrock", trigger: "zoneTransition" })
      .map((s) => s.id);
    expect(ids).toEqual(["fallback", "varrockA", "varrockB"]);
  });

  it("zone match excludes slates with non-matching zoneIds", () => {
    const r = new LoadingScreensRegistry(manifest());
    const ids = r.candidates({ zoneId: "unknownZone" }).map((s) => s.id);
    // varrockA/B declare zoneIds=['varrock'], so they drop out.
    expect(ids).toEqual(["fallback", "reconnectOnly"]);
  });
});

describe("LoadingScreensRegistry — pick", () => {
  it("weighted roll uses injected random", () => {
    const r = new LoadingScreensRegistry(manifest());
    // varrockA weight=3, varrockB weight=1, total=4; fallback also in pool.
    // pool = [fallback(1), varrockA(3), varrockB(1)] → total 5.
    // rand=0.0 → roll=0 → fallback
    const pick0 = r.pick(
      { zoneId: "varrock", trigger: "zoneTransition" },
      () => 0,
    );
    expect(pick0?.id).toBe("fallback");
    // rand=0.9 → roll=4.5 → varrockB (cumulative 1, 4, 5)
    const pick1 = r.pick(
      { zoneId: "varrock", trigger: "zoneTransition" },
      () => 0.9,
    );
    expect(pick1?.id).toBe("varrockB");
  });

  it("falls back to defaultSlateId when no candidate matches", () => {
    const empty = LoadingScreensManifestSchema.parse({
      enabled: true,
      slates: [slate("only", { zoneIds: ["z1"] })],
      defaultSlateId: "only",
    });
    const r = new LoadingScreensRegistry(empty);
    // Zone filter with candidates present — but pool is non-empty (the slate's
    // zoneIds=["z1"] excludes "other" zone → empty pool → default).
    const picked = r.pick({ zoneId: "other" });
    expect(picked?.id).toBe("only");
  });

  it("returns undefined when pool empty and no default", () => {
    const m = LoadingScreensManifestSchema.parse({
      enabled: false,
      slates: [],
      defaultSlateId: "",
    });
    const r = new LoadingScreensRegistry(m);
    expect(r.pick({ zoneId: "any" })).toBeUndefined();
  });
});

describe("LoadingScreensRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new LoadingScreensRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new LoadingScreensRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new LoadingScreensRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
