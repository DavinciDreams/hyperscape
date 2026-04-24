import { describe, expect, it } from "vitest";
import {
  appendPluginBrowserChangelog,
  emptyPluginBrowserChangelog,
} from "../PluginBrowserChangelog.js";
import {
  CSV_EXPORT_METADATA,
  NDJSON_EXPORT_METADATA,
  exportPluginBrowserChangelogAsCsv,
  exportPluginBrowserChangelogAsNdjson,
} from "../PluginBrowserChangelogExport.js";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";
import type { PluginBrowserToastIntent } from "../PluginBrowserToastRouter.js";

function summary(
  pluginId: string,
  severity: PluginBrowserRowSummary["severity"],
  label: string = severity,
): PluginBrowserRowSummary {
  return {
    pluginId,
    severity,
    label,
    reasons: [],
    health: null,
    stability: null,
  };
}

function intent(
  pluginId: string,
  kind: PluginBrowserToastIntent["kind"],
  severity: PluginBrowserToastIntent["severity"] = "ok",
  previous: PluginBrowserRowSummary | null = null,
  current: PluginBrowserRowSummary | null = null,
): PluginBrowserToastIntent {
  return {
    id: `${pluginId}:${kind}`,
    pluginId,
    kind,
    severity,
    previous,
    current,
  };
}

function build() {
  let s = emptyPluginBrowserChangelog();
  s = appendPluginBrowserChangelog(s, {
    intents: [
      intent(
        "com.a",
        "regressed",
        "error",
        summary("com.a", "ok"),
        summary("com.a", "error"),
      ),
    ],
    now: 1000,
  });
  s = appendPluginBrowserChangelog(s, {
    intents: [
      intent(
        "com.b",
        "label-changed",
        "warning",
        summary("com.b", "warning", "idle"),
        summary("com.b", "warning", "with, comma"),
      ),
    ],
    now: 2000,
  });
  return s;
}

describe("exportPluginBrowserChangelogAsNdjson", () => {
  it("returns empty string on empty changelog", () => {
    expect(
      exportPluginBrowserChangelogAsNdjson(emptyPluginBrowserChangelog()),
    ).toBe("");
  });

  it("emits one JSON object per line with trailing newline", () => {
    const out = exportPluginBrowserChangelogAsNdjson(build());
    expect(out.endsWith("\n")).toBe(true);
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    expect(first.intent.pluginId).toBe("com.a");
    expect(first.timestamp).toBe(1000);
  });

  it("round-trips via JSON.parse losslessly", () => {
    const s = build();
    const out = exportPluginBrowserChangelogAsNdjson(s);
    const parsed = out
      .trimEnd()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(parsed).toEqual(s.entries);
  });

  it("honors filter", () => {
    const out = exportPluginBrowserChangelogAsNdjson(build(), {
      filter: { pluginId: "com.b" },
    });
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).intent.pluginId).toBe("com.b");
  });
});

describe("exportPluginBrowserChangelogAsCsv", () => {
  it("emits only the header on empty changelog", () => {
    const out = exportPluginBrowserChangelogAsCsv(
      emptyPluginBrowserChangelog(),
    );
    expect(out).toBe(
      "id,timestamp,isoTimestamp,pluginId,kind,severity,previousLabel,currentLabel\n",
    );
  });

  it("emits a header plus one line per entry, trailing newline", () => {
    const out = exportPluginBrowserChangelogAsCsv(build());
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(3); // header + 2
    expect(lines[0]).toBe(
      "id,timestamp,isoTimestamp,pluginId,kind,severity,previousLabel,currentLabel",
    );
    expect(out.endsWith("\n")).toBe(true);
  });

  it("escapes fields containing commas and quotes", () => {
    const out = exportPluginBrowserChangelogAsCsv(build());
    // Second data row has `current.label = "with, comma"` → must be quoted.
    const lines = out.trimEnd().split("\n");
    const bRow = lines[2];
    expect(bRow).toContain('"with, comma"');
  });

  it("writes isoTimestamp alongside epoch millis", () => {
    const out = exportPluginBrowserChangelogAsCsv(build());
    const lines = out.trimEnd().split("\n");
    const aRow = lines[1];
    const iso = new Date(1000).toISOString();
    expect(aRow).toContain("1000,");
    expect(aRow).toContain(iso);
  });

  it("honors filter", () => {
    const out = exportPluginBrowserChangelogAsCsv(build(), {
      filter: { kinds: ["label-changed"] },
    });
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(2); // header + 1
    expect(lines[1]).toContain("com.b");
  });

  it("emits empty strings for null previous/current labels", () => {
    let s = emptyPluginBrowserChangelog();
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("x", "added")],
      now: 1,
    });
    const out = exportPluginBrowserChangelogAsCsv(s);
    const line = out.trimEnd().split("\n")[1];
    expect(line.endsWith(",,")).toBe(true);
  });
});

describe("export metadata", () => {
  it("NDJSON metadata has correct content-type and extension", () => {
    expect(NDJSON_EXPORT_METADATA.contentType).toBe("application/x-ndjson");
    expect(NDJSON_EXPORT_METADATA.extension).toBe(".ndjson");
  });

  it("CSV metadata has correct content-type and extension", () => {
    expect(CSV_EXPORT_METADATA.contentType).toBe("text/csv");
    expect(CSV_EXPORT_METADATA.extension).toBe(".csv");
  });

  it("share the same filenameStem so both downloads pair up", () => {
    expect(NDJSON_EXPORT_METADATA.filenameStem).toBe(
      CSV_EXPORT_METADATA.filenameStem,
    );
  });
});
