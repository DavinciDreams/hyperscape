/**
 * SkillSelectModalWidget — definition + plugin onEnable
 * contribution test. First D6.c panel migration; mirrors the
 * established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  DEFAULT_SKILL_CATALOG,
  skillSelectModalRegistration,
  skillSelectModalWidget,
} from "../../index.js";

describe("SkillSelectModalWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(skillSelectModalWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.skill-select-modal",
    );
    expect(skillSelectModalWidget.manifest.category).toBe("modal");
    expect(skillSelectModalWidget.manifest.defaultSize).toEqual({
      width: 64,
      height: 48,
    });
  });

  it("default props match the legacy hand-coded modal", () => {
    expect(skillSelectModalWidget.defaultProps).toMatchObject({
      visible: false,
      xpAmount: 0,
      title: "Select a Skill",
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
    });
  });

  it("DEFAULT_SKILL_CATALOG matches the legacy 14-skill list", () => {
    expect(DEFAULT_SKILL_CATALOG.map((s) => s.key)).toEqual([
      "attack",
      "strength",
      "defense",
      "constitution",
      "ranged",
      "prayer",
      "magic",
      "woodcutting",
      "mining",
      "fishing",
      "firemaking",
      "cooking",
      "smithing",
      "agility",
    ]);
  });

  it("default props expose a deep-cloned skills catalog", () => {
    const defaults = skillSelectModalWidget.defaultProps as {
      skills: Array<{ key: string }>;
    };
    expect(defaults.skills).not.toBe(DEFAULT_SKILL_CATALOG);
    expect(defaults.skills.map((s) => s.key)).toEqual(
      DEFAULT_SKILL_CATALOG.map((s) => s.key),
    );
  });

  it("schema accepts a fully-populated runtime payload", () => {
    const parsed = skillSelectModalWidget.propsSchema.safeParse({
      visible: true,
      xpAmount: 2_500,
      skillLevels: { attack: 12, mining: 8 },
      skills: [{ key: "attack", label: "Attack", icon: "⚔️" }],
      title: "Pick a Skill",
      confirmLabel: "Apply",
      cancelLabel: "Nope",
      backdropColor: "rgba(0,0,0,0.6)",
      panelBackgroundColor: "#101522",
      panelBorderColor: "#222",
      headerBackgroundColor: "#1a2030",
      titleColor: "#fff",
      accentColor: "#ffd84d",
      textColor: "#eee",
      mutedTextColor: "#888",
      disabledTextColor: "#444",
      tileBackgroundColor: "#222",
      tileSelectedBackgroundColor: "#333",
      tileBorderColor: "#444",
      tileSelectedBorderColor: "#ffd84d",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative xpAmount", () => {
    expect(
      skillSelectModalWidget.propsSchema.safeParse({ xpAmount: -1 }).success,
    ).toBe(false);
  });

  it("rejects skillLevels with negative entries", () => {
    expect(
      skillSelectModalWidget.propsSchema.safeParse({
        skillLevels: { attack: -3 },
      }).success,
    ).toBe(false);
  });

  it("rejects skills entries missing a key", () => {
    expect(
      skillSelectModalWidget.propsSchema.safeParse({
        skills: [{ key: "", label: "X", icon: "?" }],
      }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(skillSelectModalRegistration.widget).toBe(skillSelectModalWidget);
    expect(typeof skillSelectModalRegistration.Component).toBe("function");
  });
});

function makeStubWorld() {
  return {
    isServer: true,
    registered: [] as string[],
    unregistered: [] as string[],
    register(name: string, _ctor: unknown) {
      this.registered.push(name);
    },
    unregister(name: string) {
      this.unregistered.push(name);
    },
    getSystem(_name: string) {
      return null;
    },
    on() {},
    off() {},
    emit() {},
    entities: {
      items: new Map<string, unknown>(),
      players: new Map<string, unknown>(),
      get: (_id: string) => undefined,
      values: () => new Map().values(),
    },
    collision: {
      addFlags() {},
      removeFlags() {},
    },
    systemsByName: new Map<string, unknown>(),
  };
}

function makeStubScope() {
  return { register: vi.fn() };
}

describe("Hyperscape meta-plugin — skill select modal widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the skill select modal registration", () => {
    const registered: unknown[] = [];
    const plugin = defaultFactory({
      pluginId: "com.hyperforge.hyperscape",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scope: makeStubScope() as any,
    });

    const ctx: HyperscapeContext = {
      pluginId: "com.hyperforge.hyperscape",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scope: makeStubScope() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      world: makeStubWorld() as any,
      widgets: {
        register(contribution) {
          registered.push(contribution);
        },
      },
    };

    plugin.onEnable?.(ctx);
    expect(registered).toContain(skillSelectModalRegistration);
  });
});
