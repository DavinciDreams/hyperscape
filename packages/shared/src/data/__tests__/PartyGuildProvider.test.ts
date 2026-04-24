/**
 * Tests for the PartyGuildProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { partyGuildProvider } from "../PartyGuildProvider";

beforeEach(() => {
  partyGuildProvider.unload();
});
afterEach(() => {
  partyGuildProvider.unload();
});

const validManifest = {
  ranks: [
    { id: "leader", name: "Leader", order: 0 },
    { id: "member", name: "Member", order: 1 },
  ],
  defaultRankId: "member",
  leaderRankId: "leader",
};

describe("PartyGuildProvider", () => {
  it("starts unloaded", () => {
    expect(partyGuildProvider.isLoaded()).toBe(false);
    expect(partyGuildProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest", () => {
    const parsed = partyGuildProvider.loadRaw(validManifest);
    expect(parsed.ranks.length).toBe(2);
    expect(partyGuildProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects empty ranks array", () => {
    expect(() =>
      partyGuildProvider.loadRaw({
        ...validManifest,
        ranks: [],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects duplicate rank ids", () => {
    expect(() =>
      partyGuildProvider.loadRaw({
        ...validManifest,
        ranks: [
          { id: "leader", name: "A", order: 0 },
          { id: "leader", name: "B", order: 1 },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects duplicate rank order values", () => {
    expect(() =>
      partyGuildProvider.loadRaw({
        ...validManifest,
        ranks: [
          { id: "a", name: "A", order: 0 },
          { id: "b", name: "B", order: 0 },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects unresolved defaultRankId", () => {
    expect(() =>
      partyGuildProvider.loadRaw({
        ...validManifest,
        defaultRankId: "nonexistent",
      }),
    ).toThrow();
  });

  it("loadRaw() rejects unresolved leaderRankId", () => {
    expect(() =>
      partyGuildProvider.loadRaw({
        ...validManifest,
        leaderRankId: "nonexistent",
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = partyGuildProvider.loadRaw(validManifest);
    partyGuildProvider.unload();
    partyGuildProvider.load(parsed);
    expect(partyGuildProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    partyGuildProvider.loadRaw(validManifest);
    partyGuildProvider.hotReload(null);
    expect(partyGuildProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    partyGuildProvider.loadRaw(validManifest);
    partyGuildProvider.unload();
    expect(partyGuildProvider.isLoaded()).toBe(false);
  });
});
