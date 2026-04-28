/**
 * ConfirmDialogWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  CONFIRM_DIALOG_VARIANTS,
  type ConfirmDialogVariant,
  confirmDialogRegistration,
  confirmDialogWidget,
} from "../../index.js";

describe("ConfirmDialogWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(confirmDialogWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.confirm-dialog",
    );
    expect(confirmDialogWidget.manifest.category).toBe("modal");
    expect(confirmDialogWidget.manifest.defaultSize).toEqual({
      width: 40,
      height: 24,
    });
  });

  it("default props match the legacy hand-coded modal", () => {
    expect(confirmDialogWidget.defaultProps).toMatchObject({
      visible: false,
      title: "Are you sure?",
      message: "",
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
      variant: "danger",
      widthPx: 320,
    });
  });

  it("CONFIRM_DIALOG_VARIANTS is the canonical state set", () => {
    expect(CONFIRM_DIALOG_VARIANTS).toEqual(["danger", "primary"]);
  });

  it("schema accepts every variant", () => {
    for (const variant of CONFIRM_DIALOG_VARIANTS) {
      expect(
        confirmDialogWidget.propsSchema.safeParse({ variant }).success,
      ).toBe(true);
    }
  });

  it("rejects unknown variant", () => {
    expect(
      confirmDialogWidget.propsSchema.safeParse({
        variant: "warn" as unknown as ConfirmDialogVariant,
      }).success,
    ).toBe(false);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = confirmDialogWidget.propsSchema.safeParse({
      visible: true,
      title: "Delete tab?",
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Keep",
      variant: "danger",
      widthPx: 360,
      backdropColor: "rgba(0,0,0,0.6)",
      panelBackgroundColor: "#101522",
      panelBorderColor: "#222",
      headerBackgroundColor: "#1a2030",
      titleColor: "#fff",
      messageColor: "#aaa",
      buttonTextColor: "#fff",
      cancelButtonBackground: "#222",
      cancelButtonHoverBackground: "#333",
      cancelButtonBorderColor: "#444",
      dangerColor: "#f00",
      accentColor: "#ffd84d",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range widthPx", () => {
    expect(
      confirmDialogWidget.propsSchema.safeParse({ widthPx: 100 }).success,
    ).toBe(false);
    expect(
      confirmDialogWidget.propsSchema.safeParse({ widthPx: 2_000 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(confirmDialogRegistration.widget).toBe(confirmDialogWidget);
    expect(typeof confirmDialogRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — confirm dialog widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the confirm dialog registration", () => {
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
    expect(registered).toContain(confirmDialogRegistration);
  });
});
