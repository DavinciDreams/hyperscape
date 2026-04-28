/**
 * EquipmentSlotIconWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  EQUIPMENT_SLOT_KEYS,
  type EquipmentSlotKey,
  equipmentSlotIconRegistration,
  equipmentSlotIconWidget,
} from "../../index.js";

describe("EquipmentSlotIconWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(equipmentSlotIconWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.equipment-slot-icon",
    );
    expect(equipmentSlotIconWidget.manifest.category).toBe("panel");
    expect(equipmentSlotIconWidget.manifest.defaultSize).toEqual({
      width: 4,
      height: 4,
    });
  });

  it("default props match a sensible base", () => {
    expect(equipmentSlotIconWidget.defaultProps).toMatchObject({
      slot: "helmet",
      sizePx: 24,
      color: "currentColor",
      strokeWidth: 1.5,
      title: "",
    });
  });

  it("EQUIPMENT_SLOT_KEYS covers the legacy named-export set", () => {
    expect(EQUIPMENT_SLOT_KEYS).toEqual([
      "helmet",
      "weapon",
      "body",
      "shield",
      "legs",
      "arrows",
      "boots",
      "gloves",
      "cape",
      "amulet",
      "ring",
      "stats",
      "death",
    ]);
  });

  it("schema accepts every slot key", () => {
    for (const slot of EQUIPMENT_SLOT_KEYS) {
      expect(
        equipmentSlotIconWidget.propsSchema.safeParse({ slot }).success,
      ).toBe(true);
    }
  });

  it("rejects unknown slot key", () => {
    expect(
      equipmentSlotIconWidget.propsSchema.safeParse({
        slot: "wand" as unknown as EquipmentSlotKey,
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range sizePx", () => {
    expect(
      equipmentSlotIconWidget.propsSchema.safeParse({ sizePx: 0 }).success,
    ).toBe(false);
    expect(
      equipmentSlotIconWidget.propsSchema.safeParse({ sizePx: 1_000 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range strokeWidth", () => {
    expect(
      equipmentSlotIconWidget.propsSchema.safeParse({ strokeWidth: 0 }).success,
    ).toBe(false);
    expect(
      equipmentSlotIconWidget.propsSchema.safeParse({ strokeWidth: 12 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(equipmentSlotIconRegistration.widget).toBe(equipmentSlotIconWidget);
    expect(typeof equipmentSlotIconRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — equipment slot icon widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the equipment slot icon registration", () => {
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
    expect(registered).toContain(equipmentSlotIconRegistration);
  });
});
