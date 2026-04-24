/**
 * Phase U10 — useInputActions runtime smoke tests.
 *
 * Covers: chord match → handler fires, modifier awareness, context
 * filtering, ignore-in-text-inputs default, preventDefault behaviour,
 * unmount cleanup.
 */

import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveInputBindings,
  type InputBindingManifest,
  type ResolvedInputBindings,
} from "@hyperforge/ui-framework";

import {
  useInputActions,
  type InputActionHandler,
} from "@/ui-framework/useInputActions";

const manifest: InputBindingManifest = {
  id: "test.input",
  name: "Test",
  actions: [
    {
      id: "move.forward",
      label: "Move Forward",
      defaults: [{ key: "KeyW", modifiers: [] }],
      rebindable: true,
    },
    {
      id: "ui.save",
      label: "Save",
      defaults: [{ key: "KeyS", modifiers: ["ctrl"] }],
      rebindable: true,
    },
    {
      id: "combat.attack",
      label: "Attack",
      defaults: [{ key: "Space", modifiers: [] }],
      contexts: ["combat"],
      rebindable: true,
    },
  ],
};

interface ProbeProps {
  resolved: ResolvedInputBindings;
  onAction: InputActionHandler;
  gameContext?: string | null;
  preventDefault?: boolean;
}

function Probe(props: ProbeProps) {
  useInputActions(props.resolved, props.onAction, {
    gameContext: props.gameContext,
    preventDefault: props.preventDefault,
  });
  return null;
}

function dispatchKey(
  code: string,
  modifiers: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { code, ...modifiers });
  window.dispatchEvent(event);
  return event;
}

describe("useInputActions (U10)", () => {
  let resolved: ResolvedInputBindings;

  beforeEach(() => {
    resolved = resolveInputBindings(manifest, null);
  });

  it("fires the handler when a chord matches", () => {
    const handler = vi.fn();
    render(<Probe resolved={resolved} onAction={handler} />);
    dispatchKey("KeyW");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe("move.forward");
  });

  it("requires modifiers to match", () => {
    const handler = vi.fn();
    render(<Probe resolved={resolved} onAction={handler} />);
    dispatchKey("KeyS"); // no ctrl
    expect(handler).not.toHaveBeenCalled();
    dispatchKey("KeyS", { ctrlKey: true });
    expect(handler).toHaveBeenCalledWith("ui.save", expect.any(KeyboardEvent));
  });

  it("filters actions by gameContext", () => {
    const handler = vi.fn();
    render(<Probe resolved={resolved} onAction={handler} gameContext={null} />);
    dispatchKey("Space");
    expect(handler).not.toHaveBeenCalled();
  });

  it("dispatches context-gated actions when context matches", () => {
    const handler = vi.fn();
    render(
      <Probe resolved={resolved} onAction={handler} gameContext="combat" />,
    );
    dispatchKey("Space");
    expect(handler).toHaveBeenCalledWith(
      "combat.attack",
      expect.any(KeyboardEvent),
    );
  });

  it("ignores events from text inputs by default", () => {
    const handler = vi.fn();
    render(<Probe resolved={resolved} onAction={handler} />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    const event = new KeyboardEvent("keydown", {
      code: "KeyW",
      bubbles: true,
    });
    input.dispatchEvent(event);
    expect(handler).not.toHaveBeenCalled();
    input.remove();
  });

  it("calls preventDefault on the matched event", () => {
    const handler = vi.fn();
    render(<Probe resolved={resolved} onAction={handler} />);
    const event = new KeyboardEvent("keydown", {
      code: "KeyW",
      cancelable: true,
    });
    const prevented = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);
    expect(prevented).toHaveBeenCalled();
  });

  it("respects preventDefault: false", () => {
    const handler = vi.fn();
    render(
      <Probe resolved={resolved} onAction={handler} preventDefault={false} />,
    );
    const event = new KeyboardEvent("keydown", {
      code: "KeyW",
      cancelable: true,
    });
    const prevented = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);
    expect(handler).toHaveBeenCalled();
    expect(prevented).not.toHaveBeenCalled();
  });

  it("removes the listener on unmount", () => {
    const handler = vi.fn();
    const { unmount } = render(
      <Probe resolved={resolved} onAction={handler} />,
    );
    dispatchKey("KeyW");
    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
    dispatchKey("KeyW");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
