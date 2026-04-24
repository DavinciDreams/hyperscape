/**
 * Tests for the TalentTreesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { talentTreesProvider } from "../TalentTreesProvider";

beforeEach(() => {
  talentTreesProvider.unload();
});
afterEach(() => {
  talentTreesProvider.unload();
});

const basicNode = {
  id: "nodeA",
  name: "Strength Boost",
  kind: "statBoost" as const,
  tier: 0,
  maxPoints: 3,
};

const validTree = {
  id: "warriorCombat",
  name: "Warrior Combat",
  kind: "class" as const,
  totalPointsAvailable: 30,
  tierPointRequirement: 5,
  nodes: [basicNode],
};

const validManifest = {
  enabled: true,
  trees: [validTree],
};

describe("TalentTreesProvider", () => {
  it("starts unloaded", () => {
    expect(talentTreesProvider.isLoaded()).toBe(false);
    expect(talentTreesProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts valid manifest and fills defaults", () => {
    const parsed = talentTreesProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.trees.length).toBe(1);
    expect(parsed.trees[0].nodes.length).toBe(1);
    expect(parsed.respec).toBeDefined();
    expect(talentTreesProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob", () => {
    const parsed = talentTreesProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.trees.length).toBe(0);
    expect(talentTreesProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects enabled=true with no trees", () => {
    expect(() => talentTreesProvider.loadRaw({ enabled: true })).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = talentTreesProvider.loadRaw(validManifest);
    talentTreesProvider.unload();
    talentTreesProvider.load(parsed);
    expect(talentTreesProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects duplicate tree ids", () => {
    const bad = {
      ...validManifest,
      trees: [validTree, { ...validTree }],
    };
    expect(() => talentTreesProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate node ids within a tree", () => {
    const bad = {
      ...validManifest,
      trees: [{ ...validTree, nodes: [basicNode, { ...basicNode }] }],
    };
    expect(() => talentTreesProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects prereq pointing at unknown node", () => {
    const bad = {
      ...validManifest,
      trees: [
        {
          ...validTree,
          nodes: [
            {
              ...basicNode,
              id: "nodeB",
              tier: 1,
              prerequisites: [{ nodeId: "ghost", minPoints: 1 }],
            },
          ],
        },
      ],
    };
    expect(() => talentTreesProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects prereq minPoints > target.maxPoints", () => {
    const bad = {
      ...validManifest,
      trees: [
        {
          ...validTree,
          nodes: [
            basicNode,
            {
              ...basicNode,
              id: "nodeB",
              tier: 1,
              prerequisites: [{ nodeId: "nodeA", minPoints: 5 }],
            },
          ],
        },
      ],
    };
    expect(() => talentTreesProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects prereq target tier not strictly lower", () => {
    const bad = {
      ...validManifest,
      trees: [
        {
          ...validTree,
          nodes: [
            basicNode,
            {
              ...basicNode,
              id: "nodeB",
              tier: 0,
              prerequisites: [{ nodeId: "nodeA", minPoints: 1 }],
            },
          ],
        },
      ],
    };
    expect(() => talentTreesProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects keystone without tags", () => {
    const bad = {
      ...validManifest,
      trees: [
        {
          ...validTree,
          nodes: [
            {
              id: "keystoneA",
              name: "Berserker Stance",
              kind: "keystone" as const,
              tier: 0,
              maxPoints: 1,
              keystoneTags: [],
            },
          ],
        },
      ],
    };
    expect(() => talentTreesProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects keystone with maxPoints > 1", () => {
    const bad = {
      ...validManifest,
      trees: [
        {
          ...validTree,
          nodes: [
            {
              id: "keystoneA",
              name: "Berserker Stance",
              kind: "keystone" as const,
              tier: 0,
              maxPoints: 3,
              keystoneTags: ["offense"],
            },
          ],
        },
      ],
    };
    expect(() => talentTreesProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects abilityGrant without abilityRef", () => {
    const bad = {
      ...validManifest,
      trees: [
        {
          ...validTree,
          nodes: [
            {
              id: "grantA",
              name: "Charge",
              kind: "abilityGrant" as const,
              tier: 0,
              maxPoints: 1,
              abilityRef: "",
            },
          ],
        },
      ],
    };
    expect(() => talentTreesProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects custom tree kind without customKey", () => {
    const bad = {
      ...validManifest,
      trees: [{ ...validTree, kind: "custom" as const, customKey: "" }],
    };
    expect(() => talentTreesProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts custom tree kind with customKey", () => {
    const parsed = talentTreesProvider.loadRaw({
      ...validManifest,
      trees: [
        {
          ...validTree,
          kind: "custom" as const,
          customKey: "guildPerk",
        },
      ],
    });
    expect(parsed.trees[0].customKey).toBe("guildPerk");
  });

  it("hotReload() replaces the manifest", () => {
    talentTreesProvider.loadRaw(validManifest);
    const parsed = talentTreesProvider.loadRaw({ enabled: false });
    talentTreesProvider.hotReload(parsed);
    expect(talentTreesProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    talentTreesProvider.loadRaw(validManifest);
    talentTreesProvider.hotReload(null);
    expect(talentTreesProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    talentTreesProvider.loadRaw(validManifest);
    talentTreesProvider.unload();
    expect(talentTreesProvider.isLoaded()).toBe(false);
  });
});
