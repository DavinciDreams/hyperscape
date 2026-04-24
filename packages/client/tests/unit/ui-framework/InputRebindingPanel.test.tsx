/**
 * InputRebindingPanel — closes the U10 loop.
 *
 * Tests run against the real `useUserInputBindings` store (no mocks),
 * with `localStorage.clear()` between tests to keep state isolated.
 * Every test uses a minimal InputBindingManifest fixture.
 */

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InputBindingManifest } from "@hyperforge/ui-framework";
import { InputRebindingPanel } from "../../../src/ui-framework/InputRebindingPanel";
import { useUserInputBindingsStore } from "../../../src/ui-framework/useUserInputBindings";

const fixture: InputBindingManifest = {
  id: "test-manifest",
  name: "Test Manifest",
  actions: [
    {
      id: "attack",
      label: "Attack",
      description: "Strike the target",
      defaults: [{ key: "KeyA", modifiers: [] }],
      rebindable: true,
      category: "Combat",
    },
    {
      id: "block",
      label: "Block",
      defaults: [{ key: "KeyS", modifiers: [] }],
      rebindable: true,
      category: "Combat",
    },
    {
      id: "menu",
      label: "Open Menu",
      defaults: [{ key: "Escape", modifiers: [] }],
      rebindable: false, // locked
      category: "UI",
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  useUserInputBindingsStore.setState({ byManifest: {} });
});

afterEach(() => {
  cleanup();
});

describe("InputRebindingPanel", () => {
  it("lists every action with its default chord", () => {
    render(<InputRebindingPanel manifest={fixture} />);
    expect(screen.getByText("Attack")).toBeTruthy();
    expect(screen.getByText("Block")).toBeTruthy();
    expect(screen.getByText("Open Menu")).toBeTruthy();
    // Default chord shows canonical `chordToString`.
    expect(screen.getAllByText("KeyA").length).toBeGreaterThan(0);
  });

  it("hides the rebind button for non-rebindable actions", () => {
    render(<InputRebindingPanel manifest={fixture} />);
    expect(screen.queryByTestId("rebind-menu")).toBeNull();
    expect(screen.queryByTestId("unbind-menu")).toBeNull();
  });

  it("rebinds an action via keyboard capture and persists the override", async () => {
    render(<InputRebindingPanel manifest={fixture} />);

    fireEvent.click(screen.getByTestId("rebind-attack"));
    expect(screen.getByTestId("rebind-attack").textContent).toContain(
      "Press any key",
    );

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyZ", bubbles: true }),
      );
    });

    const persisted =
      useUserInputBindingsStore.getState().byManifest["test-manifest"];
    expect(persisted?.bindings).toHaveLength(1);
    expect(persisted?.bindings[0]?.actionId).toBe("attack");
    expect(persisted?.bindings[0]?.chords[0]?.key).toBe("KeyZ");

    // Button is no longer in capture mode.
    expect(screen.getByTestId("rebind-attack").textContent).toBe("Rebind");
  });

  it("captures modifiers from the keyboard event", async () => {
    render(<InputRebindingPanel manifest={fixture} />);
    fireEvent.click(screen.getByTestId("rebind-attack"));

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "KeyZ",
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });

    const chord =
      useUserInputBindingsStore.getState().byManifest["test-manifest"]
        ?.bindings[0]?.chords[0];
    expect(chord?.key).toBe("KeyZ");
    expect(chord?.modifiers).toContain("ctrl");
    expect(chord?.modifiers).toContain("shift");
  });

  it("ignores pure modifier keypresses during capture", async () => {
    render(<InputRebindingPanel manifest={fixture} />);
    fireEvent.click(screen.getByTestId("rebind-attack"));

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "ControlLeft", bubbles: true }),
      );
    });

    // Nothing captured yet.
    expect(
      useUserInputBindingsStore.getState().byManifest["test-manifest"],
    ).toBeUndefined();
    // Button still in capture mode.
    expect(screen.getByTestId("rebind-attack").textContent).toContain(
      "Press any key",
    );
  });

  it("cancels capture on Escape without persisting anything", async () => {
    render(<InputRebindingPanel manifest={fixture} />);
    fireEvent.click(screen.getByTestId("rebind-attack"));

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(
      useUserInputBindingsStore.getState().byManifest["test-manifest"],
    ).toBeUndefined();
    expect(screen.getByTestId("rebind-attack").textContent).toBe("Rebind");
  });

  it("Unbind persists an empty-chord override and shows 'Unbound'", () => {
    render(<InputRebindingPanel manifest={fixture} />);
    fireEvent.click(screen.getByTestId("unbind-attack"));

    const persisted =
      useUserInputBindingsStore.getState().byManifest["test-manifest"];
    expect(persisted?.bindings[0]?.chords).toEqual([]);
    expect(screen.getAllByText("Unbound").length).toBeGreaterThan(0);
  });

  it("Reset clears an override back to manifest defaults", () => {
    useUserInputBindingsStore
      .getState()
      .setActionChords("test-manifest", "attack", [
        { key: "KeyZ", modifiers: [] },
      ]);

    render(<InputRebindingPanel manifest={fixture} />);
    // Reset button only renders when overridden.
    fireEvent.click(screen.getByTestId("reset-attack"));

    expect(
      useUserInputBindingsStore.getState().byManifest["test-manifest"],
    ).toBeUndefined();
  });

  it("exposes a polite aria-live status region that announces capture state", () => {
    render(<InputRebindingPanel manifest={fixture} />);
    const status = screen.getByTestId("input-rebinding-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("role")).toBe("status");
    // Idle — empty announcement.
    expect(status.textContent).toBe("");

    fireEvent.click(screen.getByTestId("rebind-attack"));
    expect(status.textContent).toContain("Press a key combination");
    expect(status.textContent).toContain("Attack");
    expect(status.textContent).toContain("Escape");
  });

  it("rebind button sets aria-pressed=true while capturing", () => {
    render(<InputRebindingPanel manifest={fixture} />);
    const btn = screen.getByTestId("rebind-attack");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("flags a live chord conflict between two overlapping actions", () => {
    // Force Attack to bind the same chord as Block → conflict since
    // neither has a `contexts` whitelist (both are "everywhere").
    useUserInputBindingsStore
      .getState()
      .setActionChords("test-manifest", "attack", [
        { key: "KeyS", modifiers: [] },
      ]);

    render(<InputRebindingPanel manifest={fixture} />);

    // Conflict message should appear for at least one of the two rows.
    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]?.textContent).toContain("overlapping contexts");
  });
});
