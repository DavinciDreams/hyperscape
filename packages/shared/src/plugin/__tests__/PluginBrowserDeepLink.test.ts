import { describe, expect, it } from "vitest";
import {
  decodePluginBrowserDeepLink,
  encodePluginBrowserDeepLink,
  isEmptyPluginBrowserDeepLink,
} from "../PluginBrowserDeepLink.js";

describe("encodePluginBrowserDeepLink", () => {
  it("returns empty string for empty state", () => {
    expect(encodePluginBrowserDeepLink({})).toBe("");
  });

  it("encodes all fields in fixed order", () => {
    const out = encodePluginBrowserDeepLink({
      selectedPluginId: "com.example",
      severityInclude: ["error", "warning"],
      severityExclude: ["ok"],
      sortKey: "pluginId",
      sortDirection: "asc",
    });
    expect(out).toBe(
      "selected=com.example&include=error,warning&exclude=ok&sortKey=pluginId&sortDir=asc",
    );
  });

  it("URL-encodes selectedPluginId", () => {
    const out = encodePluginBrowserDeepLink({
      selectedPluginId: "com.a/b c",
    });
    expect(out).toBe("selected=com.a%2Fb%20c");
  });

  it("omits empty severity arrays", () => {
    const out = encodePluginBrowserDeepLink({
      selectedPluginId: "a",
      severityInclude: [],
      severityExclude: [],
    });
    expect(out).toBe("selected=a");
  });

  it("omits null selectedPluginId", () => {
    const out = encodePluginBrowserDeepLink({
      selectedPluginId: null,
      sortKey: "severity",
    });
    expect(out).toBe("sortKey=severity");
  });

  it("de-duplicates severity values", () => {
    const out = encodePluginBrowserDeepLink({
      severityInclude: ["error", "error", "warning", "error"],
    });
    expect(out).toBe("include=error,warning");
  });

  it("drops unknown severity values silently", () => {
    const out = encodePluginBrowserDeepLink({
      severityInclude: ["error", "bogus" as never, "warning"],
    });
    expect(out).toBe("include=error,warning");
  });
});

describe("decodePluginBrowserDeepLink", () => {
  it("returns empty state for empty / null input", () => {
    expect(decodePluginBrowserDeepLink("")).toEqual({});
    expect(decodePluginBrowserDeepLink(null)).toEqual({});
    expect(decodePluginBrowserDeepLink(undefined)).toEqual({});
  });

  it("strips a leading '#'", () => {
    expect(decodePluginBrowserDeepLink("#selected=a")).toEqual({
      selectedPluginId: "a",
    });
  });

  it("strips a leading '?'", () => {
    expect(decodePluginBrowserDeepLink("?selected=a")).toEqual({
      selectedPluginId: "a",
    });
  });

  it("decodes a full round-trip produced by encode", () => {
    const source = {
      selectedPluginId: "com.example",
      severityInclude: ["error", "warning"] as const,
      severityExclude: ["ok"] as const,
      sortKey: "pluginId" as const,
      sortDirection: "asc" as const,
    };
    const encoded = encodePluginBrowserDeepLink(source);
    expect(decodePluginBrowserDeepLink(encoded)).toEqual(source);
  });

  it("ignores unknown keys", () => {
    expect(
      decodePluginBrowserDeepLink("selected=a&unknown=val&foo=bar"),
    ).toEqual({ selectedPluginId: "a" });
  });

  it("drops a single bad value but keeps the rest", () => {
    const out = decodePluginBrowserDeepLink(
      "selected=a&sortKey=bogus&sortDir=asc",
    );
    expect(out).toEqual({
      selectedPluginId: "a",
      sortDirection: "asc",
    });
  });

  it("drops unknown severities from include list, keeps known", () => {
    expect(decodePluginBrowserDeepLink("include=error,bogus,warning")).toEqual({
      severityInclude: ["error", "warning"],
    });
  });

  it("returns an empty include when all severities are unknown", () => {
    const out = decodePluginBrowserDeepLink("include=bogus,bogus2");
    expect(out.severityInclude).toBeUndefined();
  });

  it("URL-decodes selectedPluginId", () => {
    expect(decodePluginBrowserDeepLink("selected=com.a%2Fb%20c")).toEqual({
      selectedPluginId: "com.a/b c",
    });
  });

  it("handles a chunk with no '=' by ignoring it", () => {
    // "selected=a&ignored&sortKey=label"
    expect(
      decodePluginBrowserDeepLink("selected=a&ignored&sortKey=label"),
    ).toEqual({
      selectedPluginId: "a",
      sortKey: "label",
    });
  });

  it("handles repeated '&' separators", () => {
    expect(decodePluginBrowserDeepLink("&&selected=a&&")).toEqual({
      selectedPluginId: "a",
    });
  });

  it("rejects malformed URI-encoded values gracefully", () => {
    // A lone '%' is invalid URI encoding.
    expect(decodePluginBrowserDeepLink("selected=%")).toEqual({});
  });
});

describe("isEmptyPluginBrowserDeepLink", () => {
  it("is true for a truly empty state", () => {
    expect(isEmptyPluginBrowserDeepLink({})).toBe(true);
  });

  it("is true when only empty arrays are present", () => {
    expect(
      isEmptyPluginBrowserDeepLink({
        severityInclude: [],
        severityExclude: [],
      }),
    ).toBe(true);
  });

  it("is true when only null selectedPluginId is present", () => {
    expect(isEmptyPluginBrowserDeepLink({ selectedPluginId: null })).toBe(true);
  });

  it("is false when any meaningful field is set", () => {
    expect(isEmptyPluginBrowserDeepLink({ selectedPluginId: "a" })).toBe(false);
    expect(isEmptyPluginBrowserDeepLink({ sortKey: "severity" })).toBe(false);
    expect(isEmptyPluginBrowserDeepLink({ severityInclude: ["error"] })).toBe(
      false,
    );
  });
});

describe("round-trip invariants", () => {
  it("decode(encode(x)) === x for well-formed input", () => {
    const cases = [
      {},
      { selectedPluginId: "a" },
      { sortKey: "severity" as const, sortDirection: "desc" as const },
      { severityInclude: ["error", "warning", "info", "ok"] as const },
      { severityExclude: ["ok"] as const },
      {
        selectedPluginId: "com.a",
        severityInclude: ["error"] as const,
        severityExclude: ["ok"] as const,
        sortKey: "label" as const,
        sortDirection: "asc" as const,
      },
    ];
    for (const c of cases) {
      const encoded = encodePluginBrowserDeepLink(c);
      const decoded = decodePluginBrowserDeepLink(encoded);
      expect(decoded).toEqual(c);
    }
  });

  it("encode(decode(x)) is idempotent for well-formed strings", () => {
    const a = "selected=a&include=error,warning&sortKey=pluginId&sortDir=asc";
    const b = encodePluginBrowserDeepLink(decodePluginBrowserDeepLink(a));
    expect(b).toBe(a);
  });
});
