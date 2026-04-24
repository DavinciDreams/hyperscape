/**
 * Phase U9 — useViewportVariant smoke tests.
 *
 * Asserts that the hook classifies the initial window size, updates
 * on resize, and removes its listener on unmount.
 */

import React from "react";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useViewportVariant } from "@/ui-framework/useViewportVariant";

function Probe({ onRender }: { onRender: (v: string | null) => void }) {
  const v = useViewportVariant();
  onRender(v);
  return null;
}

function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("useViewportVariant (U9)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1400,
    });
  });

  it("classifies the initial viewport on mount", () => {
    const received: Array<string | null> = [];
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 500,
    });
    render(<Probe onRender={(v) => received.push(v)} />);
    expect(received[received.length - 1]).toBe("mobile");
  });

  it("reclassifies on window resize", () => {
    const received: Array<string | null> = [];
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1400,
    });
    render(<Probe onRender={(v) => received.push(v)} />);
    expect(received[received.length - 1]).toBe("desktop");

    act(() => setWindowWidth(800));
    expect(received[received.length - 1]).toBe("tablet");

    act(() => setWindowWidth(320));
    expect(received[received.length - 1]).toBe("mobile");
  });

  it("stops listening after unmount", () => {
    const received: Array<string | null> = [];
    const { unmount } = render(<Probe onRender={(v) => received.push(v)} />);
    const countBeforeUnmount = received.length;
    unmount();
    act(() => setWindowWidth(100));
    // No further renders after unmount.
    expect(received.length).toBe(countBeforeUnmount);
  });
});
