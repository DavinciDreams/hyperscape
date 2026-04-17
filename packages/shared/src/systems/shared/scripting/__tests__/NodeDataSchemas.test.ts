import { describe, it, expect } from "vitest";
import {
  validateNodeData,
  type NodeValidationResult,
} from "../NodeDataSchemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectValid(result: NodeValidationResult): void {
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
}

function expectInvalid(
  result: NodeValidationResult,
  errorCount?: number,
): void {
  expect(result.valid).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
  if (errorCount !== undefined) {
    expect(result.errors).toHaveLength(errorCount);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateNodeData", () => {
  // ---- General behavior ----

  it("returns valid for node type with all required fields present", () => {
    const result = validateNodeData("action/spawnMob", { mobType: "goblin" });
    expectValid(result);
  });

  it("returns invalid with errors for missing required fields", () => {
    const result = validateNodeData("action/spawnMob", {});
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("mobType");
  });

  it("returns valid for unknown node type (no required fields defined)", () => {
    const result = validateNodeData("custom/unknownNode", { foo: "bar" });
    expectValid(result);
  });

  it("returns valid for unknown node type with empty data", () => {
    const result = validateNodeData("totally/made-up", {});
    expectValid(result);
  });

  // ---- Action node types with missing required fields ----

  it("fails action/spawnMob when mobType is missing", () => {
    const result = validateNodeData("action/spawnMob", { count: 5 });
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("mobType");
  });

  it("fails action/showDialogue when title and text are missing", () => {
    const result = validateNodeData("action/showDialogue", {});
    expectInvalid(result, 2);
    expect(result.errors.some((e) => e.includes("title"))).toBe(true);
    expect(result.errors.some((e) => e.includes("text"))).toBe(true);
  });

  it("fails action/startQuest when questId is missing", () => {
    const result = validateNodeData("action/startQuest", {});
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("questId");
  });

  it("fails action/giveItem when itemId is missing", () => {
    const result = validateNodeData("action/giveItem", { quantity: 10 });
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("itemId");
  });

  it("fails action/setVariable when variableName is missing", () => {
    const result = validateNodeData("action/setVariable", { value: 42 });
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("variableName");
  });

  it("fails action/playSound when soundId is missing", () => {
    const result = validateNodeData("action/playSound", { volume: 0.5 });
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("soundId");
  });

  it("fails action/openShop when storeId is missing", () => {
    const result = validateNodeData("action/openShop", { player: "p1" });
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("storeId");
  });

  it("fails action/showNotification when message is missing", () => {
    const result = validateNodeData("action/showNotification", {
      type: "info",
    });
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("message");
  });

  // ---- All required fields present ----

  it("passes action/showDialogue when title and text are present", () => {
    const result = validateNodeData("action/showDialogue", {
      title: "Hello",
      text: "Welcome to the world!",
    });
    expectValid(result);
  });

  it("passes action/giveItem with all required and optional fields", () => {
    const result = validateNodeData("action/giveItem", {
      itemId: "bronze_sword",
      quantity: 1,
      playerId: "player1",
    });
    expectValid(result);
  });

  // ---- Empty string treated as missing ----

  it("treats empty string as missing", () => {
    const result = validateNodeData("action/spawnMob", { mobType: "" });
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("mobType");
  });

  // ---- null treated as missing ----

  it("treats null as missing", () => {
    const result = validateNodeData("action/startQuest", { questId: null });
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("questId");
  });

  // ---- undefined treated as missing ----

  it("treats undefined as missing", () => {
    const result = validateNodeData("action/giveItem", { itemId: undefined });
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("itemId");
  });

  // ---- Non-required fields absent is fine ----

  it("accepts absent non-required fields", () => {
    // action/spawnMob only requires mobType — count, level, position are optional
    const result = validateNodeData("action/spawnMob", { mobType: "dragon" });
    expectValid(result);
  });

  it("accepts absent non-required fields on showDialogue", () => {
    // playerId and npcId are optional
    const result = validateNodeData("action/showDialogue", {
      title: "Quest Complete",
      text: "You have finished the quest.",
    });
    expectValid(result);
  });

  // ---- Condition node types ----

  it("fails condition/questState when questId and state are missing", () => {
    const result = validateNodeData("condition/questState", {});
    expectInvalid(result, 2);
    expect(result.errors.some((e) => e.includes("questId"))).toBe(true);
    expect(result.errors.some((e) => e.includes("state"))).toBe(true);
  });

  it("passes condition/questState with all required fields", () => {
    const result = validateNodeData("condition/questState", {
      questId: "tutorial",
      state: "completed",
    });
    expectValid(result);
  });

  it("fails condition/hasItem when itemId is missing", () => {
    const result = validateNodeData("condition/hasItem", { quantity: 5 });
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("itemId");
  });

  it("passes condition/hasItem with itemId present", () => {
    const result = validateNodeData("condition/hasItem", {
      itemId: "key_123",
    });
    expectValid(result);
  });

  it("fails condition/skillLevel when skillId is missing", () => {
    const result = validateNodeData("condition/skillLevel", { minLevel: 10 });
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("skillId");
  });

  it("passes condition/skillLevel with skillId present", () => {
    const result = validateNodeData("condition/skillLevel", {
      skillId: "woodcutting",
    });
    expectValid(result);
  });

  // ---- Additional action types ----

  it("fails action/removeItem when itemId is missing", () => {
    const result = validateNodeData("action/removeItem", {});
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("itemId");
  });

  it("fails action/giveXP when skillId is missing", () => {
    const result = validateNodeData("action/giveXP", { amount: 100 });
    expectInvalid(result, 1);
    expect(result.errors[0]).toContain("skillId");
  });

  it("passes action/teleportPlayer with empty data (no required fields)", () => {
    const result = validateNodeData("action/teleportPlayer", {});
    expectValid(result);
  });

  // ---- Error message formatting ----

  it("error messages include the missing field name", () => {
    const result = validateNodeData("action/showDialogue", { title: "Hi" });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe("Missing required field 'text'");
  });

  it("reports multiple missing fields with individual error messages", () => {
    const result = validateNodeData("action/showDialogue", {});
    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContain("Missing required field 'title'");
    expect(result.errors).toContain("Missing required field 'text'");
  });
});
