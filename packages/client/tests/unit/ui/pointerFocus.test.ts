import { describe, expect, it } from "vitest";
import { getPointerFocusedControl } from "../../../src/ui/utils/pointerFocus";

describe("getPointerFocusedControl", () => {
  it("returns the nearest interactive control for pointer-clicked game UI elements", () => {
    document.body.innerHTML = `
      <button id="slot-button">
        <span id="slot-label">Inventory slot</span>
      </button>
    `;

    const label = document.getElementById("slot-label");
    const button = document.getElementById("slot-button");

    expect(getPointerFocusedControl(label)).toBe(button);
  });

  it("ignores text-entry controls and explicitly allowed pointer-focus regions", () => {
    document.body.innerHTML = `
      <div>
        <input id="chat-input" />
        <button id="settings-button" data-allow-pointer-focus="true">Keep focus</button>
      </div>
    `;

    const input = document.getElementById("chat-input");
    const allowedButton = document.getElementById("settings-button");

    expect(getPointerFocusedControl(input)).toBeNull();
    expect(getPointerFocusedControl(allowedButton)).toBeNull();
  });
});
