import { describe, expect, it } from "vitest";
import type {
  PluginBrowserToastIntent,
  PluginBrowserToastKind,
} from "../PluginBrowserToastRouter.js";
import type { PluginRowSummarySeverity } from "../PluginBrowserRowSummary.js";
import { rateLimitPluginBrowserToastIntents } from "../PluginBrowserToastRateLimit.js";

function mkIntent(
  pluginId: string,
  kind: PluginBrowserToastKind,
  severity: PluginRowSummarySeverity,
): PluginBrowserToastIntent {
  return {
    id: `${kind}:${pluginId}`,
    kind,
    severity,
    pluginId,
    previous: null,
    current: null,
  };
}

describe("rateLimitPluginBrowserToastIntents — pass-through", () => {
  it("emits all intents when count <= maxVisible", () => {
    const intents = [
      mkIntent("a", "regressed", "error"),
      mkIntent("b", "added", "info"),
    ];
    const r = rateLimitPluginBrowserToastIntents(intents, { maxVisible: 5 });
    expect(r.emitted).toBe(intents);
    expect(r.overflow).toBeNull();
  });

  it("emits all when count equals maxVisible exactly", () => {
    const intents = [
      mkIntent("a", "regressed", "error"),
      mkIntent("b", "added", "info"),
    ];
    const r = rateLimitPluginBrowserToastIntents(intents, { maxVisible: 2 });
    expect(r.emitted).toHaveLength(2);
    expect(r.overflow).toBeNull();
  });

  it("returns empty when input is empty", () => {
    const r = rateLimitPluginBrowserToastIntents([], { maxVisible: 5 });
    expect(r.emitted).toEqual([]);
    expect(r.overflow).toBeNull();
  });
});

describe("rateLimitPluginBrowserToastIntents — overflow collapse", () => {
  it("keeps the first N and collapses the rest into a summary", () => {
    const intents = [
      mkIntent("a", "regressed", "error"),
      mkIntent("b", "regressed", "warning"),
      mkIntent("c", "removed", "warning"),
      mkIntent("d", "added", "info"),
      mkIntent("e", "recovered", "ok"),
    ];
    const r = rateLimitPluginBrowserToastIntents(intents, { maxVisible: 2 });
    expect(r.emitted.map((i) => i.pluginId)).toEqual(["a", "b"]);
    expect(r.overflow).not.toBeNull();
    expect(r.overflow?.overflowCount).toBe(3);
    expect(r.overflow?.overflowIds).toEqual([
      "removed:c",
      "added:d",
      "recovered:e",
    ]);
  });

  it("aggregates overflow counts by severity", () => {
    const intents = [
      mkIntent("a", "regressed", "error"),
      mkIntent("b", "regressed", "error"),
      mkIntent("c", "removed", "warning"),
      mkIntent("d", "added", "info"),
      mkIntent("e", "recovered", "ok"),
    ];
    const r = rateLimitPluginBrowserToastIntents(intents, { maxVisible: 1 });
    expect(r.overflow?.bySeverity).toEqual({
      ok: 1,
      info: 1,
      warning: 1,
      error: 1,
    });
  });

  it("aggregates overflow counts by kind", () => {
    const intents = [
      mkIntent("a", "regressed", "error"),
      mkIntent("b", "regressed", "error"),
      mkIntent("c", "removed", "warning"),
      mkIntent("d", "added", "info"),
      mkIntent("e", "recovered", "ok"),
      mkIntent("f", "label-changed", "info"),
    ];
    const r = rateLimitPluginBrowserToastIntents(intents, { maxVisible: 1 });
    expect(r.overflow?.byKind).toEqual({
      added: 1,
      removed: 1,
      regressed: 1,
      recovered: 1,
      "label-changed": 1,
    });
  });
});

describe("rateLimitPluginBrowserToastIntents — edge cases", () => {
  it("clamps negative maxVisible to 0 and collapses everything", () => {
    const intents = [mkIntent("a", "regressed", "error")];
    const r = rateLimitPluginBrowserToastIntents(intents, {
      maxVisible: -5,
    });
    expect(r.emitted).toEqual([]);
    expect(r.overflow?.overflowCount).toBe(1);
  });

  it("maxVisible=0 collapses every intent", () => {
    const intents = [
      mkIntent("a", "regressed", "error"),
      mkIntent("b", "added", "info"),
    ];
    const r = rateLimitPluginBrowserToastIntents(intents, { maxVisible: 0 });
    expect(r.emitted).toEqual([]);
    expect(r.overflow?.overflowCount).toBe(2);
    expect(r.overflow?.overflowIds).toEqual(["regressed:a", "added:b"]);
  });
});
