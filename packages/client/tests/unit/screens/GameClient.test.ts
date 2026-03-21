import { describe, expect, it } from "vitest";
import { resolveGameClientUiDisplay } from "../../../src/lib/gameClientUi";

describe("GameClient", () => {
  it("hides the UI layer when visibility is false", () => {
    expect(resolveGameClientUiDisplay(true)).toBe("block");
    expect(resolveGameClientUiDisplay(false)).toBe("none");
  });
});
