/**
 * CountdownDisplayWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  COUNTDOWN_FORMATS,
  type CountdownFormat,
  formatCountdown,
  countdownDisplayRegistration,
  countdownDisplayWidget,
} from "../../index.js";

describe("CountdownDisplayWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(countdownDisplayWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.countdown-display",
    );
    expect(countdownDisplayWidget.manifest.category).toBe("panel");
    expect(countdownDisplayWidget.manifest.defaultSize).toEqual({
      width: 12,
      height: 4,
    });
  });

  it("default props match a sensible base", () => {
    expect(countdownDisplayWidget.defaultProps).toMatchObject({
      totalSeconds: 0,
      label: "",
      format: "auto",
      warningAtSeconds: 0,
      pulseOnWarning: true,
      pulseDurationMs: 800,
      labelFontSize: 12,
      timeFontSize: 16,
      monospace: true,
    });
  });

  it("COUNTDOWN_FORMATS covers mm:ss / hh:mm:ss / auto", () => {
    expect(COUNTDOWN_FORMATS).toEqual(["mm:ss", "hh:mm:ss", "auto"]);
  });

  it("schema accepts every format", () => {
    for (const format of COUNTDOWN_FORMATS) {
      expect(
        countdownDisplayWidget.propsSchema.safeParse({ format }).success,
      ).toBe(true);
    }
  });

  it("rejects unknown format", () => {
    expect(
      countdownDisplayWidget.propsSchema.safeParse({
        format: "ss" as unknown as CountdownFormat,
      }).success,
    ).toBe(false);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = countdownDisplayWidget.propsSchema.safeParse({
      totalSeconds: 125,
      label: "Match starts in",
      format: "mm:ss",
      warningAtSeconds: 10,
      pulseOnWarning: true,
      pulseDurationMs: 600,
      labelColor: "#aaa",
      timeColor: "#fff",
      warningColor: "#f00",
      labelFontSize: 13,
      timeFontSize: 24,
      monospace: false,
      timeFontWeight: "bold",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative warningAtSeconds", () => {
    expect(
      countdownDisplayWidget.propsSchema.safeParse({ warningAtSeconds: -1 })
        .success,
    ).toBe(false);
  });

  it("rejects out-of-range pulseDurationMs", () => {
    expect(
      countdownDisplayWidget.propsSchema.safeParse({ pulseDurationMs: 50 })
        .success,
    ).toBe(false);
    expect(
      countdownDisplayWidget.propsSchema.safeParse({
        pulseDurationMs: 50_000,
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range timeFontSize", () => {
    expect(
      countdownDisplayWidget.propsSchema.safeParse({ timeFontSize: 4 }).success,
    ).toBe(false);
    expect(
      countdownDisplayWidget.propsSchema.safeParse({ timeFontSize: 200 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(countdownDisplayRegistration.widget).toBe(countdownDisplayWidget);
    expect(typeof countdownDisplayRegistration.Component).toBe("function");
  });
});

describe("formatCountdown", () => {
  it("formats zero seconds", () => {
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("formats sub-minute values", () => {
    expect(formatCountdown(5)).toBe("0:05");
    expect(formatCountdown(45)).toBe("0:45");
  });

  it("formats sub-hour values as mm:ss", () => {
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(125)).toBe("2:05");
    expect(formatCountdown(3599)).toBe("59:59");
  });

  it("auto-promotes to hh:mm:ss past 1 hour", () => {
    expect(formatCountdown(3600)).toBe("1:00:00");
    expect(formatCountdown(3725)).toBe("1:02:05");
  });

  it("respects mm:ss format with overflow minutes", () => {
    expect(formatCountdown(3725, "mm:ss")).toBe("62:05");
  });

  it("respects hh:mm:ss format even under 1 hour", () => {
    expect(formatCountdown(125, "hh:mm:ss")).toBe("0:02:05");
  });

  it("clamps negative inputs to 0", () => {
    expect(formatCountdown(-30)).toBe("0:00");
  });

  it("floors fractional seconds", () => {
    expect(formatCountdown(125.9)).toBe("2:05");
    expect(formatCountdown(0.7)).toBe("0:00");
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

describe("Hyperscape meta-plugin — countdown display widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the countdown display registration", () => {
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
    expect(registered).toContain(countdownDisplayRegistration);
  });
});
